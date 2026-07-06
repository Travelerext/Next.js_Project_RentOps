import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CLAIM_STATUS, INSURANCE_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function InsurancePolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: policy }, { data: allocations }, { data: claims }] = await Promise.all([
    supabase.from("equipment_insurance_policy").select("*, equipment:equipment_id(id, equipment_no, name)").eq("id", id).single(),
    supabase.from("equipment_insurance_cost_allocation").select("*").eq("policy_id", id).order("allocation_month"),
    supabase.from("equipment_insurance_claim").select("*").eq("policy_id", id).order("created_at", { ascending: false }),
  ]);

  if (!policy) return <p className="py-12 text-center text-app-muted">保单不存在</p>;
  const equipment = policy.equipment as { id: string; equipment_no: string; name: string } | null;
  const allocationColumns: Column<Record<string, unknown>>[] = [
    { id: "month", header: "月份", cell: (row) => formatDate(row.allocation_month as string) },
    { id: "amount", header: "分摊金额", cell: (row) => formatCurrency(row.amount as string) },
  ];
  const claimColumns: Column<Record<string, unknown>>[] = [
    { id: "claim_no", header: "理赔号", cell: (row) => row.claim_no as string },
    { id: "amount", header: "索赔金额", cell: (row) => formatCurrency(row.claim_amount as string) },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{CLAIM_STATUS[row.status as string] ?? row.status as string}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={policy.policy_no as string}
        subtitle={equipment ? `${equipment.equipment_no} / ${equipment.name}` : undefined}
        backUrl="/finance/insurance"
        status={<Badge variant={statusVariant(policy.status as string)}>{INSURANCE_STATUS[policy.status as string] ?? policy.status as string}</Badge>}
        actions={<div className="flex gap-2"><Link href={`/finance/insurance/${id}/edit`}><Button variant="outline">编辑</Button></Link><Link href={`/finance/insurance/claims/new?policyId=${id}`}><Button variant="primary">发起理赔</Button></Link></div>}
      />
      <Card>
        <CardHeader><CardTitle>保单信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "保险公司", value: policy.insurer_name },
            { label: "险种", value: policy.insurance_type },
            { label: "保额", value: formatCurrency(policy.insured_amount as string) },
            { label: "保费", value: formatCurrency(policy.premium_amount as string) },
            { label: "开始日期", value: formatDate(policy.start_date as string) },
            { label: "结束日期", value: formatDate(policy.end_date as string) },
            { label: "备注", value: policy.remark ?? "-" },
          ]}
        />
      </Card>
      <Card>
        <CardHeader><CardTitle>月度成本分摊</CardTitle></CardHeader>
        <DataTable columns={allocationColumns} data={(allocations ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无分摊记录" />
      </Card>
      <Card>
        <CardHeader><CardTitle>理赔记录</CardTitle></CardHeader>
        <DataTable columns={claimColumns} data={(claims ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/finance/insurance/claims/${row.id}`} emptyMessage="暂无理赔" />
      </Card>
    </div>
  );
}
