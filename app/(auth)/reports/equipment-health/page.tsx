import { HeartPulse } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { HEALTH_LEVEL, statusVariant } from "@/lib/operation-labels";

export default async function EquipmentHealthReportPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_health_score")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("calculated_at", { ascending: false })
    .limit(200);

  const latestByEquipment = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    if (!latestByEquipment.has(row.equipment_id as string)) latestByEquipment.set(row.equipment_id as string, row);
  }
  const rows = [...latestByEquipment.values()];
  const avg = rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / rows.length) : 0;
  const highRisk = rows.filter((row) => row.score_level === "HIGH_RISK" || Number(row.score ?? 0) < 60).length;

  const columns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "score", header: "健康分", cell: (row) => <span className="tabular-nums font-semibold">{row.score as number}</span> },
    { id: "level", header: "等级", cell: (row) => <Badge variant={statusVariant(row.score_level as string)}>{HEALTH_LEVEL[row.score_level as string] ?? row.score_level as string}</Badge> },
    { id: "time", header: "计算时间", cell: (row) => formatDateTime(row.calculated_at as string) },
  ];

  return (
    <DataPage title="设备健康报表" subtitle="取每台设备最新健康评分，用于风险筛查" empty={false}>
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={HeartPulse} label="覆盖设备" value={rows.length} />
        <StatCard icon={HeartPulse} label="平均健康分" value={avg} color="emerald" />
        <StatCard icon={HeartPulse} label="高风险设备" value={highRisk} color="red" />
      </StatsGrid>
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.id as string} rowHref={(row) => `/equipment/catalog/${row.equipment_id}`} emptyMessage="暂无健康评分" />
    </DataPage>
  );
}
