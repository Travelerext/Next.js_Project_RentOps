import { cn } from "@/lib/utils";
import type { ReactNode, MouseEvent } from "react";

// ─── Desktop table ─────────────────────────────────────────────────

export function Table({ children }: { children: ReactNode }) {
  return <div className="surface-panel hidden overflow-x-auto rounded-lg md:block"><table className="w-full border-separate border-spacing-0 text-sm">{children}</table></div>;
}
export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-app-surface/72 text-left">{children}</thead>;
}
export const THead = TableHead;
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-app-border">{children}</tbody>;
}
export const TBody = TableBody;

interface TrProps { children: ReactNode; className?: string; onClick?: (e: MouseEvent<HTMLTableRowElement>) => void }
export function TableRow({ children, className, onClick }: TrProps) {
  return <tr onClick={onClick} className={cn("group transition-colors hover:bg-app-surface/70", className)}>{children}</tr>;
}
export function Tr({ children, className, onClick }: TrProps) {
  return <TableRow className={className} onClick={onClick}>{children}</TableRow>;
}

export function TableHeader({ children, colSpan }: { children: ReactNode; colSpan?: number }) {
  return <th colSpan={colSpan} scope="col" className="border-b border-app-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-app-muted first:rounded-tl-lg last:rounded-tr-lg">{children}</th>;
}
export const Th = TableHeader;

export function TableCell({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-4 py-4 text-app-muted-strong transition-colors group-hover:text-app-fg", className)}>{children}</td>;
}
export const Td = TableCell;

// ─── Mobile card list ──────────────────────────────────────────────

export function MobileCards({ children }: { children: ReactNode }) {
  return <div className="md:hidden space-y-3">{children}</div>;
}
export const MobileCardList = MobileCards;

export function MobileCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("surface-panel animate-fade-in rounded-lg p-4 shadow-sm", className)}>{children}</div>;
}

export function MobileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm min-w-0">
      <span className="mr-3 shrink-0 text-app-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium tabular-nums text-app-fg">{children}</span>
    </div>
  );
}
export const MobileCardRow = MobileRow;


