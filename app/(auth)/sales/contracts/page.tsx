import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { CONTRACT_STATUS } from "@/lib/constants";

const cols: Column<Record<string,unknown>>[] = [
  { id:"no", header:"合同编号", cell:c => c.contract_no as string, shareIdentity:c => `contract-${c.id}` },
  { id:"customer", header:"客户", cell:c => (c.customer as {name:string})?.name??"-" },
  { id:"start", header:"开始日期", cell:c => formatDate(c.start_at as string) },
  { id:"end", header:"结束日期", cell:c => formatDate(c.end_at as string) },
  { id:"amount", header:"租金总额", cell:c => formatCurrency(c.total_rent_amount as string), className:"tabular-nums" },
  { id:"status", header:"状态", cell:c => <Badge variant={(c.contract_status as string)==="ACTIVE"?"success":"default"}>{CONTRACT_STATUS[c.contract_status as string]??String(c.contract_status)}</Badge> },
];

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ page?:string; status?:string }> }) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page)||1; const status = sp.status||"";

  let q = supabase.from("rental_contract").select("*,customer:customer_id(name)",{count:"exact"}).is("deleted_at",null);
  if (status) q = q.eq("contract_status",status);
  const { data, count } = await q.range((page-1)*20, page*20-1).order("created_at",{ascending:false});
  const tp = Math.ceil((count??0)/20);

  return (
    <DataPage title="合同管理"
      filters={{ items:[{key:"",label:"全部",href:"/sales/contracts"},...Object.entries(CONTRACT_STATUS).map(([k,v])=>({key:k,label:v,href:`/sales/contracts?status=${k}`}))], activeKey:status }}
      pagination={tp>1?{page,totalPages:tp,baseUrl:"/sales/contracts",query:status?`status=${status}`:undefined}:undefined}
      empty={false}>
      <DataTable columns={cols} data={(data??[]) as Record<string,unknown>[]} keyExtractor={c => c.id as string} rowHref={c => `/sales/contracts/${c.id}`} emptyMessage={status ? "未找到匹配结果，请调整筛选条件" : "暂无合同数据"} />
    </DataPage>
  );
}
