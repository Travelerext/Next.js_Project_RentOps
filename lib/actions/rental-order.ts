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

  revalidatePath(`/sales/orders/${orderId}`);
  return { success: true, data: null };
}

export async function submitOrder(
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

  // Check order has items
  const { data: items, error: itemsError } = await supabase
    .from("rental_order_item")
    .select("id, equipment_id")
    .eq("order_id", orderId);

  if (itemsError) return { success: false, error: itemsError.message };
  if (!items || items.length === 0)
    return { success: false, error: "订单没有设备明细" };

  // Update totals from items
  const { data: totals } = await supabase
    .from("rental_order_item")
    .select("rent_amount, deposit_amount")
    .eq("order_id", orderId);

  const totalRent =
    totals?.reduce((sum, i) => sum + parseFloat(i.rent_amount ?? "0"), 0) ?? 0;
  const totalDeposit =
    totals?.reduce((sum, i) => sum + parseFloat(i.deposit_amount ?? "0"), 0) ??
    0;

  const { error } = await supabase
    .from("rental_order")
    .update({
      order_status: "PENDING_APPROVAL",
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

  // Lock all equipment in the order
  const equipmentIds = items.map((item) => item.equipment_id);
  await supabase
    .from("equipment")
    .update({ status: "LOCKED", updated_by: profile.id, updated_at: new Date().toISOString() })
    .in("id", equipmentIds);

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "ORDER_SUBMIT",
    resource_type: "ORDER",
    resource_id: orderId,
    detail: { total_rent: totalRent, total_deposit: totalDeposit },
  });

  // Create approval for the order
  const { data: order } = await supabase
    .from("rental_order")
    .select("order_no, customer_id")
    .eq("id", orderId)
    .single();

  if (order) {
    const customerName = (order as Record<string, unknown>).customer_id ?? "";
    await submitForApproval(
      "ORDER",
      orderId,
      "ORDER_APPROVAL",
      `订单审批: ${(order as Record<string, unknown>).order_no}`,
      `租金: ¥${totalRent.toFixed(2)} | 押金: ¥${totalDeposit.toFixed(2)}`
    );
  }

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${orderId}`);
  return { success: true, data: null };
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

  revalidatePath("/sales/orders");
  return { success: true, data: null };
}
