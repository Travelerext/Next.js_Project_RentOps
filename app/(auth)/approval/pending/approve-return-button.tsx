"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveReturnRequest } from "@/lib/actions/return-request";

export function ApproveReturnButton({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button size="sm" variant="primary" disabled={loading} onClick={async () => {
      setLoading(true);
      await approveReturnRequest(requestId);
      router.refresh();
      setLoading(false);
    }}>{loading ? "..." : "通过"}</Button>
  );
}
