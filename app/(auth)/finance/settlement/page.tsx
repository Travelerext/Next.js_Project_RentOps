import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  ClipboardCheck,
  CheckCircle,
  ArrowRight,
  FileWarning,
  Search,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────

interface InspectionWithJoins {
  id: string;
  inspection_no: string;
  order_id: string | null;
  contract_id: string | null;
  customer_id: string;
  inspected_at: string;
  is_overdue: boolean;
  overdue_days: number | null;
  is_damaged: boolean;
  damage_description: string | null;
  is_missing_parts: boolean;
  missing_parts_desc: string | null;
  is_dirty: boolean;
  cleanliness_note: string | null;
  needs_repair: boolean;
  repair_estimate: string | null;
  customer_confirmed: boolean;
  remark: string | null;
  customer: { name: string } | null;
  contract: { contract_no: string; total_rent_amount: string } | null;
  equipment: { equipment_no: string; name: string } | null;
}

interface SettlementInfo {
  id: string;
  inspection_id: string;
  settlement_no: string;
  settlement_status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────

const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  REFUND_PENDING: "待退款",
  CHARGE_PENDING: "待补款",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

const SETTLEMENT_STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  REFUND_PENDING: "warning",
  CHARGE_PENDING: "danger",
  COMPLETED: "success",
  CANCELLED: "default",
};

function getInspectionResult(inspection: InspectionWithJoins): {
  label: string;
  variant: "success" | "warning" | "danger";
} {
  const issues: string[] = [];
  if (inspection.is_damaged) issues.push("损坏");
  if (inspection.is_missing_parts) issues.push("缺件");
  if (inspection.is_dirty) issues.push("污损");
  if (inspection.needs_repair) issues.push("需维修");

  if (issues.length === 0) {
    return { label: "正常", variant: "success" };
  }
  return {
    label: issues.join("、"),
    variant: "warning",
  };
}

// ═══════════════════════════════════════════════════════════════════════

export default async function SettlementPage() {
  const supabase = await createClient();

  // Fetch all inspections with joins
  const { data: inspections } = await supabase
    .from("return_inspection")
    .select(
      "*, customer:customer_id(name), contract:contract_id(contract_no, total_rent_amount), equipment:equipment_id(equipment_no, name)",
    )
    .order("inspected_at", { ascending: false });

  // Fetch all settlements to determine which inspections are settled
  const { data: settlements } = await supabase
    .from("return_settlement")
    .select("id, inspection_id, settlement_no, settlement_status");

  const settlementMap = new Map<string, SettlementInfo>(
    (settlements ?? []).map((s) => [s.inspection_id as string, s as unknown as SettlementInfo]),
  );

  const allInspections = (inspections ?? []) as unknown as InspectionWithJoins[];
  const pending = allInspections.filter((i) => !settlementMap.has(i.id));
  const settled = allInspections.filter((i) => settlementMap.has(i.id));

  // Stats
  const pendingCount = pending.length;
  const damageRepairCount = pending.filter(
    (i) => i.is_damaged || i.needs_repair || i.is_missing_parts || i.is_dirty,
  ).length;
  const settledCount = settled.length;

  // ── Column definitions ──────────────────────────────────────────────

  const pendingColumns: Column<InspectionWithJoins>[] = [
    {
      id: "inspection_no",
      header: "验收编号",
      cell: (i) => (
        <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
          {i.inspection_no}
        </span>
      ),
    },
    {
      id: "equipment",
      header: "设备",
      cell: (i) => i.equipment ? `${i.equipment.name} (${i.equipment.equipment_no})` : "-",
    },
    {
      id: "customer",
      header: "客户",
      cell: (i) => i.customer?.name ?? "-",
    },
    {
      id: "contract_no",
      header: "合同编号",
      cell: (i) => <span className="font-mono text-sm">{i.contract?.contract_no ?? "-"}</span>,
    },
    {
      id: "result",
      header: "验收结果",
      cell: (i) => {
        const result = getInspectionResult(i);
        return <Badge variant={result.variant}>{result.label}</Badge>;
      },
    },
    {
      id: "inspected_at",
      header: "验收日期",
      cell: (i) => formatDate(i.inspected_at),
    },
    {
      id: "action",
      header: "操作",
      cell: () => (
        <span className="text-sm text-blue-600">结算预览</span>
      ),
      className: "text-right",
    },
  ];

  const settledColumns: Column<InspectionWithJoins>[] = [
    {
      id: "inspection_no",
      header: "验收编号",
      cell: (i) => (
        <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
          {i.inspection_no}
        </span>
      ),
    },
    {
      id: "equipment",
      header: "设备",
      cell: (i) => i.equipment ? `${i.equipment.name} (${i.equipment.equipment_no})` : "-",
    },
    {
      id: "customer",
      header: "客户",
      cell: (i) => i.customer?.name ?? "-",
    },
    {
      id: "settlement_no",
      header: "结算单号",
      cell: (i) => {
        const s = settlementMap.get(i.id);
        return (
          <span className="font-mono text-sm">{s?.settlement_no ?? "-"}</span>
        );
      },
    },
    {
      id: "settlement_status",
      header: "结算状态",
      cell: (i) => {
        const s = settlementMap.get(i.id);
        const status = s?.settlement_status ?? "";
        return (
          <Badge variant={SETTLEMENT_STATUS_VARIANTS[status] ?? "default"}>
            {SETTLEMENT_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
    {
      id: "inspected_at",
      header: "验收日期",
      cell: (i) => formatDate(i.inspected_at),
      hideOnMobile: true,
    },
    {
      id: "action",
      header: "操作",
      cell: () => (
        <span className="text-sm text-blue-600">查看详情</span>
      ),
      className: "text-right",
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <DataPage
      title="退租结算"
      subtitle="管理退租验收后的结算流程"
      actions={
        <Link
          href="/finance"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowRight className="h-4 w-4" />
          返回财务工作台
        </Link>
      }
      empty={false}
    >
      {/* ── Stats Cards ────────────────────────────────────────────────── */}
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard
          icon={ClipboardCheck}
          label="待结算"
          value={pendingCount}
          color="blue"
        />
        <StatCard
          icon={FileWarning}
          label="异常待处理（损坏/缺件/污损）"
          value={damageRepairCount}
          color="red"
        />
        <StatCard
          icon={CheckCircle}
          label="已结算"
          value={settledCount}
          color="emerald"
        />
        <StatCard
          icon={Search}
          label="总验收记录"
          value={allInspections.length}
          color="purple"
        />
      </StatsGrid>

      {/* ── Pending Settlement Section ──────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            待结算验收记录
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            以下验收记录已完成客户的验收确认，等待财务结算处理
          </p>
        </div>

        <DataTable
          columns={pendingColumns}
          data={pending}
          keyExtractor={(i) => i.id}
          rowHref={(i) => `/finance/settlement/${i.id}`}
          emptyMessage="所有验收记录均已结算完成"
        />
      </div>

      {/* ── Settled Section ──────────────────────────────────────────────── */}
      {settled.length > 0 && (
        <div className="mt-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              已结算记录
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              已完成结算的验收记录，可查看结算详情
            </p>
          </div>

          <DataTable
            columns={settledColumns}
            data={settled}
            keyExtractor={(i) => i.id}
            rowHref={(i) => `/finance/settlement/${i.id}`}
            emptyMessage="暂无已结算记录"
          />
        </div>
      )}
    </DataPage>
  );
}
