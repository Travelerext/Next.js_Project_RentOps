-- ============================================
-- Fix: new signups should NOT get auto-assigned role
-- ============================================

-- 1. Remove default role — new signups must be assigned by admin
ALTER TABLE public.profiles ALTER COLUMN primary_role DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN primary_role DROP DEFAULT;

-- 2. New signups default to disabled — admin must enable
ALTER TABLE public.profiles ALTER COLUMN login_enabled SET DEFAULT false;

-- 3. New signups default to PENDING — admin must approve
ALTER TABLE public.profiles ALTER COLUMN account_status SET DEFAULT 'PENDING';

-- 4. Replace trigger — explicitly set login_enabled=false, account_status='PENDING'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (supabase_user_id, username, display_name, email, login_enabled, account_status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, false, 'PENDING');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
