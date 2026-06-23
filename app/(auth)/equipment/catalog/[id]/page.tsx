import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { EQUIPMENT_STATUS } from "@/lib/constants";
import Link from "next/link";
import { DirectionalTransition } from "@/components/layout/directional-transition";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: equip },
    { data: statusLogs },
    { data: locationLogs },
    { data: documents },
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select("*, category:category_id(name), model:model_id(model_name), warehouse:warehouse_id(name), station:station_id(name), current_customer:current_customer_id(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("equipment_status_log")
      .select("*")
      .eq("equipment_id", id)
      .order("changed_at", { ascending: false })
      .limit(20),
    supabase
      .from("equipment_location_log")
      .select("*")
      .eq("equipment_id", id)
      .order("located_at", { ascending: false })
      .limit(20),
    supabase
      .from("equipment_document")
      .select("*")
      .eq("equipment_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (!equip) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">设备不存在</p>
          <Link href="/equipment/catalog" className="text-blue-600 hover:underline">
            返回列表
          </Link>
        </div>
      </DirectionalTransition>
    );
  }

  const category = equip.category as unknown as { name: string } | null;
  const model = equip.model as unknown as { model_name: string } | null;
  const warehouse = equip.warehouse as unknown as { name: string } | null;
  const station = equip.station as unknown as { name: string } | null;
  const customer = equip.current_customer as unknown as { name: string } | null;

  const statusVariant =
    equip.status === "IN_STOCK" ? "success" :
    equip.status === "RENTED" ? "warning" :
    equip.status === "IN_MAINTENANCE" ? "info" :
    equip.status === "SCRAPPED" ? "danger" :
    "default";

  const statusLogColumns: Column<Record<string, unknown>>[] = [
    { id: "from", header: "原状态", cell: (l) => l.from_status ? EQUIPMENT_STATUS[l.from_status as string] ?? l.from_status : "-" },
    { id: "to", header: "新状态", cell: (l) => <Badge variant={l.to_status === "IN_STOCK" ? "success" : "info"}>{EQUIPMENT_STATUS[l.to_status as string] ?? String(l.to_status)}</Badge> },
    { id: "reason", header: "原因", cell: (l) => (l.change_reason as string) ?? "-", hideOnMobile: true },
    { id: "type", header: "业务类型", cell: (l) => l.business_type as string, hideOnMobile: true },
    { id: "time", header: "时间", cell: (l) => formatDate(l.changed_at as string) },
  ];

  const locationLogColumns: Column<Record<string, unknown>>[] = [
    { id: "from", header: "原位置", cell: (l) => (l.from_location_text as string) ?? (l.from_location_type as string) ?? "-" },
    { id: "to", header: "新位置", cell: (l) => (l.to_location_text as string) ?? (l.to_location_type as string) ?? "-" },
    { id: "type", header: "业务类型", cell: (l) => l.business_type as string, hideOnMobile: true },
    { id: "time", header: "时间", cell: (l) => formatDate(l.located_at as string) },
  ];

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={equip.name as string}
          subtitle={equip.equipment_no as string}
          backUrl="_back"
          status={<Badge variant={statusVariant}>{EQUIPMENT_STATUS[equip.status as string] ?? String(equip.status)}</Badge>}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
            <InfoGrid
              items={[
                { label: "设备类别", value: category?.name ?? "-" },
                { label: "型号", value: model?.model_name ?? "-" },
                { label: "品牌", value: (equip.brand as string) ?? "-" },
                { label: "规格", value: (equip.specification as string) ?? "-" },
                { label: "吨位", value: equip.tonnage ? `${equip.tonnage}T` : "-" },
                { label: "出厂编号", value: (equip.factory_no as string) ?? "-" },
                { label: "成色等级", value: `${equip.condition_level}级` },
                { label: "新旧程度", value: equip.newness_level ?? "-" },
              ]}
            />
          </Card>

          <Card>
            <CardHeader><CardTitle>位置与运营</CardTitle></CardHeader>
            <InfoGrid
              items={[
                { label: "站点", value: station?.name ?? "-" },
                { label: "仓库", value: warehouse?.name ?? "-" },
                { label: "当前位置类型", value: equip.current_location_type ?? "-" },
                { label: "当前位置描述", value: (equip.current_location_text as string) ?? "-" },
                { label: "当前客户", value: customer?.name ?? "-" },
                { label: "GPS", value: equip.gps_enabled ? "已安装" : "无" },
                { label: "带驾驶员", value: equip.with_driver_rental ? "支持" : "不支持" },
              ]}
            />
          </Card>

          <Card>
            <CardHeader><CardTitle>资产信息</CardTitle></CardHeader>
            <InfoGrid
              items={[
                { label: "购买日期", value: formatDate(equip.purchase_date as string) },
                { label: "购买价格", value: formatCurrency(equip.purchase_price as string) },
                { label: "折旧年限", value: `${equip.depreciation_years}年` },
                { label: "残值率", value: `${equip.residual_rate}%` },
                { label: "当前残值", value: formatCurrency(equip.current_residual_value as string) },
                { label: "使用年限", value: equip.service_years ? `${equip.service_years}年` : "-" },
              ]}
            />
          </Card>

          <Card>
            <CardHeader><CardTitle>租赁标准</CardTitle></CardHeader>
            <InfoGrid
              items={[
                { label: "月租标准", value: <strong>{formatCurrency(equip.standard_rent as string)}</strong> },
                { label: "押金标准", value: formatCurrency(equip.standard_deposit as string) },
                { label: "备注", value: (equip.remark as string) ?? "-" },
                { label: "创建时间", value: formatDate(equip.created_at as string) },
                { label: "更新时间", value: formatDate(equip.updated_at as string) },
              ]}
            />
          </Card>
        </div>

        {/* Status log */}
        <Card>
          <CardHeader><CardTitle>状态变更记录</CardTitle></CardHeader>
          <div className="p-4 md:p-6">
            <DataTable
              columns={statusLogColumns}
              data={(statusLogs ?? []) as Record<string, unknown>[]}
              keyExtractor={(l) => l.id as string}
              emptyMessage="暂无状态变更记录"
            />
          </div>
        </Card>

        {/* Location log */}
        <Card>
          <CardHeader><CardTitle>位置变更记录</CardTitle></CardHeader>
          <div className="p-4 md:p-6">
            <DataTable
              columns={locationLogColumns}
              data={(locationLogs ?? []) as Record<string, unknown>[]}
              keyExtractor={(l) => l.id as string}
              emptyMessage="暂无位置变更记录"
            />
          </div>
        </Card>

        {/* Documents */}
        {documents && documents.length > 0 && (
          <Card>
            <CardHeader><CardTitle>设备文档</CardTitle></CardHeader>
            <div className="p-4 md:p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">文档类型</th>
                    <th className="p-2 text-left">文件名</th>
                    <th className="p-2 text-right">大小</th>
                    <th className="p-2 text-left">上传时间</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc: Record<string, unknown>) => (
                    <tr key={doc.id as string} className="border-b">
                      <td className="p-2">
                        <Badge variant="info">{doc.document_type as string}</Badge>
                      </td>
                      <td className="p-2">{doc.file_name as string}</td>
                      <td className="p-2 text-right text-zinc-500">
                        {doc.file_size ? `${Math.round((doc.file_size as number) / 1024)}KB` : "-"}
                      </td>
                      <td className="p-2 text-zinc-500">{formatDate(doc.uploaded_at as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DirectionalTransition>
  );
}
