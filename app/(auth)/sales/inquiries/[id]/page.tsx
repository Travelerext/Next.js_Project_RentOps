import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { convertInquiryToOrderForm, updateInquiryStatusForm } from "@/lib/actions/cr08";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { INQUIRY_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function SalesInquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inquiry }, { data: items }] = await Promise.all([
    supabase.from("rental_inquiry").select("*, customer:customer_id(name, contact_name, contact_phone)").eq("id", id).single(),
    supabase.from("rental_inquiry_item").select("*, equipment:equipment_id(equipment_no, name)").eq("inquiry_id", id),
  ]);
  if (!inquiry) return <p className="py-12 text-center text-app-muted">询价不存在</p>;
  const columns: Column<Record<string, unknown>>[] = [
    { id: "name", header: "需求", cell: (row) => (row.equipment_name as string) ?? ((row.equipment as { equipment_no?: string; name?: string } | null)?.name) ?? "-" },
    { id: "quantity", header: "数量", cell: (row) => row.quantity as string },
    { id: "price", header: "单价", cell: (row) => formatCurrency(row.estimated_unit_price as string) },
    { id: "amount", header: "金额", cell: (row) => formatCurrency(row.estimated_amount as string) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={inquiry.inquiry_no as string}
        subtitle={((inquiry.customer as { name?: string } | null)?.name) ?? undefined}
        backUrl="/sales/inquiries"
        status={<Badge variant={statusVariant(inquiry.status as string)}>{INQUIRY_STATUS[inquiry.status as string] ?? inquiry.status as string}</Badge>}
        actions={inquiry.converted_order_id ? <Link href={`/sales/orders/${inquiry.converted_order_id}`}><Button variant="outline">查看订单</Button></Link> : null}
      />
      <Card>
        <CardHeader><CardTitle>询价信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "联系人", value: inquiry.contact_name ?? ((inquiry.customer as { contact_name?: string } | null)?.contact_name) ?? "-" },
            { label: "联系电话", value: inquiry.contact_phone ?? ((inquiry.customer as { contact_phone?: string } | null)?.contact_phone) ?? "-" },
            { label: "项目地点", value: inquiry.project_location ?? "-" },
            { label: "计划开始", value: formatDateTime(inquiry.planned_start_at as string) },
            { label: "计划结束", value: formatDateTime(inquiry.planned_end_at as string) },
            { label: "预估金额", value: formatCurrency(inquiry.estimated_amount as string) },
            { label: "备注", value: inquiry.remark ?? "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>询价明细</CardTitle></CardHeader>
        <DataTable columns={columns} data={(items ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无明细" />
      </Card>
      <Card>
        <CardHeader><CardTitle>销售处理</CardTitle></CardHeader>
        <div className="flex flex-wrap gap-3">
          <form action={updateInquiryStatusForm} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="inquiryId" value={id} />
            <input type="hidden" name="redirectTo" value={`/sales/inquiries/${id}`} />
            <Select name="status" label="跟进状态" defaultValue={inquiry.status as string} options={[
              { value: "FOLLOWING", label: "跟进中" },
              { value: "QUOTED", label: "已报价" },
              { value: "CLOSED", label: "已关闭" },
            ]} />
            <Button variant="outline" type="submit">更新状态</Button>
          </form>
          {!inquiry.converted_order_id && (
            <form action={convertInquiryToOrderForm} className="flex items-end">
              <input type="hidden" name="inquiryId" value={id} />
              <input type="hidden" name="redirectTo" value={`/sales/inquiries/${id}`} />
              <Button variant="primary" type="submit">转为订单</Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

