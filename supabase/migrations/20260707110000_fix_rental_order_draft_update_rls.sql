-- Allow staff actions to soft-delete their own draft orders under RLS.
-- UPDATE policies need both USING (old row) and WITH CHECK (new row);
-- otherwise changing order_status/deleted_at can fail with "new row violates RLS".

GRANT UPDATE ON public.rental_order TO authenticated;

DROP POLICY IF EXISTS "Users can update own orders" ON public.rental_order;
CREATE POLICY "Users can update own orders" ON public.rental_order
  FOR UPDATE TO authenticated
  USING (
    created_by = public.rentops_current_profile_id()
    OR sales_user_id = public.rentops_current_profile_id()
    OR public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
    OR (
      public.rentops_current_role() = 'SALES'
      AND order_status = 'DRAFT'
    )
  )
  WITH CHECK (
    created_by = public.rentops_current_profile_id()
    OR sales_user_id = public.rentops_current_profile_id()
    OR public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
    OR (
      public.rentops_current_role() = 'SALES'
      AND order_status IN ('DRAFT', 'CANCELLED')
    )
  );
