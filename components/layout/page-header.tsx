"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface Props { title: string; subtitle?: string; backUrl?: string; status?: ReactNode; actions?: ReactNode }

export function PageHeader({ title, subtitle, backUrl, status, actions }: Props) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {backUrl === "_back" ? (
          <button onClick={() => router.back()} className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="返回"><ArrowLeft className="h-4 w-4" /></button>
        ) : backUrl ? (
          <Link href={backUrl} className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="返回"><ArrowLeft className="h-4 w-4" /></Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 text-pretty truncate">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
