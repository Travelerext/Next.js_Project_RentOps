"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";

// --- Types ------------------------------------------------------------------

export type NotificationLevel = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "URGENT";

export interface CreateNotificationInput {
  recipientId: string;
  type: string;
  title: string;
  content: string;
  level?: NotificationLevel;
  businessType: string;
  businessId: string;
  actionUrl?: string;
  dedupeKey?: string;
  sourceEvent?: string;
  sourceModule?: string;
}

// --- createNotification / createNotifications -------------------------------

export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notification").insert({
    recipient_id: input.recipientId,
    notification_type: input.type,
    title: input.title,
    content: input.content,
    business_type: input.businessType,
    business_id: input.businessId,
  });
}

export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<void> {
  if (!inputs.length) return;
  const supabase = await createClient();
  await supabase.from("notification").insert(
    inputs.map((i) => ({
      recipient_id: i.recipientId,
      notification_type: i.type,
      title: i.title,
      content: i.content,
      business_type: i.businessType,
      business_id: i.businessId,
    }))
  );
}

// --- Read state -------------------------------------------------------------

export async function markNotificationRead(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("is_read", false);

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

export async function markBusinessNotificationsRead(
  businessType: string,
  businessId: string
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles").select("id")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return;

  await supabase
    .from("notification")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .eq("business_type", businessType)
    .eq("business_id", businessId)
    .eq("is_read", false);
}
