import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoGrid } from "@/components/data/info-grid";
import { formatDateTime } from "@/lib/utils";
import { CUSTOMER_REPAIR_STATUS, statusVariant } from "@/lib/cr08-labels";

export default async function CustomerRepairDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: repair } = await supabase
    .from("customer_repair_request")
    .select("*, equipment:equipment_id(equipment_no, name), work_order:work_order_id(work_order_no, status)")
    .eq("id", id)
    .single();
  if (!repair) return <p className="py-12 text-center text-app-muted">报修单不存在</p>;
  const equipment = repair.equipment as { equipment_no: string; name: string } | null;
  const workOrder = repair.work_order as { work_order_no?: string; status?: string } | null;
  return (
    <div className="space-y-6">
      <PageHeader title={repair.request_no as string} subtitle={equipment ? `${equipment.equipment_no} / ${equipment.name}` : undefined} backUrl="/customer/repairs" status={<Badge variant={statusVariant(repair.status as string)}>{CUSTOMER_REPAIR_STATUS[repair.status as string] ?? repair.status as string}</Badge>} actions={<Link href="/customer/repairs/new"><Button variant="outline">继续报修</Button></Link>} />
      <Card>
        <CardHeader><CardTitle>报修详情</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "故障描述", value: repair.fault_description },
            { label: "提交时间", value: formatDateTime(repair.created_at as string) },
            { label: "更新时间", value: formatDateTime(repair.updated_at as string) },
            { label: "维修工单", value: workOrder?.work_order_no ?? "-" },
            { label: "工单状态", value: workOrder?.status ?? "-" },
          ]}
        />
      </Card>
    </div>
  );
}
