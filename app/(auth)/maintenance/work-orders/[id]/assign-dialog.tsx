"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { assignWorkOrder } from "@/lib/actions/maintenance";

interface StaffOption {
  id: string;
  display_name: string;
}

interface Props {
  workOrderId: string;
  staffOptions: StaffOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AssignDialog({ workOrderId, staffOptions, open, onOpenChange }: Props) {
  const [pending, startTransition] = useTransition();
  const [assigneeId, setAssigneeId] = useState("");

  const options = [
    { value: "", label: "请选择维修人员" },
    ...staffOptions.map((s) => ({ value: s.id, label: s.display_name })),
  ];

  function handleConfirm() {
    if (!assigneeId) return;
    startTransition(async () => {
      const result = await assignWorkOrder(workOrderId, assigneeId);
      if (result.success) {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="派单 — 选择维修人员">
      <div className="space-y-4">
        <Select
          label="维修人员"
          options={options}
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" disabled={pending || !assigneeId} onClick={handleConfirm}>
            {pending ? "处理中…" : "确认派单"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
