"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { createQuickRentalOrder, pricingPreview, submitOrder } from "@/lib/actions/rental-order";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { RISK_LEVELS, CREDIT_LEVELS } from "@/lib/constants";
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
  /** Original monthly standard price (captured at selection time) */
  standardRent: number;
  /** Original standard deposit (captured at selection time) */
  standardDeposit: number;
}

interface PricingResult {
  rentAmount: number;
  depositAmount: number;
  totalAmount: number;
  days: number;
  hours: number;
}

interface PricingPreviewState {
  totalRentAmount: number;
  totalDepositAmount: number;
  originalAmount: number;
  discountAmount: number;
  discountRate: number;
  needsApproval: boolean;
  approvalReasons: string[];
  items: Array<{
    equipmentId: string;
    equipmentNo: string;
    name: string;
    quantity: number;
    unitPrice: number;
    standardUnitPrice: number;
    rentAmount: number;
    depositAmount: number;
    days: number;
    hours: number;
    priceAdjusted: boolean;
  }>;
}

type Step = "customer" | "equipment" | "pricing" | "adjust" | "review";

// ─── Component ────────────────────────────────────────────────────────

export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // ── Step state ────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
  const [remark, setRemark] = useState("");
  const [pricingPreviewResult, setPricingPreviewResult] = useState<PricingPreviewState | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // ── Price adjustment ────────────────────────────────────────────
  const [adjustReason, setAdjustReason] = useState("");

  // ── Review ────────────────────────────────────────────────────────
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let q = supabase.from("customer")
      .select("id, name, customer_no, risk_level, is_blacklisted, lock_ordering, credit_level, lock_reason")
      .eq("status", "ACTIVE").is("deleted_at", null).order("name").limit(50);
    if (customerSearch) q = q.or(`name.ilike.%${customerSearch}%,customer_no.ilike.%${customerSearch}%`);
    q.then(({ data }) => {
      if (!cancelled) setCustomers(data ?? []);
    });
    return () => { cancelled = true; };
  }, [supabase, customerSearch]);

  // ── Load categories and available equipment ──────────────────────
  useEffect(() => {
    let cancelled = false;
    supabase.from("equipment_category").select("id, name").order("sort_order").then(({ data }) => {
      if (!cancelled) setCategories(data ?? []);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (step !== "equipment") return;
    let cancelled = false;
    let q = supabase.from("equipment")
      .select("id, equipment_no, name, brand, status, standard_rent, standard_deposit, category_id")
      .eq("status", "IN_STOCK").eq("scrapped", false).is("deleted_at", null).order("equipment_no").limit(50);
    if (equipSearch) q = q.or(`name.ilike.%${equipSearch}%,equipment_no.ilike.%${equipSearch}%`);
    if (equipCategoryFilter) q = q.eq("category_id", equipCategoryFilter);
    q.then(({ data }) => {
      if (!cancelled) setAvailableEquipment(data ?? []);
    });
    return () => { cancelled = true; };
  }, [supabase, step, equipSearch, equipCategoryFilter]);

  // ── Customer risk check ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!selectedCustomer) {
      Promise.resolve().then(() => {
        if (!cancelled) setCustomerRisk(null);
      });
      return () => { cancelled = true; };
    }
    supabase.from("receivable")
      .select("unpaid_amount").eq("customer_id", selectedCustomer.id)
      .in("status", ["UNPAID", "PARTIAL", "OVERDUE"])
      .then(({ data }) => {
        if (cancelled) return;
        if (!data?.length) { setCustomerRisk(null); return; }
        setCustomerRisk({
          unsettledCount: data.length,
          unsettledAmount: data.reduce((s, r) => s + parseFloat(r.unpaid_amount ?? "0"), 0),
        });
      });
    return () => { cancelled = true; };
  }, [supabase, selectedCustomer]);

  // ── Preselect customer from URL ───────────────────────────────────
  useEffect(() => {
    const cid = searchParams.get("customerId");
    if (!cid) return;
    supabase.from("customer")
      .select("id, name, customer_no, risk_level, is_blacklisted, lock_ordering, credit_level, lock_reason")
      .eq("id", cid).single()
      .then(({ data }) => { if (data) setSelectedCustomer(data as CustomerOption); });
  }, [supabase, searchParams]);

  useEffect(() => {
    const needsPreview = step === "pricing" || step === "adjust" || step === "review";
    if (!needsPreview || selectedEquipment.length === 0 || !plannedStartAt || !plannedEndAt) {
      Promise.resolve().then(() => {
        setPricingPreviewResult(null);
        setPricingLoading(false);
      });
      return;
    }

    let cancelled = false;
    const fd = new FormData();
    fd.set("pricingMode", pricingMode);
    fd.set("plannedStartAt", plannedStartAt);
    fd.set("plannedEndAt", plannedEndAt);
    fd.set("items", JSON.stringify(selectedEquipment.map(item => ({
      equipmentId: item.equipmentId,
      unitPrice: item.unitPrice,
      depositAmount: item.depositAmount,
      quantity: 1,
    }))));

    Promise.resolve().then(() => setPricingLoading(true));
    pricingPreview(fd).then(result => {
      if (cancelled) return;
      if (result.success) {
        setPricingPreviewResult(result.data);
        setError("");
      } else {
        setPricingPreviewResult(null);
        setError(result.error);
      }
      setPricingLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedEquipment, pricingMode, plannedStartAt, plannedEndAt, step]);

  const pricingResults = useMemo(() => {
    const results: Record<string, PricingResult> = {};
    for (const item of pricingPreviewResult?.items ?? []) {
      results[item.equipmentId] = {
        rentAmount: item.rentAmount,
        depositAmount: item.depositAmount,
        totalAmount: item.rentAmount + item.depositAmount,
        days: item.days,
        hours: item.hours,
      };
    }
    return results;
  }, [pricingPreviewResult]);

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
      standardRent: parseFloat(equip.standard_rent ?? "0"),
      standardDeposit: parseFloat(equip.standard_deposit ?? "0"),
    }]);
  }

  function removeEquipment(id: string) {
    setSelectedEquipment(prev => prev.filter(e => e.equipmentId !== id));
  }

  function updateEquipmentField(id: string, field: keyof SelectedEquipment, value: string | number) {
    setSelectedEquipment(prev => prev.map(e => e.equipmentId === id ? { ...e, [field]: value } : e));
  }

  function handlePricingModeChange(nextMode: string) {
    setPricingMode(nextMode);
    setSelectedEquipment(prev => prev.map(item => {
      let convertedPrice = item.standardRent;
      if (nextMode === "DAILY") convertedPrice = item.standardRent / 30;
      if (nextMode === "HOURLY") convertedPrice = item.standardRent / 30 / 8;
      return {
        ...item,
        unitPrice: Math.round(convertedPrice * 100) / 100,
        pricingMode: nextMode,
      };
    }));
  }

  // ── Create draft & submit ─────────────────────────────────────────
  async function handleCreateDraft() {
    setLoading(true); setError("");
    const fd = new FormData();
    if (!selectedCustomer) { setError("请选择客户"); setLoading(false); return; }
    if (!pricingPreviewResult) { setError("请先完成服务端租金试算"); setLoading(false); return; }
    fd.set("customerId", selectedCustomer.id);
    fd.set("pricingMode", pricingMode);
    fd.set("plannedStartAt", plannedStartAt);
    fd.set("plannedEndAt", plannedEndAt);
    fd.set("transportFee", transportFee);
    fd.set("materialFee", materialFee);
    fd.set("otherFee", otherFee);
    if (remark) fd.set("remark", remark);
    if (adjustReason) fd.set("adjustReason", adjustReason);
    fd.set("items", JSON.stringify(selectedEquipment.map(item => ({
      equipmentId: item.equipmentId,
      unitPrice: item.unitPrice,
      depositAmount: item.depositAmount,
      quantity: 1,
    }))));

    const result = await createQuickRentalOrder(fd);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setDraftOrderId(result.data.id);
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

  // ── Step navigation with reset ──────────────────────────────────
  const stepOrder: Step[] = ["customer", "equipment", "pricing", "adjust", "review"];

  function goToStep(target: Step) {
    // Going back FROM adjust: reset price changes to standard per-mode values
    if (step === "adjust" && stepOrder.indexOf(target) < stepOrder.indexOf("adjust")) {
      setSelectedEquipment(prev => prev.map(item => {
        let convertedPrice = item.standardRent;
        if (pricingMode === "DAILY") convertedPrice = item.standardRent / 30;
        if (pricingMode === "HOURLY") convertedPrice = item.standardRent / 30 / 8;
        return {
          ...item,
          unitPrice: Math.round(convertedPrice * 100) / 100,
          depositAmount: item.standardDeposit,
        };
      }));
      setAdjustReason("");
    }
    setStep(target);
  }
  // Helper: compare with 2-decimal rounding to avoid float mismatches
  function pricesEqual(a: number, b: number) {
    return Math.round(a * 100) === Math.round(b * 100);
  }

  function canProceed(): boolean {
    if (step === "customer") return !!selectedCustomer && !selectedCustomer.is_blacklisted && !selectedCustomer.lock_ordering;
    if (step === "equipment") return selectedEquipment.length > 0;
    if (step === "pricing") return !!plannedStartAt && !!plannedEndAt && !!pricingPreviewResult && !pricingLoading;
    if (step === "adjust") {
      if (!pricingPreviewResult || pricingLoading) return false;
      const hasPriceChanges = selectedEquipment.some(item => {
        const modeStdRent = Math.round((pricingMode === "DAILY" ? item.standardRent / 30
          : pricingMode === "HOURLY" ? item.standardRent / 30 / 8
          : item.standardRent) * 100) / 100;
        return !pricesEqual(item.unitPrice, modeStdRent) ||
          !pricesEqual(item.depositAmount, item.standardDeposit);
      });
      return !hasPriceChanges || !!adjustReason;
    }
    return true;
  }

  // ── Totals ────────────────────────────────────────────────────────
  const totalRent = pricingPreviewResult?.totalRentAmount ?? 0;
  const totalDeposit = pricingPreviewResult?.totalDepositAmount ?? 0;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="快速开单"
        subtitle={["选择客户", "选择设备", "租金计算", "改价", "确认提交"][["customer","equipment","pricing","adjust","review"].indexOf(step)]}
        backUrl="_back"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["customer","equipment","pricing","adjust","review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => goToStep(s)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                step === s
                  ? "bg-blue-600 text-white"
                  : ["customer","equipment","pricing","adjust","review"].indexOf(step) > i
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {["customer","equipment","pricing","adjust","review"].indexOf(step) > i ? <Check className="h-3 w-3" /> : null}
              {{customer: "1. 客户", equipment: "2. 设备", pricing: "3. 计价", adjust: "4. 改价", review: "5. 确认"}[s]}
            </button>
            {i < 4 ? <ArrowRight className="h-3 w-3 text-zinc-400" /> : null}
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
              <div className="flex flex-col gap-2">
                {selectedEquipment.map(item => (
                  <div key={item.equipmentId} className="flex flex-wrap items-center gap-2 p-2 border rounded-lg">
                    <span className="text-xs font-mono text-zinc-500 w-20 shrink-0">{item.equipmentNo}</span>
                    <span className="text-sm font-medium flex-1 min-w-[80px] truncate">{item.name}</span>
                    <label className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                      月租 ¥<Input type="number" value={item.unitPrice} onChange={e => updateEquipmentField(item.equipmentId, "unitPrice", parseFloat(e.target.value) || 0)} className="w-20 h-7 text-right text-sm" />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                      押金 ¥<Input type="number" value={item.depositAmount} onChange={e => updateEquipmentField(item.equipmentId, "depositAmount", parseFloat(e.target.value) || 0)} className="w-20 h-7 text-right text-sm" />
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => removeEquipment(item.equipmentId)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep("customer")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" disabled={!canProceed()} onClick={() => setStep("pricing")}>
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
                <Select id="pricingMode" label="计费方式" value={pricingMode} onChange={e => handlePricingModeChange(e.target.value)}
                  options={[
                    {value:"HOURLY",label:"按小时"},{value:"DAILY",label:"按天"},
                    {value:"MONTHLY",label:"按月"},
                  ]} />
                <Input
                  id="plannedStartAt"
                  label={pricingMode === "HOURLY" ? "开始时间 *" : "计划开始日期 *"}
                  type={pricingMode === "HOURLY" ? "datetime-local" : "date"}
                  value={plannedStartAt}
                  onChange={e => setPlannedStartAt(e.target.value)}
                />
                <Input
                  id="plannedEndAt"
                  label={pricingMode === "HOURLY" ? "结束时间 *" : "计划结束日期 *"}
                  type={pricingMode === "HOURLY" ? "datetime-local" : "date"}
                  value={plannedEndAt}
                  onChange={e => setPlannedEndAt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input id="transportFee" label="运输费" type="number" value={transportFee} onChange={e => setTransportFee(e.target.value)} />
                <Input id="materialFee" label="材料费" type="number" value={materialFee} onChange={e => setMaterialFee(e.target.value)} />
                <Input id="otherFee" label="其他费用" type="number" value={otherFee} onChange={e => setOtherFee(e.target.value)} />
              </div>
              <p className="mt-2 text-xs text-zinc-400">费用由服务端按租期、计费方式和设备实时状态试算</p>
            </div>
          </Card>

          {/* Pricing results */}
          <Card>
            <CardHeader><CardTitle>费用明细（自动计算）</CardTitle></CardHeader>
            <div>
              {selectedEquipment.length === 0 ? (
                <p className="p-4 text-sm text-zinc-400">请先在步骤 2 选择设备</p>
              ) : !plannedStartAt || !plannedEndAt ? (
                <p className="p-4 text-sm text-zinc-400">请填写租期后自动计算</p>
              ) : pricingLoading ? (
                <p className="p-4 text-sm text-zinc-400">正在试算租金...</p>
              ) : !pricingPreviewResult ? (
                <p className="p-4 text-sm text-red-500">租金试算失败，请检查租期或刷新设备状态</p>
              ) : (
              <div className="flex flex-col gap-2">
                {selectedEquipment.map(item => {
                  const r = pricingResults[item.equipmentId];
                  return (
                    <div key={item.equipmentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 border rounded-lg text-sm">
                      <span className="font-medium flex-1 min-w-[80px] truncate">{item.name}</span>
                      <span className="text-xs text-zinc-500">{pricingMode === "HOURLY" ? `${r?.days ?? "-"}h` : `${r?.days ?? "-"}天`}</span>
                      <span className="text-xs text-zinc-500">单价 ¥{item.unitPrice.toLocaleString()}</span>
                      <span className="tabular-nums">租金 ¥{r ? r.rentAmount.toLocaleString() : "-"}</span>
                      <span className="tabular-nums text-xs text-zinc-500">押金 ¥{r ? r.depositAmount.toLocaleString() : "-"}</span>
                      <span className="tabular-nums font-semibold">¥{r ? r.totalAmount.toLocaleString() : "-"}</span>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 p-2 border-t-2 font-semibold text-sm">
                  <span>租金 ¥{totalRent.toLocaleString()}</span>
                  <span className="text-zinc-500">+ 押金 ¥{totalDeposit.toLocaleString()}</span>
                  <span className="text-lg">= ¥{(totalRent + totalDeposit).toLocaleString()}</span>
                </div>
                {pricingPreviewResult.needsApproval && (
                  <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    <AlertTriangle className="mr-1 inline h-4 w-4" />
                    试算提示：{pricingPreviewResult.approvalReasons.join("；")}
                  </div>
                )}
              </div>
              )}
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep("equipment")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" onClick={() => setStep("adjust")} disabled={!canProceed()}>
              下一步：调整价格 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Price Adjustment ───────────────────────────── */}
      {step === "adjust" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />价格调整</CardTitle></CardHeader>
            <div>
              <p className="mb-4 text-sm text-zinc-500">
                {pricingMode === "HOURLY" ? "确认或调整每台设备的时租单价。" :
                 pricingMode === "DAILY" ? "确认或调整每台设备的日租单价。" :
                 "确认或调整每台设备的月租单价。"}修改后需填写原因。
              </p>
              <div className="space-y-3">
                {selectedEquipment.map(item => {
                  const r = pricingResults[item.equipmentId];
                  // Per-mode standard price
                  const modeStandardRent = Math.round((pricingMode === "DAILY" ? item.standardRent / 30
                    : pricingMode === "HOURLY" ? item.standardRent / 30 / 8
                    : item.standardRent) * 100) / 100;
                  const rentLabel = pricingMode === "HOURLY" ? "时租金" : pricingMode === "DAILY" ? "日租金" : "月租金";
                  const rentDiscount = modeStandardRent > 0
                    ? ((modeStandardRent - item.unitPrice) / modeStandardRent * 100)
                    : 0;
                  const depReduction = item.standardDeposit > 0
                    ? ((item.standardDeposit - item.depositAmount) / item.standardDeposit * 100)
                    : 0;
                  const hasRentChange = modeStandardRent > 0 && !pricesEqual(item.unitPrice, modeStandardRent);
                  const hasDepChange = item.standardDeposit > 0 && !pricesEqual(item.depositAmount, item.standardDeposit);
                  return (
                    <div key={item.equipmentId} className={`rounded-lg border p-3 ${hasRentChange || hasDepChange ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10" : "border-zinc-200 dark:border-zinc-700"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{item.name}</span>
                        <span className="text-xs text-zinc-400">{item.equipmentNo}</span>
                        {(hasRentChange || hasDepChange) && <Badge variant="warning" className="text-[10px]">已调价</Badge>}
                      </div>
                      {/* Rent row */}
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs text-zinc-500 w-14 shrink-0">{rentLabel}</span>
                        <span className="text-xs text-zinc-400 line-through">{modeStandardRent > 0 ? `¥${modeStandardRent.toLocaleString()}` : "-"}</span>
                        <span className="text-xs text-zinc-300">→</span>
                        <div className="relative flex-1 max-w-[160px]">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-zinc-400">¥</span>
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={e => updateEquipmentField(item.equipmentId, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="pl-7 text-right text-sm"
                          />
                        </div>
                        {rentDiscount > 0 && (
                          <span className={`text-xs font-medium whitespace-nowrap ${rentDiscount > 20 ? "text-red-600" : "text-amber-600"}`}>
                            -{rentDiscount.toFixed(0)}%
                            {rentDiscount > 20 && <AlertTriangle className="ml-0.5 inline h-3 w-3" />}
                          </span>
                        )}
                        {r && (
                          <span className="text-xs text-zinc-500 whitespace-nowrap">
                            应收 ¥{r.rentAmount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {/* Deposit row */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 w-14 shrink-0">押金</span>
                        <span className="text-xs text-zinc-400 line-through">{item.standardDeposit > 0 ? `¥${item.standardDeposit.toLocaleString()}` : "-"}</span>
                        <span className="text-xs text-zinc-300">→</span>
                        <div className="relative flex-1 max-w-[160px]">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-zinc-400">¥</span>
                          <Input
                            type="number"
                            value={item.depositAmount}
                            onChange={e => updateEquipmentField(item.equipmentId, "depositAmount", parseFloat(e.target.value) || 0)}
                            className="pl-7 text-right text-sm"
                          />
                        </div>
                        {depReduction > 0 && (
                          <span className="text-xs text-amber-600 font-medium whitespace-nowrap">-{depReduction.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Price change reason */}
          <Card>
            <CardHeader><CardTitle>改价原因</CardTitle></CardHeader>
            <Input
              id="adjustReason"
              label={selectedEquipment.some(item => {
                const modeStdRent = Math.round((pricingMode === "DAILY" ? item.standardRent / 30
                  : pricingMode === "HOURLY" ? item.standardRent / 30 / 8
                  : item.standardRent) * 100) / 100;
                return !pricesEqual(item.unitPrice, modeStdRent) ||
                  !pricesEqual(item.depositAmount, item.standardDeposit);
              }) ? "请填写改价原因（必填）" : "改价原因（可选）"}
              value={adjustReason}
              onChange={e => setAdjustReason(e.target.value)}
              placeholder="如：老客户优惠、长期合作折扣、设备状态调整等"
            />
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep("pricing")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" onClick={() => setStep("review")} disabled={!canProceed()}>
              下一步：确认提交 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Review ───────────────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />订单确认</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-zinc-500">客户：</span>{selectedCustomer?.name}</div>
                <div><span className="text-zinc-500">订单号：</span>{draftOrderId ? "已创建" : "待创建"}</div>
                <div><span className="text-zinc-500">计费方式：</span>{{HOURLY:"按小时",DAILY:"按天",MONTHLY:"按月",FIXED:"固定价",PROJECT_BASED:"按项目"}[pricingMode]}</div>
                <div><span className="text-zinc-500">租期：</span>{plannedStartAt ? (pricingMode === "HOURLY" ? formatDateTime(plannedStartAt) : formatDate(plannedStartAt)) : "-"} ~ {plannedEndAt ? (pricingMode === "HOURLY" ? formatDateTime(plannedEndAt) : formatDate(plannedEndAt)) : "-"}</div>
                <div><span className="text-zinc-500">设备数量：</span>{selectedEquipment.length} 台</div>
                <div><span className="text-zinc-500">租金合计：</span><span className="font-semibold">{formatCurrency(totalRent)}</span></div>
                <div><span className="text-zinc-500">押金合计：</span>{formatCurrency(totalDeposit)}</div>
                <div><span className="text-zinc-500">运输/材料/其他：</span>{formatCurrency(parseFloat(transportFee) + parseFloat(materialFee) + parseFloat(otherFee))}</div>
              </div>
              <Input id="remark" label="备注" value={remark} onChange={e => setRemark(e.target.value)} />
              {adjustReason && (
                <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  改价原因：{adjustReason}
                </div>
              )}
              {!draftOrderId && (
                <Button variant="primary" onClick={handleCreateDraft} disabled={loading || pricingLoading || !pricingPreviewResult} className="w-full">
                  {loading ? "创建中..." : "创建草稿订单"} <FileText className="ml-1 h-4 w-4" />
                </Button>
              )}
              {draftOrderId && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  <Check className="mr-1 inline h-4 w-4" />草稿订单已创建，确认无误后点击提交
                </div>
              )}
              {draftOrderId && pricingPreviewResult?.needsApproval && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  该订单可能需要审批：{pricingPreviewResult.approvalReasons.join("；")}
                </div>
              )}
              {draftOrderId && selectedCustomer?.risk_level === "HIGH" && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  客户风险等级为 HIGH，订单可能需要审批。
                </div>
              )}
            </div>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep("adjust")}><ArrowLeft className="mr-1 h-4 w-4" />上一步</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!draftOrderId || submitting}>
              {submitting ? "提交中..." : "提交订单"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
