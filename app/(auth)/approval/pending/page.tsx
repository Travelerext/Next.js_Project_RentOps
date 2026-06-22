import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { ClipboardList, Check, X } from "lucide-react";
import { ApproveButton } from "./approve-button";
import { RejectButton } from "./reject-button";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  SUBMITTED: "warning", IN_PROGRESS: "info", APPROVED: "success", REJECTED: "danger",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "待审批", IN_PROGRESS: "审批中", APPROVED: "已通过", REJECTED: "已拒绝",
};

const TYPE_LABELS: Record<string, string> = {
  ORDER_APPROVAL: "订单审批", ORDER: "订单审批",
  DISCOUNT: "折扣申请", REFUND: "退款申请",
  CONTRACT_CHANGE: "合同变更", OTHER: "其他",
};

export default async function PendingApprovalsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <DataPage title="待审批">
        <EmptyState icon={ClipboardList} title="请先登录" description="需要登录后才能查看待审批项" />
      </DataPage>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, primary_role")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <DataPage title="待审批" subtitle="请确认账号已分配角色">
        <EmptyState icon={ClipboardList} title="未找到档案" description="请确认账号已分配角色" />
      </DataPage>
    );
  }

  const userRole = profile.primary_role ?? "";

  // Get all pending approvals (RLS already filters by role)
  const { data: allPending } = await supabase
    .from("approval_request")
    .select("*, applicant:applicant_id(display_name)")
    .in("status", ["SUBMITTED", "IN_PROGRESS"])
    .order("created_at", { ascending: false });

  // Filter by role: approval_config.flow[current_step].approver_role must match
  const approvals = ((allPending ?? []) as Record<string, unknown>[]).filter((a) => {
    if (userRole === "SYSTEM_ADMIN") return true;
    const config = a.approval_config as { flow?: { step: number; approver_role: string }[] } | null;
    const flow = config?.flow ?? [];
    const currentStep = (a.current_step as number) || 1;
    const stepConfig = flow.find((s) => s.step === currentStep);
    if (!stepConfig) return false;
    // Map role names: MANAGER matches all approver-capable roles
    if (stepConfig.approver_role === "MANAGER") {
      return ["SALES_MANAGER", "FINANCE_MANAGER", "GENERAL_MANAGER", "APPROVER", "SYSTEM_ADMIN"].includes(userRole);
    }
    return stepConfig.approver_role === userRole;
  });

  if (approvals.length === 0) {
    return (
      <DataPage title="待审批" subtitle="所有审批任务已处理完毕，暂无待办事项">
        <EmptyState icon={ClipboardList} title="暂无待审批项" description="所有审批任务已处理完毕，暂无待办事项" />
      </DataPage>
    );
  }

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "审批编号", cell: (a) => <span className="font-mono text-sm">{a.approval_no as string}</span>, shareIdentity: (a) => `approval-${a.id}` },
    { id: "type", header: "类型", cell: (a) => <Badge variant="info">{TYPE_LABELS[a.approval_type as string] ?? (a.approval_type as string)}</Badge> },
    { id: "title", header: "标题", cell: (a) => <span className="font-medium">{a.title as string}</span> },
    { id: "applicant", header: "申请人", cell: (a) => ((a.applicant as unknown as { display_name: string } | null)?.display_name ?? "-") },
    { id: "time", header: "提交时间", cell: (a) => formatDate(a.created_at as string) },
    { id: "status", header: "状态", cell: (a) => <Badge variant={STATUS_VARIANT[a.status as string] ?? "default"}>{STATUS_LABELS[a.status as string] ?? String(a.status)}</Badge> },
    { id: "actions", header: "操作", cell: (a) => (
      <div className="flex gap-1">
        <ApproveButton approvalId={a.id as string} />
        <RejectButton approvalId={a.id as string} />
      </div>
    )},
  ];

  return (
    <DataPage title="待审批" subtitle={`共 ${approvals.length} 项待处理`} empty={false}>
      <DataTable columns={columns} data={approvals} keyExtractor={(a) => a.id as string} rowHref={(a) => `/approval/${a.id}`} emptyMessage="暂无待审批项" />
    </DataPage>
  );
}
