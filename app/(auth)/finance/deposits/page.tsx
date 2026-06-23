import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Banknote, ArrowDownToLine, DollarSign } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付", PAID: "已付",
  PARTIALLY_DEDUCTED: "部分抵扣", FULLY_DEDUCTED: "全额抵扣",
  REFUNDING: "退款中", REFUNDED: "已退款", COMPLETED: "已完成",
};

const STATUS_VARIANTS: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  PENDING_PAYMENT: "warning", PAID: "success",
  PARTIALLY_DEDUCTED: "info", FULLY_DEDUCTED: "default",
  REFUNDING: "warning", REFUNDED: "success", COMPLETED: "default",
};

const cols: Column<Record<string, unknown>>[] = [
  { id: "no", header: "押金编号", cell: (d) => <span className="font-mono text-sm">{d.deposit_no as string}</span> },
  { id: "customer", header: "客户", cell: (d) => ((d.customer as unknown as { name: string })?.name ?? "-") },
  { id: "amount", header: "押金金额", cell: (d) => formatCurrency(d.amount as string), className: "tabular-nums" },
  { id: "paid", header: "已付", cell: (d) => formatCurrency(d.paid_amount as string), className: "tabular-nums", hideOnMobile: true },
  { id: "deducted", header: "已抵扣", cell: (d) => formatCurrency(d.deducted_amount as string), className: "tabular-nums", hideOnMobile: true },
  { id: "available", header: "可用余额", cell: (d) => <span className="font-semibold tabular-nums">{formatCurrency(d.available_amount as string)}</span> },
  { id: "status", header: "状态", cell: (d) => {
    const s = d.deposit_status as string;
    return <Badge variant={STATUS_VARIANTS[s] ?? "default"}>{STATUS_LABELS[s] ?? s}</Badge>;
  }},
  { id: "created", header: "创建时间", cell: (d) => formatDate(d.created_at as string), hideOnMobile: true },
];

export default async function DepositsPage() {
  const supabase = await createClient();

  const [{ data }, { data: allDeposits }] = await Promise.all([
    supabase.from("deposit_record").select("*, customer:customer_id(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("deposit_record").select("amount, paid_amount, deducted_amount, refunded_amount, available_amount, deposit_status"),
  ]);

  const total = (allDeposits ?? []).reduce((s, d) => s + parseFloat((d.amount as string) ?? "0"), 0);
  const available = (allDeposits ?? []).reduce((s, d) => s + parseFloat((d.available_amount as string) ?? "0"), 0);
  const refunding = (allDeposits ?? []).filter(d => d.deposit_status === "REFUNDING").length;

  return (
    <DataPage title="押金管理" empty={false}>
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard icon={Banknote} label="押金总额" color="blue">
          <span className="text-lg font-bold">{formatCurrency(total)}</span>
        </StatCard>
        <StatCard icon={DollarSign} label="可用余额" color="emerald">
          <span className="text-lg font-bold">{formatCurrency(available)}</span>
        </StatCard>
        <StatCard icon={ArrowDownToLine} label="退款中" value={refunding} color="amber" />
      </StatsGrid>
      <DataTable columns={cols} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(d) => d.id as string} rowHref={(d) => `/finance/deposits/${d.id}`} emptyMessage="暂无押金记录" />
    </DataPage>
  );
}
