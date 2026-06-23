import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { ActionButtons } from "./action-buttons";
import Link from "next/link";
import { Wrench, Clock } from "lucide-react";

// ─── Labels ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PENDING_DISPATCH: "待派单",
  ASSIGNED: "已派单",
  IN_PROGRESS: "维修中",
  COMPLETED: "已完成",
  VERIFIED: "已验证",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
};

const STATUS_VARIANTS: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  PENDING_DISPATCH: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  VERIFIED: "success",
  CLOSED: "default",
  CANCELLED: "danger",
};

const FAULT_LEVELS: Record<string, string> = {
  EMERGENCY: "紧急（停机）",
  URGENT: "急",
  NORMAL: "普通",
  LOW: "低",
};

const STEPS = ["PENDING_DISPATCH", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "VERIFIED", "CLOSED"];

// ─── Types ────────────────────────────────────────────────────────────

type WorkOrder = {
  id: string; work_order_no: string; status: string;
  fault_description: string; fault_level: string;
  stopped: boolean; affects_construction: boolean;
  reported_at: string; assigned_at: string | null;
  repair_started_at: string | null; repair_finished_at: string | null;
  fault_cause: string | null; repair_result: string | null;
  labor_hours: number; maintenance_fee: number; parts_fee: number;
  outsourced: boolean; manufacturer_warranty: boolean;
  equipment: { equipment_no: string; name: string } | null;
  reporter: { display_name: string } | null;
  assignee: { display_name: string } | null;
};

type StaffRow = { id: string; display_name: string };

// ═══════════════════════════════════════════════════════════════════════

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user for role-based actions
  const { data: { user } } = await supabase.auth.getUser();
  let currentUserRole = "";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("primary_role")
      .eq("supabase_user_id", user.id).maybeSingle();
    currentUserRole = profile?.primary_role ?? "";
  }

  const [
    { data: wo },
    { data: movements },
    { data: staff },
  ] = await Promise.all([
    supabase
      .from("maintenance_work_order")
      .select("*, equipment:equipment_id(equipment_no, name), reporter:reported_by(display_name), assignee:assigned_to(display_name)")
      .eq("id", id)
      .single(),
    supabase
      .from("spare_part_stock_movement")
      .select("*, part:part_id(part_no, part_name, unit)")
      .eq("business_type", "MAINTENANCE")
      .eq("business_id", id)
      .order("operated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("primary_role", ["MAINTENANCE", "MAINTENANCE_SUPERVISOR"])
      .eq("account_status", "ACTIVE"),
  ]);

  if (!wo) {
    return (
      <DirectionalTransition>
        <div className="text-center py-12">
          <p className="text-zinc-500">工单不存在</p>
          <Link href="/maintenance/work-orders" className="text-blue-600 hover:underline">返回列表</Link>
        </div>
      </DirectionalTransition>
    );
  }

  const order = wo as unknown as WorkOrder;
  const equipment = order.equipment;
  const reporter = order.reporter;
  const assignee = order.assignee;
  const staffOptions = (staff ?? []) as StaffRow[];
  const currentStepIdx = STEPS.indexOf(order.status);

  return (
    <DirectionalTransition>
      <div className="space-y-6">
        <PageHeader
          title={order.work_order_no}
          subtitle={`设备: ${equipment?.name ?? "-"} (${equipment?.equipment_no ?? "-"})`}
          backUrl="_back"
          status={
            <Badge variant={STATUS_VARIANTS[order.status] ?? "default"}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          }
        />

        {/* ── Status timeline ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />工单进度
            </CardTitle>
          </CardHeader>
          <div className="px-4 md:px-6 pb-4">
            <div className="flex items-center flex-wrap gap-1 text-xs">
              {STEPS.map((s, i) => {
                const done = i < currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                        active
                          ? "bg-blue-600 text-white"
                          : done
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {done ? "✓" : ""} {STATUS_LABELS[s]}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="text-zinc-300 dark:text-zinc-600 mx-0.5">→</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* ── Fault info ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />故障信息
              </CardTitle>
            </CardHeader>
            <InfoGrid
              items={[
                { label: "故障描述", value: order.fault_description },
                { label: "故障级别", value: <Badge variant={order.fault_level === "EMERGENCY" || order.fault_level === "URGENT" ? "danger" : "default"}>{FAULT_LEVELS[order.fault_level] ?? order.fault_level}</Badge> },
                { label: "设备停机", value: order.stopped ? "是" : "否" },
                { label: "影响施工", value: order.affects_construction ? "是" : "否" },
                { label: "报修人", value: reporter?.display_name ?? "-" },
                { label: "报修时间", value: formatDate(order.reported_at) },
              ]}
              columns={1}
            />
          </Card>

          {/* ── Repair info ───────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>维修信息</CardTitle>
            </CardHeader>
            <InfoGrid
              items={[
                { label: "维修人", value: assignee?.display_name ?? "未派单" },
                { label: "派单时间", value: formatDate(order.assigned_at) },
                { label: "开始维修", value: formatDate(order.repair_started_at) },
                { label: "维修完成", value: formatDate(order.repair_finished_at) },
                { label: "故障原因", value: order.fault_cause ?? "-" },
                { label: "维修结果", value: order.repair_result ?? "-" },
                { label: "工时", value: `${order.labor_hours}h` },
                { label: "维修费", value: formatCurrency(order.maintenance_fee) },
                { label: "配件费", value: formatCurrency(order.parts_fee) },
                { label: "总费用", value: <strong>{formatCurrency(Number(order.maintenance_fee) + Number(order.parts_fee))}</strong> },
                { label: "外包", value: order.outsourced ? "是" : "否" },
                { label: "厂家保修", value: order.manufacturer_warranty ? "是" : "否" },
              ]}
              columns={1}
            />
          </Card>
        </div>

        {/* ── Parts used ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>配件领用记录</CardTitle>
          </CardHeader>
          <div className="px-4 md:px-6 pb-4">
            <DataTable
              columns={[
                { id: "no", header: "配件编号", cell: (m) => ((m as Record<string, unknown>).part as { part_no: string })?.part_no ?? "-" },
                { id: "name", header: "配件名称", cell: (m) => ((m as Record<string, unknown>).part as { part_name: string })?.part_name ?? "-" },
                { id: "qty", header: "数量", cell: (m) => <span className="tabular-nums">{(m as Record<string, unknown>).quantity as string}</span> },
                { id: "price", header: "单价", cell: (m) => <span className="tabular-nums">{formatCurrency((m as Record<string, unknown>).unit_price as string)}</span>, hideOnMobile: true },
                { id: "amount", header: "金额", cell: (m) => <span className="tabular-nums">{formatCurrency((m as Record<string, unknown>).amount as string)}</span> },
                { id: "time", header: "时间", cell: (m) => formatDate((m as Record<string, unknown>).operated_at as string), hideOnMobile: true },
              ] as Column<Record<string, unknown>>[]}
              data={(movements ?? []) as Record<string, unknown>[]}
              keyExtractor={(m) => (m as Record<string, unknown>).id as string}
              emptyMessage="暂未领用配件"
            />
          </div>
        </Card>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>操作</CardTitle>
          </CardHeader>
          <div className="px-4 md:px-6 pb-4">
            <ActionButtons workOrderId={id} status={order.status} staffOptions={staffOptions} userRole={currentUserRole} />
          </div>
        </Card>
      </div>
    </DirectionalTransition>
  );
}
