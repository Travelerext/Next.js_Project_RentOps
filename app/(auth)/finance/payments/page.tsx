import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DollarSign, Banknote, ArrowRight } from "lucide-react";
import Link from "next/link";
import { RecordPaymentButton } from "./record-payment-button";

// ─── Payment type helpers ──────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  RENT: "租金",
  DEPOSIT: "押金",
  REFUND: "退款",
  DAMAGE: "赔偿金",
  OTHER: "其他",
};

const PAYMENT_TYPE_VARIANTS: Record<
  string,
  "success" | "info" | "warning" | "danger" | "default"
> = {
  RENT: "success",
  DEPOSIT: "info",
  REFUND: "warning",
  DAMAGE: "danger",
  OTHER: "default",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "银行转账",
  CASH: "现金",
  CHECK: "支票",
  WECHAT: "微信支付",
  ALIPAY: "支付宝",
  OTHER: "其他",
};

// ─── Columns ──────────────────────────────────────────────────────────

const cols: Column<Record<string, unknown>>[] = [
  {
    id: "no",
    header: "流水号",
    cell: (p) => (
      <span className="font-mono text-sm">{p.payment_no as string}</span>
    ),
  },
  {
    id: "customer",
    header: "客户",
    cell: (p) =>
      ((p.customer as unknown as { name: string })?.name ?? "-"),
  },
  {
    id: "type",
    header: "类型",
    cell: (p) => {
      const t = p.payment_type as string;
      return (
        <Badge variant={PAYMENT_TYPE_VARIANTS[t] ?? "default"}>
          {PAYMENT_TYPE_LABELS[t] ?? t}
        </Badge>
      );
    },
  },
  {
    id: "method",
    header: "支付方式",
    cell: (p) => {
      const m = p.payment_method as string;
      return (
        <span className="text-zinc-600 dark:text-zinc-400">
          {PAYMENT_METHOD_LABELS[m] ?? m}
        </span>
      );
    },
    hideOnMobile: true,
  },
  {
    id: "amount",
    header: "金额",
    cell: (p) => (
      <span className="tabular-nums font-medium">
        {formatCurrency(p.amount as string)}
      </span>
    ),
    className: "text-right tabular-nums",
  },
  {
    id: "date",
    header: "收款日期",
    cell: (p) => formatDate(p.paid_at as string),
  },
];

// ═════════════════════════════════════════════════════════════════════════

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const pageSize = 20;

  // Fetch payments with pagination
  const [{ data, count }, { data: allPayments }] = await Promise.all([
    supabase
      .from("payment_record")
      .select("*, customer:customer_id(name)", { count: "exact" })
      .order("paid_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase
      .from("payment_record")
      .select("amount"),
  ]);

  const payments = (data ?? []) as Record<string, unknown>[];
  const totalAmount = (allPayments ?? []).reduce(
    (s, p) => s + parseFloat((p.amount as string) ?? "0"),
    0,
  );
  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <DataPage
      title="收款记录"
      subtitle={`共 ${totalCount} 条记录，合计 ${formatCurrency(totalAmount)}`}
      actions={
        <div className="flex items-center gap-2">
          <RecordPaymentButton />
          <Link
            href="/finance"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            <ArrowRight className="h-4 w-4" />
            返回财务工作台
          </Link>
        </div>
      }
      pagination={
        totalPages > 1
          ? { page, totalPages, baseUrl: "/finance/payments" }
          : undefined
      }
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
        <StatCard
          icon={DollarSign}
          label="收款总额"
          value={formatCurrency(totalAmount)}
          color="blue"
        />
        <StatCard
          icon={Banknote}
          label="收款笔数"
          value={totalCount}
          color="emerald"
        />
        <StatCard
          icon={DollarSign}
          label="本页合计"
          value={formatCurrency(
            payments.reduce(
              (s, p) => s + parseFloat((p.amount as string) ?? "0"),
              0,
            ),
          )}
          color="indigo"
        />
      </StatsGrid>

      <DataTable
        columns={cols}
        data={payments}
        keyExtractor={(p) => p.id as string}
        emptyMessage="暂无收款记录"
      />
    </DataPage>
  );
}
