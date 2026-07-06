import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { submitRentalInquiryForm } from "@/lib/actions/operations";

export default async function NewCustomerInquiryPage({ searchParams }: { searchParams: Promise<{ equipmentId?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, standard_rent")
    .eq("status", "IN_STOCK")
    .is("deleted_at", null)
    .order("equipment_no");
  const selected = equipment?.find((item) => item.id === sp.equipmentId);
  return (
    <div className="space-y-6">
      <PageHeader title="提交租赁询价" backUrl="/customer/inquiries" />
      <Card>
        <CardHeader><CardTitle>询价信息</CardTitle></CardHeader>
        <form action={submitRentalInquiryForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/customer/inquiries" />
          <Select name="equipmentId" label="意向设备" defaultValue={sp.equipmentId ?? ""} options={[{ value: "", label: "待业务推荐" }, ...(equipment ?? []).map((item) => ({ value: item.id as string, label: `${item.equipment_no} / ${item.name}` }))]} />
          <Input name="equipmentName" label="设备/型号需求" defaultValue={selected ? `${selected.equipment_no} / ${selected.name}` : ""} />
          <Input name="quantity" label="数量" type="number" step="1" defaultValue="1" />
          <Input name="estimatedUnitPrice" label="预估单价" type="number" step="0.01" defaultValue={(selected?.standard_rent as string) ?? "0"} />
          <Input name="contactName" label="联系人" />
          <Input name="contactPhone" label="联系电话" />
          <Input name="plannedStartAt" label="计划开始" type="datetime-local" />
          <Input name="plannedEndAt" label="计划结束" type="datetime-local" />
          <Input name="projectLocation" label="项目地点" className="sm:col-span-2" />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
            备注
            <textarea name="remark" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <div className="sm:col-span-2"><Button variant="primary" type="submit">提交询价</Button></div>
        </form>
      </Card>
    </div>
  );
}

