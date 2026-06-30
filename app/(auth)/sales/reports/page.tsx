import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS } from "@/lib/constants";
import { FileText, TrendingUp, Users, DollarSign, ShoppingCart } from "lucide-react";

export default async function SalesReportsPage() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: totalOrders },
    { count: totalContracts },
    { count: activeCustomers },
    { data: payments },
    { data: orderStatusData },
    { data: topCustomers },
    { data: monthlyOrders },
  ] = await Promise.all([
    supabase.from("rental_order").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("rental_contract").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("customer").select("*", { count: "exact", head: true }).eq("status", "ACTIVE").is("deleted_at", null),
    supabase.from("payment_record").select("amount, paid_at").order("paid_at", { ascending: false }).limit(1000),
    supabase.from("rental_order").select("order_status").is("deleted_at", null),
    supabase.from("rental_order").select("customer:customer_id(name), total_rent_amount!inner").is("deleted_at", null).order("total_rent_amount", { ascending: false }).limit(10),
    supabase.from("rental_order").select("id, order_no, total_rent_amount, order_status, created_at, customer:customer_id(name)").is("deleted_at", null).gte("created_at", monthStart).order("created_at", { ascending: false }),
  ]);

  // Total revenue
  const totalRevenue = (payments ?? []).reduce((s, p) => s + parseFloat((p.amount as string) ?? "0"), 0);
  const monthlyRevenue = (payments ?? []).filter(p => (p.paid_at as string) >= monthStart).reduce((s, p) => s + parseFloat((p.amount as string) ?? "0"), 0);

  // Order status distribution
  const statusDist = (orderStatusData ?? []).reduce<Record<string, number>>((acc, o) => {
    const s = o.order_status as string; acc[s] = (acc[s] || 0) + 1; return acc;
  }, {});

  // Top customers by order amount
  const topCustomerData = (topCustomers ?? []) as unknown as {
    customer: { name: string } | null; total_rent_amount: string;
  }[];

  const monthlyOrderData = (monthlyOrders ?? []) as unknown as {
    id: string; order_no: string; total_rent_amount: string;
    order_status: string; created_at: string;
    customer: { name: string } | null;
  }[];

  const orderCols: Column<typeof monthlyOrderData[0]>[] = [
    { id: "no", header: "订单编号", cell: (o) => o.order_no },
    { id: "customer", header: "客户", cell: (o) => o.customer?.name ?? "-" },
    { id: "amount", header: "金额", cell: (o) => formatCurrency(o.total_rent_amount), className: "text-right tabular-nums" },
    { id: "status", header: "状态", cell: (o) => <Badge variant={o.order_status === "OVERDUE" ? "danger" : o.order_status === "IN_PROGRESS" ? "success" : "default"}>{ORDER_STATUS[o.order_status] ?? o.order_status}</Badge> },
    { id: "date", header: "创建日期", cell: (o) => formatDate(o.created_at), hideOnMobile: true },
  ];

  return (
    <DashboardPage title="业务报表" subtitle="经营数据概览">
      <StatsGrid>
        <StatCard icon={FileText} label="订单总数" value={totalOrders ?? 0} color="blue" />
        <StatCard icon={TrendingUp} label="合同总数" value={totalContracts ?? 0} color="emerald" />
        <StatCard icon={Users} label="活跃客户" value={activeCustomers ?? 0} color="indigo" />
        <StatCard icon={DollarSign} label="累计收款" color="amber">
          <span className="text-lg font-bold">{formatCurrency(totalRevenue)}</span>
        </StatCard>
        <StatCard icon={DollarSign} label="本月收款" color="emerald">
          <span className="text-lg font-bold">{formatCurrency(monthlyRevenue)}</span>
        </StatCard>
        <StatCard icon={ShoppingCart} label="本月新订单" value={monthlyOrderData.length} color="purple" />
      </StatsGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Order Status Distribution */}
        <Card>
          <CardHeader><CardTitle>订单状态分布</CardTitle></CardHeader>
          <div className="px-4 md:px-6 pb-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(ORDER_STATUS).map(([key, label]) => {
                const count = statusDist[key] || 0;
                return (
                  <div key={key} className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-700">
                    <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{count}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Top Customers */}
        <Card>
          <CardHeader><CardTitle>TOP 客户 (按订单金额)</CardTitle></CardHeader>
          <div className="px-4 md:px-6 pb-4">
            {topCustomerData.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">暂无数据</p>
            ) : (
              <div className="space-y-2">
                {topCustomerData.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 p-2.5 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        i < 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}>{i + 1}</span>
                      <span className="text-sm font-medium">{item.customer?.name ?? "-"}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(item.total_rent_amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly Orders */}
      <Card>
        <CardHeader><CardTitle>本月订单</CardTitle></CardHeader>
        <div className="px-4 md:px-6 pb-4">
          <DataTable
            columns={orderCols}
            data={monthlyOrderData}
            keyExtractor={(o) => o.id}
            rowHref={(o) => `/sales/orders/${o.id}`}
            emptyMessage="本月暂无订单"
          />
        </div>
      </Card>
    </DashboardPage>
  );
}
