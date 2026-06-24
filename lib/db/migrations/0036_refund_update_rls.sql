-- Full RLS + GRANT for refund_record and deposit_record
ALTER TABLE public.refund_record DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view refund records" ON public.refund_record;
DROP POLICY IF EXISTS "Authenticated can insert refund records" ON public.refund_record;
DROP POLICY IF EXISTS "Authenticated can update refund records" ON public.refund_record;

CREATE POLICY "refund_select" ON public.refund_record FOR SELECT TO authenticated USING (true);
CREATE POLICY "refund_insert" ON public.refund_record FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "refund_update" ON public.refund_record FOR UPDATE TO authenticated USING (true);

ALTER TABLE public.deposit_record DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view deposit records" ON public.deposit_record;
DROP POLICY IF EXISTS "Authenticated can update deposit records" ON public.deposit_record;

CREATE POLICY "deposit_select" ON public.deposit_record FOR SELECT TO authenticated USING (true);
CREATE POLICY "deposit_update" ON public.deposit_record FOR UPDATE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON public.refund_record TO authenticated;
GRANT SELECT, UPDATE ON public.deposit_record TO authenticated;
