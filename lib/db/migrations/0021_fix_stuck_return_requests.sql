-- ============================================
-- Migration 0021: Fix existing stuck return requests
-- ============================================
-- Return requests that have an associated inbound record
-- but are still PENDING should be advanced to PENDING_APPROVAL.
-- Also fix RLS: ensure return_request SELECT works properly.
-- ============================================

-- Fix stuck return requests: if inbound exists, advance to PENDING_APPROVAL
UPDATE public.return_request rr
SET request_status = 'PENDING_APPROVAL',
    updated_at = now()
WHERE rr.request_status = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM public.inbound_record ib
    WHERE ib.order_id = rr.order_id
       OR ib.contract_id = rr.contract_id
  );

-- Fix stuck return requests: if equipment already returned AND order completed
UPDATE public.return_request rr
SET request_status = 'PENDING_APPROVAL',
    updated_at = now()
WHERE rr.request_status = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM public.rental_order ro
    WHERE ro.id = rr.order_id
      AND ro.order_status IN ('COMPLETED', 'PARTIAL_RETURN')
  );

-- Ensure RLS is properly set for return_request
DROP POLICY IF EXISTS "Authenticated can view return requests" ON public.return_request;
CREATE POLICY "Authenticated can view return requests" ON public.return_request
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert return requests" ON public.return_request;
CREATE POLICY "Authenticated can insert return requests" ON public.return_request
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Creator can update return requests" ON public.return_request;
CREATE POLICY "Creator can update return requests" ON public.return_request
  FOR UPDATE TO authenticated
  USING (
    requested_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR',
      'SALES_MANAGER', 'GENERAL_MANAGER', 'APPROVER'
    )
  );
