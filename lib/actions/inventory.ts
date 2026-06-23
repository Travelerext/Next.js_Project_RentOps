"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

export async function scanOutbound(
  equipmentId: string,
  warehouseId: string,
  orderId?: string,
  contractId?: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const outboundNo = generateNo("OB");

  const { error } = await supabase.rpc("process_outbound", {
    p_equipment_id: equipmentId,
    p_warehouse_id: warehouseId,
    p_order_id: orderId ?? null,
    p_contract_id: contractId ?? null,
    p_outbound_no: outboundNo,
    p_user_id: user.id,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/equipment/catalog");
  revalidatePath("/equipment/scan/outbound");
  return { success: true, data: null };
}

export async function scanInbound(
  equipmentId: string,
  warehouseId: string,
  orderId: string | undefined,
  contractId: string | undefined,
  customerId: string | undefined,
  inspectionResult: string,
  notes?: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const inboundNo = generateNo("IB");

  const { error } = await supabase.rpc("process_inbound", {
    p_equipment_id: equipmentId,
    p_warehouse_id: warehouseId,
    p_order_id: orderId ?? null,
    p_contract_id: contractId ?? null,
    p_inbound_no: inboundNo,
    p_inspection_result: inspectionResult,
    p_inspection_notes: notes ?? null,
    p_user_id: user.id,
  });

  if (error) return { success: false, error: error.message };

  // Create return_inspection and advance return_request using saved IDs
  // ... existing code continues below

  // Create return_inspection for settlement flow
  const { data: profile } = await supabase.from("profiles")
    .select("id").eq("supabase_user_id", user.id).maybeSingle();
  if (profile && customerId) {
    const inspectionNo = generateNo("RI");
    await supabase.from("return_inspection").insert({
      inspection_no: inspectionNo,
      order_id: orderId ?? null,
      contract_id: contractId ?? null,
      equipment_id: equipmentId,
      customer_id: customerId,
      inspector_id: profile.id,
      inspected_at: new Date().toISOString(),
      is_overdue: false, overdue_days: 0,
      is_damaged: inspectionResult === "DAMAGED" || inspectionResult === "NEEDS_REPAIR",
      damage_description: inspectionResult === "DAMAGED" || inspectionResult === "NEEDS_REPAIR" ? (notes ?? "验收发现异常") : null,
      is_missing_parts: inspectionResult === "MISSING_PARTS",
      missing_parts_desc: inspectionResult === "MISSING_PARTS" ? (notes ?? null) : null,
      is_dirty: inspectionResult === "DIRTY",
      cleanliness_note: inspectionResult === "DIRTY" ? (notes ?? null) : null,
      needs_repair: inspectionResult === "NEEDS_REPAIR",
      repair_estimate: "0",
      customer_confirmed: true,
      created_by: profile.id,
    });
  }

  revalidatePath("/equipment/catalog");
  revalidatePath("/equipment/scan/inbound");
  return { success: true, data: null };
}
