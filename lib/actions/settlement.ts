"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateNo } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SettlementPreviewData {
  inspectionId: string;
  inspectionNo: string;
  contractId: string;
  contractNo: string;
  customerId: string;
  customerName: string;
  /** Remaining unpaid rent from receivables for this contract */
  unpaidRent: number;
  /** Rent accrued during overdue period */
  overdueRent: number;
  /** Late fee calculated from contract.late_fee_rule */
  lateFee: number;
  lateFeeDesc: string;
  /** Penalty from contract.penalty_rule */
  penalty: number;
  penaltyDesc: string;
  /** Damage compensation from inspection */
  damageCompensation: number;
  /** Missing parts compensation */
  missingPartsComp: number;
  /** Cleaning fee */
  cleaningFee: number;
  /** Repair cost estimate */
  repairFee: number;
  /** Sum of all deductions */
  totalDeduction: number;
  /** Available deposit balance */
  depositBalance: number;
  /** Refund to customer (deposit_balance - total_deduction if positive) */
  refundAmount: number;
  /** Additional charge (total_deduction - deposit_balance if positive) */
  additionalCharge: number;
}

// ─── Helper: Calculate Settlement Preview ───────────────────────────────────

async function calculateSettlement(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  inspectionId: string,
): Promise<{ data: SettlementPreviewData; error?: string }> {
  // 1. Fetch inspection with all joins
  const { data: inspection, error: inspErr } = await supabase
    .from("return_inspection")
    .select(
      "*, customer:customer_id(name), contract:contract_id(contract_no, total_rent_amount, deposit_amount, late_fee_rule, penalty_rule), equipment:equipment_id(equipment_no, name)",
    )
    .eq("id", inspectionId)
    .single();

  if (inspErr || !inspection) {
    return { data: null as unknown as SettlementPreviewData, error: "验收记录不存在" };
  }

  const contract = inspection.contract as unknown as {
    contract_no: string;
    total_rent_amount: string;
    deposit_amount: string;
    late_fee_rule: Record<string, unknown> | null;
    penalty_rule: Record<string, unknown> | null;
  } | null;

  const customer = inspection.customer as unknown as { name: string } | null;

  if (!contract) return { data: null as unknown as SettlementPreviewData, error: "关联合同不存在" };

  // 2. Unpaid rent — remaining unpaid from receivables
  const { data: receivables } = await supabase
    .from("receivable")
    .select("unpaid_amount")
    .eq("contract_id", inspection.contract_id)
    .in("status", ["UNPAID", "PARTIAL", "OVERDUE"]);

  const unpaidRent = (receivables ?? []).reduce(
    (s, r) => s + parseFloat(r.unpaid_amount as string),
    0,
  );

  // 3. Overdue rent — if inspection flagged as overdue
  const dailyRent =
    parseFloat(contract.total_rent_amount as string) > 0
      ? parseFloat(contract.total_rent_amount as string) / 30
      : 0;
  const overdueDays = (inspection.overdue_days as number) ?? 0;
  const overdueRent = inspection.is_overdue ? dailyRent * overdueDays : 0;

  // 4. Late fee — display rule description
  const lateFeeRule = contract.late_fee_rule as Record<string, unknown> | null;
  const lateFeeDesc = lateFeeRule
    ? (lateFeeRule.description as string) ?? "按日0.5%计算"
    : "按日0.5%计算";
  const lateFee = overdueRent * 0.005; // 0.5% per day of overdue rent

  // 5. Penalty — display rule description
  const penaltyRule = contract.penalty_rule as Record<string, unknown> | null;
  const penaltyDesc = penaltyRule
    ? (penaltyRule.description as string) ?? "按合同违约金规则"
    : "按合同违约金规则";
  const penalty = penaltyRule
    ? parseFloat((penaltyRule.rate as string) ?? "0") * 0.01 * parseFloat(contract.total_rent_amount as string)
    : parseFloat(contract.total_rent_amount as string) * 0.05; // default 5%

  // 6. Damage compensation
  const damageCompensation = inspection.is_damaged
    ? parseFloat((inspection.repair_estimate as string) ?? "0") * 0.5
    : 0;

  // 7. Missing parts compensation
  const missingPartsComp = inspection.is_missing_parts
    ? parseFloat((inspection.repair_estimate as string) ?? "0") * 0.3
    : 0;

  // 8. Cleaning fee
  const cleaningFee = inspection.is_dirty ? 200 : 0; // flat 200 CNY

  // 9. Repair fee
  const repairFee = inspection.needs_repair
    ? parseFloat((inspection.repair_estimate as string) ?? "0")
    : 0;

  // 10. Total deduction
  const totalDeduction =
    unpaidRent +
    overdueRent +
    lateFee +
    penalty +
    damageCompensation +
    missingPartsComp +
    cleaningFee +
    repairFee;

  // 11. Deposit balance
  const { data: deposit } = await supabase
    .from("deposit_record")
    .select("available_amount")
    .eq("contract_id", inspection.contract_id)
    .maybeSingle();

  const depositBalance = deposit
    ? parseFloat(deposit.available_amount as string)
    : parseFloat(contract.deposit_amount as string);

  // 12. Refund vs additional charge
  const refundAmount = depositBalance > totalDeduction
    ? depositBalance - totalDeduction
    : 0;
  const additionalCharge = totalDeduction > depositBalance
    ? totalDeduction - depositBalance
    : 0;

  return {
    data: {
      inspectionId: inspection.id as string,
      inspectionNo: inspection.inspection_no as string,
      contractId: inspection.contract_id as string,
      contractNo: contract.contract_no,
      customerId: inspection.customer_id as string,
      customerName: customer?.name ?? "-",
      unpaidRent,
      overdueRent,
      lateFee,
      lateFeeDesc,
      penalty,
      penaltyDesc,
      damageCompensation,
      missingPartsComp,
      cleaningFee,
      repairFee,
      totalDeduction,
      depositBalance,
      refundAmount,
      additionalCharge,
    },
  };
}

// ─── Preview Settlement ─────────────────────────────────────────────────────

export async function previewSettlement(
  inspectionId: string,
): Promise<ActionResult<SettlementPreviewData>> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("return_settlement")
    .select("id")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "该验收记录已完成结算" };
  }

  const result = await calculateSettlement(supabase, inspectionId);
  if (result.error) return { success: false, error: result.error };

  return { success: true, data: result.data };
}

// ─── Confirm Settlement ─────────────────────────────────────────────────────

export async function confirmSettlement(
  formData: FormData,
): Promise<ActionResult<{ settlementNo: string } | null>> {
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

  const inspectionId = formData.get("inspectionId") as string;
  if (!inspectionId) return { success: false, error: "缺少验收记录ID" };

  // Validate inspection exists and hasn't been settled
  const { data: existingSettlement } = await supabase
    .from("return_settlement")
    .select("id, settlement_no")
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  if (existingSettlement) {
    return {
      success: false,
      error: `该验收记录已完成结算（结算单号：${existingSettlement.settlement_no}）`,
    };
  }

  const { data: inspection } = await supabase
    .from("return_inspection")
    .select("*, contract:contract_id(contract_no, total_rent_amount, deposit_amount)")
    .eq("id", inspectionId)
    .single();

  if (!inspection) return { success: false, error: "验收记录不存在" };

  // Recalculate settlement amounts on the server
  const calc = await calculateSettlement(supabase, inspectionId);
  if (calc.error) return { success: false, error: calc.error };
  const preview = calc.data;

  // Generate settlement number
  const settlementNo = generateNo("RS");

  // 1. Create return_settlement record
  const { error: insertErr } = await supabase.from("return_settlement").insert({
    settlement_no: settlementNo,
    inspection_id: inspectionId,
    contract_id: preview.contractId,
    order_id: inspection.order_id,
    customer_id: preview.customerId,
    unpaid_rent: preview.unpaidRent,
    overdue_rent: preview.overdueRent,
    late_fee: preview.lateFee,
    penalty: preview.penalty,
    damage_compensation: preview.damageCompensation,
    missing_parts_comp: preview.missingPartsComp,
    cleaning_fee: preview.cleaningFee,
    repair_fee: preview.repairFee,
    total_deduction: preview.totalDeduction,
    deposit_balance: preview.depositBalance,
    refund_amount: preview.refundAmount,
    additional_charge: preview.additionalCharge,
    settlement_status: preview.refundAmount > 0
      ? "REFUND_PENDING"
      : preview.additionalCharge > 0
        ? "CHARGE_PENDING"
        : "COMPLETED",
    remark: (formData.get("remark") as string) ?? null,
    created_by: profile.id,
  });

  if (insertErr) {
    return { success: false, error: `创建结算单失败: ${insertErr.message}` };
  }

  // 2. Update deposit record — deduct from available_amount
  const { data: deposit } = await supabase
    .from("deposit_record")
    .select("id, deducted_amount, refunded_amount, available_amount")
    .eq("contract_id", preview.contractId)
    .maybeSingle();

  if (deposit) {
    const currentDeducted = parseFloat(deposit.deducted_amount as string) || 0;
    const currentAvailable = parseFloat(deposit.available_amount as string) || 0;
    const deduction = Math.min(currentAvailable, preview.totalDeduction);

    const newDeducted = currentDeducted + deduction;
    const newAvailable = currentAvailable - deduction;

    const depositUpdate: Record<string, unknown> = {
      deducted_amount: newDeducted,
      available_amount: newAvailable,
      updated_at: new Date().toISOString(),
    };

    if (newAvailable <= 0 && preview.additionalCharge > 0) {
      depositUpdate.deposit_status = "FULLY_DEDUCTED";
    } else if (deduction > 0) {
      depositUpdate.deposit_status = "PARTIALLY_DEDUCTED";
    }

    await supabase
      .from("deposit_record")
      .update(depositUpdate)
      .eq("id", deposit.id);
  }

  // 3. Create refund record if refund_amount > 0
  if (preview.refundAmount > 0) {
    const refundNo = generateNo("RF");
    const { error: refundErr } = await supabase.from("refund_record").insert({
      refund_no: refundNo,
      customer_id: preview.customerId,
      deposit_id: deposit?.id ?? null,
      order_id: inspection.order_id,
      contract_id: preview.contractId,
      refund_amount: preview.refundAmount,
      refund_method: "BANK_TRANSFER",
      refund_status: "PENDING_APPROVAL",
      reason: "退租结算退款",
      created_by: profile.id,
    });

    if (refundErr) {
      // Non-fatal: log but don't rollback settlement
      console.error("Failed to create refund record:", refundErr.message);
    }
  }

  // 4. Create additional receivable if additional_charge > 0
  if (preview.additionalCharge > 0) {
    const receivableNo = generateNo("RC");
    const { error: recvErr } = await supabase.from("receivable").insert({
      receivable_no: receivableNo,
      customer_id: preview.customerId,
      order_id: inspection.order_id,
      contract_id: preview.contractId,
      receivable_type: "DAMAGE",
      amount: preview.additionalCharge,
      paid_amount: 0,
      unpaid_amount: preview.additionalCharge,
      status: "UNPAID",
      due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days
      created_by: profile.id,
    });

    if (recvErr) {
      console.error("Failed to create receivable:", recvErr.message);
    }
  }

  // 5. Update contract status if applicable
  await supabase
    .from("rental_contract")
    .update({
      contract_status: "TERMINATED",
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", preview.contractId)
    .in("contract_status", ["ACTIVE", "EXPIRED"]);

  // 6. Update order status
  await supabase
    .from("rental_order")
    .update({
      order_status: "COMPLETED",
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("id", inspection.order_id)
    .in("order_status", ["IN_PROGRESS", "PARTIAL_RETURN", "OVERDUE"]);

  // 7. Audit log
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "SETTLEMENT_CONFIRM",
    resource_type: "RETURN_SETTLEMENT",
    resource_id: settlementNo,
    detail: {
      inspection_id: inspectionId,
      total_deduction: preview.totalDeduction,
      refund_amount: preview.refundAmount,
      additional_charge: preview.additionalCharge,
    },
  });

  revalidatePath("/finance/settlement");
  revalidatePath(`/finance/settlement/${inspectionId}`);
  revalidatePath(`/sales/contracts/${preview.contractId}`);

  return { success: true, data: { settlementNo } };
}
