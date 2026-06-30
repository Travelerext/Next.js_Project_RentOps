type Item = { label: string; value: React.ReactNode };

export function InfoGrid({ items, cols, columns }: { items: Item[]; cols?: 1 | 2; columns?: 1 | 2 }) {
  const c = cols ?? columns ?? 2;
  return (
    <div className={`grid ${c === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-x-6 gap-y-3 text-sm`}>
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-2 min-w-0">
          <span className="shrink-0 text-app-muted">{item.label}：</span>
          <span className="truncate text-app-fg">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
