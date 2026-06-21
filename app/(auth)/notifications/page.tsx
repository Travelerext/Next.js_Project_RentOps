import { createClient } from "@/lib/supabase/server";
import { DataPage } from "@/components/data/data-page";
import { NotificationsClient } from "@/components/notifications/notifications-client";

type NotifRow = Record<string, unknown>;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("id").eq("supabase_user_id", user.id).maybeSingle();
  if (!profile) return null;

  const { data, count } = await supabase
    .from("notification")
    .select("*", { count: "exact" })
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifs = (data ?? []) as NotifRow[];
  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <DataPage
      title="通知中心"
      subtitle={`共 ${count ?? 0} 条通知 · ${unreadCount} 条未读`}
      empty={false}
    >
      <NotificationsClient notifications={notifs} />
    </DataPage>
  );
}
