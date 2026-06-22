"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { submitForApproval } from "@/lib/actions/approval";

const createOrderSchema = z.object({
  pricingMode: z.enum(["HOURLY", "DAILY", "MONTHLY", "FIXED", "PROJECT_BASED"]),
  plannedStartAt: z.string().optional(),
  plannedEndAt: z.string().optional(),
  transportFee: z.string().default("0"),
  materialFee: z.string().default("0"),
  otherFee: z.string().default("0"),
  remark: z.string().optional(),
});

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

  // Check order has items
  const { data: items, error: itemsError } = await supabase
    .from("rental_order_item")
    .select("id, equipment_id, actual_unit_price, standard_unit_price, deposit_amount")
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
    items.reduce((sum, i) => sum + parseFloat(i.actual_unit_price ?? "0"), 0);
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
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/approval/pending");
  return {
    success: true,
    data: { needsApproval: ruleResult.needsApproval, reasons: ruleResult.reasons },
  };
}

export async function pricingPreview(formData: FormData) {
  const pricingMode = formData.get("pricingMode") as string;
  const unitPrice = parseFloat((formData.get("unitPrice") as string) || "0") || 0;
  const quantity = parseFloat((formData.get("quantity") as string) || "1") || 1;
  const deposit = parseFloat((formData.get("deposit") as string) || "0") || 0;
  const startAt = (formData.get("startAt") as string) || "";
  const endAt = (formData.get("endAt") as string) || "";

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
      rentAmount = unitPrice * (days * 8) * quantity;
      break;
    case "DAILY":
      rentAmount = unitPrice * days * quantity;
      break;
    case "MONTHLY":
      rentAmount = unitPrice * Math.max(1, Math.ceil(days / 30)) * quantity;
      break;
    case "FIXED":
    case "PROJECT_BASED":
      rentAmount = unitPrice * quantity;
      break;
    default:
      rentAmount = unitPrice * days * quantity;
  }

  const depositAmount = Math.round(deposit * quantity * 100) / 100;
  rentAmount = Math.round(rentAmount * 100) / 100;

  return {
    rentAmount,
    depositAmount,
    totalAmount: Math.round((rentAmount + depositAmount) * 100) / 100,
    days,
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
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  if (!orderId || orderId.length < 10) {
    return { success: false, error: "订单ID无效" };
  }

  // Only allow deleting DRAFT orders
  const { data: order } = await supabase
    .from("rental_order")
    .select("id, order_status, order_no")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "订单不存在" };
  if (order.order_status !== "DRAFT") {
    return { success: false, error: "只能删除草稿状态的订单" };
  }

  // Delete items first, then the order
  await supabase.from("rental_order_item").delete().eq("order_id", orderId);
  const { error } = await supabase
    .from("rental_order")
    .delete()
    .eq("id", orderId);

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_DELETE",
    resource_type: "ORDER",
    resource_id: orderId,
    detail: { order_no: order.order_no },
  });

  revalidatePath("/sales/orders");
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
