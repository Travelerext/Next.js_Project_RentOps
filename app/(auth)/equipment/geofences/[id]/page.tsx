import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDateTime } from "@/lib/utils";
import { ALERT_LEVEL, ALERT_STATUS, ALERT_TYPE, statusVariant } from "@/lib/cr08-labels";

export default async function GeofenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: fence }, { data: alerts }] = await Promise.all([
    supabase.from("equipment_geofence").select("*, equipment:equipment_id(id, equipment_no, name)").eq("id", id).single(),
    supabase.from("equipment_alert").select("*").eq("geofence_id", id).order("occurred_at", { ascending: false }),
  ]);

  if (!fence) return <p className="py-12 text-center text-app-muted">围栏不存在</p>;
  const equipment = fence.equipment as { id: string; equipment_no: string; name: string } | null;
  const columns: Column<Record<string, unknown>>[] = [
    { id: "title", header: "告警", cell: (row) => row.title as string },
    { id: "type", header: "类型", cell: (row) => ALERT_TYPE[row.alert_type as string] ?? row.alert_type as string },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{ALERT_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "发生时间", cell: (row) => formatDateTime(row.occurred_at as string) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={fence.name as string}
        subtitle={equipment ? `${equipment.equipment_no} / ${equipment.name}` : undefined}
        backUrl="/equipment/geofences"
        status={<Badge variant={statusVariant(fence.status as string)}>{fence.status === "ACTIVE" ? "启用" : "停用"}</Badge>}
        actions={equipment ? <Link href={`/equipment/catalog/${equipment.id}/tracking`}><Button variant="outline">查看轨迹</Button></Link> : null}
      />
      <Card>
        <CardHeader><CardTitle>围栏规则</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "类型", value: fence.fence_type },
            { label: "中心点", value: `${fence.center_latitude ?? "-"}, ${fence.center_longitude ?? "-"}` },
            { label: "半径", value: fence.radius_meters ? `${fence.radius_meters} 米` : "-" },
            { label: "告警级别", value: ALERT_LEVEL[fence.alert_level as string] ?? fence.alert_level },
            { label: "生效开始", value: formatDateTime(fence.effective_start_at as string) },
            { label: "生效结束", value: formatDateTime(fence.effective_end_at as string) },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>越界告警</CardTitle></CardHeader>
        <DataTable columns={columns} data={(alerts ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/equipment/alerts/${row.id}`} emptyMessage="暂无告警" />
      </Card>
    </div>
  );
}
