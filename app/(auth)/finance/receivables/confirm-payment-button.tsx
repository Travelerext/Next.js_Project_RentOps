"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { confirmPayment } from "@/lib/actions/finance";

const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "银行转账" },
  { value: "CASH", label: "现金" },
  { value: "WECHAT", label: "微信" },
  { value: "ALIPAY", label: "支付宝" },
  { value: "CHECK", label: "支票" },
];

interface Props {
  receivableId: string;
  receivableNo: string;
  unpaidAmount: string;
}

export function ConfirmPaymentButton({
  receivableId,
  receivableNo,
  unpaidAmount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const router = useRouter();

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      setFieldErrors(null);

      const formData = new FormData(e.currentTarget);
      formData.set("receivableId", receivableId);

      const result = await confirmPayment(formData);

      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "收款确认失败");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }

      setSubmitting(false);
    },
    [receivableId, router],
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        确认收款
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`确认收款 - ${receivableNo}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="收款金额"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={unpaidAmount}
            defaultValue={unpaidAmount}
            error={fieldErrors?.amount?.[0]}
            required
          />

          <Select
            label="付款方式"
            name="paymentMethod"
            options={PAYMENT_METHODS}
            defaultValue="BANK_TRANSFER"
          />

          <Input
            label="付款人"
            name="payerName"
            placeholder="付款人姓名（可选）"
          />

          <Input
            label="银行流水号"
            name="bankFlowNo"
            placeholder="银行流水号（可选）"
          />

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={submitting}
            >
              {submitting ? "处理中..." : "确认收款"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
