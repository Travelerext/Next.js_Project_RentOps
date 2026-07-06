import Link from "next/link";
import { Activity, Cpu, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { IOT_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function IotDevicesPage() {
  const supabase = await createClient();
  const [{ data: terminals }, { data: bindings }] = await Promise.all([
    supabase.from("iot_terminal").select("*").order("created_at", { ascending: false }),
    supabase
      .from("equipment_iot_binding")
      .select("terminal_id, equipment:equipment_id(id, equipment_no, name)")
      .is("unbound_at", null),
  ]);

  const bindingByTerminal = new Map((bindings ?? []).map((b) => [b.terminal_id as string, b.equipment]));
  const rows = (terminals ?? []).map((terminal) => ({
    ...terminal,
    equipment: bindingByTerminal.get(terminal.id as string),
  })) as Record<string, unknown>[];
  const onlineCount = rows.filter((row) => row.status === "ONLINE").length;
  const boundCount = rows.filter((row) => row.equipment).length;

  const columns: Column<Record<string, unknown>>[] = [
    { id: "terminal_no", header: "终端编号", cell: (row) => <span className="font-mono text-sm">{row.terminal_no as string}</span> },
    { id: "type", header: "类型", cell: (row) => row.terminal_type as string },
    {
      id: "status",
      header: "状态",
      cell: (row) => <Badge variant={statusVariant(row.status as string)} pulse={row.status === "ONLINE"}>{IOT_STATUS[row.status as string] ?? row.status as string}</Badge>,
    },
    {
      id: "equipment",
      header: "绑定设备",
      cell: (row) => {
        const equipment = row.equipment as { id: string; equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "vendor", header: "厂商", cell: (row) => (row.vendor as string) ?? "-", hideOnMobile: true },
    { id: "last_seen_at", header: "最后在线", cell: (row) => formatDateTime(row.last_seen_at as string), hideOnMobile: true },
  ];

  return (
    <DataPage
      title="IoT 终端"
      subtitle="终端在线状态、设备绑定和最后上报时间"
      actions={<Link href="/equipment/catalog"><Button variant="primary"><Plus className="h-4 w-4" />绑定设备</Button></Link>}
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={Cpu} label="终端总数" value={rows.length} />
        <StatCard icon={Activity} label="在线终端" value={onlineCount} color="emerald" />
        <StatCard icon={Cpu} label="已绑定设备" value={boundCount} color="indigo" />
      </StatsGrid>
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.id as string}
        rowHref={(row) => `/equipment/iot/devices/${row.id}`}
        emptyMessage="暂无 IoT 终端"
      />
    </DataPage>
  );
}
