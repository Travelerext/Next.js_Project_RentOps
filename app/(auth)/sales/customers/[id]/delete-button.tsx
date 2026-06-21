"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteCustomer } from "@/lib/actions/customer";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!confirming) { setConfirming(true); return; }
    setLoading(true);
    const result = await deleteCustomer(customerId);
    if (result.success) {
      router.push("/sales/customers");
      router.refresh();
    } else {
      alert(result.error);
      setConfirming(false);
      setLoading(false);
    }
  }, [customerId, router, confirming]);

  return (
    <Button
      variant={confirming ? "destructive" : "outline"}
      size="sm"
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />删除中...</> : confirming ? "确认删除？" : <><Trash2 className="h-4 w-4" />删除客户</>}
    </Button>
  );
}
