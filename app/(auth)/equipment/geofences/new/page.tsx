import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createGeofenceForm } from "@/lib/actions/operations";

export default async function NewGeofencePage() {
  const supabase = await createClient();
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, equipment_no, name")
    .is("deleted_at", null)
    .order("equipment_no");

  return (
    <div className="space-y-6">
      <PageHeader title="新建电子围栏" backUrl="/equipment/geofences" />
      <Card>
        <CardHeader><CardTitle>围栏信息</CardTitle></CardHeader>
        <form action={createGeofenceForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/equipment/geofences" />
          <Input name="name" label="围栏名称" required />
          <Select
            name="equipmentId"
            label="设备"
            required
            options={(equipment ?? []).map((item) => ({ value: item.id as string, label: `${item.equipment_no} / ${item.name}` }))}
          />
          <Input name="centerLatitude" label="中心纬度" required placeholder="31.2304" />
          <Input name="centerLongitude" label="中心经度" required placeholder="121.4737" />
          <Input name="radiusMeters" label="半径（米）" type="number" required defaultValue="500" />
          <Select name="alertLevel" label="告警级别" options={[{ value: "WARNING", label: "预警" }, { value: "CRITICAL", label: "严重" }]} />
          <Input name="effectiveStartAt" label="生效开始" type="datetime-local" />
          <Input name="effectiveEndAt" label="生效结束" type="datetime-local" />
          <div className="sm:col-span-2"><Button variant="primary" type="submit">创建围栏</Button></div>
        </form>
      </Card>
    </div>
  );
}

