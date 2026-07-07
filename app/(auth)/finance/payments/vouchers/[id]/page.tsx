import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CreditCard, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InfoGrid } from "@/components/data/info-grid";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { reviewPaymentVoucherForm } from "@/lib/actions/operations";
import { VOUCHER_STATUS, statusVariant } from "@/lib/operation-labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "银行转账",
  CASH: "现金",
  CHECK: "支票",
  WECHAT: "微信支付",
  ALIPAY: "支付宝",
  OTHER: "其他",
};

const RECEIVABLE_TYPE_LABELS: Record<string, string> = {
  RENT: "租金",
  DEPOSIT: "押金",
  DAMAGE: "赔偿金",
  MISSING_PARTS: "配件丢失",
  CLEANING: "清洁费",
  REPAIR: "维修费",
  LATE_FEE: "滞纳金",
  PENALTY: "违约金",
  OTHER: "其他",
};

type VoucherDetail = {
  id: string;
  voucher_no: string;
  amount: string | number;
  payment_method: string | null;
  bank_flow_no: string | null;
  file_url: string | null;
  status: string;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  customer: { name?: string | null; customer_no?: string | null; contact_name?: string | null; contact_phone?: string | null } | null;
  receivable: {
    receivable_no?: string | null;
    receivable_type?: string | null;
    status?: string | null;
    amount?: string | number | null;
    paid_amount?: string | number | null;
    unpaid_amount?: string | number | null;
    due_date?: string | null;
    order?: { order_no?: string | null } | null;
    contract?: { contract_no?: string | null } | null;
  } | null;
  creator: { display_name?: string | null } | null;
  reviewer: { display_name?: string | null } | null;
};

function ReviewActions({ voucherId }: { voucherId: string }) {
  return (
    <form action={reviewPaymentVoucherForm} className="space-y-3">
      <input type="hidden" name="voucherId" value={voucherId} />
      <input type="hidden" name="redirectTo" value={`/finance/payments/vouchers/${voucherId}`} />
      <label className="grid gap-1 text-sm">
        <span className="text-app-muted">审核备注</span>
        <textarea
          name="reviewComment"
          rows={3}
          className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring"
          placeholder="可填写付款凭证是否清晰、流水是否匹配等说明"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="APPROVED" variant="primary">通过并确认收款</Button>
        <Button type="submit" name="status" value="REJECTED" variant="outline">驳回凭证</Button>
      </div>
    </form>
  );
}

export default async function PaymentVoucherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("payment_voucher")
    .select(`
      *,
      customer:customer_id(customer_no, name, contact_name, contact_phone),
      receivable:receivable_id(
        receivable_no, receivable_type, status, amount, paid_amount, unpaid_amount, due_date,
        order:order_id(order_no),
        contract:contract_id(contract_no)
      ),
      creator:created_by(display_name),
      reviewer:reviewed_by(display_name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const voucher = data as unknown as VoucherDetail;
  const receivable = voucher.receivable;

  return (
    <div className="space-y-6">
      <PageHeader
        title="付款凭证详情"
        subtitle={`${voucher.voucher_no} · ${voucher.customer?.name ?? "-"}`}
        backUrl="/finance/payments?tab=vouchers"
        status={<Badge variant={statusVariant(voucher.status)}>{VOUCHER_STATUS[voucher.status] ?? voucher.status}</Badge>}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />凭证信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "凭证号", value: voucher.voucher_no },
            { label: "提交客户", value: voucher.customer?.name ?? "-" },
            { label: "客户编号", value: voucher.customer?.customer_no ?? "-" },
            { label: "联系人", value: voucher.customer?.contact_name ?? "-" },
            { label: "联系电话", value: voucher.customer?.contact_phone ?? "-" },
            { label: "付款金额", value: <span className="font-semibold tabular-nums">{formatCurrency(voucher.amount)}</span> },
            { label: "付款方式", value: PAYMENT_METHOD_LABELS[voucher.payment_method ?? ""] ?? voucher.payment_method ?? "-" },
            { label: "银行流水号", value: voucher.bank_flow_no ?? "-" },
            { label: "提交人", value: voucher.creator?.display_name ?? "-" },
            { label: "提交时间", value: formatDateTime(voucher.created_at) },
            { label: "凭证文件", value: voucher.file_url ? <Link href={voucher.file_url} className="text-app-accent hover:underline">打开凭证文件</Link> : "-" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4" />关联应收</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "应收编号", value: data.receivable_id ? <Link href={`/finance/receivables/${data.receivable_id}`} className="text-app-accent hover:underline">{receivable?.receivable_no ?? "查看应收"}</Link> : "-" },
            { label: "类型", value: RECEIVABLE_TYPE_LABELS[receivable?.receivable_type ?? ""] ?? receivable?.receivable_type ?? "-" },
            { label: "状态", value: receivable?.status ?? "-" },
            { label: "应收金额", value: formatCurrency(receivable?.amount ?? 0) },
            { label: "已收金额", value: formatCurrency(receivable?.paid_amount ?? 0) },
            { label: "未收金额", value: <span className="font-semibold tabular-nums">{formatCurrency(receivable?.unpaid_amount ?? 0)}</span> },
            { label: "到期日", value: formatDate(receivable?.due_date) },
            { label: "订单", value: receivable?.order?.order_no ?? "-" },
            { label: "合同", value: receivable?.contract?.contract_no ?? "-" },
          ]}
        />
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4" />审核信息</CardTitle></CardHeader>
        <div className="space-y-4">
          <InfoGrid
            items={[
              { label: "审核状态", value: <Badge variant={statusVariant(voucher.status)}>{VOUCHER_STATUS[voucher.status] ?? voucher.status}</Badge> },
              { label: "审核人", value: voucher.reviewer?.display_name ?? "-" },
              { label: "审核时间", value: formatDateTime(voucher.reviewed_at) },
              { label: "审核备注", value: voucher.review_comment ?? "-" },
            ]}
          />
          {voucher.status === "SUBMITTED" ? <ReviewActions voucherId={voucher.id} /> : null}
        </div>
      </Card>
    </div>
  );
}
