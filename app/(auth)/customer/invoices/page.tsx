import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS } from "@/lib/constants";
import { GenerateInvoiceButton } from "@/app/(auth)/sales/orders/[id]/generate-invoice-button";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANTS,
  INVOICE_TYPE_LABELS,
} from "@/components/invoice/invoice-document";

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
  const { data: orders } = customer
    ? await supabase
        .from("rental_order")
        .select("id, order_no, order_status, total_rent_amount, created_at, customer:customer_id(name, tax_no, invoice_title, invoice_address_phone, invoice_bank_account)")
        .eq("customer_id", customer.id)
        .not("order_status", "in", "(DRAFT,CANCELLED)")
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] };
  const orderIds = (orders ?? []).map((order) => order.id as string);
  const { data: orderInvoices } = orderIds.length > 0
    ? await supabase.from("invoice_record").select("id, order_id").in("order_id", orderIds)
    : { data: [] };
  const invoiceByOrder = new Map((orderInvoices ?? []).map((invoice) => [invoice.order_id as string, invoice.id as string]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">发票管理</h1>
        <p className="mt-1 text-sm text-zinc-500">查看已生成的订单发票</p>
      </div>

      <Card>
        <CardHeader><CardTitle>可开票订单</CardTitle></CardHeader>
        <div className="space-y-3 p-4 pt-0">
          {(orders ?? []).map((order) => {
            const orderCustomer = order.customer as {
              name?: string | null;
              tax_no?: string | null;
              invoice_title?: string | null;
              invoice_address_phone?: string | null;
              invoice_bank_account?: string | null;
            } | null;
            return (
              <div key={order.id} className="flex flex-col gap-3 rounded-lg border border-app-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-medium text-app-fg">{order.order_no}</p>
                  <p className="mt-1 text-sm text-app-muted">
                    {ORDER_STATUS[order.order_status as string] ?? order.order_status} · {formatDate(order.created_at as string)}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{formatCurrency(order.total_rent_amount)}</p>
                </div>
                <GenerateInvoiceButton
                  orderId={order.id as string}
                  existingInvoiceId={invoiceByOrder.get(order.id as string)}
                  invoiceHrefBase="/customer/invoices"
                  defaults={{
                    title: orderCustomer?.invoice_title ?? orderCustomer?.name,
                    taxNo: orderCustomer?.tax_no,
                    addressPhone: orderCustomer?.invoice_address_phone,
                    bankAccount: orderCustomer?.invoice_bank_account,
                  }}
                />
              </div>
            );
          })}
          {(!orders || orders.length === 0) ? (
            <p className="py-6 text-center text-sm text-app-muted">暂无可开票订单</p>
          ) : null}
        </div>
      </Card>

      <div className="space-y-3">
        {(invoices ?? []).map((invoice) => {
          const order = invoice.order as { order_no?: string } | null;
          return (
            <Link
              key={invoice.id}
              href={`/customer/invoices/${invoice.id}`}
              className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{invoice.invoice_no}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {INVOICE_TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type} · 订单 {order?.order_no ?? "-"} · {formatDate(invoice.issued_at)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold tabular-nums">{formatCurrency(invoice.total_amount)}</p>
                  <Badge variant={INVOICE_STATUS_VARIANTS[invoice.invoice_status] ?? "default"}>
                    {INVOICE_STATUS_LABELS[invoice.invoice_status] ?? invoice.invoice_status}
                  </Badge>
                </div>
              </div>
            </Link>
          );
        })}
        {(!invoices || invoices.length === 0) ? (
          <p className="rounded-lg border border-zinc-200 py-8 text-center text-zinc-500 dark:border-zinc-700">暂无发票</p>
        ) : null}
      </div>
    </div>
  );
}
