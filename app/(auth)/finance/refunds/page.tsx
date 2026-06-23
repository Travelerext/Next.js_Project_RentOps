import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowDownToLine, CheckCircle, Clock, Ban } from "lucide-react";
import { ApproveRefundButton, RejectRefundButton, ExecuteRefundButton } from "./refund-actions";

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", REFUNDED: "已退款",
};

const STATUS_VARIANTS: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  PENDING_APPROVAL: "warning", APPROVED: "info", REJECTED: "danger", REFUNDED: "success",
};

const cols: Column<Record<string, unknown>>[] = [
  { id: "no", header: "退款编号", cell: (r) => <span className="font-mono text-sm">{r.refund_no as string}</span> },
  { id: "customer", header: "客户", cell: (r) => ((r.customer as unknown as { name: string })?.name ?? "-") },
  { id: "amount", header: "退款金额", cell: (r) => <span className="font-semibold tabular-nums">{formatCurrency(r.refund_amount as string)}</span> },
  { id: "method", header: "退款方式", cell: (r) => r.refund_method as string, hideOnMobile: true },
  { id: "status", header: "状态", cell: (r) => {
    const s = r.refund_status as string;
    return <Badge variant={STATUS_VARIANTS[s] ?? "default"}>{STATUS_LABELS[s] ?? s}</Badge>;
  }},
  { id: "reason", header: "原因", cell: (r) => ((r.reason as string)?.length > 30 ? `${(r.reason as string).slice(0, 30)}...` : (r.reason as string)) ?? "-", hideOnMobile: true },
  { id: "created", header: "创建时间", cell: (r) => formatDate(r.created_at as string), hideOnMobile: true },
  { id: "actions", header: "操作", cell: (r) => {
    const status = r.refund_status as string;
    const id = r.id as string;
    if (status === "PENDING_APPROVAL") return <div className="flex gap-1"><ApproveRefundButton refundId={id} /><RejectRefundButton refundId={id} /></div>;
    if (status === "APPROVED") return <ExecuteRefundButton refundId={id} />;
    return null;
  }},
];

export default async function RefundsPage() {
  const supabase = await createClient();

  const [{ data }, { data: allRefunds }] = await Promise.all([
    supabase.from("refund_record").select("*, customer:customer_id(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("refund_record").select("refund_amount, refund_status"),
  ]);

  const totalRefunded = (allRefunds ?? []).filter(r => r.refund_status === "REFUNDED").reduce((s, r) => s + parseFloat((r.refund_amount as string) ?? "0"), 0);
  const pendingCount = (allRefunds ?? []).filter(r => r.refund_status === "PENDING_APPROVAL").length;
  const rejectedCount = (allRefunds ?? []).filter(r => r.refund_status === "REJECTED").length;

  return (
    <DataPage title="退款管理" empty={false}>
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard icon={ArrowDownToLine} label="已退款总额" color="emerald">
          <span className="text-lg font-bold">{formatCurrency(totalRefunded)}</span>
        </StatCard>
        <StatCard icon={Clock} label="待审批" value={pendingCount} color="amber" />
        <StatCard icon={CheckCircle} label="退款记录" value={(allRefunds ?? []).length} color="blue" />
        <StatCard icon={Ban} label="已驳回" value={rejectedCount} color="red" />
      </StatsGrid>
      <DataTable columns={cols} data={(data ?? []) as Record<string, unknown>[]} keyExtractor={(r) => r.id as string} rowHref={(r) => `/finance/refunds/${r.id}`} emptyMessage="暂无退款记录" />
    </DataPage>
  );
}
