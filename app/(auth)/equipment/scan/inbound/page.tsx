"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { scanInbound } from "@/lib/actions/inventory";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, ArrowDownToLine, CheckCircle, XCircle } from "lucide-react";

interface EquipmentOption { id: string; equipment_no: string; name: string; status: string; current_order_id: string | null; current_contract_id: string | null; current_customer_id: string | null; }
interface WarehouseOption { id: string; name: string; }
interface ReturnRequestItem {
  id: string; request_no: string; reason: string | null;
  customer: { name: string } | null;
  equipment: { equipment_no: string; name: string } | null;
  order: { order_no: string } | null;
  contract: { contract_no: string } | null;
}

export default function ScanInboundPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const orderId = searchParams.get("orderId") ?? undefined;
  const contractId = searchParams.get("contractId") ?? undefined;

  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [equipSearch, setEquipSearch] = useState("");
  const [selectedEquipId, setSelectedEquipId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [inspectionResult, setInspectionResult] = useState("NORMAL");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [returnRequests, setReturnRequests] = useState<ReturnRequestItem[]>([]);

  const supabase = createClient();

  useEffect(() => {
    supabase.from("warehouse").select("id, name").order("name").then(({ data }) => setWarehouses(data ?? []));
    // Fetch pending return requests
    supabase.from("return_request")
      .select("*, customer:customer_id(name), equipment:equipment_id(equipment_no, name), order:order_id(order_no), contract:contract_id(contract_no)")
      .eq("request_status", "PENDING")
      .order("created_at", { ascending: false })
      .then(({ data }) => setReturnRequests((data ?? []) as unknown as ReturnRequestItem[]));
  }, []);

  const searchEquipment = useCallback(async () => {
    let q = supabase.from("equipment").select("id, equipment_no, name, status, current_order_id, current_contract_id, current_customer_id")
      .in("status", ["RENTED", "PENDING_INSPECTION", "PENDING_OUTBOUND"]).eq("scrapped", false).order("equipment_no").limit(30);
    if (orderId) q = q.eq("current_order_id", orderId);
    if (contractId) q = q.eq("current_contract_id", contractId);
    if (equipSearch) q = q.or(`name.ilike.%${equipSearch}%,equipment_no.ilike.%${equipSearch}%`);
    const { data } = await q;
    setEquipment(data ?? []);
  }, [equipSearch, orderId, contractId]);

  useEffect(() => { searchEquipment(); }, [searchEquipment, pathname]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEquipId || !warehouseId) return;
    setLoading(true);
    setResult(null);
    const selected = equipment.find(e => e.id === selectedEquipId);
    const res = await scanInbound(
      selectedEquipId,
      warehouseId,
      selectedOrderId || undefined,
      selectedContractId || undefined,
      selected?.current_customer_id ?? undefined,
      inspectionResult,
      notes
    );
    setResult({ success: res.success, message: res.success ? "入库成功！设备已归还入库。" : res.error });
    setLoading(false);
    if (res.success) {
      setSelectedEquipId(""); setSelectedOrderId(""); setSelectedContractId("");
      setEquipSearch(""); setNotes("");
      searchEquipment();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="归还入库" subtitle="扫描或选择出租中设备，完成归还验收" backUrl="_back" />

      {/* Pending return requests */}
      {returnRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" />待处理的退租申请 ({returnRequests.length})</CardTitle></CardHeader>
          <div className="max-h-48 overflow-y-auto">
            {returnRequests.map(rr => (
              <div key={rr.id} className="flex items-center gap-3 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <span className="font-mono text-xs">{rr.request_no}</span>
                <span className="text-sm">{rr.customer?.name ?? "-"}</span>
                <span className="text-xs text-zinc-400">{rr.equipment?.name ?? rr.order?.order_no ?? rr.contract?.contract_no ?? "-"}</span>
                {rr.reason && <span className="text-xs text-zinc-500 ml-auto truncate max-w-[200px]">{rr.reason}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          result.success ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"}`}>
          {result.success ? <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" /> : <XCircle className="h-5 w-5 text-red-600 mt-0.5" />}
          <div>
            <p className={`font-medium ${result.success ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
              {result.success ? "入库成功" : "入库失败"}
            </p>
            <p className="text-sm mt-0.5 opacity-80">{result.message}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" />归还验收</CardTitle></CardHeader>
        <form onSubmit={handleScan} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">选择待归还设备 *</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input value={equipSearch} onChange={e => setEquipSearch(e.target.value)} placeholder="搜索设备名称或编号..." className="pl-9" />
            </div>
            {equipment.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {equipment.map(e => (
                  <button key={e.id} type="button" onClick={() => {
                    setSelectedEquipId(e.id);
                    setEquipSearch(`${e.equipment_no} - ${e.name}`);
                    setSelectedOrderId(e.current_order_id ?? "");
                    setSelectedContractId(e.current_contract_id ?? "");
                  }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                      selectedEquipId === e.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                    <span className="font-mono text-xs">{e.equipment_no}</span>
                    <span className="ml-2">{e.name}</span>
                    <Badge variant="warning" className="ml-2 text-[10px]">待归还</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Select id="warehouseId" label="入库仓库 *" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            options={[{ value: "", label: "请选择仓库" }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]} />

          {selectedOrderId && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              关联订单：<span className="font-mono text-blue-600">{selectedOrderId.slice(0, 8)}...</span>
              {selectedContractId && <span className="ml-3">合同：<span className="font-mono text-blue-600">{selectedContractId.slice(0, 8)}...</span></span>}
            </div>
          )}

          <Select id="inspectionResult" label="验收结果 *" value={inspectionResult} onChange={e => setInspectionResult(e.target.value)}
            options={[
              { value: "NORMAL", label: "✅ 正常" },
              { value: "DAMAGED", label: "🔧 有损坏" },
              { value: "MISSING_PARTS", label: "⚠️ 缺少配件" },
              { value: "DIRTY", label: "🧹 脏污" },
              { value: "NEEDS_REPAIR", label: "🔩 需要维修" },
            ]} />

          <Input id="notes" label="验收备注" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="损坏描述、缺失配件说明、清洁情况..." />

          <Button type="submit" variant="primary" className="w-full" disabled={loading || !selectedEquipId || !warehouseId}>
            {loading ? "处理中..." : "确认入库"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
