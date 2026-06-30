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
      <div className="fixed inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" onClick={close} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={cn(
          "surface-panel-elevated relative z-10 w-full shadow-[var(--shadow-md)]",
          "animate-slide-up md:animate-scale-in",
          "rounded-t-lg md:mx-4 md:max-w-lg md:rounded-lg",
          "max-h-[85vh] overflow-y-auto overscroll-contain",
          "safe-bottom", className,
        )}
      >
        {title && (
          <div className="app-chrome sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b border-app-border px-4 py-4 md:px-6">
            <h2 className="text-lg font-semibold text-pretty">{title}</h2>
            <button type="button" onClick={close} className="focus-ring rounded-lg p-1.5 text-app-muted hover:bg-app-surface-muted hover:text-app-fg" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn(!title && "pt-4", "px-4 md:px-6 pb-6")}>{children}</div>
      </div>
    </div>
  );
}


