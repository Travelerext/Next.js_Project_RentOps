import type { CSSProperties } from "react";

function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className ?? ""}`} style={style} role="status" aria-label="加载中" />;
}

export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <Skel className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[1,2,3,4].map(i => <Skel key={i} className="h-24 rounded-lg" />)}
      </div>
      <Skel className="h-64 rounded-lg" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, r) => <Skel key={r} className="h-4 w-full" />)}
    </div>
  );
}
