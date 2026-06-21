interface Props { children: React.ReactNode; cols?: { mobile?: 1|2; desktop?: 2|3|4 } }

export function StatsGrid({ children, cols = { mobile: 2, desktop: 4 } }: Props) {
  const m = cols.mobile ?? 2;
  const d = cols.desktop ?? 4;
  return <div className={`grid grid-cols-${m} sm:grid-cols-${Math.min(d, m+1)} lg:grid-cols-${d} gap-3 md:gap-4`}>{children}</div>;
}
