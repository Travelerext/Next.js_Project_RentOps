import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Color = "blue" | "emerald" | "red" | "amber" | "purple" | "indigo";

const colorMap: Record<Color, { bg: string; icon: string }> = {
  blue:    { bg: "bg-blue-100 dark:bg-blue-900/30",    icon: "text-blue-600 dark:text-blue-400" },
  emerald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: "text-emerald-600 dark:text-emerald-400" },
  red:     { bg: "bg-red-100 dark:bg-red-900/30",      icon: "text-red-600 dark:text-red-400" },
  amber:   { bg: "bg-amber-100 dark:bg-amber-900/30",  icon: "text-amber-600 dark:text-amber-400" },
  purple:  { bg: "bg-purple-100 dark:bg-purple-900/30", icon: "text-purple-600 dark:text-purple-400" },
  indigo:  { bg: "bg-indigo-100 dark:bg-indigo-900/30", icon: "text-indigo-600 dark:text-indigo-400" },
};

interface Props {
  icon: LucideIcon; label: string; value?: string | number;
  color?: Color; href?: string; children?: React.ReactNode;
}

export function StatCard({ icon: Icon, label, value, color = "blue", href, children }: Props) {
  const c = colorMap[color];
  const inner = (
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.bg}`}><Icon className={`h-5 w-5 ${c.icon}`} /></div>
      <div className="min-w-0">
        {value !== undefined && <p className={`text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums ${color === "red" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
        {children}
      </div>
    </div>
  );
  const cls = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/80" + (href ? " transition-shadow hover:shadow-md" : "");
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
