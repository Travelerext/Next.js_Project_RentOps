import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">发票管理</h1>
        <p className="mt-1 text-sm text-zinc-500">查看已生成的订单发票</p>
      </div>

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
