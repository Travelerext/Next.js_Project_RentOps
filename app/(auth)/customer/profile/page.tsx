import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerProfileForm } from "./customer-profile-form";

export default async function CustomerProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase
        .from("customer")
        .select("customer_no, name, short_name, contact_name, contact_phone, tax_no, invoice_title, invoice_address_phone, invoice_bank_account, remark")
        .eq("owner_user_id", profile.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title="客户资料"
        subtitle="绑定已有客户档案，或完善联系人与开票资料"
        backUrl="/customer"
      />
      <CustomerProfileForm customer={customer} />
    </div>
  );
}
