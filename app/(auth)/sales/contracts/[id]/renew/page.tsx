"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Calendar, Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";

interface ContractData {
  id: string; contract_no: string; contract_status: string;
  start_at: string; end_at: string;
  total_rent_amount: string; deposit_amount: string;
  customer: { name: string } | null; order_id: string;
}

export default function RenewContractPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    supabase.from("rental_contract")
      .select("id, contract_no, contract_status, start_at, end_at, total_rent_amount, deposit_amount, customer:customer_id(name), order_id")
      .eq("id", id).single()
      .then(({ data, error: err }) => {
        if (!err && data) {
          const c = data as unknown as ContractData;
          setContract(c);
          const d = new Date(c.end_at); d.setMonth(d.getMonth() + 1);
          setNewEndAt(d.toISOString().slice(0, 10));
        }
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract || !newEndAt) return;
    if (new Date(newEndAt) <= new Date(contract.end_at)) { setError("新的结束日期必须晚于当前结束日期"); return; }
    setSubmitting(true); setError(""); setSuccess("");
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id;
    const { error: changeErr } = await supabase.from("contract_change_record").insert({
      contract_id: id, change_type: "RENEW",
      before_content: { end_at: contract.end_at },
      after_content: { end_at: new Date(newEndAt).toISOString() },
      reason: reason || "续租", changed_by: uid,
    });
    if (changeErr) { setError("创建变更记录失败: " + changeErr.message); setSubmitting(false); return; }
    const { error: updateErr } = await supabase.from("rental_contract").update({
      end_at: new Date(newEndAt).toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (updateErr) { setError("续租失败: " + updateErr.message); setSubmitting(false); return; }
    await supabase.from("rental_order").update({
      planned_end_at: new Date(newEndAt).toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", contract.order_id);
    await supabase.from("audit_log").insert({
      actor_id: uid, action: "CONTRACT_CHANGE", resource_type: "CONTRACT", resource_id: id,
      detail: { change_type: "RENEW", new_end_at: new Date(newEndAt).toISOString() },
    });
    setSuccess("续租成功！合同已延长。");
    setTimeout(() => router.push("/sales/contracts/" + id), 1200);
    setSubmitting(false);
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="续租" subtitle={contract?.contract_no} backUrl={"/sales/contracts/" + id}
        status={contract?.contract_status === "ACTIVE" ? <Badge variant="success">可续租</Badge> : <Badge variant="warning">需检查</Badge>} />
      {contract?.contract_status !== "ACTIVE" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>仅 ACTIVE 状态合同可续租。</span></div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{success}</span></div>
      )}
      <Card><CardHeader><CardTitle>当前合同</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-2 text-sm px-6 pb-4">
          <div><span className="text-zinc-500">合同编号：</span>{contract?.contract_no}</div>
          <div><span className="text-zinc-500">客户：</span>{contract?.customer?.name ?? "-"}</div>
          <div><span className="text-zinc-500">当前结束：</span><span className="font-semibold">{formatDate(contract?.end_at)}</span></div>
          <div><span className="text-zinc-500">租金总额：</span><span className="font-semibold">{formatCurrency(contract?.total_rent_amount ?? "0")}</span></div>
        </div>
      </Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />续租设置</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="newEndAt" label="新的结束日期 *" type="date" value={newEndAt} onChange={e => setNewEndAt(e.target.value)} required />
          <Input id="reason" label="续租原因" value={reason} onChange={e => setReason(e.target.value)} placeholder="如项目延期、客户申请等" />
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link href={"/sales/contracts/" + id}><Button variant="outline" type="button">取消</Button></Link>
            <Button type="submit" variant="primary" disabled={submitting || contract?.contract_status !== "ACTIVE"}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />提交中...</> : "确认续租"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
