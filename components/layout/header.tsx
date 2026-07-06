"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Bell, BrainCircuit, Laptop, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem("rentops-theme");
  if (saved === "light" || saved === "dark") return saved;
  return "system";
}

function applyTheme(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "light dark";
    localStorage.removeItem("rentops-theme");
    return;
  }

  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = preference;
  localStorage.setItem("rentops-theme", preference);
}

export function Header({
  displayName,
  primaryRole,
  onMenuClick,
}: {
  displayName?: string;
  primaryRole?: string;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [notifCount, setNotifCount] = useState(0);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getInitialThemePreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [supabase, router]);

  // Fetch unread notification count, refresh on tab visibility
  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("supabase_user_id", user.id)
        .maybeSingle();
      if (!profile || !mounted) return;
      const { count } = await supabase
        .from("notification")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("is_read", false);
      if (mounted) setNotifCount(count ?? 0);
    }
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [supabase]);

  useEffect(() => {
    applyTheme(themePreference);
  }, [themePreference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreference((current) => {
      if (current === "system") return "dark";
      if (current === "dark") return "light";
      return "system";
    });
  }, []);

  const themeLabel =
    themePreference === "system"
      ? `跟随系统（当前${resolvedTheme === "dark" ? "深色" : "浅色"}）`
      : themePreference === "dark"
        ? "深色模式"
        : "浅色模式";
  const profileHref = primaryRole === "CUSTOMER" ? "/customer/profile" : "/profile";

  return (
    <header
      className="app-chrome relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-app-border px-4 md:h-[4.5rem] md:px-7"
      style={{ viewTransitionName: "site-header" }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="focus-ring premium-control rounded-lg border border-app-border p-2 text-app-muted shadow-sm hover:text-app-fg md:hidden"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BrandLogo size={36} priority />
        <div className="hidden min-w-0 md:block">
          <p className="text-sm font-semibold text-app-fg">RentOps</p>
          <p className="text-xs text-app-muted">设备租赁智能运营平台</p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 md:gap-2">
        <Link
          href="/ai"
          className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-app-border bg-app-accent-soft px-2.5 text-sm font-semibold text-app-accent shadow-sm transition-[background-color,border-color,color,box-shadow,transform] hover:-translate-y-0.5 hover:border-app-border-strong hover:bg-app-surface hover:text-app-fg"
          aria-label="AI 助手"
        >
          <BrainCircuit className="h-4 w-4" />
          <span className="hidden md:inline">AI</span>
        </Link>

        {/* Notifications */}
        <Link href="/notifications" className="focus-ring relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-app-muted-strong transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-app-border hover:bg-app-surface hover:text-app-fg" aria-label="通知">
          <Bell className="h-4 w-4" />
          {notifCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-app-danger px-1 text-[10px] font-bold text-white">
              {notifCount > 99 ? "99+" : notifCount}
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-app-muted-strong transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-app-border hover:bg-app-surface hover:text-app-fg"
          aria-label={`主题：${themeLabel}`}
          title={`主题：${themeLabel}`}
        >
          {themePreference === "system" ? (
            <Laptop className="h-4 w-4" />
          ) : resolvedTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* User / Profile */}
        <Link
          href={profileHref}
          className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-app-muted-strong transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-app-border hover:bg-app-surface hover:text-app-fg lg:hidden"
          aria-label="个人资料"
          title="个人资料"
        >
          <User className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={profileHref}
          className="focus-ring premium-control ml-1 hidden h-9 items-center gap-2 rounded-lg border border-app-border px-2.5 text-sm text-app-muted-strong transition-[background-color,border-color,color,box-shadow,transform] hover:-translate-y-0.5 hover:text-app-fg lg:flex"
        >
          <User className="h-4 w-4" aria-hidden="true" />
          <span>{displayName ?? "用户"}</span>
        </Link>

        {/* Sign out */}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          aria-label="退出登录"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline ml-1">退出</span>
        </Button>
      </div>

    </header>
  );
}


