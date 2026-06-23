import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Banknote, FileText, ArrowDownToLine } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付", PAID: "已付",
  PARTIALLY_DEDUCTED: "部分抵扣", FULLY_DEDUCTED: "全额抵扣",
  REFUNDING: "退款中", REFUNDED: "已退款", COMPLETED: "已完成",
};
const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  PENDING_PAYMENT: "warning", PAID: "success",
  PARTIALLY_DEDUCTED: "info", FULLY_DEDUCTED: "default",
  REFUNDING: "warning", REFUNDED: "success", COMPLETED: "default",
};

export default async function DepositDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("deposit_record")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no)")
    .eq("id", id)
    .single();
  if (!raw) notFound();

  const deposit = raw as Record<string, unknown>;
  const customer = deposit.customer as { name: string } | null;
  const order = deposit.order as { order_no: string } | null;
  const contract = deposit.contract as { contract_no: string } | null;
  const status = deposit.deposit_status as string;

  // Related refunds
  const { data: refunds } = await supabase
    .from("refund_record")
    .select("*")
    .eq("deposit_id", id)
    .order("created_at", { ascending: false });

  const refundColumns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "退款编号", cell: (r) => <Link href={`/finance/refunds/${r.id}`} className="font-mono text-xs text-blue-600 hover:underline">{r.refund_no as string}</Link> },
    { id: "amount", header: "退款金额", cell: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.refund_amount)}</span> },
    { id: "status", header: "状态", cell: (r) => {
      const s = r.refund_status as string;
      const labels: Record<string, string> = { PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", REFUNDED: "已退款" };
      const variants: Record<string, "success" | "warning" | "danger" | "info"> = { PENDING_APPROVAL: "warning", APPROVED: "info", REJECTED: "danger", REFUNDED: "success" };
      return <Badge variant={variants[s] ?? "default"}>{labels[s] ?? s}</Badge>;
    }},
    { id: "created", header: "创建时间", cell: (r) => formatDate(r.created_at as string) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="押金详情"
        subtitle={`${deposit.deposit_no} · ${customer?.name ?? "-"}`}
        backUrl="/finance/deposits"
        status={<Badge variant={STATUS_VARIANTS[status] ?? "default"}>{STATUS_LABELS[status] ?? status}</Badge>}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4" />押金信息</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "押金编号", value: deposit.deposit_no as string },
          { label: "客户", value: customer ? <Link href={`/sales/customers/${deposit.customer_id}`} className="text-blue-600 hover:underline">{customer.name}</Link> : "-" },
          { label: "订单", value: order ? <Link href={`/sales/orders/${deposit.order_id}`} className="text-blue-600 hover:underline">{order.order_no}</Link> : "-" },
          { label: "合同", value: contract ? <Link href={`/sales/contracts/${deposit.contract_id}`} className="text-blue-600 hover:underline">{contract.contract_no}</Link> : "-" },
          { label: "创建时间", value: formatDate(deposit.created_at as string) },
        ]} />
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />金额明细</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "押金金额", value: <span className="font-semibold">{formatCurrency(deposit.amount)}</span> },
          { label: "已付金额", value: <span className="text-emerald-600">{formatCurrency(deposit.paid_amount)}</span> },
          { label: "已抵扣", value: formatCurrency(deposit.deducted_amount) },
          { label: "已退款", value: formatCurrency(deposit.refunded_amount) },
          { label: "可用余额", value: <span className="font-semibold text-lg">{formatCurrency(deposit.available_amount)}</span> },
        ]} />
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" />退款记录 ({(refunds ?? []).length})</CardTitle></CardHeader>
        <DataTable columns={refundColumns} data={(refunds ?? []) as Record<string, unknown>[]} keyExtractor={(r) => r.id as string} emptyMessage="暂无退款记录" />
      </Card>
    </div>
  );
}
