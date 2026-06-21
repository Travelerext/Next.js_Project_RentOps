"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

// ─── Role → Dashboard sync map ─────────────────────────────────────────
const ROLE_TO_DASHBOARD: Record<string, string> = {
  SYSTEM_ADMIN: "ADMIN_DASHBOARD",
  SALES: "SALES_DASHBOARD",
  EQUIPMENT_MANAGER: "EQUIPMENT_DASHBOARD",
  FINANCE: "FINANCE_DASHBOARD",
  MAINTENANCE: "MAINTENANCE_DASHBOARD",
  APPROVER: "APPROVAL_DASHBOARD",
  CUSTOMER: "CUSTOMER_DASHBOARD",
  SALES_MANAGER: "SALES_MANAGER_DASHBOARD",
  FINANCE_MANAGER: "FINANCE_MANAGER_DASHBOARD",
  EQUIPMENT_SUPERVISOR: "EQUIPMENT_SUPERVISOR_DASHBOARD",
  GENERAL_MANAGER: "GENERAL_MANAGER_DASHBOARD",
  MAINTENANCE_SUPERVISOR: "MAINTENANCE_SUPERVISOR_DASHBOARD",
};

// ─── Schema ──────────────────────────────────────────────────────────

const updateAccountSchema = z.object({
  profileId: z.string().uuid("无效的用户ID"),
  displayName: z.string().min(1, "显示名称不能为空").max(200, "显示名称过长"),
  phone: z.string().max(50, "手机号过长").optional().or(z.literal("")),
  employeeNo: z.string().max(50, "工号过长").optional().or(z.literal("")),
  primaryRole: z.string().optional().or(z.literal("")),
  accountType: z.string().optional().or(z.literal("")),
  remark: z.string().max(2000, "备注过长").optional().or(z.literal("")),
});

// ─── Types ───────────────────────────────────────────────────────────

export type AccountStatusAction = "activate" | "deactivate" | "disable";

// ─── Admin guard ────────────────────────────────────────────────────

async function requireAdmin(): Promise<
  | { success: true; userId: string; adminProfileId: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (error || !profile || profile.primary_role !== "SYSTEM_ADMIN") {
    return { success: false, error: "无权限，仅系统管理员可执行此操作" };
  }

  return { success: true, userId: user.id, adminProfileId: profile.id };
}

// ─── Audit helper (best-effort) ─────────────────────────────────────

async function writeAuditLog(params: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      actor_id: params.actorId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      detail: params.detail,
    });
  } catch {
    // Audit log is best-effort — never fail the main operation
    console.error("Failed to write audit log:", params.action, params.resourceId);
  }
}

// ─── Update account ─────────────────────────────────────────────────

export async function updateAccount(
  _prevState: ActionResult<null> | null,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const raw = {
    profileId: formData.get("profileId"),
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
    employeeNo: formData.get("employeeNo"),
    primaryRole: formData.get("primaryRole"),
    accountType: formData.get("accountType"),
    remark: formData.get("remark"),
  };

  const parsed = updateAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: "表单校验失败，请检查字段",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // Prevent self-role-change
  if (parsed.data.profileId === auth.adminProfileId) {
    const { data: self } = await supabase
      .from("profiles")
      .select("primary_role")
      .eq("id", auth.adminProfileId)
      .maybeSingle();
    if (self?.primary_role !== parsed.data.primaryRole && parsed.data.primaryRole) {
      return { success: false, error: "不能修改自己的角色" };
    }
  }

  // Sync default_dashboard with primary_role
  const newDashboard = parsed.data.primaryRole
    ? (ROLE_TO_DASHBOARD[parsed.data.primaryRole] ?? undefined)
    : undefined;

  const updateData: Record<string, unknown> = {
    display_name: parsed.data.displayName,
    phone: parsed.data.phone || null,
    employee_no: parsed.data.employeeNo || null,
    primary_role: parsed.data.primaryRole || null,
    account_type: parsed.data.accountType || null,
    remark: parsed.data.remark || null,
    updated_at: new Date().toISOString(),
  };
  if (newDashboard) updateData.default_dashboard = newDashboard;

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", parsed.data.profileId);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    actorId: auth.userId,
    action: "ADMIN_UPDATE_PROFILE",
    resourceType: "PROFILE",
    resourceId: parsed.data.profileId,
    detail: {
      display_name: parsed.data.displayName,
      primary_role: parsed.data.primaryRole || null,
      account_type: parsed.data.accountType || null,
    },
  });

  revalidatePath("/admin/users");
  return { success: true, data: null };
}

// ─── Toggle account status ──────────────────────────────────────────

export async function toggleAccountStatus(
  profileId: string,
  action: AccountStatusAction
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (profileId === auth.adminProfileId) {
    return { success: false, error: "不能对自己的账号执行此操作" };
  }

  const statusMap: Record<
    AccountStatusAction,
    { account_status: string; login_enabled: boolean }
  > = {
    activate: { account_status: "ACTIVE", login_enabled: true },
    deactivate: { account_status: "ACTIVE", login_enabled: false },
    disable: { account_status: "DISABLED", login_enabled: false },
  };

  const updates = statusMap[action];

  const { error } = await supabase
    .from("profiles")
    .update({
      account_status: updates.account_status,
      login_enabled: updates.login_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    actorId: auth.userId,
    action: `ADMIN_${action.toUpperCase()}`,
    resourceType: "PROFILE",
    resourceId: profileId,
    detail: updates as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/users");
  return { success: true, data: null };
}

// ─── Hard-delete account (profile + auth.user) ───────────────────

export async function deleteAccount(
  profileId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (profileId === auth.adminProfileId) {
    return { success: false, error: "不能删除自己的账号" };
  }

  // 1. Read profile before deleting
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("supabase_user_id, display_name")
    .eq("id", profileId)
    .maybeSingle();

  if (readError || !profile) {
    return { success: false, error: "账号不存在" };
  }

  // 2. Delete the profile row first
  //    (auth.users may not cascade to profiles automatically)
  await supabase.from("profiles").delete().eq("id", profileId);

  // 3. Delete from auth.users
  const adminClient = createAdminClient();
  const { error: authError } = await adminClient.auth.admin.deleteUser(
    profile.supabase_user_id
  );

  if (authError) {
    return { success: false, error: `删除认证账号失败: ${authError.message}` };
  }

  await writeAuditLog({
    actorId: auth.userId,
    action: "ADMIN_DELETE_ACCOUNT",
    resourceType: "PROFILE",
    resourceId: profileId,
    detail: { deleted_user_id: profile.supabase_user_id, display_name: profile.display_name },
  });

  revalidatePath("/admin/users");
  return { success: true, data: null };
}
