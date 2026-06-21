import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { CREDIT_LEVELS, RISK_LEVELS } from "@/lib/constants";
import Link from "next/link";
import { Plus, Lock, Users } from "lucide-react";

// ─── Badge variant helpers ──────────────────────────────────────────────

const creditVariant = (level: string): "success" | "warning" | "info" | "danger" | "default" => {
  switch (level) {
    case "S": return "success";
    case "A": return "success";
    case "B": return "info";
    case "C": return "warning";
    case "D": return "danger";
    default: return "default";
  }
};

const riskVariant = (level: string): "success" | "warning" | "danger" | "info" | "default" => {
  switch (level) {
    case "LOW": return "success";
    case "MEDIUM": return "warning";
    case "HIGH": return "danger";
    case "CRITICAL": return "danger";
    default: return "default";
  }
};

const statusVariant = (status: string): "success" | "danger" | "default" => {
  return status === "ACTIVE" ? "success" : "danger";
};

// ─── Filter options ─────────────────────────────────────────────────────

const creditOptions = [
  { value: "", label: "全部信用等级" },
  ...Object.entries(CREDIT_LEVELS).map(([k, v]) => ({ value: k, label: v })),
];

const riskOptions = [
  { value: "", label: "全部风险等级" },
  ...Object.entries(RISK_LEVELS).map(([k, v]) => ({ value: k, label: v })),
];

const blacklistOptions = [
  { value: "", label: "全部" },
  { value: "yes", label: "黑名单" },
  { value: "no", label: "非黑名单" },
];

// ─── Column definitions ─────────────────────────────────────────────────

const columns: Column<Record<string, unknown>>[] = [
  {
    id: "customer_no",
    header: "客户编号",
    cell: (c) => c.customer_no as string,
    shareIdentity: (c) => `cust-${c.id}`,
  },
  {
    id: "name",
    header: "客户名称",
    cell: (c) => (
      <span className="font-medium flex items-center gap-1.5">
        {(c.lock_ordering as boolean) && <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" aria-label="已锁单" />}
        {c.name as string}
      </span>
    ),
  },
  {
    id: "contact",
    header: "联系人",
    cell: (c) => (
      <span className="text-sm">
        {c.contact_name ? `${c.contact_name}` : "-"}
        {c.contact_phone ? ` / ${c.contact_phone}` : ""}
      </span>
    ),
  },
  {
    id: "credit_level",
    header: "信用等级",
    cell: (c) => (
      <Badge variant={creditVariant(c.credit_level as string)}>
        {CREDIT_LEVELS[c.credit_level as string] ?? String(c.credit_level)}
      </Badge>
    ),
  },
  {
    id: "risk_level",
    header: "风险等级",
    cell: (c) => (
      <Badge variant={riskVariant(c.risk_level as string)}>
        {RISK_LEVELS[c.risk_level as string] ?? String(c.risk_level)}
      </Badge>
    ),
  },
  {
    id: "status",
    header: "状态",
    cell: (c) => {
      const badge = <Badge variant={statusVariant(c.status as string)}>{(c.status as string) === "ACTIVE" ? "正常" : "停用"}</Badge>;
      return c.is_blacklisted ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="danger">黑名单</Badge>
          {badge}
        </div>
      ) : badge;
    },
  },
  {
    id: "created_at",
    header: "创建时间",
    cell: (c) => formatDate(c.created_at as string),
    hideOnMobile: true,
  },
];

// ─── Row class name helper ──────────────────────────────────────────────

const rowClassName = (c: Record<string, unknown>): string | undefined => {
  if (c.is_blacklisted) return "bg-red-50 dark:bg-red-950/20";
  return undefined;
};

// ═══════════════════════════════════════════════════════════════════════

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    keyword?: string;
    riskLevel?: string;
    creditLevel?: string;
    blacklisted?: string;
  }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const kw = sp.keyword || "";
  const riskLevel = sp.riskLevel || "";
  const creditLevel = sp.creditLevel || "";
  const blacklisted = sp.blacklisted || "";
  const pageSize = 20;

  // ── Build query ──────────────────────────────────────────────────

  let query = supabase
    .from("customer")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (kw) {
    query = query.or(
      `name.ilike.%${kw}%,short_name.ilike.%${kw}%,customer_no.ilike.%${kw}%`,
    );
  }
  if (riskLevel) {
    query = query.eq("risk_level", riskLevel);
  }
  if (creditLevel) {
    query = query.eq("credit_level", creditLevel);
  }
  if (blacklisted === "yes") {
    query = query.eq("is_blacklisted", true);
  } else if (blacklisted === "no") {
    query = query.eq("is_blacklisted", false);
  }

  const { data, count } = await query
    .range((page - 1) * pageSize, page * pageSize - 1)
    .order("created_at", { ascending: false });

  const totalPages = Math.ceil((count ?? 0) / pageSize);

  // ── Build filter query string for pagination links ────────────────

  const filterParams = new URLSearchParams();
  if (kw) filterParams.set("keyword", kw);
  if (riskLevel) filterParams.set("riskLevel", riskLevel);
  if (creditLevel) filterParams.set("creditLevel", creditLevel);
  if (blacklisted) filterParams.set("blacklisted", blacklisted);
  const filterQuery = filterParams.toString();
  const hasFilters = !!filterQuery;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <DataPage
      title="客户管理"
      actions={
        <Link href="/sales/customers/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            新建客户
          </Button>
        </Link>
      }
      pagination={
        totalPages > 1
          ? {
              page,
              totalPages,
              baseUrl: "/sales/customers",
              query: filterQuery || undefined,
            }
          : undefined
      }
      fab={{ href: "/sales/customers/new", label: "新建客户" }}
      empty={false}
    >
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 pb-4 mb-4 border-b border-zinc-200 dark:border-zinc-700"
      >
        <Input
          name="keyword"
          defaultValue={kw}
          placeholder="客户名称 / 简称 / 编号"
          label="关键字"
        />
        <Select
          name="creditLevel"
          options={creditOptions}
          label="信用等级"
          defaultValue={creditLevel}
        />
        <Select
          name="riskLevel"
          options={riskOptions}
          label="风险等级"
          defaultValue={riskLevel}
        />
        <Select
          name="blacklisted"
          options={blacklistOptions}
          label="黑名单"
          defaultValue={blacklisted}
        />
        <Button variant="default" type="submit">
          筛选
        </Button>
        {hasFilters && (
          <Link
            href="/sales/customers"
            className="inline-flex items-center h-10 px-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            重置
          </Link>
        )}
      </form>

      {/* ── Data table or empty state ───────────────────────────── */}
      {(!data || data.length === 0) ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? "未找到匹配的客户" : "暂无客户数据"}
          description={
            hasFilters
              ? "请调整筛选条件后重试"
              : "点击下方按钮创建您的第一个客户"
          }
          action={
            !hasFilters ? (
              <Link href="/sales/customers/new">
                <Button variant="primary">
                  <Plus className="h-4 w-4" />
                  新建客户
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={(data ?? []) as Record<string, unknown>[]}
          keyExtractor={(c) => c.id as string}
          rowHref={(c) => `/sales/customers/${c.id}`}
          rowClassName={rowClassName}
          emptyMessage={
            hasFilters
              ? "未找到匹配的客户，请调整筛选条件"
              : "暂无客户数据"
          }
        />
      )}
    </DataPage>
  );
}
