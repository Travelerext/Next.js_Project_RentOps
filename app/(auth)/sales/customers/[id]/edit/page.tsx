"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { updateCustomer } from "@/lib/actions/customer";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { UserPen, Loader2 } from "lucide-react";

export default function EditCustomerPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [customerType, setCustomerType] = useState("ENTERPRISE");

  // Pre-populated form values
  const [defaults, setDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("customer")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDefaults({
            name: data.name ?? "",
            shortName: data.short_name ?? "",
            contactName: data.contact_name ?? "",
            contactPhone: data.contact_phone ?? "",
            customerType: data.customer_type ?? "ENTERPRISE",
            creditLevel: data.credit_level ?? "B",
            riskLevel: data.risk_level ?? "LOW",
            taxNo: data.tax_no ?? "",
            invoiceTitle: data.invoice_title ?? "",
            invoiceAddressPhone: data.invoice_address_phone ?? "",
            invoiceBankAccount: data.invoice_bank_account ?? "",
            creditLimit: data.credit_limit != null ? String(data.credit_limit) : "0",
            isMonthlySettlement: data.is_monthly_settlement ? "true" : "",
            monthlySettlementCycle: data.monthly_settlement_cycle != null ? String(data.monthly_settlement_cycle) : "30",
            isBlacklisted: data.is_blacklisted ? "true" : "",
            status: data.status ?? "ACTIVE",
            remark: data.remark ?? "",
          });
          setCustomerType(data.customer_type ?? "ENTERPRISE");
        } else {
          setError("客户不存在");
        }
        setFetching(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await updateCustomer(id, formData);
    if (result.success) {
      router.push(`/sales/customers/${id}`);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  if (fetching) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="编辑客户" backUrl={`/sales/customers/${id}`} />
        <Card><div className="p-8 text-center text-zinc-500">加载中...</div></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="编辑客户" subtitle="修改客户档案信息" backUrl={`/sales/customers/${id}`} />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPen className="h-5 w-5" />客户信息</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <Input id="name" name="name" label="客户名称 *" defaultValue={defaults.name} placeholder="公司或个人信息全称" required autoFocus />
          <Input id="shortName" name="shortName" label="简称" defaultValue={defaults.shortName} placeholder="常用简称" />

          <div className="grid grid-cols-2 gap-4">
            <Select id="customerType" name="customerType" label="客户类型 *" value={customerType}
              onChange={e => setCustomerType(e.target.value)}
              options={[
                { value: "ENTERPRISE", label: "企业" },
                { value: "INDIVIDUAL", label: "个人" },
                { value: "GOVERNMENT", label: "政府/事业单位" },
              ]} />
            <Input id="contactPhone" name="contactPhone" label="联系电话" defaultValue={defaults.contactPhone} placeholder="手机或座机" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="contactName" name="contactName" label="联系人" defaultValue={defaults.contactName} placeholder="主要联系人姓名" />
            <Select id="creditLevel" name="creditLevel" label="信用等级" defaultValue={defaults.creditLevel}
              options={[
                { value: "S", label: "S级" },
                { value: "A", label: "A级" },
                { value: "B", label: "B级 (默认)" },
                { value: "C", label: "C级" },
                { value: "D", label: "D级" },
              ]} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select id="riskLevel" name="riskLevel" label="风险等级" defaultValue={defaults.riskLevel}
              options={[
                { value: "LOW", label: "低风险" },
                { value: "MEDIUM", label: "中风险" },
                { value: "HIGH", label: "高风险" },
                { value: "CRITICAL", label: "极高风险" },
              ]} />
            <Select id="status" name="status" label="状态" defaultValue={defaults.status}
              options={[
                { value: "ACTIVE", label: "正常" },
                { value: "INACTIVE", label: "停用" },
              ]} />
          </div>

          {/* Tax info */}
          {customerType === "ENTERPRISE" && (
            <>
              <Input id="taxNo" name="taxNo" label="税号" defaultValue={defaults.taxNo} placeholder="统一社会信用代码" />
              <Input id="invoiceTitle" name="invoiceTitle" label="发票抬头" defaultValue={defaults.invoiceTitle} placeholder="发票抬头全称" />
              <Input id="invoiceAddressPhone" name="invoiceAddressPhone" label="开票地址电话" defaultValue={defaults.invoiceAddressPhone} placeholder="地址、电话" />
              <Input id="invoiceBankAccount" name="invoiceBankAccount" label="开票银行账号" defaultValue={defaults.invoiceBankAccount} placeholder="开户行、账号" />
            </>
          )}

          {/* Settlement */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" id="isMonthlySettlement" name="isMonthlySettlement" value="true"
              defaultChecked={defaults.isMonthlySettlement === "true"}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="isMonthlySettlement" className="text-sm text-zinc-700 dark:text-zinc-300">月结客户</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="creditLimit" name="creditLimit" label="信用额度 (元)" type="number" step="0.01" defaultValue={defaults.creditLimit} placeholder="0" />
            <Input id="monthlySettlementCycle" name="monthlySettlementCycle" label="月结周期 (天)" type="number" defaultValue={defaults.monthlySettlementCycle} placeholder="30" />
          </div>

          {/* Blacklist */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" id="isBlacklisted" name="isBlacklisted" value="true"
              defaultChecked={defaults.isBlacklisted === "true"}
              className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500" />
            <label htmlFor="isBlacklisted" className="text-sm font-medium text-red-700 dark:text-red-400">列入黑名单（限制下单）</label>
          </div>

          <Input id="remark" name="remark" label="备注" defaultValue={defaults.remark} placeholder="客户备注信息..." />

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />保存中...</> : "保存修改"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
