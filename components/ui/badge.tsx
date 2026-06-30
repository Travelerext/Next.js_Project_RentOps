import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "border-app-border bg-app-surface/72 text-app-muted-strong",
  success: "border-transparent bg-app-success-soft text-app-success",
  warning: "border-transparent bg-app-warning-soft text-app-warning",
  danger: "border-transparent bg-app-danger-soft text-app-danger",
  info: "border-transparent bg-app-info-soft text-app-info",
};

interface Props { children: ReactNode; variant?: Variant; className?: string; pulse?: boolean }

export function Badge({ children, variant = "default", className, pulse }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold animate-fade-in", variantClass[variant], className)}>
      {pulse && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" /></span>}
      {children}
    </span>
  );
}


