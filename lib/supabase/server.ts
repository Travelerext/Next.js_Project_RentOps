import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Supabase client for Next.js Server Components and Server Actions.
 * Uses cookie-based auth — reads/writes cookies via next/headers.
 *
 * Wrapped in React.cache() to deduplicate within a single render pass.
 * Multiple components calling createClient() in the same request share one instance.
 *
 * Official docs: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies — that's expected.
            // Cookies are set by Server Actions or Route Handlers.
          }
        },
      },
    }
  );
});

/**
 * Supabase client for use inside proxy.ts (Next.js Proxy / Middleware).
 * Accepts the cookie getter/setter callbacks from the request context.
 */
export function createProxyClient(
  getCookies: () => { name: string; value: string }[],
  setCookies: (cookies: { name: string; value: string; options: CookieOptions }[]) => void
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return getCookies();
        },
        setAll(cookiesToSet) {
          setCookies(cookiesToSet);
        },
      },
    }
  );
}
