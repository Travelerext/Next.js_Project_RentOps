import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, CalendarClock } from "lucide-react";

function calcOverdueDays(plannedEndAt: string): number {
  const end = new Date(plannedEndAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - end.getTime()) / 86400000));
}

export default async function RemindersPage() {
  const supabase = await createClient();

  const today = new Date().toISOString();
  const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString();

  const [{ data: expiringOrders }, { data: overdueOrders }] =
    await Promise.all([
      supabase
        .from("rental_order")
        .select("*,customer:customer_id(name)")
        .eq("order_status", "IN_PROGRESS")
        .gte("planned_end_at", today)
        .lte("planned_end_at", sevenDaysLater)
        .order("planned_end_at", { ascending: true }),
      supabase
        .from("rental_order")
        .select("*,customer:customer_id(name)")
        .eq("order_status", "OVERDUE")
        .order("planned_end_at", { ascending: true }),
    ]);

  const orderIds = [
    ...(expiringOrders ?? []).map((o) => o.id),
    ...(overdueOrders ?? []).map((o) => o.id),
  ];

  let itemCountMap: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("rental_order_item")
      .select("order_id, quantity")
      .in("order_id", orderIds);

    for (const item of items ?? []) {
      itemCountMap[item.order_id] =
        (itemCountMap[item.order_id] ?? 0) + Number(item.quantity ?? 1);
    }
  }

  type OrderRow = Record<string, unknown>;

  const expiringCols: Column<OrderRow>[] = [
    {
      id: "no",
      header: "订单编号",
      cell: (o) => o.order_no as string,
      shareIdentity: (o) => "order-" + o.id,
    },
    {
      id: "customer",
      header: "客户",
      cell: (o) => ((o.customer as { name: string })?.name ?? "-"),
    },
    {
      id: "equipment",
      header: "设备数量",
      cell: (o) => String(itemCountMap[o.id as string] ?? "-"),
      className: "tabular-nums",
    },
    {
      id: "end",
      header: "计划归还",
      cell: (o) => formatDate(o.planned_end_at as string),
    },
    {
      id: "status",
      header: "状态",
      cell: () => <Badge variant="warning">即将到期</Badge>,
    },
  ];

  const overdueCols: Column<OrderRow>[] = [
    {
      id: "no",
      header: "订单编号",
      cell: (o) => o.order_no as string,
      shareIdentity: (o) => "order-" + o.id,
    },
    {
      id: "customer",
      header: "客户",
      cell: (o) => ((o.customer as { name: string })?.name ?? "-"),
    },
    {
      id: "equipment",
      header: "设备数量",
      cell: (o) => String(itemCountMap[o.id as string] ?? "-"),
      className: "tabular-nums",
    },
    {
      id: "end",
      header: "计划归还",
      cell: (o) => formatDate(o.planned_end_at as string),
    },
    {
      id: "overdue",
      header: "逾期天数",
      cell: (o) => (
        <span className="font-medium text-red-600">
          {calcOverdueDays(o.planned_end_at as string)}天
        </span>
      ),
      className: "tabular-nums",
    },
  ];

  const expiringCount = expiringOrders?.length ?? 0;
  const overdueCount = overdueOrders?.length ?? 0;

  return (
    <DataPage
      title="催还提醒"
      subtitle={expiringCount + " 单即将到期 · " + overdueCount + " 单已逾期"}
      empty={false}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-500" />
            即将到期
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={expiringCols}
          data={(expiringOrders ?? []) as OrderRow[]}
          keyExtractor={(o) => o.id as string}
          rowHref={(o) => "/sales/orders/" + o.id}
          emptyMessage="暂无即将到期的订单"
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            已逾期
          </CardTitle>
        </CardHeader>
        <DataTable
          columns={overdueCols}
          data={(overdueOrders ?? []) as OrderRow[]}
          keyExtractor={(o) => o.id as string}
          rowHref={(o) => "/sales/orders/" + o.id}
          emptyMessage="暂无逾期订单"
        />
      </Card>
    </DataPage>
  );
}
