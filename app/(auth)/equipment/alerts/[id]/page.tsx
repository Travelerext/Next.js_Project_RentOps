import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { InfoGrid } from "@/components/data/info-grid";
import { handleEquipmentAlertForm } from "@/lib/actions/cr08";
import { formatDateTime } from "@/lib/utils";
import { ALERT_LEVEL, ALERT_STATUS, ALERT_TYPE, statusVariant } from "@/lib/cr08-labels";

export default async function EquipmentAlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: alert } = await supabase
    .from("equipment_alert")
    .select("*, equipment:equipment_id(id, equipment_no, name), terminal:terminal_id(terminal_no), geofence:geofence_id(name)")
    .eq("id", id)
    .single();

  if (!alert) return <p className="py-12 text-center text-app-muted">告警不存在</p>;
  const equipment = alert.equipment as { id: string; equipment_no: string; name: string } | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={alert.title as string}
        subtitle={alert.alert_no as string}
        backUrl="/equipment/alerts"
        status={<Badge variant={statusVariant(alert.status as string)}>{ALERT_STATUS[alert.status as string] ?? alert.status as string}</Badge>}
        actions={equipment ? <Link href={`/equipment/catalog/${equipment.id}/tracking`}><Button variant="outline">查看设备</Button></Link> : null}
      />
      <Card>
        <CardHeader><CardTitle>告警详情</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "设备", value: equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-" },
            { label: "终端", value: ((alert.terminal as { terminal_no?: string } | null)?.terminal_no) ?? "-" },
            { label: "围栏", value: ((alert.geofence as { name?: string } | null)?.name) ?? "-" },
            { label: "类型", value: ALERT_TYPE[alert.alert_type as string] ?? alert.alert_type },
            { label: "级别", value: ALERT_LEVEL[alert.alert_level as string] ?? alert.alert_level },
            { label: "发生时间", value: formatDateTime(alert.occurred_at as string) },
            { label: "内容", value: alert.content ?? "-" },
            { label: "处理结果", value: alert.handling_result ?? "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>处理告警</CardTitle></CardHeader>
        <form action={handleEquipmentAlertForm} className="space-y-4">
          <input type="hidden" name="alertId" value={id} />
          <input type="hidden" name="redirectTo" value={`/equipment/alerts/${id}`} />
          <Select name="status" label="处理状态" defaultValue={(alert.status as string) === "OPEN" ? "ACKNOWLEDGED" : (alert.status as string)} options={[
            { value: "ACKNOWLEDGED", label: "已确认" },
            { value: "PROCESSING", label: "处理中" },
            { value: "CLOSED", label: "已关闭" },
          ]} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong">
            处理说明
            <textarea name="handlingResult" rows={4} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" defaultValue={(alert.handling_result as string) ?? ""} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-app-muted-strong">
            <input type="checkbox" name="createWorkOrder" className="h-4 w-4" />
            同时生成维修工单
          </label>
          <div><Button variant="primary" type="submit">提交处理</Button></div>
        </form>
      </Card>
    </div>
  );
}

