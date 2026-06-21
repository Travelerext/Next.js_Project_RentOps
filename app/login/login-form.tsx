"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, signup, type LoginState, type SignupState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramRedirect = searchParams.get("redirect");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, null);
  const [signupState, signupAction, signupPending] = useActionState(signup, null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // Handle login success — redirect
  useEffect(() => {
    if (loginState?.success) {
      const target = loginState.redirectTo || paramRedirect || loginState.dashboard || "/sales";
      router.push(target);
      router.refresh();
    }
  }, [loginState, router, paramRedirect]);

  // Handle signup success — show message then switch to login
  useEffect(() => {
    if (signupState?.success) {
      setSignupSuccess(true);
      const timer = setTimeout(() => {
        setMode("login");
        setSignupSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [signupState]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4 dark:from-zinc-950 dark:to-zinc-900">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 dark:shadow-blue-900/30 mb-4">
            <Truck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 text-pretty">
            设备租赁管理系统
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "login" ? "登录您的账号以继续" : "创建新账号"}
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/80">
          {mode === "login" ? (
            <form action={loginAction} className="space-y-4">
              <Input
                id="email"
                name="email"
                label="邮箱"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                required
              />
              <Input
                id="password"
                name="password"
                label="密码"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              {paramRedirect && <input type="hidden" name="redirect" value={paramRedirect} />}

              {loginState?.error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 animate-fade-in" role="alert">
                  {loginState.error}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={loginPending}>
                {loginPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    登录中…
                  </>
                ) : (
                  "登录"
                )}
              </Button>

              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  注册
                </button>
              </p>
            </form>
          ) : (
            <form action={signupAction} className="space-y-4">
              <Input
                id="displayName"
                name="displayName"
                label="姓名"
                placeholder="您的真实姓名"
                autoComplete="name"
                required
              />
              <Input
                id="email"
                name="email"
                label="邮箱"
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                required
              />
              <Input
                id="password"
                name="password"
                label="密码"
                type="password"
                placeholder="至少 6 个字符…"
                autoComplete="new-password"
                required
                minLength={6}
              />

              {signupState?.error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 animate-fade-in" role="alert">
                  {signupState.error}
                </div>
              )}
              {signupSuccess && signupState?.message && (
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 animate-fade-in">
                  {signupState.message}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={signupPending}>
                {signupPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    注册中…
                  </>
                ) : (
                  "注册"
                )}
              </Button>

              <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  去登录
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          RentOps v0.1 · 机械设备租赁管理平台
        </p>
      </div>
    </div>
  );
}
