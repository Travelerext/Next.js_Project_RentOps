import Link from "next/link";
import { MapPin, RadioTower } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export default async function EquipmentMapPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_telemetry_latest")
    .select("*, equipment:equipment_id(id, equipment_no, name, status)")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("reported_at", { ascending: false });

  const rows = (data ?? []) as Record<string, unknown>[];
  const activeRows = rows.filter((row) => Number(row.signal_strength ?? 0) > 0 || Number(row.battery_level ?? 0) > 0);

  const columns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "gps", header: "坐标", cell: (row) => `${row.latitude}, ${row.longitude}` },
    { id: "reported", header: "上报时间", cell: (row) => formatDateTime(row.reported_at as string) },
    { id: "battery", header: "电量", cell: (row) => row.battery_level ? `${row.battery_level}%` : "-", hideOnMobile: true },
    {
      id: "action",
      header: "",
      cell: (row) => <Link href={`/equipment/catalog/${row.equipment_id}/tracking`} className="text-sm font-medium text-app-accent hover:underline">查看轨迹</Link>,
    },
  ];

  return (
    <DataPage
      title="设备地图"
      subtitle="根据最新遥测坐标展示设备分布"
      actions={<Link href="/equipment/geofences"><Button variant="outline">电子围栏</Button></Link>}
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={MapPin} label="有坐标设备" value={rows.length} />
        <StatCard icon={RadioTower} label="24小时内上报" value={activeRows.length} color="emerald" />
        <StatCard icon={MapPin} label="离线或过期" value={rows.length - activeRows.length} color="amber" />
      </StatsGrid>
      <div className="surface-panel rounded-lg p-4">
        <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-app-border bg-app-surface-muted/40 p-6 text-center">
          <div>
            <MapPin className="mx-auto h-8 w-8 text-app-accent" />
            <p className="mt-3 text-sm font-medium text-app-fg">地图坐标数据已就绪</p>
            <p className="mt-1 text-sm text-app-muted">当前实现用坐标列表承载地图数据，后续可接入 Mapbox / 高德地图渲染底图。</p>
          </div>
        </div>
      </div>
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.equipment_id as string} emptyMessage="暂无定位数据" />
    </DataPage>
  );
}
