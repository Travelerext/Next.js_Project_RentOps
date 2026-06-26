"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { createNotifications } from "@/lib/actions/notification";

// ─── Renew Contract ────────────────────────────────────────────────────

export async function renewContract(
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

  const contractId = formData.get("contractId") as string;
  const newEndAt = formData.get("newEndAt") as string;
  const reason = (formData.get("reason") as string) ?? "";
  const keepSamePrice = formData.get("keepSamePrice") === "true";

  if (!contractId || !newEndAt) {
    return { success: false, error: "缺少必要参数" };
  }

  // Get current contract
  const { data: contract, error: fetchError } = await supabase
    .from("rental_contract")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchError || !contract) {
    return { success: false, error: "合同不存在" };
  }

  const currentEnd = new Date(contract.end_at);
  const newEnd = new Date(newEndAt);
  if (newEnd <= currentEnd) {
    return { success: false, error: "新的结束日期必须在当前结束日期之后" };
  }

  // Record the change
  const { error: changeError } = await supabase
    .from("contract_change_record")
    .insert({
      contract_id: contractId,
      change_type: "RENEW",
      before_content: { end_at: contract.end_at },
      after_content: { end_at: newEndAt, reason, keep_same_price: keepSamePrice },
      reason: reason || null,
      changed_by: profile.id,
    });

  if (changeError) return { success: false, error: changeError.message };

  // Update contract end date
  const { error: updateError } = await supabase
    .from("rental_contract")
    .update({
      end_at: newEndAt,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", contractId);

  if (updateError) return { success: false, error: updateError.message };

  // Also update contract items' end dates
  const { data: items } = await supabase
    .from("rental_contract_item")
    .select("id, end_at")
    .eq("contract_id", contractId);

  if (items && items.length > 0) {
    await supabase
      .from("rental_contract_item")
      .update({ end_at: newEndAt })
      .eq("contract_id", contractId);
  }

  // Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_RENEW",
    resource_type: "CONTRACT",
    resource_id: contractId,
    detail: { new_end_at: newEndAt, reason, keep_same_price: keepSamePrice },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
  revalidatePath("/sales/contracts");

  return { success: true, data: null };
}

export async function createContract(
  orderId: string
): Promise<ActionResult<{ id: string; contractNo: string }>> {
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

  // Get order details
  const { data: order } = await supabase
    .from("rental_order")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) return { success: false, error: "订单不存在" };
  if (!["SUBMITTED", "APPROVED", "CONFIRMED"].includes(order.order_status)) {
    return { success: false, error: "订单状态不允许创建合同" };
  }

  // Get order items
  const { data: items } = await supabase
    .from("rental_order_item")
    .select("*")
    .eq("order_id", orderId);

  if (!items || items.length === 0)
    return { success: false, error: "订单没有设备明细" };

  const contractNo = generateNo("CT");

  // Create contract
  const { data: contract, error: contractError } = await supabase
    .from("rental_contract")
    .insert({
      contract_no: contractNo,
      order_id: orderId,
      customer_id: order.customer_id,
      sales_user_id: profile.id,
      contract_type: "FORMAL",
      contract_status: "DRAFT",
      start_at: order.planned_start_at ?? new Date().toISOString(),
      end_at: order.planned_end_at ?? new Date().toISOString(),
      total_rent_amount: order.total_rent_amount,
      deposit_amount: order.total_deposit_amount,
      rent_calculation_rule: { mode: order.pricing_mode },
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id, contract_no")
    .single();

  if (contractError)
    return { success: false, error: contractError.message };

  // Batch-fetch all equipment data for the items
  const equipmentIds = items.map((item) => item.equipment_id);
  const { data: equipmentList } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, condition_level")
    .in("id", equipmentIds);

  const equipMap = new Map(
    (equipmentList ?? []).map((e) => [e.id, e])
  );

  // Batch-insert contract items (snapshots)
  const defaultEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const contractItems = items.map((item) => {
    const equip = equipMap.get(item.equipment_id);
    return {
      contract_id: contract.id,
      order_item_id: item.id,
      equipment_id: item.equipment_id,
      equipment_no_snapshot: equip?.equipment_no ?? "",
      equipment_name_snapshot: equip?.name ?? "",
      condition_snapshot: equip?.condition_level ?? "A",
      rent_unit_price: item.actual_unit_price,
      deposit_amount: item.deposit_amount,
      rent_amount: item.rent_amount,
      start_at: item.start_at ?? new Date().toISOString(),
      end_at: item.end_at ?? defaultEnd,
    };
  });

  const { error: itemsError } = await supabase
    .from("rental_contract_item")
    .insert(contractItems);

  if (itemsError) {
    // Rollback: delete the contract we just created
    await supabase.from("rental_contract").delete().eq("id", contract.id);
    return { success: false, error: `创建合同明细失败: ${itemsError.message}` };
  }

  // Update order status
  await supabase
    .from("rental_order")
    .update({
      order_status: "CONFIRMED",
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_CREATE",
    resource_type: "CONTRACT",
    resource_id: contract.id,
    detail: { contract_no: contractNo, order_id: orderId },
  });

  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/sales/contracts");
  return {
    success: true,
    data: { id: contract.id, contractNo: contract.contract_no },
  };
}

export async function activateContract(
  contractId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { error } = await supabase.rpc("activate_contract", {
    p_contract_id: contractId,
    p_user_id: user.id,
  });

  if (error) return { success: false, error: error.message };

  // Notify finance about contract activation (receivable generated)
  const { data: contractInfo } = await supabase
    .from("rental_contract")
    .select("contract_no")
    .eq("id", contractId)
    .single();

  const { data: financeUsers } = await supabase
    .from("profiles")
    .select("id")
    .in("primary_role", ["FINANCE", "FINANCE_MANAGER", "SYSTEM_ADMIN"])
    .eq("account_status", "ACTIVE");

  if (financeUsers?.length) {
    await createNotifications(
      financeUsers.map((f) => ({
        recipientId: f.id,
        type: "CONTRACT_ACTIVE",
        title: "合同已激活: " + (contractInfo?.contract_no ?? contractId),
        content: "合同 " + (contractInfo?.contract_no ?? "") + " 已激活，应收已生成。请关注收款。",
        businessType: "CONTRACT",
        businessId: contractId,
      }))
    );
  }

  revalidatePath("/sales/contracts");
  revalidatePath(`/sales/contracts/${contractId}`);
  return { success: true, data: null };
}

// ─── Submit Contract for Signing ─────────────────────────────────────────

export async function submitContractForSigning(
  contractId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: contract } = await supabase
    .from("rental_contract")
    .select("id, contract_status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { success: false, error: "合同不存在" };
  if (contract.contract_status !== "DRAFT") {
    return { success: false, error: "只有草稿状态的合同可以提交签署" };
  }

  const { error } = await supabase
    .from("rental_contract")
    .update({
      contract_status: "PENDING_SIGN",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);
  if (error) return { success: false, error: error.message };

  // Resolve profile for audit
  const { data: submitter } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (submitter) {
    await supabase.from("audit_log").insert({
      actor_id: submitter.id,
      action: "CONTRACT_SUBMIT_SIGN",
      resource_type: "CONTRACT",
      resource_id: contractId,
      detail: { contract_status: "PENDING_SIGN" },
    });
  }

  revalidatePath("/sales/contracts");
  return { success: true, data: null };
}

// ─── Sign Contract ───────────────────────────────────────────────────────

export async function signContract(
  contractId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const { data: contract } = await supabase
    .from("rental_contract")
    .select("id, contract_status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { success: false, error: "合同不存在" };
  if (contract.contract_status !== "PENDING_SIGN") {
    return { success: false, error: "合同当前状态不允许签章" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("rental_contract")
    .update({
      contract_status: "SIGNED",
      signed_at: now,
      updated_at: now,
    })
    .eq("id", contractId);
  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_SIGN",
    resource_type: "CONTRACT",
    resource_id: contractId,
    detail: { signed_at: now },
  });

  revalidatePath("/sales/contracts");
  return { success: true, data: null };
}

// ─── Freeze Contract ─────────────────────────────────────────────────────

export async function freezeContract(
  contractId: string,
  reason: string
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

  const { data: contract } = await supabase
    .from("rental_contract")
    .select("id, contract_status, contract_no")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { success: false, error: "合同不存在" };
  if (contract.contract_status !== "ACTIVE") {
    return { success: false, error: "只有履行中的合同可以冻结" };
  }

  if (!reason?.trim()) {
    return { success: false, error: "请填写冻结原因" };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("rental_contract")
    .update({
      contract_status: "FROZEN",
      updated_at: now,
      updated_by: profile.id,
    })
    .eq("id", contractId);

  if (updateError) return { success: false, error: updateError.message };

  await supabase.from("contract_change_record").insert({
    contract_id: contractId,
    change_type: "FROZEN",
    before_content: { contract_status: "ACTIVE" },
    after_content: { contract_status: "FROZEN", reason: reason.trim() },
    reason: reason.trim(),
    changed_by: profile.id,
  });

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_FREEZE",
    resource_type: "CONTRACT",
    resource_id: contractId,
    detail: { contract_no: contract.contract_no, reason: reason.trim() },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
  revalidatePath("/sales/contracts");
  return { success: true, data: null };
}

// ─── Unfreeze Contract ───────────────────────────────────────────────────

export async function unfreezeContract(
  contractId: string
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

  const { data: contract } = await supabase
    .from("rental_contract")
    .select("id, contract_status, contract_no")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { success: false, error: "合同不存在" };
  if (contract.contract_status !== "FROZEN") {
    return { success: false, error: "只有已冻结的合同可以解冻" };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("rental_contract")
    .update({
      contract_status: "ACTIVE",
      updated_at: now,
      updated_by: profile.id,
    })
    .eq("id", contractId);

  if (updateError) return { success: false, error: updateError.message };

  await supabase.from("contract_change_record").insert({
    contract_id: contractId,
    change_type: "UNFREEZE",
    before_content: { contract_status: "FROZEN" },
    after_content: { contract_status: "ACTIVE" },
    changed_by: profile.id,
  });

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_UNFREEZE",
    resource_type: "CONTRACT",
    resource_id: contractId,
    detail: { contract_no: contract.contract_no },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
  revalidatePath("/sales/contracts");
  return { success: true, data: null };
}

// ─── Terminate Contract ──────────────────────────────────────────────────

export async function terminateContract(
  contractId: string,
  reason: string
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

  const { data: contract } = await supabase
    .from("rental_contract")
    .select("id, contract_status, contract_no, order_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { success: false, error: "合同不存在" };
  if (!["ACTIVE", "FROZEN"].includes(contract.contract_status)) {
    return { success: false, error: "只有履行中或已冻结的合同可以终止" };
  }

  if (!reason?.trim()) {
    return { success: false, error: "请填写终止原因" };
  }

  const now = new Date().toISOString();

  // 1. Update contract status
  const { error: updateError } = await supabase
    .from("rental_contract")
    .update({
      contract_status: "TERMINATED",
      terminated_at: now,
      updated_at: now,
      updated_by: profile.id,
    })
    .eq("id", contractId);

  if (updateError) return { success: false, error: updateError.message };

  // 2. End all contract items
  await supabase
    .from("rental_contract_item")
    .update({ end_at: now })
    .eq("contract_id", contractId);

  // 3. Return equipment to stock and clear location fields
  const { data: items } = await supabase
    .from("rental_contract_item")
    .select("equipment_id")
    .eq("contract_id", contractId);

  if (items?.length) {
    const equipmentIds = items.map((i) => i.equipment_id);
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
        updated_by: profile.id,
        updated_at: now,
      })
      .in("id", equipmentIds);
  }

  // 4. Update associated order status
  if (contract.order_id) {
    await supabase
      .from("rental_order")
      .update({
        order_status: "COMPLETED",
        actual_end_at: now,
        updated_by: profile.id,
        updated_at: now,
      })
      .eq("id", contract.order_id)
      .in("order_status", ["IN_PROGRESS", "PARTIAL_RETURN", "OVERDUE"]);
  }

  // 5. Create change record
  await supabase.from("contract_change_record").insert({
    contract_id: contractId,
    change_type: "TERMINATE",
    before_content: { contract_status: contract.contract_status },
    after_content: {
      contract_status: "TERMINATED",
      reason: reason.trim(),
      terminated_at: now,
    },
    reason: reason.trim(),
    changed_by: profile.id,
  });

  // 6. Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CONTRACT_TERMINATE",
    resource_type: "CONTRACT",
    resource_id: contractId,
    detail: {
      contract_no: contract.contract_no,
      reason: reason.trim(),
      terminated_at: now,
    },
  });

  revalidatePath(`/sales/contracts/${contractId}`);
  revalidatePath("/sales/contracts");
  revalidatePath("/sales/orders");
  return { success: true, data: null };
}
