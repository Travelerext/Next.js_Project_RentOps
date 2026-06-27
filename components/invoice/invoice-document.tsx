import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  SPECIAL_VAT: "增值税专用发票",
  NORMAL_VAT: "增值税普通发票",
  ELECTRONIC_NORMAL: "电子普通发票",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ISSUED: "已开票",
  VOID: "已作废",
};

export const INVOICE_STATUS_VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  ISSUED: "success",
  VOID: "default",
};

export interface InvoiceLine {
  name?: string;
  specification?: string;
  quantity?: number | string;
  unit_price?: number | string;
  amount?: number | string;
  pricing_mode?: string;
}

export interface InvoiceDocumentData {
  id: string;
  invoice_no: string;
  invoice_type: string;
  invoice_status: string;
  title: string;
  tax_no: string | null;
  address_phone: string | null;
  bank_account: string | null;
  amount_without_tax: string | number;
  tax_rate: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  item_snapshot: unknown;
  issued_at: string;
  remark: string | null;
  customer?: { name?: string | null } | null;
  order?: { order_no?: string | null } | null;
  contract?: { contract_no?: string | null } | null;
}

function asLines(value: unknown): InvoiceLine[] {
  return Array.isArray(value) ? (value as InvoiceLine[]) : [];
}

function toPercent(value: string | number) {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const lines = asLines(invoice.item_snapshot);

  return (
    <section
      data-invoice-document={invoice.id}
      className="invoice-document rounded-lg border border-zinc-200 bg-white p-5 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-zinc-500">{INVOICE_TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal">发票</h2>
          <p className="mt-1 font-mono text-sm text-zinc-500">{invoice.invoice_no}</p>
        </div>
        <div className="text-left sm:text-right">
          <Badge variant={INVOICE_STATUS_VARIANTS[invoice.invoice_status] ?? "default"}>
            {INVOICE_STATUS_LABELS[invoice.invoice_status] ?? invoice.invoice_status}
          </Badge>
          <p className="mt-2 text-sm text-zinc-500">开票日期：{formatDate(invoice.issued_at)}</p>
        </div>
      </div>

      <div className="grid gap-4 border-b border-zinc-200 py-4 text-sm dark:border-zinc-700 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">购买方</p>
          <p className="font-semibold">{invoice.title}</p>
          <p>税号：{invoice.tax_no || "-"}</p>
          <p>地址电话：{invoice.address_phone || "-"}</p>
          <p>开户行及账号：{invoice.bank_account || "-"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">关联业务</p>
          <p>客户：{invoice.customer?.name ?? invoice.title}</p>
          <p>订单：{invoice.order?.order_no ?? "-"}</p>
          <p>合同：{invoice.contract?.contract_no ?? "-"}</p>
        </div>
      </div>

      <div className="overflow-x-auto py-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
              <th className="py-2 pr-3 font-medium">项目</th>
              <th className="px-3 py-2 font-medium">规格/编号</th>
              <th className="px-3 py-2 text-right font-medium">数量</th>
              <th className="px-3 py-2 text-right font-medium">单价</th>
              <th className="py-2 pl-3 text-right font-medium">金额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lines.map((line, index) => (
              <tr key={`${line.name ?? "line"}-${index}`}>
                <td className="py-2 pr-3">{line.name ?? "-"}</td>
                <td className="px-3 py-2 text-zinc-500">{line.specification || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{line.quantity ?? "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(String(line.unit_price ?? 0))}</td>
                <td className="py-2 pl-3 text-right tabular-nums font-medium">{formatCurrency(String(line.amount ?? 0))}</td>
              </tr>
            ))}
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-500">暂无明细</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-700 sm:grid-cols-2">
        <div className="text-zinc-500">
          <p>备注：{invoice.remark || "-"}</p>
        </div>
        <div className="space-y-1 sm:ml-auto sm:min-w-[260px]">
          <div className="flex justify-between gap-6"><span>不含税金额</span><span className="tabular-nums">{formatCurrency(invoice.amount_without_tax)}</span></div>
          <div className="flex justify-between gap-6"><span>税率</span><span className="tabular-nums">{toPercent(invoice.tax_rate)}</span></div>
          <div className="flex justify-between gap-6"><span>税额</span><span className="tabular-nums">{formatCurrency(invoice.tax_amount)}</span></div>
          <div className="flex justify-between gap-6 border-t border-zinc-200 pt-2 text-base font-semibold dark:border-zinc-700">
            <span>价税合计</span>
            <span className="tabular-nums">{formatCurrency(invoice.total_amount)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
