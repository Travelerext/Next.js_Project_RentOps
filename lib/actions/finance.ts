"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

// ─── Schemas ──────────────────────────────────────────────────────────

const confirmPaymentSchema = z.object({
  amount: z.coerce.number().positive("金额必须大于0"),
  paymentMethod: z.string().default("BANK_TRANSFER"),
  payerName: z.string().optional(),
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
    payerName: formData.get("payerName") || undefined,
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
