import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DataPage } from "@/components/data/data-page";
import { EditSparePartForm } from "./edit-form";

export default async function SparePartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user role
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = "";
  if (user) {
    const { data: p } = await supabase.from("profiles")
      .select("primary_role").eq("supabase_user_id", user.id).maybeSingle();
    userRole = p?.primary_role ?? "";
  }
  const canManage = userRole === "MAINTENANCE_SUPERVISOR" || userRole === "SYSTEM_ADMIN";

  const { data: part } = await supabase
    .from("spare_part")
    .select("*, applicable_model:applicable_model_id(id, model_name, brand), warehouse:warehouse_id(id, name)")
    .eq("id", id)
    .maybeSingle();

  if (!part) notFound();

  return (
    <DataPage title="配件详情" subtitle={`编号：${(part as Record<string, unknown>).part_no}`} empty={false}>
      <EditSparePartForm part={part as SparePartData} canManage={canManage} />
    </DataPage>
  );
}

export interface SparePartData {
  id: string;
  part_no: string;
  part_name: string;
  specification: string | null;
  unit: string;
  unit_price: number | null;
  current_stock: number;
  safety_stock: number;
  status: string;
  applicable_model: { id: string; model_name: string; brand: string | null } | null;
  warehouse: { id: string; name: string } | null;
  remark: string | null;
  created_at: string;
}
