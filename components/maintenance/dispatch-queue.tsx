"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { assignWorkOrder } from "@/lib/actions/maintenance";
import { formatDate } from "@/lib/utils";
import { ClipboardList, UserPlus, Loader2 } from "lucide-react";

interface WorkOrder {
  id: string; work_order_no: string; fault_description: string;
  fault_level: string; reported_at: string;
  equipment: { name: string; equipment_no: string } | null;
}

interface StaffOption { id: string; display_name: string; }

interface Props {
  orders: WorkOrder[];
  staff: StaffOption[];
}

const FAULT_LEVEL: Record<string, string> = { EMERGENCY: "紧急", URGENT: "急", NORMAL: "普通", LOW: "低" };
const FAULT_COLOR: Record<string, "danger" | "warning" | "default"> = { EMERGENCY: "danger", URGENT: "warning", NORMAL: "default", LOW: "default" };

export function DispatchQueue({ orders, staff }: Props) {
  const router = useRouter();
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [assigneeMap, setAssigneeMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const staffOptions = [
    { value: "", label: "选择维修人员..." },
    ...staff.map(s => ({ value: s.id, label: s.display_name })),
  ];

  async function doDispatch(workOrderId: string) {
    const assigneeId = assigneeMap[workOrderId];
    if (!assigneeId) { setError("请选择维修人员"); return; }
    setDispatching(workOrderId);
    setError("");
    const result = await assignWorkOrder(workOrderId, assigneeId);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error);
    }
    setDispatching(null);
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" />待派单队列</CardTitle></CardHeader>
        <div className="px-6 pb-4 text-center text-sm text-zinc-500">暂无待派单工单 ✅</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />待派单队列
        </CardTitle>
        <span className="text-sm text-zinc-500">{orders.length} 单待处理</span>
      </CardHeader>

      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>关闭</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase">工单编号</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase">设备</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase">故障描述</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase">级别</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase hidden md:table-cell">报修时间</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-zinc-500 uppercase">派单操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {orders.map((wo) => {
              const href = `/maintenance/work-orders/${wo.id}`;
              return (
              <tr
                key={wo.id}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                onClick={() => router.push(href)}
              >
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    {wo.work_order_no}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                  {wo.equipment?.name ?? "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block max-w-[150px] truncate text-zinc-600 dark:text-zinc-400" title={wo.fault_description}>
                    {wo.fault_description}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={FAULT_COLOR[wo.fault_level] ?? "default"}>
                    {FAULT_LEVEL[wo.fault_level] ?? wo.fault_level}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-zinc-500 hidden md:table-cell">
                  {formatDate(wo.reported_at)}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Select
                      value={assigneeMap[wo.id] ?? ""}
                      onChange={(e) => setAssigneeMap(prev => ({ ...prev, [wo.id]: e.target.value }))}
                      options={staffOptions}
                      className="w-36"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={dispatching === wo.id || !assigneeMap[wo.id]}
                      onClick={() => doDispatch(wo.id)}
                    >
                      {dispatching === wo.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline ml-1">派单</span>
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
