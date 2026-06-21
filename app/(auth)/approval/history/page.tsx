import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function ApprovalHistoryPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("approval_request").select("id,approval_no,title,status,submitted_at,applicant:applicant_id(display_name)").in("status",["APPROVED","REJECTED","CANCELLED"]).order("updated_at",{ascending:false}).limit(50);

  return (
    <DataPage title="审批历史" empty={false}>
      {!data?.length ? (
        <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">暂无审批历史</p>
      ) : (
      <div className="space-y-4">
        {(data??[]).map(a => (
          <Link key={a.id as string} href={`/approval/${a.id}`} className="block">
            <Card className="hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{a.title as string}</CardTitle>
                  <p className="text-sm text-zinc-500 truncate">{a.approval_no as string} · 申请人: {((a.applicant as unknown as {display_name:string})?.display_name??"-")} · {formatDate(a.submitted_at as string)}</p>
                </div>
                <Badge variant={a.status==="APPROVED"?"success":a.status==="REJECTED"?"danger":"default"}>{a.status==="APPROVED"?"已通过":a.status==="REJECTED"?"已拒绝":"已取消"}</Badge>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      )}
    </DataPage>
  );
}
