"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const equipmentSchema = z.object({
  name: z.string().min(1, "设备名称不能为空"),
  categoryId: z.string().min(1),
  modelId: z.string().optional(),
  brand: z.string().optional(),
  specification: z.string().optional(),
  tonnage: z.string().optional(),
  conditionLevel: z.string().default("A"),
  warehouseId: z.string().optional(),
  stationId: z.string().optional(),
  standardRent: z.string().default("0"),
  standardDeposit: z.string().default("0"),
  purchaseDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  depreciationYears: z.string().default("8"),
  remark: z.string().optional(),
});

export async function createEquipment(
  categoryId: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  // Resolve profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  if (!categoryId || categoryId.length < 10) {
    return { success: false, error: "请选择设备分类", fieldErrors: { categoryId: ["分类ID无效"] } };
  }

  if (!formData) {
    return { success: false, error: "缺少表单数据" };
  }

  const raw = {
    name: (formData.get("name") as string)?.trim() || "",
    modelId: (formData.get("modelId") as string) || undefined,
    brand: (formData.get("brand") as string)?.trim() || undefined,
    specification: (formData.get("specification") as string)?.trim() || undefined,
    tonnage: (formData.get("tonnage") as string) || undefined,
    conditionLevel: (formData.get("conditionLevel") as string) || "A",
    warehouseId: (formData.get("warehouseId") as string) || undefined,
    stationId: (formData.get("stationId") as string) || undefined,
    standardRent: (formData.get("standardRent") as string) || "0",
    standardDeposit: (formData.get("standardDeposit") as string) || "0",
    purchaseDate: (formData.get("purchaseDate") as string) || undefined,
    purchasePrice: (formData.get("purchasePrice") as string) || undefined,
    depreciationYears: (formData.get("depreciationYears") as string) || "8",
    remark: (formData.get("remark") as string)?.trim() || undefined,
  };

  const parsed = equipmentSchema.safeParse({ ...raw, categoryId });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return {
      success: false,
      error: `参数校验失败（${detail}）`,
      fieldErrors: fe,
    };
  }

  const equipmentNo = generateNo("EQ");

  const { data, error } = await supabase
    .from("equipment")
    .insert({
      equipment_no: equipmentNo,
      name: parsed.data.name,
      category_id: parsed.data.categoryId,
      model_id: parsed.data.modelId ?? null,
      brand: parsed.data.brand ?? null,
      specification: parsed.data.specification ?? null,
      tonnage: parsed.data.tonnage ? parseFloat(parsed.data.tonnage) : null,
      condition_level: parsed.data.conditionLevel,
      warehouse_id: parsed.data.warehouseId ?? null,
      station_id: parsed.data.stationId ?? null,
      standard_rent: parsed.data.standardRent,
      standard_deposit: parsed.data.standardDeposit,
      purchase_date: parsed.data.purchaseDate
        ? new Date(parsed.data.purchaseDate).toISOString()
        : null,
      purchase_price: parsed.data.purchasePrice
        ? parseFloat(parsed.data.purchasePrice)
        : null,
      depreciation_years: parseInt(parsed.data.depreciationYears),
      remark: parsed.data.remark ?? null,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "EQUIPMENT_CREATE",
    resource_type: "EQUIPMENT",
    resource_id: data.id,
    detail: { equipment_no: equipmentNo, name: parsed.data.name },
  });

  revalidatePath("/equipment/catalog");
  return { success: true, data: { id: data.id } };
}

export async function updateEquipmentStatus(
  equipmentId: string,
  status: string,
  reason: string
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

  const { data: current } = await supabase
    .from("equipment")
    .select("status")
    .eq("id", equipmentId)
    .single();

  const { error } = await supabase
    .from("equipment")
    .update({
      status,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", equipmentId);

  if (error) return { success: false, error: error.message };

  await supabase.from("equipment_status_log").insert({
    equipment_id: equipmentId,
    from_status: current?.status,
    to_status: status,
    change_reason: reason,
    business_type: "MANUAL",
    business_id: equipmentId,
    changed_by: profile.id,
  });

  revalidatePath(`/equipment/catalog/${equipmentId}`);
  return { success: true, data: null };
}


// Maintenance check after inbound inspection
// If OK -> equipment back to IN_STOCK
// If needs repair -> create maintenance work order and set to IN_MAINTENANCE
export async function maintenanceCheck(
  equipmentId: string,
  result: 'OK' | 'NEEDS_REPAIR',
  notes?: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '未登录' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('supabase_user_id', user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: '用户档案不存在' };

  const newStatus = result === 'OK' ? 'IN_STOCK' : 'IN_MAINTENANCE';

  const { data: current } = await supabase
    .from('equipment')
    .select('status')
    .eq('id', equipmentId)
    .single();

  const { error } = await supabase
    .from('equipment')
    .update({
      status: newStatus,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', equipmentId);

  if (error) return { success: false, error: error.message };

  await supabase.from('equipment_status_log').insert({
    equipment_id: equipmentId,
    from_status: current?.status,
    to_status: newStatus,
    change_reason: result === 'OK' ? '维修复查通过' : '维修复查需维修',
    business_type: 'MAINTENANCE_CHECK',
    business_id: equipmentId,
    changed_by: profile.id,
  });

  // If needs repair, create a maintenance work order
  if (result === 'NEEDS_REPAIR') {
    const workOrderNo = 'MWO' + Date.now().toString(36).toUpperCase();
    await supabase.from('maintenance_work_order').insert({
      equipment_id: equipmentId,
      work_order_no: workOrderNo,
      fault_description: notes ?? '归还验收异常，运维检查确认需维修',
      fault_level: 'NORMAL',
      status: 'PENDING_DISPATCH',
      reported_by: profile.id,
    });
  }

  revalidatePath('/equipment/catalog/' + equipmentId);
  revalidatePath('/equipment/catalog');
  revalidatePath('/equipment/scan/inbound');
  return { success: true, data: null };
}
