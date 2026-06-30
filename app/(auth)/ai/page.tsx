import { DashboardPage } from "@/components/data/dashboard-page";
import { AIAssistantClient } from "@/components/ai/ai-assistant-client";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/constants";
import { getAiRoleFocus } from "@/lib/ai/role-focus";

const examples = [
  "根据我的身份，今天最应该优先处理哪些事项？",
  "当前有哪些风险需要我关注？",
  "帮我总结本月经营和回款情况。",
  "哪些设备或订单需要进一步跟进？",
];

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("primary_role")
        .eq("supabase_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const role = (profile?.primary_role as string | null) ?? null;
  const roleLabel = role ? ROLE_LABELS[role] ?? role : "当前用户";
  const roleFocus = getAiRoleFocus(role);

  return (
    <DashboardPage
      title="AI 助手"
      subtitle="由 DeepSeek V4 Flash 驱动，结合当前身份和业务摘要辅助处理事务"
    >
      <AIAssistantClient roleLabel={roleLabel} roleFocus={roleFocus} examples={examples} />
    </DashboardPage>
  );
}
