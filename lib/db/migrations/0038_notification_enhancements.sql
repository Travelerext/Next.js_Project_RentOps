-- ============================================
-- 0038_notification_enhancements
-- ============================================
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS type text;
UPDATE public.notification SET type = notification_type WHERE type IS NULL;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'INFO';
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS read_by uuid;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS read_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS source_event text;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS source_module text;
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.notification ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_read_consistency') THEN
    ALTER TABLE public.notification ADD CONSTRAINT notification_read_consistency CHECK (
      (is_read = false AND read_at IS NULL) OR (is_read = true AND read_at IS NOT NULL)
    ) NOT VALID;
  END IF;
END $$;
UPDATE public.notification SET read_at = created_at WHERE is_read = true AND read_at IS NULL;
ALTER TABLE public.notification VALIDATE CONSTRAINT notification_read_consistency;

CREATE INDEX IF NOT EXISTS idx_n_recipient_created ON public.notification(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_n_recipient_unread ON public.notification(recipient_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_n_dedupe ON public.notification(recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification;
CREATE POLICY "Users can view own notifications" ON public.notification
  FOR SELECT TO authenticated
  USING (recipient_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own read state" ON public.notification;
CREATE POLICY "Users can update own read state" ON public.notification
  FOR UPDATE TO authenticated
  USING (recipient_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid()))
  WITH CHECK (recipient_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS public.notification LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_n public.notification; v_p uuid;
BEGIN
  SELECT id INTO v_p FROM public.profiles WHERE supabase_user_id = auth.uid();
  IF v_p IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  UPDATE public.notification SET is_read=true, read_at=COALESCE(read_at,now()), read_by=v_p,
    read_version=read_version+1, updated_at=now()
    WHERE id=p_id AND recipient_id=v_p AND is_read=false RETURNING * INTO v_n;
  IF v_n.id IS NULL THEN SELECT * INTO v_n FROM public.notification WHERE id=p_id AND recipient_id=v_p; END IF;
  RETURN v_n;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_c integer; v_p uuid;
BEGIN
  SELECT id INTO v_p FROM public.profiles WHERE supabase_user_id = auth.uid();
  IF v_p IS NULL THEN RETURN 0; END IF;
  UPDATE public.notification SET is_read=true, read_at=now(), read_by=v_p,
    read_version=read_version+1, updated_at=now()
    WHERE recipient_id=v_p AND is_read=false;
  GET DIAGNOSTICS v_c = ROW_COUNT; RETURN v_c;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_business_notifications_read(p_bt text, p_bid uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_c integer; v_p uuid;
BEGIN
  SELECT id INTO v_p FROM public.profiles WHERE supabase_user_id = auth.uid();
  IF v_p IS NULL THEN RETURN 0; END IF;
  UPDATE public.notification SET is_read=true, read_at=COALESCE(read_at,now()), read_by=v_p,
    read_version=read_version+1, updated_at=now()
    WHERE recipient_id=v_p AND business_type=p_bt AND business_id=p_bid AND is_read=false;
  GET DIAGNOSTICS v_c = ROW_COUNT; RETURN v_c;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_business_notifications_read(TEXT, UUID) TO authenticated;
