import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { ALERT_LEVEL, statusVariant } from "@/lib/operation-labels";

export default async function GeofencesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_geofence")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("created_at", { ascending: false });

  const columns: Column<Record<string, unknown>>[] = [
    { id: "name", header: "围栏名称", cell: (row) => <span className="font-medium">{row.name as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "radius", header: "半径", cell: (row) => `${row.radius_meters ?? "-"} 米` },
    { id: "level", header: "告警级别", cell: (row) => <Badge variant={statusVariant(row.alert_level as string)}>{ALERT_LEVEL[row.alert_level as string] ?? row.alert_level as string}</Badge> },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{row.status === "ACTIVE" ? "启用" : "停用"}</Badge> },
    { id: "created_at", header: "创建时间", cell: (row) => formatDateTime(row.created_at as string), hideOnMobile: true },
  ];

  return (
    <DataPage
      title="电子围栏"
      subtitle="限制设备作业范围，遥测越界后由数据库触发告警"
      actions={<Link href="/equipment/geofences/new"><Button variant="primary"><Plus className="h-4 w-4" />新建围栏</Button></Link>}
      fab={{ href: "/equipment/geofences/new", label: "新建围栏" }}
      empty={false}
    >
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/equipment/geofences/${row.id}`} emptyMessage="暂无电子围栏" />
    </DataPage>
  );
}
