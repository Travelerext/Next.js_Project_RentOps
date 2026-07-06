import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";

export const dynamic = "force-dynamic";

// Map primary_role to dashboard name for the sidebar
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

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // Verify profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, default_dashboard, primary_role, account_status, login_enabled")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  // No profile / disabled / no role → sign out and reject
  if (!profile || profile.account_status !== "ACTIVE" || !profile.login_enabled || !profile.primary_role) {
    await supabase.auth.signOut();
    redirect("/login?error=no_profile");
  }

  // Determine dashboard: use explicit default_dashboard first, derive from primary_role otherwise
  const dashboard =
    profile.default_dashboard ??
    ROLE_TO_DASHBOARD[profile.primary_role] ??
    "SALES_DASHBOARD";

  return (
    <AuthShell
      displayName={profile.display_name ?? "用户"}
      dashboard={dashboard}
      primaryRole={profile.primary_role}
    >
      {children}
    </AuthShell>
  );
}
