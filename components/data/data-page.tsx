import { ViewTransition } from "react";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { Pagination } from "@/components/data/pagination";
import { SkeletonPage } from "@/components/ui/skeleton";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import type { ReactNode, ComponentProps } from "react";
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
    ? <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20"><p className="font-medium text-red-600 dark:text-red-400">数据加载失败</p><p className="mt-1 text-sm text-red-500">{p.error}</p></div>
    : p.loading ? <SkeletonPage />
    : p.empty ? <p className="py-12 text-center text-zinc-500 dark:text-zinc-400">{p.emptyMessage ?? "暂无数据"}</p>
    : <>{p.children}</>;

  return (
    <DirectionalTransition>
      <ViewTransition enter="slide-up" default="none">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 text-pretty">{p.title}</h1>
              {p.subtitle && <p className="text-sm text-zinc-500 mt-1">{p.subtitle}</p>}
            </div>
            {p.actions && <div className="flex items-center gap-2 shrink-0">{p.actions}</div>}
          </div>

          {/* Search + Filters */}
          {(p.search || p.filters) ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
        <input name={paramName} defaultValue={defaultValue} placeholder={placeholder}
          className="flex h-10 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-4 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500" />
      </div>
    </form>
  );
}

// ─── Filter tabs ────────────────────────────────────────────────────

function FilterTabs({ items, activeKey }: { items: FilterTab[]; activeKey: string }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scroll-snap-x pb-1">
      {items.map(tab => (
        <Link key={tab.key} href={tab.href} scroll={false}
          className={`shrink-0 scroll-snap-start rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab.key === activeKey ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
          aria-current={tab.key === activeKey ? "page" : undefined}>{tab.label}</Link>
      ))}
    </div>
  );
}

// ─── FAB ────────────────────────────────────────────────────────────

function FabLink({ href, label, icon: Icon = Plus }: { href: string; label: string; icon?: LucideIcon }) {
  return (
    <Link href={href} className="md:hidden fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-transform transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label={label}>
      <Icon className="h-6 w-6" />
    </Link>
  );
}
