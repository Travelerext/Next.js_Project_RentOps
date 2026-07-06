import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { submitPaymentVoucherForm } from "@/lib/actions/operations";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { RECEIVABLE_STATUS } from "@/lib/constants";
import { VOUCHER_STATUS, statusVariant } from "@/lib/operation-labels";

export default async function CustomerBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase.from("customer").select("id").eq("owner_user_id", profile.id).is("deleted_at", null).maybeSingle()
    : { data: null };
  if (!customer) notFound();

  const [{ data: bill }, { data: vouchers }] = await Promise.all([
    supabase.from("receivable").select("*").eq("id", id).eq("customer_id", customer.id).single(),
    supabase.from("payment_voucher").select("*").eq("receivable_id", id).order("created_at", { ascending: false }),
  ]);
  if (!bill) notFound();

  const unpaidAmount = Number(bill.unpaid_amount ?? 0);
  const canSubmitVoucher = bill.status !== "PAID" && unpaidAmount > 0;
  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "凭证号", cell: (row) => <span className="font-mono text-sm">{row.voucher_no as string}</span> },
    { id: "amount", header: "金额", cell: (row) => formatCurrency(row.amount as string) },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{VOUCHER_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "提交时间", cell: (row) => formatDateTime(row.created_at as string) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={bill.receivable_no as string} subtitle="账单详情" backUrl="/customer/bills" status={<Badge variant={bill.status === "PAID" ? "success" : bill.status === "OVERDUE" ? "danger" : "warning"}>{RECEIVABLE_STATUS[bill.status as string] ?? bill.status}</Badge>} />
      <Card>
        <CardHeader><CardTitle>账单信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "类型", value: bill.receivable_type },
            { label: "应收金额", value: formatCurrency(bill.amount as string) },
            { label: "已收金额", value: formatCurrency(bill.paid_amount as string) },
            { label: "未收金额", value: formatCurrency(bill.unpaid_amount as string) },
            { label: "到期日", value: formatDate(bill.due_date as string) },
            { label: "备注", value: bill.remark ?? "-" },
          ]}
        />
      </Card>
      {canSubmitVoucher ? (
        <Card>
          <CardHeader><CardTitle>上传付款凭证</CardTitle></CardHeader>
          <form action={submitPaymentVoucherForm} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="receivableId" value={id} />
            <input type="hidden" name="redirectTo" value={`/customer/bills/${id}`} />
            <Input name="amount" label="付款金额" type="number" step="0.01" defaultValue={bill.unpaid_amount as string} required />
            <Select name="paymentMethod" label="付款方式" options={[{ value: "BANK_TRANSFER", label: "银行转账" }, { value: "WECHAT", label: "微信" }, { value: "ALIPAY", label: "支付宝" }, { value: "CASH", label: "现金" }, { value: "OTHER", label: "其他" }]} />
            <Input name="bankFlowNo" label="银行流水号" />
            <Input name="fileUrl" label="凭证文件 URL" />
            <div className="sm:col-span-2"><Button variant="primary" type="submit">提交凭证</Button></div>
          </form>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>付款凭证</CardTitle></CardHeader>
          <p className="px-4 pb-4 text-sm text-app-muted">该账单已结清，无需再上传付款凭证。</p>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>凭证记录</CardTitle></CardHeader>
        <DataTable columns={columns} data={(vouchers ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无付款凭证" />
      </Card>
      <Link href="/customer/bills" className="inline-flex"><Button variant="outline">返回账单</Button></Link>
    </div>
  );
}
