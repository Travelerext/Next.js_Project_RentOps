export const AI_ROLE_FOCUS: Record<string, string> = {
  SYSTEM_ADMIN: "系统健康、用户权限、审计线索与配置风险",
  SALES: "客户跟进、租赁订单、合同到期、催还提醒与可租设备",
  SALES_MANAGER: "销售审批、团队业绩、逾期风险、重点客户和经营报表",
  EQUIPMENT_MANAGER: "设备台账、库存状态、出入库、调拨和设备可用性",
  EQUIPMENT_SUPERVISOR: "资产监管、报废审批、调拨监控、设备利用率和异常状态",
  FINANCE: "应收账款、收款、发票、押金、退款和对账",
  FINANCE_MANAGER: "财务审批、回款率、逾期账龄、退款风险和结算质量",
  MAINTENANCE: "我的工单、维修进度、保养计划和配件使用",
  MAINTENANCE_SUPERVISOR: "派单队列、团队工单、维保计划、低库存配件和维修成本",
  APPROVER: "待审批事项、审批历史、业务风险和决策依据",
  GENERAL_MANAGER: "经营总览、收入趋势、资产利用率、逾期风险和跨部门瓶颈",
  CUSTOMER: "本客户的合同、账单、发票、押金和进行中订单",
};

export function getAiRoleFocus(role?: string | null) {
  return role ? AI_ROLE_FOCUS[role] ?? "当前角色可见的租赁运营事务" : "当前角色可见的租赁运营事务";
}
