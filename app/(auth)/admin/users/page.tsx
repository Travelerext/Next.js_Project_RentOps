import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: profiles, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);

  let adminProfileId = "";
  if (user) {
    const { data: ap } = await supabase.from("profiles").select("id").eq("supabase_user_id", user.id).maybeSingle();
    adminProfileId = ap?.id ?? "";
  }

  if (error) {
    return (
      <DataPage title="用户管理" error={error.message} errorCode={error.code}>
        <div />
      </DataPage>
    );
  }

  return (
    <DataPage title="用户管理" empty={false}>
      <UsersTable profiles={profiles ?? []} adminProfileId={adminProfileId} />
    </DataPage>
  );
}
