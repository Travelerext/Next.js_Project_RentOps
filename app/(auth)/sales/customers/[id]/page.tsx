import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { CREDIT_LEVELS, RISK_LEVELS, RECEIVABLE_STATUS } from "@/lib/constants";
import Link from "next/link";
import { LockCustomerButton } from "./lock-button";
import { DeleteCustomerButton } from "./delete-button";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { Edit, ExternalLink } from "lucide-react";

// ─── Badge variant helpers ──────────────────────────────────────────────

const creditVariant = (level: string): "success" | "warning" | "info" | "danger" | "default" => {
  switch (level) {
    case "S": return "success";
    case "A": return "success";
    case "B": return "info";
    case "C": return "warning";
    case "D": return "danger";
    default: return "default";
  }
};

const riskVariant = (level: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (level) {
    case "LOW": return "success";
    case "MEDIUM": return "warning";
    case "HIGH": return "danger";
    case "CRITICAL": return "danger";
    default: return "default";
  }
};

const receivableVariant = (status: string): "success" | "warning" | "info" | "danger" | "default" => {
  switch (status) {
    case "PAID": return "success";
    case "UNPAID": return "warning";
    case "PARTIAL": return "info";
    case "OVERDUE": return "danger";
    case "BAD_DEBT": return "danger";
    default: return "default";
  }
};

const customerTypeLabel = (type: string): string => {
  switch (type) {
    case "ENTERPRISE": return "企业";
    case "INDIVIDUAL": return "个人";
    case "GOVERNMENT": return "政府";
    default: return type;
  }
};

// ─── Column definitions ────────────────────────────────────────────────

const contactColumns: Column<Record<string, unknown>>[] = [
  { id: "name", header: "姓名", cell: (c) => c.name as string },
  { id: "phone", header: "电话", cell: (c) => (c.phone as string) ?? "-" },
  { id: "position", header: "职位", cell: (c) => (c.position as string) ?? "-" },
  { id: "is_primary", header: "默认", cell: (c) => c.is_primary ? <Badge variant="success">是</Badge> : "否" },
  { id: "remark", header: "备注", cell: (c) => (c.remark as string) ?? "-", hideOnMobile: true },
];

const creditColumns: Column<Record<string, unknown>>[] = [
  { id: "occurred_at", header: "发生时间", cell: (r) => formatDate(r.occurred_at as string) },
  {
    id: "risk_type",
    header: "风险类型",
    cell: (r) => <Badge variant={riskVariant(r.risk_type as string)}>{r.risk_type as string}</Badge>,
  },
  {
    id: "credit_level_before",
    header: "变更前",
    cell: (r) => (r.credit_level_before ? (CREDIT_LEVELS[r.credit_level_before as string] ?? String(r.credit_level_before)) : "-"),
  },
  {
    id: "credit_level_after",
    header: "变更后",
    cell: (r) => (r.credit_level_after ? (CREDIT_LEVELS[r.credit_level_after as string] ?? String(r.credit_level_after)) : "-"),
  },
  {
    id: "risk_description",
    header: "描述",
    cell: (r) => (r.risk_description as string) ?? "-",
    className: "max-w-xs truncate",
  },
  {
    id: "handling_result",
    header: "处理结果",
    cell: (r) => (r.handling_result as string) ?? "-",
    hideOnMobile: true,
  },
];

const receivableColumns: Column<Record<string, unknown>>[] = [
  { id: "receivable_no", header: "应收编号", cell: (r) => r.receivable_no as string },
  {
    id: "amount",
    header: "金额",
    cell: (r) => <span className="tabular-nums">{formatCurrency(r.amount as string)}</span>,
  },
  {
    id: "paid_amount",
    header: "已付",
    cell: (r) => <span className="tabular-nums">{formatCurrency(r.paid_amount as string)}</span>,
  },
  {
    id: "unpaid_amount",
    header: "未付",
    cell: (r) => <span className="tabular-nums text-red-600 font-medium">{formatCurrency(r.unpaid_amount as string)}</span>,
  },
  { id: "due_date", header: "到期日", cell: (r) => formatDate(r.due_date as string) },
  {
    id: "overdue_days",
    header: "逾期",
    cell: (r) => {
      const days = r.overdue_days as number;
      return days > 0 ? <span className="text-red-600 font-medium">{days}天</span> : <span className="text-zinc-400">-</span>;
    },
  },
  {
    id: "status",
    header: "状态",
    cell: (r) => <Badge variant={receivableVariant(r.status as string)}>{RECEIVABLE_STATUS[r.status as string] ?? String(r.status)}</Badge>,
  },
];

const orderColumns: Column<Record<string, unknown>>[] = [
  {
    id: "no",
    header: "订单编号",
    cell: (o) => (
      <Link href={`/sales/orders/${o.id}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
        {o.order_no as string}
      </Link>
    ),
  },
  {
    id: "amount",
    header: "金额",
    cell: (o) => <span className="tabular-nums">{formatCurrency(o.total_rent_amount as string)}</span>,
  },
  {
    id: "status",
    header: "状态",
    cell: (o) => <Badge variant={(o.order_status as string) === "OVERDUE" ? "danger" : "default"}>{(o.order_status as string)}</Badge>,
  },
  {
    id: "created",
    header: "创建时间",
    cell: (o) => <span className="text-zinc-500">{formatDate(o.created_at as string)}</span>,
  },
];

// ═══════════════════════════════════════════════════════════════════════

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Check if current user is finance (hide edit actions)
  const { data: { user } } = await supabase.auth.getUser();
  let isFinance = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles")
      .select("primary_role").eq("supabase_user_id", user.id).maybeSingle();
    isFinance = profile?.primary_role === "FINANCE" || profile?.primary_role === "FINANCE_MANAGER";
  }

  const [
    { data: customer },
    { data: contacts },
    { data: creditRecords },
    { data: receivables },
    { data: orders },
  ] = await Promise.all([
    supabase.from("customer").select("*").eq("id", id).single(),
    supabase
      .from("customer_contact")
      .select("*")
      .eq("customer_id", id)
      .order("is_primary", { ascending: false }),
    supabase
      .from("customer_credit_record")
      .select("*")
      .eq("customer_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("receivable")
      .select("*")
      .eq("customer_id", id)
      .in("status", ["UNPAID", "PARTIAL", "OVERDUE"])
      .order("due_date", { ascending: true }),
    supabase
      .from("rental_order")
      .select("id, order_no, order_status, total_rent_amount, created_at")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!customer) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">客户不存在</p>
          <Link href="/sales/customers" className="text-blue-600 hover:underline">
            返回列表
          </Link>
        </div>
      </DirectionalTransition>
    );
  }

  // ── Computed values ──────────────────────────────────────────────

  const totalUnsettled = (receivables ?? []).reduce(
    (sum, r) => sum + parseFloat((r.unpaid_amount as string) || "0"),
    0,
  );
  const maxOverdueDays = (receivables ?? []).reduce(
    (max, r) => Math.max(max, (r.overdue_days as number) || 0),
    0,
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={customer.name as string}
          subtitle={`编号: ${customer.customer_no}`}
          backUrl="_back"
          status={
            customer.lock_ordering ? (
              <Badge variant="danger" pulse>
                已锁单
              </Badge>
            ) : customer.is_blacklisted ? (
              <Badge variant="danger">黑名单</Badge>
            ) : undefined
          }
          actions={isFinance ? undefined : (
            <>
              <Link href={`/sales/customers/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4" />
                  编辑
                </Button>
              </Link>
              <Link href={`/sales/orders/new?customerId=${id}`}>
                <Button variant="primary" size="sm">
                  <ExternalLink className="h-4 w-4" />
                  快速开单
                </Button>
              </Link>
              <LockCustomerButton
                customerId={customer.id as string}
                isLocked={customer.lock_ordering as boolean}
              />
              <DeleteCustomerButton customerId={customer.id as string} />
            </>
          )}
        />

        {/* ── Credit & Risk Summary ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>信用与风险</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-zinc-500">信用等级</p>
              <Badge className="mt-1" variant={creditVariant(customer.credit_level as string)}>
                {CREDIT_LEVELS[customer.credit_level as string] ?? String(customer.credit_level)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-zinc-500">风险等级</p>
              <Badge className="mt-1" variant={riskVariant(customer.risk_level as string)}>
                {RISK_LEVELS[customer.risk_level as string] ?? String(customer.risk_level)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-zinc-500">黑名单</p>
              <p className="text-lg font-semibold mt-1">
                {customer.is_blacklisted ? (
                  <Badge variant="danger">是</Badge>
                ) : (
                  <span className="text-zinc-500">否</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">锁单状态</p>
              <p className="text-lg font-semibold mt-1">
                {customer.lock_ordering ? (
                  <Badge variant="danger">已锁单</Badge>
                ) : (
                  <span className="text-green-600 font-medium">正常</span>
                )}
              </p>
            </div>
          </div>
        </Card>

        {/* ── Financial Summary ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-zinc-500">信用额度</p>
            <p className="text-lg font-semibold mt-1">
              {formatCurrency(customer.credit_limit as string)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-zinc-500">未结应收</p>
            <p className="text-lg font-semibold mt-1 text-red-600">
              {formatCurrency(totalUnsettled)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-zinc-500">最长逾期</p>
            <p className="text-lg font-semibold mt-1">
              {maxOverdueDays > 0 ? `${maxOverdueDays}天` : "无逾期"}
            </p>
          </Card>
        </div>

        {/* ── Basic Info ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <InfoGrid
            items={[
              { label: "客户类型", value: customerTypeLabel(customer.customer_type as string) },
              { label: "简称", value: (customer.short_name as string) ?? "-" },
              { label: "联系人", value: (customer.contact_name as string) ?? "-" },
              { label: "联系电话", value: (customer.contact_phone as string) ?? "-" },
              { label: "税号", value: (customer.tax_no as string) ?? "-" },
              { label: "发票抬头", value: (customer.invoice_title as string) ?? "-" },
              { label: "发票地址电话", value: (customer.invoice_address_phone as string) ?? "-" },
              { label: "发票银行账户", value: (customer.invoice_bank_account as string) ?? "-" },
              {
                label: "月结",
                value: customer.is_monthly_settlement
                  ? `是（${(customer.monthly_settlement_cycle as string) ?? "-"}天）`
                  : "否",
              },
              { label: "锁单原因", value: (customer.lock_reason as string) ?? "-" },
              { label: "创建时间", value: formatDate(customer.created_at as string) },
              { label: "备注", value: (customer.remark as string) ?? "-" },
            ]}
          />
        </Card>

        {/* ── Contacts ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>联系人</CardTitle>
          </CardHeader>
          <DataTable
            columns={contactColumns}
            data={(contacts ?? []) as Record<string, unknown>[]}
            keyExtractor={(c) => c.id as string}
            emptyMessage="暂无联系人"
          />
        </Card>

        {/* ── Unsettled Receivables ──────────────────────────────── */}
        {receivables && receivables.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>未结应收款</CardTitle>
            </CardHeader>
            <DataTable
              columns={receivableColumns}
              data={receivables as Record<string, unknown>[]}
              keyExtractor={(r) => r.id as string}
              emptyMessage="暂无未结应收款"
            />
          </Card>
        )}

        {/* ── Credit History ──────────────────────────────────────── */}
        {creditRecords && creditRecords.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>信用记录</CardTitle>
            </CardHeader>
            <DataTable
              columns={creditColumns}
              data={creditRecords as Record<string, unknown>[]}
              keyExtractor={(r) => r.id as string}
              emptyMessage="暂无信用记录"
            />
          </Card>
        )}

        {/* ── Recent Orders ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>最近订单</CardTitle>
          </CardHeader>
          <DataTable
            columns={orderColumns}
            data={(orders ?? []) as Record<string, unknown>[]}
            keyExtractor={(o) => o.id as string}
            emptyMessage="暂无订单"
          />
        </Card>
      </div>
    </DirectionalTransition>
  );
}
