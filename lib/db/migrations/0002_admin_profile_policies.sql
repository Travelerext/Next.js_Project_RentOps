-- ============================================
-- Fix RLS infinite recursion + add UPDATE policies
-- ============================================
-- The original "Admins can view all profiles" policy used a subquery
-- on public.profiles, which triggers RLS recursively. The fix is a
-- SECURITY DEFINER function that reads profiles without RLS.

-- ─── Helper: read current user's role (bypasses RLS) ──────────────

CREATE OR REPLACE FUNCTION public.get_current_user_primary_role()
RETURNS VARCHAR(50)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT primary_role FROM public.profiles
  WHERE supabase_user_id = auth.uid()
  LIMIT 1;
$$;

-- ─── Drop old policies that used recursive subqueries ─────────────

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

-- ─── SELECT: admin sees all profiles ──────────────────────────────

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

-- ─── UPDATE: admin can update any profile ─────────────────────────

CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE USING (
    public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

-- ─── UPDATE: user can update own profile ──────────────────────────

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (supabase_user_id = auth.uid());
