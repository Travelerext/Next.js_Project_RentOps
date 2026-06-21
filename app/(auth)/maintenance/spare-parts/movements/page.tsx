import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatCurrency } from "@/lib/utils";

// ─── Movement type Chinese labels ──────────────────────────────────

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INBOUND_PURCHASE: "采购入库",
  INBOUND_RETURN: "退料入库",
  OUTBOUND_MAINTENANCE: "维修领用",
  OUTBOUND_SCRAP: "报废出库",
  ADJUSTMENT: "盘点调整",
};

// ─── Movement type badge ───────────────────────────────────────────

function MovementTypeBadge({ type }: { type: string }) {
  let variant: "success" | "danger" | "info" | "default" = "default";
  if (type.startsWith("INBOUND")) {
    variant = "success";
  } else if (type.startsWith("OUTBOUND")) {
    variant = "danger";
  } else if (type === "ADJUSTMENT") {
    variant = "info";
  }
  return (
    <Badge variant={variant}>
      {MOVEMENT_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

// ─── Column definitions ─────────────────────────────────────────────

const cols: Column<Record<string, unknown>>[] = [
  {
    id: "operated_at",
    header: "操作时间",
    cell: (m) => formatDateTime(m.operated_at as string),
  },
  {
    id: "part_no",
    header: "配件编号",
    cell: (m) => {
      const part = m.spare_part as { part_no?: string } | null;
      return <span className="font-mono text-sm">{part?.part_no ?? "-"}</span>;
    },
  },
  {
    id: "part_name",
    header: "配件名称",
    cell: (m) => {
      const part = m.spare_part as { part_name?: string } | null;
      return <span className="font-medium">{part?.part_name ?? "-"}</span>;
    },
  },
  {
    id: "movement_type",
    header: "移动类型",
    cell: (m) => <MovementTypeBadge type={m.movement_type as string} />,
  },
  {
    id: "quantity",
    header: "数量",
    cell: (m) => <span className="tabular-nums">{m.quantity as string}</span>,
  },
  {
    id: "unit_price",
    header: "单价",
    cell: (m) => formatCurrency(m.unit_price as string),
    className: "tabular-nums",
    hideOnMobile: true,
  },
  {
    id: "amount",
    header: "金额",
    cell: (m) => formatCurrency(m.amount as string),
    className: "tabular-nums",
  },
  {
    id: "operator",
    header: "操作人",
    cell: (m) => {
      const op = m.operator as { display_name?: string } | null;
      return op?.display_name ?? "-";
    },
  },
];

// ═════════════════════════════════════════════════════════════════════

export default async function StockMovementsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("spare_part_stock_movement")
    .select(
      "*, spare_part:part_id(part_no, part_name), operator:operator_id(display_name)",
    )
    .order("operated_at", { ascending: false })
    .limit(50);

  return (
    <DataPage title="" empty={false}>
      <PageHeader title="库存流水" backUrl="/maintenance/spare-parts" />
      <DataTable
        columns={cols}
        data={(data ?? []) as Record<string, unknown>[]}
        keyExtractor={(m) => m.id as string}
        emptyMessage="暂无库存流水记录"
      />
    </DataPage>
  );
}
