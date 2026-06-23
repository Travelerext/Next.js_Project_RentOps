"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createMaintenancePlan } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Loader2, Calendar, ClipboardList } from "lucide-react";
import Link from "next/link";

interface Equipment {
  id: string; equipment_no: string; name: string; status: string;
  brand: string | null; specification: string | null;
}

const CYCLE_OPTIONS = [
  { value: "DAILY", label: "每日 — 每天执行一次" },
  { value: "WEEKLY", label: "每周 — 每 N 周执行一次" },
  { value: "MONTHLY", label: "每月 — 每 N 月执行一次" },
  { value: "HOURS", label: "运行小时 — 每运行 N 小时" },
  { value: "KILOMETERS", label: "行驶里程 — 每行驶 N 公里" },
  { value: "CUSTOM", label: "自定义 — 手动指定周期" },
];

export default function NewMaintenancePlanPage() {
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
  const [planName, setPlanName] = useState("");
  const [cycleType, setCycleType] = useState("MONTHLY");
  const [cycleValue, setCycleValue] = useState("1");
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
    if (!planName.trim()) { setError("请填写计划名称"); return; }

    setLoading(true);
    setError("");
    setFieldErrors({});

    const formData = new FormData();
    formData.set("equipmentNo", selectedEquip.equipment_no);
    formData.set("planName", planName);
    formData.set("cycleType", cycleType);
    formData.set("cycleValue", cycleValue);
    if (remark) formData.set("remark", remark);

    const result = await createMaintenancePlan(formData);
    if (result.success) {
      router.push("/maintenance/plans");
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
      <PageHeader title="新建保养计划" subtitle="创建定期保养计划，系统将根据周期自动计算下次保养日期" backUrl="_back" />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />计划信息</CardTitle></CardHeader>
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
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <span className="font-mono text-sm">{selectedEquip.equipment_no}</span>
                <span className="text-sm font-medium">{selectedEquip.name}</span>
                <span className="text-xs text-zinc-500">{selectedEquip.brand ?? ""} {selectedEquip.specification ?? ""}</span>
                <button type="button" onClick={() => { setSelectedEquip(null); setEquipSearch(""); }}
                  className="ml-auto text-xs text-blue-600 hover:underline">更换</button>
              </div>
            )}
          </div>

          {/* Plan Name */}
          <Input
            id="planName"
            name="planName"
            label="计划名称 *"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="如：月度保养、发动机保养、液压系统检查..."
            error={fieldErrors.planName}
            required
          />

          {/* Cycle Type + Cycle Value */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="cycleType"
              name="cycleType"
              label="保养周期类型"
              value={cycleType}
              onChange={(e) => setCycleType(e.target.value)}
              options={CYCLE_OPTIONS}
            />
            <Input
              id="cycleValue"
              name="cycleValue"
              label="周期值 *"
              type="number"
              min={1}
              value={cycleValue}
              onChange={(e) => setCycleValue(e.target.value)}
              placeholder="如：1"
              error={fieldErrors.cycleValue}
              required
            />
          </div>

          {/* Cycle preview */}
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>
              {cycleType === "DAILY" && `每 ${cycleValue || "?"} 天执行一次保养`}
              {cycleType === "WEEKLY" && `每 ${cycleValue || "?"} 周执行一次保养`}
              {cycleType === "MONTHLY" && `每 ${cycleValue || "?"} 月执行一次保养`}
              {cycleType === "HOURS" && `每运行 ${cycleValue || "?"} 小时执行一次保养`}
              {cycleType === "KILOMETERS" && `每行驶 ${cycleValue || "?"} 公里执行一次保养`}
              {cycleType === "CUSTOM" && `自定义周期：${cycleValue || "?"}`}
            </span>
          </div>

          {/* Remark */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="remark" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              备注
            </label>
            <textarea
              id="remark"
              name="remark"
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="保养内容说明、注意事项、所需配件..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2" role="alert">
              <ClipboardList className="h-4 w-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link href="/maintenance/plans">
              <Button variant="outline" type="button">取消</Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建计划"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
