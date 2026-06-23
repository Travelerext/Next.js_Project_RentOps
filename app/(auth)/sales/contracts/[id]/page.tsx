import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { formatDate, formatCurrency } from "@/lib/utils";
import { CONTRACT_STATUS } from "@/lib/constants";
import Link from "next/link";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { ContractActions } from "./actions";

const itemColumns: Column<Record<string, unknown>>[] = [
  { id: "no", header: "设备编号", cell: (i) => <span className="font-mono text-sm">{i.equipment_no_snapshot as string}</span> },
  { id: "name", header: "设备名称", cell: (i) => i.equipment_name_snapshot as string },
  { id: "price", header: "租金单价", cell: (i) => <span className="tabular-nums">{formatCurrency(i.rent_unit_price as string)}</span> },
  { id: "deposit", header: "押金", cell: (i) => <span className="tabular-nums">{formatCurrency(i.deposit_amount as string)}</span>, hideOnMobile: true },
  { id: "rent", header: "租金小计", cell: (i) => <span className="tabular-nums">{formatCurrency(i.rent_amount as string)}</span> },
];

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the contract first — bail early if not found
  const { data: contract, error } = await supabase
    .from("rental_contract")
    .select("*, customer:customer_id(id, name, contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Contract fetch error:", error);
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">合同不存在</p>
          <p className="text-xs text-zinc-400 mt-1">ID: {id}</p>
          <Link href="/sales/contracts" className="text-blue-600 hover:underline">返回列表</Link>
        </div>
      </DirectionalTransition>
    );
  }

  if (!contract || contract.deleted_at) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">合同不存在</p>
          <p className="text-xs text-zinc-400 mt-1">ID: {id}</p>
          <Link href="/sales/contracts" className="text-blue-600 hover:underline">返回列表</Link>
        </div>
      </DirectionalTransition>
    );
  }

  // Fetch related data in parallel after confirming contract exists
  const [{ data: items }, { data: order }] = await Promise.all([
    supabase.from("rental_contract_item").select("*").eq("contract_id", id),
    (async () => {
      if (!contract.order_id) return { data: null };
      const { data: orderData } = await supabase
        .from("rental_order")
        .select("order_no, planned_start_at, planned_end_at")
        .eq("id", contract.order_id)
        .maybeSingle();
      return { data: orderData };
    })(),
  ]);

  const customer = contract.customer as unknown as { name: string; contact_name: string };
  const status = contract.contract_status as string;
  const orderInfo = order as unknown as { order_no?: string; planned_start_at?: string; planned_end_at?: string } | null;

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={contract.contract_no as string}
          backUrl="/sales/contracts"
          status={<Badge variant={status === "ACTIVE" ? "success" : status === "SIGNED" ? "info" : "default"}>{CONTRACT_STATUS[status] ?? status}</Badge>}
          actions={<ContractActions contractId={contract.id as string} status={status} customerId={contract.customer?.id as string ?? ""} />}
        />

        {/* Contract Document Preview */}
        <Card>
          <CardHeader><CardTitle>合同文案</CardTitle></CardHeader>
          <div className="p-4 md:p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-b-xl text-sm leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 font-serif">
            {`        机械设备租赁合同

合同编号：${contract.contract_no}
签订日期：${contract.signed_at ? formatDate(contract.signed_at as string) : "________"}

甲方（出租方）：机械设备租赁有限公司
乙方（承租方）：${customer.name}

根据《中华人民共和国民法典》及相关法律法规，甲乙双方经友好协商，就设备租赁事宜达成如下协议：

一、租赁设备
${(items ?? []).map((i: Record<string, unknown>, idx: number) => `  ${idx + 1}. ${i.equipment_name_snapshot}（编号：${i.equipment_no_snapshot}）  数量：${i.quantity as number ?? 1}  租金单价：${formatCurrency(i.rent_unit_price as string)}/月  押金：${formatCurrency(i.deposit_amount as string)}`).join("\n")}

二、租赁期限
  开始日期：${formatDate(contract.start_at as string)}
  结束日期：${formatDate(contract.end_at as string)}
  ${orderInfo?.planned_start_at ? `计划租期：${formatDate(orderInfo.planned_start_at)} 至 ${formatDate(orderInfo.planned_end_at)}` : ""}

三、租金及支付
  租金总额：${formatCurrency(contract.total_rent_amount)}
  押金金额：${formatCurrency(contract.deposit_amount)}
  支付方式：按月度结算，每月5日前支付当月租金

四、设备使用与维护
  1. 乙方应按照设备操作规程正确使用设备
  2. 日常保养由乙方负责，大修及故障由甲方负责
  3. 设备损坏（非正常磨损）由乙方承担维修费用

五、违约责任
  1. 乙方逾期支付租金，每逾期一日按应付租金的0.5%支付违约金
  2. 乙方擅自转租、抵押设备的，甲方有权解除合同

六、其他约定
  ${contract.remark ? (contract.remark as string) : "无"}

甲方（盖章）：_______________        乙方（盖章）：_______________

日期：_______________                日期：_______________`}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>合同信息</CardTitle></CardHeader>
          <InfoGrid
            items={[
              { label: "客户", value: customer.name ?? "-" },
              { label: "联系人", value: customer.contact_name ?? "-" },
              { label: "开始日期", value: formatDate(contract.start_at as string) },
              { label: "结束日期", value: formatDate(contract.end_at as string) },
              { label: "租金总额", value: <strong>{formatCurrency(contract.total_rent_amount)}</strong> },
              { label: "押金", value: formatCurrency(contract.deposit_amount) },
              ...(contract.signed_at ? [{ label: "签署日期", value: formatDate(contract.signed_at as string) }] : []),
              ...(contract.effective_at ? [{ label: "生效日期", value: formatDate(contract.effective_at as string) }] : []),
            ]}
          />
        </Card>

        <Card>
          <CardHeader><CardTitle>设备明细（快照）</CardTitle></CardHeader>
          <DataTable columns={itemColumns} data={(items ?? []) as Record<string, unknown>[]} keyExtractor={(i) => i.id as string} emptyMessage="暂无明细" />
        </Card>
      </div>
    </DirectionalTransition>
  );
}
