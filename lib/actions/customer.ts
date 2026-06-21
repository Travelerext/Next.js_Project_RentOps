"use server";

import { createClient } from "@/lib/supabase/server";
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
