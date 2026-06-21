import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { Server, Database, Shield, HardDrive } from "lucide-react";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const tables = ["profiles","role","permission","customer","equipment","rental_order","rental_contract","receivable","payment_record","deposit_record","refund_record","maintenance_work_order","maintenance_plan","spare_part","approval_request","audit_log","notification"];
  const counts = await Promise.all(tables.map(async (t) => { const { count } = await supabase.from(t).select("*",{count:"exact",head:true}); return {t, c:count??0}; }));
  const total = counts.reduce((s,x) => s+x.c, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="系统配置" subtitle="系统参数与全局设置" backUrl="/admin" />
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />系统信息</CardTitle></CardHeader>
        <div className="px-4 md:px-6 pb-4"><InfoGrid items={[{label:"应用名称",value:"机械设备租赁管理系统 (RentOps)"},{label:"版本",value:"v0.1.0"},{label:"框架",value:"Next.js 16 + TypeScript"},{label:"数据库",value:"Supabase PostgreSQL"},{label:"UI",value:"Tailwind CSS + shadcn/ui"},{label:"认证",value:"Supabase Auth"},{label:"部署",value:"Vercel + Supabase Cloud"}]} /></div>
      </Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />数据库统计</CardTitle></CardHeader>
        <div className="px-4 md:px-6 pb-4"><p className="text-sm text-zinc-500 mb-3">共 {tables.length} 张业务表，约 {total.toLocaleString()} 条记录</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{counts.map(({t,c})=><div key={t} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><p className="text-xs text-zinc-500 font-mono">{t}</p><p className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{c.toLocaleString()}</p></div>)}</div>
        </div>
      </Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />安全配置</CardTitle></CardHeader>
        <div className="px-4 md:px-6 pb-4"><InfoGrid items={[{label:"RLS",value:<Badge variant="success">已启用</Badge>},{label:"行级安全",value:"所有业务表已启用 RLS"},{label:"认证方式",value:"Supabase Auth"},{label:"中间件保护",value:"角色路由保护已激活"},{label:"审计日志",value:"已启用，不可篡改"}]} /></div>
      </Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" />存储 (Supabase Storage)</CardTitle></CardHeader>
        <div className="px-4 md:px-6 pb-4"><InfoGrid items={[{label:"合同文件",value:"contract-files"},{label:"设备照片",value:"equipment-photos"},{label:"维修照片",value:"maintenance-photos"},{label:"验收照片",value:"return-inspection-photos"}]} /></div>
      </Card>
    </div>
  );
}
