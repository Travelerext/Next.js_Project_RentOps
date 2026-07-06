"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

type AuthContext = {
  profileId: string;
  userId: string;
  primaryRole: string;
};

const EQUIPMENT_ROLES = ["SYSTEM_ADMIN", "EQUIPMENT_MANAGER", "EQUIPMENT_SUPERVISOR"] as const;
const MAINTENANCE_ROLES = ["SYSTEM_ADMIN", "MAINTENANCE", "MAINTENANCE_SUPERVISOR"] as const;
const SALES_ROLES = ["SYSTEM_ADMIN", "SALES", "SALES_MANAGER"] as const;
const FINANCE_ROLES = ["SYSTEM_ADMIN", "FINANCE", "FINANCE_MANAGER"] as const;
const CUSTOMER_ROLES = ["CUSTOMER"] as const;

async function requireAuth(): Promise<AuthContext | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile) return { error: "用户档案不存在" };
  return { profileId: profile.id, userId: user.id, primaryRole: profile.primary_role as string };
}

function hasRole(role: string, allowed: readonly string[]) {
  return allowed.includes(role);
}

function str(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

function nullableStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value || null;
}

function num(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function isoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function redirectAfter(formData: FormData, fallback: string): never {
  redirect(str(formData, "redirectTo", fallback));
}

async function currentCustomerId(profileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer")
    .select("id")
    .eq("owner_user_id", profileId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function bindIotTerminal(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, EQUIPMENT_ROLES)) return { success: false, error: "无权绑定 IoT 终端" };

  const equipmentId = str(formData, "equipmentId");
  const terminalNo = str(formData, "terminalNo");
  if (!equipmentId || !terminalNo) return { success: false, error: "设备和终端编号不能为空" };

  let terminalId = str(formData, "terminalId");
  if (!terminalId) {
    const { data: existing } = await supabase
      .from("iot_terminal")
      .select("id")
      .eq("terminal_no", terminalNo)
      .maybeSingle();

    if (existing?.id) {
      terminalId = existing.id as string;
    } else {
      const { data: created, error } = await supabase
        .from("iot_terminal")
        .insert({
          terminal_no: terminalNo,
          terminal_type: str(formData, "terminalType", "GPS"),
          vendor: nullableStr(formData, "vendor"),
          sim_no: nullableStr(formData, "simNo"),
          installed_at: isoOrNull(str(formData, "installedAt")),
          status: "ACTIVE",
          created_by: auth.profileId,
          updated_by: auth.profileId,
        })
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      terminalId = created.id as string;
    }
  }

  await supabase
    .from("equipment_iot_binding")
    .update({ unbound_at: new Date().toISOString(), unbind_reason: "新绑定替换" })
    .eq("equipment_id", equipmentId)
    .is("unbound_at", null);

  const { data, error } = await supabase
    .from("equipment_iot_binding")
    .insert({
      equipment_id: equipmentId,
      terminal_id: terminalId,
      bind_reason: nullableStr(formData, "bindReason"),
      created_by: auth.profileId,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await supabase
    .from("equipment")
    .update({ gps_enabled: true, updated_by: auth.profileId, updated_at: new Date().toISOString() })
    .eq("id", equipmentId);

  revalidatePath("/equipment/iot/devices");
  revalidatePath(`/equipment/catalog/${equipmentId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/equipment/catalog/${equipmentId}/iot`);
  return { success: true, data: { id: data.id as string } };
}

export async function unbindIotTerminal(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, EQUIPMENT_ROLES)) return { success: false, error: "无权解绑 IoT 终端" };

  const bindingId = str(formData, "bindingId");
  const equipmentId = str(formData, "equipmentId");
  const { error } = await supabase
    .from("equipment_iot_binding")
    .update({
      unbound_at: new Date().toISOString(),
      unbind_reason: nullableStr(formData, "unbindReason") ?? "手动解绑",
    })
    .eq("id", bindingId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/equipment/iot/devices");
  if (equipmentId) revalidatePath(`/equipment/catalog/${equipmentId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, equipmentId ? `/equipment/catalog/${equipmentId}/iot` : "/equipment/iot/devices");
  return { success: true, data: null };
}

export async function upsertTelemetry(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, EQUIPMENT_ROLES)) return { success: false, error: "无权写入遥测数据" };

  const equipmentId = str(formData, "equipmentId");
  const terminalId = nullableStr(formData, "terminalId");
  const faultCodes = str(formData, "faultCodes")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("equipment_telemetry_latest")
    .upsert({
      equipment_id: equipmentId,
      terminal_id: terminalId,
      reported_at: isoOrNull(str(formData, "reportedAt")) ?? new Date().toISOString(),
      latitude: nullableStr(formData, "latitude"),
      longitude: nullableStr(formData, "longitude"),
      engine_hours: num(formData, "engineHours"),
      fuel_consumption: num(formData, "fuelConsumption"),
      hydraulic_pressure: formData.get("hydraulicPressure") ? num(formData, "hydraulicPressure") : null,
      battery_level: formData.get("batteryLevel") ? num(formData, "batteryLevel") : null,
      signal_strength: formData.get("signalStrength") ? num(formData, "signalStrength") : null,
      fault_codes: faultCodes,
      raw_payload: { source: "manual", operator: auth.profileId },
      updated_at: new Date().toISOString(),
    }, { onConflict: "equipment_id" });

  if (error) return { success: false, error: error.message };
  revalidatePath("/equipment/map");
  revalidatePath(`/equipment/catalog/${equipmentId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/equipment/catalog/${equipmentId}/tracking`);
  return { success: true, data: null };
}

export async function createGeofence(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, [...EQUIPMENT_ROLES, "MAINTENANCE_SUPERVISOR"])) return { success: false, error: "无权创建电子围栏" };

  const parsed = z.object({
    name: z.string().min(1, "围栏名称不能为空"),
    equipmentId: z.string().min(1, "请选择设备"),
    centerLatitude: z.coerce.number(),
    centerLongitude: z.coerce.number(),
    radiusMeters: z.coerce.number().int().positive(),
  }).safeParse({
    name: str(formData, "name"),
    equipmentId: str(formData, "equipmentId"),
    centerLatitude: formData.get("centerLatitude"),
    centerLongitude: formData.get("centerLongitude"),
    radiusMeters: formData.get("radiusMeters"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "参数错误" };

  const { data, error } = await supabase
    .from("equipment_geofence")
    .insert({
      name: parsed.data.name,
      fence_type: "CIRCLE",
      equipment_id: parsed.data.equipmentId,
      center_latitude: parsed.data.centerLatitude,
      center_longitude: parsed.data.centerLongitude,
      radius_meters: parsed.data.radiusMeters,
      effective_start_at: isoOrNull(str(formData, "effectiveStartAt")),
      effective_end_at: isoOrNull(str(formData, "effectiveEndAt")),
      alert_level: str(formData, "alertLevel", "WARNING"),
      status: "ACTIVE",
      created_by: auth.profileId,
      updated_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/equipment/geofences");
  if (formData.has("redirectTo")) redirectAfter(formData, `/equipment/geofences/${data.id}`);
  return { success: true, data: { id: data.id as string } };
}

export async function handleEquipmentAlert(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, [...EQUIPMENT_ROLES, ...MAINTENANCE_ROLES])) return { success: false, error: "无权处理告警" };

  const alertId = str(formData, "alertId");
  const status = str(formData, "status", "ACKNOWLEDGED");
  const result = nullableStr(formData, "handlingResult");
  const { data: alert } = await supabase
    .from("equipment_alert")
    .select("equipment_id, title, content")
    .eq("id", alertId)
    .single();

  const patch: Record<string, unknown> = {
    status,
    handler_id: auth.profileId,
    handling_result: result,
    updated_at: new Date().toISOString(),
  };
  if (status === "ACKNOWLEDGED" || status === "PROCESSING") patch.acknowledged_at = new Date().toISOString();
  if (status === "CLOSED") patch.closed_at = new Date().toISOString();

  const { error } = await supabase.from("equipment_alert").update(patch).eq("id", alertId);
  if (error) return { success: false, error: error.message };

  if (formData.get("createWorkOrder") === "on" && alert?.equipment_id) {
    await supabase.from("maintenance_work_order").insert({
      work_order_no: generateNo("WO"),
      equipment_id: alert.equipment_id,
      reported_by: auth.profileId,
      fault_description: `${alert.title ?? "设备告警"}：${alert.content ?? result ?? "请检查设备"}`,
      fault_level: "NORMAL",
      status: "PENDING_DISPATCH",
      remark: "由设备告警处理生成",
      created_by: auth.profileId,
    });
  }

  revalidatePath("/equipment/alerts");
  revalidatePath(`/equipment/alerts/${alertId}`);
  if (alert?.equipment_id) revalidatePath(`/equipment/catalog/${alert.equipment_id}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/equipment/alerts/${alertId}`);
  return { success: true, data: null };
}

export async function confirmPredictiveSuggestion(formData: FormData): Promise<ActionResult<{ workOrderId: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, MAINTENANCE_ROLES)) return { success: false, error: "无权确认预测性维护" };

  const suggestionId = str(formData, "suggestionId");
  const { data: suggestion } = await supabase
    .from("predictive_maintenance_suggestion")
    .select("equipment_id, reason")
    .eq("id", suggestionId)
    .single();
  if (!suggestion) return { success: false, error: "维护建议不存在" };

  const { data: workOrder, error: woError } = await supabase
    .from("maintenance_work_order")
    .insert({
      work_order_no: generateNo("WO"),
      equipment_id: suggestion.equipment_id,
      reported_by: auth.profileId,
      fault_description: suggestion.reason,
      fault_level: "NORMAL",
      status: "PENDING_DISPATCH",
      remark: "预测性维护建议确认生成",
      created_by: auth.profileId,
    })
    .select("id")
    .single();
  if (woError) return { success: false, error: woError.message };

  const { error } = await supabase
    .from("predictive_maintenance_suggestion")
    .update({
      status: "CONFIRMED",
      confirmed_by: auth.profileId,
      confirmed_at: new Date().toISOString(),
      work_order_id: workOrder.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/maintenance/predictive");
  revalidatePath("/maintenance/work-orders");
  if (formData.has("redirectTo")) redirectAfter(formData, `/maintenance/work-orders/${workOrder.id}`);
  return { success: true, data: { workOrderId: workOrder.id as string } };
}

export async function submitRentalInquiry(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, [...CUSTOMER_ROLES, ...SALES_ROLES])) return { success: false, error: "无权提交租赁询价" };

  const customerId = hasRole(auth.primaryRole, CUSTOMER_ROLES)
    ? await currentCustomerId(auth.profileId)
    : str(formData, "customerId");
  if (!customerId) return { success: false, error: "客户信息不存在" };

  const quantity = num(formData, "quantity", 1);
  const unitPrice = num(formData, "estimatedUnitPrice", 0);
  const amount = quantity * unitPrice;

  const { data, error } = await supabase
    .from("rental_inquiry")
    .insert({
      inquiry_no: generateNo("RI"),
      customer_id: customerId,
      contact_name: nullableStr(formData, "contactName"),
      contact_phone: nullableStr(formData, "contactPhone"),
      project_location: nullableStr(formData, "projectLocation"),
      planned_start_at: isoOrNull(str(formData, "plannedStartAt")),
      planned_end_at: isoOrNull(str(formData, "plannedEndAt")),
      estimated_amount: amount,
      remark: nullableStr(formData, "remark"),
      created_by: auth.profileId,
      updated_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  const equipmentId = nullableStr(formData, "equipmentId");
  await supabase.from("rental_inquiry_item").insert({
    inquiry_id: data.id,
    equipment_id: equipmentId,
    equipment_name: nullableStr(formData, "equipmentName"),
    quantity,
    estimated_unit_price: unitPrice,
    estimated_amount: amount,
  });

  revalidatePath("/customer/inquiries");
  revalidatePath("/sales/inquiries");
  if (formData.has("redirectTo")) redirectAfter(formData, `/customer/inquiries`);
  return { success: true, data: { id: data.id as string } };
}

export async function convertInquiryToOrder(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, SALES_ROLES)) return { success: false, error: "无权转化询价" };

  const inquiryId = str(formData, "inquiryId");
  const { data: inquiry } = await supabase
    .from("rental_inquiry")
    .select("*, items:rental_inquiry_item(*)")
    .eq("id", inquiryId)
    .single();
  if (!inquiry) return { success: false, error: "询价不存在" };

  const { data: order, error } = await supabase
    .from("rental_order")
    .insert({
      order_no: generateNo("RO"),
      customer_id: inquiry.customer_id,
      sales_user_id: auth.profileId,
      order_type: "NORMAL",
      order_status: "DRAFT",
      pricing_mode: "MONTHLY",
      planned_start_at: inquiry.planned_start_at,
      planned_end_at: inquiry.planned_end_at,
      total_rent_amount: inquiry.estimated_amount,
      receivable_amount: inquiry.estimated_amount,
      unpaid_amount: inquiry.estimated_amount,
      remark: `由询价 ${inquiry.inquiry_no} 转化。${inquiry.remark ?? ""}`,
      created_by: auth.profileId,
      updated_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  const items = ((inquiry.items ?? []) as Record<string, unknown>[]).filter((item) => item.equipment_id);
  if (items.length > 0) {
    await supabase.from("rental_order_item").insert(items.map((item) => ({
      order_id: order.id,
      equipment_id: item.equipment_id,
      equipment_model_id: item.equipment_model_id ?? null,
      quantity: item.quantity ?? 1,
      pricing_mode: "MONTHLY",
      standard_unit_price: item.estimated_unit_price ?? 0,
      actual_unit_price: item.estimated_unit_price ?? 0,
      rent_amount: item.estimated_amount ?? 0,
      start_at: inquiry.planned_start_at,
      end_at: inquiry.planned_end_at,
      item_status: "PENDING",
    })));
  }

  await supabase
    .from("rental_inquiry")
    .update({ status: "CONVERTED", converted_order_id: order.id, updated_by: auth.profileId, updated_at: new Date().toISOString() })
    .eq("id", inquiryId);

  revalidatePath("/sales/inquiries");
  revalidatePath("/sales/orders");
  if (formData.has("redirectTo")) redirectAfter(formData, `/sales/orders/${order.id}`);
  return { success: true, data: { id: order.id as string } };
}

export async function updateInquiryStatus(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, SALES_ROLES)) return { success: false, error: "无权更新询价" };

  const inquiryId = str(formData, "inquiryId");
  const { error } = await supabase
    .from("rental_inquiry")
    .update({ status: str(formData, "status", "FOLLOWING"), updated_by: auth.profileId, updated_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/sales/inquiries");
  revalidatePath(`/sales/inquiries/${inquiryId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/sales/inquiries/${inquiryId}`);
  return { success: true, data: null };
}

export async function createContractSignTask(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, SALES_ROLES)) return { success: false, error: "无权发起合同签署" };

  const contractId = str(formData, "contractId");
  const { data, error } = await supabase
    .from("contract_sign_task")
    .insert({
      contract_id: contractId,
      provider: str(formData, "provider", "MANUAL"),
      sign_url: nullableStr(formData, "signUrl"),
      status: "PENDING",
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  await supabase.from("rental_contract").update({ contract_status: "PENDING_SIGN", updated_at: new Date().toISOString() }).eq("id", contractId);
  revalidatePath(`/sales/contracts/${contractId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/sales/contracts/${contractId}`);
  return { success: true, data: { id: data.id as string } };
}

export async function markSignTaskSigned(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };

  const taskId = str(formData, "taskId");
  const { error } = await supabase
    .from("contract_sign_task")
    .update({
      status: "SIGNED",
      signed_file_url: nullableStr(formData, "signedFileUrl"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/customer/contracts");
  revalidatePath("/sales/contracts");
  if (formData.has("redirectTo")) redirectAfter(formData, "/customer/contracts");
  return { success: true, data: null };
}

export async function submitPaymentVoucher(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };

  const customerId = hasRole(auth.primaryRole, CUSTOMER_ROLES)
    ? await currentCustomerId(auth.profileId)
    : str(formData, "customerId");
  if (!customerId) return { success: false, error: "客户信息不存在" };

  const { data, error } = await supabase
    .from("payment_voucher")
    .insert({
      voucher_no: generateNo("PV"),
      customer_id: customerId,
      receivable_id: nullableStr(formData, "receivableId"),
      amount: num(formData, "amount"),
      payment_method: str(formData, "paymentMethod", "BANK_TRANSFER"),
      bank_flow_no: nullableStr(formData, "bankFlowNo"),
      file_url: nullableStr(formData, "fileUrl"),
      status: "SUBMITTED",
      created_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/customer/bills");
  revalidatePath("/finance/payments");
  if (formData.has("redirectTo")) redirectAfter(formData, "/customer/bills");
  return { success: true, data: { id: data.id as string } };
}

export async function reviewPaymentVoucher(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, FINANCE_ROLES)) return { success: false, error: "无权审核付款凭证" };

  const voucherId = str(formData, "voucherId");
  const { error } = await supabase
    .from("payment_voucher")
    .update({
      status: str(formData, "status", "APPROVED"),
      review_comment: nullableStr(formData, "reviewComment"),
      reviewed_by: auth.profileId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", voucherId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/payments");
  revalidatePath("/customer/bills");
  if (formData.has("redirectTo")) redirectAfter(formData, "/finance/payments");
  return { success: true, data: null };
}

export async function submitCustomerRepair(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, CUSTOMER_ROLES)) return { success: false, error: "仅客户可提交 Portal 报修" };

  const customerId = await currentCustomerId(auth.profileId);
  if (!customerId) return { success: false, error: "客户信息不存在" };

  const photoUrls = str(formData, "photoUrls")
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);

  const { data, error } = await supabase
    .from("customer_repair_request")
    .insert({
      request_no: generateNo("RR"),
      customer_id: customerId,
      equipment_id: str(formData, "equipmentId"),
      fault_description: str(formData, "faultDescription"),
      photo_urls: photoUrls,
      status: "SUBMITTED",
      created_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/customer/repairs");
  revalidatePath("/maintenance/work-orders");
  if (formData.has("redirectTo")) redirectAfter(formData, `/customer/repairs/${data.id}`);
  return { success: true, data: { id: data.id as string } };
}

export async function createInsurancePolicy(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, FINANCE_ROLES)) return { success: false, error: "无权维护保险保单" };

  const { data, error } = await supabase
    .from("equipment_insurance_policy")
    .insert({
      policy_no: str(formData, "policyNo") || generateNo("IP"),
      equipment_id: str(formData, "equipmentId"),
      insurer_name: str(formData, "insurerName"),
      insurance_type: str(formData, "insuranceType", "COMMERCIAL"),
      insured_amount: num(formData, "insuredAmount"),
      premium_amount: num(formData, "premiumAmount"),
      start_date: str(formData, "startDate"),
      end_date: str(formData, "endDate"),
      attachment_url: nullableStr(formData, "attachmentUrl"),
      status: str(formData, "status", "ACTIVE"),
      remark: nullableStr(formData, "remark"),
      created_by: auth.profileId,
      updated_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/insurance");
  if (formData.has("redirectTo")) redirectAfter(formData, `/finance/insurance/${data.id}`);
  return { success: true, data: { id: data.id as string } };
}

export async function updateInsurancePolicy(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, FINANCE_ROLES)) return { success: false, error: "无权维护保险保单" };

  const policyId = str(formData, "policyId");
  const { error } = await supabase
    .from("equipment_insurance_policy")
    .update({
      insurer_name: str(formData, "insurerName"),
      insurance_type: str(formData, "insuranceType", "COMMERCIAL"),
      insured_amount: num(formData, "insuredAmount"),
      premium_amount: num(formData, "premiumAmount"),
      start_date: str(formData, "startDate"),
      end_date: str(formData, "endDate"),
      attachment_url: nullableStr(formData, "attachmentUrl"),
      status: str(formData, "status", "ACTIVE"),
      remark: nullableStr(formData, "remark"),
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", policyId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/insurance");
  revalidatePath(`/finance/insurance/${policyId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/finance/insurance/${policyId}`);
  return { success: true, data: null };
}

export async function createInsuranceClaim(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, [...FINANCE_ROLES, ...EQUIPMENT_ROLES])) return { success: false, error: "无权创建保险理赔" };

  const materialUrls = str(formData, "materialUrls").split("\n").map((url) => url.trim()).filter(Boolean);
  const { data, error } = await supabase
    .from("equipment_insurance_claim")
    .insert({
      claim_no: generateNo("IC"),
      policy_id: nullableStr(formData, "policyId"),
      equipment_id: str(formData, "equipmentId"),
      accident_date: str(formData, "accidentDate"),
      accident_location: nullableStr(formData, "accidentLocation"),
      accident_reason: nullableStr(formData, "accidentReason"),
      assessed_amount: num(formData, "assessedAmount"),
      claim_amount: num(formData, "claimAmount"),
      paid_amount: num(formData, "paidAmount"),
      material_urls: materialUrls,
      status: str(formData, "status", "DRAFT"),
      remark: nullableStr(formData, "remark"),
      created_by: auth.profileId,
      updated_by: auth.profileId,
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/insurance/claims");
  if (formData.has("redirectTo")) redirectAfter(formData, `/finance/insurance/claims/${data.id}`);
  return { success: true, data: { id: data.id as string } };
}

export async function updateInsuranceClaimStatus(formData: FormData): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, FINANCE_ROLES)) return { success: false, error: "无权更新理赔状态" };

  const claimId = str(formData, "claimId");
  const { error } = await supabase
    .from("equipment_insurance_claim")
    .update({
      status: str(formData, "status", "SUBMITTED"),
      paid_amount: num(formData, "paidAmount"),
      remark: nullableStr(formData, "remark"),
      updated_by: auth.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/finance/insurance/claims");
  revalidatePath(`/finance/insurance/claims/${claimId}`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/finance/insurance/claims/${claimId}`);
  return { success: true, data: null };
}

export async function generateUtilizationSnapshot(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const auth = await requireAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  if (!hasRole(auth.primaryRole, [...EQUIPMENT_ROLES, "FINANCE_MANAGER", "SYSTEM_ADMIN"])) return { success: false, error: "无权生成利用率快照" };

  const equipmentId = str(formData, "equipmentId");
  const periodStart = str(formData, "periodStart");
  const periodEnd = str(formData, "periodEnd");
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const calendarDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

  const { data: equip } = await supabase
    .from("equipment")
    .select("category_id, model_id, station_id, standard_rent, status")
    .eq("id", equipmentId)
    .single();
  if (!equip) return { success: false, error: "设备不存在" };

  const { data: items } = await supabase
    .from("rental_order_item")
    .select("start_at, end_at, rent_amount")
    .eq("equipment_id", equipmentId)
    .lte("start_at", end.toISOString())
    .or(`end_at.is.null,end_at.gte.${start.toISOString()}`);

  let rentedDays = 0;
  let actualRevenue = 0;
  for (const item of items ?? []) {
    const itemStart = item.start_at ? new Date(item.start_at as string) : start;
    const itemEnd = item.end_at ? new Date(item.end_at as string) : end;
    const overlapStart = new Date(Math.max(start.getTime(), itemStart.getTime()));
    const overlapEnd = new Date(Math.min(end.getTime(), itemEnd.getTime()));
    if (overlapEnd >= overlapStart) rentedDays += Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
    actualRevenue += Number(item.rent_amount ?? 0);
  }
  rentedDays = Math.min(calendarDays, rentedDays);
  const maintenanceDays = equip.status === "IN_MAINTENANCE" ? calendarDays : 0;
  const theoreticalRevenue = Number(equip.standard_rent ?? 0);
  const nominal = rentedDays / calendarDays;
  const availableBase = Math.max(1, calendarDays - maintenanceDays);
  const available = rentedDays / availableBase;
  const realization = theoreticalRevenue > 0 ? actualRevenue / theoreticalRevenue : 0;

  const { data, error } = await supabase
    .from("equipment_utilization_snapshot")
    .insert({
      equipment_id: equipmentId,
      category_id: equip.category_id,
      model_id: equip.model_id,
      station_id: equip.station_id,
      period_start: periodStart,
      period_end: periodEnd,
      calendar_days: calendarDays,
      rented_days: rentedDays,
      maintenance_days: maintenanceDays,
      nominal_utilization: nominal,
      available_utilization: available,
      revenue_realization: realization,
      actual_revenue: actualRevenue,
      theoretical_revenue: theoreticalRevenue,
      diagnosis: nominal < 0.5 ? "利用率偏低，建议检查定价、调拨或销售线索。" : "利用率正常。",
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/reports/equipment-utilization");
  revalidatePath(`/equipment/catalog/${equipmentId}/utilization`);
  if (formData.has("redirectTo")) redirectAfter(formData, `/equipment/catalog/${equipmentId}/utilization`);
  return { success: true, data: { id: data.id as string } };
}

async function actionToForm<T>(action: (formData: FormData) => Promise<ActionResult<T>>, formData: FormData): Promise<void> {
  const result = await action(formData);
  if (!result.success) throw new Error(result.error);
}

export async function bindIotTerminalForm(formData: FormData) { await actionToForm(bindIotTerminal, formData); }
export async function unbindIotTerminalForm(formData: FormData) { await actionToForm(unbindIotTerminal, formData); }
export async function upsertTelemetryForm(formData: FormData) { await actionToForm(upsertTelemetry, formData); }
export async function createGeofenceForm(formData: FormData) { await actionToForm(createGeofence, formData); }
export async function handleEquipmentAlertForm(formData: FormData) { await actionToForm(handleEquipmentAlert, formData); }
export async function confirmPredictiveSuggestionForm(formData: FormData) { await actionToForm(confirmPredictiveSuggestion, formData); }
export async function submitRentalInquiryForm(formData: FormData) { await actionToForm(submitRentalInquiry, formData); }
export async function convertInquiryToOrderForm(formData: FormData) { await actionToForm(convertInquiryToOrder, formData); }
export async function updateInquiryStatusForm(formData: FormData) { await actionToForm(updateInquiryStatus, formData); }
export async function createContractSignTaskForm(formData: FormData) { await actionToForm(createContractSignTask, formData); }
export async function markSignTaskSignedForm(formData: FormData) { await actionToForm(markSignTaskSigned, formData); }
export async function submitPaymentVoucherForm(formData: FormData) { await actionToForm(submitPaymentVoucher, formData); }
export async function reviewPaymentVoucherForm(formData: FormData) { await actionToForm(reviewPaymentVoucher, formData); }
export async function submitCustomerRepairForm(formData: FormData) { await actionToForm(submitCustomerRepair, formData); }
export async function createInsurancePolicyForm(formData: FormData) { await actionToForm(createInsurancePolicy, formData); }
export async function updateInsurancePolicyForm(formData: FormData) { await actionToForm(updateInsurancePolicy, formData); }
export async function createInsuranceClaimForm(formData: FormData) { await actionToForm(createInsuranceClaim, formData); }
export async function updateInsuranceClaimStatusForm(formData: FormData) { await actionToForm(updateInsuranceClaimStatus, formData); }
export async function generateUtilizationSnapshotForm(formData: FormData) { await actionToForm(generateUtilizationSnapshot, formData); }
