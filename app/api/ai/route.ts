import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/constants";
import { getAiRoleFocus } from "@/lib/ai/role-focus";

export const dynamic = "force-dynamic";

type ChatRole = "user" | "assistant";

interface IncomingMessage {
  role: ChatRole;
  content: string;
}

interface Profile {
  id: string;
  display_name: string | null;
  primary_role: string;
  account_status: string;
  login_enabled: boolean;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DEEPSEEK_ENDPOINT =
  process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是有效 JSON。" }, { status: 400 });
  }

  const messages = parseMessages(body);
  if (messages.length === 0) {
    return Response.json({ error: "请输入要咨询的问题。" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: "请先登录后再使用 AI 助手。" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, primary_role, account_status, login_enabled")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  const typedProfile = profile as Profile | null;
  if (
    !typedProfile ||
    typedProfile.account_status !== "ACTIVE" ||
    !typedProfile.login_enabled ||
    !typedProfile.primary_role
  ) {
    return Response.json({ error: "当前账号不可使用 AI 助手。" }, { status: 403 });
  }

  const roleLabel = ROLE_LABELS[typedProfile.primary_role] ?? typedProfile.primary_role;
  const businessContext = await collectBusinessContext(
    supabase,
    typedProfile.primary_role,
    typedProfile.id,
  );

  const systemPrompt = buildSystemPrompt({
    displayName: typedProfile.display_name ?? "用户",
    role: typedProfile.primary_role,
    roleLabel,
    businessContext,
  });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "DeepSeek API Key 未配置，请设置 DEEPSEEK_API_KEY。" },
      { status: 500 },
    );
  }

  const deepseekResponse = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.2,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.slice(-10),
      ],
    }),
  });

  const result = (await deepseekResponse.json().catch(() => null)) as unknown;
  if (!deepseekResponse.ok) {
    return Response.json(
      { error: readDeepSeekError(result) ?? "DeepSeek 调用失败。" },
      { status: deepseekResponse.status },
    );
  }

  const answer = readDeepSeekAnswer(result);
  if (!answer) {
    return Response.json({ error: "DeepSeek 未返回有效回答。" }, { status: 502 });
  }

  return Response.json({
    answer,
    model: DEEPSEEK_MODEL,
    role: typedProfile.primary_role,
    roleLabel,
  });
}

function parseMessages(body: unknown): IncomingMessage[] {
  if (!isRecord(body)) return [];

  if (typeof body.message === "string") {
    const content = body.message.trim();
    return content ? [{ role: "user", content }] : [];
  }

  if (!Array.isArray(body.messages)) return [];

  return body.messages.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (item.role !== "user" && item.role !== "assistant") return [];
    if (typeof item.content !== "string") return [];
    const content = item.content.trim();
    return content ? [{ role: item.role, content }] : [];
  });
}

function buildSystemPrompt({
  displayName,
  role,
  roleLabel,
  businessContext,
}: {
  displayName: string;
  role: string;
  roleLabel: string;
  businessContext: string;
}) {
  return [
    "你是 RentOps 机械设备租赁管理系统内置 AI 助手。",
    "请使用简洁、专业的中文回答，优先给出可执行建议。",
    `当前用户：${displayName}`,
    `当前角色：${roleLabel}（${role}）`,
    `事务侧重：${getAiRoleFocus(role)}`,
    "权限规则：只基于当前用户角色和系统提供的业务摘要回答；不要假设用户能访问其他角色数据；客户角色只能处理自己的合同、账单、发票和订单。",
    "安全规则：不要编造不存在的数据；如果摘要不足，请说明需要到对应页面进一步查看；不要提供绕过权限、直接改库或批量破坏性操作的建议。",
    "交互规则：涉及具体操作时，说明应该前往哪个模块处理；涉及审批、收款、退租、报废、派单等事务时，先提醒核对关键字段和权限。",
    "",
    "当前可用业务摘要：",
    businessContext,
  ].join("\n");
}

async function collectBusinessContext(
  supabase: SupabaseServerClient,
  role: string,
  profileId: string,
) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const common = [
    countMetric(
      "逾期订单数",
      supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("order_status", "OVERDUE"),
    ),
    countMetric(
      "待审批事项数",
      supabase.from("approval_request").select("*", { count: "exact", head: true }).in("status", ["SUBMITTED", "IN_PROGRESS"]),
    ),
  ];

  let roleMetrics: Promise<string>[] = [];

  if (["SALES", "SALES_MANAGER"].includes(role)) {
    roleMetrics = [
      countMetric("活跃客户数", supabase.from("customer").select("*", { count: "exact", head: true }).eq("status", "ACTIVE").is("deleted_at", null)),
      countMetric("进行中订单数", supabase.from("rental_order").select("*", { count: "exact", head: true }).in("order_status", ["IN_PROGRESS", "PARTIAL_RETURN"])),
      countMetric("7日内到期合同数", supabase.from("rental_contract").select("*", { count: "exact", head: true }).eq("contract_status", "ACTIVE").gte("end_at", now.toISOString()).lte("end_at", sevenDaysLater)),
      sumMetric("本月收款金额", supabase.from("payment_record").select("amount").gte("paid_at", monthStart), "amount"),
    ];
  } else if (["EQUIPMENT_MANAGER", "EQUIPMENT_SUPERVISOR"].includes(role)) {
    roleMetrics = [
      countMetric("设备总数", supabase.from("equipment").select("*", { count: "exact", head: true }).is("deleted_at", null)),
      countMetric("在库设备数", supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "IN_STOCK").is("deleted_at", null)),
      countMetric("已租出设备数", supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "RENTED")),
      countMetric("维修中设备数", supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "IN_MAINTENANCE")),
      countMetric("调拨中设备数", supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "IN_TRANSFER")),
    ];
  } else if (["FINANCE", "FINANCE_MANAGER"].includes(role)) {
    roleMetrics = [
      countMetric("未结清应收数", supabase.from("receivable").select("*", { count: "exact", head: true }).in("status", ["UNPAID", "PARTIAL", "OVERDUE"])),
      countMetric("逾期应收数", supabase.from("receivable").select("*", { count: "exact", head: true }).eq("status", "OVERDUE")),
      countMetric("待审批退款数", supabase.from("refund_record").select("*", { count: "exact", head: true }).eq("refund_status", "PENDING_APPROVAL")),
      sumMetric("本月收款金额", supabase.from("payment_record").select("amount").gte("paid_at", monthStart), "amount"),
    ];
  } else if (role === "MAINTENANCE") {
    roleMetrics = [
      countMetric("我的待处理工单数", supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).eq("assigned_to", profileId).eq("status", "ASSIGNED")),
      countMetric("我的维修中工单数", supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).eq("assigned_to", profileId).eq("status", "IN_PROGRESS")),
      countMetric("我今日完成工单数", supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).eq("assigned_to", profileId).in("status", ["COMPLETED", "VERIFIED", "CLOSED"]).gte("updated_at", todayStart)),
    ];
  } else if (role === "MAINTENANCE_SUPERVISOR") {
    roleMetrics = [
      countMetric("待派单工单数", supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).eq("status", "PENDING_DISPATCH")),
      countMetric("维修中工单数", supabase.from("maintenance_work_order").select("*", { count: "exact", head: true }).eq("status", "IN_PROGRESS")),
      countMetric("逾期保养计划数", supabase.from("maintenance_plan").select("*", { count: "exact", head: true }).eq("status", "ACTIVE").lt("next_maintenance_at", now.toISOString())),
      sumMetric("本月维修费用", supabase.from("maintenance_work_order").select("maintenance_fee, parts_fee").gte("reported_at", monthStart), ["maintenance_fee", "parts_fee"]),
    ];
  } else if (["APPROVER", "GENERAL_MANAGER"].includes(role)) {
    roleMetrics = [
      countMetric("待处理审批数", supabase.from("approval_request").select("*", { count: "exact", head: true }).in("status", ["SUBMITTED", "IN_PROGRESS"])),
      countMetric("本月新增订单数", supabase.from("rental_order").select("*", { count: "exact", head: true }).gte("created_at", monthStart)),
      sumMetric("本月收款金额", supabase.from("payment_record").select("amount").gte("paid_at", monthStart), "amount"),
      countMetric("已租出设备数", supabase.from("equipment").select("*", { count: "exact", head: true }).eq("status", "RENTED")),
    ];
  } else if (role === "CUSTOMER") {
    roleMetrics = await customerMetrics(supabase, profileId);
  } else if (role === "SYSTEM_ADMIN") {
    roleMetrics = [
      countMetric("启用账号数", supabase.from("profiles").select("*", { count: "exact", head: true }).eq("login_enabled", true).eq("account_status", "ACTIVE")),
      countMetric("禁用账号数", supabase.from("profiles").select("*", { count: "exact", head: true }).eq("login_enabled", false)),
      countMetric("待处理审批数", supabase.from("approval_request").select("*", { count: "exact", head: true }).in("status", ["SUBMITTED", "IN_PROGRESS"])),
    ];
  }

  const lines = await Promise.all([...common, ...roleMetrics]);
  return lines.join("\n");
}

async function customerMetrics(supabase: SupabaseServerClient, profileId: string) {
  const { data: customer } = await supabase
    .from("customer")
    .select("id, name")
    .eq("owner_user_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  const customerId = (customer as { id?: string } | null)?.id;
  if (!customerId) {
    return [Promise.resolve("客户账号尚未关联 customer 记录。")];
  }

  return [
    countMetric("我的合同数", supabase.from("rental_contract").select("*", { count: "exact", head: true }).eq("customer_id", customerId).is("deleted_at", null)),
    countMetric("我的待付账单数", supabase.from("receivable").select("*", { count: "exact", head: true }).eq("customer_id", customerId).in("status", ["UNPAID", "PARTIAL", "OVERDUE"])),
    countMetric("我的进行中订单数", supabase.from("rental_order").select("*", { count: "exact", head: true }).eq("customer_id", customerId).in("order_status", ["IN_PROGRESS", "PARTIAL_RETURN"]).is("deleted_at", null)),
  ];
}

async function countMetric(
  label: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  try {
    const { count, error } = await query;
    return `${label}: ${error ? "当前不可用" : count ?? 0}`;
  } catch {
    return `${label}: 当前不可用`;
  }
}

async function sumMetric(
  label: string,
  query: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
  fields: string | string[],
) {
  try {
    const { data, error } = await query;
    if (error) return `${label}: 当前不可用`;
    const keys = Array.isArray(fields) ? fields : [fields];
    const total = (data ?? []).reduce((sum, row) => {
      const rowTotal = keys.reduce((inner, key) => inner + Number(row[key] ?? 0), 0);
      return sum + rowTotal;
    }, 0);
    return `${label}: ${new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(total)}`;
  } catch {
    return `${label}: 当前不可用`;
  }
}

function readDeepSeekAnswer(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === "string" ? first.message.content : null;
}

function readDeepSeekError(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  return typeof value.error.message === "string" ? value.error.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
