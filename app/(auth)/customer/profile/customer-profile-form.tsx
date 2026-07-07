"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { LinkIcon, Save } from "lucide-react";
import { bindMyExistingCustomer, upsertMyCustomerProfile } from "@/lib/actions/customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface CustomerProfile {
  customer_no?: string | null;
  name?: string | null;
  short_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  tax_no?: string | null;
  invoice_title?: string | null;
  invoice_address_phone?: string | null;
  invoice_bank_account?: string | null;
  remark?: string | null;
}

export function CustomerProfileForm({ customer }: { customer: CustomerProfile | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [binding, setBinding] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string[]>>({});
  const [bindErrors, setBindErrors] = useState<Record<string, string[]>>({});

  const handleSave = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setProfileErrors({});
    const result = await upsertMyCustomerProfile(new FormData(event.currentTarget));
    setSaving(false);
    if (!result.success) {
      setProfileErrors(result.fieldErrors ?? {});
      toast(result.error ?? "客户资料保存失败", "error");
      return;
    }
    toast("客户资料已保存", "success");
    router.refresh();
  }, [router, toast]);

  const handleBind = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBinding(true);
    setBindErrors({});
    const result = await bindMyExistingCustomer(new FormData(event.currentTarget));
    setBinding(false);
    if (!result.success) {
      setBindErrors(result.fieldErrors ?? {});
      toast(result.error ?? "客户资料绑定失败", "error");
      return;
    }
    toast("客户资料已绑定", "success");
    window.location.assign("/customer/profile");
  }, [toast]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="surface-panel rounded-lg p-5">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-app-fg">客户资料</h2>
          <p className="mt-1 text-sm text-app-muted">维护联系人和开票信息，后续发票会优先使用这里的资料。</p>
        </div>
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="客户名称 *" defaultValue={customer?.name ?? ""} error={profileErrors.name?.[0]} required />
          <Input name="shortName" label="简称" defaultValue={customer?.short_name ?? ""} />
          <Input name="contactName" label="联系人" defaultValue={customer?.contact_name ?? ""} />
          <Input name="contactPhone" label="联系电话 *" defaultValue={customer?.contact_phone ?? ""} error={profileErrors.contactPhone?.[0]} required />
          <Input name="taxNo" label="纳税人识别号" defaultValue={customer?.tax_no ?? ""} />
          <Input name="invoiceTitle" label="发票抬头" defaultValue={customer?.invoice_title ?? customer?.name ?? ""} />
          <Input name="invoiceAddressPhone" label="地址电话" defaultValue={customer?.invoice_address_phone ?? ""} />
          <Input name="invoiceBankAccount" label="开户行及账号" defaultValue={customer?.invoice_bank_account ?? ""} />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-app-muted-strong" htmlFor="remark">备注</label>
            <textarea
              id="remark"
              name="remark"
              rows={3}
              defaultValue={customer?.remark ?? ""}
              className="premium-control focus-ring w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : customer ? "保存资料" : "创建客户资料"}
            </Button>
          </div>
        </form>
      </section>

      <aside className="surface-panel rounded-lg p-5">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-app-fg">绑定已有客户</h2>
          <p className="mt-1 text-sm text-app-muted">已有线下客户档案时，输入客户编号并用联系电话或税号校验。</p>
        </div>
        {customer ? (
          <div className="rounded-lg border border-app-border bg-app-surface-muted p-4 text-sm">
            <p className="text-app-muted">当前已绑定</p>
            <p className="mt-1 font-mono font-semibold text-app-fg">{customer.customer_no ?? "-"}</p>
            <p className="mt-2 text-app-muted-strong">{customer.name ?? "-"}</p>
          </div>
        ) : (
          <form onSubmit={handleBind} className="space-y-4">
            <Input name="customerNo" label="客户编号 *" placeholder="例如 CUS-KH001 或 CUS202..." error={bindErrors.customerNo?.[0]} required />
            <Input name="contactPhone" label="登记联系电话" error={bindErrors.contactPhone?.[0]} />
            <Input name="taxNo" label="纳税人识别号" error={bindErrors.taxNo?.[0]} />
            <Button type="submit" variant="outline" disabled={binding} className="w-full">
              <LinkIcon className="h-4 w-4" />
              {binding ? "绑定中..." : "绑定客户资料"}
            </Button>
          </form>
        )}
      </aside>
    </div>
  );
}
