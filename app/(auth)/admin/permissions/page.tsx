import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
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
import { Shield, FileKey } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

type PermissionRow = {
  id: string;
  permission_code: string;
  permission_name: string;
  module_code: string;
  permission_type: string;
  description: string | null;
  enabled: boolean;
  sensitive: boolean;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Labels ───────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  MENU: "菜单",
  API: "接口",
  BUTTON: "按钮",
  DATA: "数据",
  SENSITIVE: "敏感",
};

const TYPE_VARIANTS: Record<
  string,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  MENU: "default",
  API: "info",
  BUTTON: "warning",
  DATA: "success",
  SENSITIVE: "danger",
};

// ═══════════════════════════════════════════════════════════════════════

export default async function AdminPermissionsPage() {
  const supabase = await createClient();

  const { data: rawPermissions } = await supabase
    .from("permission")
    .select("*")
    .order("module_code", { ascending: true })
    .order("permission_code", { ascending: true });

  const permissions = (rawPermissions ?? []) as PermissionRow[];

  // Group by module_code
  const grouped = permissions.reduce<Record<string, PermissionRow[]>>(
    (acc, p) => {
      if (!acc[p.module_code]) acc[p.module_code] = [];
      acc[p.module_code].push(p);
      return acc;
    },
    {}
  );

  const moduleKeys = Object.keys(grouped).sort();

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="权限管理"
        subtitle={`共 ${permissions.length} 项权限 · ${moduleKeys.length} 个模块`}
        backUrl="/admin"
      />

      {permissions.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 p-12 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          暂无权限数据
        </div>
      ) : (
        <div className="space-y-6">
          {moduleKeys.map((moduleCode) => {
            const items = grouped[moduleCode];
            return (
              <Card key={moduleCode}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    {moduleCode}
                    <span className="ml-2 text-sm font-normal text-zinc-500">
                      ({items.length} 项)
                    </span>
                  </CardTitle>
                </CardHeader>

                {/* Desktop table */}
                <Table>
                  <THead>
                    <Tr>
                      <Th>权限编码</Th>
                      <Th>权限名称</Th>
                      <Th>类型</Th>
                      <Th>状态</Th>
                      <Th>敏感标记</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {items.map((p) => (
                      <Tr key={p.id}>
                        <Td>
                          <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                            {p.permission_code}
                          </span>
                        </Td>
                        <Td className="font-medium">{p.permission_name}</Td>
                        <Td>
                          <Badge
                            variant={
                              TYPE_VARIANTS[p.permission_type] ?? "default"
                            }
                          >
                            {TYPE_LABELS[p.permission_type] ??
                              p.permission_type}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            variant={p.enabled ? "success" : "danger"}
                          >
                            {p.enabled ? "启用" : "停用"}
                          </Badge>
                        </Td>
                        <Td>
                          {p.sensitive ? (
                            <Badge variant="danger">敏感</Badge>
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
                  {items.map((p) => (
                    <MobileCard key={p.id}>
                      <MobileRow label="编码">
                        <span className="font-mono text-xs">
                          {p.permission_code}
                        </span>
                      </MobileRow>
                      <MobileRow label="名称">
                        {p.permission_name}
                      </MobileRow>
                      <MobileRow label="类型">
                        <Badge
                          variant={
                            TYPE_VARIANTS[p.permission_type] ?? "default"
                          }
                        >
                          {TYPE_LABELS[p.permission_type] ??
                            p.permission_type}
                        </Badge>
                      </MobileRow>
                      <MobileRow label="状态">
                        <Badge
                          variant={p.enabled ? "success" : "danger"}
                        >
                          {p.enabled ? "启用" : "停用"}
                        </Badge>
                      </MobileRow>
                      {p.sensitive && (
                        <MobileRow label="敏感标记">
                          <Badge variant="danger">敏感</Badge>
                        </MobileRow>
                      )}
                      {p.description && (
                        <MobileRow label="描述">
                          {p.description}
                        </MobileRow>
                      )}
                    </MobileCard>
                  ))}
                </MobileCards>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
