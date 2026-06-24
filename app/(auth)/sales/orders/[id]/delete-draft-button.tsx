"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteDraftOrder } from "@/lib/actions/rental-order";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteDraftButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    const result = await deleteDraftOrder(orderId);
    if (result.success) {
      router.push("/sales/orders");
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
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />删除中...</> : confirming ? "确认删除？" : <><Trash2 className="h-4 w-4" />删除草稿</>}
    </Button>
  );
}
