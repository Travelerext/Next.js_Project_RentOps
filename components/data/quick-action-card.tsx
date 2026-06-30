import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "accent" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, { bg: string; text: string }> = {
  accent: { bg: "bg-app-accent-soft", text: "text-app-accent" },
  success: { bg: "bg-app-success-soft", text: "text-app-success" },
  warning: { bg: "bg-app-warning-soft", text: "text-app-warning" },
  danger: { bg: "bg-app-danger-soft", text: "text-app-danger" },
  info: { bg: "bg-app-info-soft", text: "text-app-info" },
};

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  tone?: Tone;
  badge?: ReactNode;
  className?: string;
}

export function QuickActionCard({
  icon: Icon,
  title,
  description,
  href,
  tone = "accent",
  badge,
  className,
}: Props) {
  const color = toneClass[tone];

  return (
    <Link
      href={href}
      className={cn(
        "surface-panel group flex h-full min-h-36 flex-col justify-between rounded-lg p-4 transition-[box-shadow,transform,border-color] duration-150 md:p-5",
        "hover:-translate-y-1 hover:border-app-border-strong hover:shadow-[var(--shadow-md)]",
        "focus-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-app-border shadow-sm", color.bg)}>
          <Icon className={cn("h-5 w-5", color.text)} aria-hidden="true" />
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-app-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-app-fg" />
      </div>
      <div className="mt-4 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-app-fg">{title}</h3>
          {badge}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-app-muted">{description}</p>
      </div>
    </Link>
  );
}
