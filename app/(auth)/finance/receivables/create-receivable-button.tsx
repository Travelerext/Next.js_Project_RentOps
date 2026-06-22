"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createReceivable } from "@/lib/actions/finance";

const RECEIVABLE_TYPES = [
  { value: "RENT", label: "租金" },
  { value: "DEPOSIT", label: "押金" },
  { value: "DAMAGE", label: "损坏赔偿" },
  { value: "LATE_FEE", label: "滞纳金" },
  { value: "PENALTY", label: "违约金" },
  { value: "CLEANING", label: "清洁费" },
  { value: "REPAIR", label: "维修费" },
  { value: "OTHER", label: "其他" },
];

export function CreateReceivableButton() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>创建应收</Button>
      <Dialog open={open} onOpenChange={setOpen} title="创建应收">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            const fd = new FormData(e.currentTarget);
            const res = await createReceivable(fd);
            if (res.success) { setOpen(false); router.refresh(); }
            else setError(res.error);
            setSubmitting(false);
          }}
          className="space-y-4"
        >
          <Input label="客户ID" name="customerId" placeholder="输入客户ID" required />
          <Select label="应收类型" name="receivableType" options={RECEIVABLE_TYPES} defaultValue="OTHER" />
          <Input label="金额" name="amount" type="number" step="0.01" min="0.01" required />
          <Input label="到期日" name="dueDate" type="date" />
          <Input label="描述" name="description" placeholder="费用说明（可选）" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>{submitting ? "创建中..." : "确认创建"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
