import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DASHBOARD_ROUTES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Read profile and redirect
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_dashboard")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const route =
    DASHBOARD_ROUTES[profile?.default_dashboard ?? ""] ?? "/sales";
  redirect(route);
}
