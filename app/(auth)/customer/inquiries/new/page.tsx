import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerInquiryForm, type EquipmentOption } from "./inquiry-form";

export default async function NewCustomerInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ equipmentId?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const { data: customer } = profile
    ? await supabase.from("customer").select("id").eq("owner_user_id", profile.id).is("deleted_at", null).maybeSingle()
    : { data: null };

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, equipment_no, name, brand, standard_rent, standard_deposit")
    .eq("status", "IN_STOCK")
    .eq("scrapped", false)
    .is("deleted_at", null)
    .order("equipment_no");

  return (
    <CustomerInquiryForm
      customerReady={Boolean(customer)}
      equipment={(equipment ?? []) as EquipmentOption[]}
      initialEquipmentId={sp.equipmentId ?? ""}
    />
  );
}
