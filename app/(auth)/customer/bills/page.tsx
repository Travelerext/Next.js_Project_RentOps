import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { RECEIVABLE_STATUS } from "@/lib/constants";

export default async function CustomerBillsPage() {
  const supabase = await createClient();

  const { data: receivables } = await supabase
    .from("receivable")
    .select("*")
    .order("due_date", { ascending: true })
    .limit(30);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">账单查询</h1>
      <div className="space-y-3">
        {(receivables ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-medium">{r.receivable_no}</p>
                <p className="text-sm text-zinc-500">类型: {r.receivable_type} | 到期: {formatDate(r.due_date)}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(r.unpaid_amount)}</p>
                <Badge variant={r.status === "PAID" ? "success" : r.status === "OVERDUE" ? "danger" : "warning"}>
                  {RECEIVABLE_STATUS[r.status as keyof typeof RECEIVABLE_STATUS] ?? r.status}
                </Badge>
              </div>
            </div>
          </div>
        ))}
        {(!receivables || receivables.length === 0) && (
          <p className="py-8 text-center text-zinc-500">暂无账单</p>
        )}
      </div>
    </div>
  );
}
