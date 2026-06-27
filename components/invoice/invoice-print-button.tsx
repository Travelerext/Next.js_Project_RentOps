"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const printStyles = `
  body { margin: 0; background: #fff; color: #18181b; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
  .invoice-document { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 24px !important; }
  table { border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e4e4e7; }
  @page { size: A4; margin: 14mm; }
`;

export function InvoicePrintButton({ invoiceId }: { invoiceId: string }) {
  function handlePrint() {
    const node = document.querySelector(`[data-invoice-document="${invoiceId}"]`);
    if (!node) return;

    const popup = window.open("", "_blank");
    if (!popup) return;

    popup.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>发票打印</title><style>${printStyles}</style></head><body>${node.outerHTML}</body></html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 200);
  }

  return (
    <Button variant="outline" onClick={handlePrint}>
      <Printer className="h-4 w-4" />
      打印/导出
    </Button>
  );
}
