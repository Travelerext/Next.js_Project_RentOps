-- ============================================
-- 0040_invoice_insert_sales_rls
-- Two fixes for salesperson invoice access:
--
-- 1) TABLE-LEVEL GRANT (root cause): migration 0039 created
--    public.invoice_record WITHOUT granting table privileges to the
--    `authenticated` role. RLS only governs which ROWS are visible once
--    a table is reachable — it does not grant access to the table itself.
--    Every other API-facing table in this project grants explicitly
--    (see 0022 return_request, 0027 return_inspection, 0036 refund_record).
--    invoice_record was missing it, so authenticated users could not
--    SELECT or INSERT invoices regardless of RLS policies.
--
-- 2) RLS INSERT policy: align with the generateOrderInvoice server action
--    (which permits SALES / SALES_MANAGER). Previously only FINANCE roles
--    could INSERT, so salesperson-initiated invoice generation was blocked.
-- ============================================

-- (1) Grant table access to authenticated (RLS still restricts rows)
GRANT SELECT, INSERT, UPDATE ON public.invoice_record TO authenticated;

-- (2) Widen INSERT policy to include sales roles
DROP POLICY IF EXISTS "Finance can create invoices" ON public.invoice_record;
CREATE POLICY "Finance can create invoices" ON public.invoice_record
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN (
          'SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER', 'SALES', 'SALES_MANAGER'
        )
    )
  );
