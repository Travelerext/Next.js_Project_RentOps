import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CLAIM_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function EquipmentInsuranceClaimsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: equipment }, { data: claims }] = await Promise.all([
    supabase.from("equipment").select("equipment_no, name").eq("id", id).single(),
    supabase.from("equipment_insurance_claim").select("*").eq("equipment_id", id).order("created_at", { ascending: false }),
  ]);
  const columns: Column<Record<string, unknown>>[] = [
    { id: "claim_no", header: "理赔号", cell: (row) => <span className="font-mono text-sm">{row.claim_no as string}</span> },
    { id: "date", header: "事故日期", cell: (row) => formatDate(row.accident_date as string) },
    { id: "amount", header: "索赔金额", cell: (row) => formatCurrency(row.claim_amount as string) },
    { id: "paid", header: "赔付金额", cell: (row) => formatCurrency(row.paid_amount as string) },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{CLAIM_STATUS[row.status as string] ?? row.status as string}</Badge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="设备理赔" subtitle={`${equipment?.equipment_no ?? ""} ${equipment?.name ?? ""}`} backUrl={`/equipment/catalog/${id}`} actions={<Link href={`/finance/insurance/claims/new?equipmentId=${id}`}><Button variant="primary">新建理赔</Button></Link>} />
      <Card>
        <CardHeader><CardTitle>理赔记录</CardTitle></CardHeader>
        <DataTable columns={columns} data={(claims ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/finance/insurance/claims/${row.id}`} emptyMessage="暂无理赔" />
      </Card>
    </div>
  );
}
