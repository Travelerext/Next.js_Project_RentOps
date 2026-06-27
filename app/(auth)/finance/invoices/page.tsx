import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
  INVOICE_TYPE_LABELS,
} from "@/components/invoice/invoice-document";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "ISSUED", label: "已开票" },
  { value: "VOID", label: "已作废" },
];

type InvoiceRow = {
  id: string;
  invoice_no: string;
  invoice_type: string;
  invoice_status: string;
  title: string;
  total_amount: string;
  issued_at: string;
  customer: { name: string } | null;
  order: { order_no: string } | null;
};

export default async function FinanceInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; keyword?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const pageSize = 20;
  const status = sp.status ?? "";
  const keyword = sp.keyword ?? "";

  let query = supabase
    .from("invoice_record")
    .select("id, invoice_no, invoice_type, invoice_status, title, total_amount, issued_at, customer:customer_id(name), order:order_id(order_no)", { count: "exact" });

  if (status) query = query.eq("invoice_status", status);
  if (keyword) query = query.or(`invoice_no.ilike.%${keyword}%,title.ilike.%${keyword}%`);

  const { data, count, error } = await query
    .order("issued_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return <DataPage title="发票管理" error={error.message}><></></DataPage>;
  }

  const invoices = (data ?? []) as unknown as InvoiceRow[];
  const totalPages = Math.ceil((count ?? 0) / pageSize);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (keyword) params.set("keyword", keyword);
  const paginationQuery = params.toString();

  const columns: Column<InvoiceRow>[] = [
    { id: "no", header: "发票号", cell: (i) => <span className="font-mono text-sm">{i.invoice_no}</span> },
    { id: "title", header: "发票抬头", cell: (i) => i.title },
    { id: "customer", header: "客户", cell: (i) => i.customer?.name ?? "-", hideOnMobile: true },
    { id: "order", header: "订单", cell: (i) => i.order?.order_no ?? "-", hideOnMobile: true },
    { id: "type", header: "类型", cell: (i) => INVOICE_TYPE_LABELS[i.invoice_type] ?? i.invoice_type, hideOnMobile: true },
    { id: "amount", header: "价税合计", cell: (i) => <span className="tabular-nums font-medium">{formatCurrency(i.total_amount)}</span>, className: "text-right tabular-nums" },
    { id: "issued", header: "开票日期", cell: (i) => formatDate(i.issued_at) },
    { id: "status", header: "状态", cell: (i) => <Badge variant={INVOICE_STATUS_VARIANTS[i.invoice_status] ?? "default"}>{INVOICE_STATUS_LABELS[i.invoice_status] ?? i.invoice_status}</Badge> },
  ];

  return (
    <DataPage
      title="发票管理"
      subtitle={`共 ${count ?? 0} 张发票`}
      pagination={totalPages > 1 ? { page, totalPages, baseUrl: "/finance/invoices", query: paginationQuery || undefined } : undefined}
      actions={
        <Link href="/finance">
          <Button variant="outline"><FileText className="h-4 w-4" />财务工作台</Button>
        </Link>
      }
      empty={false}
    >
      <form method="GET" className="flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
        <Input name="keyword" label="关键词" placeholder="发票号 / 抬头" defaultValue={keyword} />
        <Select name="status" label="状态" options={STATUS_OPTIONS} defaultValue={status} />
        <Button type="submit">筛选</Button>
        {(status || keyword) ? (
          <Link href="/finance/invoices" className="inline-flex h-10 items-center px-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            重置
          </Link>
        ) : null}
      </form>

      <DataTable
        columns={columns}
        data={invoices}
        keyExtractor={(invoice) => invoice.id}
        rowHref={(invoice) => `/finance/invoices/${invoice.id}`}
        emptyMessage="暂无发票"
      />
    </DataPage>
  );
}
