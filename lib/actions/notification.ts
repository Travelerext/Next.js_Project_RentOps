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
