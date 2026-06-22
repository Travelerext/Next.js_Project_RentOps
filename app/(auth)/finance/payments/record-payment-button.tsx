"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { recordPayment } from "@/lib/actions/finance";

const METHODS = [
  { value: "BANK_TRANSFER", label: "银行转账" },
  { value: "CASH", label: "现金" },
  { value: "WECHAT", label: "微信" },
  { value: "ALIPAY", label: "支付宝" },
  { value: "CHECK", label: "支票" },
];
const TYPES = [
  { value: "RENT", label: "租金" }, { value: "DEPOSIT", label: "押金" },
  { value: "REFUND", label: "退款" }, { value: "DAMAGE", label: "损坏赔偿" },
  { value: "OTHER", label: "其他" },
];

export function RecordPaymentButton() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>记录收款</Button>
      <Dialog open={open} onOpenChange={setOpen} title="记录收款">
        <form onSubmit={async (e) => {
          e.preventDefault(); setSubmitting(true); setError(null);
          const fd = new FormData(e.currentTarget);
          const res = await recordPayment(fd);
          if (res.success) { setOpen(false); router.refresh(); }
          else setError(res.error);
          setSubmitting(false);
        }} className="space-y-4">
          <Input label="客户ID" name="customerId" placeholder="输入客户ID" required />
          <Input label="收款金额" name="amount" type="number" step="0.01" min="0.01" required />
          <Select label="收款方式" name="paymentMethod" options={METHODS} defaultValue="BANK_TRANSFER" />
          <Select label="收款类型" name="paymentType" options={TYPES} defaultValue="OTHER" />
          <Input label="付款人" name="payerName" placeholder="付款人姓名（可选）" />
          <Input label="银行流水号" name="bankFlowNo" placeholder="银行流水号（可选）" />
          <Input label="到账日期" name="paidAt" type="date" />
          <Input label="关联应收ID" name="receivableId" placeholder="如需核销应收，填写应收ID" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>{submitting ? "处理中..." : "确认收款"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
