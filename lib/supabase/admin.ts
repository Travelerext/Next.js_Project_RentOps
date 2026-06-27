   import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with service_role privileges.
 * Bypasses RLS — only use in server-side admin operations.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
