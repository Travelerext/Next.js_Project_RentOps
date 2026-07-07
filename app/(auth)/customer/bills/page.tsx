import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { ReceivableStatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

type CustomerBillRow = {
  id: string;
  receivable_no: string;
  receivable_type: string;
  amount: string | number | null;
  paid_amount: string | number | null;
  unpaid_amount: string | number | null;
  due_date: string | null;
  status: string;
};

const columns: Column<CustomerBillRow>[] = [
  { id: "no", header: "账单编号", cell: (row) => row.receivable_no },
  { id: "type", header: "类型", cell: (row) => row.receivable_type },
  { id: "due", header: "到期日", cell: (row) => formatDate(row.due_date) },
  { id: "amount", header: "应收", cell: (row) => formatCurrency(row.amount ?? 0), className: "text-right tabular-nums" },
  { id: "paid", header: "已付", cell: (row) => formatCurrency(row.paid_amount ?? 0), className: "text-right tabular-nums", hideOnMobile: true },
  { id: "unpaid", header: "未付", cell: (row) => formatCurrency(row.unpaid_amount ?? 0), className: "text-right tabular-nums" },
  { id: "status", header: "状态", cell: (row) => <ReceivableStatusBadge status={row.status} /> },
];

export default async function CustomerBillsPage() {
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

  const { data: receivables } = await supabase
    .from("receivable")
    .select("id, receivable_no, receivable_type, amount, paid_amount, unpaid_amount, due_date, status")
    .eq("customer_id", customer?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("due_date", { ascending: true })
    .limit(30);

  if (!customer) {
    return (
      <DataPage title="账单查询" subtitle="查看应收账单、付款状态和凭证记录" empty={false}>
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
    <DataPage title="账单查询" subtitle="查看应收账单、付款状态和凭证记录" empty={false}>
      <DataTable
        columns={columns}
        data={(receivables ?? []) as CustomerBillRow[]}
        keyExtractor={(row) => row.id}
        rowHref={(row) => `/customer/bills/${row.id}`}
        emptyMessage="暂无账单"
      />
    </DataPage>
  );
}
