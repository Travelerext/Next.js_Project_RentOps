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
      {label && <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>}
      <select
        ref={ref} id={id}
        className={cn(
          "flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
          error && "border-red-500 focus:ring-red-500",
          className,
        )}
        {...props}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
