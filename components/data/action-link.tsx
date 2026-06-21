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
      className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      {children}
    </button>
  );
}
