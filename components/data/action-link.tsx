"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * A navigation button that renders as a `<button>` (not `<a>`),
 * so it can safely sit inside a parent `<a>` or `<Link>` without
 * producing invalid nested-anchor HTML.
 *
 * Clicking it navigates to `href` and **stops event propagation**
 * so the parent link is not followed.
 */
export function ActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="focus-ring inline-flex items-center rounded-md border border-app-border-strong bg-app-surface px-3 py-1 text-sm font-medium text-app-muted-strong shadow-sm transition-colors hover:bg-app-surface-muted hover:text-app-fg"
    >
      {children}
    </button>
  );
}


