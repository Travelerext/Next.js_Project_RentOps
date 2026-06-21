"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { createRentalOrder, addOrderItem, submitOrder, pricingPreview } from "@/lib/actions/rental-order";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RISK_LEVELS, CREDIT_LEVELS, EQUIPMENT_STATUS } from "@/lib/constants";
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, AlertTriangle,
  Calculator, ShoppingCart, UserCheck, Wrench, FileText,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────

interface CustomerOption {
  id: string; name: string; customer_no: string;
  risk_level: string; is_blacklisted: boolean; lock_ordering: boolean;
  credit_level: string; lock_reason?: string | null;
}

interface EquipmentOption {
  id: string; equipment_no: string; name: string; brand: string | null;
  status: string; standard_rent: string | null; standard_deposit: string | null;
  category_id: string;
}

interface SelectedEquipment {
  equipmentId: string;
  equipmentNo: string;
  name: string;
  brand: string | null;
  pricingMode: string;
  unitPrice: number;
  depositAmount: number;
  quantity: number;
}

interface PricingResult {
  rentAmount: number; depositAmount: number; totalAmount: number; days: number;
}

type Step = "customer" | "equipment" | "pricing" | "review";

// ─── Component ────────────────────────────────────────────────────────

export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // ── Step state ────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Customer ──────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerRisk, setCustomerRisk] = useState<{
    unsettledCount: number; unsettledAmount: number;
  } | null>(null);

  // ── Equipment ─────────────────────────────────────────────────────
  const [availableEquipment, setAvailableEquipment] = useState<EquipmentOption[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [equipSearch, setEquipSearch] = useState("");
  const [equipCategoryFilter, setEquipCategoryFilter] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<SelectedEquipment[]>([]);

  // ── Pricing ───────────────────────────────────────────────────────
  const [pricingMode, setPricingMode] = useState("MONTHLY");
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [transportFee, setTransportFee] = useState("0");
  const [materialFee, setMaterialFee] = useState("0");
  const [otherFee, setOtherFee] = useState("0");
  const [pricingResults, setPricingResults] = useState<Record<string, PricingResult>>({});
  const [remark, setRemark] = useState("");

  // ── Review ────────────────────────────────────────────────────────
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Load customers ────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    let q = supabase.from("customer")
      .select("id, name, customer_no, risk_level, is_blacklisted, lock_ordering, credit_level, lock_reason")
      .eq("status", "ACTIVE").is("deleted_at", null).order("name").limit(50);
    if (customerSearch) q = q.or(`name.ilike.%${customerSearch}%,customer_no.ilike.%${customerSearch}%`);
    const { data } = await q;
    setCustomers(data ?? []);
  }, [customerSearch]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // ── Load categories and available equipment ──────────────────────
  useEffect(() => {
    supabase.from("equipment_category").select("id, name").order("sort_order").then(({ data }) => setCategories(data ?? []));
  }, []);

  const loadAvailableEquipment = useCallback(async () => {
    let q = supabase.from("equipment")
      .select("id, equipment_no, name, brand, status, standard_rent, standard_deposit, category_id")
      .eq("status", "IN_STOCK").eq("scrapped", false).is("deleted_at", null).order("equipment_no").limit(50);
    if (equipSearch) q = q.or(`name.ilike.%${equipSearch}%,equipment_no.ilike.%${equipSearch}%`);
    if (equipCategoryFilter) q = q.eq("category_id", equipCategoryFilter);
    const { data } = await q;
    setAvailableEquipment(data ?? []);
  }, [equipSearch, equipCategoryFilter]);

  useEffect(() => { if (step === "equipment") loadAvailableEquipment(); }, [step, loadAvailableEquipment]);

  // ── Customer risk check ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedCustomer) { setCustomerRisk(null); return; }
    supabase.from("receivable")
      .select("unpaid_amount").eq("customer_id", selectedCustomer.id)
      .in("status", ["UNPAID", "PARTIAL", "OVERDUE"])
      .then(({ data }) => {
        if (!data?.length) { setCustomerRisk(null); return; }
        setCustomerRisk({
          unsettledCount: data.length,
          unsettledAmount: data.reduce((s, r) => s + parseFloat(r.unpaid_amount ?? "0"), 0),
        });
      });
  }, [selectedCustomer]);

  // ── Preselect customer from URL ───────────────────────────────────
  useEffect(() => {
    const cid = searchParams.get("customerId");
    if (!cid) return;
    supabase.from("customer")
      .select("id, name, customer_no, risk_level, is_blacklisted, lock_ordering, credit_level, lock_reason")
      .eq("id", cid).single()
      .then(({ data }) => { if (data) setSelectedCustomer(data as CustomerOption); });
  }, []);

  // ── Pricing calculation ───────────────────────────────────────────
  const calculatePricing = useCallback(async () => {
    const results: Record<string, PricingResult> = {};
    for (const item of selectedEquipment) {
      const fd = new FormData();
      fd.set("pricingMode", pricingMode);
      fd.set("unitPrice", String(item.unitPrice));
      fd.set("quantity", String(item.quantity));
      fd.set("deposit", String(item.depositAmount));
      if (plannedStartAt) fd.set("startAt", new Date(plannedStartAt).toISOString());
      if (plannedEndAt) fd.set("endAt", new Date(plannedEndAt).toISOString());
      const r = await pricingPreview(fd);
      results[item.equipmentId] = r;
    }
    setPricingResults(results);
  }, [selectedEquipment, pricingMode, plannedStartAt, plannedEndAt]);

  // ── Equipment selection ───────────────────────────────────────────
  function addEquipment(equip: EquipmentOption) {
    if (selectedEquipment.find(e => e.equipmentId === equip.id)) return;
    setSelectedEquipment(prev => [...prev, {
      equipmentId: equip.id,
      equipmentNo: equip.equipment_no,
      name: equip.name,
      brand: equip.brand,
      pricingMode,
      unitPrice: parseFloat(equip.standard_rent ?? "0"),
      depositAmount: parseFloat(equip.standard_deposit ?? "0"),
      quantity: 1,
    }]);
  }

  function removeEquipment(id: string) {
    setSelectedEquipment(prev => prev.filter(e => e.equipmentId !== id));
  }

  function updateEquipmentField(id: string, field: keyof SelectedEquipment, value: string | number) {
    setSelectedEquipment(prev => prev.map(e => e.equipmentId === id ? { ...e, [field]: value } : e));
  }

  // ── Create draft & submit ─────────────────────────────────────────
  async function handleCreateDraft() {
    setLoading(true); setError(""); setFieldErrors({});
    const fd = new FormData();
    if (!selectedCustomer) { setError("请选择客户"); setLoading(false); return; }
    fd.set("pricingMode", pricingMode);
    if (plannedStartAt) fd.set("plannedStartAt", new Date(plannedStartAt).toISOString());
    if (plannedEndAt) fd.set("plannedEndAt", new Date(plannedEndAt).toISOString());
    fd.set("transportFee", transportFee);
    fd.set("materialFee", materialFee);
    fd.set("otherFee", otherFee);
    if (remark) fd.set("remark", remark);
    const result = await createRentalOrder(selectedCustomer.id, fd);
    if (!result.success) {
      setError(result.error);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors as unknown as Record<string, string>);
      setLoading(false);
      return;
    }
    setDraftOrderId(result.data.id);
    // Add items
    let itemsFailed = false;
    for (const item of selectedEquipment) {
      const ifd = new FormData();
      ifd.set("equipmentId", item.equipmentId);
      ifd.set("pricingMode", item.pricingMode);
      ifd.set("unitPrice", String(item.unitPrice));
      ifd.set("depositAmount", String(item.depositAmount));
      ifd.set("quantity", String(item.quantity));
      if (plannedStartAt) ifd.set("startAt", new Date(plannedStartAt).toISOString());
      if (plannedEndAt) ifd.set("endAt", new Date(plannedEndAt).toISOString());
      const itemResult = await addOrderItem(result.data.id, ifd);
      if (!itemResult.success) {
        setError(`添加设备失败：${itemResult.error}`);
        itemsFailed = true;
        break;
      }
    }
    if (itemsFailed) { setLoading(false); return; }
    setLoading(false);
    setStep("review");
  }

  async function handleSubmit() {
    if (!draftOrderId) return;
    setSubmitting(true); setError("");
    const result = await submitOrder(draftOrderId);
    if (!result.success) { setError(result.error); setSubmitting(false); return; }
    router.push(`/sales/orders/${draftOrderId}`);
  }

  // ── Step navigation ───────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === "customer") return !!selectedCustomer && !selectedCustomer.is_blacklisted && !selectedCustomer.lock_ordering;
    if (step === "equipment") return selectedEquipment.length > 0;
    if (step === "pricing") return !!plannedStartAt && !!plannedEndAt;
    return true;
  }

  // ── Totals ────────────────────────────────────────────────────────
  const totalRent = Object.values(pricingResults).reduce((s, r) => s + r.rentAmount, 0);
  const totalDeposit = Object.values(pricingResults).reduce((s, r) => s + r.depositAmount, 0);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="快速开单"
        subtitle={["选择客户", "选择设备", "租金计算", "确认提交"][["customer","equipment","pricing","review"].indexOf(step)]}
        backUrl="/sales/orders"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["customer","equipment","pricing","review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => setStep(s)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                step === s
                  ? "bg-blue-600 text-white"
                  : step > s || (i < ["customer","equipment","pricing","review"].indexOf(step))
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {i < ["customer","equipment","pricing","review"].indexOf(step) ? <Check className="h-3 w-3" /> : null}
              {{customer: "1. 客户", equipment: "2. 设备", pricing: "3. 计价", review: "4. 确认"}[s]}
            </button>
            {i < 3 ? <ArrowRight className="h-3 w-3 text-zinc-400" /> : null}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="mr-2 inline h-4 w-4" />{error}
        </div>
      )}

      {/* ── Step 1: Customer ─────────────────────────────────────── */}
      {step === "customer" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />选择客户</CardTitle></CardHeader>
            <div className="space-y-4">
              <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="搜索客户名称或编号..." />
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
                    <tr><th className="p-2 text-left">名称</th><th className="p-2 text-left">编号</th><th className="p-2 text-left">信用</th><th className="p-2 text-left">风险</th><th className="p-2"></th></tr>
                  </thead>
                  <tbody>
                    {customers.map(c => (
                      <tr key={c.id}
                        className={`cursor-pointer border-t transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          selectedCustomer?.id === c.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                        } ${c.is_blacklisted || c.lock_ordering ? "opacity-60" : ""}`}
                        onClick={() => { if (!c.is_blacklisted && !c.lock_ordering) setSelectedCustomer(c); }}
                      >
                        <td className="p-2">{c.name}{c.is_blacklisted && <Badge variant="danger" className="ml-1">黑名单</Badge>}{c.lock_ordering && <Badge variant="danger" className="ml-1">已锁单</Badge>}</td>
                        <td className="p-2 text-zinc-500">{c.customer_no}</td>
                        <td className="p-2"><Badge variant={c.credit_level >= "A" ? "success" : c.credit_level >= "C" ? "warning" : "danger"}>{CREDIT_LEVELS[c.credit_level] ?? c.credit_level}</Badge></td>
                        <td className="p-2"><Badge variant={c.risk_level === "LOW" ? "success" : c.risk_level === "MEDIUM" ? "warning" : "danger"}>{RISK_LEVELS[c.risk_level] ?? c.risk_level}</Badge></td>
                        <td className="p-2"><Link href={`/sales/customers/${c.id}`} className="text-xs text-blue-600 hover:underline">详情</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Selected customer info */}
          {selectedCustomer && (
            <Card>
              <CardHeader><CardTitle>已选客户</CardTitle></CardHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-zinc-500">名称：</span>{selectedCustomer.name}</div>
                  <div><span className="text-zinc-500">编号：</span>{selectedCustomer.customer_no}</div>
                  <div><span className="text-zinc-500">信用等级：</span><Badge variant={selectedCustomer.credit_level >= "A" ? "success" : selectedCustomer.credit_level >= "C" ? "warning" : "danger"}>{CREDIT_LEVELS[selectedCustomer.credit_level]}</Badge></div>
                  <div><span className="text-zinc-500">风险等级：</span><Badge variant={selectedCustomer.risk_level === "LOW" ? "success" : selectedCustomer.risk_level === "MEDIUM" ? "warning" : "danger"}>{RISK_LEVELS[selectedCustomer.risk_level]}</Badge></div>
                </div>
                {selectedCustomer.risk_level === "HIGH" || selectedCustomer.risk_level === "CRITICAL" ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="mr-1 inline h-4 w-4" />客户风险等级为{selectedCustomer.risk_level}，请谨慎操作
                  </div>
                ) : null}
                {customerRisk && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    <AlertTriangle className="mr-1 inline h-4 w-4" />该客户有 {customerRisk.unsettledCount} 笔逾期未结算应收，合计 {formatCurrency(customerRisk.unsettledAmount)}
                  </div>
                )}
              </div>
            </Card>
          )}

          <div className="flex justify-end">
            <Button variant="primary" disabled={!canProceed()} onClick={() => setStep("equipment")}>
              下一步：选择设备 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Equipment ────────────────────────────────────── */}
      {step === "equipment" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" />选择设备</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input value={equipSearch} onChange={e => setEquipSearch(e.target.value)} placeholder="搜索设备名称或编号..." className="flex-1" />
                <Select value={equipCategoryFilter} onChange={e => setEquipCategoryFilter(e.target.value)}
                  options={[{value:"",label:"全部分类"},...categories.map(c=>({value:c.id,label:c.name}))]} />
              </div>
              <DataTable
                columns={[
                  { id:"no", header:"编号", cell: e => e.equipment_no },
                  { id:"name", header:"名称", cell: e => e.name },
                  { id:"brand", header:"品牌", cell: e => e.brand ?? "-", hideOnMobile: true },
                  { id:"rent", header:"标准租金", cell: e => formatCurrency((e.standard_rent as string) ?? "0"), className: "text-right tabular-nums" },
                  { id:"deposit", header:"押金", cell: e => formatCurrency((e.standard_deposit as string) ?? "0"), className: "text-right tabular-nums", hideOnMobile: true },
                  { id:"action", header:"", cell: e => (
                    <Button size="sm" variant="outline" onClick={() => addEquipment(e)} disabled={!!selectedEquipment.find(s => s.equipmentId === e.id)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  )},
                ] as Column<EquipmentOption>[]}
                data={availableEquipment} keyExtractor={e => e.id} emptyMessage="暂无可租设备"
              />
            </div>
          </Card>

          {/* Selected equipment */}
          {selectedEquipment.length > 0 && (
            <Card>
              <CardHeader><CardTitle>已选设备 ({selectedEquipment.length})</CardTitle></CardHeader>
              <div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2 text-left">编号</th><th className="p-2 text-left">名称</th><th className="p-2 text-right">单价</th><th className="p-2 text-right">押金</th><th className="p-2 text-center">数量</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {selectedEquipment.map(item => (
                      <tr key={item.equipmentId} className="border-b">
                        <td className="p-2">{item.equipmentNo}</td>
                        <td className="p-2">{item.name}{item.brand ? ` (${item.brand})` : ""}</td>
                        <td className="p-2"><Input type="number" value={item.unitPrice} onChange={e => updateEquipmentField(item.equipmentId, "unitPrice", parseFloat(e.target.value) || 0)} className="w-24 text-right" /></td>
                        <td className="p-2"><Input type="number" value={item.depositAmount} onChange={e => updateEquipmentField(item.equipmentId, "depositAmount", parseFloat(e.target.value) || 0)} className="w-24 text-right" /></td>
                        <td className="p-2 text-center"><Input type="number" value={item.quantity} onChange={e => updateEquipmentField(item.equipmentId, "quantity", parseFloat(e.target.value) || 1)} className="w-16 text-center" min="1" /></td>
                        <td className="p-2"><Button variant="ghost" size="sm" onClick={() => removeEquipment(item.equipmentId)}><Trash2 className="h-3 w-3 text-red-500" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("customer")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" disabled={!canProceed()} onClick={() => { calculatePricing(); setStep("pricing"); }}>
              下一步：租金计算 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Pricing ──────────────────────────────────────── */}
      {step === "pricing" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />租金计算</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Select id="pricingMode" label="计费方式" value={pricingMode} onChange={e => setPricingMode(e.target.value)}
                  options={[
                    {value:"HOURLY",label:"按小时"},{value:"DAILY",label:"按天"},
                    {value:"MONTHLY",label:"按月"},{value:"FIXED",label:"固定价格"},{value:"PROJECT_BASED",label:"按项目"},
                  ]} />
                <Input id="plannedStartAt" label="计划开始日期 *" type="date" value={plannedStartAt} onChange={e => setPlannedStartAt(e.target.value)} />
                <Input id="plannedEndAt" label="计划结束日期 *" type="date" value={plannedEndAt} onChange={e => setPlannedEndAt(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input id="transportFee" label="运输费" type="number" value={transportFee} onChange={e => setTransportFee(e.target.value)} />
                <Input id="materialFee" label="材料费" type="number" value={materialFee} onChange={e => setMaterialFee(e.target.value)} />
                <Input id="otherFee" label="其他费用" type="number" value={otherFee} onChange={e => setOtherFee(e.target.value)} />
              </div>
              <Button variant="outline" onClick={calculatePricing}><Calculator className="mr-1 h-4 w-4" />重新计算</Button>
            </div>
          </Card>

          {/* Pricing results */}
          <Card>
            <CardHeader><CardTitle>费用明细</CardTitle></CardHeader>
            <div>
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="p-2 text-left">设备</th><th className="p-2 text-right">单价</th><th className="p-2 text-center">天数</th><th className="p-2 text-right">租金</th><th className="p-2 text-right">押金</th><th className="p-2 text-right">小计</th></tr></thead>
                <tbody>
                  {selectedEquipment.map(item => {
                    const r = pricingResults[item.equipmentId];
                    return (
                      <tr key={item.equipmentId} className="border-b">
                        <td className="p-2">{item.name}</td>
                        <td className="p-2 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="p-2 text-center">{r?.days ?? "-"}</td>
                        <td className="p-2 text-right">{r ? formatCurrency(r.rentAmount) : "-"}</td>
                        <td className="p-2 text-right">{r ? formatCurrency(r.depositAmount) : "-"}</td>
                        <td className="p-2 text-right font-medium">{r ? formatCurrency(r.totalAmount) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="p-2" colSpan={3}>合计</td>
                    <td className="p-2 text-right">{formatCurrency(totalRent)}</td>
                    <td className="p-2 text-right">{formatCurrency(totalDeposit)}</td>
                    <td className="p-2 text-right text-lg">{formatCurrency(totalRent + totalDeposit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("equipment")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" onClick={handleCreateDraft} disabled={!canProceed() || loading}>
              {loading ? "创建中..." : "创建草稿订单"} <FileText className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review ───────────────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />订单确认</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-500">客户：</span>{selectedCustomer?.name}</div>
                <div><span className="text-zinc-500">订单号：</span>{draftOrderId ? "已创建" : "待创建"}</div>
                <div><span className="text-zinc-500">计费方式：</span>{{HOURLY:"按小时",DAILY:"按天",MONTHLY:"按月",FIXED:"固定价",PROJECT_BASED:"按项目"}[pricingMode]}</div>
                <div><span className="text-zinc-500">租期：</span>{plannedStartAt ? formatDate(plannedStartAt) : "-"} ~ {plannedEndAt ? formatDate(plannedEndAt) : "-"}</div>
                <div><span className="text-zinc-500">设备数量：</span>{selectedEquipment.length} 台</div>
                <div><span className="text-zinc-500">租金合计：</span><span className="font-semibold">{formatCurrency(totalRent)}</span></div>
                <div><span className="text-zinc-500">押金合计：</span>{formatCurrency(totalDeposit)}</div>
                <div><span className="text-zinc-500">运输/材料/其他：</span>{formatCurrency(parseFloat(transportFee) + parseFloat(materialFee) + parseFloat(otherFee))}</div>
              </div>
              <Input id="remark" label="备注" value={remark} onChange={e => setRemark(e.target.value)} />
              {draftOrderId && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  <Check className="mr-1 inline h-4 w-4" />草稿订单已创建，确认无误后点击提交
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("pricing")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!draftOrderId || submitting}>
              {submitting ? "提交中..." : "提交订单"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
