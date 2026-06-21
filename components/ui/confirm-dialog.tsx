"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; message: React.ReactNode; confirmLabel: string;
  variant?: "primary" | "destructive"; loading?: boolean; onConfirm: () => void;
}

export function ConfirmDialog({ open, onOpenChange, title, message, confirmLabel, variant = "primary", loading, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-zinc-600 dark:text-zinc-300">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant={variant} disabled={loading} onClick={onConfirm}>{loading ? "处理中…" : confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}
