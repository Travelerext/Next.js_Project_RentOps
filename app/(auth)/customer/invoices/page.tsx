import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
  INVOICE_TYPE_LABELS,
} from "@/components/invoice/invoice-document";

type CustomerInvoiceRow = {
  id: string;
  invoice_no: string;
  invoice_type: string;
  invoice_status: string;
  title: string | null;
  total_amount: string | number | null;
  issued_at: string | null;
  order: { order_no?: string } | { order_no?: string }[] | null;
};

function invoiceOrderNo(invoice: CustomerInvoiceRow) {
  const order = Array.isArray(invoice.order) ? invoice.order[0] : invoice.order;
  return order?.order_no ?? "-";
}

const columns: Column<CustomerInvoiceRow>[] = [
  { id: "no", header: "发票编号", cell: (invoice) => invoice.invoice_no },
  { id: "type", header: "类型", cell: (invoice) => INVOICE_TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type },
  { id: "order", header: "订单", cell: (invoice) => invoiceOrderNo(invoice), hideOnMobile: true },
  { id: "issued", header: "开票日期", cell: (invoice) => formatDate(invoice.issued_at) },
  { id: "amount", header: "金额", cell: (invoice) => formatCurrency(invoice.total_amount ?? 0), className: "text-right tabular-nums" },
  {
    id: "status",
    header: "状态",
    cell: (invoice) => (
      <Badge variant={INVOICE_STATUS_VARIANTS[invoice.invoice_status] ?? "default"}>
        {INVOICE_STATUS_LABELS[invoice.invoice_status] ?? invoice.invoice_status}
      </Badge>
    ),
  },
];

export default async function CustomerInvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase.from("customer").select("id").eq("owner_user_id", profile.id).is("deleted_at", null).maybeSingle()
    : { data: null };

  const { data: invoices } = customer
    ? await supabase
        .from("invoice_record")
        .select("id, invoice_no, invoice_type, invoice_status, title, total_amount, issued_at, order:order_id(order_no)")
        .eq("customer_id", customer.id)
        .order("issued_at", { ascending: false })
    : { data: [] };

  if (!customer) {
    return (
      <DataPage title="发票管理" subtitle="查看已生成的订单发票" empty={false}>
        <div className="surface-panel rounded-lg p-6 text-sm text-app-muted">
          请先在{" "}
          <Link href="/customer/profile" className="text-app-accent hover:underline">
            客户资料
          </Link>{" "}
          绑定或创建客户档案。
        </div>
      </DataPage>
    );
  }

  return (
    <DataPage title="发票管理" subtitle="查看已生成的订单发票" empty={false}>
      <DataTable
        columns={columns}
        data={(invoices ?? []) as CustomerInvoiceRow[]}
        keyExtractor={(invoice) => invoice.id}
        rowHref={(invoice) => `/customer/invoices/${invoice.id}`}
        emptyMessage="暂无发票"
      />
    </DataPage>
  );
}
