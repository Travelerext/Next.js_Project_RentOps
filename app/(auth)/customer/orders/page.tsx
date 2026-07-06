import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateInvoiceButton } from "@/app/(auth)/sales/orders/[id]/generate-invoice-button";
import { ORDER_STATUS, ORDER_STATUS_VARIANTS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">我的订单</h1>
        {!customer ? (
          <p className="mt-2 text-sm text-app-muted">请先在 <Link href="/customer/profile" className="text-app-accent hover:underline">客户资料</Link> 绑定或创建客户档案。</p>
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle>订单列表</CardTitle></CardHeader>
        <div className="space-y-3 p-4 pt-0">
          {(orders ?? []).map((order) => {
            const status = order.order_status as string;
            const canInvoice = Boolean(customer) && !["DRAFT", "CANCELLED"].includes(status);
            return (
              <div key={order.id} className="rounded-lg border border-app-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-app-fg">{order.order_no}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-app-muted">
                      <Badge variant={(ORDER_STATUS_VARIANTS[status] ?? "default") as BadgeVariant}>{ORDER_STATUS[status] ?? status}</Badge>
                      <span>{formatDate(order.planned_start_at as string)} ~ {formatDate(order.planned_end_at as string)}</span>
                    </div>
                    <p className="mt-2 text-sm text-app-muted">计费方式：{order.pricing_mode as string}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <p className="font-semibold tabular-nums">{formatCurrency(order.total_rent_amount)}</p>
                    <p className="text-xs text-app-muted">未付 {formatCurrency(order.unpaid_amount)}</p>
                    {canInvoice && customer ? (
                      <GenerateInvoiceButton
                        orderId={order.id as string}
                        existingInvoiceId={invoiceByOrder.get(order.id as string)}
                        invoiceHrefBase="/customer/invoices"
                        defaults={{
                          title: (customer.invoice_title as string | null) ?? (customer.name as string | null),
                          taxNo: customer.tax_no as string | null,
                          addressPhone: customer.invoice_address_phone as string | null,
                          bankAccount: customer.invoice_bank_account as string | null,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {(!orders || orders.length === 0) ? (
            <p className="py-8 text-center text-app-muted">暂无订单</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
