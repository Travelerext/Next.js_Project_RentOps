import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, Ref } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, label, error, id, ref, ...props }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-sm font-medium text-app-muted-strong">{label}</label>}
      <input
        ref={ref} id={id}
        className={cn(
          "premium-control flex h-10 w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-fg placeholder:text-app-muted transition-[border-color,box-shadow,background-color]",
          "focus-ring focus:border-app-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-app-danger",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-app-danger">{error}</p>}
    </div>
  );
}


