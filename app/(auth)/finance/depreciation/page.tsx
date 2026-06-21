import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Package,
  DollarSign,
  TrendingDown,
  PieChart,
  ArrowRight,
  Calculator,
} from "lucide-react";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────

const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "在库",
  RENTED: "已租出",
  PENDING_INSPECTION: "待验收",
  IN_MAINTENANCE: "维修中",
  IN_TRANSFER: "调拨中",
  LOCKED: "已锁定",
  SCRAPPED: "已报废",
};

const EQUIPMENT_STATUS_VARIANTS: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  IN_STOCK: "success",
  RENTED: "info",
  PENDING_INSPECTION: "warning",
  IN_MAINTENANCE: "warning",
  IN_TRANSFER: "info",
  LOCKED: "danger",
  SCRAPPED: "default",
};

interface EquipmentWithDepreciation {
  id: string;
  equipment_no: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  purchase_date: string | null;
  purchase_price: number;
  depreciation_years: number;
  residual_rate: number;
  current_residual_value: number;
  status: string;
  monthly_depreciation: number;
  accumulated_depreciation: number;
  net_book_value: number;
  months_elapsed: number;
}

interface CategorySummary {
  category_name: string;
  count: number;
  total_original_value: number;
  total_accumulated_depreciation: number;
  total_net_book_value: number;
  equipment: EquipmentWithDepreciation[];
}

// ═══════════════════════════════════════════════════════════════════════════

export default async function DepreciationPage() {
  const supabase = await createClient();

  // ── Fetch equipment with category join ────────────────────────────────

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select(
      "id, equipment_no, name, category_id, purchase_date, purchase_price, depreciation_years, residual_rate, current_residual_value, status, equipment_category!category_id(name)",
    )
    .eq("scrapped", false)
    .is("deleted_at", null)
    .not("purchase_price", "is", null)
    .order("equipment_no");

  if (error) {
    return (
      <DataPage title="设备折旧" error={error.message}>
        <></>
      </DataPage>
    );
  }

  if (!equipment?.length) {
    return (
      <DataPage
        title="设备折旧"
        subtitle="计算与管理设备折旧"
        actions={
          <Link
            href="/finance"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            <ArrowRight className="h-4 w-4" />
            返回财务工作台
          </Link>
        }
        empty={true}
        emptyMessage="暂无设备折旧数据，请先添加设备并设置采购价格"
      >
        <></>
      </DataPage>
    );
  }

  const now = new Date();

  // ── Calculate depreciation for each equipment item ────────────────────

  const processed: EquipmentWithDepreciation[] = equipment.map((e) => {
    const purchasePrice = parseFloat(e.purchase_price as string) || 0;
    const depreciationYears = parseInt(
      (e.depreciation_years as string) ?? "0",
      10,
    );
    const residualRate = parseFloat((e.residual_rate as string) ?? "0");

    // Monthly depreciation using straight-line method
    const monthlyDepreciation =
      depreciationYears > 0
        ? (purchasePrice * (1 - residualRate / 100)) /
          (depreciationYears * 12)
        : 0;

    // Months elapsed since purchase
    const purchaseDate = e.purchase_date
      ? new Date(e.purchase_date as string)
      : null;
    const monthsElapsed = purchaseDate
      ? Math.max(
          0,
          (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
            now.getMonth() -
            purchaseDate.getMonth(),
        )
      : 0;

    // Accumulated depreciation (never more than purchase_price - residual_value)
    const maxDepreciation = purchasePrice * (1 - residualRate / 100);
    const accumulatedDepreciation = Math.min(
      monthlyDepreciation * monthsElapsed,
      maxDepreciation,
    );

    // Net book value (minimum 0, minimum residual value)
    const netBookValue = Math.max(
      purchasePrice - accumulatedDepreciation,
      0,
    );

    const category = e.equipment_category as unknown as
      | { name: string }
      | null;

    return {
      id: e.id as string,
      equipment_no: e.equipment_no as string,
      name: e.name as string,
      category_id: e.category_id as string | null,
      category_name: category?.name ?? "未分类",
      purchase_date: e.purchase_date as string | null,
      purchase_price: purchasePrice,
      depreciation_years: depreciationYears,
      residual_rate: residualRate,
      current_residual_value:
        parseFloat((e.current_residual_value as string) ?? "0"),
      status: e.status as string,
      monthly_depreciation: monthlyDepreciation,
      accumulated_depreciation: accumulatedDepreciation,
      net_book_value: netBookValue,
      months_elapsed: monthsElapsed,
    };
  });

  // ── Compute overall statistics ────────────────────────────────────────

  const totalOriginalValue = processed.reduce(
    (s, e) => s + e.purchase_price,
    0,
  );
  const totalAccumulatedDepreciation = processed.reduce(
    (s, e) => s + e.accumulated_depreciation,
    0,
  );
  const totalNetBookValue = processed.reduce((s, e) => s + e.net_book_value, 0);
  const totalResidualValue = processed.reduce(
    (s, e) => s + e.current_residual_value,
    0,
  );

  // ── Group by category ─────────────────────────────────────────────────

  const categoryMap = new Map<string, CategorySummary>();

  for (const eq of processed) {
    const key = eq.category_name ?? "未分类";
    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        category_name: key,
        count: 0,
        total_original_value: 0,
        total_accumulated_depreciation: 0,
        total_net_book_value: 0,
        equipment: [],
      });
    }
    const summary = categoryMap.get(key)!;
    summary.count += 1;
    summary.total_original_value += eq.purchase_price;
    summary.total_accumulated_depreciation += eq.accumulated_depreciation;
    summary.total_net_book_value += eq.net_book_value;
    summary.equipment.push(eq);
  }

  const categorySummaries = Array.from(categoryMap.values()).sort((a, b) =>
    a.category_name.localeCompare(b.category_name),
  );

  // ── Table columns ─────────────────────────────────────────────────────

  const columns: Column<Record<string, unknown>>[] = [
    {
      id: "no",
      header: "设备编号",
      cell: (e) => (
        <span className="font-mono text-sm">{e.equipment_no as string}</span>
      ),
    },
    {
      id: "name",
      header: "设备名称",
      cell: (e) => (
        <span className="font-medium">{e.name as string}</span>
      ),
    },
    {
      id: "purchase_date",
      header: "购置日期",
      cell: (e) => formatDate(e.purchase_date as string),
      hideOnMobile: true,
    },
    {
      id: "purchase_price",
      header: "原值",
      cell: (e) => (
        <span className="tabular-nums">{formatCurrency(e.purchase_price as number)}</span>
      ),
      className: "tabular-nums",
      hideOnMobile: true,
    },
    {
      id: "depreciation_years",
      header: "年限",
      cell: (e) => `${e.depreciation_years as number}年`,
      hideOnMobile: true,
    },
    {
      id: "residual_rate",
      header: "残值率",
      cell: (e) => `${e.residual_rate as number}%`,
      hideOnMobile: true,
    },
    {
      id: "monthly_depreciation",
      header: "月折旧额",
      cell: (e) => (
        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
          {formatCurrency(e.monthly_depreciation as number)}
        </span>
      ),
      className: "tabular-nums",
    },
    {
      id: "accumulated_depreciation",
      header: "累计折旧",
      cell: (e) => (
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          {formatCurrency(e.accumulated_depreciation as number)}
        </span>
      ),
      className: "tabular-nums",
    },
    {
      id: "net_book_value",
      header: "账面净值",
      cell: (e) => {
        const nbv = e.net_book_value as number;
        return (
          <span
            className={`tabular-nums font-semibold ${
              nbv <= 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatCurrency(nbv)}
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      id: "status",
      header: "状态",
      cell: (e) => {
        const status = e.status as string;
        return (
          <Badge variant={EQUIPMENT_STATUS_VARIANTS[status] ?? "default"}>
            {EQUIPMENT_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <DataPage
      title="设备折旧"
      subtitle={`共 ${processed.length} 台设备 · 涵盖 ${categorySummaries.length} 个类别`}
      actions={
        <Link
          href="/finance"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowRight className="h-4 w-4" />
          返回财务工作台
        </Link>
      }
      empty={false}
    >
      {/* ── Overview stats cards ─────────────────────────────────────────── */}
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard
          icon={Package}
          label="设备数量"
          value={processed.length}
          color="blue"
        />
        <StatCard
          icon={DollarSign}
          label="原值总额"
          value={formatCurrency(totalOriginalValue)}
          color="amber"
        />
        <StatCard
          icon={TrendingDown}
          label="累计折旧"
          value={formatCurrency(totalAccumulatedDepreciation)}
          color="purple"
        />
        <StatCard
          icon={Calculator}
          label="账面净值"
          value={formatCurrency(totalNetBookValue)}
          color="emerald"
        />
      </StatsGrid>

      {/* ── Depreciation rate bar ────────────────────────────────────────── */}
      {totalOriginalValue > 0 && (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <PieChart className="h-4 w-4" />
            <span>综合折旧率</span>
            <span className="ml-auto tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
              {((totalAccumulatedDepreciation / totalOriginalValue) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
              style={{
                width: `${Math.min(
                  (totalAccumulatedDepreciation / totalOriginalValue) * 100,
                  100,
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>{formatCurrency(0)}</span>
            <span>{formatCurrency(totalOriginalValue)}</span>
          </div>
        </div>
      )}

      {/* ── Category sections ────────────────────────────────────────────── */}
      {categorySummaries.map((category) => {
        const originalValue = category.total_original_value;
        const depreciationPct =
          originalValue > 0
            ? ((category.total_accumulated_depreciation / originalValue) * 100).toFixed(1)
            : "0.0";

        return (
          <div key={category.category_name} className="mb-8">
            {/* Category header with summary */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {category.category_name}
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  {category.count}台
                </span>
              </h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="tabular-nums">
                  原值 <strong className="text-zinc-700 dark:text-zinc-200">{formatCurrency(category.total_original_value)}</strong>
                </span>
                <span className="tabular-nums">
                  折旧 <strong className="text-amber-600 dark:text-amber-400">{formatCurrency(category.total_accumulated_depreciation)}</strong>
                </span>
                <span className="tabular-nums">
                  净值 <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(category.total_net_book_value)}</strong>
                </span>
                <span className="tabular-nums">
                  折旧率 <strong>{depreciationPct}%</strong>
                </span>
              </div>
            </div>

            {/* Category depreciation mini-bar */}
            {originalValue > 0 && (
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{
                    width: `${Math.min(
                      (category.total_accumulated_depreciation / originalValue) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            )}

            {/* Equipment data table */}
            <DataTable
              columns={columns}
              data={category.equipment as unknown as Record<string, unknown>[]}
              keyExtractor={(e) => e.id as string}
              emptyMessage="该类别暂无设备"
              rowClassName={() =>
                "border-l-2 border-l-transparent hover:border-l-blue-400 transition-colors"
              }
            />
          </div>
        );
      })}

      {/* ── Overall totals footer ─────────────────────────────────────────── */}
      <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="mb-1 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            汇总统计
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="tabular-nums">
            <span className="text-zinc-400">设备总数: </span>
            <span className="font-semibold">{processed.length}台</span>
          </span>
          <span className="tabular-nums">
            <span className="text-zinc-400">原值合计: </span>
            <span className="font-semibold">{formatCurrency(totalOriginalValue)}</span>
          </span>
          <span className="tabular-nums">
            <span className="text-zinc-400">累计折旧: </span>
            <span className="font-semibold text-amber-600">{formatCurrency(totalAccumulatedDepreciation)}</span>
          </span>
          <span className="tabular-nums">
            <span className="text-zinc-400">账面净值: </span>
            <span className="font-semibold text-emerald-600">{formatCurrency(totalNetBookValue)}</span>
          </span>
          <span className="tabular-nums">
            <span className="text-zinc-400">残值合计: </span>
            <span className="font-semibold">{formatCurrency(totalResidualValue)}</span>
          </span>
        </div>
      </div>
    </DataPage>
  );
}
