import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { QuickActionCard } from "@/components/data/quick-action-card";
import { DataTable, type Column } from "@/components/data/data-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";
import {
  Package,
  ArrowRightLeft,
  Wrench,
  Truck,
  ClipboardCheck,
  ArrowRightFromLine,
  ArrowLeftToLine,
  List,
  Clock,
  Plus,
  Percent,
  AlertTriangle,
  ClipboardList,
  ArrowRight,
  User,
  Calendar,
  Siren,
} from "lucide-react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────

interface StatusLogEntry {
  id: string;
  equipment_id: string;
  from_status: string | null;
  to_status: string;
  business_type: string;
  changed_at: string;
  equipment: { name: string; equipment_no: string } | null;
}

interface ScrapApprovalEntry {
  id: string;
  approval_no: string;
  title: string;
  submitted_at: string;
  applicant_name: string;
  equipment_name: string;
  equipment_no: string;
}

interface TransferEntry {
  id: string;
  transfer_no: string;
  transfer_status: string;
  created_at: string;
  equipment: { name: string; equipment_no: string } | null;
  from_location: string;
  to_location: string;
}

// ─── Maps ────────────────────────────────────────────────────────────

const statusVariant: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  IN_STOCK: "success",
  RENTED: "info",
  IN_MAINTENANCE: "warning",
  IN_TRANSFER: "info",
  PENDING_INSPECTION: "warning",
  LOCKED: "danger",
  SCRAPPED: "default",
};

const transferStatusVariant: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  PENDING: "warning",
  OUTBOUND_CONFIRMED: "info",
  IN_TRANSIT: "info",
  ARRIVED: "success",
  CANCELLED: "default",
};

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  PENDING: "待出库",
  OUTBOUND_CONFIRMED: "已出库",
  IN_TRANSIT: "运输中",
  ARRIVED: "已到达",
  CANCELLED: "已取消",
};

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  RENTAL: "出租",
  RETURN: "归还",
  TRANSFER: "调拨",
  MAINTENANCE: "维修",
  INSPECTION: "验收",
  SCRAP: "报废",
  ADJUSTMENT: "调整",
};

// ─── Shared: Status-log table columns ───────────────────────────────

const statusColumns: Column<StatusLogEntry>[] = [
  {
    id: "equipment",
    header: "设备",
    cell: (log) => (
      <>
        <span className="font-medium text-app-fg">
          {log.equipment?.name ?? "-"}
        </span>
        {log.equipment?.equipment_no && (
          <span className="ml-1.5 text-xs text-app-muted">
            {log.equipment.equipment_no}
          </span>
        )}
      </>
    ),
  },
  {
    id: "from_to",
    header: "状态变更",
    cell: (log) => (
      <div className="flex items-center gap-1.5">
        <Badge
          variant={statusVariant[log.from_status ?? ""] ?? "default"}
        >
          {EQUIPMENT_STATUS[log.from_status ?? ""] ??
            log.from_status ??
            "初始化"}
        </Badge>
        <ArrowRight className="h-3 w-3 shrink-0 text-app-muted" />
        <Badge variant={statusVariant[log.to_status] ?? "default"}>
          {EQUIPMENT_STATUS[log.to_status] ?? log.to_status}
        </Badge>
      </div>
    ),
  },
  {
    id: "business_type",
    header: "业务类型",
    cell: (log) => (
      <span className="text-xs text-app-muted">
        {BUSINESS_TYPE_LABEL[log.business_type] ?? log.business_type}
      </span>
    ),
    hideOnMobile: true,
  },
  {
    id: "changed_at",
    header: "时间",
    cell: (log) => (
      <span className="text-app-muted">{formatDate(log.changed_at)}</span>
    ),
    hideOnMobile: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  EQUIPMENT_SUPERVISOR VIEW
// ═══════════════════════════════════════════════════════════════════════

async function SupervisorView() {
  const supabase = await createClient();

  // ── Parallel counts ────────────────────────────────────────────────

  const [
    { count: totalCount },
    { count: inStockCount },
    { count: rentedCount },
    { count: maintenanceCount },
    { count: inTransferCount },
    { count: scrapPendingCount },
    { count: pendingTransferCount },
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_STOCK")
      .is("deleted_at", null),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "RENTED"),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_MAINTENANCE"),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_TRANSFER"),
    supabase
      .from("approval_request")
      .select("*", { count: "exact", head: true })
      .eq("approval_type", "SCRAP")
      .in("status", ["SUBMITTED", "IN_PROGRESS"]),
    supabase
      .from("equipment_transfer")
      .select("*", { count: "exact", head: true })
      .in("transfer_status", ["PENDING", "OUTBOUND_CONFIRMED", "IN_TRANSIT"]),
  ]);

  // ── Status logs (top 15) ───────────────────────────────────────────

  const { data: statusLogs } = await supabase
    .from("equipment_status_log")
    .select("*, equipment:equipment_id(name, equipment_no)")
    .order("changed_at", { ascending: false })
    .limit(15);

  // ── Scrap approvals ────────────────────────────────────────────────

  const { data: scrapApprovals } = await supabase
    .from("approval_request")
    .select("*, applicant:applicant_id(display_name)")
    .eq("approval_type", "SCRAP")
    .in("status", ["SUBMITTED", "IN_PROGRESS"])
    .order("submitted_at", { ascending: false })
    .limit(10);

  // Batch-fetch equipment names for scrap approvals (business_id is
  // polymorphic — can reference different tables per business_type, so
  // Supabase join is not viable here)
  const scrapEquipIds = (scrapApprovals ?? [])
    .map((a) => a.business_id)
    .filter(Boolean);
  const { data: scrapEquipmentData } =
    scrapEquipIds.length > 0
      ? await supabase
          .from("equipment")
          .select("id, name, equipment_no")
          .in("id", scrapEquipIds)
      : { data: [] };
  const scrapEquipMap = new Map(
    (scrapEquipmentData ?? []).map((e) => [e.id, e]),
  );

  const scrapApprovalRows: ScrapApprovalEntry[] = (
    scrapApprovals ?? []
  ).map((a) => ({
    id: a.id,
    approval_no: a.approval_no,
    title: a.title,
    submitted_at: a.submitted_at,
    applicant_name: a.applicant?.display_name ?? "-",
    equipment_name: scrapEquipMap.get(a.business_id)?.name ?? "-",
    equipment_no: scrapEquipMap.get(a.business_id)?.equipment_no ?? "",
  }));

  // ── Transfers monitoring ───────────────────────────────────────────

  const { data: rawTransfers } = await supabase
    .from("equipment_transfer")
    .select("*, equipment:equipment_id(name, equipment_no)")
    .in("transfer_status", ["PENDING", "OUTBOUND_CONFIRMED", "IN_TRANSIT"])
    .order("created_at", { ascending: false })
    .limit(20);

  // Batch-fetch warehouse names for location display
  const whIds = [
    ...new Set(
      (rawTransfers ?? [])
        .flatMap((t) => [t.from_warehouse_id, t.to_warehouse_id])
        .filter(Boolean),
    ),
  ];
  const { data: warehouses } =
    whIds.length > 0
      ? await supabase
          .from("warehouse")
          .select("id, name")
          .in("id", whIds)
      : { data: [] };
  const whMap = new Map(
    (warehouses ?? []).map((w) => [w.id, w.name]),
  );

  const transfers: TransferEntry[] = (rawTransfers ?? []).map((t) => ({
    id: t.id,
    transfer_no: t.transfer_no,
    transfer_status: t.transfer_status,
    created_at: t.created_at,
    equipment: t.equipment,
    from_location:
      whMap.get(t.from_warehouse_id ?? "") ??
      (t.from_warehouse_id ? `仓${t.from_warehouse_id.slice(0, 8)}` : "—"),
    to_location:
      whMap.get(t.to_warehouse_id ?? "") ??
      (t.to_warehouse_id ? `仓${t.to_warehouse_id.slice(0, 8)}` : "—"),
  }));

  // ── Insurance / inspection placeholders ────────────────────────────
  // TODO: Replace with date-range filtering when insurance_expiry_date and
  // inspection_date columns are added to the equipment table.
  const total = totalCount ?? 0;
  const rented = rentedCount ?? 0;
  const utilizationPct = total > 0 ? Math.round((rented / total) * 100) : 0;
  const expiringInsuranceCount = 0; // P2: requires insurance_expiry_date column
  const expiringInspectionCount = 0; // P2: requires inspection_date column

  // ── Transfer table columns ─────────────────────────────────────────

  const transferColumns: Column<TransferEntry>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (t) => (
        <>
          <span className="font-medium text-app-fg">
            {t.equipment?.name ?? "-"}
          </span>
          {t.equipment?.equipment_no && (
            <span className="ml-1.5 text-xs text-app-muted">
              {t.equipment.equipment_no}
            </span>
          )}
        </>
      ),
    },
    {
      id: "from_to",
      header: "调拨方向",
      cell: (t) => (
        <div className="flex items-center gap-1.5 text-xs text-app-muted-strong">
          <span>{t.from_location}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span>{t.to_location}</span>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "状态",
      cell: (t) => (
        <Badge
          variant={transferStatusVariant[t.transfer_status] ?? "default"}
        >
          {TRANSFER_STATUS_LABEL[t.transfer_status] ?? t.transfer_status}
        </Badge>
      ),
    },
    {
      id: "created_at",
      header: "创建时间",
      cell: (t) => (
        <span className="text-xs text-app-muted">
          {formatDate(t.created_at)}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  // ── Scrap approval columns ─────────────────────────────────────────

  const scrapApprovalColumns: Column<ScrapApprovalEntry>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (a) => (
        <>
          <span className="font-medium text-app-fg">
            {a.equipment_name}
          </span>
          {a.equipment_no && (
            <span className="ml-1.5 text-xs text-app-muted">
              {a.equipment_no}
            </span>
          )}
        </>
      ),
    },
    {
      id: "applicant",
      header: "申请人",
      cell: (a) => (
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-app-muted" />
          <span className="text-sm text-app-muted-strong">
            {a.applicant_name}
          </span>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      id: "submitted_at",
      header: "提交时间",
      cell: (a) => (
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-app-muted" />
          <span className="text-xs text-app-muted">
            {formatDateTime(a.submitted_at)}
          </span>
        </div>
      ),
      hideOnMobile: true,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <DashboardPage
      title="设备管理工作台"
      subtitle="资产监管 · 报废审批 · 调拨监控"
    >
      {/* Row 1 — 6 stat cards */}
      <StatsGrid cols={{ mobile: 2, desktop: 3 }}>
        <StatCard
          icon={Package}
          label="设备总数"
          value={total}
          color="blue"
          href="/equipment/catalog"
        />
        <StatCard
          icon={Package}
          label="在库数"
          value={inStockCount ?? 0}
          color="emerald"
        />
        <StatCard
          icon={ArrowRightLeft}
          label="出租中"
          value={rented}
          color="indigo"
        />
        <StatCard
          icon={Wrench}
          label="维修中"
          value={maintenanceCount ?? 0}
          color="amber"
        />
        <StatCard
          icon={Truck}
          label="调拨中"
          value={inTransferCount ?? 0}
          color="purple"
        />
        <StatCard
          icon={ClipboardList}
          label="待报废审批"
          value={scrapPendingCount ?? 0}
          color="red"
          href="/approval?type=SCRAP"
        />
      </StatsGrid>

      {/* Row 2 — 4 stat cards */}
      <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
        <StatCard
          icon={Percent}
          label="设备利用率"
          value={`${utilizationPct}%`}
          color="blue"
        >
          <p className="text-xs text-app-muted">
            已租出 {rented} / {total} 台
          </p>
        </StatCard>
        <StatCard
          icon={Truck}
          label="待到达调拨"
          value={pendingTransferCount ?? 0}
          color="purple"
          href="/equipment/transfers"
        />
        <StatCard
          icon={Siren}
          label="保险到期30天内"
          value={expiringInsuranceCount}
          color="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="年检到期30天内"
          value={expiringInspectionCount}
          color="amber"
        />
      </StatsGrid>

      {/* 报废审批待处理 */}
      {scrapApprovalRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <ClipboardList className="inline h-4 w-4 mr-1.5" />
              报废审批待处理
              <span className="ml-2 text-xs font-normal text-app-muted">
                ({scrapApprovalRows.length} 条)
              </span>
            </CardTitle>
            <Link href="/approval?type=SCRAP">
              <Button variant="outline" size="sm">
                查看全部
              </Button>
            </Link>
          </CardHeader>
          <DataTable
            columns={scrapApprovalColumns}
            data={scrapApprovalRows}
            keyExtractor={(a) => a.id}
            rowHref={(a) => `/approval/${a.id}`}
            emptyMessage="暂无待审批报废申请"
          />
        </Card>
      )}

      {/* 调拨监控 */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Truck className="inline h-4 w-4 mr-1.5" />
              调拨监控
              <span className="ml-2 text-xs font-normal text-app-muted">
                ({transfers.length} 条)
              </span>
            </CardTitle>
            <Link href="/equipment/transfers">
              <Button variant="outline" size="sm">
                查看全部
              </Button>
            </Link>
          </CardHeader>
          <DataTable
            columns={transferColumns}
            data={transfers}
            keyExtractor={(t) => t.id}
            rowHref={(t) => `/equipment/transfers/${t.id}`}
            emptyMessage="暂无调拨记录"
          />
        </Card>
      )}

      {/* 设备状态变更日志 (top 15) */}
      {statusLogs && statusLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Clock className="inline h-4 w-4 mr-1.5" />
              设备状态变更日志
              <span className="ml-2 text-xs font-normal text-app-muted">
                (最近 15 条)
              </span>
            </CardTitle>
          </CardHeader>
          <DataTable
            columns={statusColumns}
            data={statusLogs as StatusLogEntry[]}
            keyExtractor={(log) => log.id}
            rowHref={(log) => `/equipment/catalog/${log.equipment_id}`}
            emptyMessage="暂无状态变更记录"
          />
          <div className="border-t border-app-border px-4 py-3">
            <Link href="/equipment/catalog">
              <Button variant="ghost" size="sm">
                查看完整设备台账 →
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Quick actions — 5 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <QuickActionCard
          icon={List}
          title="设备台账"
          description="查看和管理所有设备档案信息"
          href="/equipment/catalog"
          tone="accent"
        />
        <QuickActionCard
          icon={ArrowRightFromLine}
          title="扫码出库"
          description="扫描设备条码，完成出库操作"
          href="/equipment/scan/outbound"
          tone="success"
        />
        <QuickActionCard
          icon={ArrowLeftToLine}
          title="扫码入库"
          description="扫描设备条码，完成入库验收"
          href="/equipment/scan/inbound"
          tone="info"
        />
        <QuickActionCard
          icon={Truck}
          title="调拨管理"
          description="设备调拨列表与详情"
          href="/equipment/transfers"
          tone="info"
        />
        <QuickActionCard
          icon={ClipboardList}
          title="报废审批"
          description="处理设备报废申请和审批"
          href="/approval?type=SCRAP"
          tone="danger"
          badge={
            (scrapPendingCount ?? 0) > 0 ? (
              <Badge variant="danger" pulse>
                {scrapPendingCount} 待批
              </Badge>
            ) : undefined
          }
        />
      </div>
    </DashboardPage>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  EQUIPMENT_MANAGER VIEW
// ═══════════════════════════════════════════════════════════════════════

async function ManagerView() {
  const supabase = await createClient();

  const [
    { count: totalCount },
    { count: inStockCount },
    { count: rentedCount },
    { count: maintenanceCount },
    { count: inTransferCount },
    { count: pendingInspectionCount },
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_STOCK")
      .is("deleted_at", null),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "RENTED"),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_MAINTENANCE"),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "IN_TRANSFER"),
    supabase
      .from("equipment")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING_INSPECTION"),
  ]);

  const { data: statusLogs } = await supabase
    .from("equipment_status_log")
    .select("*, equipment:equipment_id(name, equipment_no)")
    .order("changed_at", { ascending: false })
    .limit(10);

  const logs = (statusLogs ?? []) as StatusLogEntry[];
  const total = totalCount ?? 0;
  const rented = rentedCount ?? 0;

  return (
    <DashboardPage
      title="设备工作台"
      subtitle="设备资产日常管理与维护"
    >
      {/* Stats — 6 cards */}
      <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
        <StatCard
          icon={Package}
          label="设备总数"
          value={total}
          color="blue"
          href="/equipment/catalog"
        />
        <StatCard
          icon={Package}
          label="在库可用"
          value={inStockCount ?? 0}
          color="emerald"
        />
        <StatCard
          icon={ArrowRightLeft}
          label="已租出"
          value={rented}
          color="indigo"
        />
        <StatCard
          icon={Wrench}
          label="维修中"
          value={maintenanceCount ?? 0}
          color="amber"
        />
        <StatCard
          icon={Truck}
          label="调拨中"
          value={inTransferCount ?? 0}
          color="purple"
        />
        <StatCard
          icon={ClipboardCheck}
          label="待验收"
          value={pendingInspectionCount ?? 0}
          color="red"
        />
      </StatsGrid>

      {/* Status log (top 10) */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Clock className="inline h-4 w-4 mr-1.5" />
              最近状态变更
              <span className="ml-2 text-xs font-normal text-app-muted">
                (最近 10 条)
              </span>
            </CardTitle>
          </CardHeader>
          <DataTable
            columns={statusColumns}
            data={logs}
            keyExtractor={(log) => log.id}
            rowHref={(log) => `/equipment/catalog/${log.equipment_id}`}
            emptyMessage="暂无状态变更记录"
          />
          <div className="border-t border-app-border px-4 py-3">
            <Link href="/equipment/catalog">
              <Button variant="ghost" size="sm">
                查看完整设备台账 →
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Quick actions — 4 + new equipment */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          icon={List}
          title="设备台账"
          description="查看和管理所有设备档案信息"
          href="/equipment/catalog"
          tone="accent"
        />
        <QuickActionCard
          icon={ArrowRightFromLine}
          title="扫码出库"
          description="扫描设备条码，完成出库操作"
          href="/equipment/scan/outbound"
          tone="success"
        />
        <QuickActionCard
          icon={ArrowLeftToLine}
          title="扫码入库"
          description="扫描设备条码，完成入库验收"
          href="/equipment/scan/inbound"
          tone="info"
        />
        <QuickActionCard
          icon={Truck}
          title="调拨管理"
          description="设备调拨列表与详情"
          href="/equipment/transfers"
          tone="info"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <QuickActionCard
          icon={Plus}
          title="新增设备"
          description="登记新设备信息，录入设备档案"
          href="/equipment/catalog/new"
          tone="success"
        />
      </div>
    </DashboardPage>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════

export default async function EquipmentDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <DashboardPage
        title="设备管理"
        subtitle="设备资产全生命周期概览"
      >
        <p className="py-12 text-center text-app-muted">
          请先登录
        </p>
      </DashboardPage>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (profile?.primary_role === "EQUIPMENT_SUPERVISOR") {
    return <SupervisorView />;
  }

  return <ManagerView />;
}
