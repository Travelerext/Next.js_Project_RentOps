import { cn } from "@/lib/utils";
import type { ReactNode, MouseEvent } from "react";

// ─── Desktop table ─────────────────────────────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-700"><table className="w-full text-sm">{children}</table></div>;
}
export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-700 dark:bg-zinc-800/50">{children}</thead>;
}
export const THead = TableHead;
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">{children}</tbody>;
}
export const TBody = TableBody;

interface TrProps { children: ReactNode; className?: string; onClick?: (e: MouseEvent<HTMLTableRowElement>) => void }
export function TableRow({ children, className, onClick }: TrProps) {
  return <tr onClick={onClick} className={cn("hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors", className)}>{children}</tr>;
}
export function Tr({ children, className, onClick }: TrProps) {
  return <TableRow children={children} className={className} onClick={onClick} />;
}

export function TableHeader({ children, colSpan }: { children: ReactNode; colSpan?: number }) {
  return <th colSpan={colSpan} scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{children}</th>;
}
export const Th = TableHeader;

export function TableCell({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-4 py-3 text-zinc-700 dark:text-zinc-300", className)}>{children}</td>;
}
export const Td = TableCell;

// ─── Mobile card list ──────────────────────────────────────────────

export function MobileCards({ children }: { children: ReactNode }) {
  return <div className="md:hidden space-y-3">{children}</div>;
}
export const MobileCardList = MobileCards;

export function MobileCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/80 animate-fade-in", className)}>{children}</div>;
}

export function MobileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm min-w-0">
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0 mr-3">{label}</span>
      <span className="text-zinc-900 dark:text-zinc-100 text-right font-medium tabular-nums truncate min-w-0">{children}</span>
    </div>
  );
}
export const MobileCardRow = MobileRow;
