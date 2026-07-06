import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDateTime } from "@/lib/utils";
import { IOT_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function IotDeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: terminal }, { data: bindings }, { data: telemetry }] = await Promise.all([
    supabase.from("iot_terminal").select("*").eq("id", id).single(),
    supabase
      .from("equipment_iot_binding")
      .select("*, equipment:equipment_id(id, equipment_no, name)")
      .eq("terminal_id", id)
      .order("bound_at", { ascending: false }),
    supabase
      .from("equipment_telemetry_latest")
      .select("*, equipment:equipment_id(id, equipment_no, name)")
      .eq("terminal_id", id)
      .order("reported_at", { ascending: false })
      .limit(10),
  ]);

  if (!terminal) {
    return <p className="py-12 text-center text-app-muted">终端不存在</p>;
  }

  const bindingColumns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "bound_at", header: "绑定时间", cell: (row) => formatDateTime(row.bound_at as string) },
    { id: "unbound_at", header: "解绑时间", cell: (row) => formatDateTime(row.unbound_at as string) },
    { id: "reason", header: "说明", cell: (row) => (row.bind_reason as string) ?? (row.unbind_reason as string) ?? "-", hideOnMobile: true },
  ];

  const telemetryColumns: Column<Record<string, unknown>>[] = [
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "reported_at", header: "上报时间", cell: (row) => formatDateTime(row.reported_at as string) },
    { id: "engine_hours", header: "运行小时", cell: (row) => `${row.engine_hours ?? 0}h` },
    { id: "pressure", header: "液压压力", cell: (row) => row.hydraulic_pressure ? String(row.hydraulic_pressure) : "-", hideOnMobile: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={terminal.terminal_no as string}
        subtitle="IoT 终端详情"
        backUrl="/equipment/iot/devices"
        status={<Badge variant={statusVariant(terminal.status as string)}>{IOT_STATUS[terminal.status as string] ?? terminal.status}</Badge>}
        actions={<Link href="/equipment/map"><Button variant="outline">设备地图</Button></Link>}
      />
      <Card>
        <CardHeader><CardTitle>终端信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "终端类型", value: terminal.terminal_type ?? "-" },
            { label: "厂商", value: terminal.vendor ?? "-" },
            { label: "协议", value: terminal.protocol ?? "-" },
            { label: "SIM", value: terminal.sim_no ?? "-" },
            { label: "安装时间", value: formatDateTime(terminal.installed_at as string) },
            { label: "最后在线", value: formatDateTime(terminal.last_seen_at as string) },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>绑定历史</CardTitle></CardHeader>
        <DataTable columns={bindingColumns} data={(bindings ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无绑定记录" />
      </Card>
      <Card>
        <CardHeader><CardTitle>最近遥测</CardTitle></CardHeader>
        <DataTable columns={telemetryColumns} data={(telemetry ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.equipment_id as string} emptyMessage="暂无遥测数据" />
      </Card>
    </div>
  );
}
