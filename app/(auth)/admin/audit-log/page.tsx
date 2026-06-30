import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  MobileCards,
  MobileCard,
  MobileRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { Search, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor: { display_name: string } | null;
};

// ─── Action badge variants ────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  ADMIN_UPDATE_PROFILE: "修改用户",
  ADMIN_ACTIVATE: "激活用户",
  ADMIN_DEACTIVATE: "停用用户",
  ADMIN_DISABLE: "禁用用户",
  ADMIN_DELETE_ACCOUNT: "删除用户",
  LOGIN: "登录",
  LOGOUT: "登出",
  CREATE: "创建",
  UPDATE: "更新",
  DELETE: "删除",
  APPROVE: "审批通过",
  REJECT: "审批拒绝",
  SUBMIT: "提交",
  EXPORT: "导出",
};

const ACTION_VARIANTS: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  ADMIN_UPDATE_PROFILE: "info",
  ADMIN_ACTIVATE: "success",
  ADMIN_DEACTIVATE: "warning",
  ADMIN_DISABLE: "danger",
  ADMIN_DELETE_ACCOUNT: "danger",
  LOGIN: "success",
  LOGOUT: "default",
  CREATE: "success",
  UPDATE: "info",
  DELETE: "danger",
  APPROVE: "success",
  REJECT: "danger",
  SUBMIT: "info",
  EXPORT: "warning",
};

const RESOURCE_LABELS: Record<string, string> = {
  PROFILE: "用户",
  RENTAL_ORDER: "租赁订单",
  RENTAL_CONTRACT: "合同",
  EQUIPMENT: "设备",
  CUSTOMER: "客户",
  PAYMENT: "付款",
  RECEIVABLE: "应收款",
  REFUND: "退款",
  MAINTENANCE_WORK_ORDER: "维修工单",
  MAINTENANCE_PLAN: "保养计划",
  SPARE_PART: "配件",
  APPROVAL_REQUEST: "审批请求",
  NOTIFICATION: "通知",
  ROLE: "角色",
  PERMISSION: "权限",
};

// ═══════════════════════════════════════════════════════════════════════

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; resource_type?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // ── Build query ───────────────────────────────────────────────────

  let query = supabase
    .from("audit_log")
    .select("*, actor:actor_id(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const selectedAction = params.action ?? "";
  const selectedResource = params.resource_type ?? "";

  if (selectedAction) {
    query = query.eq("action", selectedAction);
  }
  if (selectedResource) {
    query = query.eq("resource_type", selectedResource);
  }

  const { data: rawLogs } = await query;

  const logs = (rawLogs ?? []) as AuditLogRow[];

  // ── Unique action / resource_type values for dropdowns ────────────
  // Fetch distinct values from the dataset rather than the whole table to
  // keep the query fast, then supplement with the predefined labels.

  const { data: distinctActions } = await supabase
    .from("audit_log")
    .select("action")
    .limit(1000);

  const { data: distinctResources } = await supabase
    .from("audit_log")
    .select("resource_type")
    .limit(1000);

  const actionOptions = [
    ...new Set(
      (distinctActions ?? []).map((r) => r.action).filter(Boolean) as string[]
    ),
  ].sort();
  const resourceOptions = [
    ...new Set(
      (distinctResources ?? [])
        .map((r) => r.resource_type)
        .filter(Boolean) as string[]
    ),
  ].sort();

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="审计日志"
        subtitle="系统操作审计记录（仅查看）"
        backUrl="_back"
      />

      {/* ── Filters ──────────────────────────────────────────────── */}
      <form
        method="GET"
        className="surface-panel flex flex-wrap items-end gap-3 rounded-lg p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="action-filter"
            className="text-sm font-medium text-app-muted-strong"
          >
            操作类型
          </label>
          <select
            id="action-filter"
            name="action"
            defaultValue={selectedAction}
            className="focus-ring premium-control flex h-10 w-full min-w-[160px] rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus:border-app-accent"
          >
            <option value="">全部操作</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="resource-filter"
            className="text-sm font-medium text-app-muted-strong"
          >
            资源类型
          </label>
          <select
            id="resource-filter"
            name="resource_type"
            defaultValue={selectedResource}
            className="focus-ring premium-control flex h-10 w-full min-w-[160px] rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg focus:border-app-accent"
          >
            <option value="">全部资源</option>
            {resourceOptions.map((r) => (
              <option key={r} value={r}>
                {RESOURCE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-app-accent px-4 text-sm font-medium text-app-accent-contrast transition-colors hover:bg-app-accent-hover"
          >
            <Search className="h-4 w-4" />
            筛选
          </button>

          {(selectedAction || selectedResource) && (
            <Link
              href="/admin/audit-log"
              className="focus-ring premium-control inline-flex h-10 items-center gap-2 rounded-lg border border-app-border px-4 text-sm font-medium text-app-muted-strong transition-colors hover:text-app-fg"
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </Link>
          )}
        </div>
      </form>

      {/* ── Results ───────────────────────────────────────────────── */}
      {logs.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 p-12 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <Clock className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          暂无审计日志
          {(selectedAction || selectedResource) && (
            <p>尝试调整筛选条件</p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <Table>
            <THead>
              <Tr>
                <Th>时间</Th>
                <Th>操作人</Th>
                <Th>操作</Th>
                <Th>资源类型</Th>
                <Th>资源ID</Th>
                <Th>详情</Th>
              </Tr>
            </THead>
            <TBody>
              {logs.map((log) => (
                <Tr key={log.id}>
                  <Td className="whitespace-nowrap tabular-nums">
                    <span className="text-xs text-zinc-500">
                      {formatDateTime(log.created_at)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm">
                      {log.actor?.display_name ?? "-"}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        ACTION_VARIANTS[log.action] ??
                        "default"
                      }
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </Td>
                  <Td>
                    {log.resource_type ? (
                      <Badge variant="info">
                        {RESOURCE_LABELS[log.resource_type] ??
                          log.resource_type}
                      </Badge>
                    ) : (
                      <span className="text-sm text-zinc-400">-</span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-zinc-500">
                      {log.resource_id
                        ? truncateUuid(log.resource_id)
                        : "-"}
                    </span>
                  </Td>
                  <Td>
                    {log.detail ? (
                      <span className="block max-w-[200px] truncate font-mono text-xs text-zinc-500" title={JSON.stringify(log.detail)}>
                        {truncateJson(log.detail)}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">-</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>

          {/* Mobile cards */}
          <MobileCards>
            {logs.map((log) => (
              <MobileCard key={log.id}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {formatDateTime(log.created_at)}
                  </span>
                  <Badge
                    variant={
                      ACTION_VARIANTS[log.action] ?? "default"
                    }
                  >
                    {ACTION_LABELS[log.action] ?? log.action}
                  </Badge>
                </div>
                <MobileRow label="操作人">
                  {log.actor?.display_name ?? "-"}
                </MobileRow>
                <MobileRow label="资源类型">
                  {log.resource_type ? (
                    <Badge variant="info">
                      {RESOURCE_LABELS[log.resource_type] ??
                        log.resource_type}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </MobileRow>
                <MobileRow label="资源ID">
                  <span className="font-mono text-xs">
                    {log.resource_id
                      ? truncateUuid(log.resource_id)
                      : "-"}
                  </span>
                </MobileRow>
                {log.detail && (
                  <MobileRow label="详情">
                    <span className="block max-w-[200px] truncate font-mono text-xs text-zinc-500">
                      {truncateJson(log.detail)}
                    </span>
                  </MobileRow>
                )}
              </MobileCard>
            ))}
          </MobileCards>

          {/* Count */}
          <p className="text-sm text-zinc-500">
            显示最近{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {logs.length}
            </span>{" "}
            条日志记录
          </p>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function truncateUuid(uuid: string): string {
  if (uuid.length <= 8) return uuid;
  return `${uuid.slice(0, 8)}...`;
}

function truncateJson(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  if (str.length <= 60) return str;
  return `${str.slice(0, 60)}...`;
}
