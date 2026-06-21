"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { activateContract } from "@/lib/actions/contract";

export function ActivateContractButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const handleActivate = useCallback(async () => {
    if (!confirm("确认激活合同？激活后合同将开始履行，并生成应收款项。")) return;
    setLoading(true);
    setError("");
    const result = await activateContract(contractId);
    if (result.success) {
      startTransition(() => router.refresh());
    } else {
      setError(result.error ?? "激活失败");
    }
    setLoading(false);
  }, [contractId, router, startTransition]);

  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" onClick={handleActivate} disabled={loading}>
        {loading ? "激活中..." : "激活合同"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
