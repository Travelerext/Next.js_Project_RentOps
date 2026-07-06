import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/data/data-table";
import { generateUtilizationSnapshotForm } from "@/lib/actions/operations";
import { formatCurrency, formatDate } from "@/lib/utils";
import { pct } from "@/lib/operation-labels";

export default async function EquipmentUtilizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: equipment }, { data: snapshots }] = await Promise.all([
    supabase.from("equipment").select("equipment_no, name").eq("id", id).single(),
    supabase.from("equipment_utilization_snapshot").select("*").eq("equipment_id", id).order("period_end", { ascending: false }),
  ]);
  const columns: Column<Record<string, unknown>>[] = [
    { id: "period", header: "期间", cell: (row) => `${formatDate(row.period_start as string)} - ${formatDate(row.period_end as string)}` },
    { id: "days", header: "出租/日历天", cell: (row) => `${row.rented_days}/${row.calendar_days}` },
    { id: "nominal", header: "名义利用率", cell: (row) => pct(row.nominal_utilization as string) },
    { id: "revenue", header: "收入", cell: (row) => formatCurrency(row.actual_revenue as string) },
    { id: "diagnosis", header: "诊断", cell: (row) => row.diagnosis as string, hideOnMobile: true },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="设备利用率" subtitle={`${equipment?.equipment_no ?? ""} ${equipment?.name ?? ""}`} backUrl={`/equipment/catalog/${id}`} />
      <Card>
        <CardHeader><CardTitle>生成快照</CardTitle></CardHeader>
        <form action={generateUtilizationSnapshotForm} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="equipmentId" value={id} />
          <input type="hidden" name="redirectTo" value={`/equipment/catalog/${id}/utilization`} />
          <Input name="periodStart" label="开始日期" type="date" required />
          <Input name="periodEnd" label="结束日期" type="date" required />
          <div className="flex items-end"><Button variant="primary" type="submit">生成</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader><CardTitle>快照记录</CardTitle></CardHeader>
        <DataTable columns={columns} data={(snapshots ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} emptyMessage="暂无快照" />
      </Card>
    </div>
  );
}

