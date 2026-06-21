"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createContract } from "@/lib/actions/contract";

export function CreateContractButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = useCallback(async () => {
    if (!confirm("根据此订单创建合同？")) return;
    setLoading(true);
    setError("");
    const result = await createContract(orderId);
    if (result.success) {
      router.push(`/sales/contracts/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }, [orderId, router]);

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={handleCreate} disabled={loading}>
        {loading ? "创建中..." : "创建合同"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
