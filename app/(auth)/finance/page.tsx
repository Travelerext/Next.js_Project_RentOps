import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  DollarSign, AlertTriangle, Banknote, TrendingUp,
  CreditCard, RefreshCcw, ArrowRight, Percent,
} from "lucide-react";
import Link from "next/link";

// ─── Payment type labels ──────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  RENT: "租金",
  DEPOSIT: "押金",
  REFUND: "退款",
  DAMAGE: "赔偿金",
  OTHER: "其他",
};

// ═══════════════════════════════════════════════════════════════════════

export default async function FinanceDashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { data: allReceivables },
    { data: monthlyPayments },
    { count: pendingRefundCount },
    { data: depositRecords },
    { data: recentPayments },
  ] = await Promise.all([
    supabase.from("receivable").select("amount, paid_amount, unpaid_amount, status, due_date, overdue_days"),
    supabase.from("payment_record").select("amount").gte("paid_at", monthStart),
    supabase.from("refund_record").select("*", { count: "exact", head: true }).eq("refund_status", "PENDING_APPROVAL"),
    supabase.from("deposit_record").select("amount, available_amount, deposit_status")
      .in("deposit_status", ["PAID", "PARTIALLY_DEDUCTED", "REFUNDING"]),
    supabase.from("payment_record")
      .select("*, customer:customer_id(name)")
      .order("paid_at", { ascending: false })
      .limit(5),
  ]);

  // ── Compute aggregate values ────────────────────────────────────────

  const receivables = allReceivables ?? [];
  const totalReceivables = receivables.reduce((s, r) => s + parseFloat(r.amount as string), 0);
  const collectedAmount = receivables
    .filter((r) => r.status === "PAID")
    .reduce((s, r) => s + parseFloat(r.amount as string), 0);
  const outstandingAmount = receivables
    .filter((r) => ["UNPAID", "PARTIAL", "OVERDUE"].includes(r.status as string))
    .reduce((s, r) => s + parseFloat(r.unpaid_amount as string), 0);
  const overdueAmount = receivables
    .filter((r) => r.status === "OVERDUE")
    .reduce((s, r) => s + parseFloat(r.unpaid_amount as string), 0);
  const depositBalance = (depositRecords ?? []).reduce(
    (s, d) => s + parseFloat((d.available_amount ?? d.amount ?? "0") as string),
    0,
  );
  const monthlyRevenue = (monthlyPayments ?? []).reduce(
    (s, p) => s + parseFloat((p.amount as string) ?? "0"), 0
  );
  const collectionRate = totalReceivables > 0
    ? Math.round((collectedAmount / totalReceivables) * 100)
    : 0;

  // ── Aging buckets ───────────────────────────────────────────────────

  const aging: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  receivables
    .filter((r) => ["UNPAID", "PARTIAL", "OVERDUE"].includes(r.status as string))
    .forEach((r) => {
      const days = (r.overdue_days as number) ?? 0;
      const amt = parseFloat(r.unpaid_amount as string);
      if (days <= 30) aging["0-30"] += amt;
      else if (days <= 60) aging["31-60"] += amt;
      else if (days <= 90) aging["61-90"] += amt;
      else aging["90+"] += amt;
    });

  const payments = (recentPayments ?? []) as Record<string, unknown>[];
  const agingBuckets = [
    { label: "0 - 30 天", amount: aging["0-30"], color: "bg-emerald-500" },
    { label: "31 - 60 天", amount: aging["31-60"], color: "bg-amber-500" },
    { label: "61 - 90 天", amount: aging["61-90"], color: "bg-orange-500" },
    { label: "90 天以上", amount: aging["90+"], color: "bg-red-500" },
  ];

  return (
    <DashboardPage title="财务管理工作台" subtitle="应收账款、收款与退款概览">
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard icon={DollarSign} label="应收总额" value={formatCurrency(totalReceivables)} color="blue" />
        <StatCard icon={Banknote} label="已收金额" value={formatCurrency(collectedAmount)} color="emerald" />
        <StatCard icon={TrendingUp} label="未收金额" value={formatCurrency(outstandingAmount)} color="red" />
        <StatCard icon={AlertTriangle} label="逾期金额" value={formatCurrency(overdueAmount)} color="red" />
        <StatCard icon={CreditCard} label="押金余额" value={formatCurrency(depositBalance)} color="purple" />
        <StatCard icon={TrendingUp} label="本月营收" value={formatCurrency(monthlyRevenue)} color="emerald" />
        <StatCard icon={Percent} label="回款率" value={`${collectionRate}%`} color={collectionRate >= 80 ? "emerald" : collectionRate >= 50 ? "amber" : "red"} />
        <StatCard icon={RefreshCcw} label="待审批退款" value={pendingRefundCount ?? 0} color="amber" href="/finance/refunds" />
        <StatCard icon={DollarSign} label="快捷操作" color="indigo">
          <div className="mt-1 flex flex-wrap gap-1">
            <Link href="/finance/receivables" className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">应收</Link>
            <Link href="/finance/payments" className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">收款</Link>
            <Link href="/finance/deposits" className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">押金</Link>
            <Link href="/finance/refunds" className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">退款</Link>
            <Link href="/finance/settlement" className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">结算</Link>
            <Link href="/finance/equipment-profit" className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">利润</Link>
          </div>
        </StatCard>
      </StatsGrid>

      {/* ── Aging Summary + Recent Payments ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* Aging Summary */}
        <Card>
          <CardHeader>
            <CardTitle>应收账龄分析</CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 md:px-6 md:pb-6">
            <div className="space-y-3">
              {agingBuckets.map((bucket) => {
                const pct = outstandingAmount > 0 ? (bucket.amount / outstandingAmount) * 100 : 0;
                return (
                  <div key={bucket.label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">{bucket.label}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(bucket.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
                      <div
                        className={`h-full rounded-full ${bucket.color} transition-all`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>最近收款</CardTitle>
            <Link href="/finance/payments" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">客户</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">类型</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">金额</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {payments.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">暂无收款记录</td></tr>
                ) : (
                  payments.map((p) => {
                    const customer = p.customer as unknown as { name: string } | null;
                    return (
                      <tr key={p.id as string} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="px-4 py-2.5 font-medium">{customer?.name ?? "-"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="info">{PAYMENT_TYPE_LABELS[p.payment_type as string] ?? (p.payment_type as string)}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(p.amount as string)}</td>
                        <td className="px-4 py-2.5 text-zinc-500">{formatDate(p.paid_at as string)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </DashboardPage>
  );
}
