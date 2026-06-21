import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ClipboardList, CalendarCheck, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Plus } from "lucide-react";

// ─── Status helpers ─────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  ACTIVE: "进行中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
};

const statusBadgeVariant: Record<string, "success" | "warning" | "default"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "default",
};

const cycleTypeLabels: Record<string, string> = {
  DAILY: "每日",
  WEEKLY: "每周",
  MONTHLY: "每月",
  HOURS: "运行小时",
  KILOMETERS: "行驶里程",
  CUSTOM: "自定义",
};

// ─── Columns ────────────────────────────────────────────────────────────

const cols: Column<Record<string, unknown>>[] = [
  {
    id: "name",
    header: "计划名称",
    cell: (p) => <span className="font-medium">{p.plan_name as string}</span>,
  },
  {
    id: "equipment",
    header: "设备",
    cell: (p) => {
      const equip = p.equipment as
        | { equipment_no: string; name: string }
        | undefined;
      return equip ? `${equip.name}（${equip.equipment_no}）` : "-";
    },
  },
  {
    id: "cycle",
    header: "周期",
    cell: (p) => {
      const ct = p.cycle_type as string;
      const cv = p.cycle_value as number;
      return `${cycleTypeLabels[ct] ?? ct} / ${cv}`;
    },
    hideOnMobile: true,
  },
  {
    id: "next",
    header: "下次保养",
    cell: (p) => {
      const nextAt = p.next_maintenance_at as string;
      const isOverdue = nextAt && new Date(nextAt) < new Date();
      return (
        <span
          className={
            isOverdue
              ? "font-medium text-red-600 dark:text-red-400"
              : undefined
          }
        >
          {formatDate(nextAt)}
          {isOverdue && (
            <span className="ml-1.5 text-xs text-red-500">（已逾期）</span>
          )}
        </span>
      );
    },
  },
  {
    id: "status",
    header: "状态",
    cell: (p) => {
      const st = p.status as string;
      return (
        <Badge variant={statusBadgeVariant[st] ?? "default"}>
          {statusLabels[st] ?? st}
        </Badge>
      );
    },
  },
  {
    id: "responsible",
    header: "负责人",
    cell: (p) => {
      const resp = p.responsible as
        | { display_name: string }
        | undefined;
      return resp?.display_name ?? "-";
    },
    hideOnMobile: true,
  },
];

// ─── Filter tabs ────────────────────────────────────────────────────────

const filterTabs = [
  { key: "all", label: "全部", href: "/maintenance/plans" },
  {
    key: "ACTIVE",
    label: "进行中",
    href: "/maintenance/plans?status=ACTIVE",
  },
  {
    key: "PAUSED",
    label: "已暂停",
    href: "/maintenance/plans?status=PAUSED",
  },
  {
    key: "COMPLETED",
    label: "已完成",
    href: "/maintenance/plans?status=COMPLETED",
  },
];

// ═══════════════════════════════════════════════════════════════════════

export default async function MaintenancePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const status = sp.status || "";

  // ── Stats ──────────────────────────────────────────────────────────
  const now = new Date().toISOString();

  const [totalResult, activeResult, overdueResult] = await Promise.all([
    supabase
      .from("maintenance_plan")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("maintenance_plan")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("maintenance_plan")
      .select("*", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .lt("next_maintenance_at", now),
  ]);

  // ── Data ───────────────────────────────────────────────────────────
  let q = supabase
    .from("maintenance_plan")
    .select(
      "*,equipment:equipment_id(equipment_no,name),responsible:responsible_user_id(display_name)",
    );
  if (status) q = q.eq("status", status);
  const { data } = await q.order("next_maintenance_at", {
    ascending: true,
  });

  return (
    <DataPage
      title="保养计划"
      actions={
        <Link href="/maintenance/plans/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            新建计划
          </Button>
        </Link>
      }
      filters={{
        items: filterTabs,
        activeKey: status || "all",
      }}
      fab={{ href: "/maintenance/plans/new", label: "新建计划" }}
      empty={false}
    >
      <StatsGrid>
        <StatCard
          icon={ClipboardList}
          label="保养计划总数"
          value={totalResult.count ?? 0}
          color="blue"
        />
        <StatCard
          icon={CalendarCheck}
          label="进行中"
          value={activeResult.count ?? 0}
          color="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="已逾期"
          value={overdueResult.count ?? 0}
          color="red"
        />
      </StatsGrid>

      <DataTable
        columns={cols}
        data={(data ?? []) as Record<string, unknown>[]}
        keyExtractor={(p) => p.id as string}
        emptyMessage={
          status
            ? "未找到匹配的保养计划，请调整筛选条件"
            : "暂无保养计划"
        }
      />
    </DataPage>
  );
}
