import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { RECEIVABLE_STATUS } from "@/lib/constants";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CustomerBillsPage() {
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

  const { data: receivables } = await supabase
    .from("receivable")
    .select("id, receivable_no, receivable_type, amount, paid_amount, unpaid_amount, due_date, status")
    .eq("customer_id", customer?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("due_date", { ascending: true })
    .limit(30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">账单查询</h1>
        {!customer ? (
          <p className="mt-2 text-sm text-app-muted">请先在 <Link href="/customer/profile" className="text-app-accent hover:underline">客户资料</Link> 绑定或创建客户档案。</p>
        ) : null}
      </div>
      <div className="space-y-3">
        {(receivables ?? []).map((r) => (
          <Link key={r.id} href={`/customer/bills/${r.id}`} className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-app-border-strong hover:bg-app-surface-muted/50 dark:border-zinc-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-medium">{r.receivable_no}</p>
                <p className="text-sm text-zinc-500">类型: {r.receivable_type} | 到期: {formatDate(r.due_date)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(r.unpaid_amount)}</p>
                <p className="text-xs text-app-muted">应收 {formatCurrency(r.amount)} · 已付 {formatCurrency(r.paid_amount)}</p>
                <Badge variant={r.status === "PAID" ? "success" : r.status === "OVERDUE" ? "danger" : "warning"}>
                  {RECEIVABLE_STATUS[r.status as keyof typeof RECEIVABLE_STATUS] ?? r.status}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
        {(!receivables || receivables.length === 0) && (
          <p className="py-8 text-center text-zinc-500">暂无账单</p>
        )}
      </div>
    </div>
  );
}
