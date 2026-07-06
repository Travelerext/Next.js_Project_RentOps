"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const customerSchema = z.object({
  name: z.string().min(1, "客户名称不能为空"),
  shortName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  customerType: z.string().default("ENTERPRISE"),
  creditLevel: z.string().default("B"),
  riskLevel: z.string().default("LOW"),
  taxNo: z.string().optional(),
  invoiceTitle: z.string().optional(),
  invoiceAddressPhone: z.string().optional(),
  invoiceBankAccount: z.string().optional(),
  creditLimit: z.string().default("0"),
  isMonthlySettlement: z.string().optional(),  // checkbox: "true" or undefined
  monthlySettlementCycle: z.string().default("30"),
  isBlacklisted: z.string().optional(),  // checkbox: "true" or undefined
  status: z.string().default("ACTIVE"),
  remark: z.string().optional(),
});

const selfCustomerSchema = z.object({
  name: z.string().trim().min(1, "客户名称不能为空"),
  shortName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactPhone: z.string().trim().min(1, "联系电话不能为空"),
  taxNo: z.string().trim().optional(),
  invoiceTitle: z.string().trim().optional(),
  invoiceAddressPhone: z.string().trim().optional(),
  invoiceBankAccount: z.string().trim().optional(),
  remark: z.string().trim().optional(),
});

const bindCustomerSchema = z.object({
  customerNo: z.string().trim().min(1, "客户编号不能为空"),
  contactPhone: z.string().trim().optional(),
  taxNo: z.string().trim().optional(),
}).refine((value) => Boolean(value.contactPhone || value.taxNo), {
  message: "请填写联系电话或纳税人识别号用于校验",
  path: ["contactPhone"],
});

function normalizeDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

async function requireCustomerAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登录" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile) return { error: "用户档案不存在" as const };
  if (profile.primary_role !== "CUSTOMER") return { error: "仅客户账号可维护客户资料" as const };

  return { profileId: profile.id as string };
}

function parseSelfCustomerForm(formData: FormData) {
  return {
    name: (formData.get("name") as string) ?? "",
    shortName: (formData.get("shortName") as string) || undefined,
    contactName: (formData.get("contactName") as string) || undefined,
    contactPhone: (formData.get("contactPhone") as string) ?? "",
    taxNo: (formData.get("taxNo") as string) || undefined,
    invoiceTitle: (formData.get("invoiceTitle") as string) || undefined,
    invoiceAddressPhone: (formData.get("invoiceAddressPhone") as string) || undefined,
    invoiceBankAccount: (formData.get("invoiceBankAccount") as string) || undefined,
    remark: (formData.get("remark") as string) || undefined,
  };
}

function buildSelfCustomerPatch(parsed: z.infer<typeof selfCustomerSchema>, profileId: string) {
  return {
    name: parsed.name,
    short_name: parsed.shortName || null,
    contact_name: parsed.contactName || null,
    contact_phone: parsed.contactPhone,
    tax_no: parsed.taxNo || null,
    invoice_title: parsed.invoiceTitle || parsed.name,
    invoice_address_phone: parsed.invoiceAddressPhone || null,
    invoice_bank_account: parsed.invoiceBankAccount || null,
    remark: parsed.remark || null,
    updated_by: profileId,
    updated_at: new Date().toISOString(),
  };
}

function parseForm(formData: FormData) {
  return {
    name: (formData.get("name") as string)?.trim() || "",
    shortName: (formData.get("shortName") as string)?.trim() || undefined,
    contactName: (formData.get("contactName") as string)?.trim() || undefined,
    contactPhone: (formData.get("contactPhone") as string)?.trim() || undefined,
    customerType: (formData.get("customerType") as string) || "ENTERPRISE",
    creditLevel: (formData.get("creditLevel") as string) || "B",
    riskLevel: (formData.get("riskLevel") as string) || "LOW",
    taxNo: (formData.get("taxNo") as string)?.trim() || undefined,
    invoiceTitle: (formData.get("invoiceTitle") as string)?.trim() || undefined,
    invoiceAddressPhone: (formData.get("invoiceAddressPhone") as string)?.trim() || undefined,
    invoiceBankAccount: (formData.get("invoiceBankAccount") as string)?.trim() || undefined,
    creditLimit: (formData.get("creditLimit") as string) || "0",
    isMonthlySettlement: (formData.get("isMonthlySettlement") as string) || undefined,
    monthlySettlementCycle: (formData.get("monthlySettlementCycle") as string) || "30",
    isBlacklisted: (formData.get("isBlacklisted") as string) || undefined,
    status: (formData.get("status") as string) || "ACTIVE",
    remark: (formData.get("remark") as string)?.trim() || undefined,
  };
}

export async function upsertMyCustomerProfile(formData: FormData): Promise<ActionResult<null>> {
  const auth = await requireCustomerAuth();
  if ("error" in auth) return { success: false, error: auth.error ?? "未登录" };

  const parsed = selfCustomerSchema.safeParse(parseSelfCustomerForm(formData));
  if (!parsed.success) {
    return {
      success: false,
      error: "参数校验失败",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("customer")
    .select("id")
    .eq("owner_user_id", auth.profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("customer")
      .update(buildSelfCustomerPatch(parsed.data, auth.profileId))
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await admin.from("customer").insert({
      customer_no: generateNo("CUS"),
      owner_user_id: auth.profileId,
      customer_type: "ENTERPRISE",
      credit_level: "B",
      risk_level: "LOW",
      credit_limit: 0,
      is_monthly_settlement: false,
      monthly_settlement_cycle: 30,
      is_blacklisted: false,
      status: "ACTIVE",
      created_by: auth.profileId,
      ...buildSelfCustomerPatch(parsed.data, auth.profileId),
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/customer");
  revalidatePath("/customer/profile");
  return { success: true, data: null };
}

export async function bindMyExistingCustomer(formData: FormData): Promise<ActionResult<null>> {
  const auth = await requireCustomerAuth();
  if ("error" in auth) return { success: false, error: auth.error ?? "未登录" };

  const parsed = bindCustomerSchema.safeParse({
    customerNo: formData.get("customerNo"),
    contactPhone: (formData.get("contactPhone") as string) || undefined,
    taxNo: (formData.get("taxNo") as string) || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: "参数校验失败",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("customer")
    .select("id")
    .eq("owner_user_id", auth.profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (current?.id) return { success: false, error: "当前账号已经绑定客户资料" };

  const { data: customer } = await admin
    .from("customer")
    .select("id, owner_user_id, contact_phone, tax_no")
    .eq("customer_no", parsed.data.customerNo)
    .is("deleted_at", null)
    .maybeSingle();

  if (!customer) return { success: false, error: "未找到匹配的客户编号" };
  if (customer.owner_user_id && customer.owner_user_id !== auth.profileId) {
    return { success: false, error: "该客户资料已绑定其他账号" };
  }

  const phoneMatches = parsed.data.contactPhone
    ? normalizeDigits(parsed.data.contactPhone) === normalizeDigits(customer.contact_phone as string | null)
    : false;
  const taxMatches = parsed.data.taxNo
    ? parsed.data.taxNo.toUpperCase() === String(customer.tax_no ?? "").toUpperCase()
    : false;

  if (!phoneMatches && !taxMatches) {
    return { success: false, error: "客户编号与联系电话/税号不匹配" };
  }

  const { error } = await admin
    .from("customer")
    .update({ owner_user_id: auth.profileId, updated_by: auth.profileId, updated_at: new Date().toISOString() })
    .eq("id", customer.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/customer");
  revalidatePath("/customer/profile");
  return { success: true, data: null };
}

function buildInsert(parsed: z.infer<typeof customerSchema>, profileId: string) {
  return {
    name: parsed.name,
    short_name: parsed.shortName ?? null,
    contact_name: parsed.contactName ?? null,
    contact_phone: parsed.contactPhone ?? null,
    customer_type: parsed.customerType,
    credit_level: parsed.creditLevel,
    risk_level: parsed.riskLevel,
    tax_no: parsed.taxNo ?? null,
    invoice_title: parsed.invoiceTitle ?? null,
    invoice_address_phone: parsed.invoiceAddressPhone ?? null,
    invoice_bank_account: parsed.invoiceBankAccount ?? null,
    credit_limit: parsed.creditLimit ? parseFloat(parsed.creditLimit) : 0,
    is_monthly_settlement: parsed.isMonthlySettlement === "true",
    monthly_settlement_cycle: parseInt(parsed.monthlySettlementCycle) || 30,
    is_blacklisted: parsed.isBlacklisted === "true",
    status: parsed.status,
    remark: parsed.remark ?? null,
    created_by: profileId,
    updated_by: profileId,
  };
}

function buildUpdate(parsed: z.infer<typeof customerSchema>, profileId: string) {
  return {
    name: parsed.name,
    short_name: parsed.shortName ?? null,
    contact_name: parsed.contactName ?? null,
    contact_phone: parsed.contactPhone ?? null,
    customer_type: parsed.customerType,
    credit_level: parsed.creditLevel,
    risk_level: parsed.riskLevel,
    tax_no: parsed.taxNo ?? null,
    invoice_title: parsed.invoiceTitle ?? null,
    invoice_address_phone: parsed.invoiceAddressPhone ?? null,
    invoice_bank_account: parsed.invoiceBankAccount ?? null,
    credit_limit: parsed.creditLimit ? parseFloat(parsed.creditLimit) : 0,
    is_monthly_settlement: parsed.isMonthlySettlement === "true",
    monthly_settlement_cycle: parseInt(parsed.monthlySettlementCycle) || 30,
    is_blacklisted: parsed.isBlacklisted === "true",
    status: parsed.status,
    remark: parsed.remark ?? null,
    updated_by: profileId,
    updated_at: new Date().toISOString(),
  };
}

export async function createCustomer(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const parsed = customerSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return { success: false, error: `参数校验失败（${detail}）`, fieldErrors: fe };
  }

  const customerNo = generateNo("CUS");

  const { data, error } = await supabase
    .from("customer")
    .insert({ customer_no: customerNo, ...buildInsert(parsed.data, profile.id) })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CUSTOMER_CREATE",
    resource_type: "CUSTOMER",
    resource_id: data.id,
    detail: { customer_no: customerNo, name: parsed.data.name },
  });

  revalidatePath("/sales/customers");
  return { success: true, data: { id: data.id } };
}

export async function updateCustomer(
  id: string,
  formData: FormData
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  // Verify customer exists
  const { data: existing } = await supabase
    .from("customer")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { success: false, error: "客户不存在" };

  const parsed = customerSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    const first = Object.entries(fe)[0];
    const detail = first ? `${first[0]}: ${first[1].join(", ")}` : "未知字段";
    return { success: false, error: `参数校验失败（${detail}）`, fieldErrors: fe };
  }

  const { error } = await supabase
    .from("customer")
    .update(buildUpdate(parsed.data, profile.id))
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CUSTOMER_UPDATE",
    resource_type: "CUSTOMER",
    resource_id: id,
    detail: { updated_fields: Object.keys(buildUpdate(parsed.data, profile.id)).filter(k => !["updated_by", "updated_at", "version"].includes(k)) },
  });

  revalidatePath("/sales/customers");
  revalidatePath(`/sales/customers/${id}`);
  return { success: true, data: null };
}

export async function lockOrdering(
  id: string,
  reason: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const { error } = await supabase
    .from("customer")
    .update({
      lock_ordering: true,
      lock_reason: reason,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CUSTOMER_LOCK_ORDERING",
    resource_type: "CUSTOMER",
    resource_id: id,
    detail: { reason },
  });

  revalidatePath(`/sales/customers/${id}`);
  return { success: true, data: null };
}

export async function unlockOrdering(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const { error } = await supabase
    .from("customer")
    .update({
      lock_ordering: false,
      lock_reason: null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CUSTOMER_UNLOCK_ORDERING",
    resource_type: "CUSTOMER",
    resource_id: id,
    detail: {},
  });

  revalidatePath(`/sales/customers/${id}`);
  return { success: true, data: null };
}

export async function deleteCustomer(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "未登录" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();
  if (!profile) return { success: false, error: "用户档案不存在" };

  const { data: customer } = await supabase
    .from("customer")
    .select("id, name, customer_no")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return { success: false, error: "客户不存在" };

  // Block deletion if customer has active orders
  const { count: orderCount } = await supabase
    .from("rental_order")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", id)
    .in("order_status", ["IN_PROGRESS", "PENDING_APPROVAL", "APPROVED", "CONFIRMED", "SUBMITTED"]);

  if (orderCount && orderCount > 0) {
    return { success: false, error: `该客户有 ${orderCount} 个进行中的订单，无法删除` };
  }

  const { count: contractCount } = await supabase
    .from("rental_contract")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", id)
    .in("contract_status", ["ACTIVE", "FROZEN"]);

  if (contractCount && contractCount > 0) {
    return { success: false, error: `该客户有 ${contractCount} 个生效中的合同，无法删除` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("customer")
    .update({
      deleted_at: now,
      updated_by: profile.id,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "CUSTOMER_DELETE",
    resource_type: "CUSTOMER",
    resource_id: id,
    detail: { customer_no: customer.customer_no, name: customer.name },
  });

  revalidatePath("/sales/customers");
  return { success: true, data: null };
}
