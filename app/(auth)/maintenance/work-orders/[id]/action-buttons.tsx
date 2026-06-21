"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AssignDialog } from "./assign-dialog";
import { CompleteDialog } from "./complete-dialog";
import { PartsDialog } from "./parts-dialog";
import { startRepair, verifyWorkOrder, closeWorkOrder } from "@/lib/actions/maintenance";
import { UserPlus, Play, CheckCircle, ClipboardCheck, Archive, Package } from "lucide-react";

interface StaffOption { id: string; display_name: string; }

interface Props {
  workOrderId: string;
  status: string;
  staffOptions: StaffOption[];
  /** Current user's primary_role */
  userRole?: string;
}

export function ActionButtons({ workOrderId, status, staffOptions, userRole }: Props) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSupervisor = userRole === "MAINTENANCE_SUPERVISOR";
  const isWorker = userRole === "MAINTENANCE" || userRole === "MAINTENANCE_SUPERVISOR";

  async function doAction(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      const result = await fn() as { success: boolean; error?: string };
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>关闭</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* 派单：仅维修主管 */}
        {status === "PENDING_DISPATCH" && isSupervisor && (
          <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => setAssignOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />派单
          </Button>
        )}
        {status === "PENDING_DISPATCH" && !isSupervisor && (
          <span className="text-sm text-zinc-500 self-center">待主管派单</span>
        )}

        {/* 开始维修：维修人员/主管均可 */}
        {status === "ASSIGNED" && isWorker && (
          <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => doAction("开始维修", () => startRepair(workOrderId))}>
            {busy === "开始维修" ? "处理中…" : <><Play className="h-3.5 w-3.5 mr-1" />开始维修</>}
          </Button>
        )}
        {status === "ASSIGNED" && !isWorker && (
          <span className="text-sm text-zinc-500 self-center">已派单，等待维修人员处理</span>
        )}

        {/* 维修中 */}
        {status === "IN_PROGRESS" && isWorker && (
          <>
            <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => setCompleteOpen(true)}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" />维修完成
            </Button>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setPartsOpen(true)}>
              <Package className="h-3.5 w-3.5 mr-1" />领用配件
            </Button>
          </>
        )}

        {/* 验收：仅维修主管 */}
        {status === "COMPLETED" && isSupervisor && (
          <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => doAction("验收通过", () => verifyWorkOrder(workOrderId))}>
            {busy === "验收通过" ? "处理中…" : <><ClipboardCheck className="h-3.5 w-3.5 mr-1" />验收通过</>}
          </Button>
        )}
        {status === "COMPLETED" && !isSupervisor && (
          <span className="text-sm text-zinc-500 self-center">等待主管验收</span>
        )}

        {/* 关闭：维修主管或管理员 */}
        {status === "VERIFIED" && isSupervisor && (
          <Button variant="default" size="sm" disabled={busy !== null} onClick={() => doAction("关闭工单", () => closeWorkOrder(workOrderId))}>
            {busy === "关闭工单" ? "处理中…" : <><Archive className="h-3.5 w-3.5 mr-1" />关闭工单</>}
          </Button>
        )}

        {status === "CLOSED" && <span className="text-sm text-zinc-500 self-center">✅ 工单已关闭</span>}
        {status === "CANCELLED" && <span className="text-sm text-zinc-500 self-center">❌ 工单已取消</span>}
      </div>

      <AssignDialog workOrderId={workOrderId} staffOptions={staffOptions} open={assignOpen} onOpenChange={setAssignOpen} />
      <CompleteDialog workOrderId={workOrderId} open={completeOpen} onOpenChange={setCompleteOpen} />
      <PartsDialog workOrderId={workOrderId} open={partsOpen} onOpenChange={setPartsOpen} />
    </div>
  );
}
