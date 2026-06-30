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
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      <div className="flex h-dvh overflow-hidden bg-app-bg text-app-fg">
        <Sidebar
          dashboard={dashboard}
          primaryRole={primaryRole}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggle={toggle}
          onMobileClose={handleMobileClose}
        />
        <div className="app-page-shell flex flex-1 flex-col overflow-hidden">
          <Header displayName={displayName} onMenuClick={toggle} />
          <main className="app-page-content flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:py-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}


