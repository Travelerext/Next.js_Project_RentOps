import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { VOUCHER_STATUS, statusVariant } from "@/lib/operation-labels";
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils";
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

type PaymentVoucherRow = Record<string, unknown> & {
  id: string;
  voucher_no: string;
  customer?: { name?: string } | null;
  receivable?: { receivable_no?: string } | null;
  receivable_id?: string | null;
  amount: string | number;
  payment_method?: string | null;
  bank_flow_no?: string | null;
  file_url?: string | null;
  status: string;
  created_at?: string | null;
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

function voucherColumns(): Column<PaymentVoucherRow>[] {
  return [
    {
      id: "no",
      header: "凭证号",
      cell: (v) => <span className="font-mono text-sm">{v.voucher_no}</span>,
    },
    {
      id: "customer",
      header: "客户",
      cell: (v) => v.customer?.name ?? "-",
    },
    {
      id: "receivable",
      header: "关联应收",
      cell: (v) => v.receivable_id ? (
        <Link href={`/finance/receivables/${v.receivable_id}`} className="text-app-accent hover:underline">
          {v.receivable?.receivable_no ?? "查看应收"}
        </Link>
      ) : "-",
      hideOnMobile: true,
    },
    {
      id: "amount",
      header: "金额",
      cell: (v) => <span className="tabular-nums font-medium">{formatCurrency(v.amount)}</span>,
      className: "text-right tabular-nums",
    },
    {
      id: "method",
      header: "付款方式",
      cell: (v) => PAYMENT_METHOD_LABELS[v.payment_method ?? ""] ?? v.payment_method ?? "-",
      hideOnMobile: true,
    },
    {
      id: "file",
      header: "凭证",
      cell: (v) => v.file_url ? (
        <Link href={v.file_url} className="text-app-accent hover:underline">
          查看凭证
        </Link>
      ) : "-",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "状态",
      cell: (v) => <Badge variant={statusVariant(v.status)}>{VOUCHER_STATUS[v.status] ?? v.status}</Badge>,
    },
    {
      id: "created",
      header: "提交时间",
      cell: (v) => formatDateTime(v.created_at),
      hideOnMobile: true,
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const tab = sp.tab === "vouchers" ? "vouchers" : "payments";
  const pageSize = 20;

  // Fetch payments with pagination
  const [{ data, count }, { data: allPayments }, { data: voucherData }] = await Promise.all([
    supabase
      .from("payment_record")
      .select("*, customer:customer_id(name)", { count: "exact" })
      .order("paid_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase
      .from("payment_record")
      .select("amount"),
    supabase
      .from("payment_voucher")
      .select("*, customer:customer_id(name), receivable:receivable_id(receivable_no)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const payments = (data ?? []) as Record<string, unknown>[];
  const vouchers = (voucherData ?? []) as PaymentVoucherRow[];
  const pendingVouchers = vouchers.filter((voucher) => voucher.status === "SUBMITTED");
  const totalAmount = (allPayments ?? []).reduce(
    (s, p) => s + parseFloat((p.amount as string) ?? "0"),
    0,
  );
  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <DataPage
      title={tab === "vouchers" ? "付款凭证审核" : "收款记录"}
      subtitle={tab === "vouchers" ? `待审核 ${pendingVouchers.length} 条 · 最近 ${vouchers.length} 条客户提交凭证` : `共 ${totalCount} 条记录，合计 ${formatCurrency(totalAmount)}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/finance/payments"
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium ${tab === "payments" ? "bg-app-accent text-app-accent-contrast" : "border border-app-border text-app-fg hover:bg-app-surface-muted"}`}
          >
            收款流水
          </Link>
          <Link
            href="/finance/payments?tab=vouchers"
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium ${tab === "vouchers" ? "bg-app-accent text-app-accent-contrast" : "border border-app-border text-app-fg hover:bg-app-surface-muted"}`}
          >
            凭证审核
          </Link>
          {tab === "payments" ? <RecordPaymentButton /> : null}
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
        tab === "payments" && totalPages > 1
          ? { page, totalPages, baseUrl: "/finance/payments" }
          : undefined
      }
      empty={false}
    >
      {tab === "vouchers" ? (
        <>
          <StatsGrid cols={{ mobile: 1, desktop: 3 }}>
            <StatCard icon={Banknote} label="待审核凭证" value={pendingVouchers.length} color="amber" />
            <StatCard icon={DollarSign} label="待审核金额" value={formatCurrency(pendingVouchers.reduce((sum, voucher) => sum + Number(voucher.amount ?? 0), 0))} color="blue" />
            <StatCard icon={Banknote} label="最近提交" value={vouchers.length} color="indigo" />
          </StatsGrid>
          <DataTable
            columns={voucherColumns()}
            data={vouchers}
            keyExtractor={(voucher) => voucher.id}
            rowHref={(voucher) => `/finance/payments/vouchers/${voucher.id}`}
            emptyMessage="暂无客户付款凭证"
          />
        </>
      ) : (
        <>
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
        </>
      )}
    </DataPage>
  );
}
