import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { submitCustomerRepairForm } from "@/lib/actions/operations";

export default async function NewCustomerRepairPage({ searchParams }: { searchParams: Promise<{ equipmentId?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, equipment_no, name")
    .order("equipment_no");
  return (
    <div className="space-y-6">
      <PageHeader title="提交报修" backUrl="/customer/repairs" />
      <Card>
        <CardHeader><CardTitle>报修信息</CardTitle></CardHeader>
        <form action={submitCustomerRepairForm} className="space-y-4">
          <input type="hidden" name="redirectTo" value="/customer/repairs" />
          <Select name="equipmentId" label="报修设备" required defaultValue={sp.equipmentId ?? ""} options={(equipment ?? []).map((item) => ({ value: item.id as string, label: `${item.equipment_no} / ${item.name}` }))} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong">
            故障描述
            <textarea name="faultDescription" rows={5} required className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong">
            图片 URL（每行一个）
            <textarea name="photoUrls" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <Button variant="primary" type="submit">提交报修</Button>
        </form>
      </Card>
    </div>
  );
}

