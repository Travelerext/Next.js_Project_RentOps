import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS, ORDER_STATUS_VARIANTS } from "@/lib/constants";
import { GenerateInvoiceButton } from "@/app/(auth)/sales/orders/[id]/generate-invoice-button";

type OrderRow = {
  id: string;
  order_no: string;
  order_status: string;
  total_rent_amount: string | number;
  created_at: string;
  customer: {
    name: string;
    tax_no: string | null;
    invoice_title: string | null;
    invoice_address_phone: string | null;
    invoice_bank_account: string | null;
  } | null;
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; keyword?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const keyword = sp.keyword ?? "";
  const pageSize = 20;

  // Map order_id → invoice_id for orders that already have an invoice
  const { data: invoiced } = await supabase
    .from("invoice_record")
    .select("id, order_id")
    .not("order_id", "is", null);
  const invoiceByOrder = new Map<string, string>();
  for (const r of invoiced ?? []) {
    if (r.order_id) invoiceByOrder.set(r.order_id as string, r.id as string);
  }

  let query = supabase
    .from("rental_order")
    .select(
      "id, order_no, order_status, total_rent_amount, created_at, customer:customer_id(name, tax_no, invoice_title, invoice_address_phone, invoice_bank_account)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .not("order_status", "in", "(DRAFT,CANCELLED)");

  if (keyword) {
    query = query.or(`order_no.ilike.%${keyword}%,customer.name.ilike.%${keyword}%`);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return <DataPage title="添加发票" error={error.message}><></></DataPage>;
  }

  const orders = (data ?? []) as unknown as OrderRow[];
  const totalPages = Math.ceil((count ?? 0) / pageSize);
  const paginationQuery = keyword ? `keyword=${encodeURIComponent(keyword)}` : undefined;

  const columns: Column<OrderRow>[] = [
    { id: "no", header: "订单编号", cell: (o) => <span className="font-mono text-sm">{o.order_no}</span> },
    { id: "customer", header: "客户", cell: (o) => o.customer?.name ?? "-" },
    { id: "amount", header: "租金总额", cell: (o) => <span className="tabular-nums font-medium">{formatCurrency(o.total_rent_amount)}</span>, className: "text-right tabular-nums" },
    { id: "status", header: "状态", cell: (o) => <Badge variant={(ORDER_STATUS_VARIANTS[o.order_status] ?? "default") as "success" | "warning" | "danger" | "info" | "default"}>{ORDER_STATUS[o.order_status] ?? o.order_status}</Badge>, hideOnMobile: true },
    { id: "created", header: "创建时间", cell: (o) => formatDate(o.created_at), hideOnMobile: true },
    {
      id: "action",
      header: "操作",
      cell: (o) => (
        <GenerateInvoiceButton
          orderId={o.id}
          existingInvoiceId={invoiceByOrder.get(o.id)}
          defaults={{
            title: o.customer?.invoice_title ?? o.customer?.name,
            taxNo: o.customer?.tax_no,
            addressPhone: o.customer?.invoice_address_phone,
            bankAccount: o.customer?.invoice_bank_account,
          }}
        />
      ),
      className: "text-right",
    },
  ];

  return (
    <DataPage
      title="新增发票"
      subtitle="选择一个订单生成发票，已开票订单可查看发票"
      pagination={totalPages > 1 ? { page, totalPages, baseUrl: "/finance/invoices/new", query: paginationQuery } : undefined}
      actions={
        <Link href="/finance/invoices">
          <Button variant="outline">返回发票列表</Button>
        </Link>
      }
      empty={false}
    >
      <form method="GET" className="flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700">
        <Input name="keyword" label="关键词" placeholder="订单号 / 客户名" defaultValue={keyword} />
        <Button type="submit">筛选</Button>
        {keyword ? (
          <Link href="/finance/invoices/new" className="inline-flex h-10 items-center px-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            重置
          </Link>
        ) : null}
      </form>

      <DataTable
        columns={columns}
        data={orders}
        keyExtractor={(o) => o.id}
        emptyMessage="暂无订单"
      />
    </DataPage>
  );
}
