"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { createNotification } from "@/lib/actions/notification";

// ─── Schemas ──────────────────────────────────────────────────────────

const confirmPaymentSchema = z.object({
  amount: z.coerce.number().positive("金额必须大于0"),
  paymentMethod: z.string().default("BANK_TRANSFER"),
  payerName: z.string().min(1, "请填写付款人"),
  bankFlowNo: z.string().optional(),
});

const requestRefundSchema = z.object({
  refundAmount: z.coerce.number().optional(),
  refundMethod: z.string().default("BANK_TRANSFER"),
  reason: z.string().optional(),
});

// ─── Confirm Payment ──────────────────────────────────────────────────

export async function confirmPayment(
  receivableId: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  if (!receivableId || receivableId.length < 10) {
    return { success: false, error: "无效的应收记录" };
  }

  const raw = {
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod") || "BANK_TRANSFER",
    payerName: formData.get("payerName") || "",
    bankFlowNo: formData.get("bankFlowNo") || undefined,
  };
  const parsed = confirmPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return { success: false, error: `参数校验失败（${detail}）`, fieldErrors: fe };
  }

  const { error } = await supabase.rpc("process_payment_reconciliation", {
    p_receivable_id: receivableId,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.paymentMethod,
    p_payer_name: parsed.data.payerName ?? null,
    p_bank_flow_no: parsed.data.bankFlowNo ?? null,
    p_user_id: user.id,
  });

  if (error) return { success: false, error: error.message };

  // Notify salesperson about payment confirmation
  const { data: receivable } = await supabase
    .from("receivable")
    .select("order_id, contract_id, customer_id, amount")
    .eq("id", receivableId)
    .single();

  if (receivable?.order_id) {
    const { data: order } = await supabase
      .from("rental_order")
      .select("created_by, order_no")
      .eq("id", receivable.order_id)
      .single();

    if (order?.created_by) {
      await createNotification({
        recipientId: order.created_by,
        type: "PAYMENT_CONFIRMED",
        title: "收款确认: " + order.order_no,
        content: "订单 " + (order.order_no ?? "") + " 已收到付款 " + (parsed.data?.amount ?? 0).toString() + "。",
        businessType: "ORDER",
        businessId: receivable.order_id,
      });
    }
  }

  revalidatePath("/finance/receivables");
  revalidatePath("/finance/payments");
  return { success: true, data: null };
}

// ─── Request Refund ──────────────────────────────────────────────────

export async function requestRefund(
  depositId: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  if (!depositId || depositId.length < 10) {
    return { success: false, error: "无效的押金记录" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const raw = {
    refundAmount: formData.get("refundAmount") || undefined,
    refundMethod: formData.get("refundMethod") || "BANK_TRANSFER",
    reason: formData.get("reason") || undefined,
  };
  const parsed = requestRefundSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return { success: false, error: `参数校验失败（${detail}）`, fieldErrors: fe };
  }

  const refundNo = generateNo("RF");

  const { data: deposit } = await supabase
    .from("deposit_record")
    .select("customer_id, order_id, contract_id, available_amount")
    .eq("id", depositId)
    .single();

  if (!deposit) return { success: false, error: "押金记录不存在" };

  const refundAmount =
    parsed.data.refundAmount ??
    parseFloat(deposit.available_amount ?? "0");

  if (refundAmount <= 0) {
    return { success: false, error: "退款金额必须大于0" };
  }

  const { error } = await supabase.from("refund_record").insert({
    refund_no: refundNo,
    customer_id: deposit.customer_id,
    deposit_id: depositId,
    order_id: deposit.order_id,
    contract_id: deposit.contract_id,
    refund_amount: refundAmount,
    refund_method: parsed.data.refundMethod,
    refund_status: "PENDING_APPROVAL",
    reason: parsed.data.reason ?? null,
    created_by: profile.id,
  });

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "REFUND_REQUEST",
    resource_type: "REFUND",
    resource_id: depositId,
    detail: { refund_amount: refundAmount },
  });

  revalidatePath("/finance/refunds");
  revalidatePath("/finance/deposits");
  return { success: true, data: null };
}

// ─── Record Payment (standalone) ────────────────────────────────────

export async function recordPayment(
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const raw = {
    amount: formData.get("amount"),
    paymentMethod: (formData.get("paymentMethod") as string) || "BANK_TRANSFER",
    paymentType: (formData.get("paymentType") as string) || "OTHER",
    payerName: formData.get("payerName") || undefined,
    bankFlowNo: formData.get("bankFlowNo") || undefined,
    customerId: formData.get("customerId") as string,
    receivableId: (formData.get("receivableId") as string) || undefined,
    paidAt: (formData.get("paidAt") as string) || new Date().toISOString(),
  };
  const parsed = confirmPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { success: false, error: `参数校验失败`, fieldErrors: fe };
  }

  if (!raw.customerId || raw.customerId.length < 10) {
    return { success: false, error: "请选择客户" };
  }

  const paymentNo = generateNo("PAY");
  const { error } = await supabase.from("payment_record").insert({
    payment_no: paymentNo,
    customer_id: raw.customerId,
    receivable_id: raw.receivableId ?? null,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    payment_type: raw.paymentType,
    payer_name: parsed.data.payerName ?? null,
    bank_flow_no: parsed.data.bankFlowNo ?? null,
    paid_at: raw.paidAt,
    status: "COMPLETED",
    created_by: profile.id,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/payments");
  return { success: true, data: null };
}

// ─── Refund approval / rejection / execution ────────────────────────

export async function approveRefund(
  refundId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SYSTEM_ADMIN", "FINANCE_MANAGER", "GENERAL_MANAGER", "FINANCE"].includes(role)) {
    return { success: false, error: "无权限操作" };
  }

  const { data: refund } = await supabase
    .from("refund_record").select("id, refund_status").eq("id", refundId).single();
  if (!refund) return { success: false, error: "退款记录不存在" };
  if (refund.refund_status !== "PENDING_APPROVAL") {
    return { success: false, error: "当前状态不允许审批" };
  }

  const { error } = await supabase.from("refund_record").update({
    refund_status: "APPROVED",
    updated_at: new Date().toISOString(),
  }).eq("id", refundId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true, data: null };
}

export async function rejectRefund(
  refundId: string,
  reason: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SYSTEM_ADMIN", "FINANCE_MANAGER", "GENERAL_MANAGER", "FINANCE"].includes(role)) {
    return { success: false, error: "无权限操作" };
  }

  const { error } = await supabase.from("refund_record").update({
    refund_status: "REJECTED",
    rejected_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", refundId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/refunds");
  return { success: true, data: null };
}

export async function executeRefund(
  refundId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SYSTEM_ADMIN", "FINANCE", "FINANCE_MANAGER"].includes(role)) {
    return { success: false, error: "无权限操作" };
  }

  const { data: refund } = await supabase
    .from("refund_record").select("*, deposit:deposit_id(*)").eq("id", refundId).single();
  if (!refund) return { success: false, error: "退款记录不存在" };
  if (refund.refund_status !== "APPROVED") {
    return { success: false, error: "只有已审批的退款可执行" };
  }

  const deposit = refund.deposit as Record<string, unknown> | null;
  const refundAmount = parseFloat((refund.refund_amount as string) ?? "0");
  const depositId = refund.deposit_id as string;
  const currentRefunded = parseFloat((deposit?.refunded_amount as string) ?? "0");
  const currentAvailable = parseFloat((deposit?.available_amount as string) ?? "0");
  const newRefunded = currentRefunded + refundAmount;
  const newAvailable = Math.max(0, currentAvailable - refundAmount);

  const { error: refundError } = await supabase.from("refund_record").update({
    refund_status: "REFUNDED",
    refunded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", refundId);
  if (refundError) return { success: false, error: refundError.message };

  // Update deposit record
  if (depositId) {
    await supabase.from("deposit_record").update({
      refunded_amount: newRefunded,
      available_amount: newAvailable,
      deposit_status: newAvailable <= 0 ? "COMPLETED" : "REFUNDED",
      updated_at: new Date().toISOString(),
    }).eq("id", depositId);
  }

  revalidatePath("/finance/refunds");
  revalidatePath("/finance/deposits");
  return { success: true, data: null };
}
