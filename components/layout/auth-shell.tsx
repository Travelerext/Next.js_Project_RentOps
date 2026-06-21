"use client";

import { useState, useCallback, useEffect, createContext, useContext } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

// ─── Sidebar context ───────────────────────────────────────────────────
interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

// ─── Props ─────────────────────────────────────────────────────────────
interface Props {
  children: React.ReactNode;
  displayName: string;
  dashboard: string;
  primaryRole?: string;
}

// ─── Persistent collapsed state key ────────────────────────────────────
const COLLAPSED_KEY = "sidebar-collapsed";

export function AuthShell({ children, displayName, dashboard, primaryRole }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(COLLAPSED_KEY) === "true";
    }
    return false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const toggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileOpen((p) => !p);
    } else {
      setCollapsed((p) => !p);
    }
  }, []);

  const handleMobileClose = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <Sidebar
          dashboard={dashboard}
          primaryRole={primaryRole}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggle={toggle}
          onMobileClose={handleMobileClose}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header displayName={displayName} onMenuClick={toggle} />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
