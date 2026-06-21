"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { updateSparePart, stockInSparePart, deleteSparePart } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, Save, Package, Boxes, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { SparePartData } from "./page";

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

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "启用" },
  { value: "INACTIVE", label: "停用" },
  { value: "OUT_OF_STOCK", label: "缺货" },
];

export function EditSparePartForm({ part, canManage }: { part: SparePartData; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form fields — initialized from part data
  const [partName, setPartName] = useState(part.part_name);
  const [specification, setSpecification] = useState(part.specification ?? "");
  const [unit, setUnit] = useState(part.unit ?? "PIECE");
  const [unitPrice, setUnitPrice] = useState(part.unit_price != null ? String(part.unit_price) : "");
  const [safetyStock, setSafetyStock] = useState(String(part.safety_stock));
  const [status, setStatus] = useState(part.status ?? "ACTIVE");
  // Stock-in form
  const [stockInQty, setStockInQty] = useState("");
  const [stockInPrice, setStockInPrice] = useState(part.unit_price != null ? String(part.unit_price) : "");
  const [stockInLoading, setStockInLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [stockInError, setStockInError] = useState("");
  const [stockInSuccess, setStockInSuccess] = useState("");

  async function handleStockIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stockInQty || Number(stockInQty) <= 0) { setStockInError("请输入有效的入库数量"); return; }

    setStockInLoading(true);
    setStockInError("");
    setStockInSuccess("");

    const formData = new FormData(e.currentTarget);
    const result = await stockInSparePart(formData);
    if (result.success) {
      setStockInSuccess(`成功入库 ${stockInQty} ${unit}，当前库存：${stock + Number(stockInQty)} ${unit}`);
      setStockInQty("");
      router.refresh();
    } else {
      setStockInError(result.error);
    }
    setStockInLoading(false);
  }

  // Model search
  const [modelSearch, setModelSearch] = useState(
    part.applicable_model ? `${part.applicable_model.model_name}${part.applicable_model.brand ? ` (${part.applicable_model.brand})` : ""}` : ""
  );
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(
    part.applicable_model ? { id: part.applicable_model.id, model_name: part.applicable_model.model_name, brand: part.applicable_model.brand } : null
  );

  // Warehouse search
  const [whSearch, setWhSearch] = useState(part.warehouse?.name ?? "");
  const [whList, setWhList] = useState<WarehouseOption[]>([]);
  const [selectedWh, setSelectedWh] = useState<WarehouseOption | null>(
    part.warehouse ? { id: part.warehouse.id, name: part.warehouse.name } : null
  );

  // Search models
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
    if (!partName.trim()) { setError("配件名称不能为空"); return; }

    setLoading(true);
    setError("");
    setSuccess("");
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const result = await updateSparePart(formData);
    if (result.success) {
      setSuccess("配件信息已更新");
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

  const stock = Number(part.current_stock);
  const safety = Number(part.safety_stock);
  const stockStatus = stock <= 0 ? "danger" : stock <= safety ? "warning" : "success";
  const stockLabel = stock <= 0 ? "缺货" : stock <= safety ? "库存不足" : "正常";

  async function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }

    setDeleteLoading(true);
    const result = await deleteSparePart(part.id);
    if (result.success) {
      router.push("/maintenance/spare-parts");
      router.refresh();
    } else {
      setError(result.error);
      setDeleteConfirm(false);
    }
    setDeleteLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back */}
      <Link href="/maintenance/spare-parts" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" />返回配件列表
      </Link>

      {/* Read-only info card */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />基本信息</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">配件编号</span>
            <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{part.part_no}</p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">当前库存</span>
            <p className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              {part.current_stock} {part.unit}
              <Badge variant={stockStatus}>{stockLabel}</Badge>
            </p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">库存价值</span>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatCurrency(stock * (part.unit_price ?? 0))}
            </p>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">创建时间</span>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{formatDate(part.created_at)}</p>
          </div>
        </div>
      </Card>

      {/* Stock-In card */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUp className="h-5 w-5 text-emerald-600" />配件入库</CardTitle></CardHeader>
        <form onSubmit={handleStockIn} className="space-y-4">
          <input type="hidden" name="partId" value={part.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="stockInQty"
              name="quantity"
              label={`入库数量 * (${unit})`}
              type="number"
              min={1}
              step="0.01"
              value={stockInQty}
              onChange={(e) => setStockInQty(e.target.value)}
              placeholder={`增加库存数量，当前库存：${part.current_stock}`}
              required
            />
            <Input
              id="stockInPrice"
              name="unitPrice"
              label="入库单价 (元)"
              type="number"
              min={0}
              step="0.01"
              value={stockInPrice}
              onChange={(e) => setStockInPrice(e.target.value)}
              placeholder={part.unit_price != null ? `当前单价：${part.unit_price}` : "入库采购单价"}
            />
          </div>

          {stockInError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400" role="alert">{stockInError}</div>
          )}
          {stockInSuccess && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-center gap-2">
              <ArrowUp className="h-4 w-4" />{stockInSuccess}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary" disabled={stockInLoading}>
              {stockInLoading ? <><Loader2 className="h-4 w-4 animate-spin" />入库中...</> : <><Plus className="h-4 w-4" />确认入库</>}
            </Button>
          </div>
        </form>
      </Card>

      {/* Edit form — only supervisors & admins */}
      {canManage && (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" />编辑配件</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="partId" value={part.id} />
          {/* Part Name + Specification */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="partName"
              name="partName"
              label="配件名称 *"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="配件名称"
              error={fieldErrors.partName}
              required
            />
            <Input
              id="specification"
              name="specification"
              label="规格型号"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              placeholder="如：SY215适配、EX200-5专用"
            />
          </div>

          {/* Unit + Unit Price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="unit"
              name="unit"
              label="计量单位"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              options={UNIT_OPTIONS}
            />
            <Input
              id="unitPrice"
              name="unitPrice"
              label="单价 (元)"
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Safety Stock + Status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="safetyStock"
              name="safetyStock"
              label="安全库存"
              type="number"
              min={0}
              value={safetyStock}
              onChange={(e) => setSafetyStock(e.target.value)}
              placeholder="0"
            />
            <Select
              id="status"
              name="status"
              label="状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={STATUS_OPTIONS}
            />
          </div>

          {/* Applicable Model */}
          <div>
            <input type="hidden" name="applicableModelId" value={selectedModel?.id ?? ""} />
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
            <input type="hidden" name="warehouseId" value={selectedWh?.id ?? ""} />
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

          {/* Error / Success */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2" role="alert">
              <Boxes className="h-4 w-4 mt-0.5 shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-center gap-2">
              <Save className="h-4 w-4" />{success}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            {canManage && (
            <Button
              variant={deleteConfirm ? "destructive" : "outline"}
              type="button"
              size="sm"
              disabled={deleteLoading}
              onClick={handleDelete}
            >
              {deleteLoading ? <><Loader2 className="h-4 w-4 animate-spin" />删除中...</> : deleteConfirm ? "确认删除？" : <><Trash2 className="h-4 w-4" />删除配件</>}
            </Button>
            )}
            <div className="flex gap-3">
              <Link href="/maintenance/spare-parts">
                <Button variant="outline" type="button">返回列表</Button>
              </Link>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />保存中...</> : <><Save className="h-4 w-4" />保存修改</>}
              </Button>
            </div>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}
