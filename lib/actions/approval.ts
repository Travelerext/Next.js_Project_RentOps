"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

export async function submitForApproval(
  businessType: string,
  businessId: string,
  approvalType: string,
  title: string,
  description?: string
): Promise<ActionResult<{ id: string }>> {
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

  const approvalNo = generateNo("AP");

  const { data, error } = await supabase
    .from("approval_request")
    .insert({
      approval_no: approvalNo,
      approval_type: approvalType,
      business_type: businessType,
      business_id: businessId,
      applicant_id: profile.id,
      title,
      description: description ?? null,
      approval_config: {
        flow: [{ step: 1, approver_role: "MANAGER" }],
      },
      current_step: 1,
      status: "SUBMITTED",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  // Notify approvers (find users with manager/supervisor roles)
  const { data: approvers } = await supabase
    .from("profiles")
    .select("id")
    .in("primary_role", ["SALES_MANAGER", "GENERAL_MANAGER", "SYSTEM_ADMIN", "FINANCE_MANAGER"])
    .eq("account_status", "ACTIVE");

  if (approvers && approvers.length > 0) {
    const notifications = approvers.map((a) => ({
      recipient_id: a.id,
      notification_type: "APPROVAL_PENDING",
      title: `新的审批请求: ${title}`,
      content: description ?? title,
      business_type: businessType,
      business_id: businessId,
    }));
    await supabase.from("notification").insert(notifications);
  }

  revalidatePath("/approval/pending");
  return { success: true, data: { id: data.id } };
}

export async function approveRequest(
  approvalId: string,
  comment?: string
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

  const { data: approval } = await supabase
    .from("approval_request")
    .select("*")
    .eq("id", approvalId)
    .single();

  if (!approval) return { success: false, error: "审批记录不存在" };
  if (approval.status !== "SUBMITTED" && approval.status !== "IN_PROGRESS") {
    return { success: false, error: "审批状态不允许此操作" };
  }

  const currentStep = approval.current_step;
  const flow = (approval.approval_config as { flow?: { step: number; approver_role: string }[] })?.flow ?? [];
  const totalSteps = flow.length || 1;

  // Record the approve action for the current step
  await supabase.from("approval_step_record").insert({
    approval_id: approvalId,
    step: currentStep,
    approver_id: profile.id,
    action: "APPROVE",
    comment: comment ?? null,
    acted_at: new Date().toISOString(),
  });

  // Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "APPROVAL_APPROVE",
    resource_type: "APPROVAL",
    resource_id: approvalId,
    detail: { step: currentStep, comment: comment ?? null },
  });

  // Count distinct completed steps (steps that have at least one APPROVE action)
  const { data: approvedSteps } = await supabase
    .from("approval_step_record")
    .select("step")
    .eq("approval_id", approvalId)
    .eq("action", "APPROVE");

  const completedStepNumbers = new Set(approvedSteps?.map((r) => r.step) ?? []);
  completedStepNumbers.add(currentStep);
  const completedCount = completedStepNumbers.size;

  if (completedCount >= totalSteps) {
    await supabase
      .from("approval_request")
      .update({
        status: "APPROVED",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", approvalId);

    // Update the business object based on type
    if (approval.business_type === "ORDER") {
      await supabase
        .from("rental_order")
        .update({
          order_status: "APPROVED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", approval.business_id);
      revalidatePath("/sales/orders");
    }

    // Mark the APPROVAL_PENDING notification as read/done
    await supabase
      .from("notification")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("notification_type", "APPROVAL_PENDING")
      .eq("business_type", approval.business_type)
      .eq("business_id", approval.business_id);

    // Notify applicant
    await supabase.from("notification").insert({
      recipient_id: approval.applicant_id,
      notification_type: "APPROVAL_RESULT",
      title: `审批已通过: ${approval.title}`,
      content: "您的审批申请已通过",
      business_type: approval.business_type,
      business_id: approval.business_id,
    });
  } else {
    // Find the next unapproved step
    const nextStep = currentStep + 1;
    await supabase
      .from("approval_request")
      .update({
        current_step: nextStep,
        status: "IN_PROGRESS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", approvalId);
  }

  revalidatePath("/approval/pending");
  revalidatePath("/approval/history");
  revalidatePath("/notifications");
  return { success: true, data: null };
}

export async function rejectRequest(
  approvalId: string,
  reason?: string
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

  const { data: approval } = await supabase
    .from("approval_request")
    .select("applicant_id, title, business_type, business_id, current_step, status")
    .eq("id", approvalId)
    .single();

  if (!approval) return { success: false, error: "审批记录不存在" };
  if (approval.status !== "SUBMITTED" && approval.status !== "IN_PROGRESS") {
    return { success: false, error: "审批状态不允许此操作" };
  }

  await supabase.from("approval_step_record").insert({
    approval_id: approvalId,
    step: approval.current_step,
    approver_id: profile.id,
    action: "REJECT",
    comment: reason ?? null,
    acted_at: new Date().toISOString(),
  });

  // Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "APPROVAL_REJECT",
    resource_type: "APPROVAL",
    resource_id: approvalId,
    detail: { step: approval.current_step, reason: reason ?? null },
  });

  await supabase
    .from("approval_request")
    .update({
      status: "REJECTED",
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  // Handle business object based on type
  if (approval.business_type === "ORDER") {
    // Unlock equipment
    const { data: items } = await supabase
      .from("rental_order_item")
      .select("equipment_id")
      .eq("order_id", approval.business_id);
    if (items?.length) {
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
          updated_by: profile.id,
          updated_at: now,
        })
        .in("id", items.map((i) => i.equipment_id));
    }
    // Return order to draft
    await supabase
      .from("rental_order")
      .update({
        order_status: "DRAFT",
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approval.business_id);
    revalidatePath("/sales/orders");
  }

  // Mark the APPROVAL_PENDING notification as read/done
  await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("notification_type", "APPROVAL_PENDING")
    .eq("business_type", approval.business_type)
    .eq("business_id", approval.business_id);

  await supabase.from("notification").insert({
    recipient_id: approval.applicant_id,
    notification_type: "APPROVAL_RESULT",
    title: `审批已拒绝: ${approval.title}`,
    content: reason ?? "您的审批申请已被拒绝",
    business_type: approval.business_type,
    business_id: approval.business_id,
  });

  revalidatePath("/approval/pending");
  revalidatePath("/approval/history");
  revalidatePath("/notifications");
  return { success: true, data: null };
}
