import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS, ORDER_STATUS_VARIANTS } from "@/lib/constants";
import Link from "next/link";
import {
  Users, FileText, AlertTriangle, TrendingUp, ArrowRight,
  CalendarClock, DollarSign, PlusCircle, BarChart3,
} from "lucide-react";

export default async function SalesDashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysLater = new Date(now.getTime() + 7 * 86400000);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    { count: customerCount },
    { count: activeOrders },
    { count: overdueOrders },
    { count: expiringCount },
    { data: recentOrders },
    { data: overdueList },
    { data: monthlyPayments },
    { data: expiringContracts },
    { count: thisMonthOrderCount },
    { count: thisMonthCompleted },
    { count: thisMonthNewCustomers },
    { data: lastMonthPayments },
  ] = await Promise.all([
    // Stats queries
    supabase.from("customer").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "ACTIVE"),
    supabase.from("rental_order").select("*", { count: "exact", head: true }).in("order_status", ["IN_PROGRESS", "SUBMITTED", "CONFIRMED", "APPROVED"]),
    supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("order_status", "OVERDUE"),
    supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("order_status", "IN_PROGRESS").gte("planned_end_at", now.toISOString()).lte("planned_end_at", sevenDaysLater.toISOString()),
    // Recent orders (top 8)
    supabase.from("rental_order").select("id, order_no, order_status, customer:customer_id(name), total_rent_amount, planned_end_at, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
    // Overdue orders (top 5)
    supabase.from("rental_order").select("id, order_no, order_status, customer:customer_id(name), total_rent_amount, planned_end_at, unpaid_amount").eq("order_status", "OVERDUE").order("updated_at", { ascending: false }).limit(5),
    // Monthly revenue
    supabase.from("payment_record").select("amount").gte("paid_at", startOfMonth.toISOString()),
    // Expiring contracts within 7 days (top 5)
    supabase.from("rental_contract").select("id, contract_no, customer:customer_id(name), total_rent_amount, end_at, contract_status").eq("contract_status", "ACTIVE").gte("end_at", now.toISOString()).lte("end_at", sevenDaysLater.toISOString()).order("end_at", { ascending: true }).limit(5),
    // Monthly performance data
    supabase.from("rental_order").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()),
    supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("order_status", "COMPLETED").gte("updated_at", startOfMonth.toISOString()),
    supabase.from("customer").select("*", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", startOfMonth.toISOString()),
    // Last month revenue (for comparison)
    supabase.from("payment_record").select("amount").gte("paid_at", startOfLastMonth.toISOString()).lt("paid_at", startOfMonth.toISOString()),
  ]);

  // ── Type-safe data extraction ──────────────────────────────────────────

  const orders = (recentOrders ?? []) as unknown as {
    id: string; order_no: string; order_status: string;
    total_rent_amount: string | number; planned_end_at: string;
    created_at: string; customer: { name: string } | null;
  }[];

  const overdues = (overdueList ?? []) as unknown as {
    id: string; order_no: string; order_status: string;
    customer: { name: string } | null;
    total_rent_amount: string | number; unpaid_amount: string | number;
  }[];

  const contracts = (expiringContracts ?? []) as unknown as {
    id: string; contract_no: string;
    customer: { name: string } | null;
    total_rent_amount: string | number; end_at: string;
    contract_status: string;
  }[];

  // ── Aggregations ───────────────────────────────────────────────────────

  const monthlyRevenue = (monthlyPayments ?? []).reduce(
    (sum, p) => sum + parseFloat(p.amount as string ?? "0"), 0
  );

  const lastMonthRevenue = (lastMonthPayments ?? []).reduce(
    (sum, p) => sum + parseFloat(p.amount as string ?? "0"), 0
  );

  const revenueChange = lastMonthRevenue > 0
    ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : null;

  /** Safely resolve badge variant from order status */
  const orderBadgeVariant = (status: string): "default" | "success" | "warning" | "danger" | "info" =>
    (ORDER_STATUS_VARIANTS[status] as "default" | "success" | "warning" | "danger" | "info") ?? "default";

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <DashboardPage title="租赁业务工作台" subtitle="实时经营概览">
      {/* ── Stats Cards ───────────────────────────────────────────── */}
      <StatsGrid>
        <StatCard icon={Users} label="活跃客户" value={customerCount ?? 0} color="blue" href="/sales/customers" />
        <StatCard icon={FileText} label="进行中订单" value={activeOrders ?? 0} color="emerald" href="/sales/orders" />
        <StatCard icon={AlertTriangle} label="已逾期" value={overdueOrders ?? 0} color="red" href="/sales/orders?status=OVERDUE" />
        <StatCard icon={CalendarClock} label="7日内到期" value={expiringCount ?? 0} color="amber" href="/sales/reminders" />
        <StatCard icon={DollarSign} label="本月收款" color="emerald">
          <span className="text-lg font-bold tabular-nums">{formatCurrency(monthlyRevenue)}</span>
          {revenueChange !== null && (
            <span className={`ml-1 text-[11px] ${revenueChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {revenueChange >= 0 ? "↑" : "↓"}{Math.abs(revenueChange).toFixed(1)}%
            </span>
          )}
        </StatCard>
        <StatCard icon={PlusCircle} label="快捷操作" color="purple">
          <div className="flex flex-wrap gap-1 mt-1">
            <Link
              href="/sales/orders/new"
              className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 transition-colors"
            >
              <PlusCircle className="h-3 w-3" />快速开单
            </Link>
            <Link
              href="/sales/customers/new"
              className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Users className="h-3 w-3" />新建客户
            </Link>
            <Link
              href="/sales/available-equipment"
              className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <TrendingUp className="h-3 w-3" />可租设备
            </Link>
            <Link
              href="/sales/reminders"
              className="inline-flex items-center gap-0.5 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />催还提醒
            </Link>
          </div>
        </StatCard>
      </StatsGrid>

      {/* ── Detail Panels ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>最近订单</CardTitle>
            <Link
              href="/sales/orders"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              查看全部<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="p-4 md:p-6">
            <DataTable
              columns={[
                { id: "no", header: "订单编号", cell: (o) => o.order_no, shareIdentity: (o) => `order-${o.id}` },
                { id: "customer", header: "客户", cell: (o) => o.customer?.name ?? "-", hideOnMobile: true },
                { id: "amount", header: "金额", cell: (o) => formatCurrency(o.total_rent_amount), className: "text-right tabular-nums" },
                {
                  id: "status", header: "状态", cell: (o) => (
                    <Badge variant={orderBadgeVariant(o.order_status)} pulse={o.order_status === "OVERDUE"}>
                      {ORDER_STATUS[o.order_status] ?? o.order_status}
                    </Badge>
                  ),
                },
                { id: "date", header: "到期日", cell: (o) => formatDate(o.planned_end_at), hideOnMobile: true },
              ] as Column<typeof orders[0]>[]}
              data={orders}
              keyExtractor={(o) => o.id}
              rowHref={(o) => `/sales/orders/${o.id}`}
              emptyMessage="暂无订单"
            />
          </div>
        </Card>

        {/* Overdue Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              逾期订单
            </CardTitle>
            <Link
              href="/sales/orders?status=OVERDUE"
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline dark:text-red-400"
            >
              查看全部<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="p-4 md:p-6">
            {overdues.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">无逾期订单</div>
            ) : (
              <DataTable
                columns={[
                  { id: "no", header: "订单编号", cell: (o) => o.order_no },
                  { id: "customer", header: "客户", cell: (o) => o.customer?.name ?? "-" },
                  { id: "unpaid", header: "未付金额", cell: (o) => (
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{formatCurrency(o.unpaid_amount)}</span>
                  ), className: "text-right" },
                  { id: "status", header: "状态", cell: () => <Badge variant="danger" pulse>已逾期</Badge> },
                ] as Column<typeof overdues[0]>[]}
                data={overdues}
                keyExtractor={(o) => o.id}
                rowHref={(o) => `/sales/orders/${o.id}`}
                emptyMessage=""
              />
            )}
          </div>
        </Card>

        {/* Expiring Contracts (within 7 days) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              即将到期的合同
            </CardTitle>
            <Link
              href="/sales/reminders"
              className="inline-flex items-center gap-1 text-sm text-amber-600 hover:underline dark:text-amber-400"
            >
              查看全部<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="p-4 md:p-6">
            {contracts.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">7日内无到期合同</div>
            ) : (
              <DataTable
                columns={[
                  { id: "no", header: "合同编号", cell: (c) => c.contract_no },
                  { id: "customer", header: "客户", cell: (c) => c.customer?.name ?? "-" },
                  { id: "amount", header: "合同金额", cell: (c) => formatCurrency(c.total_rent_amount), className: "text-right tabular-nums" },
                  { id: "end", header: "到期日", cell: (c) => (
                    <span className="tabular-nums text-amber-600 dark:text-amber-400">{formatDate(c.end_at)}</span>
                  )},
                ] as Column<typeof contracts[0]>[]}
                data={contracts}
                keyExtractor={(c) => c.id}
                rowHref={(c) => `/sales/contracts/${c.id}`}
                emptyMessage=""
              />
            )}
          </div>
        </Card>

        {/* Monthly Performance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              本月业绩概览
            </CardTitle>
          </CardHeader>
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Revenue */}
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">本月收款</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatCurrency(monthlyRevenue)}
                </p>
                {revenueChange !== null && (
                  <p className={`mt-0.5 text-xs ${revenueChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {revenueChange >= 0 ? "↑" : "↓"} {Math.abs(revenueChange).toFixed(1)}% 环比上月
                  </p>
                )}
              </div>
              {/* New Orders */}
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">本月新订单</p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {thisMonthOrderCount ?? 0}
                </p>
              </div>
              {/* Completed */}
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">本月已完成</p>
                <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {thisMonthCompleted ?? 0}
                </p>
              </div>
              {/* New Customers */}
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">本月新增客户</p>
                <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
                  {thisMonthNewCustomers ?? 0}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardPage>
  );
}
