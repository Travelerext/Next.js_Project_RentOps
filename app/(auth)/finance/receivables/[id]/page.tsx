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

export default async function ReceivableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("receivable")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no)")
    .eq("id", id)
    .single();
  if (!raw) notFound();

  const receivable = raw as Record<string, unknown>;
  const customer = receivable.customer as { name: string } | null;
  const order = receivable.order as { order_no: string } | null;
  const contract = receivable.contract as { contract_no: string } | null;

  // Payment history
  const { data: payments } = await supabase
    .from("payment_record")
    .select("*")
    .eq("receivable_id", id)
    .order("paid_at", { ascending: false });

  const paymentColumns: Column<Record<string, unknown>>[] = [
    { id: "payment_no", header: "流水号", cell: (p) => <span className="font-mono text-xs">{p.payment_no as string}</span> },
    { id: "amount", header: "金额", cell: (p) => <span className="tabular-nums font-medium">{formatCurrency(p.amount)}</span> },
    { id: "method", header: "方式", cell: (p) => <span className="text-xs">{p.payment_method as string}</span> },
    { id: "payer", header: "付款人", cell: (p) => (p.payer_name as string) ?? "-" },
    { id: "paid_at", header: "到账时间", cell: (p) => formatDateTime(p.paid_at as string) },
  ];

  const unpaid = parseFloat((receivable.unpaid_amount as string) ?? "0");
  const canPay = ["UNPAID", "PARTIAL", "OVERDUE"].includes(receivable.status as string);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`应收详情`}
        subtitle={`${receivable.receivable_no} · ${customer?.name ?? "-"}`}
        backUrl="/finance/receivables"
        status={<Badge variant={STATUS_VARIANTS[receivable.status as string] ?? "default"}>{STATUS_LABELS[receivable.status as string] ?? String(receivable.status)}</Badge>}
        actions={canPay ? <ConfirmPaymentButton receivableId={id} receivableNo={receivable.receivable_no as string} unpaidAmount={String(unpaid)} /> : undefined}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />基本信息</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "应收编号", value: receivable.receivable_no as string },
          { label: "客户", value: customer?.name ?? "-" },
          { label: "类型", value: TYPE_LABELS[receivable.receivable_type as string] ?? String(receivable.receivable_type) },
          { label: "订单", value: order ? <Link href={`/sales/orders/${order.order_no ? receivable.order_id : ""}`} className="text-blue-600 hover:underline">{order.order_no}</Link> : "-" },
          { label: "合同", value: contract ? <Link href={`/sales/contracts/${contract.contract_no ? receivable.contract_id : ""}`} className="text-blue-600 hover:underline">{contract.contract_no}</Link> : "-" },
          { label: "到期日", value: (receivable.due_date as string) ? new Date(receivable.due_date as string).toLocaleDateString("zh-CN") : "-" },
          { label: "逾期天数", value: ((receivable.overdue_days as number) ?? 0) > 0 ? <span className="text-red-600 font-medium">{String(receivable.overdue_days)} 天</span> : "-" },
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
        <CardHeader><CardTitle>收款记录 ({(payments ?? []).length})</CardTitle></CardHeader>
        <DataTable columns={paymentColumns} data={(payments ?? []) as Record<string, unknown>[]} keyExtractor={(p) => p.id as string} emptyMessage="暂无收款记录" />
      </Card>
    </div>
  );
}
