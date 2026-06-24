"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelOrder } from "@/lib/actions/rental-order";
import { X, Loader2 } from "lucide-react";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleCancel = useCallback(async () => {
    if (!confirming) { setConfirming(true); return; }
    if (!confirm("撤销后订单将变为已取消状态，设备将解锁。确定撤销？")) return;
    setLoading(true);
    const result = await cancelOrder(orderId);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
      setConfirming(false);
      setLoading(false);
    }
  }, [orderId, router, confirming]);

  return (
    <Button
      variant={confirming ? "destructive" : "outline"}
      onClick={handleCancel}
      disabled={loading}
    >
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />撤销中...</> : confirming ? "确认撤销？" : <><X className="h-4 w-4" />撤销订单</>}
    </Button>
  );
}
