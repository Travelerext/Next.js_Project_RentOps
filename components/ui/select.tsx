import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes, Ref } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, label, error, id, options, ref, ...props }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-sm font-medium text-app-muted-strong">{label}</label>}
      <select
        ref={ref} id={id}
        className={cn(
          "premium-control flex h-10 w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg transition-[border-color,box-shadow,background-color]",
          "focus-ring focus:border-app-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-app-danger",
          className,
        )}
        {...props}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-app-danger">{error}</p>}
    </div>
  );
}


