"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createWorkOrder } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Loader2, Wrench, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface Equipment {
  id: string; equipment_no: string; name: string; status: string;
  brand: string | null; specification: string | null;
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Equipment search
  const [equipSearch, setEquipSearch] = useState("");
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [selectedEquip, setSelectedEquip] = useState<Equipment | null>(null);

  // Form fields
  const [faultDescription, setFaultDescription] = useState("");
  const [faultLevel, setFaultLevel] = useState("NORMAL");
  const [stopped, setStopped] = useState(false);
  const [affectsConstruction, setAffectsConstruction] = useState(false);
  const [remark, setRemark] = useState("");

  // Search equipment
  const searchEquipment = useCallback(async () => {
    let q = supabase.from("equipment")
      .select("id, equipment_no, name, status, brand, specification")
      .eq("scrapped", false).is("deleted_at", null)
      .order("equipment_no").limit(20);
    if (equipSearch) q = q.or(`name.ilike.%${equipSearch}%,equipment_no.ilike.%${equipSearch}%`);
    const { data } = await q;
    setEquipmentList((data ?? []) as Equipment[]);
  }, [equipSearch, supabase]);

  useEffect(() => { searchEquipment(); }, [searchEquipment]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedEquip) { setError("请选择设备"); return; }
    if (!faultDescription.trim()) { setError("请填写故障描述"); return; }

    setLoading(true);
    setError("");
    setFieldErrors({});

    const formData = new FormData();
    formData.set("equipmentNo", selectedEquip.equipment_no);
    formData.set("faultDescription", faultDescription);
    formData.set("faultLevel", faultLevel);
    formData.set("stopped", stopped ? "true" : "false");
    formData.set("affectsConstruction", affectsConstruction ? "true" : "false");
    if (remark) formData.set("remark", remark);

    const result = await createWorkOrder(formData);
    if (result.success) {
      router.push(`/maintenance/work-orders/${result.data.id}`);
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
      <PageHeader title="新建维修工单" subtitle="设备故障报修登记" backUrl="/maintenance/work-orders" />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" />报修信息</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Equipment search */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              选择设备 *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                value={equipSearch}
                onChange={(e) => setEquipSearch(e.target.value)}
                placeholder="搜索设备名称或编号..."
                className="pl-9"
                autoFocus
              />
            </div>
            {equipmentList.length > 0 && !selectedEquip && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {equipmentList.map((e) => {
                  const inMaintenance = e.status === "IN_MAINTENANCE";
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setSelectedEquip(e); setEquipSearch(`${e.equipment_no} - ${e.name}`); }}
                      className="w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="font-mono text-xs">{e.equipment_no}</span>
                      <span className="ml-2">{e.name}</span>
                      {e.brand && <span className="ml-1 text-zinc-400 text-xs">({e.brand})</span>}
                      <Badge variant={inMaintenance ? "warning" : e.status === "IN_STOCK" ? "success" : "default"} className="ml-2 text-[10px]">
                        {inMaintenance ? "维修中" : e.status === "IN_STOCK" ? "在库" : e.status}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedEquip && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-800 dark:bg-blue-900/20">
                <Wrench className="h-4 w-4 text-blue-600" />
                <span className="font-mono text-sm">{selectedEquip.equipment_no}</span>
                <span className="text-sm font-medium">{selectedEquip.name}</span>
                <span className="text-xs text-zinc-500">{selectedEquip.brand ?? ""} {selectedEquip.specification ?? ""}</span>
                <button type="button" onClick={() => { setSelectedEquip(null); setEquipSearch(""); }}
                  className="ml-auto text-xs text-blue-600 hover:underline">更换</button>
              </div>
            )}
          </div>

          {/* Fault description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="faultDescription" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              故障描述 *
            </label>
            <textarea
              id="faultDescription"
              rows={4}
              required
              value={faultDescription}
              onChange={(e) => setFaultDescription(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-zinc-800 dark:text-zinc-100 ${
                fieldErrors.faultDescription ? "border-red-500" : "border-zinc-300 dark:border-zinc-600"
              }`}
              placeholder="请详细描述设备故障现象、发生时间、异常表现..."
            />
            {fieldErrors.faultDescription && <p className="text-xs text-red-500">{fieldErrors.faultDescription}</p>}
          </div>

          {/* Fault level + severity flags */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="faultLevel"
              label="故障级别 *"
              value={faultLevel}
              onChange={(e) => setFaultLevel(e.target.value)}
              options={[
                { value: "NORMAL", label: "普通 — 不影响使用" },
                { value: "URGENT", label: "急 — 需尽快处理" },
                { value: "EMERGENCY", label: "紧急 — 设备已停机" },
                { value: "LOW", label: "低 — 计划性维修" },
              ]}
            />
          </div>

          {/* Status flags */}
          <div className="grid grid-cols-2 gap-4">
            <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
              stopped ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-zinc-300 dark:border-zinc-600"
            }`}>
              <input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">设备已停机</span>
              {stopped && <AlertTriangle className="h-4 w-4 text-red-500 ml-auto" />}
            </label>
            <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
              affectsConstruction ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" : "border-zinc-300 dark:border-zinc-600"
            }`}>
              <input type="checkbox" checked={affectsConstruction} onChange={(e) => setAffectsConstruction(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500" />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">影响施工进度</span>
            </label>
          </div>

          {/* Remark */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="remark" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              备注
            </label>
            <textarea
              id="remark"
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="补充说明，如故障照片链接、特殊处理要求..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2" role="alert">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link href="/maintenance/work-orders">
              <Button variant="outline" type="button">取消</Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建工单"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
