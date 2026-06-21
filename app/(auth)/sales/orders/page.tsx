import { createClient } from "@/lib/supabase/server";
import { DataTable, type Column } from "@/components/data/data-table";
import { DataPage } from "@/components/data/data-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS, ORDER_STATUS_VARIANTS } from "@/lib/constants";
import Link from "next/link";
import { Plus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  order_no: string;
  order_status: string;
  pricing_mode: string;
  total_rent_amount: string | number;
  planned_start_at: string | null;
  planned_end_at: string | null;
  created_at: string;
  customer: { name: string } | null;
};

const PRICING_MODE_LABEL: Record<string, string> = {
  HOURLY: "按小时",
  DAILY: "按天",
  MONTHLY: "按月",
  FIXED: "固定价",
  PROJECT_BASED: "按项目",
};

// ─── Columns ──────────────────────────────────────────────────────────

const cols: Column<OrderRow>[] = [
  {
    id: "no",
    header: "订单编号",
    cell: (o) => o.order_no,
    shareIdentity: (o) => `order-${o.id}`,
  },
  {
    id: "customer",
    header: "客户名称",
    cell: (o) => o.customer?.name ?? "-",
  },
  {
    id: "pricing",
    header: "计费方式",
    cell: (o) => PRICING_MODE_LABEL[o.pricing_mode] ?? o.pricing_mode,
    hideOnMobile: true,
  },
  {
    id: "amount",
    header: "租金总额",
    cell: (o) => formatCurrency(o.total_rent_amount),
    className: "tabular-nums",
  },
  {
    id: "status",
    header: "状态",
    cell: (o) => {
      const variant = (ORDER_STATUS_VARIANTS[o.order_status] ??
        "default") as "success" | "warning" | "danger" | "info" | "default";
      return (
        <Badge variant={variant}>
          {ORDER_STATUS[o.order_status] ?? o.order_status}
        </Badge>
      );
    },
  },
  {
    id: "dates",
    header: "计划租期",
    cell: (o) =>
      o.planned_start_at
        ? `${formatDate(o.planned_start_at)} ~ ${formatDate(o.planned_end_at)}`
        : "-",
    hideOnMobile: true,
  },
  {
    id: "created",
    header: "创建时间",
    cell: (o) => formatDate(o.created_at),
    hideOnMobile: true,
  },
];

// ─── Server Component ─────────────────────────────────────────────────

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status || "";
  const keyword = sp.keyword || "";
  const startDate = sp.startDate || "";
  const endDate = sp.endDate || "";
  const pageSize = 20;

  // Build query
  let query = supabase
    .from("rental_order")
    .select("*, customer:customer_id(name)", { count: "exact" })
    .is("deleted_at", null);

  if (status) {
    query = query.eq("order_status", status);
  }

  if (keyword) {
    query = query.or(
      `order_no.ilike.%${keyword}%,customer.name.ilike.%${keyword}%`
    );
  }

  if (startDate) {
    query = query.gte("created_at", new Date(startDate).toISOString());
  }

  if (endDate) {
    query = query.lte(
      "created_at",
      new Date(endDate + "T23:59:59").toISOString()
    );
  }

  const { data, count } = await query
    .range((page - 1) * pageSize, page * pageSize - 1)
    .order("created_at", { ascending: false });

  const totalPages = Math.ceil((count ?? 0) / pageSize);
  const orders = (data ?? []) as unknown as OrderRow[];

  // Build query string for pagination links
  const queryParts: string[] = [];
  if (status) queryParts.push(`status=${encodeURIComponent(status)}`);
  if (keyword) queryParts.push(`keyword=${encodeURIComponent(keyword)}`);
  if (startDate) queryParts.push(`startDate=${encodeURIComponent(startDate)}`);
  if (endDate) queryParts.push(`endDate=${encodeURIComponent(endDate)}`);
  const queryString = queryParts.join("&");

  return (
    <DataPage
      title="租赁订单"
      actions={
        <Link href="/sales/orders/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            创建订单
          </Button>
        </Link>
      }
      pagination={
        totalPages > 1
          ? {
              page,
              totalPages,
              baseUrl: "/sales/orders",
              query: queryString,
            }
          : undefined
      }
      fab={{ href: "/sales/orders/new", label: "创建订单" }}
      empty={count === 0 && !keyword && !status}
      emptyMessage={
        keyword || status
          ? "未找到匹配结果，请调整筛选条件"
          : "暂无订单数据"
      }
    >
      {/* Filter bar */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="keyword"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            关键词搜索
          </label>
          <input
            id="keyword"
            name="keyword"
            defaultValue={keyword}
            placeholder="订单号 / 客户名"
            className="flex h-9 w-48 rounded-lg border border-zinc-300 bg-white px-3 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="status"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            订单状态
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="flex h-9 w-36 rounded-lg border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">全部状态</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="startDate"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            开始日期
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={startDate}
            className="flex h-9 w-36 rounded-lg border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="endDate"
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            结束日期
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={endDate}
            className="flex h-9 w-36 rounded-lg border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
        >
          筛选
        </button>

        {queryString && (
          <Link
            href="/sales/orders"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            清除
          </Link>
        )}
      </form>

      {/* Table with overdue highlighting */}
      <DataTable
        columns={cols}
        data={orders}
        keyExtractor={(o) => o.id}
        rowHref={(o) => `/sales/orders/${o.id}`}
        rowClassName={(o) =>
          o.order_status === "OVERDUE"
            ? "text-red-600 font-medium dark:text-red-400"
            : undefined
        }
        emptyMessage={
          keyword || status ? "未找到匹配结果，请调整筛选条件" : "暂无订单数据"
        }
      />
    </DataPage>
  );
}
