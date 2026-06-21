"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ProfileState {
  success?: boolean;
  error?: string;
  message?: string;
}

export async function updateProfile(
  _prevState: ProfileState | null,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "未登录，请先登录" };
  }

  const displayName = (formData.get("display_name") as string)?.trim();
  const realName = (formData.get("real_name") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;

  if (!displayName) {
    return { error: "显示名称不能为空" };
  }

  // Update profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      real_name: realName,
      phone,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("supabase_user_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/profile");

  return { success: true, message: "个人资料已更新" };
}
