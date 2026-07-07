import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { DataTable, type Column } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { INQUIRY_STATUS, statusVariant } from "@/lib/operation-labels";

const PRICING_MODE_LABEL: Record<string, string> = {
  HOURLY: "按小时",
  DAILY: "按天",
  MONTHLY: "按月",
  FIXED: "固定价",
  PROJECT_BASED: "按项目",
};

export default async function CustomerInquiriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase.from("customer").select("id").eq("owner_user_id", profile.id).is("deleted_at", null).maybeSingle()
    : { data: null };

  const { data } = customer
    ? await supabase
        .from("rental_inquiry")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const columns: Column<Record<string, unknown>>[] = [
    { id: "no", header: "询价单号", cell: (row) => <span className="font-mono text-sm">{row.inquiry_no as string}</span> },
    { id: "location", header: "项目地点", cell: (row) => (row.project_location as string) ?? "-" },
    { id: "pricing", header: "计费方式", cell: (row) => PRICING_MODE_LABEL[row.pricing_mode as string] ?? "按月", hideOnMobile: true },
    { id: "amount", header: "预估金额", cell: (row) => formatCurrency(row.estimated_amount as string) },
    {
      id: "status",
      header: "状态",
      cell: (row) => <Badge variant={statusVariant(row.status as string)}>{INQUIRY_STATUS[row.status as string] ?? row.status as string}</Badge>,
    },
    { id: "time", header: "提交时间", cell: (row) => formatDateTime(row.created_at as string), hideOnMobile: true },
  ];

  return (
    <DataPage
      title="我的询价"
      actions={<Link href="/customer/inquiries/new"><Button variant="primary"><Plus className="h-4 w-4" />提交询价</Button></Link>}
      fab={{ href: "/customer/inquiries/new", label: "提交询价" }}
      empty={false}
    >
      {!customer ? (
        <p className="rounded-lg border border-app-border bg-app-surface-muted p-4 text-sm text-app-muted">
          请先在 <Link href="/customer/profile" className="text-app-accent hover:underline">客户资料</Link> 绑定或创建客户档案。
        </p>
      ) : null}
      <DataTable
        columns={columns}
        data={(data ?? []) as Record<string, unknown>[]}
        keyExtractor={(row) => row.id as string}
        rowHref={(row) => `/customer/inquiries/${row.id}`}
        emptyMessage="暂无询价记录"
      />
    </DataPage>
  );
}
