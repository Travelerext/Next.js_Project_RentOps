import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ArrowRight,
  BarChart3,
  Trophy,
  Frown,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────

interface EquipmentProfit {
  id: string;
  equipment_no: string;
  name: string;
  status: string;
  purchase_price: number;
  /** Sum of rent from completed rental order items */
  totalRevenue: number;
  /** Sum of maintenance fees + parts fees from work orders */
  totalMaintenanceCost: number;
  /** Calculated monthly depreciation */
  monthlyDepreciation: number;
  /** Accumulated depreciation to date */
  accumulatedDepreciation: number;
  /** Total cost = maintenance + depreciation */
  totalCost: number;
  /** Revenue - cost */
  profit: number;
  /** profit / revenue * 100 */
  profitMargin: number;
}

// ─── Status labels ──────────────────────────────────────────────────────

const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "在库",
  RENTED: "已租出",
  PENDING_INSPECTION: "待验收",
  IN_MAINTENANCE: "维修中",
  IN_TRANSFER: "调拨中",
  LOCKED: "已锁定",
  SCRAPPED: "已报废",
};

// ═══════════════════════════════════════════════════════════════════════

export default async function EquipmentProfitPage() {
  const supabase = await createClient();

  const now = new Date();

  // 1. Fetch all equipment with purchase info
  const { data: equipmentRaw } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, status, purchase_price, depreciation_years, residual_rate, purchase_date")
    .is("deleted_at", null)
    .order("equipment_no");

  const equipmentList = (equipmentRaw ?? []) as Record<string, unknown>[];

  // 2. Fetch revenue from rental_order_item where item_status = 'RETURNED'
  //    Group by equipment_id, sum rent_amount
  const { data: orderItems } = await supabase
    .from("rental_order_item")
    .select("equipment_id, rent_amount")
    .eq("item_status", "RETURNED");

  const revenueMap = new Map<string, number>();
  for (const item of orderItems ?? []) {
    const eid = item.equipment_id as string;
    const amount = parseFloat(item.rent_amount as string) || 0;
    revenueMap.set(eid, (revenueMap.get(eid) ?? 0) + amount);
  }

  // 3. Fetch maintenance costs from maintenance_work_order
  //    Group by equipment_id, sum maintenance_fee + parts_fee
  const { data: workOrders } = await supabase
    .from("maintenance_work_order")
    .select("equipment_id, maintenance_fee, parts_fee")
    .in("status", ["COMPLETED", "VERIFIED", "CLOSED"]);

  const maintenanceCostMap = new Map<string, number>();
  for (const wo of workOrders ?? []) {
    const eid = wo.equipment_id as string;
    const mFee = parseFloat(wo.maintenance_fee as string) || 0;
    const pFee = parseFloat(wo.parts_fee as string) || 0;
    maintenanceCostMap.set(eid, (maintenanceCostMap.get(eid) ?? 0) + mFee + pFee);
  }

  // 4. Calculate profit per equipment
  const profitData: EquipmentProfit[] = equipmentList.map((eq) => {
    const eid = eq.id as string;
    const purchasePrice = parseFloat(eq.purchase_price as string) || 0;
    const depreciationYears = parseInt(eq.depreciation_years as string ?? "0", 10);
    const residualRate = parseFloat(eq.residual_rate as string ?? "0");
    const purchaseDate = eq.purchase_date ? new Date(eq.purchase_date as string) : null;

    // Monthly depreciation (straight-line)
    const monthlyDep =
      depreciationYears > 0
        ? (purchasePrice * (1 - residualRate / 100)) / (depreciationYears * 12)
        : 0;

    // Months elapsed since purchase
    const monthsElapsed = purchaseDate
      ? Math.max(0,
          (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
          now.getMonth() - purchaseDate.getMonth())
      : 0;

    const maxDep = purchasePrice * (1 - residualRate / 100);
    const accDep = Math.min(monthlyDep * monthsElapsed, maxDep);

    const totalRevenue = revenueMap.get(eid) ?? 0;
    const totalMaintCost = maintenanceCostMap.get(eid) ?? 0;
    const totalCost = totalMaintCost + accDep;
    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      id: eid,
      equipment_no: eq.equipment_no as string,
      name: eq.name as string,
      status: eq.status as string,
      purchase_price: purchasePrice,
      totalRevenue,
      totalMaintenanceCost: totalMaintCost,
      monthlyDepreciation: monthlyDep,
      accumulatedDepreciation: accDep,
      totalCost,
      profit,
      profitMargin,
    };
  });

  // Sort by profit descending
  profitData.sort((a, b) => b.profit - a.profit);

  // 5. Aggregate stats
  const totalRevenue = profitData.reduce((s, e) => s + e.totalRevenue, 0);
  const totalCost = profitData.reduce((s, e) => s + e.totalCost, 0);
  const totalProfit = profitData.reduce((s, e) => s + e.profit, 0);
  const profitableCount = profitData.filter((e) => e.profit > 0).length;
  const lossCount = profitData.filter((e) => e.profit < 0).length;
  const zeroCount = profitData.filter((e) => e.profit === 0).length;

  const highestProfit = profitData.length > 0 ? profitData[0] : null;
  const lowestProfit = profitData.length > 0 ? profitData[profitData.length - 1] : null;

  // 6. Column definitions
  const columns: Column<EquipmentProfit>[] = [
    {
      id: "equipment_no",
      header: "设备编号",
      cell: (e) => <span className="font-mono text-sm">{e.equipment_no}</span>,
    },
    {
      id: "name",
      header: "设备名称",
      cell: (e) => <span className="font-medium">{e.name}</span>,
    },
    {
      id: "revenue",
      header: "总收入",
      cell: (e) => (
        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCurrency(e.totalRevenue)}
        </span>
      ),
      className: "tabular-nums",
    },
    {
      id: "maintenance_cost",
      header: "维护成本",
      cell: (e) => (
        <span className="tabular-nums">
          {e.totalMaintenanceCost > 0
            ? formatCurrency(e.totalMaintenanceCost)
            : "¥0.00"}
        </span>
      ),
      className: "tabular-nums",
      hideOnMobile: true,
    },
    {
      id: "depreciation",
      header: "折旧成本",
      cell: (e) => (
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          {formatCurrency(e.accumulatedDepreciation)}
        </span>
      ),
      className: "tabular-nums",
      hideOnMobile: true,
    },
    {
      id: "total_cost",
      header: "总成本",
      cell: (e) => (
        <span className="tabular-nums text-red-600 dark:text-red-400">
          {formatCurrency(e.totalCost)}
        </span>
      ),
      className: "tabular-nums",
    },
    {
      id: "profit",
      header: "利润",
      cell: (e) => {
        const color =
          e.profit > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : e.profit < 0
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-500";
        return (
          <span className={`tabular-nums font-semibold ${color}`}>
            {formatCurrency(e.profit)}
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      id: "profit_margin",
      header: "利润率",
      cell: (e) => {
        const color =
          e.profitMargin > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : e.profitMargin < 0
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-500";
        return (
          <span className={`tabular-nums font-semibold ${color}`}>
            {e.totalRevenue > 0 ? `${e.profitMargin.toFixed(1)}%` : "-"}
          </span>
        );
      },
      className: "tabular-nums",
    },
    {
      id: "status",
      header: "状态",
      cell: (e) => {
        const label = EQUIPMENT_STATUS_LABELS[e.status] ?? e.status;
        const variant: "success" | "info" | "warning" | "danger" | "default" =
          e.status === "IN_STOCK"
            ? "success"
            : e.status === "RENTED"
              ? "info"
              : e.status === "IN_MAINTENANCE"
                ? "warning"
                : e.status === "SCRAPPED" || e.status === "LOCKED"
                  ? "danger"
                  : "default";
        return <Badge variant={variant}>{label}</Badge>;
      },
      hideOnMobile: true,
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <DataPage
      title="设备利润分析"
      subtitle="按设备维度分析租赁营收与成本"
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
      {/* ── Stats Cards ────────────────────────────────────────────────── */}
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard
          icon={DollarSign}
          label="总利润"
          value={formatCurrency(totalProfit)}
          color={totalProfit >= 0 ? "emerald" : "red"}
        />
        <StatCard
          icon={TrendingUp}
          label="总收入"
          value={formatCurrency(totalRevenue)}
          color="blue"
        />
        <StatCard
          icon={TrendingDown}
          label="总成本"
          value={formatCurrency(totalCost)}
          color="amber"
        />
        <StatCard
          icon={Package}
          label="设备数量"
          value={profitData.length}
          color="purple"
        />
      </StatsGrid>

      {/* ── Profit Summary Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-emerald-500" />
              盈利设备
            </CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {profitableCount}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              台设备盈利
            </p>
            {highestProfit && highestProfit.profit > 0 && (
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                最高利润：
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {highestProfit.name}（{formatCurrency(highestProfit.profit)}）
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Frown className="h-4 w-4 text-red-500" />
              亏损设备
            </CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
              {lossCount}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              台设备亏损
            </p>
            {lowestProfit && lowestProfit.profit < 0 && (
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                最低利润：
                <span className="font-medium text-red-600 dark:text-red-400">
                  {lowestProfit.name}（{formatCurrency(lowestProfit.profit)}）
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              整体利润率
            </CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {totalRevenue > 0
                ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}%`
                : "-"}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              综合利润率
            </p>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              零利润：{zeroCount} 台
            </div>
          </div>
        </Card>
      </div>

      {/* ── Data Table ──────────────────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        设备利润明细
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        收入来自已归还订单的租金，成本含维护费与累计折旧（P1简化计算）
      </p>

      <DataTable
        columns={columns}
        data={profitData}
        keyExtractor={(e) => e.id}
        emptyMessage="暂无设备利润数据"
        rowClassName={(e) =>
          e.profit < 0
            ? "bg-red-50/50 dark:bg-red-900/5"
            : e.profit === 0
              ? "bg-zinc-50/50 dark:bg-zinc-800/30"
              : undefined
        }
      />

      {/* ── Summary footer ──────────────────────────────────────────────── */}
      {profitData.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">汇总</span>
            <span className="tabular-nums">
              <span className="text-zinc-400">总收入: </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalRevenue)}
              </span>
            </span>
            <span className="tabular-nums">
              <span className="text-zinc-400">总成本: </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatCurrency(totalCost)}
              </span>
            </span>
            <span className="tabular-nums">
              <span className="text-zinc-400">总利润: </span>
              <span
                className={`font-semibold ${
                  totalProfit >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatCurrency(totalProfit)}
              </span>
            </span>
          </div>
        </div>
      )}
    </DataPage>
  );
}
