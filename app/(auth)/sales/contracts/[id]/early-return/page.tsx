"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { InfoGrid } from "@/components/data/info-grid";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatCurrency } from "@/lib/utils";
import { CONTRACT_STATUS } from "@/lib/constants";
import {
  Calendar,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Package,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────

interface ContractData {
  id: string;
  contract_no: string;
  contract_status: string;
  start_at: string;
  end_at: string;
  total_rent_amount: string;
  deposit_amount: string;
  penalty_rule: Record<string, unknown> | null;
  customer: { name: string } | null;
}

interface ContractItem {
  id: string;
  equipment_id: string;
  equipment_no_snapshot: string;
  equipment_name_snapshot: string;
  rent_amount: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export default function EarlyReturnPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [contract, setContract] = useState<ContractData | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form fields
  const [earlyReturnDate, setEarlyReturnDate] = useState("");
  const [returnAll, setReturnAll] = useState(true);
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Derived
  const [estimatedPenalty, setEstimatedPenalty] = useState(0);

  useEffect(() => {
    async function fetchData() {
      // Fetch contract with customer
      const { data: contractRaw } = await supabase
        .from("rental_contract")
        .select("*, customer:customer_id(name)")
        .eq("id", id)
        .single();

      if (!contractRaw) {
        setLoading(false);
        return;
      }

      const c = contractRaw as unknown as ContractData;
      setContract(c);

      // Set default early return date to today
      const today = new Date().toISOString().slice(0, 10);
      setEarlyReturnDate(today);

      // Fetch contract items
      const { data: itemsRaw } = await supabase
        .from("rental_contract_item")
        .select("id, equipment_id, equipment_no_snapshot, equipment_name_snapshot, rent_amount")
        .eq("contract_id", id);

      const contractItems = (itemsRaw ?? []) as unknown as ContractItem[];
      setItems(contractItems);
      setSelectedItems(new Set(contractItems.map((i) => i.id)));

      // Calculate estimated penalty
      if (c.end_at) {
        const endDate = new Date(c.end_at);
        const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const dailyRent = parseFloat(c.total_rent_amount) > 0
          ? parseFloat(c.total_rent_amount) / 30
          : 0;
        const penaltyRate = c.penalty_rule
          ? (parseFloat(String((c.penalty_rule as Record<string, unknown>).rate ?? "20")) / 100)
          : 0.2;
        setEstimatedPenalty(dailyRent * remainingDays * penaltyRate);
      }

      setLoading(false);
    }

    fetchData();
  }, [id]);

  // ── Calculate remaining days ──────────────────────────────────────────

  const remainingDays = contract?.end_at
    ? Math.max(0, Math.ceil((new Date(contract.end_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ── Handle submit ─────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract || !earlyReturnDate) return;

    // Validate early return date is before end date
    if (new Date(earlyReturnDate) >= new Date(contract.end_at)) {
      setError("提前归还日期必须早于合同结束日期");
      return;
    }

    // Validate at least one item selected if not returning all
    if (!returnAll && selectedItems.size === 0) {
      setError("请选择至少一项设备");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id;

    if (!uid) {
      setError("未登录，请重新登录");
      setSubmitting(false);
      return;
    }

    // Build before/after content
    const beforeContent = {
      end_at: contract.end_at,
      status: contract.contract_status,
    };

    const afterContent = {
      early_return_date: new Date(earlyReturnDate).toISOString(),
      return_all: returnAll,
      reason: reason || "提前归还",
      selected_items: returnAll ? "ALL" : Array.from(selectedItems),
      estimated_penalty: estimatedPenalty,
    };

    // Create contract change record
    const { error: changeErr } = await supabase
      .from("contract_change_record")
      .insert({
        contract_id: id,
        change_type: "EARLY_RETURN",
        before_content: beforeContent,
        after_content: afterContent,
        reason: reason || "提前归还",
        changed_by: uid,
      });

    if (changeErr) {
      setError("创建变更记录失败: " + changeErr.message);
      setSubmitting(false);
      return;
    }

    // Update contract status to indicate early return in progress
    const { error: updateErr } = await supabase
      .from("rental_contract")
      .update({
        updated_at: new Date().toISOString(),
        updated_by: uid,
      })
      .eq("id", id);

    if (updateErr) {
      setError("更新合同失败: " + updateErr.message);
      setSubmitting(false);
      return;
    }

    // Update contract items' end dates
    if (returnAll) {
      const { error: itemsErr } = await supabase
        .from("rental_contract_item")
        .update({ end_at: new Date(earlyReturnDate).toISOString() })
        .eq("contract_id", id);

      if (itemsErr) {
        console.error("Failed to update contract items:", itemsErr.message);
      }
    } else {
      const { error: itemsErr } = await supabase
        .from("rental_contract_item")
        .update({ end_at: new Date(earlyReturnDate).toISOString() })
        .eq("contract_id", id)
        .in("id", Array.from(selectedItems));

      if (itemsErr) {
        console.error("Failed to update selected items:", itemsErr.message);
      }
    }

    // Audit log
    await supabase.from("audit_log").insert({
      actor_id: uid,
      action: "CONTRACT_CHANGE",
      resource_type: "CONTRACT",
      resource_id: id,
      detail: {
        change_type: "EARLY_RETURN",
        early_return_date: new Date(earlyReturnDate).toISOString(),
        return_all: returnAll,
        reason: reason || "提前归还",
      },
    });

    setSuccess("提前归还申请已提交，等待审批。");
    setTimeout(() => router.push(`/sales/contracts/${id}`), 2000);
    setSubmitting(false);
  }

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────

  if (!contract) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">合同不存在</p>
        <Link href="/sales/contracts" className="text-blue-600 hover:underline">
          返回合同列表
        </Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="提前归还"
        subtitle={contract.contract_no}
        backUrl="_back"
        status={
          contract.contract_status === "ACTIVE" ? (
            <Badge variant="success">履行中</Badge>
          ) : (
            <Badge variant="warning">
              {CONTRACT_STATUS[contract.contract_status] ?? contract.contract_status}
            </Badge>
          )
        }
      />

      {/* ── Warning banner ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">提前归还需要审批</p>
          <p className="mt-1">
            提前归还合同将触发违约金计算，需要提交审批流程。审批通过后合同将终止。
          </p>
        </div>
      </div>

      {/* ── Success message ─────────────────────────────────────────────── */}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ── Current Contract Info ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            当前合同信息
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-4">
          <InfoGrid
            columns={1}
            items={[
              { label: "合同编号", value: contract.contract_no },
              { label: "客户", value: contract.customer?.name ?? "-" },
              { label: "开始日期", value: formatDate(contract.start_at) },
              { label: "结束日期", value: <span className="font-semibold">{formatDate(contract.end_at)}</span> },
              { label: "剩余天数", value: <span className="font-semibold text-amber-600 dark:text-amber-400">{remainingDays} 天</span> },
              { label: "租金总额", value: formatCurrency(contract.total_rent_amount) },
              { label: "押金", value: formatCurrency(contract.deposit_amount) },
              { label: "预估违约金", value: <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(estimatedPenalty)}</span> },
            ]}
          />
        </div>
      </Card>

      {/* ── Early Return Form ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeft className="h-5 w-5" />
            归还设置
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Early return date */}
          <Input
            label="提前归还日期 *"
            id="earlyReturnDate"
            type="date"
            value={earlyReturnDate}
            onChange={(e) => setEarlyReturnDate(e.target.value)}
            max={contract.end_at?.slice(0, 10)}
            required
          />

          {/* Return all checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={returnAll}
              onChange={(e) => {
                setReturnAll(e.target.checked);
                if (e.target.checked && items.length > 0) {
                  setSelectedItems(new Set(items.map((i) => i.id)));
                }
              }}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="font-medium text-zinc-700 dark:text-zinc-300">全部归还</span>
          </label>

          {/* Equipment list (partial return) */}
          {!returnAll && items.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                选择归还设备
              </p>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-700/50">
                {items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={(e) => {
                        const next = new Set(selectedItems);
                        if (e.target.checked) {
                          next.add(item.id);
                        } else {
                          next.delete(item.id);
                        }
                        setSelectedItems(next);
                      }}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <Package className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span className="flex-1 font-medium">
                      {item.equipment_name_snapshot}
                    </span>
                    <span className="font-mono text-xs text-zinc-400">
                      {item.equipment_no_snapshot}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {formatCurrency(item.rent_amount)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <Input
            label="归还原因"
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="如合同到期前退租、客户提前终止等"
          />

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link href={`/sales/contracts/${id}`}>
              <Button variant="outline" type="button">
                取消
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              disabled={
                submitting ||
                !!success ||
                contract.contract_status !== "ACTIVE"
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "提交提前归还申请"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
