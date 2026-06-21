"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rejectRequest } from "@/lib/actions/approval";

export function RejectButton({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

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
    <Button variant="destructive" size="sm" onClick={handleReject} disabled={loading}>
      {loading ? "处理中..." : "拒绝"}
    </Button>
  );
}
