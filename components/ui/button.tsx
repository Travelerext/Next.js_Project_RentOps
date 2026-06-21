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
  default:   "bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:active:bg-zinc-300",
  primary:   "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
  destructive:"bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  outline:   "border border-zinc-300 bg-white hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:active:bg-zinc-600",
  ghost:     "hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700",
  link:      "text-blue-600 underline-offset-4 hover:underline dark:text-blue-400",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};

export function Button({ className, variant = "default", size = "md", ref, children, ...props }: Props) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors transition-transform duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.97]",
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
