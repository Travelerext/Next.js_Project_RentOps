"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeWorkOrder } from "@/lib/actions/maintenance";

interface Props {
  workOrderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CompleteDialog({ workOrderId, open, onOpenChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [faultCause, setFaultCause] = useState("");
  const [repairResult, setRepairResult] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [maintenanceFee, setMaintenanceFee] = useState("");
  const [outsourced, setOutsourced] = useState(false);
  const [manufacturerWarranty, setManufacturerWarranty] = useState(false);

  function handleConfirm() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("faultCause", faultCause);
      fd.set("repairResult", repairResult);
      fd.set("laborHours", String(laborHours));
      fd.set("maintenanceFee", String(maintenanceFee));
      fd.set("outsourced", outsourced ? "true" : "false");
      fd.set("manufacturerWarranty", manufacturerWarranty ? "true" : "false");

      const result = await completeWorkOrder(workOrderId, fd);
      if (result.success) {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="维修完成 — 填写维修信息">
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">故障原因</label>
          <textarea
            className="flex min-h-[60px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            value={faultCause}
            onChange={(e) => setFaultCause(e.target.value)}
            placeholder="请输入故障原因"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">维修结果</label>
          <textarea
            className="flex min-h-[60px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            value={repairResult}
            onChange={(e) => setRepairResult(e.target.value)}
            placeholder="请输入维修结果"
          />
        </div>

        <Input
          label="工时（小时）"
          type="number"
          min="0"
          step="0.5"
          value={laborHours}
          onChange={(e) => setLaborHours(e.target.value)}
          placeholder="如：2.5"
        />

        <Input
          label="维修费（元）"
          type="number"
          min="0"
          step="0.01"
          value={maintenanceFee}
          onChange={(e) => setMaintenanceFee(e.target.value)}
          placeholder="如：500"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outsourced}
            onChange={(e) => setOutsourced(e.target.checked)}
            className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-zinc-700 dark:text-zinc-300">外包维修</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manufacturerWarranty}
            onChange={(e) => setManufacturerWarranty(e.target.checked)}
            className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-zinc-700 dark:text-zinc-300">厂家保修</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={pending} onClick={handleConfirm}>
            {pending ? "处理中…" : "确认完成"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
