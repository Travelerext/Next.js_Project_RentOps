import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { InfoGrid } from "@/components/data/info-grid";
import { updateInsuranceClaimStatusForm } from "@/lib/actions/cr08";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CLAIM_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function InsuranceClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("equipment_insurance_claim")
    .select("*, equipment:equipment_id(equipment_no, name), policy:policy_id(policy_no)")
    .eq("id", id)
    .single();
  if (!claim) return <p className="py-12 text-center text-app-muted">理赔不存在</p>;
  const equipment = claim.equipment as { equipment_no: string; name: string } | null;
  return (
    <div className="space-y-6">
      <PageHeader title={claim.claim_no as string} subtitle={equipment ? `${equipment.equipment_no} / ${equipment.name}` : undefined} backUrl="/finance/insurance/claims" status={<Badge variant={statusVariant(claim.status as string)}>{CLAIM_STATUS[claim.status as string] ?? claim.status as string}</Badge>} />
      <Card>
        <CardHeader><CardTitle>理赔详情</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "保单", value: ((claim.policy as { policy_no?: string } | null)?.policy_no) ?? "-" },
            { label: "事故日期", value: formatDate(claim.accident_date as string) },
            { label: "事故地点", value: claim.accident_location ?? "-" },
            { label: "定损金额", value: formatCurrency(claim.assessed_amount as string) },
            { label: "索赔金额", value: formatCurrency(claim.claim_amount as string) },
            { label: "赔付金额", value: formatCurrency(claim.paid_amount as string) },
            { label: "事故原因", value: claim.accident_reason ?? "-" },
            { label: "备注", value: claim.remark ?? "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>状态更新</CardTitle></CardHeader>
        <form action={updateInsuranceClaimStatusForm} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="claimId" value={id} />
          <input type="hidden" name="redirectTo" value={`/finance/insurance/claims/${id}`} />
          <Select name="status" label="状态" defaultValue={claim.status as string} options={[
            { value: "SUBMITTED", label: "已提交" },
            { value: "ASSESSING", label: "定损中" },
            { value: "APPROVED", label: "已通过" },
            { value: "PAID", label: "已赔付" },
            { value: "REJECTED", label: "已驳回" },
            { value: "CLOSED", label: "已关闭" },
          ]} />
          <Input name="paidAmount" label="赔付金额" type="number" step="0.01" defaultValue={claim.paid_amount as string} />
          <div className="flex items-end"><Button variant="primary" type="submit">更新</Button></div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-3">
            备注
            <textarea name="remark" rows={3} className="premium-control rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus-ring" defaultValue={(claim.remark as string) ?? ""} />
          </label>
        </form>
      </Card>
    </div>
  );
}

