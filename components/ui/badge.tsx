import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger:  "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info:    "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

interface Props { children: ReactNode; variant?: Variant; className?: string; pulse?: boolean }

export function Badge({ children, variant = "default", className, pulse }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium animate-fade-in", variantClass[variant], className)}>
      {pulse && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" /></span>}
      {children}
    </span>
  );
}
