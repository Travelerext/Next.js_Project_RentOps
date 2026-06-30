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

type CurrencyAmount = string | number;

type DepositSnapshot = {
  deposit_no: string;
  amount: CurrencyAmount;
  paid_amount: CurrencyAmount;
  deducted_amount: CurrencyAmount;
  refunded_amount: CurrencyAmount;
  available_amount: CurrencyAmount;
};

type RefundDetail = {
  id: string;
  refund_no: string;
  customer_id: string;
  order_id: string | null;
  contract_id: string | null;
  refund_amount: CurrencyAmount;
  refund_method: string;
  refund_status: string;
  reason: string | null;
  customer: { name: string } | null;
  order: { order_no: string } | null;
  contract: { contract_no: string } | null;
  deposit: DepositSnapshot | null;
};

type ApprovalRow = {
  id: string;
  approval_no: string;
  applicant: { display_name?: string } | null;
  status: string;
  created_at: string;
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

  const refund = raw as unknown as RefundDetail;
  const customer = refund.customer;
  const order = refund.order;
  const contract = refund.contract;
  const deposit = refund.deposit;
  const status = refund.refund_status;

  // Approval history
  const { data: approvals } = await supabase
    .from("approval_request")
    .select("*, applicant:applicant_id(display_name)")
    .eq("business_type", "REFUND")
    .eq("business_id", id)
    .order("created_at", { ascending: false });

  const approvalRows = (approvals ?? []) as unknown as ApprovalRow[];

  const approvalColumns: Column<ApprovalRow>[] = [
    { id: "no", header: "编号", cell: (a) => <span className="font-mono text-xs">{a.approval_no}</span> },
    { id: "applicant", header: "申请人", cell: (a) => a.applicant?.display_name ?? "-" },
    { id: "status", header: "状态", cell: (a) => {
      const s = a.status;
      return <Badge variant={s === "APPROVED" ? "success" : s === "REJECTED" ? "danger" : "warning"}>{s}</Badge>;
    }},
    { id: "time", header: "时间", cell: (a) => formatDateTime(a.created_at) },
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
          { label: "退款编号", value: refund.refund_no },
          { label: "客户", value: customer ? <Link href={`/sales/customers/${refund.customer_id}`} className="text-blue-600 hover:underline">{customer.name}</Link> : "-" },
          { label: "退款金额", value: <span className="font-semibold">{formatCurrency(refund.refund_amount)}</span> },
          { label: "退款方式", value: refund.refund_method },
          { label: "退款原因", value: refund.reason ?? "-" },
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
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />审批记录 ({approvalRows.length})</CardTitle></CardHeader>
        <DataTable columns={approvalColumns} data={approvalRows} keyExtractor={(a) => a.id} emptyMessage="暂无审批记录" />
      </Card>
    </div>
  );
}
