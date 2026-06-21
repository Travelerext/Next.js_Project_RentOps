"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lockOrdering, unlockOrdering } from "@/lib/actions/customer";

interface LockCustomerButtonProps {
  customerId: string;
  isLocked: boolean;
}

export function LockCustomerButton({
  customerId,
  isLocked,
}: LockCustomerButtonProps) {
  const router = useRouter();
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLock = useCallback(async () => {
    if (!reason) return;
    setLoading(true);
    await lockOrdering(customerId, reason);
    router.refresh();
    setLoading(false);
    setShowReason(false);
    setReason("");
  }, [customerId, reason, router]);

  const handleUnlock = useCallback(async () => {
    setLoading(true);
    await unlockOrdering(customerId);
    router.refresh();
    setLoading(false);
  }, [customerId, router]);

  if (isLocked) {
    return (
      <Button variant="outline" onClick={handleUnlock} disabled={loading}>
        {loading ? "处理中..." : "解锁"}
      </Button>
    );
  }

  if (showReason) {
    return (
      <div className="flex items-center gap-2">
        <Input
          placeholder="锁单原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-48"
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleLock}
          disabled={loading || !reason}
        >
          确认锁单
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReason(false)}
        >
          取消
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="destructive"
      onClick={() => setShowReason(true)}
    >
      锁单
    </Button>
  );
}
