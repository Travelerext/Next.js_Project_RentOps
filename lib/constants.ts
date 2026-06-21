// Order Status
export const ORDER_STATUS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  PENDING_APPROVAL: "待审批",
  APPROVED: "已审批",
  CONFIRMED: "已确认",
  IN_PROGRESS: "进行中",
  PARTIAL_RETURN: "部分归还",
  OVERDUE: "已逾期",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

// Order status → Badge variant mapping
export const ORDER_STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "default",
  SUBMITTED: "info",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  CONFIRMED: "success",
  IN_PROGRESS: "success",
  PARTIAL_RETURN: "warning",
  OVERDUE: "danger",
  COMPLETED: "default",
  CANCELLED: "default",
};

// Contract Status
export const CONTRACT_STATUS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_SIGN: "待签署",
  SIGNED: "已签署",
  ACTIVE: "履行中",
  FROZEN: "已冻结",
  TERMINATED: "已终止",
  EXPIRED: "已到期",
};

// Contract status → Badge variant mapping
export const CONTRACT_STATUS_VARIANTS: Record<string, string> = {
  DRAFT: "default",
  PENDING_SIGN: "info",
  SIGNED: "info",
  ACTIVE: "success",
  FROZEN: "danger",
  TERMINATED: "default",
  EXPIRED: "default",
};

// Equipment Status
export const EQUIPMENT_STATUS: Record<string, string> = {
  IN_STOCK: "在库",
  RENTED: "已租出",
  PENDING_INSPECTION: "待验收",
  IN_MAINTENANCE: "维修中",
  IN_TRANSFER: "调拨中",
  LOCKED: "已锁定",
  SCRAPPED: "已报废",
};

// Receivable Status
export const RECEIVABLE_STATUS: Record<string, string> = {
  UNPAID: "未付",
  PARTIAL: "部分付款",
  PAID: "已付",
  OVERDUE: "逾期",
  BAD_DEBT: "坏账",
  WAIVED: "已豁免",
};

// Dashboard route mapping (default_dashboard → URL)
export const DASHBOARD_ROUTES: Record<string, string> = {
  ADMIN_DASHBOARD: "/admin",
  SALES_DASHBOARD: "/sales",
  EQUIPMENT_DASHBOARD: "/equipment",
  FINANCE_DASHBOARD: "/finance",
  MAINTENANCE_DASHBOARD: "/maintenance",
  APPROVAL_DASHBOARD: "/approval",
  CUSTOMER_DASHBOARD: "/customer",
  // 5 supervisor dashboards
  SALES_MANAGER_DASHBOARD: "/approval",
  FINANCE_MANAGER_DASHBOARD: "/approval",
  EQUIPMENT_SUPERVISOR_DASHBOARD: "/equipment",
  GENERAL_MANAGER_DASHBOARD: "/approval",
  MAINTENANCE_SUPERVISOR_DASHBOARD: "/maintenance",
};

// Role → Dashboard route (用于登录分流，primary_role → URL)
export const ROLE_DASHBOARD_MAP: Record<string, string> = {
  SYSTEM_ADMIN: "/admin",
  SALES: "/sales",
  EQUIPMENT_MANAGER: "/equipment",
  FINANCE: "/finance",
  MAINTENANCE: "/maintenance",
  APPROVER: "/approval",
  CUSTOMER: "/customer",
  SALES_MANAGER: "/approval",
  FINANCE_MANAGER: "/approval",
  EQUIPMENT_SUPERVISOR: "/equipment",
  GENERAL_MANAGER: "/approval",
  MAINTENANCE_SUPERVISOR: "/maintenance",
};

// Role labels
export const ROLE_LABELS: Record<string, string> = {
  // 7 个基础岗位角色 (§5.1)
  SYSTEM_ADMIN: "系统管理员",
  SALES: "业务员",
  EQUIPMENT_MANAGER: "设备管理员",
  FINANCE: "财务人员",
  MAINTENANCE: "维修人员",
  APPROVER: "审批/管理层",
  CUSTOMER: "客户",
  // 审批流程中的主管/管理层角色 (§14.2)
  SALES_MANAGER: "业务主管",
  FINANCE_MANAGER: "财务主管",
  EQUIPMENT_SUPERVISOR: "设备主管",
  GENERAL_MANAGER: "总经理",
  // 维修运维主管角色 (P1-08 维修工单流程)
  MAINTENANCE_SUPERVISOR: "维修主管",
};

// Credit levels
export const CREDIT_LEVELS: Record<string, string> = {
  S: "S级",
  A: "A级",
  B: "B级",
  C: "C级",
  D: "D级",
};

// Risk levels
export const RISK_LEVELS: Record<string, string> = {
  LOW: "低风险",
  MEDIUM: "中风险",
  HIGH: "高风险",
  CRITICAL: "极高风险",
};
