"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Truck, FileText, DollarSign, Wrench,
  CheckSquare, Package, Scan, Settings, ChevronLeft, Menu, X,
  UserPlus, ShoppingCart, AlertTriangle, BarChart3, ClipboardList,
  Calendar, Shield, CreditCard, Receipt, Banknote, ArrowLeftRight,
  HardHat, Boxes, Hammer, Gauge, Calculator, TrendingUp, ListChecks,
  History, PlusCircle, type LucideIcon,
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
    { label: "退款管理", href: "/finance/refunds", icon: DollarSign },
  ],
  GENERAL_MANAGER: [
    { label: "经营看板", href: "/sales/reports", icon: BarChart3 },
    { label: "高风险监控", href: "/sales/customers", icon: AlertTriangle },
  ],
};

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

  // Stable ref for callbacks to avoid unnecessary effect re-runs
  const onMobileCloseRef = { current: onMobileClose };
  onMobileCloseRef.current = onMobileClose;

  // Base items + role-specific extras
  const baseItems = MENUS[dashboard] ?? [];
  const extras = ROLE_EXTRA_LINKS[primaryRole ?? ""] ?? [];
  // Deduplicate: don't add extras that already exist in base
  const existingHrefs = new Set(baseItems.map(i => i.href));
  const items = [...baseItems, ...extras.filter(e => !existingHrefs.has(e.href))];

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onMobileCloseRef.current(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [mobileOpen]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Close mobile on route change
  useEffect(() => { onMobileCloseRef.current(); }, [pathname]);

  // Role label for display
  const roleLabel = primaryRole ? {
    SALES_MANAGER: "业务主管", FINANCE_MANAGER: "财务主管",
    EQUIPMENT_SUPERVISOR: "设备主管", GENERAL_MANAGER: "总经理",
    MAINTENANCE_SUPERVISOR: "维修主管",
  }[primaryRole] : null;

  const nav = (
    <>
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        {!collapsed && (
          <div className="flex items-center gap-2 truncate">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600">
              <HardHat className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
              设备租赁管理
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <HardHat className="h-4 w-4 text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="hidden md:flex rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
        <button
          onClick={onMobileClose}
          className="md:hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="关闭菜单"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Role badge */}
      {!collapsed && roleLabel && (
        <div className="px-3 pt-2 pb-0">
          <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 overscroll-contain" role="navigation" aria-label="主导航">
        {items.map((item, index) => {
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

            // Dashboard root (first item) always uses exact match
            if (index === 0) return isActive(item.href, true);

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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>

              {/* Sub-menu */}
              {!collapsed && hasChildren && (
                <div className="ml-8 mt-0.5 space-y-0.5 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                  {item.children!.map((child) => {
                    const childActive = isActive(child.href, true);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          childActive
                            ? "text-blue-700 dark:text-blue-400 font-medium"
                            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
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
          "hidden md:flex flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 transition-[width] duration-200 ease-in-out",
          collapsed ? "w-16" : "w-60"
        )}
        style={{ viewTransitionName: "site-sidebar" }}
      >
        {nav}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-3 left-3 z-40 rounded-lg border border-zinc-200 bg-white/90 backdrop-blur-sm p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="打开菜单"
      >
        <Menu className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onMobileClose} aria-hidden="true" />
          <aside
            className="fixed top-0 left-0 bottom-0 w-64 flex flex-col bg-white dark:bg-zinc-900 animate-slide-in-left safe-top safe-bottom overscroll-contain"
            role="dialog" aria-modal="true" aria-label="导航菜单"
          >
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
