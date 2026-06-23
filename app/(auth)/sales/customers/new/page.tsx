"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createCustomer } from "@/lib/actions/customer";
import { PageHeader } from "@/components/layout/page-header";
import { UserPlus, Loader2 } from "lucide-react";

export default function NewCustomerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerType, setCustomerType] = useState("ENTERPRISE");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await createCustomer(formData);
    if (result.success) {
      router.push(`/sales/customers/${result.data.id}`);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="新建客户" subtitle="创建新的客户档案" backUrl="_back" />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />客户信息</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <Input id="name" name="name" label="客户名称 *" placeholder="公司或个人信息全称" required autoFocus />
          <Input id="shortName" name="shortName" label="简称" placeholder="常用简称" />

          <div className="grid grid-cols-2 gap-4">
            <Select id="customerType" name="customerType" label="客户类型 *" value={customerType}
              onChange={e => setCustomerType(e.target.value)}
              options={[
                { value: "ENTERPRISE", label: "企业" },
                { value: "INDIVIDUAL", label: "个人" },
                { value: "GOVERNMENT", label: "政府/事业单位" },
              ]} />
            <Input id="contactPhone" name="contactPhone" label="联系电话" placeholder="手机或座机" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="contactName" name="contactName" label="联系人" placeholder="主要联系人姓名" />
            <Select id="creditLevel" name="creditLevel" label="信用等级"
              options={[
                { value: "B", label: "B级 (默认)" },
                { value: "S", label: "S级" },
                { value: "A", label: "A级" },
                { value: "C", label: "C级" },
                { value: "D", label: "D级" },
              ]} />
          </div>

          {/* Tax info */}
          {customerType === "ENTERPRISE" && (
            <>
              <Input id="taxNo" name="taxNo" label="税号" placeholder="统一社会信用代码" />
              <Input id="invoiceTitle" name="invoiceTitle" label="发票抬头" placeholder="发票抬头全称" />
              <Input id="invoiceAddressPhone" name="invoiceAddressPhone" label="开票地址电话" placeholder="地址、电话" />
              <Input id="invoiceBankAccount" name="invoiceBankAccount" label="开票银行账号" placeholder="开户行、账号" />
            </>
          )}

          {/* Settlement */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" id="isMonthlySettlement" name="isMonthlySettlement" value="true"
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="isMonthlySettlement" className="text-sm text-zinc-700 dark:text-zinc-300">月结客户</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input id="creditLimit" name="creditLimit" label="信用额度 (元)" type="number" step="0.01" defaultValue="0" placeholder="0" />
            <Input id="monthlySettlementCycle" name="monthlySettlementCycle" label="月结周期 (天)" type="number" defaultValue="30" placeholder="30" />
          </div>

          <Input id="remark" name="remark" label="备注" placeholder="客户备注信息..." />

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
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />创建中...</> : "创建客户"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
