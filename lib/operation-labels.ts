export const ALERT_STATUS: Record<string, string> = {
  OPEN: "待处理",
  ACKNOWLEDGED: "已确认",
  PROCESSING: "处理中",
  CLOSED: "已关闭",
};

export const ALERT_TYPE: Record<string, string> = {
  FAULT_CODE: "故障码",
  HYDRAULIC_PRESSURE: "液压压力",
  GEOFENCE: "电子围栏",
  TERMINAL_OFFLINE: "终端离线",
};

export const ALERT_LEVEL: Record<string, string> = {
  INFO: "提示",
  WARNING: "预警",
  CRITICAL: "严重",
  ERROR: "异常",
};

export const IOT_STATUS: Record<string, string> = {
  ACTIVE: "已启用",
  ONLINE: "在线",
  OFFLINE: "离线",
  DISABLED: "停用",
};

export const INQUIRY_STATUS: Record<string, string> = {
  SUBMITTED: "已提交",
  FOLLOWING: "跟进中",
  QUOTED: "已报价",
  CONVERTED: "已转订单",
  CLOSED: "已关闭",
  CANCELLED: "已撤销",
};

export const VOUCHER_STATUS: Record<string, string> = {
  SUBMITTED: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  CONFIRMED: "已确认收款",
};

export const CUSTOMER_REPAIR_STATUS: Record<string, string> = {
  SUBMITTED: "已提交",
  DISPATCHING: "待派单",
  DISPATCHED: "已派单",
  IN_PROGRESS: "维修中",
  COMPLETED: "已完成",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
};

export const INSURANCE_STATUS: Record<string, string> = {
  ACTIVE: "有效",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
};

export const CLAIM_STATUS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  ASSESSING: "定损中",
  APPROVED: "已通过",
  PAID: "已赔付",
  REJECTED: "已驳回",
  CLOSED: "已关闭",
};

export const HEALTH_LEVEL: Record<string, string> = {
  EXCELLENT: "优秀",
  GOOD: "良好",
  FAIR: "一般",
  POOR: "较差",
  HIGH_RISK: "高风险",
};

export function statusVariant(status?: string): "success" | "warning" | "danger" | "info" | "default" {
  if (!status) return "default";
  if (["ACTIVE", "ONLINE", "APPROVED", "CONFIRMED", "PAID", "SIGNED", "COMPLETED", "CLOSED", "EXCELLENT", "GOOD"].includes(status)) return "success";
  if (["SUBMITTED", "PENDING", "FOLLOWING", "PROCESSING", "ASSESSING", "FAIR", "WARNING", "MEDIUM"].includes(status)) return "warning";
  if (["REJECTED", "EXPIRED", "CANCELLED", "OFFLINE", "HIGH_RISK", "CRITICAL", "ERROR", "HIGH"].includes(status)) return "danger";
  if (["OPEN", "DISPATCHED", "IN_PROGRESS", "QUOTED", "CONVERTED"].includes(status)) return "info";
  return "default";
}

export function pct(value: number | string | null | undefined) {
  const num = typeof value === "string" ? Number(value) : value ?? 0;
  return `${(num * 100).toFixed(1)}%`;
}
