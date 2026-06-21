"use server";

import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_ROUTES, ROLE_DASHBOARD_MAP } from "@/lib/constants";

// ─── Login Server Action ────────────────────────────────────────────
export async function login(
  _prevState: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || undefined;

  if (!email || !password) {
    return { error: "请输入邮箱和密码" };
  }

  const supabase = await createClient();

  // Step 1: Supabase Auth
  const { error: authError, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !data.user) {
    return { error: authError?.message ?? "登录失败" };
  }

  // Step 2: Verify profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dashboard, account_status, primary_role, login_enabled")
    .eq("supabase_user_id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "此账号未获得系统授权，请联系管理员分配角色。" };
  }
  if (profile.account_status !== "ACTIVE") {
    await supabase.auth.signOut();
    return { error: "此账号已被禁用，请联系管理员。" };
  }
  if (!profile.login_enabled) {
    await supabase.auth.signOut();
    return { error: "此账号登录功能已被关闭，请联系管理员。" };
  }
  if (!profile.primary_role) {
    await supabase.auth.signOut();
    return { error: "此账号尚未分配角色，请联系管理员。" };
  }

  // Use default_dashboard first, fall back to primary_role mapping
  const dashboard =
    DASHBOARD_ROUTES[profile.default_dashboard] ??
    ROLE_DASHBOARD_MAP[profile.primary_role] ??
    "/sales";

  // Update last login
  await supabase
    .from("profiles")
    .update({
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("supabase_user_id", data.user.id);

  return {
    success: true,
    dashboard,
    redirectTo,
  };
}

export interface LoginState {
  success?: boolean;
  error?: string;
  dashboard?: string;
  redirectTo?: string;
}

// ─── Sign-Up Server Action ──────────────────────────────────────────
export async function signup(
  _prevState: SignupState | null,
  formData: FormData
): Promise<SignupState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = formData.get("displayName") as string;

  if (!displayName?.trim()) {
    return { error: "请输入姓名" };
  }
  if (!email || !password) {
    return { error: "请输入邮箱和密码" };
  }
  if (password.length < 6) {
    return { error: "密码至少需要6个字符" };
  }

  const supabase = await createClient();
  const { error: authError, data: authData } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Create a profile row so admins can see and activate this user
  if (authData.user) {
    const { error: profileError } = await supabase.from("profiles").insert({
      supabase_user_id: authData.user.id,
      username: email,
      display_name: displayName,
      account_type: "INTERNAL_STAFF",
      account_status: "PENDING",
      login_enabled: false,
      // default_dashboard is set by DB default + trg_sync_default_dashboard trigger
    });

    if (profileError) {
      console.error("Failed to create profile on signup:", profileError.message);
    }
  }

  return {
    success: true,
    message: "注册成功！确认邮箱后，联系管理员为你的账号分配角色即可登录。",
  };
}

export interface SignupState {
  success?: boolean;
  error?: string;
  message?: string;
}

// ─── Legacy helper (still used by auth layout) ──────────────────────
export async function getProfileForLogin(userId: string): Promise<{
  ok: boolean;
  error?: string;
  dashboard?: string;
  role?: string;
}> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dashboard, account_status, primary_role, login_enabled")
    .eq("supabase_user_id", userId)
    .maybeSingle();

  if (!profile) return { ok: false, error: "此账号未获得系统授权，请联系管理员分配角色。" };
  if (profile.account_status !== "ACTIVE") return { ok: false, error: "此账号已被禁用，请联系管理员。" };
  if (!profile.login_enabled) return { ok: false, error: "此账号登录功能已被关闭，请联系管理员。" };
  if (!profile.primary_role) return { ok: false, error: "此账号尚未分配角色，请联系管理员。" };

  return {
    ok: true,
    dashboard: profile.default_dashboard ?? "SALES_DASHBOARD",
    role: profile.primary_role ?? "SALES",
  };
}
