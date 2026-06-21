"use client";

import { ViewTransition } from "react";

/** Directional slide for list↔detail navigation. Place as outermost element in page components. */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/** Simple fade for dashboard/tab navigation. */
export function FadeTransition({ children }: { children: React.ReactNode }) {
  return <ViewTransition enter="fade-in" exit="fade-out" default="none">{children}</ViewTransition>;
}
