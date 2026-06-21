"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  MobileCards,
  MobileCard,
  MobileCardRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/constants";
import {
  toggleAccountStatus,
  deleteAccount,
  type AccountStatusAction,
} from "@/lib/actions/admin";
import { EditUserDialog } from "./edit-user-dialog";

// ─── Supabase returns snake_case keys ──────────────────────────────

interface ProfileRow {
  id: string;
  supabase_user_id: string;
  username: string;
  display_name: string;
  employee_no: string | null;
  phone: string | null;
  email: string | null;
  primary_role: string | null;
  account_type: string;
  account_status: string;
  login_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  remark: string | null;
}

// ─── Status action labels ──────────────────────────────────────────

const ACTION_LABEL: Record<AccountStatusAction, string> = {
  activate: "激活",
  deactivate: "停用",
  disable: "禁用",
};

// ─── Dialog state machine ──────────────────────────────────────────

type DialogState =
  | { type: "none" }
  | { type: "edit"; profile: ProfileRow }
  | { type: "confirmStatus"; profile: ProfileRow; action: AccountStatusAction }
  | { type: "confirmDelete"; profile: ProfileRow };

// ─── Props ─────────────────────────────────────────────────────────

interface UsersTableProps {
  profiles: ProfileRow[];
  adminProfileId: string;
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function StatusBadge({
  status,
  loginEnabled,
}: {
  status: string;
  loginEnabled: boolean;
}) {
  if (status === "ACTIVE" && loginEnabled) {
    return <Badge variant="success">正常</Badge>;
  }
  if (status === "ACTIVE" && !loginEnabled) {
    return <Badge variant="warning">已停用</Badge>;
  }
  if (status === "DISABLED") {
    return <Badge variant="danger">已禁用</Badge>;
  }
  if (status === "PENDING") {
    return <Badge variant="default">待审核</Badge>;
  }
  return <Badge variant="default">{status}</Badge>;
}

function AccountTypeLabel({ type }: { type: string | null }) {
  if (type === "INTERNAL_STAFF") return "内部员工";
  if (type === "EXTERNAL_CUSTOMER") return "外部客户";
  return type ?? "—";
}

// ═══════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════
export function UsersTable({ profiles, adminProfileId }: UsersTableProps) {
  const router = useRouter();
  const pathname = usePathname();

  // ── State ───────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Search filter ───────────────────────────────────────────────
  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const q = searchQuery.trim().toLowerCase();
    return profiles.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q)
    );
  }, [profiles, searchQuery]);

  // ── Message helpers ─────────────────────────────────────────────

  const showMessage = useCallback(
    (msg: { type: "error" | "success"; text: string }) => {
      if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
      setMessage(msg);
      messageTimerRef.current = setTimeout(() => {
        setMessage(null);
      }, msg.type === "error" ? 5000 : 3000);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current);
    };
  }, []);

  // ── Keyboard shortcut: Ctrl+K / Cmd+K → focus search ────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Action handlers ─────────────────────────────────────────────

  const handleStatusConfirm = useCallback(async () => {
    if (dialog.type !== "confirmStatus") return;
    const { profile, action } = dialog;

    setActionLoading(profile.id);
    const result = await toggleAccountStatus(profile.id, action);
    setActionLoading(null);

    if (result.success) {
      showMessage({ type: "success", text: `${ACTION_LABEL[action]}成功` });
      setDialog({ type: "none" });
      router.replace(pathname);
    } else {
      showMessage({ type: "error", text: result.error });
      setDialog({ type: "none" });
    }
  }, [dialog, showMessage, router, pathname]);

  const handleDeleteConfirm = useCallback(async () => {
    if (dialog.type !== "confirmDelete") return;
    const { profile } = dialog;

    setActionLoading(profile.id);
    const result = await deleteAccount(profile.id);
    setActionLoading(null);

    if (result.success) {
      showMessage({ type: "success", text: `已删除 ${profile.display_name}` });
      setDialog({ type: "none" });
      router.replace(pathname);
    } else {
      showMessage({ type: "error", text: result.error });
      setDialog({ type: "none" });
    }
  }, [dialog, showMessage, router, pathname]);

  const handleEditSaved = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  const closeDialog = useCallback(() => setDialog({ type: "none" }), []);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ═══ Top bar: search + count ═══ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索用户名、姓名、手机号… (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-3 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          共{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {filteredProfiles.length}
          </span>
          {" "}个用户
          {searchQuery && (
            <span>
              {" "}（共 {profiles.length} 个）
            </span>
          )}
        </span>
      </div>

      {/* ═══ Global message ═══ */}
      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
              : "rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
          }
        >
          {message.text}
        </div>
      )}

      {/* ═══ Table ═══ */}
      {filteredProfiles.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 p-12 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {searchQuery ? "没有匹配的用户" : "暂无用户数据"}
        </div>
      ) : (
        <>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>用户名</TableHeader>
              <TableHeader>姓名</TableHeader>
              <TableHeader>角色</TableHeader>
              <TableHeader>类型</TableHeader>
              <TableHeader>状态</TableHeader>
              <TableHeader>创建时间</TableHeader>
              <TableHeader>操作</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProfiles.map((p) => {
              const isSelf = p.id === adminProfileId;
              const isBusy = actionLoading !== null;

              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.username}
                    {isSelf && (
                      <span className="ml-1.5 text-xs text-zinc-400">
                        (当前用户)
                      </span>
                    )}
                  </TableCell>

                  <TableCell>{p.display_name}</TableCell>

                  <TableCell>
                    <Badge variant={p.primary_role ? "info" : "default"}>
                      {ROLE_LABELS[p.primary_role ?? ""] ?? p.primary_role ?? "未分配"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <AccountTypeLabel type={p.account_type} />
                  </TableCell>

                  <TableCell>
                    <StatusBadge
                      status={p.account_status}
                      loginEnabled={p.login_enabled}
                    />
                  </TableCell>

                  <TableCell className="text-sm text-zinc-500">
                    {formatDate(p.created_at)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => setDialog({ type: "edit", profile: p })}
                      >
                        编辑
                      </Button>

                      {!isSelf && (
                        <StatusActionButtons
                          profile={p}
                          disabled={isBusy}
                          onAction={(action) =>
                            setDialog({
                              type: "confirmStatus",
                              profile: p,
                              action,
                            })
                          }
                        />
                      )}

                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isSelf || isBusy}
                        onClick={() =>
                          setDialog({ type: "confirmDelete", profile: p })
                        }
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* ═══ Mobile cards ═══ */}
        <MobileCards>
          {filteredProfiles.map((p) => {
            const isSelf = p.id === adminProfileId;
            const isBusy = actionLoading !== null;
            return (
              <MobileCard key={p.id}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.username}{isSelf && <span className="ml-1 text-xs text-zinc-400">(当前用户)</span>}</span>
                  <StatusBadge status={p.account_status} loginEnabled={p.login_enabled} />
                </div>
                <MobileCardRow label="姓名">{p.display_name}</MobileCardRow>
                <MobileCardRow label="角色">{ROLE_LABELS[p.primary_role ?? ""] ?? p.primary_role ?? "未分配"}</MobileCardRow>
                <MobileCardRow label="类型"><AccountTypeLabel type={p.account_type} /></MobileCardRow>
                <MobileCardRow label="创建时间">{formatDate(p.created_at)}</MobileCardRow>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                  <Button variant="outline" size="sm" disabled={isBusy} onClick={() => setDialog({ type: "edit", profile: p })}>编辑</Button>
                  {!isSelf && <StatusActionButtons profile={p} disabled={isBusy} onAction={(action) => setDialog({ type: "confirmStatus", profile: p, action })} />}
                  <Button variant="destructive" size="sm" disabled={isSelf || isBusy} onClick={() => setDialog({ type: "confirmDelete", profile: p })}>删除</Button>
                </div>
              </MobileCard>
            );
          })}
        </MobileCards>
        </>
      )}

      {/* ═══ Edit Dialog ═══ */}
      {dialog.type === "edit" && (
        <EditUserDialog
          profile={dialog.profile}
          open
          onClose={closeDialog}
          onSaved={handleEditSaved}
        />
      )}

      {/* ═══ Confirm Status Dialog ═══ */}
      <ConfirmDialog
        open={dialog.type === "confirmStatus"}
        onOpenChange={closeDialog}
        title="确认操作"
        message={
          <span>
            确定要{ACTION_LABEL[dialog.type === "confirmStatus" ? dialog.action : "activate"]}用户{" "}
            <strong>
              {dialog.type === "confirmStatus" ? dialog.profile.display_name : ""}
            </strong>{" "}
            吗？
          </span>
        }
        confirmLabel={
          dialog.type === "confirmStatus"
            ? `确认${ACTION_LABEL[dialog.action]}`
            : "确认"
        }
        variant={dialog.type === "confirmStatus" && dialog.action === "disable" ? "destructive" : "primary"}
        loading={dialog.type === "confirmStatus" && actionLoading === dialog.profile.id}
        onConfirm={handleStatusConfirm}
      />

      {/* ═══ Confirm Delete Dialog ═══ */}
      <ConfirmDialog
        open={dialog.type === "confirmDelete"}
        onOpenChange={closeDialog}
        title="确认删除"
        message={
          <span>
            确定要删除用户{" "}
            <strong>
              {dialog.type === "confirmDelete" ? dialog.profile.display_name : ""}
            </strong>{" "}
            吗？此操作将彻底删除账号且不可恢复。
          </span>
        }
        confirmLabel="确认删除"
        variant="destructive"
        loading={dialog.type === "confirmDelete" && actionLoading === dialog.profile.id}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// StatusActionButtons
// ═══════════════════════════════════════════════════════════════════
function StatusActionButtons({
  profile,
  disabled,
  onAction,
}: {
  profile: ProfileRow;
  disabled: boolean;
  onAction: (action: AccountStatusAction) => void;
}) {
  const isActive = profile.account_status === "ACTIVE" && profile.login_enabled;

  if (isActive) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onAction("deactivate")}
        >
          停用
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onAction("disable")}
        >
          禁用
        </Button>
      </>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={() => onAction("activate")}
    >
      激活
    </Button>
  );
}
