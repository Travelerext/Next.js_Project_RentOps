import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { upsertTelemetryForm } from "@/lib/actions/cr08";
import { formatDateTime } from "@/lib/utils";

export default async function EquipmentTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: equipment }, { data: telemetry }, { data: locations }, { data: binding }] = await Promise.all([
    supabase.from("equipment").select("id, equipment_no, name").eq("id", id).single(),
    supabase.from("equipment_telemetry_latest").select("*").eq("equipment_id", id).maybeSingle(),
    supabase.from("equipment_location_log").select("*").eq("equipment_id", id).order("located_at", { ascending: false }).limit(20),
    supabase.from("equipment_iot_binding").select("terminal_id").eq("equipment_id", id).is("unbound_at", null).maybeSingle(),
  ]);

  const columns: Column<Record<string, unknown>>[] = [
    { id: "to", header: "位置", cell: (row) => (row.to_location_text as string) ?? (row.to_location_type as string) },
    { id: "type", header: "来源", cell: (row) => row.business_type as string, hideOnMobile: true },
    { id: "time", header: "时间", cell: (row) => formatDateTime(row.located_at as string) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="定位与遥测" subtitle={`${equipment?.equipment_no ?? ""} ${equipment?.name ?? ""}`} backUrl={`/equipment/catalog/${id}`} />
      <Card>
        <CardHeader><CardTitle>最新遥测</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "上报时间", value: formatDateTime(telemetry?.reported_at as string) },
            { label: "GPS", value: telemetry?.latitude && telemetry?.longitude ? `${telemetry.latitude}, ${telemetry.longitude}` : "-" },
            { label: "运行小时", value: telemetry?.engine_hours ? `${telemetry.engine_hours}h` : "-" },
            { label: "油耗", value: telemetry?.fuel_consumption ?? "-" },
            { label: "液压压力", value: telemetry?.hydraulic_pressure ?? "-" },
            { label: "电量", value: telemetry?.battery_level ? `${telemetry.battery_level}%` : "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>手动模拟遥测上报</CardTitle></CardHeader>
        <form action={upsertTelemetryForm} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="equipmentId" value={id} />
          <input type="hidden" name="terminalId" value={(binding?.terminal_id as string) ?? ""} />
          <input type="hidden" name="redirectTo" value={`/equipment/catalog/${id}/tracking`} />
          <Input name="reportedAt" label="上报时间" type="datetime-local" />
          <Input name="latitude" label="纬度" placeholder="31.2304" />
          <Input name="longitude" label="经度" placeholder="121.4737" />
          <Input name="engineHours" label="运行小时" type="number" step="0.1" />
          <Input name="hydraulicPressure" label="液压压力" type="number" step="0.1" />
          <Input name="batteryLevel" label="电量 %" type="number" step="0.1" />
          <Input name="faultCodes" label="故障码" placeholder="E101,E205" />
          <Input name="fuelConsumption" label="累计油耗" type="number" step="0.1" />
          <Input name="signalStrength" label="信号强度" type="number" step="0.1" />
          <div className="sm:col-span-3"><Button variant="primary" type="submit">写入遥测并触发流程</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader><CardTitle>位置轨迹</CardTitle></CardHeader>
        <DataTable columns={columns} data={(locations ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无位置轨迹" />
      </Card>
    </div>
  );
}

