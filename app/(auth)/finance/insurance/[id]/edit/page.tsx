import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { updateInsurancePolicyForm } from "@/lib/actions/cr08";

export default async function EditInsurancePolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: policy } = await supabase.from("equipment_insurance_policy").select("*").eq("id", id).single();
  if (!policy) return <p className="py-12 text-center text-app-muted">保单不存在</p>;
  return (
    <div className="space-y-6">
      <PageHeader title="编辑保单" subtitle={policy.policy_no as string} backUrl={`/finance/insurance/${id}`} />
      <Card>
        <CardHeader><CardTitle>保单信息</CardTitle></CardHeader>
        <form action={updateInsurancePolicyForm} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="policyId" value={id} />
          <input type="hidden" name="redirectTo" value={`/finance/insurance/${id}`} />
          <Input name="insurerName" label="保险公司" defaultValue={policy.insurer_name as string} required />
          <Input name="insuranceType" label="险种" defaultValue={policy.insurance_type as string} required />
          <Input name="insuredAmount" label="保额" type="number" step="0.01" defaultValue={policy.insured_amount as string} required />
          <Input name="premiumAmount" label="保费" type="number" step="0.01" defaultValue={policy.premium_amount as string} required />
          <Input name="startDate" label="开始日期" type="date" defaultValue={policy.start_date as string} required />
          <Input name="endDate" label="结束日期" type="date" defaultValue={policy.end_date as string} required />
          <Input name="attachmentUrl" label="附件 URL" defaultValue={(policy.attachment_url as string) ?? ""} />
          <Select name="status" label="状态" defaultValue={policy.status as string} options={[{ value: "ACTIVE", label: "有效" }, { value: "EXPIRED", label: "过期" }, { value: "CANCELLED", label: "取消" }]} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
            备注
            <textarea name="remark" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" defaultValue={(policy.remark as string) ?? ""} />
          </label>
          <div className="sm:col-span-2"><Button variant="primary" type="submit">保存修改</Button></div>
        </form>
      </Card>
    </div>
  );
}

