"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveRefund, rejectRefund, executeRefund } from "@/lib/actions/finance";

export function ApproveRefundButton({ refundId }: { refundId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" variant="primary" disabled={loading} onClick={async () => {
      setLoading(true);
      await approveRefund(refundId);
      router.refresh();
      setLoading(false);
    }}>{loading ? "..." : "通过"}</Button>
  );
}

export function RejectRefundButton({ refundId }: { refundId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" variant="destructive" disabled={loading} onClick={async () => {
      const reason = prompt("请输入拒绝原因:");
      if (reason === null) return;
      setLoading(true);
      await rejectRefund(refundId, reason);
      router.refresh();
      setLoading(false);
    }}>{loading ? "..." : "拒绝"}</Button>
  );
}

export function ExecuteRefundButton({ refundId }: { refundId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" variant="primary" disabled={loading} onClick={async () => {
      setLoading(true);
      await executeRefund(refundId);
      router.refresh();
      setLoading(false);
    }}>{loading ? "..." : "执行退款"}</Button>
  );
}
