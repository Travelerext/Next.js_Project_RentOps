interface Props { children: React.ReactNode; cols?: { mobile?: 1|2; desktop?: 2|3|4 } }

const GRID: Record<string, string> = {
  "1-": "grid-cols-1",
  "2-": "grid-cols-2",
  "2-3": "sm:grid-cols-3",
  "2-4": "sm:grid-cols-3 lg:grid-cols-4",
  "1-2": "sm:grid-cols-2",
  "1-3": "sm:grid-cols-2 lg:grid-cols-3",
  "1-4": "sm:grid-cols-2 lg:grid-cols-4",
};

export function StatsGrid({ children, cols = { mobile: 2, desktop: 4 } }: Props) {
  const m = cols.mobile ?? 2;
  const d = cols.desktop ?? 4;
  const key = `${m}-${d}`;
  const responsive = GRID[key] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return <div className={`grid ${responsive} gap-3 md:gap-4`}>{children}</div>;
}
