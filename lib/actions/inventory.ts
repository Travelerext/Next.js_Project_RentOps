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

  revalidatePath("/equipment/catalog");
  revalidatePath("/equipment/scan/inbound");
  return { success: true, data: null };
}
