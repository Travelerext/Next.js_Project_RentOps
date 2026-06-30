"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface Props { title: string; subtitle?: string; backUrl?: string; status?: ReactNode; actions?: ReactNode }

export function PageHeader({ title, subtitle, backUrl, status, actions }: Props) {
  const router = useRouter();
  const backClass = "focus-ring premium-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border text-app-muted transition-colors hover:text-app-fg";
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-transparent py-1 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {backUrl === "_back" ? (
          <button onClick={() => router.back()} className={backClass} aria-label="返回"><ArrowLeft className="h-4 w-4" /></button>
        ) : backUrl ? (
          <Link href={backUrl} className={backClass} aria-label="返回"><ArrowLeft className="h-4 w-4" /></Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-semibold leading-tight tracking-normal text-app-fg text-pretty sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-app-muted sm:text-[15px]">{subtitle}</p>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  );
}


