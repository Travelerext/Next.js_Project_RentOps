"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { submitForApproval } from "@/lib/actions/approval";

const createOrderSchema = z.object({
  pricingMode: z.enum(["HOURLY", "DAILY", "MONTHLY", "FIXED", "PROJECT", "PROJECT_BASED"])
    .transform((value) => (value === "PROJECT" ? "PROJECT_BASED" : value)),
  plannedStartAt: z.string().optional(),
  plannedEndAt: z.string().optional(),
  transportFee: z.string().default("0"),
  materialFee: z.string().default("0"),
  otherFee: z.string().default("0"),
  remark: z.string().optional(),
});

const quickOrderItemSchema = z.object({
  equipmentId: z.string().min(10, "设备ID无效"),
  unitPrice: z.coerce.number().nonnegative("成交单价不能小于0"),
  depositAmount: z.coerce.number().nonnegative("押金不能小于0"),
  quantity: z.coerce.number().positive("数量必须大于0").default(1),
});

type QuickOrderItemInput = z.infer<typeof quickOrderItemSchema>;

interface PricingLine {
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
}

interface PricingPreviewResult {
  totalRentAmount: number;
  totalDepositAmount: number;
  originalAmount: number;
  discountAmount: number;
  discountRate: number;
  needsApproval: boolean;
  approvalReasons: string[];
  items: PricingLine[];
}

export interface InquiryOrderPrefill {
  inquiry: {
    id: string;
    inquiryNo: string;
    pricingMode: string;
    plannedStartAt: string | null;
    plannedEndAt: string | null;
    projectLocation: string | null;
    remark: string | null;
  };
  customer: {
    id: string;
    name: string;
    customer_no: string;
    risk_level: string;
    is_blacklisted: boolean;
    lock_ordering: boolean;
    credit_level: string;
    lock_reason: string | null;
  };
  items: Array<{
    equipmentId: string;
    equipmentNo: string;
    name: string;
    brand: string | null;
    standardRent: number;
    standardDeposit: number;
    categoryId: string;
    estimatedUnitPrice: number | null;
  }>;
}

function toMoney(value: unknown): number {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPricingSpan(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false as const, error: "租期格式无效" };
  }
  if (endMs < startMs) {
    return { ok: false as const, error: "结束时间必须晚于开始时间" };
  }

  const hours = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60)));
  const days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
  return { ok: true as const, start, end, days, hours };
}

function calculateRentAmount(
  pricingMode: string,
  unitPrice: number,
  quantity: number,
  span: { days: number; hours: number }
) {
  switch (pricingMode) {
    case "HOURLY":
      return roundMoney(unitPrice * span.hours * quantity);
    case "DAILY":
      return roundMoney(unitPrice * span.days * quantity);
    case "MONTHLY":
      return roundMoney(unitPrice * Math.max(1, Math.ceil(span.days / 30)) * quantity);
    case "FIXED":
    case "PROJECT":
    case "PROJECT_BASED":
      return roundMoney(unitPrice * quantity);
    default:
      return roundMoney(unitPrice * span.days * quantity);
  }
}

function parseItemsFromForm(formData: FormData) {
  const raw = formData.get("items");
  if (typeof raw !== "string" || !raw.trim()) {
    return { success: false as const, error: "请选择设备" };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { success: false as const, error: "设备明细格式无效" };
  }

  const parsed = z.array(quickOrderItemSchema).min(1, "至少选择一台设备").safeParse(json);
  if (!parsed.success) {
    return { success: false as const, error: "设备明细校验失败" };
  }

  const duplicated = parsed.data.find((item, index, all) =>
    all.findIndex((candidate) => candidate.equipmentId === item.equipmentId) !== index
  );
  if (duplicated) {
    return { success: false as const, error: "设备明细不能重复" };
  }

  return { success: true as const, data: parsed.data };
}

export async function createRentalOrder(
  customerId: string,
  formData: FormData
): Promise<ActionResult<{ id: string; orderNo: string }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  // Validate — same pattern as useSparePart / updateSparePart
  if (!customerId || customerId.length < 10) {
    return { success: false, error: "请选择客户", fieldErrors: { customerId: ["客户ID无效"] } };
  }

  const raw = {
    pricingMode: formData.get("pricingMode") as string,
    plannedStartAt: (formData.get("plannedStartAt") as string) || undefined,
    plannedEndAt: (formData.get("plannedEndAt") as string) || undefined,
    transportFee: (formData.get("transportFee") as string) || "0",
    materialFee: (formData.get("materialFee") as string) || "0",
    otherFee: (formData.get("otherFee") as string) || "0",
    remark: (formData.get("remark") as string) || undefined,
  };
  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return {
      success: false,
      error: `参数校验失败（${detail}）`,
      fieldErrors: fe,
    };
  }

  // Resolve profile for sales_user_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  // Check customer
  const { data: customer } = await supabase
    .from("customer")
    .select("is_blacklisted, lock_ordering, risk_level")
    .eq("id", customerId)
    .single();

  if (customer?.is_blacklisted)
    return { success: false, error: "客户已被列入黑名单" };
  if (customer?.lock_ordering) return { success: false, error: "客户已被锁单" };

  const orderNo = generateNo("RO");

  const { data, error } = await supabase
    .from("rental_order")
    .insert({
      order_no: orderNo,
      customer_id: customerId,
      sales_user_id: profile.id,
      order_status: "DRAFT",
      pricing_mode: parsed.data.pricingMode,
      planned_start_at: parsed.data.plannedStartAt
        ? new Date(parsed.data.plannedStartAt).toISOString()
        : null,
      planned_end_at: parsed.data.plannedEndAt
        ? new Date(parsed.data.plannedEndAt).toISOString()
        : null,
      transport_fee: parsed.data.transportFee,
      material_fee: parsed.data.materialFee,
      other_fee: parsed.data.otherFee,
      remark: parsed.data.remark ?? null,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id, order_no")
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_CREATE",
    resource_type: "ORDER",
    resource_id: data.id,
    detail: { order_no: orderNo },
  });

  revalidatePath("/sales/orders");
  return { success: true, data: { id: data.id, orderNo: data.order_no } };
}

export async function addOrderItem(
  orderId: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const equipmentId = formData.get("equipmentId") as string;
  const pricingMode = (formData.get("pricingMode") as string) || "MONTHLY";
  const unitPrice = parseFloat((formData.get("unitPrice") as string) || "0") || 0;
  const deposit = parseFloat((formData.get("depositAmount") as string) || "0") || 0;
  const quantity = parseFloat((formData.get("quantity") as string) || "1") || 1;
  const startAt = (formData.get("startAt") as string) || null;
  const endAt = (formData.get("endAt") as string) || null;

  if (!equipmentId) return { success: false, error: "请选择设备" };

  // Check equipment availability
  const { data: equip } = await supabase
    .from("equipment")
    .select("status, standard_rent, standard_deposit")
    .eq("id", equipmentId)
    .single();

  if (!equip) return { success: false, error: "设备不存在" };
  if (equip.status !== "IN_STOCK")
    return { success: false, error: "设备当前不可租" };

  const actualPrice = unitPrice || parseFloat(equip.standard_rent ?? "0") || 0;

  // Calculate rent based on pricing mode and duration
  // The date range is inclusive: 6/1 ~ 6/30 = 30 days
  let days = 0;
  if (startAt && endAt) {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      days = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  let rentAmount = 0;
  switch (pricingMode) {
    case "HOURLY":
      rentAmount = actualPrice * (days * 8) * quantity;
      break;
    case "DAILY":
      rentAmount = actualPrice * days * quantity;
      break;
    case "MONTHLY":
      rentAmount = actualPrice * Math.max(1, Math.ceil(days / 30)) * quantity;
      break;
    case "FIXED":
    case "PROJECT_BASED":
      rentAmount = actualPrice * quantity;
      break;
    default:
      rentAmount = actualPrice * days * quantity;
  }
  rentAmount = Math.round(rentAmount * 100) / 100;

  const { error } = await supabase.from("rental_order_item").insert({
    order_id: orderId,
    equipment_id: equipmentId,
    quantity,
    pricing_mode: pricingMode,
    standard_unit_price: equip.standard_rent ?? 0,
    actual_unit_price: actualPrice,
    deposit_amount: deposit || (equip.standard_deposit ?? 0),
    rent_amount: rentAmount,
    start_at: startAt ? new Date(startAt).toISOString() : null,
    end_at: endAt ? new Date(endAt).toISOString() : null,
    expected_return_at: endAt ? new Date(endAt).toISOString() : null,
    item_status: "PENDING",
  });

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_ITEM_ADD",
    resource_type: "ORDER_ITEM",
    resource_id: orderId,
    detail: { equipment_id: equipmentId, pricing_mode: pricingMode, rent_amount: rentAmount },
  });

  revalidatePath(`/sales/orders/${orderId}`);
  return { success: true, data: null };
}

async function buildPricingPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: QuickOrderItemInput[],
  pricingMode: string,
  startAt: string,
  endAt: string
): Promise<ActionResult<PricingPreviewResult>> {
  const span = getPricingSpan(startAt, endAt);
  if (!span.ok) return { success: false, error: span.error };

  const equipmentIds = items.map((item) => item.equipmentId);
  const { data: equipmentRows, error } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, status, scrapped, deleted_at, standard_rent, standard_deposit")
    .in("id", equipmentIds);

  if (error) return { success: false, error: error.message };

  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id as string, equipment]));
  const previewItems: PricingLine[] = [];
  let totalRentAmount = 0;
  let totalDepositAmount = 0;
  let originalRentAmount = 0;
  let originalDepositAmount = 0;
  const approvalReasons = new Set<string>();

  for (const item of items) {
    const equipment = equipmentById.get(item.equipmentId);
    if (!equipment) return { success: false, error: "设备不存在或无权限访问" };
    if (equipment.status !== "IN_STOCK" || equipment.scrapped || equipment.deleted_at) {
      return { success: false, error: `设备 ${equipment.equipment_no ?? item.equipmentId.slice(0, 8)} 当前不可租，请刷新后重试` };
    }

    const monthlyStandard = toMoney(equipment.standard_rent);
    const standardUnitPrice = roundMoney(
      pricingMode === "DAILY"
        ? monthlyStandard / 30
        : pricingMode === "HOURLY"
          ? monthlyStandard / 30 / 8
          : monthlyStandard
    );
    const standardDeposit = toMoney(equipment.standard_deposit) * item.quantity;
    const rentAmount = calculateRentAmount(pricingMode, item.unitPrice, item.quantity, span);
    const depositAmount = roundMoney(item.depositAmount * item.quantity);
    const originalRent = calculateRentAmount(pricingMode, standardUnitPrice, item.quantity, span);

    if (standardUnitPrice > 0 && item.unitPrice < standardUnitPrice) {
      const discount = (standardUnitPrice - item.unitPrice) / standardUnitPrice;
      if (discount > DISCOUNT_APPROVAL_THRESHOLD) {
        approvalReasons.add(`设备单价折扣超过${(DISCOUNT_APPROVAL_THRESHOLD * 100).toFixed(0)}%`);
      }
    }

    if (standardDeposit > 0 && depositAmount < standardDeposit) {
      const reduction = (standardDeposit - depositAmount) / standardDeposit;
      if (reduction > DEPOSIT_REDUCTION_THRESHOLD) {
        approvalReasons.add(`押金减免超过${(DEPOSIT_REDUCTION_THRESHOLD * 100).toFixed(0)}%`);
      }
    }

    totalRentAmount += rentAmount;
    totalDepositAmount += depositAmount;
    originalRentAmount += originalRent;
    originalDepositAmount += standardDeposit;
    previewItems.push({
      equipmentId: item.equipmentId,
      equipmentNo: equipment.equipment_no as string,
      name: equipment.name as string,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      standardUnitPrice,
      rentAmount,
      depositAmount,
      days: span.days,
      hours: span.hours,
      priceAdjusted:
        roundMoney(item.unitPrice) !== roundMoney(standardUnitPrice) ||
        roundMoney(depositAmount) !== roundMoney(standardDeposit),
    });
  }

  totalRentAmount = roundMoney(totalRentAmount);
  totalDepositAmount = roundMoney(totalDepositAmount);
  originalRentAmount = roundMoney(originalRentAmount);
  originalDepositAmount = roundMoney(originalDepositAmount);
  const originalAmount = roundMoney(originalRentAmount + originalDepositAmount);
  const discountAmount = roundMoney(Math.max(0, originalRentAmount - totalRentAmount));
  const totalAmount = totalRentAmount + totalDepositAmount;
  if (totalAmount > HIGH_AMOUNT_THRESHOLD) {
    approvalReasons.add(`订单总金额超过¥${HIGH_AMOUNT_THRESHOLD.toLocaleString()}`);
  }

  return {
    success: true,
    data: {
      totalRentAmount,
      totalDepositAmount,
      originalAmount,
      discountAmount,
      discountRate: originalRentAmount > 0 ? roundMoney(discountAmount / originalRentAmount) : 0,
      needsApproval: approvalReasons.size > 0,
      approvalReasons: Array.from(approvalReasons),
      items: previewItems,
    },
  };
}

export async function createQuickRentalOrder(
  formData: FormData
): Promise<ActionResult<{ id: string; orderNo: string }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SALES", "SALES_MANAGER", "SYSTEM_ADMIN"].includes(role)) {
    return { success: false, error: "无权创建销售订单" };
  }

  const customerId = formData.get("customerId") as string;
  if (!customerId || customerId.length < 10) {
    return { success: false, error: "请选择客户", fieldErrors: { customerId: ["客户ID无效"] } };
  }

  const parsed = createOrderSchema.safeParse({
    pricingMode: formData.get("pricingMode") as string,
    plannedStartAt: (formData.get("plannedStartAt") as string) || undefined,
    plannedEndAt: (formData.get("plannedEndAt") as string) || undefined,
    transportFee: (formData.get("transportFee") as string) || "0",
    materialFee: (formData.get("materialFee") as string) || "0",
    otherFee: (formData.get("otherFee") as string) || "0",
    remark: (formData.get("remark") as string) || undefined,
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { success: false, error: "参数校验失败", fieldErrors };
  }

  if (!parsed.data.plannedStartAt || !parsed.data.plannedEndAt) {
    return { success: false, error: "请填写完整租期" };
  }

  const parsedItems = parseItemsFromForm(formData);
  if (!parsedItems.success) {
    return { success: false, error: parsedItems.error };
  }

  const { data: customer } = await supabase
    .from("customer")
    .select("id, is_blacklisted, lock_ordering")
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customer) return { success: false, error: "客户不存在或无权限访问" };
  if (customer.is_blacklisted) return { success: false, error: "黑名单客户不能开单" };
  if (customer.lock_ordering) return { success: false, error: "客户已被锁定，不能开单" };

  const sourceInquiryId = ((formData.get("sourceInquiryId") as string) || "").trim();
  const { data: sourceInquiry } = sourceInquiryId
    ? await supabase
        .from("rental_inquiry")
        .select("id, customer_id, status, converted_order_id")
        .eq("id", sourceInquiryId)
        .maybeSingle()
    : { data: null };
  if (sourceInquiryId) {
    if (!sourceInquiry) return { success: false, error: "来源询价不存在或无权限访问" };
    if (sourceInquiry.customer_id !== customerId) return { success: false, error: "来源询价与当前客户不一致" };
    if (sourceInquiry.converted_order_id || sourceInquiry.status === "CONVERTED") return { success: false, error: "来源询价已转为订单" };
    if (["CANCELLED", "CLOSED"].includes(sourceInquiry.status as string)) return { success: false, error: "来源询价已撤销或关闭" };
  }

  const preview = await buildPricingPreview(
    supabase,
    parsedItems.data,
    parsed.data.pricingMode,
    parsed.data.plannedStartAt,
    parsed.data.plannedEndAt
  );
  if (!preview.success) return preview;

  const hasPriceAdjustment = preview.data.items.some((item) => item.priceAdjusted);
  const adjustmentReason = ((formData.get("adjustReason") as string) || "").trim();
  if (hasPriceAdjustment && !adjustmentReason) {
    return { success: false, error: "改价必须填写原因", fieldErrors: { adjustReason: ["改价必须填写原因"] } };
  }

  const orderNo = generateNo("RO");
  const startIso = new Date(parsed.data.plannedStartAt).toISOString();
  const endIso = new Date(parsed.data.plannedEndAt).toISOString();
  const transportFee = toMoney(parsed.data.transportFee);
  const materialFee = toMoney(parsed.data.materialFee);
  const otherFee = toMoney(parsed.data.otherFee);
  const receivableAmount = roundMoney(
    preview.data.totalRentAmount +
    preview.data.totalDepositAmount +
    transportFee +
    materialFee +
    otherFee
  );

  const { data: order, error: orderError } = await supabase
    .from("rental_order")
    .insert({
      order_no: orderNo,
      customer_id: customerId,
      sales_user_id: profile.id,
      order_status: "DRAFT",
      pricing_mode: parsed.data.pricingMode,
      planned_start_at: startIso,
      planned_end_at: endIso,
      total_rent_amount: preview.data.totalRentAmount,
      total_deposit_amount: preview.data.totalDepositAmount,
      transport_fee: transportFee,
      material_fee: materialFee,
      other_fee: otherFee,
      discount_amount: preview.data.discountAmount,
      receivable_amount: receivableAmount,
      unpaid_amount: receivableAmount,
      remark: parsed.data.remark ?? null,
      risk_warning_triggered: preview.data.needsApproval,
      risk_warnings: preview.data.approvalReasons,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id, order_no")
    .single();

  if (orderError) return { success: false, error: orderError.message };

  const itemRows = preview.data.items.map((item) => ({
    order_id: order.id,
    equipment_id: item.equipmentId,
    quantity: item.quantity,
    pricing_mode: parsed.data.pricingMode,
    standard_unit_price: item.standardUnitPrice,
    actual_unit_price: item.unitPrice,
    deposit_amount: item.depositAmount,
    rent_amount: item.rentAmount,
    start_at: startIso,
    end_at: endIso,
    expected_return_at: endIso,
    item_status: "PENDING",
    price_adjusted: item.priceAdjusted,
    price_adjustment_reason: item.priceAdjusted ? adjustmentReason : null,
  }));

  const { error: itemsError } = await supabase.from("rental_order_item").insert(itemRows);
  if (itemsError) {
    await supabase
      .from("rental_order")
      .update({
        order_status: "CANCELLED",
        deleted_at: new Date().toISOString(),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return { success: false, error: itemsError.message };
  }

  if (sourceInquiryId) {
    const { data: updatedInquiry, error: inquiryError } = await supabase
      .from("rental_inquiry")
      .update({
        status: "CONVERTED",
        converted_order_id: order.id,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceInquiryId)
      .eq("customer_id", customerId)
      .is("converted_order_id", null)
      .not("status", "in", "(CONVERTED,CANCELLED,CLOSED)")
      .select("id")
      .maybeSingle();
    if (inquiryError || !updatedInquiry) {
      await supabase
        .from("rental_order")
        .update({
          order_status: "CANCELLED",
          deleted_at: new Date().toISOString(),
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      return { success: false, error: inquiryError?.message ?? "来源询价状态已变化，请刷新后重试" };
    }
  }

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_CREATE",
    resource_type: "ORDER",
    resource_id: order.id,
    detail: {
      order_no: order.order_no,
      equipment_count: itemRows.length,
      total_rent: preview.data.totalRentAmount,
      total_deposit: preview.data.totalDepositAmount,
      has_price_adjustment: hasPriceAdjustment,
      adjustment_reason: adjustmentReason || null,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${order.id}`);
  if (sourceInquiryId) {
    revalidatePath("/sales/inquiries");
    revalidatePath(`/sales/inquiries/${sourceInquiryId}`);
    revalidatePath("/customer/inquiries");
    revalidatePath(`/customer/inquiries/${sourceInquiryId}`);
  }

  return { success: true, data: { id: order.id, orderNo: order.order_no } };
}

// ─── Approval rule constants ──────────────────────────────────────────────
const DISCOUNT_APPROVAL_THRESHOLD = 0.20;   // 20%+ discount triggers approval
const HIGH_AMOUNT_THRESHOLD = 50000;         // ¥50,000+ triggers approval
const DEPOSIT_REDUCTION_THRESHOLD = 0.30;    // 30%+ deposit reduction triggers approval

interface ApprovalRuleResult {
  needsApproval: boolean;
  reasons: string[];
}

async function evaluateApprovalRules(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  customerId: string,
  totalRent: number,
  totalDeposit: number
): Promise<ApprovalRuleResult> {
  const reasons: string[] = [];

  // 1. Check customer risk level
  const { data: customer } = await supabase
    .from("customer")
    .select("risk_level, credit_level, is_blacklisted, lock_ordering, credit_limit")
    .eq("id", customerId)
    .single();

  if (!customer) {
    return { needsApproval: true, reasons: ["客户信息不存在"] };
  }

  if (customer.risk_level === "CRITICAL") {
    reasons.push("客户风险等级为CRITICAL");
  } else if (customer.risk_level === "HIGH") {
    reasons.push("客户风险等级为HIGH");
  }

  // 2. Check discount against standard prices
  const { data: items } = await supabase
    .from("rental_order_item")
    .select("actual_unit_price, standard_unit_price, deposit_amount, equipment_id")
    .eq("order_id", orderId);

  if (items) {
    // Check price discount
    for (const item of items) {
      const actualPrice = parseFloat(item.actual_unit_price ?? "0");
      const standardPrice = parseFloat(item.standard_unit_price ?? "0");
      if (standardPrice > 0 && actualPrice < standardPrice) {
        const discount = (standardPrice - actualPrice) / standardPrice;
        if (discount > DISCOUNT_APPROVAL_THRESHOLD) {
          reasons.push(`设备单价折扣超过${(DISCOUNT_APPROVAL_THRESHOLD * 100).toFixed(0)}%`);
          break; // Only need one reason
        }
      }
    }

    // Check deposit reduction against equipment standard deposits
    const equipmentIds = items.map((i) => i.equipment_id);
    const { data: equipment } = await supabase
      .from("equipment")
      .select("id, standard_deposit")
      .in("id", equipmentIds);

    if (equipment) {
      let totalStandardDeposit = 0;
      for (const eq of equipment) {
        totalStandardDeposit += parseFloat(eq.standard_deposit ?? "0");
      }
      if (totalStandardDeposit > 0 && totalDeposit < totalStandardDeposit) {
        const reduction = (totalStandardDeposit - totalDeposit) / totalStandardDeposit;
        if (reduction > DEPOSIT_REDUCTION_THRESHOLD) {
          reasons.push(`押金减免超过${(DEPOSIT_REDUCTION_THRESHOLD * 100).toFixed(0)}%`);
        }
      }
    }
  }

  // 3. Check high amount
  if (totalRent + totalDeposit > HIGH_AMOUNT_THRESHOLD) {
    reasons.push(`订单总金额超过¥${HIGH_AMOUNT_THRESHOLD.toLocaleString()}`);
  }

  // 4. Check credit limit
  if (customer.credit_limit > 0) {
    const { data: unsettled } = await supabase
      .from("receivable")
      .select("unpaid_amount")
      .eq("customer_id", customerId)
      .in("status", ["UNPAID", "PARTIAL", "OVERDUE"]);

    const totalUnsettled = unsettled?.reduce(
      (sum, r) => sum + parseFloat(r.unpaid_amount ?? "0"),
      0
    ) ?? 0;

    if (totalUnsettled + totalRent > parseFloat(customer.credit_limit.toString())) {
      reasons.push("超出客户信用额度");
    }
  }

  return { needsApproval: reasons.length > 0, reasons };
}

export async function submitOrder(
  orderId: string
): Promise<ActionResult<{ needsApproval: boolean; reasons: string[] }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  // Load order with customer info
  const { data: order } = await supabase
    .from("rental_order")
    .select("id, order_no, customer_id, order_status")
    .eq("id", orderId)
    .single();

  if (!order) return { success: false, error: "订单不存在" };
  if (order.order_status !== "DRAFT")
    return { success: false, error: "只能提交草稿状态的订单" };

  const { data: customerStatus } = await supabase
    .from("customer")
    .select("is_blacklisted, lock_ordering")
    .eq("id", order.customer_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!customerStatus) return { success: false, error: "客户不存在或无权限访问" };
  if (customerStatus.is_blacklisted) return { success: false, error: "黑名单客户不能开单" };
  if (customerStatus.lock_ordering) return { success: false, error: "客户已被锁定，不能开单" };

  // Check order has items
  const { data: items, error: itemsError } = await supabase
    .from("rental_order_item")
    .select("id, equipment_id, rent_amount, actual_unit_price, standard_unit_price, deposit_amount")
    .eq("order_id", orderId);

  if (itemsError) return { success: false, error: itemsError.message };
  if (!items || items.length === 0)
    return { success: false, error: "订单没有设备明细" };

  // Re-validate equipment availability
  const equipmentIds = items.map((item) => item.equipment_id);
  const { data: equipmentStatus } = await supabase
    .from("equipment")
    .select("id, status")
    .in("id", equipmentIds);

  const unavailableEquipment = equipmentStatus?.filter(
    (e) => e.status !== "IN_STOCK"
  );
  if (unavailableEquipment && unavailableEquipment.length > 0) {
    return {
      success: false,
      error: `以下设备状态已变更，无法提交：${unavailableEquipment.map((e) => e.id.slice(0, 8)).join(", ")}`,
    };
  }

  // Calculate totals
  const totalRent =
    items.reduce((sum, i) => sum + parseFloat(i.rent_amount ?? "0"), 0);
  const totalDeposit =
    items.reduce((sum, i) => sum + parseFloat(i.deposit_amount ?? "0"), 0);

  // ── Evaluate approval rules ──
  const ruleResult = await evaluateApprovalRules(
    supabase,
    orderId,
    order.customer_id,
    totalRent,
    totalDeposit
  );

  const newStatus = ruleResult.needsApproval ? "PENDING_APPROVAL" : "APPROVED";

  // Update order
  const { error } = await supabase
    .from("rental_order")
    .update({
      order_status: newStatus,
      total_rent_amount: totalRent,
      total_deposit_amount: totalDeposit,
      receivable_amount: totalRent + totalDeposit,
      unpaid_amount: totalRent + totalDeposit,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("order_status", "DRAFT");

  if (error) return { success: false, error: error.message };

  // Lock equipment (only for orders that go to approval — auto-approved orders
  // will have equipment status updated by contract activation instead)
  if (ruleResult.needsApproval) {
    await supabase
      .from("equipment")
      .update({ status: "LOCKED", updated_by: profile.id, updated_at: new Date().toISOString() })
      .in("id", equipmentIds);
  }

  // Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_SUBMIT",
    resource_type: "ORDER",
    resource_id: orderId,
    detail: {
      order_no: order.order_no,
      total_rent: totalRent,
      total_deposit: totalDeposit,
      needs_approval: ruleResult.needsApproval,
      approval_reasons: ruleResult.reasons,
    },
  });

  // Create approval if needed
  if (ruleResult.needsApproval) {
    await submitForApproval(
      "ORDER",
      orderId,
      "ORDER_APPROVAL",
      `订单审批: ${order.order_no}`,
      `租金: ¥${totalRent.toFixed(2)} | 押金: ¥${totalDeposit.toFixed(2)}\n触发原因: ${ruleResult.reasons.join("; ")}`
    );
  }

  revalidatePath("/sales/orders");
  revalidatePath("/sales");
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/approval/pending");
  return {
    success: true,
    data: { needsApproval: ruleResult.needsApproval, reasons: ruleResult.reasons },
  };
}

export async function pricingPreview(
  formData: FormData
): Promise<ActionResult<PricingPreviewResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const parsed = createOrderSchema.safeParse({
    pricingMode: formData.get("pricingMode") as string,
    plannedStartAt: (formData.get("plannedStartAt") as string) || undefined,
    plannedEndAt: (formData.get("plannedEndAt") as string) || undefined,
    transportFee: "0",
    materialFee: "0",
    otherFee: "0",
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { success: false, error: "参数校验失败", fieldErrors };
  }
  if (!parsed.data.plannedStartAt || !parsed.data.plannedEndAt) {
    return { success: false, error: "请填写完整租期" };
  }

  const parsedItems = parseItemsFromForm(formData);
  if (!parsedItems.success) {
    return { success: false, error: parsedItems.error };
  }

  return buildPricingPreview(
    supabase,
    parsedItems.data,
    parsed.data.pricingMode,
    parsed.data.plannedStartAt,
    parsed.data.plannedEndAt
  );
}

export async function getInquiryOrderPrefill(
  inquiryId: string
): Promise<ActionResult<InquiryOrderPrefill>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SALES", "SALES_MANAGER", "SYSTEM_ADMIN"].includes(role)) {
    return { success: false, error: "无权转化询价" };
  }

  if (!inquiryId || inquiryId.length < 10) {
    return { success: false, error: "询价ID无效" };
  }

  const { data: inquiry, error: inquiryError } = await supabase
    .from("rental_inquiry")
    .select("id, inquiry_no, customer_id, planned_start_at, planned_end_at, project_location, remark, status, converted_order_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (inquiryError) return { success: false, error: inquiryError.message };
  if (!inquiry) return { success: false, error: "来源询价不存在或无权访问" };
  if (inquiry.converted_order_id || inquiry.status === "CONVERTED") {
    return { success: false, error: "该询价已转为订单" };
  }
  if (["CANCELLED", "CLOSED"].includes(inquiry.status as string)) {
    return { success: false, error: "该询价已撤销或关闭，不能转为订单" };
  }

  let pricingMode = "MONTHLY";
  const { data: pricingData } = await supabase
    .from("rental_inquiry")
    .select("pricing_mode")
    .eq("id", inquiryId)
    .maybeSingle();
  if (pricingData?.pricing_mode) {
    pricingMode = String(pricingData.pricing_mode);
  }

  const { data: customer, error: customerError } = await supabase
    .from("customer")
    .select("id, name, customer_no, risk_level, is_blacklisted, lock_ordering, credit_level, lock_reason")
    .eq("id", inquiry.customer_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (customerError) return { success: false, error: customerError.message };
  if (!customer) return { success: false, error: "来源询价客户不存在或无权访问" };

  const { data: inquiryItems, error: itemsError } = await supabase
    .from("rental_inquiry_item")
    .select("id, equipment_id, estimated_unit_price")
    .eq("inquiry_id", inquiryId);
  if (itemsError) return { success: false, error: itemsError.message };

  const equipmentIds = Array.from(new Set((inquiryItems ?? []).map((item) => item.equipment_id).filter(Boolean)));
  const { data: equipmentRows, error: equipmentError } = equipmentIds.length > 0
    ? await supabase
        .from("equipment")
        .select("id, equipment_no, name, brand, standard_rent, standard_deposit, category_id, status, scrapped, deleted_at")
        .in("id", equipmentIds)
    : { data: [], error: null };
  if (equipmentError) return { success: false, error: equipmentError.message };

  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id as string, equipment]));
  const items = (inquiryItems ?? [])
    .map((item) => {
      const equipment = item.equipment_id ? equipmentById.get(item.equipment_id as string) : null;
      if (!equipment || !item.equipment_id) return null;
      if (equipment.deleted_at) return null;

      const standardRent = toMoney(equipment.standard_rent);
      const standardDeposit = toMoney(equipment.standard_deposit);
      const estimatedUnitPrice = toMoney(item.estimated_unit_price);
      return {
        equipmentId: item.equipment_id as string,
        equipmentNo: String(equipment.equipment_no ?? ""),
        name: String(equipment.name ?? ""),
        brand: equipment.brand ? String(equipment.brand) : null,
        standardRent,
        standardDeposit,
        categoryId: String(equipment.category_id ?? ""),
        estimatedUnitPrice: estimatedUnitPrice > 0 ? estimatedUnitPrice : null,
      };
    })
    .filter((item): item is InquiryOrderPrefill["items"][number] => Boolean(item));

  return {
    success: true,
    data: {
      inquiry: {
        id: inquiry.id,
        inquiryNo: inquiry.inquiry_no,
        pricingMode,
        plannedStartAt: inquiry.planned_start_at,
        plannedEndAt: inquiry.planned_end_at,
        projectLocation: inquiry.project_location,
        remark: inquiry.remark,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        customer_no: customer.customer_no,
        risk_level: customer.risk_level ?? "LOW",
        is_blacklisted: Boolean(customer.is_blacklisted),
        lock_ordering: Boolean(customer.lock_ordering),
        credit_level: customer.credit_level ?? "B",
        lock_reason: customer.lock_reason ?? null,
      },
      items,
    },
  };
}

// ─── Delete Draft Order ──────────────────────────────────────────────────

export async function deleteDraftOrder(
  orderId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };
  const role = profile.primary_role ?? "";
  if (!["SALES", "SALES_MANAGER", "SYSTEM_ADMIN"].includes(role)) {
    return { success: false, error: "无权删除草稿订单" };
  }

  if (!orderId || orderId.length < 10) {
    return { success: false, error: "订单ID无效" };
  }

  // Only allow deleting DRAFT orders
  const { data: order } = await supabase
    .from("rental_order")
    .select("id, order_status, order_no, created_by, sales_user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "订单不存在" };
  if (order.order_status !== "DRAFT") {
    return { success: false, error: "只能删除草稿状态的订单" };
  }

  const { data: linkedInquiries, error: inquiryError } = await supabase
    .from("rental_inquiry")
    .update({
      status: "CANCELLED",
      converted_order_id: null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("converted_order_id", orderId)
    .select("id");
  if (inquiryError) return { success: false, error: inquiryError.message };

  const { error, count } = await supabase
    .from("rental_order")
    .delete({ count: "exact" })
    .eq("id", orderId)
    .eq("order_status", "DRAFT");

  if (error || count !== 1) {
    const linkedIds = (linkedInquiries ?? []).map((inquiry) => inquiry.id);
    if (linkedIds.length > 0) {
      await supabase
        .from("rental_inquiry")
        .update({
          status: "CONVERTED",
          converted_order_id: orderId,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", linkedIds);
    }
    return { success: false, error: error?.message ?? "草稿订单未删除，请刷新后重试" };
  }

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_DELETE",
    resource_type: "ORDER",
    resource_id: orderId,
    detail: { order_no: order.order_no, cancelled_inquiry_ids: (linkedInquiries ?? []).map((inquiry) => inquiry.id) },
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${orderId}`);
  for (const inquiry of linkedInquiries ?? []) {
    revalidatePath(`/sales/inquiries/${inquiry.id}`);
    revalidatePath(`/customer/inquiries/${inquiry.id}`);
  }
  revalidatePath("/sales/inquiries");
  revalidatePath("/customer/inquiries");
  return { success: true, data: null };
}

// ─── Cancel Order ────────────────────────────────────────────────────────

export async function cancelOrder(
  orderId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  if (!orderId || orderId.length < 10) {
    return { success: false, error: "订单ID无效" };
  }

  // Only allow cancelling orders that haven't been fulfilled
  const { data: order } = await supabase
    .from("rental_order")
    .select("id, order_status, order_no")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "订单不存在" };
  if (!["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CONFIRMED"].includes(order.order_status)) {
    return { success: false, error: "当前订单状态不允许撤销" };
  }

  // Unlock equipment and clear location tracking fields
  const { data: items } = await supabase
    .from("rental_order_item")
    .select("equipment_id")
    .eq("order_id", orderId);

  if (items?.length) {
    const equipmentIds = items.map((i) => i.equipment_id);
    const now = new Date().toISOString();
    await supabase
      .from("equipment")
      .update({
        status: "IN_STOCK",
        current_order_id: null,
        current_contract_id: null,
        current_location_type: "WAREHOUSE",
        current_customer_id: null,
        current_project_site_id: null,
        current_location_id: null,
        current_location_text: null,
        updated_at: now,
      })
      .in("id", equipmentIds);
  }

  // Soft-delete the order
  const { error } = await supabase
    .from("rental_order")
    .update({
      order_status: "CANCELLED",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };

  // Resolve profile for audit
  const { data: canceller } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (canceller) {
    await supabase.from("audit_log").insert({
      actor_id: canceller.id,
      action: "ORDER_CANCEL",
      resource_type: "ORDER",
      resource_id: orderId,
      detail: { order_no: order.order_no, previous_status: order.order_status },
    });
  }

  revalidatePath("/sales/orders");
  return { success: true, data: null };
}
