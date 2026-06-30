import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  FileText,
  Users,
  DollarSign,
  Banknote,
  AlertTriangle,
  ArrowRight,
  Send,
  FileCheck,
  AlertCircle,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";

// ─── Status helpers ───────────────────────────────────────────────────────

const STATEMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  CONFIRMED: "已确认",
  DISPUTED: "有争议",
};

const STATEMENT_STATUS_VARIANTS: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  DRAFT: "default",
  SENT: "info",
  CONFIRMED: "success",
  DISPUTED: "danger",
};

const STATEMENT_STATUS_ICONS: Record<string, React.ReactNode> = {
  DRAFT: <FileText className="h-3.5 w-3.5" />,
  SENT: <Send className="h-3.5 w-3.5" />,
  CONFIRMED: <FileCheck className="h-3.5 w-3.5" />,
  DISPUTED: <AlertCircle className="h-3.5 w-3.5" />,
};

// ─── Types ────────────────────────────────────────────────────────────────

interface CustomerFinanceSummary {
  customer_id: string;
  customer_name: string;
  total_receivable: number;
  total_paid: number;
  total_unpaid: number;
  deposit_balance: number;
  receivable_count: number;
  has_overdue: boolean;
}

interface StatementRecord {
  id: string;
  statement_no: string;
  customer_id: string;
  period_start: string;
  period_end: string;
  total_receivable_amount: string;
  total_paid_amount: string;
  total_unpaid_amount: string;
  deposit_balance: string;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  customer: { name: string } | null;
}

// ─── Server action: generate statement ────────────────────────────────────

async function generateStatement(formData: FormData) {
  "use server";

  const customerId = formData.get("customerId") as string;
  const periodStart = formData.get("periodStart") as string;
  const periodEnd = formData.get("periodEnd") as string;

  if (!customerId || !periodStart || !periodEnd) {
    throw new Error("Missing required fields");
  }

  const supabase = await createClient();

  // Fetch receivable totals for this customer in the period
  const { data: receivables } = await supabase
    .from("receivable")
    .select("amount, paid_amount, unpaid_amount")
    .eq("customer_id", customerId)
    .gte("due_date", periodStart)
    .lte("due_date", periodEnd);

  const totalReceivableAmount =
    (receivables ?? []).reduce(
      (s, r) => s + parseFloat(r.amount as string),
      0,
    );
  const totalPaidAmount =
    (receivables ?? []).reduce(
      (s, r) => s + parseFloat(r.paid_amount as string),
      0,
    );
  const totalUnpaidAmount =
    (receivables ?? []).reduce(
      (s, r) => s + parseFloat(r.unpaid_amount as string),
      0,
    );

  // Fetch deposit balance
  const { data: deposits } = await supabase
    .from("deposit_record")
    .select("available_amount")
    .eq("customer_id", customerId)
    .in("deposit_status", ["HELD", "PENDING_PAYMENT", "PARTIAL_REFUND"]);

  const depositBalance =
    (deposits ?? []).reduce(
      (s, d) => s + parseFloat((d.available_amount ?? "0") as string),
      0,
    );

  // Generate statement number
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { count } = await supabase
    .from("reconciliation_statement")
    .select("*", { count: "exact", head: true })
    .gte("created_at", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const seq = ((count ?? 0) + 1).toString().padStart(4, "0");
  const statementNo = `RCN-${dateStr}-${seq}`;

  // Create the statement record
  const { error } = await supabase.from("reconciliation_statement").insert({
    statement_no: statementNo,
    customer_id: customerId,
    period_start: periodStart,
    period_end: periodEnd,
    total_receivable_amount: totalReceivableAmount.toFixed(2),
    total_paid_amount: totalPaidAmount.toFixed(2),
    total_unpaid_amount: totalUnpaidAmount.toFixed(2),
    deposit_balance: depositBalance.toFixed(2),
    status: "DRAFT",
  });

  if (error) {
    throw new Error(`Failed to create statement: ${error.message}`);
  }

  revalidatePath("/finance/reconciliation");
}

// ═══════════════════════════════════════════════════════════════════════════

export default async function ReconciliationPage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  // ── Fetch all data in parallel ───────────────────────────────────────

  const [
    { data: existingStatements },
    { data: receivables },
    { data: paymentRecords },
    { data: depositRecords },
    { data: activeContracts },
  ] = await Promise.all([
    supabase
      .from("reconciliation_statement")
      .select("*, customer:customer_id(name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("receivable")
      .select("customer_id, amount, paid_amount, unpaid_amount, status, due_date")
      .order("customer_id"),
    supabase
      .from("payment_record")
      .select("customer_id, amount")
      .order("customer_id"),
    supabase
      .from("deposit_record")
      .select("customer_id, available_amount, amount, deposit_status")
      .in("deposit_status", ["HELD", "PENDING_PAYMENT", "PARTIAL_REFUND"]),
    supabase
      .from("contract")
      .select("customer_id")
      .in("contract_status", ["ACTIVE", "SIGNED"]),
  ]);

  // ── Build customer summary ───────────────────────────────────────────

  // Collect all unique customer IDs that have financial activity
  const customerSet = new Set<string>();

  const receivablesData = receivables ?? [];
  const paymentData = paymentRecords ?? [];
  const depositData = depositRecords ?? [];
  const contractData = activeContracts ?? [];

  for (const r of receivablesData) customerSet.add(r.customer_id as string);
  for (const p of paymentData) customerSet.add(p.customer_id as string);
  for (const d of depositData) customerSet.add(d.customer_id as string);
  for (const c of contractData) customerSet.add(c.customer_id as string);

  const customerIds = Array.from(customerSet);

  // Fetch customer names
  const { data: customers } = await supabase
    .from("customer")
    .select("id, name")
    .in("id", customerIds)
    .is("deleted_at", null);

  const customerNameMap = new Map<string, string>();
  for (const c of customers ?? []) {
    customerNameMap.set(c.id as string, c.name as string);
  }

  // Aggregate per-customer financial data
  const customerFinanceMap = new Map<
    string,
    CustomerFinanceSummary
  >();

  for (const id of customerIds) {
    const name = customerNameMap.get(id) ?? "未知客户";
    customerFinanceMap.set(id, {
      customer_id: id,
      customer_name: name,
      total_receivable: 0,
      total_paid: 0,
      total_unpaid: 0,
      deposit_balance: 0,
      receivable_count: 0,
      has_overdue: false,
    });
  }

  for (const r of receivablesData) {
    const id = r.customer_id as string;
    const summary = customerFinanceMap.get(id);
    if (!summary) continue;
    summary.total_receivable += parseFloat(r.amount as string) || 0;
    summary.total_paid += parseFloat(r.paid_amount as string) || 0;
    summary.total_unpaid += parseFloat(r.unpaid_amount as string) || 0;
    summary.receivable_count += 1;
    if (r.status === "OVERDUE") summary.has_overdue = true;
  }

  for (const d of depositData) {
    const id = d.customer_id as string;
    const summary = customerFinanceMap.get(id);
    if (!summary) continue;
    summary.deposit_balance +=
      parseFloat((d.available_amount ?? "0") as string) || 0;
  }

  const customerSummaries = Array.from(customerFinanceMap.values())
    .filter((c) => c.customer_name !== "未知客户")
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

  // ── Compute overall stats ─────────────────────────────────────────────

  const totalReceivableAll = customerSummaries.reduce(
    (s, c) => s + c.total_receivable,
    0,
  );
  const totalPaidAll = customerSummaries.reduce((s, c) => s + c.total_paid, 0);
  const totalDepositAll = customerSummaries.reduce(
    (s, c) => s + c.deposit_balance,
    0,
  );
  const overdueCustomers = customerSummaries.filter((c) => c.has_overdue).length;

  // ── Existing statements ────────────────────────────────────────────────

  const statements = (existingStatements ?? []) as StatementRecord[];

  const statementColumns: Column<Record<string, unknown>>[] = [
    {
      id: "statement_no",
      header: "对账单号",
      cell: (s) => (
        <span className="font-mono text-sm">{s.statement_no as string}</span>
      ),
    },
    {
      id: "customer",
      header: "客户",
      cell: (s) => {
        const customer = s.customer as unknown as { name: string } | null;
        return <span className="font-medium">{customer?.name ?? "-"}</span>;
      },
    },
    {
      id: "period",
      header: "期间",
      cell: (s) => (
        <span className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
          {formatDate(s.period_start as string)} ~ {formatDate(s.period_end as string)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "total_receivable",
      header: "应收合计",
      cell: (s) => (
        <span className="tabular-nums">{formatCurrency(s.total_receivable_amount as string)}</span>
      ),
      className: "tabular-nums",
    },
    {
      id: "total_paid",
      header: "已付合计",
      cell: (s) => (
        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(s.total_paid_amount as string)}
        </span>
      ),
      className: "tabular-nums",
    },
    {
      id: "total_unpaid",
      header: "未付合计",
      cell: (s) => {
        const unpaid = parseFloat(s.total_unpaid_amount as string);
        return (
          <span
            className={`tabular-nums font-medium ${
              unpaid > 0
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {formatCurrency(s.total_unpaid_amount as string)}
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      id: "deposit_balance",
      header: "押金余额",
      cell: (s) => (
        <span className="tabular-nums text-purple-600 dark:text-purple-400">
          {formatCurrency(s.deposit_balance as string)}
        </span>
      ),
      className: "tabular-nums",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "状态",
      cell: (s) => {
        const status = s.status as string;
        return (
          <Badge variant={STATEMENT_STATUS_VARIANTS[status] ?? "default"}>
            <span className="mr-1 inline-flex">
              {STATEMENT_STATUS_ICONS[status] ?? null}
            </span>
            {STATEMENT_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
    {
      id: "confirmed",
      header: "确认时间",
      cell: (s) =>
        s.confirmed_at ? formatDate(s.confirmed_at as string) : <span className="text-zinc-400">-</span>,
      hideOnMobile: true,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <DataPage
      title="客户对账单"
      subtitle={`本月 ${monthStart} ~ ${monthEnd} · ${customerSummaries.length} 位客户`}
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
      {/* ── Overview stats ───────────────────────────────────────────────── */}
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard
          icon={Users}
          label="对账客户数"
          value={customerSummaries.length}
          color="blue"
        />
        <StatCard
          icon={DollarSign}
          label="应收总额"
          value={formatCurrency(totalReceivableAll)}
          color="amber"
        />
        <StatCard
          icon={Banknote}
          label="已收金额"
          value={formatCurrency(totalPaidAll)}
          color="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="逾期客户"
          value={overdueCustomers}
          color={
            overdueCustomers > 0 ? "red" : "emerald"
          }
        />
      </StatsGrid>

      {/* ── Customer reconciliation cards ───────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
            客户对账概览
          </h2>
          <span className="text-sm text-zinc-400">
            {customerSummaries.length} 位客户
          </span>
        </div>

        {customerSummaries.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                暂无需要进行对账的客户
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                当存在应收账款、收款记录或有效合同时，客户将出现在此列表中
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customerSummaries.map((customer) => (
              <Card
                key={customer.customer_id}
                className={`relative transition-shadow hover:shadow-md ${
                  customer.has_overdue
                    ? "border-red-200 dark:border-red-800"
                    : ""
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        {customer.customer_name}
                      </CardTitle>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {customer.receivable_count} 笔应收
                        {customer.has_overdue && (
                          <Badge variant="danger" className="ml-2 text-[10px]">
                            有逾期
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-zinc-400">押金余额</span>
                      <span className="text-sm font-semibold tabular-nums text-purple-600 dark:text-purple-400">
                        {formatCurrency(customer.deposit_balance)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <div className="px-4 pb-3 md:px-6">
                  {/* Financial breakdown */}
                  <div className="mb-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">应收合计</span>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(customer.total_receivable)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 dark:text-zinc-400">已收金额</span>
                      <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(customer.total_paid)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-100 pt-1 dark:border-zinc-700">
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                        {customer.total_unpaid > 0 ? "未收金额" : "结清状态"}
                      </span>
                      <span
                        className={`tabular-nums font-semibold ${
                          customer.total_unpaid > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {customer.total_unpaid > 0
                          ? formatCurrency(customer.total_unpaid)
                          : "已结清"}
                      </span>
                    </div>
                  </div>

                  {/* Payment progress bar */}
                  {customer.total_receivable > 0 && (
                    <div className="mb-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                        <div
                          className={`h-full rounded-full transition-all ${
                            customer.total_unpaid > 0
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{
                            width: `${Math.min(
                              (customer.total_paid /
                                customer.total_receivable) *
                                100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
                        <span>收款进度</span>
                        <span className="tabular-nums">
                          {customer.total_receivable > 0
                            ? `${(
                                (customer.total_paid /
                                  customer.total_receivable) *
                                100
                              ).toFixed(0)}%`
                            : "-"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Generate statement form */}
                  <form action={generateStatement}>
                    <input
                      type="hidden"
                      name="customerId"
                      value={customer.customer_id}
                    />
                    <input
                      type="hidden"
                      name="periodStart"
                      value={monthStart}
                    />
                    <input
                      type="hidden"
                      name="periodEnd"
                      value={monthEnd}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="submit"
                      className="w-full"
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      生成对账单 ({monthStart.slice(5)}~{monthEnd.slice(5)})
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Existing statements ──────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-zinc-500" />
        <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
          对账单记录
        </h2>
        {statements.length > 0 && (
          <span className="text-sm text-zinc-400">
            {statements.length} 份
          </span>
        )}
      </div>

      {/* Status legend */}
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-500">
        {Object.entries(STATEMENT_STATUS_LABELS).map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <Badge variant={STATEMENT_STATUS_VARIANTS[key] ?? "default"}>
              {STATEMENT_STATUS_ICONS[key] ?? null}
              <span className="ml-0.5">{label}</span>
            </Badge>
          </span>
        ))}
      </div>

      <DataTable
        columns={statementColumns}
        data={statements as unknown as Record<string, unknown>[]}
        keyExtractor={(s) => s.id as string}
        emptyMessage="暂无对账单记录，请在上方为客户生成对账单"
      />

      {/* ── Period info footer ────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Calendar className="h-4 w-4" />
            当前对账周期
          </span>
          <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-200">
            {monthStart} ~ {monthEnd}
          </span>
          <span className="text-zinc-400">|</span>
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Users className="h-4 w-4" />
            对账客户
          </span>
          <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-200">
            {customerSummaries.length} 位
          </span>
          <span className="text-zinc-400">|</span>
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <FileText className="h-4 w-4" />
            已生成对账单
          </span>
          <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-200">
            {statements.length} 份
          </span>
          <span className="text-zinc-400">|</span>
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <DollarSign className="h-4 w-4" />
            押金总额
          </span>
          <span className="tabular-nums font-medium text-purple-600 dark:text-purple-400">
            {formatCurrency(totalDepositAll)}
          </span>
          {statements.filter((s) => s.status === "DISPUTED").length > 0 && (
            <>
              <span className="text-zinc-400">|</span>
              <span className="inline-flex items-center gap-1.5 text-red-500">
                <AlertCircle className="h-4 w-4" />
                有争议
              </span>
              <span className="tabular-nums font-medium text-red-600 dark:text-red-400">
                {statements.filter((s) => s.status === "DISPUTED").length} 份
              </span>
            </>
          )}
        </div>
      </div>
    </DataPage>
  );
}
