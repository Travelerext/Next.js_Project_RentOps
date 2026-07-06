import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { INSURANCE_STATUS, statusVariant } from "@/lib/operation-labels";

export default async function InsurancePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_insurance_policy")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("end_date", { ascending: true });

  const rows = (data ?? []) as Record<string, unknown>[];
  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const cutoffTime = new Date().getTime() + 30 * 86400000;
  const expiring = rows.filter((row) => row.status === "ACTIVE" && new Date(row.end_date as string).getTime() <= cutoffTime).length;
  const premium = rows.reduce((sum, row) => sum + Number(row.premium_amount ?? 0), 0);

  const columns: Column<Record<string, unknown>>[] = [
    { id: "policy_no", header: "保单号", cell: (row) => <span className="font-mono text-sm">{row.policy_no as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "insurer", header: "保险公司", cell: (row) => row.insurer_name as string },
    { id: "premium", header: "保费", cell: (row) => formatCurrency(row.premium_amount as string), className: "tabular-nums" },
    { id: "period", header: "有效期", cell: (row) => `${formatDate(row.start_date as string)} - ${formatDate(row.end_date as string)}`, hideOnMobile: true },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{INSURANCE_STATUS[row.status as string] ?? row.status as string}</Badge> },
  ];

  return (
    <DataPage
      title="保险管理"
      subtitle="设备保单、到期提醒、成本分摊和理赔"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/insurance/claims"><Button variant="outline">理赔管理</Button></Link>
          <Link href="/finance/insurance/new"><Button variant="primary"><Plus className="h-4 w-4" />新建保单</Button></Link>
        </div>
      }
      fab={{ href: "/finance/insurance/new", label: "新建保单" }}
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={Shield} label="有效保单" value={active} />
        <StatCard icon={Shield} label="30天内到期" value={expiring} color="amber" />
        <StatCard icon={Shield} label="总保费" value={formatCurrency(premium)} color="indigo" />
      </StatsGrid>
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.id as string} rowHref={(row) => `/finance/insurance/${row.id}`} emptyMessage="暂无保单" />
    </DataPage>
  );
}
