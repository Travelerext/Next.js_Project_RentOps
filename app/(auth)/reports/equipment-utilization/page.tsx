import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { pct } from "@/lib/operation-labels";

export default async function EquipmentUtilizationReportPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_utilization_snapshot")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("period_end", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Record<string, unknown>[];
  const avg = rows.length ? rows.reduce((sum, row) => sum + Number(row.nominal_utilization ?? 0), 0) / rows.length : 0;
  const revenue = rows.reduce((sum, row) => sum + Number(row.actual_revenue ?? 0), 0);

  const columns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "period", header: "期间", cell: (row) => `${formatDate(row.period_start as string)} - ${formatDate(row.period_end as string)}` },
    { id: "nominal", header: "名义利用率", cell: (row) => pct(row.nominal_utilization as string) },
    { id: "available", header: "可用利用率", cell: (row) => pct(row.available_utilization as string), hideOnMobile: true },
    { id: "revenue", header: "实际收入", cell: (row) => formatCurrency(row.actual_revenue as string), className: "tabular-nums" },
    { id: "diagnosis", header: "诊断", cell: (row) => (row.diagnosis as string) ?? "-", hideOnMobile: true },
  ];

  return (
    <DataPage
      title="设备利用率报表"
      subtitle="按设备快照统计出租天数、维护天数和收入实现"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/equipment-utilization/category"><Button variant="outline">按类别</Button></Link>
          <Link href="/reports/equipment-utilization/model"><Button variant="outline">按型号</Button></Link>
          <Link href="/reports/equipment-utilization/site"><Button variant="outline">按站点</Button></Link>
        </div>
      }
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={BarChart3} label="快照数" value={rows.length} />
        <StatCard icon={BarChart3} label="平均利用率" value={pct(avg)} color="emerald" />
        <StatCard icon={BarChart3} label="实际收入" value={formatCurrency(revenue)} color="indigo" />
      </StatsGrid>
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.id as string} rowHref={(row) => `/equipment/catalog/${row.equipment_id}/utilization`} emptyMessage="暂无利用率快照" />
    </DataPage>
  );
}
