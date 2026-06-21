"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bell, LogOut, Menu, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function Header({
  displayName,
  onMenuClick,
}: {
  displayName?: string;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [notifCount, setNotifCount] = useState(0);

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

  return (
    <header
      className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white/80 backdrop-blur-sm px-4 md:px-6 dark:border-zinc-800 dark:bg-zinc-900/80"
      style={{ viewTransitionName: "site-header" }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hidden sm:block">
          机械设备租赁管理系统
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 md:gap-2">
        {/* Notifications */}
        <Link href="/notifications" className="relative inline-flex items-center justify-center rounded-lg h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="通知">
          <Bell className="h-4 w-4" />
          {notifCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {notifCount > 99 ? "99+" : notifCount}
            </span>
          )}
        </Link>

        {/* User / Profile */}
        <Link
          href="/profile"
          className="hidden sm:flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300 ml-1 rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
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
