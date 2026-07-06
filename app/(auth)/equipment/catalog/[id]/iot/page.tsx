import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InfoGrid } from "@/components/data/info-grid";
import { bindIotTerminalForm, unbindIotTerminalForm } from "@/lib/actions/operations";
import { formatDateTime } from "@/lib/utils";
import { IOT_STATUS, statusVariant } from "@/lib/operation-labels";

export default async function EquipmentIotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: equipment }, { data: binding }] = await Promise.all([
    supabase.from("equipment").select("id, equipment_no, name").eq("id", id).single(),
    supabase
      .from("equipment_iot_binding")
      .select("*, terminal:terminal_id(*)")
      .eq("equipment_id", id)
      .is("unbound_at", null)
      .maybeSingle(),
  ]);

  const terminal = binding?.terminal as Record<string, unknown> | null | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="IoT 绑定" subtitle={`${equipment?.equipment_no ?? ""} ${equipment?.name ?? ""}`} backUrl={`/equipment/catalog/${id}`} />
      {terminal ? (
        <Card>
          <CardHeader><CardTitle>当前终端</CardTitle></CardHeader>
          <InfoGrid
            items={[
              { label: "终端编号", value: terminal.terminal_no as string },
              { label: "状态", value: <Badge variant={statusVariant(terminal.status as string)}>{IOT_STATUS[terminal.status as string] ?? terminal.status as string}</Badge> },
              { label: "厂商", value: (terminal.vendor as string) ?? "-" },
              { label: "SIM", value: (terminal.sim_no as string) ?? "-" },
              { label: "绑定时间", value: formatDateTime(binding.bound_at as string) },
              { label: "最后在线", value: formatDateTime(terminal.last_seen_at as string) },
            ]}
          />
          <form action={unbindIotTerminalForm} className="mt-5 flex flex-wrap items-end gap-3">
            <input type="hidden" name="bindingId" value={binding.id as string} />
            <input type="hidden" name="equipmentId" value={id} />
            <input type="hidden" name="redirectTo" value={`/equipment/catalog/${id}/iot`} />
            <Input name="unbindReason" label="解绑原因" placeholder="更换终端 / 设备退役" />
            <Button variant="outline" type="submit">解绑</Button>
          </form>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>{terminal ? "更换终端" : "绑定终端"}</CardTitle></CardHeader>
        <form action={bindIotTerminalForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="equipmentId" value={id} />
          <input type="hidden" name="redirectTo" value={`/equipment/catalog/${id}/iot`} />
          <Input name="terminalNo" label="终端编号" required />
          <Select name="terminalType" label="终端类型" options={[{ value: "GPS", label: "GPS" }, { value: "OBD", label: "OBD" }, { value: "SENSOR", label: "传感器" }]} />
          <Input name="vendor" label="厂商" />
          <Input name="simNo" label="SIM 卡号" />
          <Input name="installedAt" label="安装时间" type="datetime-local" />
          <Input name="bindReason" label="绑定原因" />
          <div className="sm:col-span-2">
            <Button variant="primary" type="submit">保存绑定</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

