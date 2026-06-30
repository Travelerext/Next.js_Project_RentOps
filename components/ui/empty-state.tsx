import { cn } from "@/lib/utils";
import { PackageOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div className={cn("surface-panel flex flex-col items-center justify-center rounded-lg py-16 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-app-surface-muted">
        <Icon className="h-7 w-7 text-app-muted" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-app-muted-strong">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-6 text-app-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}


