"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { markNotificationRead } from "@/lib/actions/notification";
import { Bell, CheckCheck, FileText, AlertTriangle, Calendar, Wrench, DollarSign, Package } from "lucide-react";

type NotifRow = Record<string, unknown>;

const TYPE_LABELS: Record<string, string> = {
  APPROVAL_PENDING: "审批待办", APPROVAL_RESULT: "审批结果",
  CONTRACT_EXPIRING: "合同到期", CONTRACT_OVERDUE: "合同逾期",
  RECEIVABLE_OVERDUE: "应收逾期",
  EQUIPMENT_OUTBOUND: "设备出库", EQUIPMENT_INBOUND: "设备入库",
  MAINTENANCE_ASSIGNED: "维修派单", MAINTENANCE_DUE: "保养到期",
  INSURANCE_EXPIRING: "保险到期", INSPECTION_EXPIRING: "年检到期",
  LOW_STOCK: "低库存预警", REFUND_APPLICATION: "退款申请",
};

const TYPE_ICONS: Record<string, typeof Bell> = {
  APPROVAL_PENDING: FileText, APPROVAL_RESULT: CheckCheck,
  CONTRACT_EXPIRING: Calendar, CONTRACT_OVERDUE: AlertTriangle,
  RECEIVABLE_OVERDUE: DollarSign,
  EQUIPMENT_OUTBOUND: Package, EQUIPMENT_INBOUND: Package,
  MAINTENANCE_ASSIGNED: Wrench, MAINTENANCE_DUE: Calendar,
  LOW_STOCK: AlertTriangle, REFUND_APPLICATION: DollarSign,
};

function getNotifHref(n: NotifRow): string {
  const bt = n.business_type as string | undefined;
  const bid = n.business_id as string | undefined;
  if (!bid || !bt) return "";

  const routes: Record<string, string> = {
    ORDER: `/sales/orders/${bid}`,
    OUTBOUND: `/sales/orders/${bid}`,
    CONTRACT: `/sales/contracts/${bid}`,
    CONTRACT_ACTIVATE: `/sales/contracts/${bid}`,
    MAINTENANCE: `/maintenance/work-orders/${bid}`,
    EQUIPMENT: `/equipment/catalog/${bid}`,
    SPARE_PART: `/maintenance/spare-parts/${bid}`,
    REFUND: `/finance/settlement/${bid}`,
    SETTLEMENT: `/finance/settlement/${bid}`,
    PAYMENT: `/finance/settlements`,
  };
  return routes[bt] ?? "";
}

interface Props {
  notifications: NotifRow[];
}

export function NotificationsClient({ notifications }: Props) {
  const router = useRouter();

  const handleRowClick = useCallback(
    async (n: NotifRow) => {
      const id = n.id as string;
      const href = getNotifHref(n);
      markNotificationRead(id);
      if (href) router.push(href);
    },
    [router]
  );

  const columns: Column<NotifRow>[] = [
    {
      id: "type", header: "类型", cell: n => {
        const t = n.notification_type as string;
        const Icon = TYPE_ICONS[t] ?? Bell;
        return (
          <Badge variant={t.includes("OVERDUE") || t.includes("EXPIRING") ? "danger" : t.includes("APPROVAL") ? "warning" : t === "LOW_STOCK" ? "danger" : "info"}>
            <span className="flex items-center gap-1"><Icon className="h-3 w-3" />{TYPE_LABELS[t] ?? t}</span>
          </Badge>
        );
      },
    },
    { id: "title", header: "标题", cell: n => <span className={n.is_read ? "" : "font-semibold"}>{n.title as string}</span> },
    { id: "content", header: "内容", cell: n => <span className="text-xs text-zinc-500 line-clamp-2">{(n.content as string)?.slice(0, 100) ?? "-"}</span>, hideOnMobile: true },
    { id: "time", header: "时间", cell: n => <span className="text-xs whitespace-nowrap">{formatDateTime(n.created_at as string)}</span> },
    { id: "status", header: "", cell: n =>
      n.is_read ? <Badge variant="default">已读</Badge> : <Badge variant="success" pulse>未读</Badge>
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={notifications}
      keyExtractor={n => n.id as string}
      onRowClick={handleRowClick}
      rowClassName={n => n.is_read ? "" : "bg-blue-50/50 dark:bg-blue-900/10"}
      emptyMessage="暂无通知"
    />
  );
}
