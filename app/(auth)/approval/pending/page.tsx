import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import { ApproveButton } from "./approve-button";
import { RejectButton } from "./reject-button";
import { ApproveReturnButton } from "./approve-return-button";
import { RejectReturnButton } from "./reject-return-button";

const TYPE_LABELS: Record<string, string> = {
  ORDER_APPROVAL: "订单审批", ORDER: "订单审批",
  DISCOUNT: "折扣申请", REFUND: "退款申请",
  CONTRACT_CHANGE: "合同变更", OTHER: "其他",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  SUBMITTED: "warning", IN_PROGRESS: "info", APPROVED: "success", REJECTED: "danger",
};
const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "待审批", IN_PROGRESS: "审批中", APPROVED: "已通过", REJECTED: "已拒绝",
};

export default async function PendingApprovalsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <DataPage title="待审批"><EmptyState icon={ClipboardList} title="请先登录" /></DataPage>;
  }

  const { data: profile } = await supabase
    .from("profiles").select("id, primary_role")
    .eq("supabase_user_id", user.id).maybeSingle();
  if (!profile?.id) {
    return <DataPage title="待审批"><EmptyState icon={ClipboardList} title="未找到档案" /></DataPage>;
  }

  const userRole = profile.primary_role ?? "";

  // Fetch both in parallel
  const [
    { data: approvalData },
    { data: returnData, error: returnError },
  ] = await Promise.all([
    supabase.from("approval_request")
      .select("*, applicant:applicant_id(display_name)")
      .in("status", ["SUBMITTED", "IN_PROGRESS"])
      .order("created_at", { ascending: false }),
    supabase.from("return_request")
      .select("*, customer:customer_id(name), requested_by_profile:requested_by(display_name)")
      .eq("request_status", "PENDING_APPROVAL")
      .order("created_at", { ascending: false }),
  ]);

  // Filter approval requests by role
  const approvals = ((approvalData ?? []) as Record<string, unknown>[]).filter((a) => {
    if (userRole === "SYSTEM_ADMIN") return true;
    const config = a.approval_config as { flow?: { step: number; approver_role: string }[] } | null;
    const flow = config?.flow ?? [];
    const currentStep = (a.current_step as number) || 1;
    const stepConfig = flow.find((s) => s.step === currentStep);
    if (!stepConfig) return false;
    if (stepConfig.approver_role === "MANAGER") {
      return ["SALES_MANAGER", "FINANCE_MANAGER", "GENERAL_MANAGER", "APPROVER", "SYSTEM_ADMIN"].includes(userRole);
    }
    return stepConfig.approver_role === userRole;
  });

  // Return requests — visible to managers + approvers
  const isReturnApprover = ["SALES_MANAGER", "GENERAL_MANAGER", "APPROVER", "SYSTEM_ADMIN", "FINANCE_MANAGER"].includes(userRole);
  const returns = isReturnApprover ? ((returnData ?? []) as Record<string, unknown>[]) : [];
  const hasReturns = returns.length > 0;

  const total = approvals.length + returns.length;
  if (total === 0) {
    return (
      <DataPage title="待审批" subtitle="暂无待办事项">
        <EmptyState icon={ClipboardList} title="暂无待审批项" description="所有审批任务已处理完毕" />
      </DataPage>
    );
  }

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "编号", cell: (a) => <span className="font-mono text-sm">{a.approval_no as string}</span> },
    { id: "type", header: "类型", cell: (a) => <Badge variant="info">{TYPE_LABELS[a.approval_type as string] ?? String(a.approval_type)}</Badge> },
    { id: "title", header: "标题", cell: (a) => <span className="font-medium">{a.title as string}</span> },
    { id: "applicant", header: "申请人", cell: (a) => ((a.applicant as unknown as { display_name?: string } | null)?.display_name ?? "-") },
    { id: "time", header: "提交时间", cell: (a) => formatDate(a.created_at as string) },
    { id: "status", header: "状态", cell: (a) => <Badge variant={STATUS_VARIANT[a.status as string] ?? "default"}>{STATUS_LABELS[a.status as string] ?? String(a.status)}</Badge> },
    { id: "actions", header: "操作", cell: (a) => (
      <div className="flex gap-1">
        <ApproveButton approvalId={a.id as string} />
        <RejectButton approvalId={a.id as string} />
      </div>
    )},
  ];

  const returnColumns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "申请编号", cell: (r) => <span className="font-mono text-sm">{r.request_no as string}</span> },
    { id: "customer", header: "客户", cell: (r) => ((r.customer as unknown as { name?: string } | null)?.name ?? "-") },
    { id: "reason", header: "原因", cell: (r) => (r.reason as string) ?? "-" },
    { id: "applicant", header: "申请人", cell: (r) => ((r.requested_by_profile as unknown as { display_name?: string } | null)?.display_name ?? "-") },
    { id: "time", header: "创建时间", cell: (r) => formatDate(r.created_at as string) },
    { id: "actions", header: "操作", cell: (r) => (
      <div className="flex gap-1">
        <ApproveReturnButton requestId={r.id as string} />
        <RejectReturnButton requestId={r.id as string} />
      </div>
    )},
  ];

  return (
    <DataPage title="待审批" subtitle={`共 ${total} 项待处理`} empty={false}>
      {approvals.length > 0 && (
        <DataTable columns={columns} data={approvals} keyExtractor={(a) => a.id as string} emptyMessage="暂无审批项" />
      )}
      {hasReturns && (
        <>
          <h3 className="text-sm font-semibold text-zinc-500 mt-6 mb-2">退租审批</h3>
          <DataTable columns={returnColumns} data={returns} keyExtractor={(r) => r.id as string} emptyMessage="暂无退租审批" />
        </>
      )}
    </DataPage>
  );
}
