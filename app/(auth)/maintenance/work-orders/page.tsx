import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { DispatchQueue } from "@/components/maintenance/dispatch-queue";
import Link from "next/link";
import { Plus } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  PENDING_DISPATCH: "待派单", ASSIGNED: "已派单", IN_PROGRESS: "维修中",
  COMPLETED: "已完成", VERIFIED: "已验证", CLOSED: "已关闭", CANCELLED: "已取消",
};
const STATUS_VARIANTS: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  PENDING_DISPATCH: "warning", ASSIGNED: "info", IN_PROGRESS: "info",
  COMPLETED: "success", VERIFIED: "success", CLOSED: "default", CANCELLED: "default",
};
const FAULT_LABELS: Record<string, string> = { EMERGENCY: "紧急", URGENT: "急", NORMAL: "普通", LOW: "低" };

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; mine?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const status = sp.status || "";
  const mine = sp.mine || "";

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = "";
  let userProfileId = "";
  if (user) {
    const { data: p } = await supabase.from("profiles")
      .select("id, primary_role").eq("supabase_user_id", user.id).maybeSingle();
    userRole = p?.primary_role ?? "";
    userProfileId = p?.id ?? "";
  }

  const isSupervisor = userRole === "MAINTENANCE_SUPERVISOR";
  const isDispatchMode = isSupervisor && status === "PENDING_DISPATCH";

  // If dispatch mode: load work orders + staff for inline dispatch
  if (isDispatchMode) {
    const [{ data: orders }, { data: staff }] = await Promise.all([
      supabase.from("maintenance_work_order")
        .select("id, work_order_no, fault_description, fault_level, reported_at, equipment:equipment_id(name, equipment_no)")
        .eq("status", "PENDING_DISPATCH")
        .order("reported_at", { ascending: true }),
      supabase.from("profiles")
        .select("id, display_name")
        .in("primary_role", ["MAINTENANCE", "MAINTENANCE_SUPERVISOR"])
        .eq("account_status", "ACTIVE")
        .order("display_name"),
    ]);

    return (
      <DataPage title="待派单队列 — 工单列表" subtitle="选择维修人员并派单" empty={false}>
        <DispatchQueue
          orders={(orders ?? []) as unknown as { id: string; work_order_no: string; fault_description: string; fault_level: string; reported_at: string; equipment: { name: string; equipment_no: string } | null }[]}
          staff={(staff ?? []) as unknown as { id: string; display_name: string }[]}
        />
      </DataPage>
    );
  }

  // Regular list view
  let q = supabase
    .from("maintenance_work_order")
    .select("*, equipment:equipment_id(name, equipment_no)", { count: "exact" })
    .order("reported_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (mine && userProfileId) q = q.eq("assigned_to", userProfileId);

  const perPage = 20;
  const { data, count } = await q.range((page - 1) * perPage, page * perPage - 1);
  const totalPages = Math.ceil((count ?? 0) / perPage);

  type Row = Record<string, unknown>;
  const cols: Column<Row>[] = [
    { id: "no", header: "工单编号", cell: (w) => <span className="font-mono text-xs">{w.work_order_no as string}</span> },
    { id: "equip", header: "设备", cell: (w) => ((w.equipment as unknown as { name: string })?.name ?? "-") },
    { id: "fault", header: "故障描述", cell: (w) => <span className="block max-w-[200px] truncate">{w.fault_description as string}</span> },
    { id: "level", header: "级别", cell: (w) => {
      const lv = w.fault_level as string;
      return <Badge variant={lv === "EMERGENCY" || lv === "URGENT" ? "danger" : "default"}>{FAULT_LABELS[lv] ?? lv}</Badge>;
    }},
    { id: "status", header: "状态", cell: (w) => {
      const st = w.status as string;
      return <Badge variant={STATUS_VARIANTS[st] ?? "default"}>{STATUS_LABELS[st] ?? st}</Badge>;
    }},
    { id: "date", header: "报修时间", cell: (w) => formatDate(w.reported_at as string), hideOnMobile: true },
  ];

  const statusTabs = [
    { key: "", label: `全部`, href: "/maintenance/work-orders" },
    { key: "PENDING_DISPATCH", label: "待派单", href: "/maintenance/work-orders?status=PENDING_DISPATCH" },
    { key: "ASSIGNED", label: "已派单", href: "/maintenance/work-orders?status=ASSIGNED" },
    { key: "IN_PROGRESS", label: "维修中", href: "/maintenance/work-orders?status=IN_PROGRESS" },
    { key: "COMPLETED", label: "已完成", href: "/maintenance/work-orders?status=COMPLETED" },
    ...(mine ? [{ key: "mine", label: "我的工单", href: "/maintenance/work-orders?mine=1" }] : []),
  ];

  const title = mine ? "我的工单" : status ? `${STATUS_LABELS[status] ?? status} — 工单列表` : "维修工单";
  const activeKey = mine ? "mine" : status;

  return (
    <DataPage
      title={title}
      subtitle={`共 ${count ?? 0} 条`}
      actions={
        <Link href="/maintenance/work-orders/new">
          <Button variant="primary"><Plus className="h-4 w-4" />新建工单</Button>
        </Link>
      }
      filters={{ items: statusTabs, activeKey }}
      pagination={
        totalPages > 1
          ? { page, totalPages, baseUrl: "/maintenance/work-orders", query: status ? `status=${status}` : undefined }
          : undefined
      }
      empty={false}
    >
      <DataTable
        columns={cols}
        data={(data ?? []) as Row[]}
        keyExtractor={(w) => w.id as string}
        rowHref={(w) => `/maintenance/work-orders/${w.id}`}
        emptyMessage={status ? `暂无 ${STATUS_LABELS[status] ?? status} 状态的工单` : "暂无工单"}
      />
    </DataPage>
  );
}
