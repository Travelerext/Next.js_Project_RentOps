import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { ALERT_LEVEL, ALERT_STATUS, ALERT_TYPE, statusVariant } from "@/lib/operation-labels";

export default async function EquipmentAlertsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const supabase = await createClient();
  const sp = await searchParams;
  const activeStatus = sp.status ?? "OPEN";
  let query = supabase
    .from("equipment_alert")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (activeStatus !== "ALL") query = query.eq("status", activeStatus);
  const { data } = await query;

  const columns: Column<Record<string, unknown>>[] = [
    { id: "title", header: "告警", cell: (row) => <span className="font-medium">{row.title as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "type", header: "类型", cell: (row) => ALERT_TYPE[row.alert_type as string] ?? row.alert_type as string },
    { id: "level", header: "级别", cell: (row) => <Badge variant={statusVariant(row.alert_level as string)}>{ALERT_LEVEL[row.alert_level as string] ?? row.alert_level as string}</Badge> },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{ALERT_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "发生时间", cell: (row) => formatDateTime(row.occurred_at as string), hideOnMobile: true },
  ];

  return (
    <DataPage
      title="设备告警"
      subtitle="故障码、压力异常、终端离线和电子围栏越界"
      filters={{
        activeKey: activeStatus,
        items: [
          { key: "OPEN", label: "待处理", href: "/equipment/alerts?status=OPEN" },
          { key: "PROCESSING", label: "处理中", href: "/equipment/alerts?status=PROCESSING" },
          { key: "CLOSED", label: "已关闭", href: "/equipment/alerts?status=CLOSED" },
          { key: "ALL", label: "全部", href: "/equipment/alerts?status=ALL" },
        ],
      }}
      empty={false}
    >
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/equipment/alerts/${row.id}`} emptyMessage="暂无设备告警" />
    </DataPage>
  );
}
