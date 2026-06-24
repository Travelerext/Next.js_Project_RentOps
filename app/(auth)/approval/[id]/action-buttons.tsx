"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveRequest, rejectRequest } from "@/lib/actions/approval";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const handleApprove = useCallback(async () => {
    setLoading(true);
    const result = await approveRequest(approvalId, "同意");
    if (result.success) {
      startTransition(() => router.refresh());
    }
    setLoading(false);
  }, [approvalId, router, startTransition]);

  const handleReject = useCallback(async () => {
    const reason = prompt("请输入拒绝原因:");
    if (reason === null) return;
    setLoading(true);
    const result = await rejectRequest(approvalId, reason || undefined);
    if (result.success) {
      startTransition(() => router.refresh());
    }
    setLoading(false);
  }, [approvalId, router, startTransition]);

  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" onClick={handleApprove} disabled={loading}>
        {loading ? "处理中..." : "通过审批"}
      </Button>
      <Button variant="destructive" onClick={handleReject} disabled={loading}>
        {loading ? "处理中..." : "拒绝审批"}
      </Button>
    </div>
  );
}
