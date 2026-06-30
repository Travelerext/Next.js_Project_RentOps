import { ViewTransition } from "react";
import Link from "next/link";
import { Table, THead, TBody, Tr, Th, Td, MobileCards, MobileCard, MobileRow } from "@/components/ui/table";
import { ClickableTr } from "@/components/data/clickable-tr";
import { SkeletonTable } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

// ─── Types ──────────────────────────────────────────────────────────

export interface Column<T> {
  id: string;
  header: string;
  cell: (item: T) => ReactNode;
  hideOnMobile?: boolean;
  className?: string;
  /** Wrap this cell in a shared-element VT for cross-route morph (Priority 1) */
  shareIdentity?: (item: T) => string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  rowHref?: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  rowClassName?: (item: T) => string | undefined;
}

// ═══════════════════════════════════════════════════════════════════

export function DataTable<T>({ columns, data, keyExtractor, rowHref, onRowClick, emptyMessage = "暂无数据", loading, rowClassName }: Props<T>) {
  if (loading) return <SkeletonTable />;
  if (!data.length) return <p className="py-12 text-center text-app-muted">{emptyMessage}</p>;

  const renderCell = (col: Column<T>, item: T, isFirst: boolean) => {
    let content = col.cell(item);
    if (col.shareIdentity) {
      content = <ViewTransition name={col.shareIdentity(item)} share="text-morph" default="none">{content}</ViewTransition>;
    }
    // Apply link styling to the first cell — actual navigation is on the row
    if (isFirst && rowHref && !col.shareIdentity) {
      content = <span className="font-medium text-app-accent">{content}</span>;
    }
    return content;
  };

  const isClickable = !!(onRowClick || rowHref);

  return (
    <>
      {/* Desktop */}
      <Table>
        <THead>
          <Tr>{columns.map(c => <Th key={c.id}>{c.header}</Th>)}</Tr>
        </THead>
        <TBody>
          {data.map(item => {
            const cells = columns.map((c, ci) => <Td key={c.id} className={c.className}>{renderCell(c, item, ci === 0)}</Td>);
            const rowKey = keyExtractor(item);
            const rowCls = cn(isClickable ? "cursor-pointer" : "", rowClassName?.(item));

            return isClickable ? (
              <ClickableTr
                key={rowKey}
                href={rowHref?.(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={rowCls}
              >
                {cells}
              </ClickableTr>
            ) : (
              <Tr key={rowKey} className={rowCls}>
                {cells}
              </Tr>
            );
          })}
        </TBody>
      </Table>

      {/* Mobile */}
      <MobileCards>
        {data.map(item => {
          const href = rowHref?.(item);
          const card = (
            <MobileCard>
              {columns.filter(c => !c.hideOnMobile).map(c => (
                <MobileRow key={c.id} label={c.header}>{c.cell(item)}</MobileRow>
              ))}
            </MobileCard>
          );
          return href ? <Link key={keyExtractor(item)} href={href} className="block" transitionTypes={["nav-forward"]}>{card}</Link>
            : onRowClick ? <button key={keyExtractor(item)} className="block w-full text-left" onClick={() => onRowClick(item)}>{card}</button>
            : <div key={keyExtractor(item)}>{card}</div>;
        })}
      </MobileCards>
    </>
  );
}

function cn(...args: (string | undefined | false | null)[]) { return args.filter(Boolean).join(" "); }


