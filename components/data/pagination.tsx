import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props { page: number; totalPages: number; baseUrl: string; query?: string }

export function Pagination({ page, totalPages, baseUrl, query = "" }: Props) {
  if (totalPages <= 1) return null;
  const q = query ? `&${query}` : "";
  const itemClass = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium text-app-muted-strong transition-colors hover:bg-app-surface-muted";
  const disabledClass = "inline-flex h-9 min-w-9 cursor-not-allowed items-center justify-center rounded-lg px-2 text-sm text-app-muted opacity-45";
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="分页导航">
      {page > 1 ? <Link href={`${baseUrl}?page=${page - 1}${q}`} className={itemClass} aria-label="上一页"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">上一页</span></Link> : <span className={disabledClass}><ChevronLeft className="h-4 w-4" /></span>}
      <div className="premium-control hidden items-center gap-1 rounded-lg border border-app-border p-1 sm:flex">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => <Link key={p} href={`${baseUrl}?page=${p}${q}`} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-center text-sm font-medium ${p === page ? "bg-app-accent text-app-accent-contrast" : "text-app-muted-strong hover:bg-app-surface-muted"}`} aria-current={p === page ? "page" : undefined}>{p}</Link>)}
      </div>
      <span className="text-sm tabular-nums text-app-muted sm:hidden">{page} / {totalPages}</span>
      {page < totalPages ? <Link href={`${baseUrl}?page=${page + 1}${q}`} className={itemClass} aria-label="下一页"><span className="hidden sm:inline">下一页</span><ChevronRight className="h-4 w-4" /></Link> : <span className={disabledClass}><ChevronRight className="h-4 w-4" /></span>}
    </nav>
  );
}


