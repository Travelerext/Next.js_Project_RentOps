import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoGrid } from "@/components/data/info-grid";
import { formatCurrency } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";

export default async function CustomerEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: equipment } = await supabase
    .from("equipment")
    .select("*, category:category_id(name), model:model_id(model_name)")
    .eq("id", id)
    .single();
  if (!equipment) return <p className="py-12 text-center text-app-muted">设备不存在</p>;
  return (
    <div className="space-y-6">
      <PageHeader title={equipment.name as string} subtitle={equipment.equipment_no as string} backUrl="/customer/equipment" status={<Badge variant="success">{EQUIPMENT_STATUS[equipment.status as string] ?? equipment.status}</Badge>} actions={<Link href={`/customer/inquiries/new?equipmentId=${id}`}><Button variant="primary">提交询价</Button></Link>} />
      <Card>
        <CardHeader><CardTitle>设备信息</CardTitle></CardHeader>
        <InfoGrid
          items={[
            { label: "类别", value: ((equipment.category as { name?: string } | null)?.name) ?? "-" },
            { label: "型号", value: ((equipment.model as { model_name?: string } | null)?.model_name) ?? "-" },
            { label: "品牌", value: equipment.brand ?? "-" },
            { label: "规格", value: equipment.specification ?? "-" },
            { label: "成色", value: `${equipment.condition_level ?? "-"}级` },
            { label: "月租标准", value: formatCurrency((equipment.standard_rent as string) ?? "0") },
            { label: "押金标准", value: formatCurrency((equipment.standard_deposit as string) ?? "0") },
            { label: "当前位置", value: equipment.current_location_text ?? equipment.current_location_type ?? "-" },
          ]}
        />
      </Card>
    </div>
  );
}
