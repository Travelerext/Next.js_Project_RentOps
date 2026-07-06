import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createInsurancePolicyForm } from "@/lib/actions/cr08";

export default async function NewInsurancePolicyPage({ searchParams }: { searchParams: Promise<{ equipmentId?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: equipment } = await supabase.from("equipment").select("id, equipment_no, name").is("deleted_at", null).order("equipment_no");

  return (
    <div className="space-y-6">
      <PageHeader title="新建保单" backUrl="/finance/insurance" />
      <Card>
        <CardHeader><CardTitle>保单信息</CardTitle></CardHeader>
        <form action={createInsurancePolicyForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/finance/insurance" />
          <Input name="policyNo" label="保单号" placeholder="留空自动生成" />
          <Select name="equipmentId" label="设备" required defaultValue={sp.equipmentId ?? ""} options={(equipment ?? []).map((item) => ({ value: item.id as string, label: `${item.equipment_no} / ${item.name}` }))} />
          <Input name="insurerName" label="保险公司" required />
          <Input name="insuranceType" label="险种" defaultValue="COMMERCIAL" required />
          <Input name="insuredAmount" label="保额" type="number" step="0.01" required />
          <Input name="premiumAmount" label="保费" type="number" step="0.01" required />
          <Input name="startDate" label="开始日期" type="date" required />
          <Input name="endDate" label="结束日期" type="date" required />
          <Input name="attachmentUrl" label="附件 URL" />
          <Select name="status" label="状态" options={[{ value: "ACTIVE", label: "有效" }, { value: "CANCELLED", label: "取消" }]} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
            备注
            <textarea name="remark" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <div className="sm:col-span-2"><Button variant="primary" type="submit">保存保单</Button></div>
        </form>
      </Card>
    </div>
  );
}

