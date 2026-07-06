import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmPredictiveSuggestionForm } from "@/lib/actions/operations";
import { formatDateTime } from "@/lib/utils";
import { statusVariant } from "@/lib/operation-labels";

const STATUS: Record<string, string> = {
  OPEN: "待确认",
  CONFIRMED: "已确认",
  DISMISSED: "已忽略",
  CLOSED: "已关闭",
};

export default async function PredictiveMaintenancePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("predictive_maintenance_suggestion")
    .select("*, equipment:equipment_id(equipment_no, name)")
    .order("suggested_at", { ascending: false });

  const rows = (data ?? []) as Record<string, unknown>[];
  const openCount = rows.filter((row) => row.status === "OPEN").length;
  const highRisk = rows.filter((row) => row.risk_level === "HIGH").length;

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "建议单号", cell: (row) => <span className="font-mono text-sm">{row.suggestion_no as string}</span> },
    {
      id: "equipment",
      header: "设备",
      cell: (row) => {
        const equipment = row.equipment as { equipment_no: string; name: string } | null;
        return equipment ? `${equipment.equipment_no} / ${equipment.name}` : "-";
      },
    },
    { id: "risk", header: "风险", cell: (row) => <Badge variant={statusVariant(row.risk_level as string)}>{row.risk_level as string}</Badge> },
    { id: "remaining", header: "剩余小时", cell: (row) => row.remaining_hours ? `${row.remaining_hours}h` : "-" },
    { id: "status", header: "状态", cell: (row) => <Badge variant={statusVariant(row.status as string)}>{STATUS[row.status as string] ?? row.status as string}</Badge> },
    { id: "time", header: "建议时间", cell: (row) => formatDateTime(row.suggested_at as string), hideOnMobile: true },
    {
      id: "action",
      header: "",
      cell: (row) => row.status === "OPEN" ? (
        <form action={confirmPredictiveSuggestionForm}>
          <input type="hidden" name="suggestionId" value={row.id as string} />
          <input type="hidden" name="redirectTo" value="/maintenance/predictive" />
          <Button size="sm" variant="outline" type="submit">生成工单</Button>
        </form>
      ) : row.work_order_id ? <Link href={`/maintenance/work-orders/${row.work_order_id}`} className="text-sm text-app-accent hover:underline">查看工单</Link> : null,
    },
  ];

  return (
    <DataPage title="预测性维护" subtitle="由遥测运行小时、故障码和健康评分触发的维护建议" empty={false}>
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={BrainCircuit} label="建议总数" value={rows.length} />
        <StatCard icon={BrainCircuit} label="待确认" value={openCount} color="amber" />
        <StatCard icon={BrainCircuit} label="高风险" value={highRisk} color="red" />
      </StatsGrid>
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.id as string} emptyMessage="暂无预测性维护建议" />
    </DataPage>
  );
}

