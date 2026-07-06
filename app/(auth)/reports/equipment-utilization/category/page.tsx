import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatCurrency } from "@/lib/utils";
import { pct } from "@/lib/operation-labels";

export default async function UtilizationByCategoryPage() {
  const supabase = await createClient();
  const [{ data: snapshots }, { data: categories }] = await Promise.all([
    supabase.from("equipment_utilization_snapshot").select("*"),
    supabase.from("equipment_category").select("id, name"),
  ]);
  const categoryNames = new Map((categories ?? []).map((item) => [item.id as string, item.name as string]));
  const grouped = new Map<string, { id: string; name: string; count: number; utilization: number; revenue: number }>();
  for (const row of snapshots ?? []) {
    const id = (row.category_id as string | null) ?? "unknown";
    const current = grouped.get(id) ?? { id, name: categoryNames.get(id) ?? "未分类", count: 0, utilization: 0, revenue: 0 };
    current.count += 1;
    current.utilization += Number(row.nominal_utilization ?? 0);
    current.revenue += Number(row.actual_revenue ?? 0);
    grouped.set(id, current);
  }
  const rows = [...grouped.values()].map((row) => ({ ...row, utilization: row.count ? row.utilization / row.count : 0 }));
  const columns: Column<(typeof rows)[number]>[] = [
    { id: "name", header: "类别", cell: (row) => row.name },
    { id: "count", header: "快照数", cell: (row) => row.count },
    { id: "utilization", header: "平均利用率", cell: (row) => pct(row.utilization) },
    { id: "revenue", header: "收入", cell: (row) => formatCurrency(row.revenue) },
  ];
  return <DataPage title="按类别利用率" empty={false}><DataTable columns={columns} data={rows} keyExtractor={(row) => row.id} emptyMessage="暂无数据" /></DataPage>;
}
