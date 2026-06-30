"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSparePart as consumeSparePartAction } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Search, Package, AlertTriangle, Loader2 } from "lucide-react";

interface PartOption {
  id: string; part_no: string; part_name: string;
  specification: string | null; current_stock: number;
  safety_stock: number; unit: string; unit_price: number | null;
}

interface Props {
  workOrderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PartsDialog({ workOrderId, open, onOpenChange }: Props) {
  const router = useRouter();
  const [parts, setParts] = useState<PartOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartOption | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setError("");
      setSelectedPart(null);
      setQuantity("1");
      setSearch("");
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let q = supabase.from("spare_part")
      .select("id, part_no, part_name, specification, current_stock, safety_stock, unit, unit_price")
      .eq("status", "ACTIVE").order("part_no").limit(50);
    if (search) q = q.or(`part_no.ilike.%${search}%,part_name.ilike.%${search}%`);
    q.then(({ data }) => {
      if (!cancelled) setParts((data ?? []) as PartOption[]);
    });
    return () => { cancelled = true; };
  }, [open, search, supabase]);

  async function handleConfirm() {
    if (!selectedPart) { setError("请选择配件"); return; }
    const qty = parseFloat(quantity);
    if (qty <= 0) { setError("数量必须大于0"); return; }
    if (qty > selectedPart.current_stock) { setError(`库存不足（当前: ${selectedPart.current_stock} ${selectedPart.unit}）`); return; }

    setLoading(true);
    setError("");
    const fd = new FormData();
    fd.set("partId", selectedPart.id);
    fd.set("quantity", quantity);
    const result = await consumeSparePartAction(workOrderId, fd);
    if (result.success) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="领用配件 — P1-09 配件领用流程">
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索配件编号或名称..."
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Parts list */}
        {parts.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {parts.map((p) => {
              const lowStock = p.current_stock <= p.safety_stock;
              const selected = selectedPart?.id === p.id;
              const price = p.unit_price ? formatCurrency(p.unit_price) : "未标价";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPart(p)}
                  className={`w-full text-left px-3 py-2.5 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                    selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs">{p.part_no}</span>
                      <span className="ml-2 font-medium">{p.part_name}</span>
                      {p.specification && <span className="ml-1 text-xs text-zinc-400">({p.specification})</span>}
                    </div>
                    <Badge variant={lowStock ? "danger" : "success"} className="text-[10px]">
                      库存: {p.current_stock} {p.unit}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                    <span>安全库存: {p.safety_stock}</span>
                    <span>单价: {price}</span>
                    {lowStock && <span className="text-red-500 flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" />库存不足</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-zinc-500">
            <Package className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
            未找到配件
          </div>
        )}

        {/* Selected part detail */}
        {selectedPart && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-zinc-500">配件编号</span><br /><span className="font-mono font-medium">{selectedPart.part_no}</span></div>
              <div><span className="text-zinc-500">当前库存</span><br /><span className={selectedPart.current_stock <= selectedPart.safety_stock ? "text-red-600 font-bold" : "font-medium"}>{selectedPart.current_stock} {selectedPart.unit}</span></div>
              <div><span className="text-zinc-500">单价</span><br /><span className="font-medium">{selectedPart.unit_price ? formatCurrency(selectedPart.unit_price) : "未标价"}</span></div>
              <div><span className="text-zinc-500">安全库存</span><br /><span>{selectedPart.safety_stock} {selectedPart.unit}</span></div>
              <div><span className="text-zinc-500">规格</span><br /><span>{selectedPart.specification ?? "-"}</span></div>
              <div><span className="text-zinc-500">预估金额</span><br /><span className="font-medium">{selectedPart.unit_price ? formatCurrency(selectedPart.unit_price * parseFloat(quantity || "1")) : "-"}</span></div>
            </div>
          </div>
        )}

        {/* Quantity */}
        <Input
          label="领用数量"
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={!selectedPart}
        />

        {/* Stock warning */}
        {selectedPart && parseFloat(quantity) > selectedPart.current_stock && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            库存不足！当前库存 {selectedPart.current_stock} {selectedPart.unit}，无法满足领用数量 {quantity}
          </div>
        )}

        {/* Low stock warning */}
        {selectedPart && parseFloat(quantity) <= selectedPart.current_stock && selectedPart.current_stock - parseFloat(quantity || "0") <= selectedPart.safety_stock && (
          <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            领用后库存将低于安全库存（{selectedPart.safety_stock} {selectedPart.unit}），请注意补货
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">
            {selectedPart ? `已选: ${selectedPart.part_name} × ${quantity || 0} ${selectedPart.unit}` : "请选择配件"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>取消</Button>
            <Button variant="primary" disabled={loading || !selectedPart || !quantity} onClick={handleConfirm}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />领用中...</> : "确认领用"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
