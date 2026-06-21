import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile || profile.primary_role !== "SYSTEM_ADMIN") {
    redirect("/sales");
  }

  return <>{children}</>;
}
