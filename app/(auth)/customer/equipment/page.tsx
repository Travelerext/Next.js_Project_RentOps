import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";

export default async function CustomerEquipmentPage({ searchParams }: { searchParams: Promise<{ keyword?: string }> }) {
  const sp = await searchParams;
  const keyword = sp.keyword ?? "";
  const supabase = await createClient();
  let query = supabase
    .from("equipment")
    .select("*, category:category_id(name)")
    .eq("status", "IN_STOCK")
    .eq("scrapped", false)
    .is("deleted_at", null)
    .order("equipment_no")
    .limit(100);
  if (keyword) query = query.or(`equipment_no.ilike.%${keyword}%,name.ilike.%${keyword}%,brand.ilike.%${keyword}%`);
  const { data } = await query;

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "设备编号", cell: (row) => <span className="font-mono text-sm">{row.equipment_no as string}</span> },
    { id: "name", header: "名称", cell: (row) => <span className="font-medium">{row.name as string}</span> },
    { id: "category", header: "类别", cell: (row) => ((row.category as { name?: string } | null)?.name) ?? "-" },
    { id: "rent", header: "月租", cell: (row) => formatCurrency((row.standard_rent as string) ?? "0") },
    { id: "status", header: "状态", cell: (row) => <Badge variant="success">{EQUIPMENT_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "action", header: "", cell: (row) => <Link href={`/customer/inquiries/new?equipmentId=${row.id}`} className="text-sm font-medium text-app-accent hover:underline">提交询价</Link> },
  ];

  return (
    <DataPage title="可租设备" subtitle="客户门户设备浏览与询价入口" empty={false}>
      <form className="flex flex-wrap gap-3">
        <Input name="keyword" defaultValue={keyword} placeholder="设备编号 / 名称 / 品牌" />
        <Button variant="outline" type="submit"><Search className="h-4 w-4" />搜索</Button>
      </form>
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/customer/equipment/${row.id}`} emptyMessage="暂无可租设备" />
    </DataPage>
  );
}
