import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "default" | "primary" | "destructive" | "outline" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  ref?: Ref<HTMLButtonElement>;
}

const variantClass: Record<Variant, string> = {
  default: "border border-transparent bg-app-fg text-app-surface shadow-sm hover:opacity-90 active:opacity-95",
  primary: "border border-transparent bg-app-accent text-app-accent-contrast shadow-[0_12px_30px_color-mix(in_srgb,var(--accent)_24%,transparent)] hover:bg-app-accent-hover hover:shadow-[var(--shadow-md)]",
  destructive: "border border-transparent bg-app-danger text-white shadow-sm hover:opacity-90",
  outline: "premium-control border border-app-border-strong text-app-fg hover:bg-app-surface-muted hover:border-app-border-strong",
  ghost: "border border-transparent text-app-muted-strong hover:border-app-border hover:bg-app-surface/70 hover:text-app-fg",
  link: "text-app-accent underline-offset-4 hover:underline",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-11 px-5 text-sm rounded-lg gap-2",
};

export function Button({ className, variant = "default", size = "md", ref, children, ...props }: Props) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150",
        "focus-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}


