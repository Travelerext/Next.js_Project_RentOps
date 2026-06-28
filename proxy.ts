import { createProxyClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { DASHBOARD_ROUTES, ROLE_DASHBOARD_MAP } from "@/lib/constants";

// ─── Protected route prefixes ─────────────────────────────────────────
const protectedPrefixes = [
  "/admin",
  "/sales",
  "/equipment",
  "/finance",
  "/maintenance",
  "/approval",
  "/customer",
  "/profile",
  "/notifications",
];

function isProtected(path: string) {
  return protectedPrefixes.some(
    (p) => path === p || path.startsWith(p + "/")
  );
}

// ─── Role → allowed route prefix ──────────────────────────────────────
const ROLE_ROUTE_MAP: Record<string, string[]> = {
  SYSTEM_ADMIN: ["/admin", "/sales", "/equipment", "/finance", "/maintenance", "/approval", "/customer"],
  SALES: ["/sales"],
  EQUIPMENT_MANAGER: ["/equipment"],
  FINANCE: ["/finance", "/sales"],
  MAINTENANCE: ["/maintenance"],
  APPROVER: ["/approval"],
  CUSTOMER: ["/customer"],
  SALES_MANAGER: ["/approval", "/sales"],
  FINANCE_MANAGER: ["/approval", "/finance"],
  EQUIPMENT_SUPERVISOR: ["/equipment"],
  GENERAL_MANAGER: ["/approval", "/sales", "/finance", "/admin"],
  MAINTENANCE_SUPERVISOR: ["/maintenance"],
};

// Shared routes accessible by all roles
const SHARED_PREFIXES = ["/equipment/catalog", "/profile", "/notifications", "/sales/orders/", "/sales/contracts/", "/finance/invoices/"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip non-page requests
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon.ico") ||
    path.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  const isLoginPage = path === "/login";
  const isRootPage = path === "/";

  // Only act on login page and protected routes
  if (!isProtected(path) && !isLoginPage && !isRootPage) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  // Wrap ALL Supabase interaction in try/catch — missing env vars, down auth
  // service, or network issues should never 500 the whole site.
  let user: { id: string } | null = null;
  let supabase: ReturnType<typeof createProxyClient> | null = null;
  try {
    supabase = createProxyClient(
      () => request.cookies.getAll(),
      (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      }
    );

    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch (err) {
    console.error("proxy: Supabase client init or auth failed", err);
    // Fall through — let the page component handle auth (it has its own checks)
    return supabaseResponse;
  }

  // ── Redirect unauthenticated users to login ──────────────────────────
  if ((isProtected(path) || isRootPage) && !user) {
    const loginUrl = new URL("/login", request.url);
    if (path !== "/") loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated users: redirect from login/root to dashboard ───────
  if ((isLoginPage || isRootPage) && user && supabase) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_dashboard, account_status, login_enabled, primary_role")
        .eq("supabase_user_id", user.id)
        .maybeSingle();

      // Invalid profile → sign out
      if (
        !profile ||
        profile.account_status !== "ACTIVE" ||
        !profile.login_enabled ||
        !profile.primary_role
      ) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("error", "no_profile");
        const res = NextResponse.redirect(loginUrl);
        res.cookies.delete("sb-access-token");
        res.cookies.delete("sb-refresh-token");
        return res;
      }

      // Use default_dashboard first, fall back to primary_role mapping
      const dashboard =
        DASHBOARD_ROUTES[profile.default_dashboard] ??
        ROLE_DASHBOARD_MAP[profile.primary_role] ??
        "/sales";
      return NextResponse.redirect(new URL(dashboard, request.url));
    } catch (err) {
      console.error("proxy: Supabase profiles query failed", err);
      // Fall through — page component will re-check auth
      return supabaseResponse;
    }
  }

  // ── Role-based route protection ──────────────────────────────────────
  if (isProtected(path) && user && supabase) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("primary_role")
        .eq("supabase_user_id", user.id)
        .maybeSingle();

      if (profile) {
        const allowedPrefixes = ROLE_ROUTE_MAP[profile.primary_role] ?? ["/sales"];
        const isAdmin = profile.primary_role === "SYSTEM_ADMIN";

        if (!isAdmin) {
          const allowed = allowedPrefixes.some((p) => path.startsWith(p))
            || SHARED_PREFIXES.some((p) => path.startsWith(p));
          if (!allowed) {
            return NextResponse.redirect(new URL(allowedPrefixes[0], request.url));
          }
        }
      }
    } catch (err) {
      console.error("proxy: Supabase role check failed", err);
      // Fall through — auth layout will enforce role checks
      return supabaseResponse;
    }
  }

  return supabaseResponse;
}

// ── Matcher ────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
