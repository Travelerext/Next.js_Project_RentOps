import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { ContractStatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

type CustomerContractRow = {
  id: string;
  contract_no: string;
  contract_status: string;
  start_at: string | null;
  end_at: string | null;
  total_rent_amount: string | number | null;
  deposit_amount: string | number | null;
};

const columns: Column<CustomerContractRow>[] = [
  {
    id: "no",
    header: "合同编号",
    cell: (contract) => contract.contract_no,
    shareIdentity: (contract) => `contract-${contract.id}`,
  },
  {
    id: "period",
    header: "租期",
    cell: (contract) => `${formatDate(contract.start_at)} ~ ${formatDate(contract.end_at)}`,
  },
  {
    id: "rent",
    header: "租金总额",
    cell: (contract) => formatCurrency(contract.total_rent_amount ?? 0),
    className: "text-right tabular-nums",
  },
  {
    id: "deposit",
    header: "押金",
    cell: (contract) => formatCurrency(contract.deposit_amount ?? 0),
    className: "text-right tabular-nums",
    hideOnMobile: true,
  },
  {
    id: "status",
    header: "状态",
    cell: (contract) => <ContractStatusBadge status={contract.contract_status} />,
  },
];

export default async function CustomerContractsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase.from("customer").select("id, name").eq("owner_user_id", profile.id).is("deleted_at", null).maybeSingle()
    : { data: null };

  const { data: contracts } = await supabase
    .from("rental_contract")
    .select("id, contract_no, contract_status, start_at, end_at, total_rent_amount, deposit_amount")
    .eq("customer_id", customer?.id ?? "00000000-0000-0000-0000-000000000000")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!customer) {
    return (
      <DataPage title="我的合同" subtitle="查看租赁合同、签署进度和合同文件" empty={false}>
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
    <DataPage title="我的合同" subtitle={`${customer.name} 的租赁合同、签署进度和合同文件`} empty={false}>
      <DataTable
        columns={columns}
        data={(contracts ?? []) as CustomerContractRow[]}
        keyExtractor={(contract) => contract.id}
        rowHref={(contract) => `/customer/contracts/${contract.id}`}
        emptyMessage="暂无合同"
      />
    </DataPage>
  );
}
