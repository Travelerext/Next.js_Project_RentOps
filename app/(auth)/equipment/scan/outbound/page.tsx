"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { scanOutbound } from "@/lib/actions/inventory";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Search, Scan, CheckCircle, XCircle } from "lucide-react";

interface EquipmentOption { id: string; equipment_no: string; name: string; status: string; }
interface WarehouseOption { id: string; name: string; }
interface OrderOption { id: string; order_no: string; }

export default function ScanOutboundPage() {
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [equipSearch, setEquipSearch] = useState("");
  const [selectedEquipId, setSelectedEquipId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const supabase = createClient();

  // Load warehouses
  useEffect(() => {
    supabase.from("warehouse").select("id, name").order("name").then(({ data }) => setWarehouses(data ?? []));
    supabase.from("rental_order").select("id, order_no").in("order_status", ["CONFIRMED", "APPROVED", "IN_PROGRESS"]).order("created_at", { ascending: false }).limit(50).then(({ data }) => setOrders(data ?? []));
  }, []);

  // Search equipment
  const searchEquipment = useCallback(async () => {
    let q = supabase.from("equipment").select("id, equipment_no, name, status").eq("status", "IN_STOCK").eq("scrapped", false).order("equipment_no").limit(30);
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
    const res = await scanOutbound(selectedEquipId, warehouseId, orderId || undefined);
    setResult({ success: res.success, message: res.success ? "出库成功！设备已标记为已租出。" : res.error });
    setLoading(false);
    if (res.success) {
      setSelectedEquipId("");
      setEquipSearch("");
      setOrderId("");
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
                {equipment.map(e => (
                  <button key={e.id} type="button" onClick={() => { setSelectedEquipId(e.id); setEquipSearch(`${e.equipment_no} - ${e.name}`); }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                      selectedEquipId === e.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}>
                    <span className="font-mono text-xs">{e.equipment_no}</span>
                    <span className="ml-2">{e.name}</span>
                    <Badge variant="success" className="ml-2 text-[10px]">可租</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Select id="warehouseId" label="出库仓库 *" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            options={[{ value: "", label: "请选择仓库" }, ...warehouses.map(w => ({ value: w.id, label: w.name }))]} />

          <Select id="orderId" label="关联订单 (可选)" value={orderId} onChange={e => setOrderId(e.target.value)}
            options={[{ value: "", label: "无关联订单" }, ...orders.map(o => ({ value: o.id, label: o.order_no }))]} />

          <div className="grid grid-cols-2 gap-4">
            <Input id="borrowerName" label="借用人/客户签收人" value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="签收人姓名" />
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
