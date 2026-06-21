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
  inspectionResult: string,
  notes?: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const inboundNo = generateNo("IB");

  const { error } = await supabase
    .from("inbound_record")
    .insert({
      inbound_no: inboundNo,
      business_type: "RETURN_INBOUND",
      equipment_id: equipmentId,
      warehouse_id: warehouseId,
      inspection_result: inspectionResult,
      inspection_notes: notes ?? null,
      operator_id: profile.id,
      created_by: profile.id,
    });

  if (error) return { success: false, error: error.message };

  // Update equipment status back to in-stock
  await supabase
    .from("equipment")
    .update({
      status: "IN_STOCK",
      current_location_type: "WAREHOUSE",
      warehouse_id: warehouseId,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", equipmentId);

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "INBOUND",
    resource_type: "EQUIPMENT",
    resource_id: equipmentId,
    detail: { inbound_no: inboundNo, inspection_result: inspectionResult },
  });

  revalidatePath("/equipment/catalog");
  revalidatePath("/equipment/scan/inbound");
  return { success: true, data: null };
}
