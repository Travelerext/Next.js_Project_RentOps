import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceDocument, type InvoiceDocumentData } from "@/components/invoice/invoice-document";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";

export default async function CustomerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (!customer) notFound();

  const { data } = await supabase
    .from("invoice_record")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no)")
    .eq("id", id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!data) notFound();
  const invoice = data as unknown as InvoiceDocumentData;

  return (
    <div className="space-y-6">
      <PageHeader
        title="发票详情"
        subtitle={invoice.invoice_no}
        backUrl="_back"
        actions={<InvoicePrintButton invoiceId={invoice.id} />}
      />
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
