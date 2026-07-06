import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CLAIM_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function InsuranceClaimsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_insurance_claim")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("created_at", { ascending: false });
  const columns: Column<Record<string, unknown>>[] = [
    { id: "claim_no", header: "理赔号", cell: (row) => <span className="font-mono text-sm">{row.claim_no as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "date", header: "事故日期", cell: (row) => formatDate(row.accident_date as string) },
    { id: "amount", header: "索赔金额", cell: (row) => formatCurrency(row.claim_amount as string) },
    { id: "paid", header: "赔付金额", cell: (row) => formatCurrency(row.paid_amount as string), hideOnMobile: true },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{CLAIM_STATUS[row.status as string] ?? row.status as string}</Badge> },
  ];
  return (
    <DataPage title="保险理赔" actions={<Link href="/finance/insurance/claims/new"><Button variant="primary"><Plus className="h-4 w-4" />新建理赔</Button></Link>} empty={false}>
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/finance/insurance/claims/${row.id}`} emptyMessage="暂无理赔记录" />
    </DataPage>
  );
}
