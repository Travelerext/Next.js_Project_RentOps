import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceDocument, type InvoiceDocumentData } from "@/components/invoice/invoice-document";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";

export default async function FinanceInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoice_record")
    .select("*, customer:customer_id(name), order:order_id(order_no), contract:contract_id(contract_no)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const invoice = data as unknown as InvoiceDocumentData;
  const orderId = data.order_id as string | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="发票详情"
        subtitle={invoice.invoice_no}
        backUrl="_back"
        actions={
          <div className="flex gap-2">
            {orderId ? (
              <Link href={`/sales/orders/${orderId}`}>
                <Button variant="outline">查看订单</Button>
              </Link>
            ) : null}
            <InvoicePrintButton invoiceId={invoice.id} />
          </div>
        }
      />
      <InvoiceDocument invoice={invoice} />
    </div>
  );
}
