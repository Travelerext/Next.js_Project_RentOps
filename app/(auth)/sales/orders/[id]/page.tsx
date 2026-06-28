import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ORDER_STATUS } from "@/lib/constants";
import Link from "next/link";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { AddItemForm } from "./add-item-form";
import { SubmitOrderButton } from "./submit-button";
import { CreateContractButton } from "./create-contract-button";
import { DeleteDraftButton } from "./delete-draft-button";
import { CancelOrderButton } from "./cancel-order-button";
import { GenerateInvoiceButton } from "./generate-invoice-button";

type OrderItem = {
  id: string; quantity: number; actual_unit_price: string | number;
  deposit_amount: string | number; rent_amount: string | number; item_status: string;
  equipment: { equipment_no: string; name: string; brand: string } | null;
};

type Order = {
  id: string; order_no: string; order_status: string; pricing_mode: string;
  planned_start_at: string; planned_end_at: string;
  total_rent_amount: string | number; total_deposit_amount: string | number; paid_amount: string | number;
  customer: {
    id: string; name: string; customer_no: string; contact_name: string; contact_phone: string;
    tax_no: string | null; invoice_title: string | null; invoice_address_phone: string | null; invoice_bank_account: string | null;
  } | null;
};

const itemCols: Column<OrderItem>[] = [
  { id: "no", header: "设备编号", cell: (i) => <span className="font-mono text-sm">{i.equipment?.equipment_no ?? "-"}</span> },
  { id: "name", header: "设备名称", cell: (i) => i.equipment?.name ?? "-" },
  { id: "qty", header: "数量", cell: (i) => String(i.quantity), hideOnMobile: true },
  { id: "price", header: "单价", cell: (i) => formatCurrency(i.actual_unit_price), className: "tabular-nums" },
  { id: "deposit", header: "押金", cell: (i) => formatCurrency(i.deposit_amount), className: "tabular-nums", hideOnMobile: true },
  { id: "rent", header: "小计", cell: (i) => formatCurrency(i.rent_amount), className: "tabular-nums" },
  { id: "status", header: "状态", cell: (i) => <Badge variant={i.item_status === "RETURNED" ? "success" : "default"}>{i.item_status}</Badge> },
];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Check if current user is finance
  const { data: { user } } = await supabase.auth.getUser();
  let isFinance = false;
  if (user) {
    const { data: p } = await supabase.from("profiles").select("primary_role").eq("supabase_user_id", user.id).maybeSingle();
    isFinance = p?.primary_role === "FINANCE" || p?.primary_role === "FINANCE_MANAGER";
  }

  const [orderResult, itemsResult, contractResult, invoiceResult] = await Promise.all([
    supabase.from("rental_order").select("*, customer:customer_id(id, name, customer_no, contact_name, contact_phone, tax_no, invoice_title, invoice_address_phone, invoice_bank_account)").eq("id", id).single(),
    supabase.from("rental_order_item").select("*, equipment:equipment_id(equipment_no, name, brand)").eq("order_id", id),
    supabase.from("rental_contract").select("id, contract_no, contract_status").eq("order_id", id).maybeSingle(),
    supabase.from("invoice_record").select("id, invoice_no").eq("order_id", id).maybeSingle(),
  ]);

  const order = orderResult.data as unknown as Order | null;

  if (!order) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12"><p className="text-zinc-500">订单不存在</p><Link href="/sales/orders" className="text-blue-600 hover:underline">返回列表</Link></div>
      </DirectionalTransition>
    );
  }

  const items = (itemsResult.data ?? []) as unknown as OrderItem[];
  const contract = contractResult.data as { id: string } | null;
  const invoice = invoiceResult.data as { id: string; invoice_no: string } | null;
  const canInvoice = !["DRAFT", "CANCELLED"].includes(order.order_status);

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={order.order_no}
          backUrl="_back"
          status={<Badge variant={order.order_status === "OVERDUE" ? "danger" : order.order_status === "IN_PROGRESS" ? "success" : "default"}>{ORDER_STATUS[order.order_status] ?? order.order_status}</Badge>}
          actions={
            <div className="flex gap-2">
              {canInvoice ? (
                <GenerateInvoiceButton
                  orderId={order.id}
                  existingInvoiceId={invoice?.id}
                  defaults={{
                    title: order.customer?.invoice_title ?? order.customer?.name,
                    taxNo: order.customer?.tax_no,
                    addressPhone: order.customer?.invoice_address_phone,
                    bankAccount: order.customer?.invoice_bank_account,
                  }}
                />
              ) : invoice ? (
                <Link href={`/finance/invoices/${invoice.id}`}><Button variant="outline">查看发票</Button></Link>
              ) : null}
              {!isFinance && order.order_status === "DRAFT" && (
                <>
                  <AddItemForm orderId={order.id} />
                  <SubmitOrderButton orderId={order.id} />
                </>
              )}
              {!isFinance && ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CONFIRMED"].includes(order.order_status) && (
                <CancelOrderButton orderId={order.id} />
              )}
              {!isFinance && ["APPROVED", "CONFIRMED"].includes(order.order_status) && !contract ? <CreateContractButton orderId={order.id} /> : null}
              {contract ? <Link href={`/sales/contracts/${contract.id}`}><Button variant="outline">查看合同</Button></Link> : null}
            </div>
          }
        />

        <Card>
          <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
          <InfoGrid
            items={[
              { label: "客户", value: order.customer?.name ?? "-" },
              { label: "联系人", value: order.customer?.contact_name ?? "-" },
              { label: "计费方式", value: order.pricing_mode },
              { label: "计划开始", value: formatDate(order.planned_start_at) },
              { label: "计划结束", value: formatDate(order.planned_end_at) },
              { label: "租金总额", value: <strong>{formatCurrency(order.total_rent_amount)}</strong> },
              { label: "押金", value: formatCurrency(order.total_deposit_amount) },
              { label: "已付", value: formatCurrency(order.paid_amount) },
            ]}
          />
          {order.order_status === "DRAFT" && (
            <div className="flex justify-end border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
              <DeleteDraftButton orderId={order.id} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>设备明细</CardTitle></CardHeader>
          <DataTable columns={itemCols} data={items} keyExtractor={(i) => i.id} emptyMessage="暂无设备明细" />
        </Card>
      </div>
    </DirectionalTransition>
  );
}
