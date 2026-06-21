"use client";

import React, { createContext, useContext, useMemo, type ReactNode } from "react";

// ─── Context ──────────────────────────────────────────────────────────

interface PermissionContextValue {
  permissions: Set<string>;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: new Set(),
});

/**
 * Provide the current user's permission codes.
 * Wrap inside your auth layout so Can / usePermission works everywhere.
 */
export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: string[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ permissions: new Set(permissions) }),
    [permissions]
  );
  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function usePermission() {
  const ctx = useContext(PermissionContext);
  return {
    /** Check a single permission code */
    can: (code: string) => ctx.permissions.has(code),
    /** Check ANY of the given codes */
    canAny: (...codes: string[]) => codes.some((c) => ctx.permissions.has(c)),
    /** Check ALL of the given codes */
    canAll: (...codes: string[]) => codes.every((c) => ctx.permissions.has(c)),
    /** All granted codes */
    all: ctx.permissions,
  };
}

// ─── Can component ────────────────────────────────────────────────────

interface CanProps {
  /** Permission code required to render children */
  permission: string;
  /** Shown when the user lacks the permission (default: null) */
  fallback?: ReactNode;
  /** When true, render children even if permission is missing */
  allow?: boolean;
  children: ReactNode;
}

/**
 * Conditionally render children based on a permission code.
 *
 * Usage:
 *   <Can permission="ORDER_SUBMIT">
 *     <Button>提交订单</Button>
 *   </Can>
 *   <Can permission="PRICE_ADJUST" fallback={<DisabledHint />}>
 *     <Button>修改价格</Button>
 *   </Can>
 */
export function Can({ permission, fallback = null, allow = false, children }: CanProps) {
  const { can } = usePermission();
  if (allow || can(permission)) return <>{children}</>;
  return <>{fallback}</>;
}
