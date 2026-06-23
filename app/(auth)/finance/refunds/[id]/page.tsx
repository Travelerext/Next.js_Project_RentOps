import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import { ApproveRefundButton, RejectRefundButton, ExecuteRefundButton } from "../refund-actions";
import { FileText, CreditCard, ArrowDownToLine } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", REFUNDED: "已退款",
};
const STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  PENDING_APPROVAL: "warning", APPROVED: "info", REJECTED: "danger", REFUNDED: "success",
};

export default async function RefundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("refund_record")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no), deposit:deposit_id(*)")
    .eq("id", id)
    .single();
  if (!raw) notFound();

  const refund = raw as Record<string, unknown>;
  const customer = refund.customer as { name: string } | null;
  const order = refund.order as { order_no: string } | null;
  const contract = refund.contract as { contract_no: string } | null;
  const deposit = refund.deposit as Record<string, unknown> | null;
  const status = refund.refund_status as string;

  // Approval history
  const { data: approvals } = await supabase
    .from("approval_request")
    .select("*, applicant:applicant_id(display_name)")
    .eq("business_type", "REFUND")
    .eq("business_id", id)
    .order("created_at", { ascending: false });

  const approvalColumns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "编号", cell: (a) => <span className="font-mono text-xs">{a.approval_no as string}</span> },
    { id: "applicant", header: "申请人", cell: (a) => ((a.applicant as { display_name?: string } | null)?.display_name ?? "-") },
    { id: "status", header: "状态", cell: (a) => {
      const s = a.status as string;
      return <Badge variant={s === "APPROVED" ? "success" : s === "REJECTED" ? "danger" : "warning"}>{s}</Badge>;
    }},
    { id: "time", header: "时间", cell: (a) => formatDateTime(a.created_at as string) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader backUrl="_back"
        title="退款详情"
        subtitle={`${refund.refund_no} · ${customer?.name ?? "-"}`}
        
        status={<Badge variant={STATUS_VARIANTS[status] ?? "default"}>{STATUS_LABELS[status] ?? status}</Badge>}
        actions={
          <div className="flex gap-2">
            {status === "PENDING_APPROVAL" && <><ApproveRefundButton refundId={id} /><RejectRefundButton refundId={id} /></>}
            {status === "APPROVED" && <ExecuteRefundButton refundId={id} />}
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />退款信息</CardTitle></CardHeader>
        <InfoGrid items={[
          { label: "退款编号", value: refund.refund_no as string },
          { label: "客户", value: customer ? <Link href={`/sales/customers/${refund.customer_id}`} className="text-blue-600 hover:underline">{customer.name}</Link> : "-" },
          { label: "退款金额", value: <span className="font-semibold">{formatCurrency(refund.refund_amount)}</span> },
          { label: "退款方式", value: refund.refund_method as string },
          { label: "退款原因", value: (refund.reason as string) ?? "-" },
          { label: "订单", value: order ? <Link href={`/sales/orders/${refund.order_id}`} className="text-blue-600 hover:underline">{order.order_no}</Link> : "-" },
          { label: "合同", value: contract ? <Link href={`/sales/contracts/${refund.contract_id}`} className="text-blue-600 hover:underline">{contract.contract_no}</Link> : "-" },
        ]} />
      </Card>

      {deposit && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" />押金信息</CardTitle></CardHeader>
          <InfoGrid items={[
            { label: "押金编号", value: deposit.deposit_no as string },
            { label: "押金金额", value: formatCurrency(deposit.amount) },
            { label: "已付", value: formatCurrency(deposit.paid_amount) },
            { label: "已抵扣", value: formatCurrency(deposit.deducted_amount) },
            { label: "已退款", value: formatCurrency(deposit.refunded_amount) },
            { label: "可用余额", value: <span className="font-semibold">{formatCurrency(deposit.available_amount)}</span> },
          ]} />
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />审批记录 ({(approvals ?? []).length})</CardTitle></CardHeader>
        <DataTable columns={approvalColumns} data={(approvals ?? []) as Record<string, unknown>[]} keyExtractor={(a) => a.id as string} emptyMessage="暂无审批记录" />
      </Card>
    </div>
  );
}
