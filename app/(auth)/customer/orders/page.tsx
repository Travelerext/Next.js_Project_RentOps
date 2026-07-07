import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { GenerateInvoiceButton } from "@/app/(auth)/sales/orders/[id]/generate-invoice-button";
import { formatCurrency, formatDate } from "@/lib/utils";

type CustomerOrderRow = {
  id: string;
  order_no: string;
  order_status: string;
  pricing_mode: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  total_rent_amount: string | number | null;
  unpaid_amount: string | number | null;
  created_at: string | null;
};

type CustomerInvoiceDefaults = {
  title: string | null;
  taxNo: string | null;
  addressPhone: string | null;
  bankAccount: string | null;
};

function buildColumns(
  invoiceByOrder: Map<string, string>,
  defaults: CustomerInvoiceDefaults | null
): Column<CustomerOrderRow>[] {
  return [
    { id: "no", header: "订单编号", cell: (order) => order.order_no },
    { id: "status", header: "状态", cell: (order) => <OrderStatusBadge status={order.order_status} /> },
    {
      id: "period",
      header: "租期",
      cell: (order) => `${formatDate(order.planned_start_at)} ~ ${formatDate(order.planned_end_at)}`,
    },
    { id: "mode", header: "计费方式", cell: (order) => order.pricing_mode ?? "-", hideOnMobile: true },
    {
      id: "rent",
      header: "租金总额",
      cell: (order) => formatCurrency(order.total_rent_amount ?? 0),
      className: "text-right tabular-nums",
    },
    {
      id: "unpaid",
      header: "未付",
      cell: (order) => formatCurrency(order.unpaid_amount ?? 0),
      className: "text-right tabular-nums",
    },
    {
      id: "invoice",
      header: "发票",
      cell: (order) => {
        const canInvoice = Boolean(defaults) && !["DRAFT", "CANCELLED"].includes(order.order_status);
        return canInvoice && defaults ? (
          <GenerateInvoiceButton
            orderId={order.id}
            existingInvoiceId={invoiceByOrder.get(order.id)}
            invoiceHrefBase="/customer/invoices"
            defaults={defaults}
          />
        ) : "-";
      },
    },
  ];
}

export default async function CustomerOrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase
        .from("customer")
        .select("id, name, tax_no, invoice_title, invoice_address_phone, invoice_bank_account")
        .eq("owner_user_id", profile.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const { data: orders } = customer
    ? await supabase
        .from("rental_order")
        .select("id, order_no, order_status, pricing_mode, planned_start_at, planned_end_at, total_rent_amount, unpaid_amount, created_at")
        .eq("customer_id", customer.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] };
  const orderIds = (orders ?? []).map((order) => order.id as string);
  const { data: orderInvoices } = orderIds.length > 0
    ? await supabase.from("invoice_record").select("id, order_id").in("order_id", orderIds)
    : { data: [] };
  const invoiceByOrder = new Map((orderInvoices ?? []).map((invoice) => [invoice.order_id as string, invoice.id as string]));

  if (!customer) {
    return (
      <DataPage title="我的订单" subtitle="查看租赁订单、应付金额和发票入口" empty={false}>
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

  const invoiceDefaults: CustomerInvoiceDefaults = {
    title: (customer.invoice_title as string | null) ?? (customer.name as string | null),
    taxNo: customer.tax_no as string | null,
    addressPhone: customer.invoice_address_phone as string | null,
    bankAccount: customer.invoice_bank_account as string | null,
  };

  return (
    <DataPage title="我的订单" subtitle="查看租赁订单、应付金额和发票入口" empty={false}>
      <DataTable
        columns={buildColumns(invoiceByOrder, invoiceDefaults)}
        data={(orders ?? []) as CustomerOrderRow[]}
        keyExtractor={(order) => order.id}
        emptyMessage="暂无订单"
      />
    </DataPage>
  );
}
