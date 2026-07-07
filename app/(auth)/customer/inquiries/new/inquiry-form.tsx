"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, Check, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { submitRentalInquiry } from "@/lib/actions/operations";
import { pricingPreview } from "@/lib/actions/rental-order";
import { formatCurrency } from "@/lib/utils";

export interface EquipmentOption {
  id: string;
  equipment_no: string;
  name: string;
  brand: string | null;
  standard_rent: string | null;
  standard_deposit: string | null;
}

interface SelectedEquipment {
  equipmentId: string;
  equipmentNo: string;
  name: string;
  brand: string | null;
  quantity: number;
  unitPrice: number;
  depositAmount: number;
  standardRent: number;
  standardDeposit: number;
}

interface PricingPreviewState {
  totalRentAmount: number;
  totalDepositAmount: number;
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
  }>;
}

const pricingOptions = [
  { value: "MONTHLY", label: "按月" },
  { value: "DAILY", label: "按天" },
  { value: "HOURLY", label: "按小时" },
];

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function unitPriceForMode(monthlyRent: number, mode: string) {
  if (mode === "DAILY") return Math.round((monthlyRent / 30) * 100) / 100;
  if (mode === "HOURLY") return Math.round((monthlyRent / 30 / 8) * 100) / 100;
  return monthlyRent;
}

function toSelectedEquipment(item: EquipmentOption, mode: string): SelectedEquipment {
  const standardRent = toNumber(item.standard_rent);
  const standardDeposit = toNumber(item.standard_deposit);
  return {
    equipmentId: item.id,
    equipmentNo: item.equipment_no,
    name: item.name,
    brand: item.brand,
    quantity: 1,
    unitPrice: unitPriceForMode(standardRent, mode),
    depositAmount: standardDeposit,
    standardRent,
    standardDeposit,
  };
}

export function CustomerInquiryForm({
  customerReady,
  equipment,
  initialEquipmentId,
}: {
  customerReady: boolean;
  equipment: EquipmentOption[];
  initialEquipmentId: string;
}) {
  const router = useRouter();
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(initialEquipmentId);
  const [pricingMode, setPricingMode] = useState("MONTHLY");
  const [selectedEquipment, setSelectedEquipment] = useState<SelectedEquipment[]>(() => {
    const item = equipment.find((candidate) => candidate.id === initialEquipmentId);
    return item ? [toSelectedEquipment(item, "MONTHLY")] : [];
  });
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [remark, setRemark] = useState("");
  const [preview, setPreview] = useState<PricingPreviewState | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const equipmentById = useMemo(() => new Map(equipment.map((item) => [item.id, item])), [equipment]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedEquipment.length || !plannedStartAt || !plannedEndAt) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setPreview(null);
        setPricingLoading(false);
      });
      return () => { cancelled = true; };
    }

    const fd = new FormData();
    fd.set("pricingMode", pricingMode);
    fd.set("plannedStartAt", plannedStartAt);
    fd.set("plannedEndAt", plannedEndAt);
    fd.set("items", JSON.stringify(selectedEquipment.map((item) => ({
      equipmentId: item.equipmentId,
      unitPrice: item.unitPrice,
      depositAmount: item.depositAmount,
      quantity: item.quantity,
    }))));

    Promise.resolve().then(() => {
      if (!cancelled) setPricingLoading(true);
    });
    pricingPreview(fd).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPreview(result.data);
        setError("");
      } else {
        setPreview(null);
        setError(result.error);
      }
      setPricingLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedEquipment, pricingMode, plannedStartAt, plannedEndAt]);

  function addEquipment() {
    const item = equipmentById.get(selectedEquipmentId);
    if (!item || selectedEquipment.some((selected) => selected.equipmentId === item.id)) return;
    setSelectedEquipment((current) => [...current, toSelectedEquipment(item, pricingMode)]);
  }

  function removeEquipment(equipmentId: string) {
    setSelectedEquipment((current) => current.filter((item) => item.equipmentId !== equipmentId));
  }

  function updateUnitPrice(equipmentId: string, unitPrice: number) {
    setSelectedEquipment((current) => current.map((item) => item.equipmentId === equipmentId ? { ...item, unitPrice: Math.max(0, unitPrice) } : item));
  }

  function handlePricingModeChange(nextMode: string) {
    setPricingMode(nextMode);
    setSelectedEquipment((current) => current.map((item) => ({
      ...item,
      unitPrice: unitPriceForMode(item.standardRent, nextMode),
    })));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerReady) return;
    if (!preview) {
      setError("请先完成租金试算");
      return;
    }

    setSubmitting(true);
    setError("");
    const fd = new FormData();
    fd.set("pricingMode", pricingMode);
    fd.set("plannedStartAt", plannedStartAt);
    fd.set("plannedEndAt", plannedEndAt);
    fd.set("contactName", contactName);
    fd.set("contactPhone", contactPhone);
    fd.set("projectLocation", projectLocation);
    fd.set("remark", remark);
    fd.set("items", JSON.stringify(selectedEquipment.map((item) => ({
      equipmentId: item.equipmentId,
      unitPrice: item.unitPrice,
      depositAmount: item.depositAmount,
      quantity: item.quantity,
    }))));

    const result = await submitRentalInquiry(fd);
    if (!result.success) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push(`/customer/inquiries/${result.data.id}`);
    router.refresh();
  }

  const previewItemsById = useMemo(() => {
    const result: Record<string, PricingPreviewState["items"][number]> = {};
    for (const item of preview?.items ?? []) result[item.equipmentId] = item;
    return result;
  }, [preview]);

  return (
    <div className="space-y-6">
      <PageHeader title="提交租赁询价" backUrl="/customer/inquiries" />

      {!customerReady ? (
        <p className="rounded-lg border border-app-border bg-app-surface-muted p-4 text-sm text-app-muted">
          请先在 <Link href="/customer/profile" className="text-app-accent hover:underline">客户资料</Link> 绑定或创建客户档案，再提交询价。
        </p>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-app-danger/30 bg-app-danger/10 p-3 text-sm text-app-danger">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>设备需求</CardTitle></CardHeader>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Select
              label="意向设备"
              value={selectedEquipmentId}
              onChange={(event) => setSelectedEquipmentId(event.target.value)}
              options={[
                { value: "", label: "选择设备" },
                ...equipment.map((item) => ({ value: item.id, label: `${item.equipment_no} / ${item.name}` })),
              ]}
            />
            <Button type="button" variant="outline" onClick={addEquipment} disabled={!selectedEquipmentId}>
              <Plus className="h-4 w-4" />添加
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {selectedEquipment.length ? selectedEquipment.map((item) => {
              const priced = previewItemsById[item.equipmentId];
              return (
                <div key={item.equipmentId} className="grid gap-3 rounded-lg border border-app-border p-3 md:grid-cols-[1fr_80px_140px_120px_44px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-app-fg">{item.name}</p>
                    <p className="text-xs text-app-muted">{item.equipmentNo}{item.brand ? ` · ${item.brand}` : ""}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-app-muted">数量</p>
                    <p className="font-medium text-app-fg">1</p>
                  </div>
                  <Input
                    label="意向单价"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(event) => updateUnitPrice(item.equipmentId, Number(event.target.value) || 0)}
                  />
                  <div className="text-sm">
                    <p className="text-xs text-app-muted">试算租金</p>
                    <p className="font-medium text-app-fg">{priced ? formatCurrency(priced.rentAmount) : "-"}</p>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeEquipment(item.equipmentId)} aria-label="移除设备">
                    <Trash2 className="h-4 w-4 text-app-danger" />
                  </Button>
                </div>
              );
            }) : (
              <p className="rounded-lg border border-dashed border-app-border p-6 text-center text-sm text-app-muted">暂无设备</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4" />租金计算</CardTitle></CardHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="计费方式" value={pricingMode} onChange={(event) => handlePricingModeChange(event.target.value)} options={pricingOptions} />
            <Input
              label={pricingMode === "HOURLY" ? "开始时间" : "计划开始"}
              type={pricingMode === "HOURLY" ? "datetime-local" : "date"}
              value={plannedStartAt}
              onChange={(event) => setPlannedStartAt(event.target.value)}
              required
            />
            <Input
              label={pricingMode === "HOURLY" ? "结束时间" : "计划结束"}
              type={pricingMode === "HOURLY" ? "datetime-local" : "date"}
              value={plannedEndAt}
              onChange={(event) => setPlannedEndAt(event.target.value)}
              required
            />
          </div>

          <div className="mt-4 rounded-lg border border-app-border p-4">
            {pricingLoading ? (
              <p className="text-sm text-app-muted">正在试算...</p>
            ) : preview ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">租金 {formatCurrency(preview.totalRentAmount)}</Badge>
                  <Badge variant="default">押金 {formatCurrency(preview.totalDepositAmount)}</Badge>
                  {preview.needsApproval ? <Badge variant="warning">需业务确认</Badge> : <Badge variant="success">可提交</Badge>}
                </div>
                <p className="text-lg font-semibold text-app-fg">{formatCurrency(preview.totalRentAmount + preview.totalDepositAmount)}</p>
              </div>
            ) : (
              <p className="text-sm text-app-muted">填写租期后自动试算</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>联系信息</CardTitle></CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="联系人" value={contactName} onChange={(event) => setContactName(event.target.value)} />
            <Input label="联系电话" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
            <Input label="项目地点" value={projectLocation} onChange={(event) => setProjectLocation(event.target.value)} className="sm:col-span-2" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-app-muted-strong sm:col-span-2">
              备注
              <textarea
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                rows={3}
                className="premium-control focus-ring rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg"
              />
            </label>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button variant="primary" type="submit" disabled={!customerReady || submitting || pricingLoading || !preview}>
            {submitting ? "提交中..." : <><Check className="h-4 w-4" />提交询价</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
