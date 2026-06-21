"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, children, className }: Props) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={close} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cn(
          "relative z-10 w-full bg-white shadow-xl dark:bg-zinc-800",
          "animate-slide-up md:animate-scale-in",
          "rounded-t-2xl md:rounded-xl md:max-w-lg md:mx-4",
          "max-h-[85vh] overflow-y-auto overscroll-contain",
          "safe-bottom", className,
        )}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 md:px-6 py-4 dark:border-zinc-700 dark:bg-zinc-800 rounded-t-2xl md:rounded-t-xl">
            <h2 className="text-lg font-semibold text-pretty">{title}</h2>
            <button type="button" onClick={close} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn(!title && "pt-4", "px-4 md:px-6 pb-6")}>{children}</div>
      </div>
    </div>
  );
}
