import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  FileText, DollarSign, Package, Receipt, CircleDollarSign,
  UserRound, FileSearch, Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CustomerDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  let customerId: string | null = null;

  if (profile) {
    // Find the customer linked to this user via owner_user_id
    const { data: customer } = await supabase
      .from("customer")
      .select("id, name")
      .eq("owner_user_id", profile.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (customer) {
      customerId = customer.id;
    }
  }

  const activeOrderStatuses = ["IN_PROGRESS", "PARTIAL_RETURN"];
  const unpaidStatuses = ["UNPAID", "PARTIAL", "OVERDUE"];

  const [
    { count: contractCount },
    { count: unpaidBillCount },
    { data: depositRecords },
    { count: activeOrderCount },
  ] = customerId
    ? await Promise.all([
        supabase
          .from("rental_contract")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .is("deleted_at", null),
        supabase
          .from("receivable")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .in("status", unpaidStatuses),
        supabase
          .from("deposit_record")
          .select("available_amount")
          .eq("customer_id", customerId)
          .neq("deposit_status", "REFUNDED"),
        supabase
          .from("rental_order")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", customerId)
          .in("order_status", activeOrderStatuses)
          .is("deleted_at", null),
      ])
    : [
        { count: 0 },
        { count: 0 },
        { data: [] },
        { count: 0 },
      ];

  const depositBalance = (depositRecords ?? []).reduce(
    (sum, d) => sum + parseFloat(d.available_amount as string ?? "0"), 0
  );

  const hasCustomer = customerId !== null;

  return (
    <DashboardPage
      title="客户自助面板"
      subtitle={hasCustomer ? "查看您的合同、账单和设备信息" : "请先关联客户账号"}
    >
      <StatsGrid>
        <StatCard icon={FileText} label="我的合同" value={contractCount ?? 0} color="blue" href="/customer/contracts" />
        <StatCard icon={Receipt} label="待付账单" value={unpaidBillCount ?? 0} color="red" href="/customer/bills" />
        <StatCard icon={CircleDollarSign} label="押金余额" color="emerald">
          <span className="text-lg font-bold">{formatCurrency(depositBalance)}</span>
        </StatCard>
        <StatCard icon={Package} label="进行中订单" value={activeOrderCount ?? 0} color="indigo" href="/customer/orders" />
      </StatsGrid>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/customer/contracts">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>我的合同</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">查看正在履行的合同和设备信息</p>
          </Card>
        </Link>
        <Link href="/customer/bills">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle>账单查询</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">查看租金账单、押金和付款记录</p>
          </Card>
        </Link>
        <Link href="/customer/orders">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                  <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle>进行中订单</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">查看当前进行中的租赁订单</p>
          </Card>
        </Link>
        <Link href="/customer/profile">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <UserRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle>客户资料</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">绑定客户档案并维护开票资料</p>
          </Card>
        </Link>
        <Link href="/customer/repairs">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Wrench className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>我的报修</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">提交设备报修并跟进处理进度</p>
          </Card>
        </Link>
        <Link href="/customer/invoices">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <FileSearch className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle>发票管理</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">查看和申请电子发票</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}
