"use client";

import { useActionState, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login, signup } from "@/lib/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramRedirect = searchParams.get("redirect");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, null);
  const [signupState, signupAction, signupPending] = useActionState(signup, null);

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
      const timer = setTimeout(() => {
        setMode("login");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [signupState]);

  return (
    <div className="app-page-shell premium-page-bg flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div className="app-page-content grid w-full max-w-5xl animate-fade-in gap-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center">
        <section className="hidden min-w-0 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface/72 px-3 py-1.5 text-xs font-semibold text-app-accent shadow-sm backdrop-blur-xl">
            <Sparkles className="h-3.5 w-3.5" />
            RentOps 智能租赁运营套件
          </div>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight tracking-normal text-app-fg text-pretty">
            机械租赁运营，从资产到现金流一屏掌控。
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-app-muted">
            为销售、设备、财务、维修和审批角色提供统一的业务工作台。
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {["订单", "设备", "回款"].map((item) => (
              <div key={item} className="surface-panel rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">{item}</p>
                <p className="mt-2 text-2xl font-semibold text-app-fg">Live</p>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:max-w-none">
          <div className="mb-6 flex items-center justify-center gap-3 text-center lg:justify-start">
            <BrandLogo size={48} priority />
            <div className="text-left">
              <h2 className="text-xl font-semibold text-app-fg text-pretty">
                RentOps
              </h2>
              <p className="mt-0.5 text-sm text-app-muted">
                {mode === "login" ? "欢迎回来" : "创建新账号"}
              </p>
            </div>
          </div>

        {/* Form card */}
        <div className="surface-panel-elevated rounded-lg p-5 md:p-6">
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
                <div className="animate-fade-in rounded-lg bg-app-danger-soft p-3 text-sm text-app-danger" role="alert">
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

              <p className="text-center text-sm text-app-muted">
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="font-medium text-app-accent hover:underline"
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
                <div className="animate-fade-in rounded-lg bg-app-danger-soft p-3 text-sm text-app-danger" role="alert">
                  {signupState.error}
                </div>
              )}
              {signupState?.success && signupState?.message && (
                <div className="animate-fade-in rounded-lg bg-app-success-soft p-3 text-sm text-app-success">
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

              <p className="text-center text-sm text-app-muted">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-medium text-app-accent hover:underline"
                >
                  去登录
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-app-muted">
          RentOps v0.1 · 机械设备租赁管理平台
        </p>
        </div>
      </div>
    </div>
  );
}


