"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Loader2, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { confirmSettlement } from "@/lib/actions/settlement";
import { formatCurrency } from "@/lib/utils";

interface Props {
  inspectionId: string;
  hasRefund: boolean;
  hasCharge: boolean;
  customerId?: string;
}

export function SettlementConfirmButton({ inspectionId, hasRefund, hasCharge, customerId }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set("inspectionId", inspectionId);

    const result = await confirmSettlement(formData);

    if (result.success) {
      setSuccess(`结算完成！结算单号：${result.data?.settlementNo}`);
      setSubmitting(false);
      router.refresh();
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
      >
        <CheckCircle className="h-4 w-4" />
        确认结算
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="确认结算"
      >
        <div className="space-y-4">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            <p className="mb-3">确认后将创建结算单，并执行以下操作：</p>
            <ul className="space-y-2 list-disc pl-5">
              <li>创建退租结算单</li>
              <li>更新押金记录（抵扣/退款）</li>
              {hasRefund && <li>创建退款申请（等待审批）</li>}
              {hasCharge && <li>创建补款应收记录（客户需补缴）</li>}
              <li>更新合同状态为已终止</li>
              <li>更新订单状态为已完成</li>
            </ul>
          </div>

          {hasRefund && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>结算后将产生退款申请，需审批通过后退款。</span>
            </div>
          )}

          {hasCharge && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>押金余额不足以抵扣全部费用，客户需补缴差额。</span>
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
              <div className="flex gap-3">
                {hasRefund && <Link href="/finance/refunds" className="text-blue-600 hover:underline font-medium">查看退款 →</Link>}
                {hasCharge && <Link href={`/finance/receivables?customerId=${customerId ?? ""}&status=UNPAID`} className="text-blue-600 hover:underline font-medium">查看应收 →</Link>}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button
              variant="outline"
              disabled={submitting || !!success}
              onClick={() => setOpen(false)}
            >
              {success ? "关闭" : "取消"}
            </Button>
            {!success && (
              <Button
                variant="primary"
                disabled={submitting}
                onClick={handleConfirm}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  "确认结算"
                )}
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
