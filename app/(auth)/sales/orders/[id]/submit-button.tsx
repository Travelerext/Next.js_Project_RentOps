"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitOrder } from "@/lib/actions/rental-order";

export function SubmitOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const handleSubmit = useCallback(async () => {
    if (!confirm("确认提交订单？提交后订单将提交给业务主管审批。")) return;
    setLoading(true);
    setError("");
    const result = await submitOrder(orderId);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
    } else {
      startTransition(() => {
        router.refresh();
        setLoading(false);
      });
    }
  }, [orderId, router, startTransition]);

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={handleSubmit} disabled={loading}>
        {loading ? "提交中..." : "提交订单"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
