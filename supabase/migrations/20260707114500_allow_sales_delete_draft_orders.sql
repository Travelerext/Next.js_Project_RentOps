-- Draft orders are not committed business records yet, so deleting them should
-- be a DELETE guarded by role and DRAFT status instead of a soft-delete UPDATE.
-- This avoids UPDATE WITH CHECK failures when the new row is hidden by RLS.

GRANT DELETE ON public.rental_order TO authenticated;

DROP POLICY IF EXISTS "Sales can delete draft orders" ON public.rental_order;
CREATE POLICY "Sales can delete draft orders" ON public.rental_order
  FOR DELETE TO authenticated
  USING (
    order_status = 'DRAFT'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SALES', 'SALES_MANAGER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER')
    )
  );
