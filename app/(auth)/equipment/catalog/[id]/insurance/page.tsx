import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { INSURANCE_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function EquipmentInsurancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: equipment }, { data: policies }] = await Promise.all([
    supabase.from("equipment").select("equipment_no, name").eq("id", id).single(),
    supabase.from("equipment_insurance_policy").select("*").eq("equipment_id", id).order("end_date", { ascending: false }),
  ]);
  const columns: Column<Record<string, unknown>>[] = [
    { id: "policy_no", header: "保单号", cell: (row) => <span className="font-mono text-sm">{row.policy_no as string}</span> },
    { id: "insurer", header: "保险公司", cell: (row) => row.insurer_name as string },
    { id: "premium", header: "保费", cell: (row) => formatCurrency(row.premium_amount as string) },
    { id: "period", header: "有效期", cell: (row) => `${formatDate(row.start_date as string)} - ${formatDate(row.end_date as string)}` },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{INSURANCE_STATUS[row.status as string] ?? row.status as string}</Badge> },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="设备保险" subtitle={`${equipment?.equipment_no ?? ""} ${equipment?.name ?? ""}`} backUrl={`/equipment/catalog/${id}`} actions={<Link href={`/finance/insurance/new?equipmentId=${id}`}><Button variant="primary">新建保单</Button></Link>} />
      <Card>
        <CardHeader><CardTitle>保单记录</CardTitle></CardHeader>
        <DataTable columns={columns} data={(policies ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/finance/insurance/${row.id}`} emptyMessage="暂无保单" />
      </Card>
    </div>
  );
}
