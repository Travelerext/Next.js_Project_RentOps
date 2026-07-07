import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { cancelRentalInquiryForm } from "@/lib/actions/operations";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { INQUIRY_STATUS, statusVariant } from "@/lib/operation-labels";

const PRICING_MODE_LABEL: Record<string, string> = {
  HOURLY: "按小时",
  DAILY: "按天",
  MONTHLY: "按月",
  FIXED: "固定价",
  PROJECT_BASED: "按项目",
};

export default async function CustomerInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const [{ data: inquiry }, { data: items }] = await Promise.all([
    supabase.from("rental_inquiry").select("*").eq("id", id).eq("customer_id", customer.id).maybeSingle(),
    supabase.from("rental_inquiry_item").select("*, equipment:equipment_id(equipment_no, name)").eq("inquiry_id", id),
  ]);
  if (!inquiry) notFound();

  const columns: Column<Record<string, unknown>>[] = [
    { id: "name", header: "需求", cell: (row) => (row.equipment_name as string) ?? ((row.equipment as { equipment_no?: string; name?: string } | null)?.name) ?? "-" },
    { id: "quantity", header: "数量", cell: (row) => row.quantity as string },
    { id: "price", header: "单价", cell: (row) => formatCurrency(row.estimated_unit_price as string) },
    { id: "amount", header: "金额", cell: (row) => formatCurrency(row.estimated_amount as string) },
  ];
  const canCancel = !inquiry.converted_order_id && ["SUBMITTED", "FOLLOWING", "QUOTED"].includes(inquiry.status as string);

  return (
    <div className="space-y-6">
      <PageHeader
        title={inquiry.inquiry_no as string}
        subtitle="询价详情"
        backUrl="/customer/inquiries"
        status={<Badge variant={statusVariant(inquiry.status as string)}>{INQUIRY_STATUS[inquiry.status as string] ?? inquiry.status as string}</Badge>}
        actions={canCancel ? (
          <form action={cancelRentalInquiryForm}>
            <input type="hidden" name="inquiryId" value={id} />
            <input type="hidden" name="redirectTo" value={`/customer/inquiries/${id}`} />
            <Button type="submit" variant="destructive">撤销询价</Button>
          </form>
        ) : null}
      />
      <Card>
        <CardHeader><CardTitle>询价信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "联系人", value: inquiry.contact_name ?? "-" },
            { label: "联系电话", value: inquiry.contact_phone ?? "-" },
            { label: "项目地点", value: inquiry.project_location ?? "-" },
            { label: "计费方式", value: PRICING_MODE_LABEL[inquiry.pricing_mode as string] ?? "按月" },
            { label: "计划开始", value: formatDateTime(inquiry.planned_start_at as string) },
            { label: "计划结束", value: formatDateTime(inquiry.planned_end_at as string) },
            { label: "预估金额", value: formatCurrency(inquiry.estimated_amount as string) },
            { label: "提交时间", value: formatDateTime(inquiry.created_at as string) },
            { label: "备注", value: inquiry.remark ?? "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>询价明细</CardTitle></CardHeader>
        <DataTable columns={columns} data={(items ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无明细" />
      </Card>
      {inquiry.converted_order_id ? (
        <p className="text-sm text-app-muted">
          该询价已转为订单，可在 <Link href="/customer/orders" className="text-app-accent hover:underline">我的订单</Link> 中查看进展。
        </p>
      ) : null}
    </div>
  );
}
