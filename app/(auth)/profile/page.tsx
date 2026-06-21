import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DataPage } from "@/components/data/data-page";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, real_name, phone, email, employee_no, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/login?error=no_profile");
  }

  return (
    <DataPage title="个人资料" subtitle="查看和编辑您的个人信息" empty={false}>
      <ProfileForm profile={profile as ProfileData} />
    </DataPage>
  );
}

export interface ProfileData {
  username: string;
  display_name: string;
  real_name: string | null;
  phone: string | null;
  email: string | null;
  employee_no: string | null;
  primary_role: string | null;
}
