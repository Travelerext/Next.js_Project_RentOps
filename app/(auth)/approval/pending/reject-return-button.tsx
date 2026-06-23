"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rejectReturnRequest } from "@/lib/actions/return-request";

export function RejectReturnButton({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" variant="destructive" disabled={loading} onClick={async () => {
      const reason = prompt("请输入驳回原因:");
      if (reason === null) return;
      setLoading(true);
      await rejectReturnRequest(requestId, reason);
      router.refresh();
      setLoading(false);
    }}>{loading ? "..." : "驳回"}</Button>
  );
}
