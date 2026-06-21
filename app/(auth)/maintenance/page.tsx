import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  ClipboardList,
  Wrench,
  CheckCircle,
  ShieldCheck,
  CalendarClock,
  AlertTriangle,
  DollarSign,
  PlusCircle,
  ArrowRight,
  Package,
  Users,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { DispatchQueue } from "@/components/maintenance/dispatch-queue";

// ─── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING_DISPATCH: "待派单",
  ASSIGNED: "已派单",
  IN_PROGRESS: "维修中",
  COMPLETED: "已完成",
  VERIFIED: "已验证",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
};

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING_DISPATCH: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  VERIFIED: "success",
  CLOSED: "default",
  CANCELLED: "default",
};

const FAULT_LEVEL_LABELS: Record<string, string> = {
  EMERGENCY: "紧急",
  URGENT: "急",
  NORMAL: "普通",
};

const FAULT_LEVEL_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  EMERGENCY: "danger",
  URGENT: "warning",
  NORMAL: "default",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "进行中",
  INACTIVE: "已停用",
  COMPLETED: "已完成",
};

const PLAN_STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  COMPLETED: "default",
};

// ─── Typed row shapes returned by Supabase ───────────────────────────────────────

interface WorkOrderRow {
  id: string;
  work_order_no: string;
  status: string;
  fault_description: string;
  fault_level: string;
  reported_at: string;
  /** Only present in team-overview query */
  updated_at?: string;
  equipment: { name: string; equipment_no: string } | null;
  /** Only present in team-overview query (join with profiles) */
  assignee?: { display_name: string; username: string } | null;
}

interface MaintenancePlanRow {
  id: string;
  plan_name: string;
  next_maintenance_at: string;
  status: string;
  equipment: { name: string; equipment_no: string } | null;
}

interface SparePartRow {
  id: string;
  part_no: string;
  part_name: string;
  specification: string | null;
  current_stock: number;
  safety_stock: number;
  unit: string;
  unit_price: number | null;
}

interface MonthlyFeeRow {
  maintenance_fee: string;
  parts_fee: string;
}

// ─── Shared badge helpers ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? "default"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

function FaultLevelBadge({ level }: { level: string }) {
  return <Badge variant={FAULT_LEVEL_VARIANTS[level] ?? "default"}>{FAULT_LEVEL_LABELS[level] ?? level}</Badge>;
}

function PlanStatusBadge({ status }: { status: string }) {
  return <Badge variant={PLAN_STATUS_VARIANTS[status] ?? "default"}>{PLAN_STATUS_LABELS[status] ?? status}</Badge>;
}

// ════════════════════════════════════════════════════════════════════════════════

export default async function MaintenanceDashboardPage() {
  const supabase = await createClient();

  // ── Resolve current user & profile ────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .single();

  if (!profile) throw new Error("未找到用户档案");

  const isSupervisor = profile.primary_role === "MAINTENANCE_SUPERVISOR";
  const profileId = profile.id;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ==========================================================================
  //  MAINTENANCE_SUPERVISOR 视图 — 主管看板
  //  Only renders supervisor content; zero overlap with worker view.
  // ==========================================================================
  if (isSupervisor) {
    const [
      { count: pendingDispatch },
      { count: inProgress },
      { count: completed }, // 待验收
      { count: closedToday },
      { count: overduePlansCount },
      { data: partsData },
      { count: totalOrders },
      { data: monthlyOrdersData },
      { count: outsourcedCount },
      { count: warrantyCount },
      { data: pendingQueueData },
      { data: teamOrdersData },
      { data: overduePlanRows },
      { data: staffData },
    ] = await Promise.all([
      // Row 1 — 待派单工单
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("status", "PENDING_DISPATCH"),
      // Row 1 — 维修中工单
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("status", "IN_PROGRESS"),
      // Row 1 — 待验收工单
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("status", "COMPLETED"),
      // Row 1 — 今日已完成
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("status", "CLOSED")
        .gte("updated_at", todayStart.toISOString()),
      // Row 1 — 逾期保养计划 (count)
      supabase
        .from("maintenance_plan")
        .select("*", { count: "exact", head: true })
        .eq("status", "ACTIVE")
        .lt("next_maintenance_at", now.toISOString()),
      // Row 1 — 低库存配件 (fetched with data for filtering)
      supabase
        .from("spare_part")
        .select("id, part_no, part_name, specification, current_stock, safety_stock, unit, unit_price")
        .eq("status", "ACTIVE"),
      // Row 2 — 全员工单总数
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true }),
      // Row 2 — 本月维修费用 (sum maintenance_fee + parts_fee)
      supabase
        .from("maintenance_work_order")
        .select("maintenance_fee, parts_fee")
        .gte("reported_at", monthStart.toISOString()),
      // Row 2 — 外委工单数
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("outsourced", true),
      // Row 2 — 保修工单数
      supabase
        .from("maintenance_work_order")
        .select("*", { count: "exact", head: true })
        .eq("manufacturer_warranty", true),
      // Left column — 待派单队列
      supabase
        .from("maintenance_work_order")
        .select(
          "id, work_order_no, status, fault_description, fault_level, reported_at, equipment:equipment_id(name, equipment_no)",
        )
        .eq("status", "PENDING_DISPATCH")
        .order("reported_at", { ascending: false }),
      // Right column — 团队工单概览 (top 10, all statuses)
      supabase
        .from("maintenance_work_order")
        .select(
          "id, work_order_no, status, fault_description, fault_level, reported_at, updated_at, equipment:equipment_id(name, equipment_no), assignee:assigned_to(display_name, username)",
        )
        .order("reported_at", { ascending: false })
        .limit(10),
      // Bottom — 逾期保养计划 (top 5)
      supabase
        .from("maintenance_plan")
        .select(
          "id, plan_name, next_maintenance_at, status, equipment:equipment_id(name, equipment_no)",
        )
        .eq("status", "ACTIVE")
        .lt("next_maintenance_at", now.toISOString())
        .order("next_maintenance_at", { ascending: true })
        .limit(5),
      // Staff for dispatch dropdown
      supabase
        .from("profiles")
        .select("id, display_name")
        .in("primary_role", ["MAINTENANCE", "MAINTENANCE_SUPERVISOR"])
        .eq("account_status", "ACTIVE")
        .order("display_name"),
    ]);

    // ── Derived data ────────────────────────────────────────────────────────
    const allParts = (partsData ?? []) as unknown as SparePartRow[];
    const lowStockCount = allParts.filter(
      (p) => Number(p.current_stock) <= Number(p.safety_stock),
    ).length;

    const monthlyOrders = (monthlyOrdersData ?? []) as unknown as MonthlyFeeRow[];
    const monthlyCost = monthlyOrders.reduce(
      (sum, o) => sum + Number(o.maintenance_fee) + Number(o.parts_fee),
      0,
    );

    const pendingQueue = (pendingQueueData ?? []) as unknown as WorkOrderRow[];
    const teamOrders = (teamOrdersData ?? []) as unknown as WorkOrderRow[];
    const overduePlanList = (overduePlanRows ?? []) as unknown as MaintenancePlanRow[];
    const staff = (staffData ?? []) as unknown as { id: string; display_name: string }[];

    // ── Column definitions ────────────────────────────────────────────────────

    const teamOrderColumns: Column<WorkOrderRow>[] = [
      {
        id: "no",
        header: "工单编号",
        cell: (w) => <span className="font-mono text-xs">{w.work_order_no}</span>,
      },
      {
        id: "equip",
        header: "设备",
        cell: (w) => w.equipment?.name ?? "-",
      },
      {
        id: "assignee",
        header: "负责人",
        cell: (w) => w.assignee?.display_name ?? w.assignee?.username ?? "-",
        hideOnMobile: true,
      },
      {
        id: "status",
        header: "状态",
        cell: (w) => <StatusBadge status={w.status} />,
      },
      {
        id: "updated",
        header: "更新时间",
        cell: (w) => formatDate(w.updated_at),
        hideOnMobile: true,
      },
    ];

    const overduePlanColumns: Column<MaintenancePlanRow>[] = [
      {
        id: "name",
        header: "计划名称",
        cell: (p) => <span className="block max-w-[180px] truncate">{p.plan_name}</span>,
      },
      {
        id: "equip",
        header: "设备",
        cell: (p) => p.equipment?.name ?? "-",
      },
      {
        id: "next",
        header: "下次保养",
        cell: (p) => (
          <span className="tabular-nums text-red-600 dark:text-red-400">
            {formatDate(p.next_maintenance_at)}
          </span>
        ),
        hideOnMobile: true,
      },
      {
        id: "status",
        header: "状态",
        cell: (p) => <PlanStatusBadge status={p.status} />,
      },
    ];

    // ── Render ──────────────────────────────────────────────────────────────
    return (
      <DashboardPage title="维修管理工作台" subtitle="派单调度 · 团队管理 · 维保监控">
        {/* ── Stats row 1 (6 cards) ────────────────────────────────────── */}
        <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
          <StatCard
            icon={ClipboardList}
            label="待派单工单"
            value={pendingDispatch ?? 0}
            color="red"
            href="/maintenance/work-orders?status=PENDING_DISPATCH"
          />
          <StatCard
            icon={Wrench}
            label="维修中工单"
            value={inProgress ?? 0}
            color="blue"
            href="/maintenance/work-orders?status=IN_PROGRESS"
          />
          <StatCard
            icon={CheckCircle}
            label="待验收工单"
            value={completed ?? 0}
            color="amber"
            href="/maintenance/work-orders?status=COMPLETED"
          />
          <StatCard
            icon={ShieldCheck}
            label="今日已完成"
            value={closedToday ?? 0}
            color="emerald"
          />
          <StatCard
            icon={CalendarClock}
            label="逾期保养计划"
            value={overduePlansCount ?? 0}
            color="red"
            href="/maintenance/plans?status=ACTIVE"
          />
          <StatCard
            icon={AlertTriangle}
            label="低库存配件"
            value={lowStockCount}
            color="amber"
            href="/maintenance/spare-parts"
          />
        </StatsGrid>

        {/* ── Stats row 2 (5 cards) ────────────────────────────────────── */}
        <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
          <StatCard
            icon={ClipboardList}
            label="全员工单总数"
            value={totalOrders ?? 0}
            color="indigo"
            href="/maintenance/work-orders"
          />
          <StatCard icon={DollarSign} label="本月维修费用" color="blue">
            <span className="text-lg font-bold tabular-nums">
              {formatCurrency(monthlyCost)}
            </span>
          </StatCard>
          <StatCard
            icon={Building2}
            label="外委工单数"
            value={outsourcedCount ?? 0}
            color="purple"
            href="/maintenance/work-orders?outsourced=true"
          />
          <StatCard
            icon={ShieldCheck}
            label="保修工单数"
            value={warrantyCount ?? 0}
            color="emerald"
            href="/maintenance/work-orders?warranty=true"
          />
          <StatCard icon={PlusCircle} label="快捷操作" color="red">
            <div className="mt-1 flex flex-wrap gap-1">
              <Link
                href="/maintenance/work-orders/new"
                className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                新建工单
              </Link>
              <Link
                href="/maintenance/work-orders?status=PENDING_DISPATCH"
                className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
              >
                待派单列表
              </Link>
              <Link
                href="/maintenance/plans"
                className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
              >
                保养计划
              </Link>
              <Link
                href="/maintenance/spare-parts"
                className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
              >
                配件库存
              </Link>
            </div>
          </StatCard>
        </StatsGrid>

        {/* ── Main content (2 columns) ─────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: 待派单队列（内联派单） */}
          <DispatchQueue orders={pendingQueue} staff={staff} />

          {/* Right: 团队工单概览 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                团队工单概览
              </CardTitle>
              <Link
                href="/maintenance/work-orders"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                查看全部<ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <div className="px-4 pb-4 md:px-6">
              <DataTable
                columns={teamOrderColumns}
                data={teamOrders}
                keyExtractor={(w) => w.id}
                rowHref={(w) => `/maintenance/work-orders/${w.id}`}
                emptyMessage="暂无工单"
              />
            </div>
          </Card>
        </div>

        {/* ── Bottom: 逾期保养计划 (top 5) ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-red-500" />
              逾期保养计划
            </CardTitle>
            <Link
              href="/maintenance/plans?status=ACTIVE"
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline dark:text-red-400"
            >
              查看全部<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="px-4 pb-4 md:px-6">
            <DataTable
              columns={overduePlanColumns}
              data={overduePlanList}
              keyExtractor={(p) => p.id}
              emptyMessage="暂无逾期保养计划"
            />
          </div>
        </Card>
      </DashboardPage>
    );
  }

  // ==========================================================================
  //  MAINTENANCE (ordinary 维修人员) 视图
  //  Completely separate — never mixed with supervisor content.
  // ==========================================================================

  const [
    { count: myAssigned },
    { count: myInProgress },
    { count: myCompletedToday },
    { count: myCompletedMonth },
    { data: myOrdersData },
  ] = await Promise.all([
    // 我的待处理 (ASSIGNED to me)
    supabase
      .from("maintenance_work_order")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", profileId)
      .eq("status", "ASSIGNED"),
    // 维修中 (IN_PROGRESS assigned to me)
    supabase
      .from("maintenance_work_order")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", profileId)
      .eq("status", "IN_PROGRESS"),
    // 今日完成 (COMPLETED/VERIFIED/CLOSED today by me)
    supabase
      .from("maintenance_work_order")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", profileId)
      .in("status", ["COMPLETED", "VERIFIED", "CLOSED"])
      .gte("updated_at", todayStart.toISOString()),
    // 本月完成 (all completed by me this month)
    supabase
      .from("maintenance_work_order")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", profileId)
      .in("status", ["COMPLETED", "VERIFIED", "CLOSED"])
      .gte("reported_at", monthStart.toISOString()),
    // 我的工单 table
    supabase
      .from("maintenance_work_order")
      .select(
        "id, work_order_no, status, fault_description, fault_level, reported_at, equipment:equipment_id(name, equipment_no)",
      )
      .eq("assigned_to", profileId)
      .order("reported_at", { ascending: false })
      .limit(10),
  ]);

  const myOrders = (myOrdersData ?? []) as unknown as WorkOrderRow[];

  // ── Column defs for worker view ─────────────────────────────────────────
  const workerOrderColumns: Column<WorkOrderRow>[] = [
    {
      id: "no",
      header: "工单编号",
      cell: (w) => <span className="font-mono text-xs">{w.work_order_no}</span>,
    },
    {
      id: "equip",
      header: "设备",
      cell: (w) => w.equipment?.name ?? "-",
    },
    {
      id: "fault",
      header: "故障描述",
      cell: (w) => <span className="block max-w-[180px] truncate">{w.fault_description}</span>,
    },
    {
      id: "status",
      header: "状态",
      cell: (w) => <StatusBadge status={w.status} />,
    },
    {
      id: "date",
      header: "报修时间",
      cell: (w) => formatDate(w.reported_at),
      hideOnMobile: true,
    },
  ];

  return (
    <DashboardPage title="维修工作台" subtitle="我的任务 · 今日工单">
      {/* ── Stats (4 cards) ───────────────────────────────────────────── */}
      <StatsGrid>
        <StatCard
          icon={ClipboardList}
          label="我的待处理"
          value={myAssigned ?? 0}
          color="blue"
          href="/maintenance/work-orders?status=ASSIGNED"
        />
        <StatCard
          icon={Wrench}
          label="维修中"
          value={myInProgress ?? 0}
          color="amber"
          href="/maintenance/work-orders?status=IN_PROGRESS"
        />
        <StatCard icon={CheckCircle} label="今日完成" value={myCompletedToday ?? 0} color="emerald" />
        <StatCard icon={ClipboardList} label="本月完成" value={myCompletedMonth ?? 0} color="indigo" />
      </StatsGrid>

      {/* ── 我的工单 table ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>我的工单</CardTitle>
          <Link
            href="/maintenance/work-orders"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            查看全部<ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <div className="px-4 pb-4 md:px-6">
          <DataTable
            columns={workerOrderColumns}
            data={myOrders}
            keyExtractor={(w) => w.id}
            rowHref={(w) => `/maintenance/work-orders/${w.id}`}
            emptyMessage="暂无工单"
          />
        </div>
      </Card>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-purple-500" />
            快捷操作
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 md:px-6">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/maintenance/work-orders/new"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <PlusCircle className="h-4 w-4 text-red-500" />
              新建工单
            </Link>
            <Link
              href="/maintenance/plans"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <CalendarClock className="h-4 w-4 text-amber-500" />
              保养计划
            </Link>
            <Link
              href="/maintenance/spare-parts"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Package className="h-4 w-4 text-green-500" />
              配件库存
            </Link>
          </div>
        </div>
      </Card>
    </DashboardPage>
  );
}
