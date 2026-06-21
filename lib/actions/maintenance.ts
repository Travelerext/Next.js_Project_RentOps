"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

// ─── Helpers ──────────────────────────────────────────────────────────

async function resolveProfileId(): Promise<
  { ok: true; profileId: string; userId: string; primaryRole: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile) return { ok: false, error: "用户档案不存在" };
  return { ok: true, profileId: profile.id, userId: user.id, primaryRole: profile.primary_role };
}

// ─── Schema ───────────────────────────────────────────────────────────

const createWorkOrderSchema = z.object({
  equipmentNo: z.string().min(1, "请输入设备编号"),
  faultDescription: z.string().min(1, "故障描述不能为空"),
  faultLevel: z.string().default("NORMAL"),
  stopped: z.string().default("false"),
  affectsConstruction: z.string().default("false"),
  remark: z.string().optional(),
});

const completeWorkOrderSchema = z.object({
  faultCause: z.string().optional(),
  repairResult: z.string().optional(),
  laborHours: z.coerce.number().min(0).default(0),
  maintenanceFee: z.coerce.number().min(0).default(0),
  outsourced: z.string().default("false"),
  manufacturerWarranty: z.string().default("false"),
});

const createPlanSchema = z.object({
  equipmentNo: z.string().min(1, "请输入设备编号"),
  planName: z.string().min(1, "计划名称不能为空"),
  cycleType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "HOURS", "KILOMETERS", "CUSTOM"]),
  cycleValue: z.coerce.number().int().positive(),
  remark: z.string().optional().default(""),
});

// ─── Create Work Order ────────────────────────────────────────────────

export async function createWorkOrder(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };
  const { profileId } = auth;

  const raw = {
    equipmentNo: String(formData.get("equipmentNo") || "").trim(),
    faultDescription: String(formData.get("faultDescription") || "").trim(),
    faultLevel: String(formData.get("faultLevel") || "NORMAL"),
    stopped: String(formData.get("stopped") || "false"),
    affectsConstruction: String(formData.get("affectsConstruction") || "false"),
    remark: String(formData.get("remark") || "").trim() || undefined,
  };

  if (!raw.equipmentNo)
    return { success: false, error: "请输入设备编号", fieldErrors: { equipmentNo: ["请输入设备编号"] } };
  if (!raw.faultDescription)
    return { success: false, error: "请填写故障描述", fieldErrors: { faultDescription: ["故障描述不能为空"] } };

  const parsed = createWorkOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    return { success: false, error: first?.[1]?.[0] ?? "参数错误", fieldErrors: fe };
  }

  // Look up equipment
  const { data: equip } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, status")
    .eq("equipment_no", parsed.data.equipmentNo)
    .maybeSingle();
  if (!equip)
    return { success: false, error: `设备编号 "${parsed.data.equipmentNo}" 不存在`, fieldErrors: { equipmentNo: ["设备编号不存在"] } };

  const workOrderNo = generateNo("WO");
  const { data, error } = await supabase
    .from("maintenance_work_order")
    .insert({
      work_order_no: workOrderNo,
      equipment_id: equip.id,
      reported_by: profileId,
      fault_description: parsed.data.faultDescription,
      fault_level: parsed.data.faultLevel,
      stopped: parsed.data.stopped === "true",
      affects_construction: parsed.data.affectsConstruction === "true",
      remark: parsed.data.remark || null,
      status: "PENDING_DISPATCH",
      created_by: profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  // Mark equipment as in maintenance
  await supabase
    .from("equipment")
    .update({ status: "IN_MAINTENANCE", updated_by: profileId, updated_at: new Date().toISOString() })
    .eq("id", equip.id);

  await supabase.from("audit_log").insert({
    actor_id: profileId, action: "MAINTENANCE_CREATE",
    resource_type: "MAINTENANCE", resource_id: data.id,
    detail: { work_order_no: workOrderNo, equipment_no: equip.equipment_no },
  });

  revalidatePath("/maintenance/work-orders");
  return { success: true, data: { id: data.id } };
}

// ─── Assign Work Order ────────────────────────────────────────────────

export async function assignWorkOrder(
  workOrderId: string,
  assigneeId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  // Only MAINTENANCE_SUPERVISOR can dispatch
  if (auth.primaryRole !== "MAINTENANCE_SUPERVISOR")
    return { success: false, error: "仅维修主管可执行派单操作" };

  // Validate state
  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status").eq("id", workOrderId).single();
  if (!wo || wo.status !== "PENDING_DISPATCH")
    return { success: false, error: "当前状态不允许派单" };

  const { error } = await supabase
    .from("maintenance_work_order")
    .update({
      assigned_to: assigneeId,
      assigned_at: new Date().toISOString(),
      status: "ASSIGNED",
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (error) return { success: false, error: error.message };

  // Notify assignee
  await supabase.from("notification").insert({
    recipient_id: assigneeId,
    notification_type: "MAINTENANCE_ASSIGNED",
    title: "新的维修任务",
    content: `工单 ${workOrderId} 已分配给你`,
    business_type: "MAINTENANCE", business_id: workOrderId,
  });

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  return { success: true, data: null };
}

// ─── Start Repair ─────────────────────────────────────────────────────

export async function startRepair(workOrderId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status").eq("id", workOrderId).single();
  if (!wo || wo.status !== "ASSIGNED")
    return { success: false, error: "当前状态不允许开始维修" };

  const { error } = await supabase
    .from("maintenance_work_order")
    .update({
      repair_started_at: new Date().toISOString(),
      status: "IN_PROGRESS",
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  return { success: true, data: null };
}

// ─── Complete Repair ──────────────────────────────────────────────────

export async function completeWorkOrder(
  workOrderId: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status").eq("id", workOrderId).single();
  if (!wo || wo.status !== "IN_PROGRESS")
    return { success: false, error: "当前状态不允许完成维修" };

  const raw = {
    faultCause: String(formData.get("faultCause") || ""),
    repairResult: String(formData.get("repairResult") || ""),
    laborHours: formData.get("laborHours"),
    maintenanceFee: formData.get("maintenanceFee"),
    outsourced: String(formData.get("outsourced") || "false"),
    manufacturerWarranty: String(formData.get("manufacturerWarranty") || "false"),
  };

  const parsed = completeWorkOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    return { success: false, error: first?.[1]?.[0] ?? "参数错误", fieldErrors: fe };
  }

  const { error } = await supabase
    .from("maintenance_work_order")
    .update({
      fault_cause: parsed.data.faultCause || null,
      repair_result: parsed.data.repairResult || null,
      labor_hours: parsed.data.laborHours,
      maintenance_fee: parsed.data.maintenanceFee,
      outsourced: parsed.data.outsourced === "true",
      manufacturer_warranty: parsed.data.manufacturerWarranty === "true",
      repair_finished_at: new Date().toISOString(),
      status: "COMPLETED",
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: auth.profileId, action: "MAINTENANCE_COMPLETE",
    resource_type: "MAINTENANCE", resource_id: workOrderId,
    detail: { labor_hours: parsed.data.laborHours, fee: parsed.data.maintenanceFee },
  });

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  return { success: true, data: null };
}

// ─── Verify Work Order ────────────────────────────────────────────────

export async function verifyWorkOrder(workOrderId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  // Only MAINTENANCE_SUPERVISOR can verify
  if (auth.primaryRole !== "MAINTENANCE_SUPERVISOR")
    return { success: false, error: "仅维修主管可执行验收操作" };

  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status, equipment_id").eq("id", workOrderId).single();
  if (!wo || wo.status !== "COMPLETED")
    return { success: false, error: "当前状态不允许验收" };

  const { error } = await supabase
    .from("maintenance_work_order")
    .update({
      status: "VERIFIED",
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (error) return { success: false, error: error.message };

  // Return equipment to in-stock
  await supabase
    .from("equipment")
    .update({ status: "IN_STOCK", updated_by: auth.profileId, updated_at: new Date().toISOString() })
    .eq("id", wo.equipment_id);

  await supabase.from("equipment_status_log").insert({
    equipment_id: wo.equipment_id,
    from_status: "IN_MAINTENANCE", to_status: "IN_STOCK",
    change_reason: "维修验收通过",
    business_type: "MAINTENANCE_OUT", business_id: workOrderId,
    changed_by: auth.profileId,
  });

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  return { success: true, data: null };
}

// ─── Close Work Order ─────────────────────────────────────────────────

export async function closeWorkOrder(workOrderId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status").eq("id", workOrderId).single();
  if (!wo || wo.status !== "VERIFIED")
    return { success: false, error: "当前状态不允许关闭" };

  const { error } = await supabase
    .from("maintenance_work_order")
    .update({
      status: "CLOSED",
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId);
  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: auth.profileId, action: "MAINTENANCE_CLOSE",
    resource_type: "MAINTENANCE", resource_id: workOrderId,
    detail: {},
  });

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  return { success: true, data: null };
}

// ─── Use Spare Part ───────────────────────────────────────────────────

export async function useSparePart(
  workOrderId: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = {
    partId: (formData.get("partId") as string) || "",
    quantity: Number(formData.get("quantity")),
  };

  // Validate
  if (!raw.partId || raw.partId.length < 10) {
    return { success: false, error: "请选择有效的配件" };
  }
  if (!raw.quantity || raw.quantity <= 0 || isNaN(raw.quantity)) {
    return { success: false, error: "请输入有效的领用数量（大于 0）" };
  }

  // Validate work order status (must be IN_PROGRESS per P1-09)
  const { data: wo } = await supabase
    .from("maintenance_work_order").select("status").eq("id", workOrderId).single();
  if (!wo || wo.status !== "IN_PROGRESS")
    return { success: false, error: "当前工单状态不允许领用配件（仅维修中可领用）" };

  // Call PG function for atomic parts usage
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "process_maintenance_parts_usage",
    {
      p_part_id: raw.partId,
      p_work_order_id: workOrderId,
      p_quantity: raw.quantity,
      p_user_id: auth.userId,
    }
  );

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return { success: false, error: `调用失败: ${rpcError.message}` };
  }

  // PG function handles everything atomically (stock, movement, work order update, notification, audit)
  const result = rpcResult as unknown as { success: boolean; error?: string };
  if (!result || result.success === false) {
    return { success: false, error: result?.error || "领用失败，请检查库存是否充足" };
  }

  revalidatePath(`/maintenance/work-orders/${workOrderId}`);
  revalidatePath("/maintenance/spare-parts");
  revalidatePath("/maintenance/spare-parts/movements");
  return { success: true, data: null };
}

// ─── Create Maintenance Plan ──────────────────────────────────────────

export async function createMaintenancePlan(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = {
    equipmentNo: String(formData.get("equipmentNo") || "").trim(),
    planName: String(formData.get("planName") || "").trim(),
    cycleType: String(formData.get("cycleType") || "MONTHLY"),
    cycleValue: formData.get("cycleValue"),
    remark: String(formData.get("remark") || "").trim() || undefined,
  };

  if (!raw.equipmentNo)
    return { success: false, error: "请输入设备编号", fieldErrors: { equipmentNo: ["请输入设备编号"] } };
  if (!raw.planName)
    return { success: false, error: "请输入计划名称", fieldErrors: { planName: ["计划名称不能为空"] } };

  const parsed = createPlanSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { success: false, error: Object.entries(fe)[0]?.[1]?.[0] ?? "参数错误", fieldErrors: fe };
  }

  // Look up equipment
  const { data: equip } = await supabase
    .from("equipment")
    .select("id")
    .eq("equipment_no", parsed.data.equipmentNo)
    .maybeSingle();
  if (!equip)
    return { success: false, error: `设备编号 "${parsed.data.equipmentNo}" 不存在` };

  // Calculate next maintenance date
  const nextDate = new Date();
  switch (parsed.data.cycleType) {
    case "DAILY": nextDate.setDate(nextDate.getDate() + parsed.data.cycleValue); break;
    case "WEEKLY": nextDate.setDate(nextDate.getDate() + parsed.data.cycleValue * 7); break;
    case "MONTHLY": nextDate.setMonth(nextDate.getMonth() + parsed.data.cycleValue); break;
    case "HOURS": nextDate.setDate(nextDate.getDate() + Math.ceil(parsed.data.cycleValue / 8)); break;
    default: nextDate.setMonth(nextDate.getMonth() + 1);
  }

  const { data, error } = await supabase
    .from("maintenance_plan")
    .insert({
      equipment_id: equip.id,
      plan_name: parsed.data.planName,
      cycle_type: parsed.data.cycleType,
      cycle_value: parsed.data.cycleValue,
      next_maintenance_at: nextDate.toISOString(),
      responsible_user_id: auth.profileId,
      status: "ACTIVE",
      created_by: auth.profileId,
      ...(parsed.data.remark ? { remark: parsed.data.remark } : {}),
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/maintenance/plans");
  return { success: true, data: { id: data.id } };
}

// ─── Create Spare Part Schema ────────────────────────────────────────────

const createSparePartSchema = z.object({
  partNo: z.string().min(1, "请输入配件编号"),
  partName: z.string().min(1, "配件名称不能为空"),
  specification: z.string().optional().default(""),
  unit: z.string().optional().default("PIECE"),
  unitPrice: z.coerce.number().min(0).optional(),
  safetyStock: z.coerce.number().min(0).default(0),
  initialStock: z.coerce.number().min(0).default(0),
  applicableModelId: z.string().optional().default(""),
  warehouseId: z.string().optional().default(""),
});

// ─── Create Spare Part ───────────────────────────────────────────────────

export async function createSparePart(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = {
    partNo: String(formData.get("partNo") || "").trim(),
    partName: String(formData.get("partName") || "").trim(),
    specification: String(formData.get("specification") || "").trim() || undefined,
    unit: String(formData.get("unit") || "PIECE").trim() || "PIECE",
    unitPrice: formData.get("unitPrice"),
    safetyStock: formData.get("safetyStock") || "0",
    initialStock: formData.get("initialStock") || "0",
    applicableModelId: String(formData.get("applicableModelId") || "").trim() || undefined,
    warehouseId: String(formData.get("warehouseId") || "").trim() || undefined,
  };

  const parsed = createSparePartSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return { success: false, error: Object.entries(fe)[0]?.[1]?.[0] ?? "参数错误", fieldErrors: fe };
  }

  // Check duplicate part_no
  const { data: existing } = await supabase
    .from("spare_part")
    .select("id")
    .eq("part_no", parsed.data.partNo)
    .maybeSingle();
  if (existing) {
    return { success: false, error: `配件编号 "${parsed.data.partNo}" 已存在`, fieldErrors: { partNo: ["配件编号已存在"] } };
  }

  const { data, error } = await supabase
    .from("spare_part")
    .insert({
      part_no: parsed.data.partNo,
      part_name: parsed.data.partName,
      specification: parsed.data.specification || null,
      current_stock: parsed.data.initialStock,
      safety_stock: parsed.data.safetyStock,
      unit: parsed.data.unit,
      unit_price: parsed.data.unitPrice ?? null,
      applicable_model_id: parsed.data.applicableModelId || null,
      warehouse_id: parsed.data.warehouseId || null,
      status: "ACTIVE",
      created_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/maintenance/spare-parts");
  return { success: true, data: { id: data.id } };
}

// ─── Update Spare Part ───────────────────────────────────────────────────

export async function updateSparePart(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = {
    partId: (formData.get("partId") as string) || "",
    partName: (formData.get("partName") as string)?.trim() || "",
    specification: (formData.get("specification") as string)?.trim() || undefined,
    unit: (formData.get("unit") as string) || "PIECE",
    unitPrice: formData.get("unitPrice") ? Number(formData.get("unitPrice")) : undefined,
    safetyStock: Number(formData.get("safetyStock")) || 0,
    applicableModelId: (formData.get("applicableModelId") as string) || undefined,
    warehouseId: (formData.get("warehouseId") as string) || undefined,
    status: (formData.get("status") as string) || "ACTIVE",
  };

  // Validate — same pattern as useSparePart
  if (!raw.partId || raw.partId.length < 10) {
    return { success: false, error: "配件ID无效", fieldErrors: { partId: ["配件ID无效"] } };
  }
  if (!raw.partName) {
    return { success: false, error: "配件名称不能为空", fieldErrors: { partName: ["配件名称不能为空"] } };
  }

  const { error } = await supabase
    .from("spare_part")
    .update({
      part_name: raw.partName,
      specification: raw.specification || null,
      unit: raw.unit,
      unit_price: raw.unitPrice ?? null,
      safety_stock: raw.safetyStock,
      applicable_model_id: raw.applicableModelId || null,
      warehouse_id: raw.warehouseId || null,
      status: raw.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", raw.partId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/maintenance/spare-parts");
  return { success: true, data: { id: raw.partId } };
}

// ─── Delete Spare Part ───────────────────────────────────────────────────

export async function deleteSparePart(
  partId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!partId || partId.length < 10) {
    return { success: false, error: "配件ID无效" };
  }

  const { data: part } = await supabase
    .from("spare_part")
    .select("id, part_no")
    .eq("id", partId)
    .maybeSingle();

  if (!part) return { success: false, error: "配件不存在" };

  const { data: deleted, error } = await supabase
    .from("spare_part")
    .delete()
    .eq("id", partId)
    .select("id");

  if (error) return { success: false, error: error.message };
  if (!deleted || deleted.length === 0) {
    return { success: false, error: "删除失败，可能权限不足或配件被其他记录引用" };
  }

  revalidatePath("/maintenance/spare-parts");
  return { success: true, data: null };
}

// ─── Stock-In Spare Part ─────────────────────────────────────────────────

export async function stockInSparePart(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await resolveProfileId();
  if (!auth.ok) return { success: false, error: auth.error };

  const raw = {
    partId: (formData.get("partId") as string) || "",
    quantity: Number(formData.get("quantity")),
    unitPrice: formData.get("unitPrice") ? Number(formData.get("unitPrice")) : undefined,
  };

  if (!raw.partId || raw.partId.length < 10) {
    return { success: false, error: "请选择有效的配件", fieldErrors: { partId: ["配件ID无效"] } };
  }
  if (!raw.quantity || raw.quantity <= 0 || isNaN(raw.quantity)) {
    return { success: false, error: "请输入有效的入库数量（大于 0）", fieldErrors: { quantity: ["入库数量必须大于 0"] } };
  }

  // Call SECURITY DEFINER function — bypasses RLS, same pattern as useSparePart
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "process_spare_part_stock_in",
    {
      p_part_id: raw.partId,
      p_quantity: raw.quantity,
      p_unit_price: raw.unitPrice ?? null,
      p_user_id: auth.userId,
    }
  );

  if (rpcError) return { success: false, error: rpcError.message };

  const result = rpcResult as unknown as { success: boolean; error?: string };
  if (!result || result.success === false) {
    return { success: false, error: result?.error || "入库失败" };
  }

  revalidatePath("/maintenance/spare-parts");
  return { success: true, data: { id: raw.partId } };
}
