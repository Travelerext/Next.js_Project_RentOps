import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Truck, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ─── Transfer status helpers ───────────────────────────────────────────

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  OUTBOUND_CONFIRMED: "出库已确认",
  IN_TRANSIT: "运输中",
  ARRIVED_CONFIRMED: "已到达",
  CANCELLED: "已取消",
};

const TRANSFER_STATUS_VARIANTS: Record<
  string,
  "warning" | "info" | "success" | "default"
> = {
  PENDING: "warning",
  OUTBOUND_CONFIRMED: "info",
  IN_TRANSIT: "info",
  ARRIVED_CONFIRMED: "success",
  CANCELLED: "default",
};

// ─── Columns ───────────────────────────────────────────────────────────

const cols: Column<Record<string, unknown>>[] = [
  {
    id: "no",
    header: "调拨单号",
    cell: (t) => <span className="font-mono text-sm">{t.transfer_no as string}</span>,
  },
  {
    id: "equipment",
    header: "设备",
    cell: (t) => {
      const equip = t.equipment as unknown as
        | { name: string; equipment_no: string }
        | null;
      return equip ? `${equip.name}（${equip.equipment_no}）` : "-";
    },
  },
  {
    id: "from_location",
    header: "调出位置",
    cell: (t) => {
      const wh = t.from_warehouse as unknown as { name: string } | null;
      const st = t.from_station as unknown as { name: string } | null;
      return wh?.name ?? st?.name ?? "-";
    },
  },
  {
    id: "to_location",
    header: "调入位置",
    cell: (t) => {
      const wh = t.to_warehouse as unknown as { name: string } | null;
      const st = t.to_station as unknown as { name: string } | null;
      return wh?.name ?? st?.name ?? "-";
    },
  },
  {
    id: "status",
    header: "状态",
    cell: (t) => {
      const s = t.transfer_status as string;
      return (
        <Badge variant={TRANSFER_STATUS_VARIANTS[s] ?? "default"}>
          {TRANSFER_STATUS_LABELS[s] ?? s}
        </Badge>
      );
    },
  },
  {
    id: "created_at",
    header: "创建时间",
    cell: (t) => formatDate(t.created_at as string),
  },
];

// ═════════════════════════════════════════════════════════════════════════

export default async function EquipmentTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const status = sp.status ?? "";

  // Build query
  let query = supabase
    .from("equipment_transfer")
    .select(
      "*, equipment:equipment_id(name, equipment_no), from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name), from_station:from_station_id(name), to_station:to_station_id(name)",
    )
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("transfer_status", status);
  }

  const { data } = await query;
  const transfers = (data ?? []) as Record<string, unknown>[];

  const filterItems = [
    { key: "", label: "全部", href: "/equipment/transfers" },
    ...Object.entries(TRANSFER_STATUS_LABELS).map(([k, v]) => ({
      key: k,
      label: v,
      href: `/equipment/transfers?status=${k}`,
    })),
  ];

  return (
    <DataPage
      title="设备调拨"
      actions={
        <Link
          href="/equipment"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" />
          返回设备管理
        </Link>
      }
      filters={{ items: filterItems, activeKey: status }}
      empty={false}
    >
      {transfers.length > 0 ? (
        <DataTable
          columns={cols}
          data={transfers}
          keyExtractor={(t) => t.id as string}
          rowHref={(t) => `/equipment/transfers/${t.id}`}
          emptyMessage={
            status
              ? "未找到匹配的调拨记录，请调整筛选条件"
              : "暂无设备调拨记录"
          }
        />
      ) : (
        <EmptyState
          icon={Truck}
          title="暂无调拨记录"
          description={
            status
              ? "当前筛选条件下没有调拨记录，请调整筛选条件"
              : "还没有设备调拨记录，调拨操作完成后将在此显示"
          }
          action={
            <Link href="/equipment">
              <Button variant="outline">返回设备管理</Button>
            </Link>
          }
        />
      )}
    </DataPage>
  );
}
