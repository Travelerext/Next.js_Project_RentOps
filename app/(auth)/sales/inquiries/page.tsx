import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { INQUIRY_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function SalesInquiriesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rental_inquiry")
    .select("*, customer:customer_id(name)")
    .order("created_at", { ascending: false });
  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "询价单号", cell: (row) => <span className="font-mono text-sm">{row.inquiry_no as string}</span> },
    { id: "customer", header: "客户", cell: (row) => ((row.customer as { name?: string } | null)?.name) ?? "-" },
    { id: "location", header: "项目地点", cell: (row) => (row.project_location as string) ?? "-" },
    { id: "amount", header: "预估金额", cell: (row) => formatCurrency(row.estimated_amount as string) },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{INQUIRY_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "提交时间", cell: (row) => formatDateTime(row.created_at as string), hideOnMobile: true },
  ];
  return (
    <DataPage title="客户租赁询价" subtitle="客户门户提交的租赁意向，支持跟进并转为订单" empty={false}>
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/sales/inquiries/${row.id}`} emptyMessage="暂无询价" />
    </DataPage>
  );
}
