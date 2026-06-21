import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props { page: number; totalPages: number; baseUrl: string; query?: string }

export function Pagination({ page, totalPages, baseUrl, query = "" }: Props) {
  if (totalPages <= 1) return null;
  const q = query ? `&${query}` : "";
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="分页导航">
      {page > 1 ? <Link href={`${baseUrl}?page=${page - 1}${q}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="上一页"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">上一页</span></Link> : <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 dark:text-zinc-600 cursor-not-allowed"><ChevronLeft className="h-4 w-4" /></span>}
      <div className="hidden sm:flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => <Link key={p} href={`${baseUrl}?page=${p}${q}`} className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-center text-sm ${p === page ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`} aria-current={p === page ? "page" : undefined}>{p}</Link>)}
      </div>
      <span className="sm:hidden text-sm text-zinc-500 tabular-nums">{page} / {totalPages}</span>
      {page < totalPages ? <Link href={`${baseUrl}?page=${page + 1}${q}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="下一页"><span className="hidden sm:inline">下一页</span><ChevronRight className="h-4 w-4" /></Link> : <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 dark:text-zinc-600 cursor-not-allowed"><ChevronRight className="h-4 w-4" /></span>}
    </nav>
  );
}
