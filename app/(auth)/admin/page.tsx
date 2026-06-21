import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/data/dashboard-page";
import { StatsGrid } from "@/components/data/stats-grid";
import { StatCard } from "@/components/data/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, Shield, UserCheck, UserPlus, Settings,
  ShieldCheck, FileKey, ClipboardList,
} from "lucide-react";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalUserCount },
    { count: activeUserCount },
    { count: roleCount },
    { count: pendingUserCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "ACTIVE").eq("login_enabled", true).is("deleted_at", null),
    supabase.from("role").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("account_status", "PENDING").is("deleted_at", null),
  ]);

  return (
    <DashboardPage title="系统管理面板" subtitle="用户、角色和系统配置">
      <StatsGrid cols={{ mobile: 2, desktop: 4 }}>
        <StatCard icon={Users} label="用户总数" value={totalUserCount ?? 0} color="blue" href="/admin/users" />
        <StatCard icon={UserCheck} label="活跃用户" value={activeUserCount ?? 0} color="emerald" />
        <StatCard icon={Shield} label="角色数" value={roleCount ?? 0} color="indigo" href="/admin/roles" />
        <StatCard icon={UserPlus} label="待审批用户" value={pendingUserCount ?? 0} color="amber" href="/admin/users?status=PENDING" />
      </StatsGrid>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/users">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>用户管理</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">管理用户账号、角色分配和权限</p>
          </Card>
        </Link>
        <Link href="/admin/roles">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle>角色权限</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">配置角色和权限规则</p>
          </Card>
        </Link>
        <Link href="/admin/permissions">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <FileKey className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>权限管理</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">配置功能权限和数据权限</p>
          </Card>
        </Link>
        <Link href="/admin/audit-log">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle>审计日志</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">查看系统操作审计记录</p>
          </Card>
        </Link>
        <Link href="/admin/settings">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800/60">
                  <Settings className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <CardTitle>系统配置</CardTitle>
              </div>
            </CardHeader>
            <p className="text-sm text-zinc-500 px-6 pb-4">系统参数与全局配置</p>
          </Card>
        </Link>
      </div>
    </DashboardPage>
  );
}
