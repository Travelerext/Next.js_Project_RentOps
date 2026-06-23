"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { z } from "zod";

const requestReturnSchema = z.object({
  orderId: z.string().optional(),
  contractId: z.string().optional(),
  customerId: z.string().min(1, "缺少客户"),
  equipmentId: z.string().optional(),
  reason: z.string().optional(),
});

export async function requestReturn(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const raw = {
    orderId: (formData.get("orderId") as string) || undefined,
    contractId: (formData.get("contractId") as string) || undefined,
    customerId: formData.get("customerId") as string,
    equipmentId: (formData.get("equipmentId") as string) || undefined,
    reason: (formData.get("reason") as string) || undefined,
  };
  const parsed = requestReturnSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "参数校验失败" };
  }

  // Verify order/contract is in returnable state
  if (parsed.data.orderId) {
    const { data: order } = await supabase
      .from("rental_order").select("order_status").eq("id", parsed.data.orderId).single();
    if (!order || !["IN_PROGRESS", "PARTIAL_RETURN", "OVERDUE"].includes(order.order_status)) {
      return { success: false, error: "当前订单状态不允许退租" };
    }
  }
  if (parsed.data.contractId) {
    const { data: contract } = await supabase
      .from("rental_contract").select("contract_status").eq("id", parsed.data.contractId).single();
    if (!contract || contract.contract_status !== "ACTIVE") {
      return { success: false, error: "当前合同状态不允许退租" };
    }
  }

  const requestNo = generateNo("RR");
  const { data, error } = await supabase.from("return_request").insert({
    request_no: requestNo,
    order_id: parsed.data.orderId ?? null,
    contract_id: parsed.data.contractId ?? null,
    customer_id: parsed.data.customerId,
    equipment_id: parsed.data.equipmentId ?? null,
    requested_by: profile.id,
    reason: parsed.data.reason ?? null,
    request_status: "PENDING",
  }).select("id").single();

  if (error) return { success: false, error: error.message };

  // Freeze contract (don't require ACTIVE — contract might already be FROZEN)
  if (parsed.data.contractId) {
    const { data: contract } = await supabase
      .from("rental_contract")
      .select("contract_status")
      .eq("id", parsed.data.contractId)
      .single();

    if (contract && contract.contract_status === "ACTIVE") {
      await supabase.from("rental_contract").update({
        contract_status: "FROZEN",
        updated_at: new Date().toISOString(),
      }).eq("id", parsed.data.contractId);
    }
  }

  await supabase.from("audit_log").insert({
    actor_id: profile.id, action: "RETURN_REQUEST",
    resource_type: "RETURN_REQUEST", resource_id: data.id,
  });

  revalidatePath("/sales/orders");
  revalidatePath("/sales/contracts");
  revalidatePath("/equipment/scan/inbound");
  return { success: true, data: { id: data.id } };
}

export async function approveReturnRequest(
  requestId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SYSTEM_ADMIN", "SALES_MANAGER", "GENERAL_MANAGER", "APPROVER"].includes(role)) {
    return { success: false, error: "无权限操作" };
  }

  // Get return request with contract info
  const { data: rr } = await supabase
    .from("return_request").select("*")
    .eq("id", requestId).single();
  if (!rr) return { success: false, error: "退租申请不存在" };
  if (rr.request_status !== "PENDING_APPROVAL") {
    return { success: false, error: "当前状态不允许审批" };
  }

  // Approve the return
  const { error } = await supabase.from("return_request").update({
    request_status: "APPROVED",
    approved_by: profile.id,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", requestId);
  if (error) return { success: false, error: error.message };

  // Terminate contract — find from order if not directly linked
  let contractId = rr.contract_id as string | null;
  if (!contractId && rr.order_id) {
    const { data: ord } = await supabase
      .from("rental_order").select("id, customer_id")
      .eq("id", rr.order_id).single();
    if (ord) {
      const { data: ctr } = await supabase
        .from("rental_contract")
        .select("id")
        .eq("order_id", rr.order_id)
        .maybeSingle();
      contractId = ctr?.id as string ?? null;
    }
  }

  if (contractId) {
    const { error: ctrErr } = await supabase.from("rental_contract").update({
      contract_status: "TERMINATED",
      updated_at: new Date().toISOString(),
    }).eq("id", contractId);
    if (ctrErr) console.error("终止合同失败:", ctrErr.message);
  }

  // Complete order
  if (rr.order_id) {
    const { error: ordErr } = await supabase.from("rental_order").update({
      order_status: "COMPLETED",
      updated_at: new Date().toISOString(),
    }).eq("id", rr.order_id);
    if (ordErr) console.error("完成订单失败:", ordErr.message);
  }

  await supabase.from("audit_log").insert({
    actor_id: profile.id, action: "RETURN_APPROVE",
    resource_type: "RETURN_REQUEST", resource_id: requestId,
  });

  revalidatePath("/approval/pending");
  revalidatePath("/finance/settlement");
  return { success: true, data: null };
}

export async function rejectReturnRequest(
  requestId: string,
  reason?: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const role = profile.primary_role ?? "";
  if (!["SYSTEM_ADMIN", "SALES_MANAGER", "GENERAL_MANAGER", "APPROVER"].includes(role)) {
    return { success: false, error: "无权限操作" };
  }

  const { error } = await supabase.from("return_request").update({
    request_status: "REJECTED",
    remark: reason ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", requestId).eq("request_status", "PENDING_APPROVAL");
  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id, action: "RETURN_REJECT",
    resource_type: "RETURN_REQUEST", resource_id: requestId,
  });

  revalidatePath("/approval/pending");
  return { success: true, data: null };
}
