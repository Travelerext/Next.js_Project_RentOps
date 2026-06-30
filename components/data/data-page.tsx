import { ViewTransition } from "react";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { Pagination } from "@/components/data/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonPage } from "@/components/ui/skeleton";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface FilterTab { key: string; label: string; href: string }

interface Props {
  title: string; subtitle?: string;
  actions?: ReactNode;
  search?: { placeholder?: string; defaultValue?: string; paramName?: string } | undefined;
  filters?: { items: FilterTab[]; activeKey: string } | undefined;
  pagination?: { page: number; totalPages: number; baseUrl: string; query?: string } | undefined;
  fab?: { href: string; label: string; icon?: LucideIcon } | undefined;
  children: ReactNode;
  loading?: boolean; error?: string | null; errorCode?: string; empty?: boolean; emptyMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════

export function DataPage(p: Props) {
  const body = p.error
    ? <div className="surface-panel rounded-lg bg-app-danger-soft p-8 text-center"><p className="font-medium text-app-danger">数据加载失败</p><p className="mt-1 text-sm text-app-danger">{p.error}</p></div>
    : p.loading ? <SkeletonPage />
    : p.empty ? <EmptyState title={p.emptyMessage ?? "暂无数据"} />
    : <>{p.children}</>;

  return (
    <DirectionalTransition>
      <ViewTransition enter="slide-up" default="none">
        <div className="space-y-7">
          <PageHeader title={p.title} subtitle={p.subtitle} actions={p.actions} />

          {/* Search + Filters */}
          {(p.search || p.filters) ? (
            <div className="surface-panel flex flex-col gap-3 rounded-lg p-2.5 sm:flex-row sm:items-center sm:justify-between">
              {p.search ? <SearchInput {...p.search} /> : null}
              {p.filters ? <FilterTabs items={p.filters.items} activeKey={p.filters.activeKey} /> : null}
            </div>
          ) : null}

          {/* Content */}
          {body}

          {/* Pagination */}
          {p.pagination && !p.error && !p.loading && !p.empty ? <Pagination {...p.pagination} /> : null}

          {/* FAB */}
          {p.fab ? <FabLink href={p.fab.href} label={p.fab.label} icon={p.fab.icon} /> : null}
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}

// ─── Search input ───────────────────────────────────────────────────

function SearchInput({ placeholder = "搜索…", defaultValue = "", paramName = "keyword" }: { placeholder?: string; defaultValue?: string; paramName?: string }) {
  return (
    <form method="GET" className="w-full sm:max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" aria-hidden="true" />
        <input name={paramName} defaultValue={defaultValue} placeholder={placeholder}
          className="focus-ring premium-control flex h-10 w-full rounded-lg border border-app-border pl-10 pr-4 text-sm text-app-fg placeholder:text-app-muted transition-[border-color,box-shadow] focus:border-app-accent" />
      </div>
    </form>
  );
}

// ─── Filter tabs ────────────────────────────────────────────────────

function FilterTabs({ items, activeKey }: { items: FilterTab[]; activeKey: string }) {
  return (
    <div className="scroll-snap-x flex gap-1 overflow-x-auto rounded-lg border border-app-border bg-app-surface/72 p-1">
      {items.map(tab => (
        <Link key={tab.key} href={tab.href} scroll={false}
          className={`scroll-snap-start shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab.key === activeKey ? "bg-app-surface text-app-accent shadow-sm" : "text-app-muted-strong hover:bg-app-surface/70 hover:text-app-fg"}`}
          aria-current={tab.key === activeKey ? "page" : undefined}>{tab.label}</Link>
      ))}
    </div>
  );
}

// ─── FAB ────────────────────────────────────────────────────────────

function FabLink({ href, label, icon: Icon = Plus }: { href: string; label: string; icon?: LucideIcon }) {
  return (
    <Link href={href} className="focus-ring fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-app-accent text-app-accent-contrast shadow-[var(--shadow-md)] transition-[background-color,transform] hover:bg-app-accent-hover active:scale-95 md:hidden" aria-label={label}>
      <Icon className="h-6 w-6" />
    </Link>
  );
}


