-- Fix customer-side contract signing.
-- Customers can view and complete sign tasks for contracts bound to their customer
-- profile. Sales staff can create/manage sign tasks.

GRANT SELECT, INSERT, UPDATE ON public.contract_sign_task TO authenticated;
GRANT UPDATE ON public.rental_contract TO authenticated;

DROP POLICY IF EXISTS "Equipment operations sign task staff or contract customer" ON public.contract_sign_task;
DROP POLICY IF EXISTS "Contract sign task select staff or customer" ON public.contract_sign_task;
DROP POLICY IF EXISTS "Contract sign task insert staff" ON public.contract_sign_task;
DROP POLICY IF EXISTS "Contract sign task update staff or customer" ON public.contract_sign_task;

CREATE POLICY "Contract sign task select staff or customer" ON public.contract_sign_task
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    )
    OR EXISTS (
      SELECT 1
      FROM public.rental_contract rc
      JOIN public.customer c ON c.id = rc.customer_id
      JOIN public.profiles p ON p.id = c.owner_user_id
      WHERE rc.id = contract_sign_task.contract_id
        AND p.supabase_user_id = (SELECT auth.uid())
        AND rc.deleted_at IS NULL
        AND c.deleted_at IS NULL
    )
  );

CREATE POLICY "Contract sign task insert staff" ON public.contract_sign_task
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    )
  );

CREATE POLICY "Contract sign task update staff or customer" ON public.contract_sign_task
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    )
    OR EXISTS (
      SELECT 1
      FROM public.rental_contract rc
      JOIN public.customer c ON c.id = rc.customer_id
      JOIN public.profiles p ON p.id = c.owner_user_id
      WHERE rc.id = contract_sign_task.contract_id
        AND p.supabase_user_id = (SELECT auth.uid())
        AND rc.contract_status = 'PENDING_SIGN'
        AND rc.deleted_at IS NULL
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    status IN ('PENDING', 'SIGNED', 'FAILED')
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.supabase_user_id = (SELECT auth.uid())
          AND p.primary_role IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
      )
      OR EXISTS (
        SELECT 1
        FROM public.rental_contract rc
        JOIN public.customer c ON c.id = rc.customer_id
        JOIN public.profiles p ON p.id = c.owner_user_id
        WHERE rc.id = contract_sign_task.contract_id
          AND p.supabase_user_id = (SELECT auth.uid())
          AND rc.contract_status = 'PENDING_SIGN'
          AND rc.deleted_at IS NULL
          AND c.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Customer can sign own pending contracts" ON public.rental_contract;
CREATE POLICY "Customer can sign own pending contracts" ON public.rental_contract
  FOR UPDATE TO authenticated
  USING (
    contract_status = 'PENDING_SIGN'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer c
      JOIN public.profiles p ON p.id = c.owner_user_id
      WHERE c.id = rental_contract.customer_id
        AND p.supabase_user_id = (SELECT auth.uid())
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    contract_status = 'SIGNED'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer c
      JOIN public.profiles p ON p.id = c.owner_user_id
      WHERE c.id = rental_contract.customer_id
        AND p.supabase_user_id = (SELECT auth.uid())
        AND c.deleted_at IS NULL
    )
  );
