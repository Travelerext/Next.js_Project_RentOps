import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Color = "blue" | "emerald" | "red" | "amber" | "purple" | "indigo";

const colorMap: Record<Color, { bg: string; icon: string }> = {
  blue: { bg: "bg-app-accent-soft", icon: "text-app-accent" },
  emerald: { bg: "bg-app-success-soft", icon: "text-app-success" },
  red: { bg: "bg-app-danger-soft", icon: "text-app-danger" },
  amber: { bg: "bg-app-warning-soft", icon: "text-app-warning" },
  purple: { bg: "bg-app-info-soft", icon: "text-app-info" },
  indigo: { bg: "bg-app-info-soft", icon: "text-app-info" },
};

interface Props {
  icon: LucideIcon; label: string; value?: string | number;
  color?: Color; href?: string; children?: React.ReactNode;
}

export function StatCard({ icon: Icon, label, value, color = "blue", href, children }: Props) {
  const c = colorMap[color];
  const inner = (
    <div className="relative flex min-h-24 items-start justify-between gap-3 overflow-hidden">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-app-muted">{label}</p>
        {value !== undefined && <p className={`mt-3 truncate text-[30px] font-semibold leading-none tabular-nums tracking-normal text-app-fg sm:text-[34px] ${color === "red" ? "text-app-danger" : ""}`}>{value}</p>}
        {children}
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-app-border ${c.bg} shadow-sm`}><Icon className={`h-5 w-5 ${c.icon}`} /></div>
    </div>
  );
  const cls = "surface-panel rounded-lg p-4 md:p-5" + (href ? " transition-[border-color,box-shadow,transform] hover:-translate-y-1 hover:border-app-border-strong hover:shadow-[var(--shadow-md)]" : "");
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}


