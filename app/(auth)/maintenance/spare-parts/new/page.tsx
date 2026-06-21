"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createSparePart } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Loader2, Boxes, Package } from "lucide-react";
import Link from "next/link";

interface ModelOption {
  id: string; model_name: string; brand: string | null;
}

interface WarehouseOption {
  id: string; name: string;
}

const UNIT_OPTIONS = [
  { value: "PIECE", label: "个 (PIECE)" },
  { value: "SET", label: "套 (SET)" },
  { value: "KG", label: "千克 (KG)" },
  { value: "L", label: "升 (L)" },
  { value: "M", label: "米 (M)" },
  { value: "PAIR", label: "对 (PAIR)" },
  { value: "BOX", label: "箱 (BOX)" },
  { value: "ROLL", label: "卷 (ROLL)" },
];

export default function NewSparePartPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields
  const [partNo, setPartNo] = useState("");
  const [partName, setPartName] = useState("");
  const [specification, setSpecification] = useState("");
  const [unit, setUnit] = useState("PIECE");
  const [unitPrice, setUnitPrice] = useState("");
  const [safetyStock, setSafetyStock] = useState("0");
  const [initialStock, setInitialStock] = useState("0");

  // Model search
  const [modelSearch, setModelSearch] = useState("");
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);

  // Warehouse search
  const [whSearch, setWhSearch] = useState("");
  const [whList, setWhList] = useState<WarehouseOption[]>([]);
  const [selectedWh, setSelectedWh] = useState<WarehouseOption | null>(null);

  // Search equipment models
  const searchModels = useCallback(async () => {
    let q = supabase.from("equipment_model")
      .select("id, model_name, brand")
      .order("model_name").limit(20);
    if (modelSearch) q = q.ilike("model_name", `%${modelSearch}%`);
    const { data } = await q;
    setModelList((data ?? []) as ModelOption[]);
  }, [modelSearch, supabase]);

  useEffect(() => { searchModels(); }, [searchModels]);

  // Search warehouses
  const searchWarehouses = useCallback(async () => {
    let q = supabase.from("warehouse")
      .select("id, name")
      .eq("enabled", true)
      .order("name").limit(20);
    if (whSearch) q = q.ilike("name", `%${whSearch}%`);
    const { data } = await q;
    setWhList((data ?? []) as WarehouseOption[]);
  }, [whSearch, supabase]);

  useEffect(() => { searchWarehouses(); }, [searchWarehouses]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!partNo.trim()) { setError("请输入配件编号"); return; }
    if (!partName.trim()) { setError("请输入配件名称"); return; }

    setLoading(true);
    setError("");
    setFieldErrors({});

    const formData = new FormData();
    formData.set("partNo", partNo);
    formData.set("partName", partName);
    if (specification) formData.set("specification", specification);
    formData.set("unit", unit);
    if (unitPrice) formData.set("unitPrice", unitPrice);
    formData.set("safetyStock", safetyStock || "0");
    formData.set("initialStock", initialStock || "0");
    if (selectedModel) formData.set("applicableModelId", selectedModel.id);
    if (selectedWh) formData.set("warehouseId", selectedWh.id);

    const result = await createSparePart(formData);
    if (result.success) {
      router.push("/maintenance/spare-parts");
      router.refresh();
    } else {
      setError(result.error);
      if (result.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(result.fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length > 0) flat[key] = msgs[0];
        }
        setFieldErrors(flat);
      }
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="添加配件" subtitle="录入新的配件库存信息" backUrl="/maintenance/spare-parts" />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" />配件信息</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part No + Part Name */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="partNo"
              label="配件编号 *"
              value={partNo}
              onChange={(e) => setPartNo(e.target.value)}
              placeholder="如：PT-001"
              error={fieldErrors.partNo}
              required
              autoFocus
            />
            <Input
              id="partName"
              label="配件名称 *"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="如：液压油滤芯"
              error={fieldErrors.partName}
              required
            />
          </div>

          {/* Specification + Unit */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="specification"
              label="规格型号"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              placeholder="如：SY215适配、EX200-5专用"
            />
            <Select
              id="unit"
              label="计量单位"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={UNIT_OPTIONS}
            />
          </div>

          {/* Unit Price + Safety Stock + Initial Stock */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id="unitPrice"
              label="单价 (元)"
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
            <Input
              id="safetyStock"
              label="安全库存"
              type="number"
              min={0}
              value={safetyStock}
              onChange={(e) => setSafetyStock(e.target.value)}
              placeholder="0"
            />
            <Input
              id="initialStock"
              label="期初库存"
              type="number"
              min={0}
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Applicable Model */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              适用机型
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="搜索机型..."
                className="pl-9"
              />
            </div>
            {modelList.length > 0 && !selectedModel && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {modelList.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setSelectedModel(m); setModelSearch(`${m.model_name}${m.brand ? ` (${m.brand})` : ""}`); }}
                    className="w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="font-medium">{m.model_name}</span>
                    {m.brand && <span className="ml-2 text-xs text-zinc-400">{m.brand}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedModel && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-800 dark:bg-blue-900/20">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{selectedModel.model_name}</span>
                {selectedModel.brand && <span className="text-xs text-zinc-500">{selectedModel.brand}</span>}
                <button type="button" onClick={() => { setSelectedModel(null); setModelSearch(""); }}
                  className="ml-auto text-xs text-blue-600 hover:underline">清除</button>
              </div>
            )}
          </div>

          {/* Warehouse */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              所属仓库
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                value={whSearch}
                onChange={(e) => setWhSearch(e.target.value)}
                placeholder="搜索仓库..."
                className="pl-9"
              />
            </div>
            {whList.length > 0 && !selectedWh && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {whList.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { setSelectedWh(w); setWhSearch(w.name); }}
                    className="w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
            {selectedWh && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-800 dark:bg-blue-900/20">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{selectedWh.name}</span>
                <button type="button" onClick={() => { setSelectedWh(null); setWhSearch(""); }}
                  className="ml-auto text-xs text-blue-600 hover:underline">清除</button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2" role="alert">
              <Boxes className="h-4 w-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link href="/maintenance/spare-parts">
              <Button variant="outline" type="button">取消</Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />添加中...</> : "添加配件"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
