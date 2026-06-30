"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Truck, FileText, DollarSign, Wrench,
  CheckSquare, Package, Scan, Settings, ChevronLeft, X,
  UserPlus, ShoppingCart, AlertTriangle, BarChart3, ClipboardList,
  Calendar, Shield, CreditCard, Receipt, Banknote, ArrowLeftRight,
  HardHat, Boxes, Gauge, Calculator, TrendingUp, ListChecks,
  History, PlusCircle, BrainCircuit, type LucideIcon,
} from "lucide-react";

// ─── Menu item type ────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  children?: { label: string; href: string }[];
}

// ─── Base menu config ──────────────────────────────────────────────────
const MENUS: Record<string, MenuItem[]> = {
  ADMIN_DASHBOARD: [
    { label: "工作台", href: "/admin", icon: LayoutDashboard },
    { label: "用户管理", href: "/admin/users", icon: Users },
    { label: "角色权限", href: "/admin/roles", icon: Shield },
    { label: "权限管理", href: "/admin/permissions", icon: ListChecks },
    { label: "审计日志", href: "/admin/audit-log", icon: History },
    { label: "系统配置", href: "/admin/settings", icon: Settings },
  ],
  SALES_DASHBOARD: [
    { label: "工作台", href: "/sales", icon: LayoutDashboard },
    { label: "客户管理", href: "/sales/customers", icon: Users,
      children: [{ label: "客户列表", href: "/sales/customers" }, { label: "新建客户", href: "/sales/customers/new" }] },
    { label: "可租设备", href: "/sales/available-equipment", icon: Truck },
    { label: "租赁订单", href: "/sales/orders", icon: ShoppingCart,
      children: [{ label: "订单列表", href: "/sales/orders" }, { label: "快速开单", href: "/sales/orders/new" }] },
    { label: "合同管理", href: "/sales/contracts", icon: FileText },
    { label: "催还提醒", href: "/sales/reminders", icon: AlertTriangle },
    { label: "业务报表", href: "/sales/reports", icon: BarChart3 },
  ],
  EQUIPMENT_DASHBOARD: [
    { label: "工作台", href: "/equipment", icon: LayoutDashboard },
    { label: "设备台账", href: "/equipment/catalog", icon: Package },
    { label: "新增设备", href: "/equipment/catalog/new", icon: UserPlus },
    { label: "扫码出库", href: "/equipment/scan/outbound", icon: Scan },
    { label: "扫码入库", href: "/equipment/scan/inbound", icon: Scan },
    { label: "设备调拨", href: "/equipment/transfers", icon: ArrowLeftRight },
  ],
  FINANCE_DASHBOARD: [
    { label: "工作台", href: "/finance", icon: LayoutDashboard },
    { label: "应收账款", href: "/finance/receivables", icon: Receipt },
    { label: "收款记录", href: "/finance/payments", icon: CreditCard },
    { label: "发票管理", href: "/finance/invoices", icon: FileText },
    { label: "押金管理", href: "/finance/deposits", icon: Banknote },
    { label: "退款管理", href: "/finance/refunds", icon: DollarSign },
    { label: "退租结算", href: "/finance/settlement", icon: Calculator },
    { label: "对账单", href: "/finance/reconciliation", icon: FileText },
    { label: "折旧", href: "/finance/depreciation", icon: Gauge },
    { label: "设备利润", href: "/finance/equipment-profit", icon: TrendingUp },
  ],
  MAINTENANCE_DASHBOARD: [
    { label: "工作台", href: "/maintenance", icon: LayoutDashboard },
    { label: "我的工单", href: "/maintenance/work-orders?mine=1", icon: ClipboardList },
    { label: "全部工单", href: "/maintenance/work-orders", icon: Wrench,
      children: [{ label: "工单列表", href: "/maintenance/work-orders" }, { label: "新建报修", href: "/maintenance/work-orders/new" }] },
    { label: "保养计划", href: "/maintenance/plans", icon: Calendar },
    { label: "配件库存", href: "/maintenance/spare-parts", icon: Boxes },
    { label: "配件流水", href: "/maintenance/spare-parts/movements", icon: ArrowLeftRight },
  ],
  APPROVAL_DASHBOARD: [
    { label: "工作台", href: "/approval", icon: LayoutDashboard },
    { label: "待审批", href: "/approval/pending", icon: ClipboardList },
    { label: "已审批", href: "/approval/history", icon: CheckSquare },
  ],
  CUSTOMER_DASHBOARD: [
    { label: "首页", href: "/customer", icon: LayoutDashboard },
    { label: "我的合同", href: "/customer/contracts", icon: FileText },
    { label: "账单查询", href: "/customer/bills", icon: DollarSign },
    { label: "发票管理", href: "/customer/invoices", icon: Receipt },
  ],

  // ─── Supervisor dashboard menus (5 new - only links to existing pages) ──
  MAINTENANCE_SUPERVISOR_DASHBOARD: [
    { label: "工作台", href: "/maintenance", icon: LayoutDashboard },
    { label: "待派单队列", href: "/maintenance/work-orders?status=PENDING_DISPATCH", icon: ClipboardList },
    { label: "全部工单", href: "/maintenance/work-orders", icon: Wrench },
    { label: "新建报修", href: "/maintenance/work-orders/new", icon: PlusCircle },
    { label: "保养计划", href: "/maintenance/plans", icon: Calendar },
    { label: "配件库存", href: "/maintenance/spare-parts", icon: Boxes },
    { label: "配件流水", href: "/maintenance/spare-parts/movements", icon: ArrowLeftRight },
  ],
  SALES_MANAGER_DASHBOARD: [
    { label: "工作台", href: "/approval", icon: LayoutDashboard },
    { label: "待审批", href: "/approval/pending", icon: ClipboardList },
    { label: "已审批", href: "/approval/history", icon: CheckSquare },
    { label: "订单管理", href: "/sales/orders", icon: ShoppingCart },
    { label: "合同管理", href: "/sales/contracts", icon: FileText },
    { label: "客户管理", href: "/sales/customers", icon: Users },
    { label: "业务报表", href: "/sales/reports", icon: BarChart3 },
  ],
  FINANCE_MANAGER_DASHBOARD: [
    { label: "工作台", href: "/approval", icon: LayoutDashboard },
    { label: "待审批", href: "/approval/pending", icon: ClipboardList },
    { label: "应收账款", href: "/finance/receivables", icon: Receipt },
    { label: "收款记录", href: "/finance/payments", icon: CreditCard },
    { label: "发票管理", href: "/finance/invoices", icon: FileText },
    { label: "押金管理", href: "/finance/deposits", icon: Banknote },
    { label: "退款管理", href: "/finance/refunds", icon: DollarSign },
    { label: "退租结算", href: "/finance/settlement", icon: Calculator },
    { label: "对账单", href: "/finance/reconciliation", icon: FileText },
  ],
  EQUIPMENT_SUPERVISOR_DASHBOARD: [
    { label: "工作台", href: "/equipment", icon: LayoutDashboard },
    { label: "设备台账", href: "/equipment/catalog", icon: Package },
    { label: "新增设备", href: "/equipment/catalog/new", icon: PlusCircle },
    { label: "设备调拨", href: "/equipment/transfers", icon: ArrowLeftRight },
    { label: "扫码出库", href: "/equipment/scan/outbound", icon: Scan },
    { label: "扫码入库", href: "/equipment/scan/inbound", icon: Scan },
  ],
  GENERAL_MANAGER_DASHBOARD: [
    { label: "工作台", href: "/approval", icon: LayoutDashboard },
    { label: "待审批", href: "/approval/pending", icon: ClipboardList },
    { label: "已审批", href: "/approval/history", icon: CheckSquare },
    { label: "经营报表", href: "/sales/reports", icon: BarChart3 },
    { label: "审计日志", href: "/admin/audit-log", icon: History },
  ],
};

// ─── Cross-role links: items added for specific roles on shared dashboards
const ROLE_EXTRA_LINKS: Record<string, MenuItem[]> = {
  SALES_MANAGER: [
    { label: "租赁订单", href: "/sales/orders", icon: ShoppingCart },
    { label: "合同管理", href: "/sales/contracts", icon: FileText },
    { label: "客户查询", href: "/sales/customers", icon: Users },
  ],
  FINANCE_MANAGER: [
    { label: "应收账款", href: "/finance/receivables", icon: Receipt },
    { label: "收款记录", href: "/finance/payments", icon: CreditCard },
    { label: "发票管理", href: "/finance/invoices", icon: FileText },
    { label: "退款管理", href: "/finance/refunds", icon: DollarSign },
  ],
  GENERAL_MANAGER: [
    { label: "经营看板", href: "/sales/reports", icon: BarChart3 },
    { label: "高风险监控", href: "/sales/customers", icon: AlertTriangle },
  ],
};

const GLOBAL_MENU_ITEMS: MenuItem[] = [
  { label: "AI 助手", href: "/ai", icon: BrainCircuit },
];

// ─── Props ─────────────────────────────────────────────────────────────
interface Props {
  dashboard: string;
  primaryRole?: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

// ─── Active link detector ──────────────────────────────────────────────
function useIsActive() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (href: string, exact = false): boolean => {
    // Split href into path and query
    const [hrefPath, hrefQuery] = href.split("?");
    // Path matching: exact mode only matches the same path;
    // non-exact (parent) mode also matches sub-paths.
    const pathMatches = exact
      ? pathname === hrefPath
      : pathname === hrefPath || pathname.startsWith(hrefPath + "/");
    if (!pathMatches) return false;
    // If href has query params, they must all match current URL
    if (hrefQuery) {
      const hrefParams = new URLSearchParams(hrefQuery);
      for (const [key, value] of hrefParams) {
        if (searchParams.get(key) !== value) return false;
      }
    }
    return true;
  };
}

// ═══════════════════════════════════════════════════════════════════════
export function Sidebar({ dashboard, primaryRole, collapsed, mobileOpen, onToggle, onMobileClose }: Props) {
  const isActive = useIsActive();
  const pathname = usePathname();
  const compact = collapsed && !mobileOpen;
  const dashboardRootHref = MENUS[dashboard]?.[0]?.href;

  // Base items + role-specific extras
  const items = useMemo(() => {
    const baseItems = MENUS[dashboard] ?? [];
    const extras = ROLE_EXTRA_LINKS[primaryRole ?? ""] ?? [];
    const existingHrefs = new Set([...GLOBAL_MENU_ITEMS, ...baseItems].map((i) => i.href));
    return [
      ...GLOBAL_MENU_ITEMS,
      ...baseItems,
      ...extras.filter((e) => !existingHrefs.has(e.href)),
    ];
  }, [dashboard, primaryRole]);

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [mobileOpen, onMobileClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Close mobile on route change
  useEffect(() => { onMobileClose(); }, [pathname, onMobileClose]);

  // Role label for display
  const roleLabel = primaryRole ? {
    SALES_MANAGER: "业务主管", FINANCE_MANAGER: "财务主管",
    EQUIPMENT_SUPERVISOR: "设备主管", GENERAL_MANAGER: "总经理",
    MAINTENANCE_SUPERVISOR: "维修主管",
  }[primaryRole] : null;

  const nav = (
    <>
      {/* Brand */}
      <div className="flex h-16 items-center justify-between border-b border-app-border px-3 md:h-[4.5rem]">
        {!compact && (
          <div className="flex items-center gap-2 truncate">
            <div className="brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <HardHat className="h-4 w-4 text-app-accent-contrast" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-fg">RentOps</p>
            </div>
          </div>
        )}
        {compact && (
          <div className="brand-mark mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <HardHat className="h-4 w-4 text-app-accent-contrast" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="focus-ring hidden rounded-lg border border-transparent p-1.5 text-app-muted transition-colors hover:border-app-border hover:bg-app-surface hover:text-app-fg md:flex"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
        <button
          onClick={onMobileClose}
          className="focus-ring rounded-lg p-1.5 text-app-muted transition-colors hover:bg-app-surface-muted hover:text-app-fg md:hidden"
          aria-label="关闭菜单"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Role badge */}
      {!compact && roleLabel && (
        <div className="px-3 pb-1 pt-3">
          <span className="premium-control inline-flex rounded-md border border-app-border px-2 py-1 text-[10px] font-semibold text-app-muted-strong">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2 overscroll-contain" role="navigation" aria-label="主导航">
        {items.map((item) => {
          const hasChildren = !!item.children?.length;

          // ── Active detection ───────────────────────────────────
          // Items WITH children: always use prefix-match (section header),
          // BUT defer to a childless sibling that has the same path with
          // matching query params (e.g. "我的工单" overrides "全部工单").
          // Items WITHOUT children: use longest-prefix-match among siblings
          // so that e.g. /equipment/catalog/new doesn't also highlight
          // /equipment/catalog.
          const active = (() => {
            if (hasChildren) {
              // Suppress if a childless sibling with same path + matching
              // query params takes precedence
              const overridden = items.some(
                (other) =>
                  other.href !== item.href &&
                  !other.children?.length &&
                  other.href.startsWith(item.href + "?") &&
                  isActive(other.href)
              );
              if (overridden) return false;
              return isActive(item.href);
            }

            // Dashboard root always uses exact match.
            if (item.href === dashboardRootHref) return isActive(item.href, true);

            // For childless items: only active if no OTHER childless sibling
            // has a longer href (or same path + extra params) that also
            // matches the current path.
            if (!isActive(item.href)) return false;
            const longerMatch = items.some(
              (other) =>
                other.href !== item.href &&
                !other.children?.length &&
                other.href.length > item.href.length &&
                other.href.startsWith(item.href) &&
                isActive(other.href)
            );
            return !longerMatch;
          })();

          const Icon = item.icon;

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "focus-ring group relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform]",
                  active
                    ? "border-app-border-strong bg-app-surface text-app-accent shadow-[var(--shadow-sm)]"
                    : "border-transparent text-app-muted-strong hover:-translate-y-px hover:border-app-border hover:bg-app-surface/70 hover:text-app-fg"
                )}
                title={compact ? item.label : undefined}
                aria-current={active ? "page" : undefined}
              >
                {active && <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-app-accent shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_44%,transparent)]" aria-hidden="true" />}
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors", active ? "bg-app-accent-soft" : "group-hover:bg-app-surface-muted")}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                </span>
                {!compact && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto rounded-full bg-app-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>

              {/* Sub-menu */}
              {!compact && hasChildren && (
                <div className="ml-8 mt-1 space-y-0.5 border-l border-app-border pl-3">
                  {item.children!.map((child) => {
                    const childActive = isActive(child.href, true);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          childActive
                            ? "bg-app-accent-soft font-semibold text-app-accent"
                            : "text-app-muted hover:bg-app-surface-muted hover:text-app-fg"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "app-chrome relative z-30 hidden flex-col border-r border-app-border transition-[width] duration-200 ease-in-out md:flex",
          collapsed ? "w-16" : "w-60"
        )}
        style={{ viewTransitionName: "site-sidebar" }}
      >
        {nav}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" onClick={onMobileClose} aria-hidden="true" />
          <aside
            className="safe-top safe-bottom surface-panel fixed bottom-0 left-0 top-0 flex w-72 max-w-[86vw] flex-col animate-slide-in-left overscroll-contain"
            role="dialog" aria-modal="true" aria-label="导航菜单"
          >
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}


