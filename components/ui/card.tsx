import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("surface-panel rounded-lg p-4 transition-[box-shadow,border-color,transform] duration-150 md:p-5", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("-mx-1 mb-4 flex flex-col gap-2 border-b border-app-border px-1 pb-3 sm:flex-row sm:items-center sm:justify-between", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold tracking-normal text-app-fg text-pretty", className)}>{children}</h3>;
}


