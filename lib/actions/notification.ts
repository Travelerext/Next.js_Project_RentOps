"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

export async function markNotificationRead(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/notifications");
  return { success: true, data: null };
}

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles").select("id")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .eq("is_read", false);

  if (error) return { success: false, error: error.message };

  revalidatePath("/notifications");
  return { success: true, data: null };
}
