import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatCurrency } from "@/lib/utils";
import { pct } from "@/lib/operation-labels";

export default async function UtilizationByModelPage() {
  const supabase = await createClient();
  const [{ data: snapshots }, { data: models }] = await Promise.all([
    supabase.from("equipment_utilization_snapshot").select("*"),
    supabase.from("equipment_model").select("id, model_name"),
  ]);
  const names = new Map((models ?? []).map((item) => [item.id as string, item.model_name as string]));
  const grouped = new Map<string, { id: string; name: string; count: number; utilization: number; revenue: number }>();
  for (const row of snapshots ?? []) {
    const id = (row.model_id as string | null) ?? "unknown";
    const current = grouped.get(id) ?? { id, name: names.get(id) ?? "未设型号", count: 0, utilization: 0, revenue: 0 };
    current.count += 1;
    current.utilization += Number(row.nominal_utilization ?? 0);
    current.revenue += Number(row.actual_revenue ?? 0);
    grouped.set(id, current);
  }
  const rows = [...grouped.values()].map((row) => ({ ...row, utilization: row.count ? row.utilization / row.count : 0 }));
  const columns: Column<(typeof rows)[number]>[] = [
    { id: "name", header: "型号", cell: (row) => row.name },
    { id: "count", header: "快照数", cell: (row) => row.count },
    { id: "utilization", header: "平均利用率", cell: (row) => pct(row.utilization) },
    { id: "revenue", header: "收入", cell: (row) => formatCurrency(row.revenue) },
  ];
  return <DataPage title="按型号利用率" empty={false}><DataTable columns={columns} data={rows} keyExtractor={(row) => row.id} emptyMessage="暂无数据" /></DataPage>;
}
