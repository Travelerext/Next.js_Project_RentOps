import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ROLE_LABELS } from "@/lib/constants";
import { Shield, ShieldCheck, Users, Wrench, DollarSign, CheckSquare, HardHat, LayoutDashboard, UserCheck, Briefcase, Star, ClipboardCheck } from "lucide-react";
import Link from "next/link";

// ─── Role icons ────────────────────────────────────────────────────────
const ROLE_ICONS: Record<string, typeof Shield> = {
  SYSTEM_ADMIN: ShieldCheck,
  SALES: Users,
  EQUIPMENT_MANAGER: Wrench,
  FINANCE: DollarSign,
  MAINTENANCE: HardHat,
  APPROVER: CheckSquare,
  CUSTOMER: LayoutDashboard,
  SALES_MANAGER: UserCheck,
  FINANCE_MANAGER: Briefcase,
  EQUIPMENT_SUPERVISOR: Wrench,
  GENERAL_MANAGER: Star,
  MAINTENANCE_SUPERVISOR: ClipboardCheck,
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  // 基础岗位角色 (§5.1)
  SYSTEM_ADMIN: "管理系统用户、角色、权限、审批规则和系统配置，拥有全部权限",
  SALES: "管理客户、可租设备查询、快速开单、订单管理、合同管理、催还提醒、业务报表",
  EQUIPMENT_MANAGER: "管理设备台账、出入库（扫码）、设备调拨、保险年检、设备报废",
  FINANCE: "管理应收账款、收款确认、押金管理、退款管理、对账单、折旧计算、设备利润分析",
  MAINTENANCE: "执行维修工单（维修→领用配件→完成）、保养计划执行、配件库存操作",
  APPROVER: "审批订单、合同变更、折扣、押金减免、退款、坏账、报废等申请，查看经营看板和风险监控",
  CUSTOMER: "查看自己的合同、账单、押金、发票和报修状态（客户自助端）",
  // 审批主管角色 (§14.2)
  SALES_MANAGER: "审批订单、合同变更、折扣、押金减免、锁单等业务申请（审批流程第一级）",
  FINANCE_MANAGER: "审批退款、折扣、坏账等财务相关申请（审批流程第二级/财务终审）",
  EQUIPMENT_SUPERVISOR: "审批设备报废申请，管理设备资产处置决策",
  GENERAL_MANAGER: "审批坏账核销等重大财务事项（最高审批级别）",
  // 维修主管角色 (P1-08)
  MAINTENANCE_SUPERVISOR: "派单分配维修任务、验收维修结果、管理保养计划和配件库存、低库存预警处理",
};

// ─── Reusable role card ─────────────────────────────────────────────────
interface RoleInfo { code: string; name: string; description: string; icon: typeof Shield; exists: boolean; dbId: string | null; enabled: boolean; }

function RoleCard({ role, Icon }: { role: RoleInfo; Icon: typeof Shield }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              role.exists && role.enabled ? "bg-blue-100 dark:bg-blue-900/30" : "bg-zinc-100 dark:bg-zinc-800"
            }`}>
              <Icon className={`h-5 w-5 ${role.exists && role.enabled ? "text-blue-600 dark:text-blue-400" : "text-zinc-400 dark:text-zinc-500"}`} />
            </div>
            <div>
              <CardTitle className="text-base">{role.name}</CardTitle>
              <p className="text-xs text-zinc-500 font-mono">{role.code}</p>
            </div>
          </div>
          <Badge variant={role.exists ? (role.enabled ? "success" : "warning") : "default"}>
            {role.exists ? (role.enabled ? "已激活" : "已禁用") : "未创建"}
          </Badge>
        </div>
      </CardHeader>
      <div className="px-6 pb-4">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{role.description}</p>
        {role.exists && (
          <Link href={`/admin/roles/${role.dbId}/permissions`} className="inline-block mt-3">
            <Button variant="outline" size="sm">配置权限</Button>
          </Link>
        )}
      </div>
    </Card>
  );
}

function RoleSection({ title, roles }: { title: string; roles: RoleInfo[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">{title}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => {
          const Icon = role.icon;
          return <RoleCard key={role.code} role={role} Icon={Icon} />;
        })}
      </div>
    </div>
  );
}

export default async function AdminRolesPage() {
  const supabase = await createClient();

  const { data: dbRoles } = await supabase
    .from("role")
    .select("*")
    .order("sort_order");

  // Merge system roles (from constants) with DB roles
  const dbRoleMap = new Map((dbRoles ?? []).map((r: Record<string, unknown>) => [r.role_code as string, r]));

  // 7 个基础岗位角色 (§5.1 — 用于 profiles.primary_role)
  const positionRoleCodes = ["SYSTEM_ADMIN", "SALES", "EQUIPMENT_MANAGER", "FINANCE", "MAINTENANCE", "APPROVER", "CUSTOMER"];
  // 5 个主管/管理层角色 (§14.2 + P1-08 — 用于审批流和派单)
  const managerRoleCodes = ["SALES_MANAGER", "FINANCE_MANAGER", "EQUIPMENT_SUPERVISOR", "GENERAL_MANAGER", "MAINTENANCE_SUPERVISOR"];

  const mapRole = (code: string) => {
    const dbRole = dbRoleMap.get(code);
    return {
      code,
      name: ROLE_LABELS[code] ?? code,
      description: ROLE_DESCRIPTIONS[code] ?? "",
      icon: ROLE_ICONS[code] ?? Shield,
      exists: !!dbRole,
      dbId: (dbRole?.id as string) ?? null,
      type: (dbRole?.role_type as string) ?? "BUILT_IN",
      enabled: (dbRole?.enabled as boolean) ?? true,
      sortOrder: (dbRole?.sort_order as number) ?? 0,
    };
  };

  const positionRoles = positionRoleCodes.map(mapRole);
  const managerRoles = managerRoleCodes.map(mapRole);

  // Find custom roles not in the system list
  const customRoles = (dbRoles ?? [])
    .filter((r: Record<string, unknown>) => !ROLE_LABELS[r.role_code as string])
    .map((r: Record<string, unknown>) => ({
      code: r.role_code as string,
      name: r.role_name as string,
      description: (r.description as string) ?? "自定义角色",
      icon: Shield,
      exists: true,
      dbId: r.id as string,
      type: r.role_type as string,
      enabled: r.enabled as boolean,
      sortOrder: r.sort_order as number,
    }));

  const allRoles = [...positionRoles, ...managerRoles, ...customRoles];
  const totalBuiltIn = positionRoles.filter(r => r.exists).length + managerRoles.filter(r => r.exists).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="角色与权限管理"
        subtitle={`共 ${allRoles.length} 个角色（${totalBuiltIn} 个已激活内置角色 + ${customRoles.length} 个自定义角色）`}
        backUrl="/admin"
      />

      <RoleSection title="岗位角色（7个 · 登录分流 / 面板分配）" roles={positionRoles} />
      <RoleSection title="主管/管理层角色（5个 · 审批流程 / 派单分配）" roles={managerRoles} />

      {/* Custom roles */}
      {customRoles.length > 0 && (
        <RoleSection title="自定义角色" roles={customRoles} />
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>权限体系说明</CardTitle>
        </CardHeader>
        <div className="px-6 pb-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>• <strong>岗位角色（7个）</strong>：系统预定义的 7 种基础角色，用于登录分流和面板分配。</p>
          <p>• <strong>主管角色（5个）</strong>：业务主管、财务主管、设备主管、总经理、维修主管，用于审批流程和任务派发。</p>
          <p>• <strong>自定义角色</strong>：管理员可根据需要创建额外角色，配置不同权限组合。</p>
          <p>• <strong>权限控制层级</strong>：数据库 RLS → 路由保护 → Server Action 校验 → UI 按钮隐藏（四层防护）。</p>
          <p>• 点击角色的"配置权限"按钮进入权限分配页面。</p>
        </div>
      </Card>
    </div>
  );
}
