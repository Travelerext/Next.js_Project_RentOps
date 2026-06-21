"use client";

import { useActionState, useEffect, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { updateAccount } from "@/lib/actions/admin";

// ─── Supabase returns snake_case keys ──────────────────────────────

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  employee_no: string | null;
  phone: string | null;
  primary_role: string | null;
  account_type: string;
  remark: string | null;
}

// ─── Options (defined locally — "use server" exports can't be
//      iterated in client components) ────────────────────────────────

const ROLE_OPTIONS: { value: string; label: string }[] = Object.entries(
  ROLE_LABELS
).map(([value, label]) => ({ value, label }));

const ACCOUNT_TYPE_LIST = [
  { value: "INTERNAL_STAFF", label: "内部员工" },
  { value: "EXTERNAL_CUSTOMER", label: "外部客户" },
  { value: "SERVICE_PROVIDER", label: "服务商" },
];

// ─── Props ──────────────────────────────────────────────────────────

interface EditUserDialogProps {
  profile: ProfileRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// ═══════════════════════════════════════════════════════════════════
export function EditUserDialog({
  profile,
  open,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const [editState, editAction, editPending] = useActionState(
    updateAccount,
    null
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // Handle success: notify parent immediately, auto-close after delay
  useEffect(() => {
    if (editState?.success && open) {
      onSaved();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onClose();
      }, 1200);
    }
  }, [editState?.success]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  // ── Derived state ────────────────────────────────────────────────
  const fieldErrors: Record<string, string | undefined> = {};
  if (editState && !editState.success && editState.fieldErrors) {
    for (const [key, msgs] of Object.entries(editState.fieldErrors)) {
      if (msgs.length > 0) fieldErrors[key] = msgs[0];
    }
  }
  const formError = editState && !editState.success ? editState.error : null;
  const isSuccess = editState?.success ?? false;

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      title={`编辑用户 — ${profile.username}`}
    >
      <form action={editAction} className="space-y-4">
        <input type="hidden" name="profileId" value={profile.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="displayName"
            name="displayName"
            label="显示名称 *"
            defaultValue={profile.display_name ?? ""}
            error={fieldErrors.displayName}
            required
          />
          <Input
            id="phone"
            name="phone"
            label="手机号"
            defaultValue={profile.phone ?? ""}
            error={fieldErrors.phone}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="employeeNo"
            name="employeeNo"
            label="工号"
            defaultValue={profile.employee_no ?? ""}
            error={fieldErrors.employeeNo}
          />
          <Select
            id="primaryRole"
            name="primaryRole"
            label="角色"
            options={ROLE_OPTIONS}
            defaultValue={profile.primary_role ?? ""}
            error={fieldErrors.primaryRole}
          />
        </div>

        <Select
          id="accountType"
          name="accountType"
          label="类型"
          options={ACCOUNT_TYPE_LIST}
          defaultValue={profile.account_type ?? "INTERNAL_STAFF"}
          error={fieldErrors.accountType}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="remark"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            备注
          </label>
          <textarea
            id="remark"
            name="remark"
            rows={3}
            defaultValue={profile.remark ?? ""}
            className="flex w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {fieldErrors.remark && (
            <p className="text-xs text-red-500">{fieldErrors.remark}</p>
          )}
        </div>

        {formError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </div>
        )}
        {isSuccess && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            保存成功 ✓
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={editPending}
            onClick={onClose}
          >
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={editPending}>
            {editPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
