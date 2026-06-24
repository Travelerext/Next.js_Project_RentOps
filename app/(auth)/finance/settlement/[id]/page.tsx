import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { SettlementConfirmButton } from "./confirm-button";

// ─── Types ──────────────────────────────────────────────────────────────

interface InspectionFull {
  id: string;
  inspection_no: string;
  order_id: string | null;
  contract_id: string | null;
  inspected_at: string;
  is_overdue: boolean;
  overdue_days: number | null;
  is_damaged: boolean;
  damage_description: string | null;
  is_missing_parts: boolean;
  missing_parts_desc: string | null;
  is_dirty: boolean;
  cleanliness_note: string | null;
  needs_repair: boolean;
  repair_estimate: string | null;
  customer_confirmed: boolean;
  remark: string | null;
  customer: { name: string } | null;
  contract: {
    contract_no: string;
    total_rent_amount: string;
    deposit_amount: string;
    late_fee_rule: Record<string, unknown> | null;
    penalty_rule: Record<string, unknown> | null;
  } | null;
  equipment: { equipment_no: string; name: string } | null;
}

interface SettlementExisting {
  id: string;
  settlement_no: string;
  settlement_status: string;
  unpaid_rent: string;
  overdue_rent: string;
  late_fee: string;
  penalty: string;
  damage_compensation: string;
  missing_parts_comp: string;
  cleaning_fee: string;
  repair_fee: string;
  total_deduction: string;
  deposit_balance: string;
  refund_amount: string;
  additional_charge: string;
  remark: string | null;
}

// ─── Settlement calculation (server-side) ──────────────────────────────

interface SettlementPreview {
  unpaidRent: number;
  overdueRent: number;
  lateFee: number;
  lateFeeDesc: string;
  penalty: number;
  penaltyDesc: string;
  damageCompensation: number;
  missingPartsComp: number;
  cleaningFee: number;
  repairFee: number;
  totalDeduction: number;
  depositBalance: number;
  refundAmount: number;
  additionalCharge: number;
  overpaidRent: number;
}

async function calculatePreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspection: InspectionFull,
): Promise<SettlementPreview> {
  const contract = inspection.contract;

  // All receivables for this contract (including PAID ones — for early return refund)
  const { data: allReceivables } = await supabase
    .from("receivable")
    .select("amount, paid_amount, unpaid_amount, status")
    .eq("contract_id", inspection.contract_id);

  // Unpaid rent
  const unpaidRent = (allReceivables ?? [])
    .filter(r => ["UNPAID", "PARTIAL", "OVERDUE"].includes(r.status as string))
    .reduce((s, r) => s + parseFloat(r.unpaid_amount as string), 0);

  // Early return: overpaid RENT only (exclude deposit)
  const rentReceivables = (allReceivables ?? [])
    .filter(r => (r.status as string) !== "DEPOSIT" && r.receivable_type !== "DEPOSIT");
  const totalRentPaid = rentReceivables.reduce((s, r) => s + parseFloat(r.paid_amount as string), 0);
  const totalRentAmount = rentReceivables.reduce((s, r) => s + parseFloat(r.amount as string), 0);

  // Calculate prorated rent for actual usage period
  const contractTotalRent = contract ? parseFloat(contract.total_rent_amount) : 0;
  let proratedRentOwed = contractTotalRent;
  if (inspection.contract_id && contractTotalRent > 0) {
    const { data: order } = await supabase
      .from("rental_order").select("planned_start_at, planned_end_at, actual_start_at")
      .eq("id", inspection.order_id).maybeSingle();
    if (order?.planned_start_at && order?.planned_end_at) {
      const plannedStart = new Date(order.planned_start_at as string).getTime();
      const plannedEnd = new Date(order.planned_end_at as string).getTime();
      const plannedDays = Math.max(1, Math.ceil((plannedEnd - plannedStart) / (1000 * 60 * 60 * 24)));
      const actualEnd = new Date(inspection.inspected_at).getTime();
      const actualStart = order.actual_start_at
        ? new Date(order.actual_start_at as string).getTime()
        : plannedStart;
      const actualDays = Math.max(1, Math.ceil((actualEnd - actualStart) / (1000 * 60 * 60 * 24)));
      proratedRentOwed = contractTotalRent * (actualDays / plannedDays);
    }
  }

  // Overpaid rent (early return refund) — rent only, not deposit
  const overpaidRent = Math.max(0, totalRentPaid - proratedRentOwed);

  // Overdue rent
  const dailyRent =
    contract && parseFloat(contract.total_rent_amount) > 0
      ? parseFloat(contract.total_rent_amount) / 30
      : 0;
  const overdueDays = (inspection.overdue_days ?? 0);
  const overdueRent = inspection.is_overdue ? dailyRent * overdueDays : 0;

  // Late fee
  const lateFeeRule = contract?.late_fee_rule ?? null;
  const lateFeeDesc = lateFeeRule
    ? String(lateFeeRule.description ?? "按日0.5%计算")
    : "按日0.5%计算";
  const lateFee = overdueRent * 0.005;

  // Penalty
  const penaltyRule = contract?.penalty_rule ?? null;
  const penaltyDesc = penaltyRule
    ? String(penaltyRule.description ?? "按合同违约金规则")
    : "按合同违约金规则";
  const penalty = penaltyRule
    ? parseFloat(String(penaltyRule.rate ?? "0")) * 0.01 * (contract ? parseFloat(contract.total_rent_amount) : 0)
    : (contract ? parseFloat(contract.total_rent_amount) : 0) * 0.05;

  // Damage compensation
  const repairEstimate = parseFloat(inspection.repair_estimate ?? "0");
  const damageCompensation = inspection.is_damaged ? repairEstimate * 0.5 : 0;
  const missingPartsComp = inspection.is_missing_parts ? repairEstimate * 0.3 : 0;
  const cleaningFee = inspection.is_dirty ? 200 : 0;
  const repairFee = inspection.needs_repair ? repairEstimate : 0;

  const totalDeduction =
    unpaidRent + overdueRent + lateFee + penalty +
    damageCompensation + missingPartsComp + cleaningFee + repairFee;

  // Deposit balance
  const { data: deposit } = await supabase
    .from("deposit_record")
    .select("available_amount")
    .eq("contract_id", inspection.contract_id)
    .maybeSingle();
  const depositBalance = deposit
    ? parseFloat(deposit.available_amount as string)
    : (contract ? parseFloat(contract.deposit_amount) : 0);

  // overpaidRent adds to refundable pool; totalDeduction subtracts from it
  const totalAvailable = depositBalance + overpaidRent;
  const refundAmount = totalAvailable > totalDeduction
    ? totalAvailable - totalDeduction
    : 0;
  const additionalCharge = totalDeduction > totalAvailable
    ? totalDeduction - totalAvailable
    : 0;

  return {
    unpaidRent, overdueRent, lateFee, lateFeeDesc,
    penalty, penaltyDesc,
    damageCompensation, missingPartsComp, cleaningFee, repairFee,
    totalDeduction, depositBalance, refundAmount, additionalCharge,
    overpaidRent,
  };
}

// ─── Line item rows ─────────────────────────────────────────────────────

const SETTLEMENT_LINES = (
  p: SettlementPreview,
  inspection: InspectionFull,
): { label: string; amount: number; note: string; highlight?: boolean }[] => [
  { label: "未付租金", amount: p.unpaidRent, note: "合同关联应收中未付金额" },
  { label: "逾期租金", amount: p.overdueRent, note: inspection.is_overdue ? `逾期 ${inspection.overdue_days ?? 0} 天` : "无逾期" },
  { label: "滞纳金", amount: p.lateFee, note: p.lateFeeDesc },
  { label: "违约金", amount: p.penalty, note: p.penaltyDesc },
  { label: "损坏赔偿", amount: p.damageCompensation, note: inspection.damage_description ?? "-" },
  { label: "缺件赔偿", amount: p.missingPartsComp, note: inspection.missing_parts_desc ?? "-" },
  { label: "清洁费", amount: p.cleaningFee, note: inspection.is_dirty ? "设备污损需清洁" : "无" },
  { label: "维修费", amount: p.repairFee, note: inspection.needs_repair ? `预估 ${formatCurrency(inspection.repair_estimate ?? 0)}` : "无需维修" },
  { label: "多付租金退还", amount: -p.overpaidRent, note: p.overpaidRent > 0 ? "提前退租多付的租金退还客户" : "无", highlight: p.overpaidRent > 0 },
  { label: "扣款合计", amount: p.totalDeduction, note: "", highlight: true },
  { label: "押金余额", amount: p.depositBalance, note: "可用押金余额" },
  { label: "多付租金", amount: p.overpaidRent, note: p.overpaidRent > 0 ? "提前退租可退租金" : "无" },
  { label: "应退金额", amount: p.refundAmount, note: "扣除费用后退还客户", highlight: p.refundAmount > 0 },
  { label: "应补金额", amount: p.additionalCharge, note: "费用超出押金，客户需补缴", highlight: p.additionalCharge > 0 },
];

// ═══════════════════════════════════════════════════════════════════════

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch inspection with joins
  const { data: inspectionRaw, error } = await supabase
    .from("return_inspection")
    .select(
      "*, customer:customer_id(name), contract:contract_id(contract_no, total_rent_amount, deposit_amount, late_fee_rule, penalty_rule), equipment:equipment_id(equipment_no, name)",
    )
    .eq("id", id)
    .single();

  const inspection = inspectionRaw as unknown as InspectionFull | null;

  if (error || !inspection) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">验收记录不存在</p>
          <Link href="/finance/settlement" className="text-blue-600 hover:underline">
            返回结算列表
          </Link>
        </div>
      </DirectionalTransition>
    );
  }

  // Check if settlement already exists
  const { data: existingSettlementRaw } = await supabase
    .from("return_settlement")
    .select("*")
    .eq("inspection_id", id)
    .maybeSingle();

  const existingSettlement = existingSettlementRaw as unknown as SettlementExisting | null;
  const isAlreadySettled = !!existingSettlement;

  // Calculate preview
  const preview = await calculatePreview(supabase, inspection);
  const lines = SETTLEMENT_LINES(preview, inspection);

  // Settlement status display
  const statusLabel = existingSettlement
    ? existingSettlement.settlement_status === "REFUND_PENDING"
      ? "待退款"
      : existingSettlement.settlement_status === "CHARGE_PENDING"
        ? "待补款"
        : existingSettlement.settlement_status === "COMPLETED"
          ? "已完成"
          : existingSettlement.settlement_status
    : "未结算";

  const statusVariant = existingSettlement
    ? existingSettlement.settlement_status === "COMPLETED"
      ? "success" as const
      : existingSettlement.settlement_status === "REFUND_PENDING"
        ? "warning" as const
        : existingSettlement.settlement_status === "CHARGE_PENDING"
          ? "danger" as const
          : "default" as const
    : "default" as const;

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader backUrl="_back"
          title={`结算预览 - ${inspection.inspection_no}`}
          
          status={
            <Badge variant={statusVariant}>
              {isAlreadySettled ? `${statusLabel} (${existingSettlement.settlement_no})` : statusLabel}
            </Badge>
          }
        />

        {/* ── Inspection Info ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>验收信息</CardTitle>
          </CardHeader>
          <InfoGrid
            items={[
              { label: "验收编号", value: inspection.inspection_no },
              { label: "设备", value: inspection.equipment ? `${inspection.equipment.name} (${inspection.equipment.equipment_no})` : "-" },
              { label: "客户", value: inspection.customer ? <Link href={`/sales/customers/${inspection.customer_id}`} className="text-blue-600 hover:underline">{inspection.customer.name}</Link> : "-" },
              { label: "合同编号", value: inspection.contract && inspection.contract_id ? <Link href={`/sales/contracts/${inspection.contract_id}`} className="text-blue-600 hover:underline">{inspection.contract.contract_no}</Link> : "-" },
              { label: "验收日期", value: formatDate(inspection.inspected_at) },
              { label: "是否逾期", value: inspection.is_overdue ? `是（${inspection.overdue_days ?? 0}天）` : "否" },
              {
                label: "验收结果",
                value: [
                  inspection.is_damaged ? "损坏" : null,
                  inspection.is_missing_parts ? "缺件" : null,
                  inspection.is_dirty ? "污损" : null,
                  inspection.needs_repair ? "需维修" : null,
                ]
                  .filter(Boolean)
                  .join("、") || "正常",
              },
              { label: "客户确认", value: inspection.customer_confirmed ? "已确认" : "待确认" },
            ]}
          />
        </Card>

        {/* ── Settlement Line Items ────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>结算明细</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    项目
                  </th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    金额
                  </th>
                  <th className="py-2.5 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {lines.map((line) => (
                  <tr
                    key={line.label}
                    className={
                      line.highlight
                        ? "bg-amber-50/50 dark:bg-amber-900/10 font-semibold"
                        : ""
                    }
                  >
                    <td className="py-2.5 pr-4 text-zinc-700 dark:text-zinc-300">
                      {line.label}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right tabular-nums ${
                        line.highlight
                          ? line.label === "扣款合计"
                            ? "text-red-600 dark:text-red-400"
                            : line.amount > 0
                              ? line.label === "应退金额"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                              : ""
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {line.label === "扣款合计" ||
                      line.label === "押金余额" ||
                      line.label === "应退金额" ||
                      line.label === "应补金额"
                        ? formatCurrency(line.amount)
                        : line.amount > 0
                          ? formatCurrency(line.amount)
                          : "¥0.00"}
                    </td>
                    <td className="py-2.5 pl-4 text-zinc-400 dark:text-zinc-500">
                      {line.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Result summary */}
          {!isAlreadySettled && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {preview.refundAmount > 0 && preview.additionalCharge > 0 ? (
                  <>
                    结算后客户可获退款 <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(preview.refundAmount)}</strong>，
                    同时需补缴 <strong className="text-red-600 dark:text-red-400">{formatCurrency(preview.additionalCharge)}</strong>。
                  </>
                ) : preview.refundAmount > 0 ? (
                  <>
                    结算后押金余额为 <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(preview.refundAmount)}</strong>，
                    将退还给客户。
                  </>
                ) : preview.additionalCharge > 0 ? (
                  <>
                    扣款金额超过押金余额，
                    客户需补缴 <strong className="text-red-600 dark:text-red-400">{formatCurrency(preview.additionalCharge)}</strong>。
                  </>
                ) : (
                  <>扣款金额与押金余额持平，无需退款或补款。</>
                )}
              </p>
            </div>
          )}

          {/* If already settled, show existing settlement info */}
          {isAlreadySettled && existingSettlement && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                结算单 {existingSettlement.settlement_no} 已创建。
                {existingSettlement.refund_amount && parseFloat(existingSettlement.refund_amount) > 0 && (
                  <> 退款金额 {formatCurrency(existingSettlement.refund_amount)}。 <Link href="/finance/refunds" className="underline font-medium">查看退款</Link></>
                )}
                {existingSettlement.additional_charge && parseFloat(existingSettlement.additional_charge) > 0 && (
                  <> 应补金额 {formatCurrency(existingSettlement.additional_charge)}。 <Link href={`/finance/receivables?customerId=${inspection.customer_id}&status=UNPAID`} className="underline font-medium">查看应收</Link></>
                )}
              </p>
            </div>
          )}
        </Card>

        {/* ── Confirm Button ────────────────────────────────────────────── */}
        {!isAlreadySettled && (
          <div className="flex justify-end">
            <SettlementConfirmButton
              inspectionId={id}
              hasRefund={preview.refundAmount > 0}
              hasCharge={preview.additionalCharge > 0}
              customerId={inspection.customer_id}
            />
          </div>
        )}
      </div>
    </DirectionalTransition>
  );
}
