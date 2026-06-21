type Item = { label: string; value: React.ReactNode };

export function InfoGrid({ items, cols, columns }: { items: Item[]; cols?: 1 | 2; columns?: 1 | 2 }) {
  const c = cols ?? columns ?? 2;
  return (
    <div className={`grid ${c === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-x-6 gap-y-3 text-sm`}>
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-2 min-w-0">
          <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{item.label}：</span>
          <span className="text-zinc-900 dark:text-zinc-100 truncate">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
