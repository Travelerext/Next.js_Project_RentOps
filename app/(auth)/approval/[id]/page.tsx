import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { formatDateTime, formatDate, formatCurrency } from "@/lib/utils";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { ApprovalActions } from "./action-buttons";
import {
  Clock,
  FileText,
  Building2,
  ShoppingCart,
  FileSignature,
  Percent,
  CreditCard,
  Trash2,
  AlertCircle,
} from "lucide-react";

// ─── Labels ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "已提交",
  IN_PROGRESS: "审批中",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  CANCELLED: "已取消",
};

const STATUS_VARIANTS: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  SUBMITTED: "warning",
  IN_PROGRESS: "info",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "default",
};

const TYPE_LABELS: Record<string, string> = {
  ORDER_CREATE: "订单创建",
  ORDER_APPROVAL: "订单审批",
  ORDER_MODIFY: "订单修改",
  ORDER_TERMINATE: "订单终止",
  CONTRACT_SIGN: "合同签署",
  REFUND: "退款申请",
  DISCOUNT: "折扣申请",
  CREDIT: "信用调整",
  SCRAP: "报废申请",
  OTHER: "其他",
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  ORDER_CREATE: ShoppingCart,
  ORDER_MODIFY: ShoppingCart,
  ORDER_TERMINATE: ShoppingCart,
  CONTRACT_SIGN: FileSignature,
  REFUND: Percent,
  DISCOUNT: Percent,
  CREDIT: CreditCard,
  SCRAP: Trash2,
  OTHER: FileText,
};

// ─── Types ────────────────────────────────────────────────────────────

type ApprovalRecord = {
  id: string;
  approval_no: string;
  approval_type: string;
  business_type: string;
  business_id: string;
  applicant_id: string;
  title: string;
  description: string | null;
  approval_config: Record<string, unknown>;
  current_step: number;
  status: string;
  submitted_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  applicant: { display_name: string } | null;
};

type StepRecord = {
  id: string;
  approval_id: string;
  step: number;
  approver_id: string | null;
  action: string | null;
  comment: string | null;
  acted_at: string | null;
  created_at: string;
  approver: { display_name: string } | null;
};

// ══════════════════════════════════════════════════════════════════════

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Current user ───────────────────────────────────────────────────

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get current user's role for approver check
  let currentUserRole = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("primary_role")
      .eq("supabase_user_id", user.id)
      .maybeSingle();
    currentUserRole = profile?.primary_role ?? "";
  }

  // ── Approval request ───────────────────────────────────────────────

  const { data: rawApproval } = await supabase
    .from("approval_request")
    .select("*, applicant:applicant_id(display_name)")
    .eq("id", id)
    .single();

  if (!rawApproval) {
    notFound();
  }

  const approval = rawApproval as unknown as ApprovalRecord;

  // ── Step records ──────────────────────────────────────────────────

  const { data: rawSteps } = await supabase
    .from("approval_step_record")
    .select("*, approver:approver_id(display_name)")
    .eq("approval_id", id)
    .order("step", { ascending: true });

  const steps = (rawSteps ?? []) as unknown as StepRecord[];

  // ── Approver check: match current user's role against the flow config ─
  const flow = (approval.approval_config as { flow?: { step: number; approver_role: string }[] } | null)?.flow ?? [];
  const currentStepConfig = flow.find((s) => s.step === approval.current_step);
  const approverRole = currentStepConfig?.approver_role ?? "MANAGER";

  // MANAGER maps to any manager-type role
  const canApprove =
    currentUserRole === "SYSTEM_ADMIN" ||
    (approverRole === "MANAGER" &&
      ["SALES_MANAGER", "FINANCE_MANAGER", "GENERAL_MANAGER", "APPROVER"].includes(currentUserRole)) ||
    approverRole === currentUserRole;

  // ── Business info ─────────────────────────────────────────────────

  const bType = approval.business_type;
  const bId = approval.business_id;

  const TYPE_ICON = TYPE_ICONS[bType] ?? FileText;
  const TYPE_LABEL = TYPE_LABELS[bType] ?? bType;

  // Fetch order details for order approvals
  let orderInfo: Record<string, unknown> | null = null;
  let orderItems: Record<string, unknown>[] = [];
  if (["ORDER", "ORDER_APPROVAL"].includes(bType)) {
    const { data: ord } = await supabase
      .from("rental_order")
      .select("*, customer:customer_id(name)")
      .eq("id", bId)
      .maybeSingle();
    orderInfo = ord as Record<string, unknown> | null;
    if (orderInfo) {
      const { data: items } = await supabase
        .from("rental_order_item")
        .select("*, equipment:equipment_id(equipment_no, name)")
        .eq("order_id", bId);
      orderItems = (items ?? []) as Record<string, unknown>[];
    }
  }

  // ══════════════════════════════════════════════════════════════════

  const PRICING_LABELS: Record<string, string> = { HOURLY: "按小时", DAILY: "按天", MONTHLY: "按月", FIXED: "固定价", PROJECT_BASED: "按项目" };

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={approval.title}
          subtitle={`${approval.approval_no} · ${TYPE_LABEL}`}
          backUrl="/approval/pending"
          status={
            <Badge
              variant={STATUS_VARIANTS[approval.status] ?? "default"}
            >
              {STATUS_LABELS[approval.status] ?? approval.status}
            </Badge>
          }
        />

        {/* ── 审批信息 ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              审批信息
            </CardTitle>
          </CardHeader>
          <InfoGrid
            items={[
              { label: "审批标题", value: approval.title },
              { label: "审批编号", value: approval.approval_no },
              { label: "审批类型", value: TYPE_LABELS[approval.approval_type] ?? approval.approval_type },
              { label: "申请人", value: approval.applicant?.display_name ?? "-" },
              { label: "提交时间", value: formatDateTime(approval.submitted_at) },
              { label: "当前步骤", value: `第 ${approval.current_step} 步` },
              { label: "描述", value: approval.description ?? "无" },
            ]}
          />
        </Card>

        {/* ── 订单详情 ────────────────────────────────────────────── */}
        {orderInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                订单信息
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm px-4 pb-4 md:px-6">
              <div><span className="text-zinc-500">订单编号</span><p className="font-mono font-medium">
                <Link href={`/sales/orders/${bId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  {orderInfo.order_no as string}
                </Link>
              </p></div>
              <div><span className="text-zinc-500">客户</span><p>{(orderInfo.customer as {name?: string})?.name ?? "-"}</p></div>
              <div><span className="text-zinc-500">计费方式</span><p>{PRICING_LABELS[orderInfo.pricing_mode as string] ?? String(orderInfo.pricing_mode)}</p></div>
              <div><span className="text-zinc-500">计划租期</span><p>{orderInfo.planned_start_at ? `${formatDate(orderInfo.planned_start_at as string)} ~ ${formatDate(orderInfo.planned_end_at as string)}` : "-"}</p></div>
              <div><span className="text-zinc-500">租金总额</span><p className="font-semibold">{formatCurrency(orderInfo.total_rent_amount)}</p></div>
              <div><span className="text-zinc-500">押金</span><p>{formatCurrency(orderInfo.total_deposit_amount)}</p></div>
            </div>
            {orderItems.length > 0 && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 px-4 pb-4 md:px-6">
                <p className="text-xs font-semibold text-zinc-500 uppercase mt-4 mb-2">设备明细</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="py-1.5 text-left text-xs text-zinc-500">设备</th><th className="py-1.5 text-right text-xs text-zinc-500">数量</th><th className="py-1.5 text-right text-xs text-zinc-500">单价</th><th className="py-1.5 text-right text-xs text-zinc-500">租金</th></tr></thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {orderItems.map((item) => (
                      <tr key={item.id as string}>
                        <td className="py-1.5">{(item.equipment as {name?: string})?.name ?? "-"}</td>
                        <td className="py-1.5 text-right">{item.quantity as string}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.actual_unit_price)}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(item.rent_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Fallback business info for non-order types */}
        {!orderInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TYPE_ICON className="h-4 w-4" />
                业务信息
              </CardTitle>
            </CardHeader>
            <InfoGrid items={[{ label: "业务编号", value: bId }]} cols={1} />
          </Card>
        )}

        {/* ── 审批记录 ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              审批记录
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 md:px-6">
            {steps.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                暂无审批记录
              </p>
            ) : (
              <Timeline steps={steps} />
            )}
          </div>
        </Card>

        {/* ── 操作按钮 ────────────────────────────────────────────── */}
        {canApprove && approval.status !== "APPROVED" && approval.status !== "REJECTED" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                操作
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 md:px-6">
              <ApprovalActions approvalId={id} />
            </div>
          </Card>
        )}
      </div>
    </DirectionalTransition>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Business info card helper
// ══════════════════════════════════════════════════════════════════════

function businessInfoRow(
  businessType: string,
  businessId: string
): { label: string; value: React.ReactNode } {
  if (
    ["ORDER_CREATE", "ORDER_MODIFY", "ORDER_TERMINATE"].includes(businessType)
  ) {
    // For simplicity, show the core field — a future enhancement can
    // fetch the order/contract name by ID when a dedicated join helper exists
    return {
      label: "业务编号",
      value: (
        <Link
          href={`/sales/orders/${businessId}`}
          className="font-mono text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {businessId}
        </Link>
      ),
    };
  }

  if (businessType === "CONTRACT_SIGN") {
    return {
      label: "合同编号",
      value: (
        <Link
          href={`/sales/contracts/${businessId}`}
          className="font-mono text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {businessId}
        </Link>
      ),
    };
  }

  return {
    label: "业务编号",
    value: (
      <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
        {businessId}
      </span>
    ),
  };
}

// ══════════════════════════════════════════════════════════════════════
// Timeline sub-component
// ══════════════════════════════════════════════════════════════════════

function Timeline({ steps }: { steps: StepRecord[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const isApproved = step.action === "APPROVE";
        const isRejected = step.action === "REJECT";
        const isPending = step.action === null;

        let dotClass = "bg-zinc-300 dark:bg-zinc-600";
        if (isApproved) dotClass = "bg-emerald-500";
        if (isRejected) dotClass = "bg-red-500";

        return (
          <div key={step.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-medium ${dotClass}`}
              >
                {isApproved ? "✓" : isRejected ? "✗" : String(step.step)}
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              )}
            </div>

            <div className="min-w-0 pb-4">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                第 {step.step} 步
                {isApproved && (
                  <Badge variant="success" className="ml-2">
                    已通过
                  </Badge>
                )}
                {isRejected && (
                  <Badge variant="danger" className="ml-2">
                    已拒绝
                  </Badge>
                )}
                {isPending && (
                  <Badge variant="warning" className="ml-2">
                    待审批
                  </Badge>
                )}
              </p>

              {!isPending ? (
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <span>
                    审批人: {step.approver?.display_name ?? "-"}
                  </span>
                  <span className="mx-2">·</span>
                  <span>{formatDateTime(step.acted_at)}</span>
                  {step.comment && (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                      备注: {step.comment}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-zinc-400">等待审批</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
