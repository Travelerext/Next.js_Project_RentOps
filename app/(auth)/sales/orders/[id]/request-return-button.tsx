"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { requestReturn } from "@/lib/actions/return-request";
import { ArrowDownToLine, Loader2 } from "lucide-react";

interface Props {
  orderId?: string;
  contractId?: string;
  customerId: string;
}

export function RequestReturnButton({ orderId, contractId, customerId }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    const fd = new FormData(e.currentTarget);
    if (orderId) fd.set("orderId", orderId);
    if (contractId) fd.set("contractId", contractId);
    fd.set("customerId", customerId);
    const res = await requestReturn(fd);
    if (res.success) {
      setSuccess(true);
      router.refresh();
    } else {
      setError(res.error);
    }
    setSubmitting(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="h-4 w-4" />退租申请
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="退租申请">
        {success ? (
          <div className="space-y-4">
            <p className="text-emerald-600">退租申请已提交，设备管理员将处理归还。</p>
            <Button variant="outline" onClick={() => { setOpen(false); setSuccess(false); }}>关闭</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-zinc-500">提交后将通知设备管理员进行设备归还验收。</p>
            <Input label="退租原因" name="reason" placeholder="如：项目结束、设备闲置、合同到期等" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />提交中...</> : "确认申请"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
