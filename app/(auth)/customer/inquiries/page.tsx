import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { INQUIRY_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function CustomerInquiriesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rental_inquiry")
    .select("*")
    .order("created_at", { ascending: false });
  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "询价单号", cell: (row) => <span className="font-mono text-sm">{row.inquiry_no as string}</span> },
    { id: "location", header: "项目地点", cell: (row) => (row.project_location as string) ?? "-" },
    { id: "amount", header: "预估金额", cell: (row) => formatCurrency(row.estimated_amount as string) },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{INQUIRY_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "提交时间", cell: (row) => formatDateTime(row.created_at as string), hideOnMobile: true },
  ];
  return (
    <DataPage title="我的询价" actions={<Link href="/customer/inquiries/new"><Button variant="primary"><Plus className="h-4 w-4" />提交询价</Button></Link>} fab={{ href: "/customer/inquiries/new", label: "提交询价" }} empty={false}>
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无询价记录" />
    </DataPage>
  );
}
