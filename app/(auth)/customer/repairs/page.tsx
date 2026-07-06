import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { CUSTOMER_REPAIR_STATUS, statusVariant } from "@/lib/operation-labels";

export default async function CustomerRepairsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_repair_request")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("created_at", { ascending: false });
  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "报修单号", cell: (row) => <span className="font-mono text-sm">{row.request_no as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "fault", header: "故障描述", cell: (row) => row.fault_description as string, hideOnMobile: true },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{CUSTOMER_REPAIR_STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "提交时间", cell: (row) => formatDateTime(row.created_at as string) },
  ];
  return (
    <DataPage title="我的报修" actions={<Link href="/customer/repairs/new"><Button variant="primary"><Plus className="h-4 w-4" />提交报修</Button></Link>} fab={{ href: "/customer/repairs/new", label: "提交报修" }} empty={false}>
      <DataTable columns={columns} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(row) => row.id as string} rowHref={(row) => `/customer/repairs/${row.id}`} emptyMessage="暂无报修记录" />
    </DataPage>
  );
}
