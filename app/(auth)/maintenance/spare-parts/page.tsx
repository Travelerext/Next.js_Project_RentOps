import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Package, AlertTriangle, DollarSign, TrendingDown, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

export default async function SparePartsPage() {
  const supabase = await createClient();

  // Get current user role
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = "";
  if (user) {
    const { data: p } = await supabase.from("profiles")
      .select("primary_role").eq("supabase_user_id", user.id).maybeSingle();
    userRole = p?.primary_role ?? "";
  }
  const canManage = userRole === "MAINTENANCE_SUPERVISOR" || userRole === "SYSTEM_ADMIN";

  const [{ data, count }, { data: allParts }] = await Promise.all([
    supabase.from("spare_part")
      .select("*, applicable_model:applicable_model_id(model_name)", { count: "exact" })
      .order("part_no").limit(100),
    supabase.from("spare_part").select("current_stock, safety_stock, unit_price"),
  ]);

  const parts = (data ?? []) as Record<string, unknown>[];
  const all = allParts ?? [] as Record<string, unknown>[];
  const lowStockCount = all.filter(p => Number(p.current_stock) <= Number(p.safety_stock)).length;
  const totalValue = all.reduce((sum, p) => sum + Number(p.current_stock) * Number(p.unit_price || 0), 0);
  const outOfStockCount = all.filter(p => Number(p.current_stock) <= 0).length;

  const cols: Column<Record<string, unknown>>[] = [
    { id: "part_no", header: "配件编号", cell: (p) => <span className="font-mono text-sm">{p.part_no as string}</span> },
    { id: "part_name", header: "配件名称", cell: (p) => <span className="font-medium">{p.part_name as string}</span> },
    { id: "spec", header: "规格型号", cell: (p) => (p.specification as string) ?? "-", hideOnMobile: true },
    {
      id: "stock", header: "当前库存", cell: (p) => {
        const stock = Number(p.current_stock);
        const safety = Number(p.safety_stock);
        return (
          <span className={stock <= safety ? "text-red-600 font-semibold tabular-nums" : "tabular-nums"}>
            {p.current_stock as string} {p.unit as string}
            {stock <= safety && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-red-500" />}
          </span>
        );
      },
    },
    { id: "safety", header: "安全库存", cell: (p) => `${p.safety_stock} ${p.unit}`, hideOnMobile: true },
    { id: "price", header: "单价", cell: (p) => formatCurrency(p.unit_price as string), className: "tabular-nums", hideOnMobile: true },
    {
      id: "status", header: "状态", cell: (p) => {
        const stock = Number(p.current_stock);
        const safety = Number(p.safety_stock);
        if (stock <= 0) return <Badge variant="danger">缺货</Badge>;
        if (stock <= safety) return <Badge variant="warning">库存不足</Badge>;
        return <Badge variant="success">正常</Badge>;
      },
    },
    { id: "model", header: "适用机型", cell: (p) => ((p.applicable_model as unknown as { model_name?: string })?.model_name ?? "-"), hideOnMobile: true },
  ];

  return (
    <DataPage
      title="配件库存"
      subtitle={`共 ${count ?? 0} 种配件`}
      actions={
        canManage ? (
          <Link href="/maintenance/spare-parts/new">
            <Button variant="primary"><Plus className="h-4 w-4" />添加配件</Button>
          </Link>
        ) : undefined
      }
      empty={false}
    >
      <StatsGrid cols={{ mobile: 1, desktop: 4 }}>
        <StatCard icon={Package} label="配件总数" value={count ?? 0} color="blue" />
        <StatCard icon={AlertTriangle} label="库存不足" value={lowStockCount} color={lowStockCount > 0 ? "red" : "emerald"} />
        <StatCard icon={DollarSign} label="库存总价值" color="emerald">
          <span className="text-lg font-bold">{formatCurrency(totalValue)}</span>
        </StatCard>
        <StatCard icon={TrendingDown} label="缺货配件" value={outOfStockCount} color={outOfStockCount > 0 ? "red" : "emerald"} />
      </StatsGrid>

      <div className="flex justify-end gap-2 mb-2">
        <Link href="/maintenance/spare-parts/movements" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          库存流水 <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <DataTable
        columns={cols}
        data={parts}
        keyExtractor={(p) => p.id as string}
        rowHref={(p) => `/maintenance/spare-parts/${p.id}`}
        rowClassName={(p) => Number(p.current_stock) <= Number(p.safety_stock) ? "bg-red-50/50 dark:bg-red-900/10" : ""}
        emptyMessage="暂无配件库存"
      />
    </DataPage>
  );
}
