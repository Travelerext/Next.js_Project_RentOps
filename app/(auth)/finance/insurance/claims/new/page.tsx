import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createInsuranceClaimForm } from "@/lib/actions/cr08";

export default async function NewInsuranceClaimPage({ searchParams }: { searchParams: Promise<{ policyId?: string; equipmentId?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: policies }, { data: equipment }] = await Promise.all([
    supabase.from("equipment_insurance_policy").select("id, policy_no, equipment_id").order("created_at", { ascending: false }),
    supabase.from("equipment").select("id, equipment_no, name").is("deleted_at", null).order("equipment_no"),
  ]);
  const selectedPolicy = policies?.find((item) => item.id === sp.policyId);
  return (
    <div className="space-y-6">
      <PageHeader title="新建理赔" backUrl="/finance/insurance/claims" />
      <Card>
        <CardHeader><CardTitle>理赔信息</CardTitle></CardHeader>
        <form action={createInsuranceClaimForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/finance/insurance/claims" />
          <Select name="policyId" label="关联保单" defaultValue={sp.policyId ?? ""} options={[{ value: "", label: "不关联保单" }, ...(policies ?? []).map((item) => ({ value: item.id as string, label: item.policy_no as string }))]} />
          <Select name="equipmentId" label="设备" required defaultValue={sp.equipmentId ?? (selectedPolicy?.equipment_id as string | undefined) ?? ""} options={(equipment ?? []).map((item) => ({ value: item.id as string, label: `${item.equipment_no} / ${item.name}` }))} />
          <Input name="accidentDate" label="事故日期" type="date" required />
          <Input name="accidentLocation" label="事故地点" />
          <Input name="assessedAmount" label="定损金额" type="number" step="0.01" />
          <Input name="claimAmount" label="索赔金额" type="number" step="0.01" />
          <Input name="paidAmount" label="已赔付金额" type="number" step="0.01" />
          <Select name="status" label="状态" options={[{ value: "DRAFT", label: "草稿" }, { value: "SUBMITTED", label: "已提交" }, { value: "ASSESSING", label: "定损中" }]} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
            事故原因
            <textarea name="accidentReason" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
            材料 URL（每行一个）
            <textarea name="materialUrls" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" />
          </label>
          <div className="sm:col-span-2"><Button variant="primary" type="submit">保存理赔</Button></div>
        </form>
      </Card>
    </div>
  );
}

