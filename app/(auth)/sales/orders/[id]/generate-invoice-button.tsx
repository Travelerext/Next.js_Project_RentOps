"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { generateOrderInvoice } from "@/lib/actions/finance";

const INVOICE_TYPES = [
  { value: "SPECIAL_VAT", label: "增值税专用发票" },
  { value: "NORMAL_VAT", label: "增值税普通发票" },
  { value: "ELECTRONIC_NORMAL", label: "电子普通发票" },
];

interface Props {
  orderId: string;
  existingInvoiceId?: string;
  invoiceHrefBase?: string;
  defaults: {
    title?: string | null;
    taxNo?: string | null;
    addressPhone?: string | null;
    bankAccount?: string | null;
  };
}

export function GenerateInvoiceButton({ orderId, existingInvoiceId, invoiceHrefBase = "/finance/invoices", defaults }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors(null);

    const result = await generateOrderInvoice(orderId, new FormData(event.currentTarget));
    if (result.success) {
      setOpen(false);
      router.push(`${invoiceHrefBase}/${result.data.id}`);
      return;
    }

    setError(result.error ?? "发票生成失败");
    setFieldErrors(result.fieldErrors ?? null);
    setSubmitting(false);
  }, [invoiceHrefBase, orderId, router]);

  if (existingInvoiceId) {
    return (
      <Link href={`${invoiceHrefBase}/${existingInvoiceId}`}>
        <Button variant="outline">
          <FileText className="h-4 w-4" />
          查看发票
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" />
        生成发票
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title="生成订单发票">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select name="invoiceType" label="发票类型" options={INVOICE_TYPES} defaultValue="SPECIAL_VAT" />
          <Input
            name="taxRate"
            label="税率"
            type="number"
            min="0"
            max="1"
            step="0.0001"
            defaultValue="0.13"
            error={fieldErrors?.taxRate?.[0]}
          />
          <Input
            name="title"
            label="发票抬头"
            defaultValue={defaults.title ?? ""}
            error={fieldErrors?.title?.[0]}
            required
          />
          <Input name="taxNo" label="纳税人识别号" defaultValue={defaults.taxNo ?? ""} />
          <Input name="addressPhone" label="地址电话" defaultValue={defaults.addressPhone ?? ""} />
          <Input name="bankAccount" label="开户行及账号" defaultValue={defaults.bankAccount ?? ""} />
          <Input name="remark" label="备注" placeholder="可选" />

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
              {submitting ? "生成中..." : "确认生成"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
