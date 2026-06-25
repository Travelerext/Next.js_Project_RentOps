import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { DataTable, type Column } from "@/components/data/data-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatDateTime, formatCompactCurrency } from "@/lib/utils";
import { ROLE_LABELS, RISK_LEVELS } from "@/lib/constants";
import {
  Clock,
  CheckSquare,
  XCircle,
  AlertTriangle,
  ShoppingCart,
  Percent,
  ArrowDownCircle,
  Lock,
  FileEdit,
  Banknote,
  Ban,
  Receipt,
  DollarSign,
  Users,
  ListChecks,
  History,
  ArrowRight,
  TrendingUp,
  CalendarDays,
  Shield,
  CreditCard,
  Building2,
  FileText,
  Activity,
  UserCheck,
  Landmark,
  TriangleAlert,
  Package,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  primary_role: string;
  display_name: string;
};

type ApprovalDetail = {
  id: string;
  approval_no: string;
  approval_type: string;
  title: string;
  status: string;
  current_step: number;
  applicant_id: string;
  submitted_at: string;
  applicant: { display_name: string } | null;
};

type CustomerRiskItem = {
  id: string;
  name: string;
  risk_level: string;
  is_blacklisted: boolean;
};

type OverdueReceivableItem = {
  id: string;
  receivable_no: string;
  amount: string;
  unpaid_amount: string;
  due_date: string;
  status: string;
  overdue_days: number;
  customer: { name: string } | null;
};

type LargePaymentItem = {
  id: string;
  payment_no: string;
  amount: string;
  paid_at: string;
  customer: { name: string } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────

const PENDING_STATUSES = ["SUBMITTED", "IN_PROGRESS"];

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  ORDER: "订单审批",
  DISCOUNT: "折扣审批",
  DEPOSIT_REDUCTION: "押金减免",
  LOCK: "锁定审批",
  CONTRACT_CHANGE: "合同变更",
  REFUND: "退款审批",
  BAD_DEBT: "坏账审批",
};

const SALES_APPROVAL_TYPES = ["ORDER", "DISCOUNT", "DEPOSIT_REDUCTION", "LOCK", "CONTRACT_CHANGE"];

// ─── Shared helpers ───────────────────────────────────────────────────────

function ApprovalTypeBadge({ type }: { type: string }) {
  const variants: Record<string, "info" | "warning" | "success" | "danger" | "default"> = {
    ORDER: "warning",
    DISCOUNT: "warning",
    DEPOSIT_REDUCTION: "info",
    LOCK: "default",
    CONTRACT_CHANGE: "info",
    REFUND: "warning",
    BAD_DEBT: "danger",
  };
  return <Badge variant={variants[type] ?? "default"}>{APPROVAL_TYPE_LABELS[type] ?? type}</Badge>;
}

function RiskLevelBadge({ level }: { level: string }) {
  const v: Record<string, "danger" | "warning" | "info" | "default"> = {
    HIGH: "danger",
    CRITICAL: "danger",
    MEDIUM: "warning",
    LOW: "info",
  };
  return <Badge variant={v[level] ?? "default"}>{RISK_LEVELS[level] ?? level}</Badge>;
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page — fetch profile then dispatch to role-specific view
// ═══════════════════════════════════════════════════════════════════════════

export default async function ApprovalDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let profile: Profile | null = null;
  let primaryRole = "APPROVER";

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, primary_role, display_name")
      .eq("supabase_user_id", user.id)
      .maybeSingle();
    profile = prof as Profile | null;
    primaryRole = profile?.primary_role ?? "APPROVER";
  }

  const displayName = profile?.display_name ?? "用户";
  const roleLabel = ROLE_LABELS[primaryRole] ?? primaryRole;
  const baseProps = { profile, displayName, roleLabel };

  switch (primaryRole) {
    case "SALES_MANAGER":
      return <SalesManagerView {...baseProps} />;
    case "FINANCE_MANAGER":
      return <FinanceManagerView {...baseProps} />;
    case "GENERAL_MANAGER":
      return <GeneralManagerView {...baseProps} />;
    default:
      return <ApproverView {...baseProps} />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SALES_MANAGER (业务主管)
// ═══════════════════════════════════════════════════════════════════════════

async function SalesManagerView({ profile, displayName, roleLabel }: { profile: Profile | null; displayName: string; roleLabel: string }) {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // ── Batch 1: counts and aggregates ──────────────────────────────────

  const [
    { count: orderPendingCount },
    { count: discountPendingCount },
    { count: depositPendingCount },
    { count: contractPendingCount },
    { count: lockPendingCount },
    { count: highRiskCustomerCount },
    { count: overdueOrderCount },
    { data: monthlyOrders },
    { data: monthlyPayments },
    { data: salesProfiles },
    { data: pendingApprovals },
  ] = await Promise.all([
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "ORDER").in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "DISCOUNT").in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "DEPOSIT_REDUCTION").in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "CONTRACT_CHANGE").in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "LOCK").in("status", PENDING_STATUSES),
    supabase.from("customer").select("*", { count: "exact", head: true }).in("risk_level", ["HIGH", "CRITICAL"]).is("deleted_at", null),
    supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("order_status", "OVERDUE").is("deleted_at", null),
    // Monthly orders for team stats
    supabase.from("rental_order").select("id, sales_user_id, total_rent_amount").gte("created_at", monthStart.toISOString()).is("deleted_at", null).neq("order_status", "DRAFT"),
    // Monthly payments
    supabase.from("payment_record").select("order_id, amount").gte("paid_at", monthStart.toISOString()).eq("status", "COMPLETED"),
    // Sales people
    supabase.from("profiles").select("id, display_name").eq("primary_role", "SALES").is("deleted_at", null),
    // Pending approvals list (top 10)
    supabase.from("approval_request").select("*, applicant:applicant_id(display_name)").in("approval_type", SALES_APPROVAL_TYPES).in("status", PENDING_STATUSES).order("submitted_at", { ascending: false }).limit(10),
  ]);

  // ── Compute derived stats ─────────────────────────────────────────

  const ordersList = (monthlyOrders ?? []) as { id: string; sales_user_id: string; total_rent_amount: string }[];
  const paymentsList = (monthlyPayments ?? []) as { order_id: string; amount: string }[];
  const salesPeople = (salesProfiles ?? []) as { id: string; display_name: string }[];

  // Monthly team signing total
  const monthlySigningAmount = ordersList.reduce((s, o) => s + parseFloat(o.total_rent_amount ?? "0"), 0);

  // Monthly team collection total
  const orderIdToSales = new Map(ordersList.map((o) => [o.id, o.sales_user_id]));
  const paymentBySales = new Map<string, number>();
  for (const p of paymentsList) {
    const sid = orderIdToSales.get(p.order_id);
    if (sid) paymentBySales.set(sid, (paymentBySales.get(sid) ?? 0) + parseFloat(p.amount ?? "0"));
  }
  const monthlyCollectionAmount = [...paymentBySales.values()].reduce((s, v) => s + v, 0);

  const monthlyOrderCount = ordersList.length;

  // Sales team performance rows
  const salesTeamData = salesPeople
    .map((sp) => {
      const personOrders = ordersList.filter((o) => o.sales_user_id === sp.id);
      return {
        name: sp.display_name,
        order_count: personOrders.length,
        total_amount: personOrders.reduce((s, o) => s + parseFloat(o.total_rent_amount ?? "0"), 0),
        payment_amount: paymentBySales.get(sp.id) ?? 0,
      };
    })
    .filter((r) => r.order_count > 0 || r.total_amount > 0)
    .sort((a, b) => b.total_amount - a.total_amount);

  // ── Batch 2: high-risk customers with overdue amounts ─────────────

  const { data: highRiskCustomers } = await supabase
    .from("customer")
    .select("id, name, risk_level, is_blacklisted")
    .in("risk_level", ["HIGH", "CRITICAL"])
    .is("deleted_at", null)
    .limit(5);

  const highRiskIds = (highRiskCustomers ?? []).map((c) => c.id);
  let overdueByCustomer = new Map<string, number>();
  if (highRiskIds.length > 0) {
    const { data: overdueRecv } = await supabase
      .from("receivable")
      .select("customer_id, unpaid_amount")
      .in("customer_id", highRiskIds)
      .in("status", ["OVERDUE", "UNPAID", "PARTIAL"]);
    for (const r of overdueRecv ?? []) {
      overdueByCustomer.set(r.customer_id, (overdueByCustomer.get(r.customer_id) ?? 0) + parseFloat(r.unpaid_amount ?? "0"));
    }
  }

  const riskCustomerRows = (highRiskCustomers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    risk_level: c.risk_level,
    overdue_amount: overdueByCustomer.get(c.id) ?? 0,
    is_blacklisted: c.is_blacklisted,
  }));

  const pendingList = (pendingApprovals ?? []) as ApprovalDetail[];

  // ── Table column definitions ──────────────────────────────────────

  const pendingColumns: Column<ApprovalDetail>[] = [
    { id: "approval_no", header: "审批编号", cell: (a) => <span className="font-mono text-xs">{a.approval_no}</span> },
    { id: "type", header: "类型", cell: (a) => <ApprovalTypeBadge type={a.approval_type} />, className: "whitespace-nowrap" },
    { id: "title", header: "标题", cell: (a) => <span className="text-sm font-medium">{a.title}</span> },
    { id: "applicant", header: "申请人", cell: (a) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{a.applicant?.display_name ?? "-"}</span>, hideOnMobile: true },
    { id: "submitted_at", header: "提交时间", cell: (a) => <span className="text-sm text-zinc-500">{formatDateTime(a.submitted_at)}</span>, hideOnMobile: true },
    { id: "step", header: "当前步骤", cell: (a) => <Badge variant="info">第{a.current_step}步</Badge> },
  ];

  const teamColumns: Column<(typeof salesTeamData)[number]>[] = [
    { id: "name", header: "姓名", cell: (p) => <span className="font-medium">{p.name}</span> },
    { id: "order_count", header: "订单数", cell: (p) => <span>{p.order_count}</span> },
    { id: "total_amount", header: "签约金额", cell: (p) => <span className="font-mono tabular-nums">{formatCurrency(p.total_amount)}</span> },
    { id: "payment_amount", header: "回款金额", cell: (p) => <span className="font-mono tabular-nums">{formatCurrency(p.payment_amount)}</span> },
  ];

  const riskColumns: Column<(typeof riskCustomerRows)[number]>[] = [
    { id: "name", header: "客户名称", cell: (c) => <span className="font-medium">{c.name}</span> },
    { id: "risk_level", header: "风险等级", cell: (c) => <RiskLevelBadge level={c.risk_level} /> },
    { id: "overdue_amount", header: "逾期应收", cell: (c) => <span className="font-mono tabular-nums text-red-600 dark:text-red-400">{formatCurrency(c.overdue_amount)}</span> },
    {
      id: "blacklist",
      header: "黑名单",
      cell: (c) => (c.is_blacklisted ? <Badge variant="danger">是</Badge> : <span className="text-zinc-400">-</span>),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DashboardPage
      title="业务管理工作台"
      subtitle={`${displayName} · ${roleLabel} · 审批管理 · 团队业绩 · 风险监控`}
    >
      {/* Stats row 1 — 6 cards */}
      <SectionTitle icon={ListChecks}>审批概览</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
        <StatCard icon={ShoppingCart} label="待审批订单" value={orderPendingCount ?? 0} color="red" />
        <StatCard icon={Percent} label="待审批折扣" value={discountPendingCount ?? 0} color="amber" />
        <StatCard icon={ArrowDownCircle} label="待押金减免" value={depositPendingCount ?? 0} color="amber" />
        <StatCard icon={FileEdit} label="待合同变更" value={contractPendingCount ?? 0} color="blue" />
        <StatCard icon={Lock} label="待锁单审批" value={lockPendingCount ?? 0} color="purple" />
        <StatCard icon={TriangleAlert} label="高风险客户" value={highRiskCustomerCount ?? 0} color="red" />
      </div>

      {/* Stats row 2 — 4 cards */}
      <SectionTitle icon={TrendingUp}>团队业绩</SectionTitle>
      <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
        <StatCard icon={DollarSign} label="本月团队签约额" value={formatCurrency(monthlySigningAmount)} color="emerald" />
        <StatCard icon={Receipt} label="本月团队收款" value={formatCurrency(monthlyCollectionAmount)} color="blue" />
        <StatCard icon={ShoppingCart} label="团队订单数" value={monthlyOrderCount} />
        <StatCard icon={AlertTriangle} label="逾期订单数" value={overdueOrderCount ?? 0} color="red" />
      </StatsGrid>

      {/* 待审批列表 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <ListChecks className="inline h-4 w-4 mr-1.5" />
            待审批列表
          </CardTitle>
          <Link href="/approval/pending">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={pendingColumns}
          data={pendingList}
          keyExtractor={(a) => a.id}
          rowHref={(a) => `/approval/${a.id}`}
          emptyMessage="暂无待审批项"
        />
      </Card>

      {/* 团队业绩 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Users className="inline h-4 w-4 mr-1.5" />
            团队业绩
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={teamColumns}
          data={salesTeamData}
          keyExtractor={(p) => p.name}
          emptyMessage="本月暂无销售业绩数据"
        />
      </Card>

      {/* 高风险客户监控 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Shield className="inline h-4 w-4 mr-1.5" />
            高风险客户监控
          </CardTitle>
          <Link href="/customer?risk=HIGH">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={riskColumns}
          data={riskCustomerRows}
          keyExtractor={(c) => c.id}
          rowHref={(c) => `/customer/${c.id}`}
          emptyMessage="暂无高风险客户"
        />
      </Card>

      {/* Quick actions */}
      <SectionTitle icon={Activity}>快捷操作</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/approval/pending">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <ListChecks className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium">待审批列表</p>
          </Card>
        </Link>
        <Link href="/orders">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">订单管理</p>
          </Card>
        </Link>
        <Link href="/customer">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium">客户管理</p>
          </Card>
        </Link>
        <Link href="/reports">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <FileText className="h-6 w-6 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
            <p className="text-sm font-medium">业务报表</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCE_MANAGER (财务主管)
// ═══════════════════════════════════════════════════════════════════════════

async function FinanceManagerView({ profile, displayName, roleLabel }: { profile: Profile | null; displayName: string; roleLabel: string }) {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // ── Batch 1: stats ─────────────────────────────────────────────────

  const [
    { count: refundPendingCount },
    { count: badDebtPendingCount },
    { count: pendingSettlementCount },
    { data: overdueReceivables },
    { data: monthlyRevenueData },
    { data: depositRecords },
    { data: pendingApprovals },
    { data: overdueTop10 },
    { data: largePayments },
  ] = await Promise.all([
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "REFUND").in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("approval_type", "BAD_DEBT").in("status", PENDING_STATUSES),
    supabase.from("reconciliation_statement").select("*", { count: "exact", head: true }).in("status", ["DRAFT", "PENDING_CONFIRM"]),
    // Overdue receivables
    supabase.from("receivable").select("id, amount, unpaid_amount, due_date, overdue_days, customer:customer_id(name)").in("status", ["OVERDUE", "UNPAID", "PARTIAL"]).gt("unpaid_amount", 0).order("overdue_days", { ascending: false }),
    // Monthly revenue
    supabase.from("payment_record").select("amount").gte("paid_at", monthStart.toISOString()).eq("status", "COMPLETED"),
    // Deposit balance
    supabase.from("deposit_record").select("available_amount"),
    // Pending approvals (REFUND + BAD_DEBT)
    supabase.from("approval_request").select("*, applicant:applicant_id(display_name)").in("approval_type", ["REFUND", "BAD_DEBT"]).in("status", PENDING_STATUSES).order("submitted_at", { ascending: false }).limit(10),
    // Overdue TOP 10
    supabase.from("receivable").select("*, customer:customer_id(name)").in("status", ["OVERDUE", "UNPAID", "PARTIAL"]).gt("unpaid_amount", 0).order("overdue_days", { ascending: false }).limit(10),
    // Large payments this month
    supabase.from("payment_record").select("*, customer:customer_id(name)").gte("paid_at", monthStart.toISOString()).eq("status", "COMPLETED").order("amount", { ascending: false }).limit(10),
  ]);

  // ── Compute derived stats ─────────────────────────────────────────

  const overdueList = ((overdueReceivables ?? []) as unknown) as { id: string; amount: string; unpaid_amount: string; due_date: string; overdue_days: number; customer: { name: string } | null }[];
  const totalOverdueAmount = overdueList.reduce((s, r) => s + parseFloat(r.unpaid_amount ?? "0"), 0);
  const overdueCount = overdueList.length;

  const monthlyRevenue = (monthlyRevenueData ?? []).reduce((s: number, r: { amount: string }) => s + parseFloat(r.amount ?? "0"), 0);

  const depositBalance = (depositRecords ?? []).reduce((s: number, d: { available_amount: string }) => s + parseFloat(d.available_amount ?? "0"), 0);

  const pendingList = (pendingApprovals ?? []) as ApprovalDetail[];

  // ── Column definitions ────────────────────────────────────────────

  const pendingColumns: Column<ApprovalDetail>[] = [
    { id: "approval_no", header: "审批编号", cell: (a) => <span className="font-mono text-xs">{a.approval_no}</span> },
    { id: "type", header: "类型", cell: (a) => <ApprovalTypeBadge type={a.approval_type} />, className: "whitespace-nowrap" },
    { id: "title", header: "标题", cell: (a) => <span className="text-sm font-medium">{a.title}</span> },
    { id: "applicant", header: "申请人", cell: (a) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{a.applicant?.display_name ?? "-"}</span>, hideOnMobile: true },
    { id: "submitted_at", header: "提交时间", cell: (a) => <span className="text-sm text-zinc-500">{formatDateTime(a.submitted_at)}</span>, hideOnMobile: true },
    { id: "step", header: "步骤", cell: (a) => <Badge variant="info">第{a.current_step}步</Badge> },
  ];

  const overdueColumns: Column<OverdueReceivableItem>[] = [
    { id: "customer", header: "客户", cell: (r) => <span className="font-medium">{r.customer?.name ?? "-"}</span> },
    { id: "amount", header: "逾期金额", cell: (r) => <span className="font-mono tabular-nums text-red-600 dark:text-red-400">{formatCurrency(r.unpaid_amount)}</span> },
    { id: "overdue_days", header: "逾期天数", cell: (r) => <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">{r.overdue_days}天</span> },
  ];

  const paymentColumns: Column<LargePaymentItem>[] = [
    { id: "payment_no", header: "收款编号", cell: (p) => <span className="font-mono text-xs">{p.payment_no}</span> },
    { id: "customer", header: "客户", cell: (p) => <span className="font-medium">{p.customer?.name ?? "-"}</span> },
    { id: "amount", header: "金额", cell: (p) => <span className="font-mono tabular-nums">{formatCurrency(p.amount)}</span> },
    { id: "paid_at", header: "收款日期", cell: (p) => <span className="text-sm text-zinc-500">{formatDate(p.paid_at)}</span>, hideOnMobile: true },
  ];

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DashboardPage
      title="财务管理工作台"
      subtitle={`${displayName} · ${roleLabel} · 审批管理 · 资金监控 · 风险控制`}
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <StatCard icon={Banknote} label="待审批退款" value={refundPendingCount ?? 0} color="amber" />
        <StatCard icon={Ban} label="待审批坏账" value={badDebtPendingCount ?? 0} color="red" />
        <StatCard icon={TriangleAlert} label="逾期应收总额" value={formatCurrency(totalOverdueAmount)} color="red" />
        <StatCard icon={TrendingUp} label="本月营收" value={formatCurrency(monthlyRevenue)} color="emerald" />
        <StatCard icon={Landmark} label="押金余额" value={formatCurrency(depositBalance)} color="blue" />
        <StatCard icon={FileText} label="待处理结算" value={pendingSettlementCount ?? 0} color="amber" />
      </div>

      {/* 待审批列表 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <ListChecks className="inline h-4 w-4 mr-1.5" />
            待审批列表
          </CardTitle>
          <Link href="/approval/pending">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={pendingColumns}
          data={pendingList}
          keyExtractor={(a) => a.id}
          rowHref={(a) => `/approval/${a.id}`}
          emptyMessage="暂无待审批项"
        />
      </Card>

      {/* 逾期应收TOP10 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <AlertTriangle className="inline h-4 w-4 mr-1.5" />
            逾期应收 TOP 10
          </CardTitle>
          <Link href="/finance/receivables">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={overdueColumns}
          data={(overdueTop10 ?? []) as OverdueReceivableItem[]}
          keyExtractor={(r) => r.id}
          rowHref={(r) => `/finance/receivables/${r.id}`}
          emptyMessage="暂无逾期应收"
        />
      </Card>

      {/* 本月大额收款 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Receipt className="inline h-4 w-4 mr-1.5" />
            本月大额收款
          </CardTitle>
          <Link href="/finance/payments">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={paymentColumns}
          data={(largePayments ?? []) as LargePaymentItem[]}
          keyExtractor={(p) => p.id}
          rowHref={(p) => `/finance/payments/${p.id}`}
          emptyMessage="本月暂无收款记录"
        />
      </Card>

      {/* Quick actions */}
      <SectionTitle icon={Activity}>快捷操作</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/approval/pending">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <ListChecks className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium">待审批</p>
          </Card>
        </Link>
        <Link href="/finance/receivables">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <Receipt className="h-6 w-6 mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">应收管理</p>
          </Card>
        </Link>
        <Link href="/finance/refunds">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <Banknote className="h-6 w-6 mx-auto mb-2 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium">退款管理</p>
          </Card>
        </Link>
        <Link href="/finance/reconciliation">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center">
            <FileText className="h-6 w-6 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
            <p className="text-sm font-medium">对账单</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL_MANAGER (总经理)
// ═══════════════════════════════════════════════════════════════════════════

async function GeneralManagerView({ profile, displayName, roleLabel }: { profile: Profile | null; displayName: string; roleLabel: string }) {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Build date range for last 6 months
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);

  // ── Batch 1: stats ─────────────────────────────────────────────────

  const [
    { count: pendingTotal },
    { count: highRiskCustomerCount },
    { count: totalEquipmentNonScrapped },
    { count: rentedEquipmentCount },
    { data: monthlyRevenueData },
    { data: monthlyOrdersData },
    { data: overdueReceivables },
    { data: sixMonthPayments },
    { data: overdueOrdersList },
    { data: highRiskCustomers },
    { data: salesProfiles },
    { count: maintenanceOrderCount },
  ] = await Promise.all([
    supabase.from("approval_request").select("*", { count: "exact", head: true }).in("status", PENDING_STATUSES),
    supabase.from("customer").select("*", { count: "exact", head: true }).in("risk_level", ["HIGH", "CRITICAL"]).is("deleted_at", null),
    supabase.from("equipment").select("*", { count: "exact", head: true }).eq("scrapped", false),
    supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "RENTED").eq("scrapped", false),
    // Monthly revenue
    supabase.from("payment_record").select("amount").gte("paid_at", monthStart.toISOString()).eq("status", "COMPLETED"),
    // Monthly orders for profit calc
    supabase.from("rental_order").select("total_rent_amount, transport_fee, material_fee, other_fee").gte("created_at", monthStart.toISOString()).is("deleted_at", null).neq("order_status", "DRAFT"),
    // Overdue receivable total
    supabase.from("receivable").select("unpaid_amount").in("status", ["OVERDUE", "UNPAID", "PARTIAL"]).gt("unpaid_amount", 0),
    // Last 6 months payments for trend
    supabase.from("payment_record").select("amount, paid_at").gte("paid_at", sixMonthsAgo.toISOString()).eq("status", "COMPLETED"),
    // Overdue orders
    supabase.from("rental_order").select("id, order_no, customer_id, total_rent_amount").eq("order_status", "OVERDUE").is("deleted_at", null).limit(10),
    // High-risk customers
    supabase.from("customer").select("id, name, risk_level").in("risk_level", ["HIGH", "CRITICAL"]).is("deleted_at", null).limit(10),
    // Sales profiles for department grouping
    supabase.from("profiles").select("id, display_name, department_id").eq("primary_role", "SALES").is("deleted_at", null),
    // Maintenance orders this month
    supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
  ]);

  // ── Compute derived stats ─────────────────────────────────────────

  const monthlyRevenue = (monthlyRevenueData ?? []).reduce((s: number, r: { amount: string }) => s + parseFloat(r.amount ?? "0"), 0);

  // Profit approximation: total_rent_amount - transport - material - other
  const monthlyProfit = (monthlyOrdersData ?? []).reduce(
    (s: number, o: { total_rent_amount: string; transport_fee: string; material_fee: string; other_fee: string }) =>
      s + parseFloat(o.total_rent_amount ?? "0") - parseFloat(o.transport_fee ?? "0") - parseFloat(o.material_fee ?? "0") - parseFloat(o.other_fee ?? "0"),
    0,
  );

  const equipmentUtilization =
    (totalEquipmentNonScrapped ?? 0) > 0
      ? Math.round((((rentedEquipmentCount ?? 0) / (totalEquipmentNonScrapped ?? 0)) * 100))
      : 0;

  const totalOverdueReceivable = (overdueReceivables ?? []).reduce(
    (s: number, r: { unpaid_amount: string }) => s + parseFloat(r.unpaid_amount ?? "0"),
    0,
  );

  // Monthly revenue trend (last 6 months)
  const paymentsAll = (sixMonthPayments ?? []) as { amount: string; paid_at: string }[];
  const monthlyTrendMap = new Map<string, number>();
  for (const p of paymentsAll) {
    const d = new Date(p.paid_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrendMap.set(key, (monthlyTrendMap.get(key) ?? 0) + parseFloat(p.amount ?? "0"));
  }
  const monthlyTrend: { month: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    monthlyTrend.push({ month: label, amount: monthlyTrendMap.get(key) ?? 0 });
  }

  // Department comparison
  const salesHeadcount = (salesProfiles ?? []).length;
  const deptComparison = [
    { department: "销售", headcount: salesHeadcount, order_count: (monthlyOrdersData ?? []).length, total_amount: monthlyRevenue },
    { department: "设备", headcount: totalEquipmentNonScrapped ?? 0, order_count: rentedEquipmentCount ?? 0, total_amount: equipmentUtilization },
    { department: "维修", headcount: 0, order_count: maintenanceOrderCount ?? 0, total_amount: 0 },
  ];

  // Risk alerts
  const overdueOrderRows = (overdueOrdersList ?? []) as { id: string; order_no: string; total_rent_amount: string }[];
  const highRiskRows = (highRiskCustomers ?? []) as { id: string; name: string; risk_level: string }[];

  // ── Column definitions ────────────────────────────────────────────

  const trendColumns: Column<(typeof monthlyTrend)[number]>[] = [
    { id: "month", header: "月份", cell: (r) => <span className="font-medium">{r.month}</span> },
    { id: "amount", header: "营收金额", cell: (r) => <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span> },
  ];

  const deptColumns: Column<(typeof deptComparison)[number]>[] = [
    { id: "dept", header: "部门", cell: (d) => <span className="font-medium">{d.department}</span> },
    { id: "headcount", header: "规模", cell: (d) => <span>{d.department === "设备" ? `${d.headcount}台` : `${d.headcount}人`}</span> },
    { id: "metric1", header: "指标1", cell: (d) => <span>{d.department === "销售" ? `${d.order_count}单` : d.department === "设备" ? `出租率 ${d.total_amount}%` : `${d.order_count}单`}</span> },
    {
      id: "metric2",
      header: "指标2",
      cell: (d) => (
        <span className="font-mono tabular-nums">
          {d.department === "销售" ? formatCurrency(d.total_amount) : d.department === "设备" ? `${d.order_count}台出租中` : "-"}
        </span>
      ),
    },
  ];

  const alertColumns: Column<{ id: string; type: string; name: string; detail: string }>[] = [
    { id: "type", header: "类型", cell: (a) => <Badge variant={a.type === "逾期订单" ? "danger" : "warning"}>{a.type}</Badge> },
    { id: "name", header: "内容", cell: (a) => <span className="font-medium">{a.name}</span> },
    { id: "detail", header: "详情", cell: (a) => <span className="text-sm text-zinc-500">{a.detail}</span> },
  ];

  const riskAlerts: { id: string; type: string; name: string; detail: string }[] = [
    ...overdueOrderRows.map((o) => ({
      id: `order-${o.id}`,
      type: "逾期订单",
      name: `订单 ${o.order_no}`,
      detail: `逾期金额 ${formatCurrency(o.total_rent_amount)}`,
    })),
    ...highRiskRows.map((c) => ({
      id: `customer-${c.id}`,
      type: "高风险客户",
      name: c.name,
      detail: `风险等级: ${RISK_LEVELS[c.risk_level] ?? c.risk_level}`,
    })),
  ];

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DashboardPage
      title="经营管理工作台"
      subtitle={`${displayName} · ${roleLabel} · 全局概览 · 关键指标 · 风险预警`}
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <StatCard icon={TrendingUp} label="本月营收" value={formatCompactCurrency(monthlyRevenue)} color="emerald" />
        <StatCard icon={DollarSign} label="本月利润" value={formatCompactCurrency(monthlyProfit)} color="blue" />
        <StatCard icon={Activity} label="设备利用率" value={`${equipmentUtilization}%`} color="purple" />
        <StatCard icon={TriangleAlert} label="逾期应收" value={formatCompactCurrency(totalOverdueReceivable)} color="red" />
        <StatCard icon={Shield} label="高风险客户" value={highRiskCustomerCount ?? 0} color="red" />
        <StatCard icon={Clock} label="待审批总数" value={pendingTotal ?? 0} color="amber" />
      </div>

      {/* 部门业绩对比 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Building2 className="inline h-4 w-4 mr-1.5" />
            部门业绩对比
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={deptColumns}
          data={deptComparison}
          keyExtractor={(d) => d.department}
          emptyMessage="暂无数据"
        />
      </Card>

      {/* 月度营收趋势 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <CalendarDays className="inline h-4 w-4 mr-1.5" />
            月度营收趋势
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={trendColumns}
          data={monthlyTrend}
          keyExtractor={(r) => r.month}
          emptyMessage="暂无营收数据"
        />
      </Card>

      {/* 风险预警 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <TriangleAlert className="inline h-4 w-4 mr-1.5" />
            风险预警
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={alertColumns}
          data={riskAlerts}
          keyExtractor={(a) => a.id}
          emptyMessage="暂无风险预警"
        />
      </Card>

      {/* Quick actions */}
      <SectionTitle icon={Activity}>快捷操作</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Link href="/approval/pending">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <ListChecks className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium">待审批</p>
          </Card>
        </Link>
        <Link href="/finance">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <DollarSign className="h-6 w-6 mx-auto mb-2 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium">财务管理</p>
          </Card>
        </Link>
        <Link href="/equipment/catalog">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <Package className="h-6 w-6 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
            <p className="text-sm font-medium">设备台账</p>
          </Card>
        </Link>
        <Link href="/sales/orders">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium">订单管理</p>
          </Card>
        </Link>
        <Link href="/sales/customers">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <Users className="h-6 w-6 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium">客户管理</p>
          </Card>
        </Link>
        <Link href="/finance/refunds">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <Receipt className="h-6 w-6 mx-auto mb-2 text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium">退款审批</p>
          </Card>
        </Link>
        <Link href="/admin/audit-log">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <History className="h-6 w-6 mx-auto mb-2 text-zinc-600 dark:text-zinc-400" />
            <p className="text-sm font-medium">审计日志</p>
          </Card>
        </Link>
        <Link href="/sales/reports">
          <Card className="cursor-pointer transition-shadow hover:shadow-md text-center p-4">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm font-medium">经营报表</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APPROVER (审批/管理层 — generic view)
// ═══════════════════════════════════════════════════════════════════════════

async function ApproverView({ profile, displayName, roleLabel }: { profile: Profile | null; displayName: string; roleLabel: string }) {
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { count: pendingCount },
    { count: approvedTodayCount },
    { count: rejectedTodayCount },
    { count: highRiskCustomerCount },
    { data: allPendingApprovals },
  ] = await Promise.all([
    supabase.from("approval_request").select("*", { count: "exact", head: true }).in("status", PENDING_STATUSES),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("status", "APPROVED").gte("approved_at", today.toISOString()),
    supabase.from("approval_request").select("*", { count: "exact", head: true }).eq("status", "REJECTED").gte("rejected_at", today.toISOString()),
    supabase.from("customer").select("*", { count: "exact", head: true }).in("risk_level", ["HIGH", "CRITICAL"]).is("deleted_at", null),
    supabase.from("approval_request").select("*, applicant:applicant_id(display_name)").in("status", PENDING_STATUSES).order("submitted_at", { ascending: false }).limit(10),
  ]);

  // My pending approvals
  let myPendingApprovals: ApprovalDetail[] = [];
  if (profile?.id) {
    const { data: mySteps } = await supabase
      .from("approval_step_record")
      .select("approval_id")
      .eq("approver_id", profile.id)
      .is("action", null);

    const approvalIds = [...new Set((mySteps ?? []).map((s) => s.approval_id))];
    if (approvalIds.length > 0) {
      const { data } = await supabase
        .from("approval_request")
        .select("*, applicant:applicant_id(display_name)")
        .in("id", approvalIds)
        .in("status", PENDING_STATUSES)
        .order("submitted_at", { ascending: false })
        .limit(8);
      myPendingApprovals = (data ?? []) as ApprovalDetail[];
    }
  }

  const allPending = (allPendingApprovals ?? []) as ApprovalDetail[];

  const pendingColumns: Column<ApprovalDetail>[] = [
    { id: "approval_no", header: "编号", cell: (a) => <span className="font-mono text-xs">{a.approval_no}</span> },
    { id: "title", header: "标题", cell: (a) => <span className="text-sm font-medium">{a.title}</span> },
    { id: "type", header: "类型", cell: (a) => <ApprovalTypeBadge type={a.approval_type} />, className: "whitespace-nowrap" },
    { id: "applicant", header: "申请人", cell: (a) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{a.applicant?.display_name ?? "-"}</span>, hideOnMobile: true },
    { id: "submitted_at", header: "提交时间", cell: (a) => <span className="text-sm text-zinc-500">{formatDateTime(a.submitted_at)}</span>, hideOnMobile: true },
  ];

  return (
    <DashboardPage title="审批管理工作台" subtitle={`${displayName} · ${roleLabel}`}>
      <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
        <StatCard icon={Clock} label="待审批" value={pendingCount ?? 0} color="amber" href="/approval/pending" />
        <StatCard icon={CheckSquare} label="今日已通过" value={approvedTodayCount ?? 0} color="emerald" />
        <StatCard icon={XCircle} label="今日已拒绝" value={rejectedTodayCount ?? 0} color="red" />
        <StatCard icon={AlertTriangle} label="高风险客户" value={highRiskCustomerCount ?? 0} color="red" />
      </StatsGrid>

      {/* 全部待审批 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <ListChecks className="inline h-4 w-4 mr-1.5" />
            全部待审批
          </CardTitle>
          <Link href="/approval/pending">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={pendingColumns}
          data={allPending}
          keyExtractor={(a) => a.id}
          rowHref={(a) => `/approval/${a.id}`}
          emptyMessage="暂无待审批申请"
        />
      </Card>

      {/* 我的待审批 */}
      <Card>
        <CardHeader>
          <CardTitle>
            <UserCheck className="inline h-4 w-4 mr-1.5" />
            我的待审批
          </CardTitle>
          <Link href="/approval/pending">
            <Button variant="ghost" size="sm">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <DataTable
          columns={pendingColumns}
          data={myPendingApprovals}
          keyExtractor={(a) => a.id}
          rowHref={(a) => `/approval/${a.id}`}
          emptyMessage="暂无待您审批的申请"
        />
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link href="/approval/pending">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <ListChecks className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle>待审批列表</CardTitle>
              </div>
            </CardHeader>
            <p className="px-6 pb-4 text-sm text-zinc-500">查看和处理待审批申请</p>
          </Card>
        </Link>
        <Link href="/approval/history">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>审批历史</CardTitle>
              </div>
            </CardHeader>
            <p className="px-6 pb-4 text-sm text-zinc-500">查看所有已处理的审批记录</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}
