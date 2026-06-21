"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveRequest } from "@/lib/actions/approval";

export function ApproveButton({ approvalId }: { approvalId: string }) {
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

  return (
    <Button variant="primary" size="sm" onClick={handleApprove} disabled={loading}>
      {loading ? "处理中..." : "通过"}
    </Button>
  );
}
