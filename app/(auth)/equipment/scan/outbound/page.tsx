"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { scanOutbound } from "@/lib/actions/inventory";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Scan, CheckCircle, XCircle } from "lucide-react";

interface EquipmentOption { id: string; equipment_no: string; name: string; status: string; current_order_id: string | null; current_contract_id: string | null; }
interface WarehouseOption { id: string; name: string; }

export default function ScanOutboundPage() {
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [equipSearch, setEquipSearch] = useState("");
  const [selectedEquipId, setSelectedEquipId] = useState("");
  const [selectedEquip, setSelectedEquip] = useState<EquipmentOption | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [contractId, setContractId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.from("warehouse").select("id, name").order("name").then(({ data }) => setWarehouses(data ?? []));
  }, []);

  // Search equipment
  const searchEquipment = useCallback(async () => {
    let q = supabase.from("equipment").select("id, equipment_no, name, status, current_order_id, current_contract_id")
      .in("status", ["PENDING_OUTBOUND"]).eq("scrapped", false).order("equipment_no").limit(30);
    if (equipSearch) q = q.or(`name.ilike.%${equipSearch}%,equipment_no.ilike.%${equipSearch}%`);
    const { data } = await q;
    setEquipment(data ?? []);
  }, [equipSearch]);

  useEffect(() => { searchEquipment(); }, [searchEquipment]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEquipId || !warehouseId) return;
    setLoading(true);
    setResult(null);
    const res = await scanOutbound(selectedEquipId, warehouseId, orderId || undefined, contractId || undefined);
    setResult({ success: res.success, message: res.success ? "出库成功！设备已标记为已租出。" : res.error });
    setLoading(false);
    if (res.success) {
      setSelectedEquipId("");
      setSelectedEquip(null);
      setEquipSearch("");
      setOrderId("");
      setContractId("");
      setBorrowerName("");
      setSignerName("");
      setRemark("");
      searchEquipment();
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="租赁出库" subtitle="扫描或选择设备，确认出库信息" backUrl="/equipment" />

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          result.success
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
        }`}>
          {result.success ? <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" /> : <XCircle className="h-5 w-5 text-red-600 mt-0.5" />}
          <div>
            <p className={`font-medium ${result.success ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
              {result.success ? "出库成功" : "出库失败"}
            </p>
            <p className="text-sm mt-0.5 opacity-80">{result.message}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Scan className="h-5 w-5" />出库信息</CardTitle></CardHeader>
        <form onSubmit={handleScan} className="space-y-4">
          {/* Equipment search */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">选择设备 *</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input value={equipSearch} onChange={e => setEquipSearch(e.target.value)} placeholder="搜索设备名称或编号..." className="pl-9" />
            </div>
            {equipment.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {equipment.map(e => {
                  const isPending = e.status === "PENDING_OUTBOUND";
                  return (
                  <button key={e.id} type="button" onClick={async () => {
                    setSelectedEquipId(e.id);
                    setSelectedEquip(e);
                    setEquipSearch(`${e.equipment_no} - ${e.name}`);
                    setOrderId(e.current_order_id ?? "");
                    setContractId(e.current_contract_id ?? "");
                    // Auto-fill warehouse from equipment
                    if (!warehouseId) {
                      const { data: eq } = await supabase.from("equipment").select("warehouse_id").eq("id", e.id).single();
                      if (eq?.warehouse_id) setWarehouseId(eq.warehouse_id);
                    }
                    // Auto-fill borrower from customer
                    const orderId = e.current_order_id;
                    if (orderId) {
                      const { data: order } = await supabase.from("rental_order").select("customer:customer_id(contact_name, contact_phone, name)").eq("id", orderId).single();
                      const contactName = (order?.customer as unknown as { contact_name?: string; name?: string })?.contact_name
                        || (order?.customer as unknown as { name?: string })?.name || "";
                      if (contactName && !borrowerName) setBorrowerName(contactName);
                    }
                    // Auto-generate remark
                    if (!remark) setRemark(`${e.equipment_no} ${e.name} 租赁出库`);
                  }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                      selectedEquipId === e.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}>
                    <span className="font-mono text-xs">{e.equipment_no}</span>
                    <span className="ml-2">{e.name}</span>
                    <Badge variant={isPending ? "warning" : "success"} className="ml-2 text-[10px]">{isPending ? "待出库" : "可租"}</Badge>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          {orderId && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              关联订单：<span className="font-mono text-blue-600">{orderId.slice(0, 8)}...</span>
              {contractId && <span className="ml-3">合同：<span className="font-mono text-blue-600">{contractId.slice(0, 8)}...</span></span>}
            </div>
          )}
          {warehouseId && (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              出库仓库：<span className="font-medium">{warehouses.find(w => w.id === warehouseId)?.name ?? warehouseId.slice(0, 8)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input id="borrowerName" label="收货人" value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="客户联系人" />
            <Input id="signerName" label="发货人" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="发货人姓名" />
          </div>

          <Input id="remark" label="备注" value={remark} onChange={e => setRemark(e.target.value)} placeholder="附件清单、设备外观备注..." />

          <Button type="submit" variant="primary" className="w-full" disabled={loading || !selectedEquipId || !warehouseId}>
            {loading ? "处理中..." : "确认出库"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
