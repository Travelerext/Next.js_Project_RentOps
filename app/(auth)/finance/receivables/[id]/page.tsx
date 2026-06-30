import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import { ConfirmPaymentButton } from "../confirm-payment-button";
import { FileText, CreditCard } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付", PARTIAL: "部分已付", PAID: "已付清",
  OVERDUE: "已逾期", BAD_DEBT: "坏账", WAIVED: "已豁免",
};
const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  UNPAID: "warning", PARTIAL: "info", PAID: "success",
  OVERDUE: "danger", BAD_DEBT: "danger", WAIVED: "default",
};
const TYPE_LABELS: Record<string, string> = {
  RENT: "租金", DEPOSIT: "押金", DAMAGE: "损坏赔偿",
  MISSING_PARTS: "配件丢失", CLEANING: "清洁费", REPAIR: "维修费",
  LATE_FEE: "滞纳金", PENALTY: "违约金", OTHER: "其他",
};

type CurrencyAmount = string | number;

type ReceivableDetail = {
  id: string;
  receivable_no: string;
  customer_id: string;
  order_id: string | null;
  contract_id: string | null;
  receivable_type: string;
  amount: CurrencyAmount;
  paid_amount: CurrencyAmount;
  unpaid_amount: CurrencyAmount;
  due_date: string | null;
  overdue_days: number | null;
  status: string;
  customer: { name: string } | null;
  order: { order_no: string } | null;
  contract: { contract_no: string } | null;
};

type PaymentRow = {
  id: string;
  payment_no: string;
  amount: CurrencyAmount;
  payment_method: string;
  payer_name: string | null;
  paid_at: string;
};

export default async function ReceivableDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ customerId?: string; status?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const backQuery = new URLSearchParams();
  if (sp.customerId) backQuery.set("customerId", sp.customerId);
  if (sp.status) backQuery.set("status", sp.status);
  const backUrl = `/finance/receivables${backQuery.toString() ? `?${backQuery.toString()}` : ""}`;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("receivable")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no)")
    .eq("id", id)
    .single();
  if (!raw) notFound();

  const receivable = raw as unknown as ReceivableDetail;
  const customer = receivable.customer;
  const order = receivable.order;
  const contract = receivable.contract;

  // Payment history
  const { data: payments } = await supabase
    .from("payment_record")
    .select("*")
    .eq("receivable_id", id)
    .order("paid_at", { ascending: false });

  const paymentRows = (payments ?? []) as unknown as PaymentRow[];

  const paymentColumns: Column<PaymentRow>[] = [
    { id: "payment_no", header: "流水号", cell: (p) => <span className="font-mono text-xs">{p.payment_no}</span> },
    { id: "amount", header: "金额", cell: (p) => <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span> },
    { id: "method", header: "方式", cell: (p) => <span className="text-xs">{p.payment_method}</span> },
    { id: "payer", header: "付款人", cell: (p) => p.payer_name ?? "-" },
    { id: "paid_at", header: "到账时间", cell: (p) => formatDateTime(p.paid_at) },
  ];

  const unpaid = parseFloat(String(receivable.unpaid_amount ?? "0"));
  const canPay = ["UNPAID", "PARTIAL", "OVERDUE"].includes(receivable.status);

  return (
    <div className="space-y-6">
      <PageHeader backUrl={backUrl}
        title={`应收详情`}
        subtitle={`${receivable.receivable_no} · ${customer?.name ?? "-"}`}
        status={<Badge variant={STATUS_VARIANTS[receivable.status] ?? "default"}>{STATUS_LABELS[receivable.status] ?? receivable.status}</Badge>}
        actions={canPay ? <ConfirmPaymentButton receivableId={id} receivableNo={receivable.receivable_no} unpaidAmount={String(unpaid)} /> : undefined}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />基本信息</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "应收编号", value: receivable.receivable_no },
          { label: "客户", value: customer ? <Link href={`/sales/customers/${receivable.customer_id}?from=finance`} className="text-blue-600 hover:underline">{customer.name}</Link> : "-" },
          { label: "类型", value: TYPE_LABELS[receivable.receivable_type] ?? receivable.receivable_type },
          { label: "订单", value: order ? <Link href={`/sales/orders/${receivable.order_id}?from=finance`} className="text-blue-600 hover:underline">{order.order_no}</Link> : "-" },
          { label: "合同", value: contract ? <Link href={`/sales/contracts/${receivable.contract_id}?from=finance`} className="text-blue-600 hover:underline">{contract.contract_no}</Link> : "-" },
          { label: "到期日", value: receivable.due_date ? new Date(receivable.due_date).toLocaleDateString("zh-CN") : "-" },
          { label: "逾期天数", value: (receivable.overdue_days ?? 0) > 0 ? <span className="text-red-600 font-medium">{String(receivable.overdue_days)} 天</span> : "-" },
        ]} />
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />金额信息</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "应收金额", value: <span className="font-semibold">{formatCurrency(receivable.amount)}</span> },
          { label: "已收金额", value: <span className="text-emerald-600 font-semibold">{formatCurrency(receivable.paid_amount)}</span> },
          { label: "未收金额", value: <span className={unpaid > 0 ? "text-red-600 font-semibold" : ""}>{formatCurrency(receivable.unpaid_amount)}</span> },
        ]} />
      </Card>

      <Card>
        <CardHeader><CardTitle>收款记录 ({paymentRows.length})</CardTitle></CardHeader>
        <DataTable columns={paymentColumns} data={paymentRows} keyExtractor={(p) => p.id} emptyMessage="暂无收款记录" />
      </Card>
    </div>
  );
}
