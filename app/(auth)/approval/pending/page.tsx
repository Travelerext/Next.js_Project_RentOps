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
    { data: returnData },
  ] = await Promise.all([
    supabase.from("approval_request")
      .select("*, applicant:applicant_id(display_name)")
      .in("status", ["SUBMITTED", "IN_PROGRESS"])
      .order("created_at", { ascending: false }),
    supabase.from("return_request")
      .select("*, customer:customer_id(name), requested_by_profile:requested_by(display_name)")
      .eq("request_status", "PENDING")
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

  // Merge return requests into the same list as approval-like items
  const isReturnApprover = ["SALES_MANAGER", "GENERAL_MANAGER", "APPROVER", "SYSTEM_ADMIN", "FINANCE_MANAGER"].includes(userRole);
  if (isReturnApprover) {
    for (const rr of (returnData ?? [])) {
      const cust = (rr as Record<string, unknown>).customer as { name?: string } | null;
      const appl = (rr as Record<string, unknown>).requested_by_profile as { display_name?: string } | null;
      approvals.push({
        id: rr.id,
        approval_no: (rr as Record<string, unknown>).request_no,
        approval_type: "RETURN",
        title: `退租 - ${cust?.name ?? "-"}`,
        applicant: appl ?? null,
        status: "SUBMITTED",
        created_at: (rr as Record<string, unknown>).created_at,
        _isReturn: true,
      } as Record<string, unknown>);
    }
  }

  if (approvals.length === 0) {
    return (
      <DataPage title="待审批" subtitle="暂无待办事项">
        <EmptyState icon={ClipboardList} title="暂无待审批项" description="所有审批任务已处理完毕" />
      </DataPage>
    );
  }

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "编号", cell: (a) => <span className="font-mono text-sm">{a.approval_no as string}</span> },
    { id: "type", header: "类型", cell: (a) => <Badge variant={a._isReturn ? "warning" : "info"}>{a._isReturn ? "退租审批" : TYPE_LABELS[a.approval_type as string] ?? String(a.approval_type)}</Badge> },
    { id: "title", header: "标题", cell: (a) => <span className="font-medium">{a.title as string}</span> },
    { id: "applicant", header: "申请人", cell: (a) => ((a.applicant as unknown as { display_name?: string } | null)?.display_name ?? "-") },
    { id: "time", header: "提交时间", cell: (a) => formatDate(a.created_at as string) },
    { id: "actions", header: "操作", cell: (a) => {
      if (a._isReturn) {
        return (
          <div className="flex gap-1">
            <ApproveReturnButton requestId={a.id as string} />
            <RejectReturnButton requestId={a.id as string} />
          </div>
        );
      }
      return (
        <div className="flex gap-1">
          <ApproveButton approvalId={a.id as string} />
          <RejectButton approvalId={a.id as string} />
        </div>
      );
    }},
  ];

  return (
    <DataPage title="待审批" subtitle={`共 ${approvals.length} 项待处理`} empty={false}>
      <DataTable columns={columns} data={approvals} keyExtractor={(a) => a.id as string} emptyMessage="暂无待审批项" />
    </DataPage>
  );
}
