import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatCurrency } from "@/lib/utils";
import { RECEIVABLE_STATUS } from "@/lib/constants";
import Link from "next/link";
import type { ReceivableWithCustomer } from "@/lib/db/types";

// ─── Helpers ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  UNPAID: "warning",
  PARTIAL: "info",
  PAID: "success",
  OVERDUE: "danger",
  BAD_DEBT: "default",
  WAIVED: "default",
};

const TYPE_LABELS: Record<string, string> = {
  RENT: "租金",
  DEPOSIT: "押金",
  DAMAGE: "赔偿金",
  OTHER: "其他",
};

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  ...Object.entries(RECEIVABLE_STATUS).map(([k, v]) => ({ value: k, label: v })),
];

// ═══════════════════════════════════════════════════════════════════════

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    customerId?: string;
    receivableType?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const status = sp.status || "";
  const customerId = sp.customerId || "";
  const receivableType = sp.receivableType || "";
  const startDate = sp.startDate || "";
  const endDate = sp.endDate || "";

  // ── Fetch customers for filter dropdown ─────────────────────────────

  const { data: customers } = await supabase
    .from("customer")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  const customerOptions = [
    { value: "", label: "全部客户" },
    ...(customers ?? []).map((c) => ({ value: c.id as string, label: c.name as string })),
  ];

  // ── Build main data query ───────────────────────────────────────────

  let q = supabase
    .from("receivable")
    .select("*, customer:customer_id(name)", { count: "exact" });

  if (status) q = q.eq("status", status);
  if (customerId) q = q.eq("customer_id", customerId);
  if (receivableType) q = q.eq("receivable_type", receivableType);
  if (startDate) q = q.gte("due_date", startDate);
  if (endDate) q = q.lte("due_date", endDate);

  const { data, error, count } = await q
    .range((page - 1) * 20, page * 20 - 1)
    .order("due_date", { ascending: true });

  if (error) {
    return <DataPage title="应收账款" error={error.message}><></></DataPage>;
  }

  const receivables = (data ?? []) as ReceivableWithCustomer[];
  const totalPages = Math.ceil((count ?? 0) / 20);

  // ── Compute totals across all filtered results ──────────────────────

  let totalQ = supabase
    .from("receivable")
    .select("amount, paid_amount, unpaid_amount");

  if (status) totalQ = totalQ.eq("status", status);
  if (customerId) totalQ = totalQ.eq("customer_id", customerId);
  if (receivableType) totalQ = totalQ.eq("receivable_type", receivableType);
  if (startDate) totalQ = totalQ.gte("due_date", startDate);
  if (endDate) totalQ = totalQ.lte("due_date", endDate);

  const { data: allData } = await totalQ;
  const totals = {
    amount: (allData ?? []).reduce((s, r) => s + parseFloat(r.amount as string), 0),
    paid: (allData ?? []).reduce((s, r) => s + parseFloat(r.paid_amount as string), 0),
    unpaid: (allData ?? []).reduce((s, r) => s + parseFloat(r.unpaid_amount as string), 0),
  };

  // ── Build filter query for pagination links ─────────────────────────

  const filterParams = new URLSearchParams();
  if (status) filterParams.set("status", status);
  if (customerId) filterParams.set("customerId", customerId);
  if (receivableType) filterParams.set("receivableType", receivableType);
  if (startDate) filterParams.set("startDate", startDate);
  if (endDate) filterParams.set("endDate", endDate);
  const paginationQuery = filterParams.toString();
  const hasFilters = !!filterParams.toString();

  // ── Column definitions ──────────────────────────────────────────────

  const columns: Column<ReceivableWithCustomer>[] = [
    {
      id: "no",
      header: "应收编号",
      cell: (r) => {
        const isOverdue = (r.overdue_days ?? 0) > 0 || r.status === "OVERDUE";
        return (
          <span className={`font-mono text-sm ${isOverdue ? "border-l-2 border-red-500 pl-2 text-red-700 dark:text-red-400" : ""}`}>
            {r.receivable_no}
          </span>
        );
      },
    },
    {
      id: "customer",
      header: "客户",
      cell: (r) => r.customer?.name ?? "-",
    },
    {
      id: "type",
      header: "类型",
      cell: (r) => (
        <Badge variant="info">{TYPE_LABELS[r.receivable_type] ?? r.receivable_type}</Badge>
      ),
    },
    {
      id: "amount",
      header: "金额",
      cell: (r) => formatCurrency(r.amount),
      className: "tabular-nums",
    },
    {
      id: "paid_amount",
      header: "已付",
      cell: (r) => formatCurrency(r.paid_amount),
      className: "tabular-nums",
    },
    {
      id: "unpaid_amount",
      header: "未付",
      cell: (r) => {
        const unpaid = parseFloat(r.unpaid_amount);
        return (
          <span className={`tabular-nums font-medium ${unpaid > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
            {formatCurrency(r.unpaid_amount)}
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      id: "due_date",
      header: "到期日",
      cell: (r) => formatDate(r.due_date),
    },
    {
      id: "status",
      header: "状态",
      cell: (r) => (
        <Badge variant={STATUS_VARIANT[r.status] ?? "default"}>
          {RECEIVABLE_STATUS[r.status] ?? r.status}
        </Badge>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <DataPage
      title="应收账款"
      subtitle={`共 ${count ?? 0} 笔应收 · 管理所有应收款项`}
      empty={false}
      pagination={
        totalPages > 1
          ? { page, totalPages, baseUrl: "/finance/receivables", query: paginationQuery || undefined }
          : undefined
      }
    >

      {/* ── Filter form ──────────────────────────────────────────────── */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 pb-4 mb-4 border-b border-zinc-200 dark:border-zinc-700"
      >
        <Select name="customerId" options={customerOptions} label="客户" defaultValue={customerId} />
        <Select name="status" options={STATUS_OPTIONS} label="状态" defaultValue={status} />
        <Select name="receivableType" options={TYPE_OPTIONS} label="类型" defaultValue={receivableType} />
        <Input name="startDate" type="date" label="到期日起" defaultValue={startDate} />
        <Input name="endDate" type="date" label="到期日止" defaultValue={endDate} />
        <Button variant="default" type="submit">筛选</Button>
        {hasFilters && (
          <Link
            href="/finance/receivables"
            className="inline-flex h-10 items-center px-2 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            重置
          </Link>
        )}
      </form>

      {/* ── Data table ────────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={receivables}
        keyExtractor={(r) => r.id}
        rowHref={(r) => `/finance/receivables/${r.id}${paginationQuery ? `?${paginationQuery}` : ""}`}
        emptyMessage={hasFilters ? "未找到匹配结果，请调整筛选条件" : "暂无应收记录"}
        rowClassName={(r) =>
          r.status === "OVERDUE" || (r.overdue_days ?? 0) > 0
            ? "bg-red-50 dark:bg-red-900/10"
            : undefined
        }
      />

      {/* ── Totals summary row ────────────────────────────────────────── */}
      {receivables.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">汇总</span>
            <span className="tabular-nums">
              <span className="text-zinc-400">金额: </span>
              <span className="font-semibold">{formatCurrency(totals.amount)}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-zinc-400">已付: </span>
              <span className="font-semibold text-emerald-600">{formatCurrency(totals.paid)}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-zinc-400">未付: </span>
              <span className="font-semibold text-red-600">{formatCurrency(totals.unpaid)}</span>
            </span>
          </div>
        </div>
      )}
    </DataPage>
  );
}
