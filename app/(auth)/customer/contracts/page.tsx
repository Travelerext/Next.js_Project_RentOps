import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function CustomerContractsPage() {
  const supabase = await createClient();

  const { data: contracts } = await supabase
    .from("rental_contract")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">我的合同</h1>
      <div className="space-y-3">
        {(contracts ?? []).map((c) => (
          <Link key={c.id} href={`/customer/contracts/${c.id}`} className="block rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-blue-600 dark:text-blue-400">{c.contract_no}</p>
                <p className="text-sm text-zinc-500">
                  {formatDate(c.start_at)} ~ {formatDate(c.end_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatCurrency(c.total_rent_amount)}</p>
                <Badge variant={c.contract_status === "ACTIVE" ? "success" : "default"}>
                  {c.contract_status}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
        {(!contracts || contracts.length === 0) && (
          <p className="py-8 text-center text-zinc-500">暂无合同</p>
        )}
      </div>
    </div>
  );
}
