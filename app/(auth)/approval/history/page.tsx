import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function ApprovalHistoryPage() {
  const supabase = await createClient();

  const [{ data: approvals }, { data: returns }] = await Promise.all([
    supabase.from("approval_request")
      .select("id,approval_no,title,status,submitted_at,updated_at,applicant:applicant_id(display_name)")
      .in("status", ["APPROVED", "REJECTED", "CANCELLED"])
      .order("updated_at", { ascending: false }).limit(50),
    supabase.from("return_request")
      .select("id,request_no,request_status,reason,customer_id,created_at,updated_at")
      .in("request_status", ["APPROVED", "REJECTED"])
      .order("updated_at", { ascending: false }).limit(50),
  ]);

  // Customer names for return requests
  const customerIds = [...new Set((returns ?? []).map(r => r.customer_id as string))];
  const { data: customers } = customerIds.length > 0
    ? await supabase.from("customer").select("id,name").in("id", customerIds)
    : { data: [] };
  const nameMap = new Map((customers ?? []).map(c => [c.id as string, c.name as string]));

  // Merge and sort by time
  const items = [
    ...(approvals ?? []).map(a => ({
      id: a.id as string, type: "approval" as const,
      title: a.title as string,
      no: a.approval_no as string,
      status: a.status as string,
      applicant: ((a.applicant as unknown as {display_name?:string})?.display_name ?? "-"),
      time: (a.updated_at ?? a.submitted_at) as string,
      href: `/approval/${a.id}`,
    })),
    ...(returns ?? []).map(r => ({
      id: r.id as string, type: "return" as const,
      title: `退租 - ${nameMap.get(r.customer_id as string) ?? "-"}`,
      no: r.request_no as string,
      status: r.request_status as string,
      applicant: "-",
      time: (r.updated_at ?? r.created_at) as string,
      reason: r.reason as string,
      href: "#",
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <DataPage title="审批历史" empty={false}>
      {items.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">暂无审批历史</p>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const approved = item.status === "APPROVED";
            const rejected = item.status === "REJECTED";
            return (
              <Link key={`${item.type}-${item.id}`} href={item.href} className="block">
                <Card className="hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between min-w-0">
                      <div className="min-w-0">
                        <CardTitle>{item.title}</CardTitle>
                        <p className="text-sm text-zinc-500 truncate">
                          {item.type === "return" && <Badge variant="warning" className="mr-1 text-[10px]">退租</Badge>}
                          {item.no} · 申请人: {item.applicant} · {formatDate(item.time)}
                          {item.reason ? ` · ${item.reason}` : ""}
                        </p>
                      </div>
                      <Badge variant={approved ? "success" : rejected ? "danger" : "default"}>
                        {approved ? "已通过" : rejected ? "已拒绝" : "已取消"}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </DataPage>
  );
}
