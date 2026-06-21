-- ============================================
-- Migration 0009: Expand rental_contract RLS to include customers
-- ============================================
-- Previously, the rental_contract SELECT policy only allowed:
--   1. The contract creator (created_by)
--   2. The assigned sales person (sales_user_id)
--   3. Manager roles (SYSTEM_ADMIN, SALES_MANAGER, FINANCE_MANAGER, GENERAL_MANAGER)
--
-- Customers could NOT view their own contracts. This migration adds
-- customer_id to the SELECT policy so that the customer linked to the
-- contract (via customer.owner_user_id → profiles.id → supabase_user_id)
-- can view their contracts.
-- ============================================

-- --------------------------------------------------
-- rental_contract SELECT — add customer_id check
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
CREATE POLICY "Users can view own contracts" ON public.rental_contract
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR customer_id IN (
      SELECT c.id FROM public.customer c
      WHERE c.owner_user_id IN (
        SELECT p.id FROM public.profiles p WHERE p.supabase_user_id = auth.uid()
      )
    )
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- --------------------------------------------------
-- rental_contract_item SELECT — add customer_id check via parent contract
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view contract items" ON public.rental_contract_item;
CREATE POLICY "Users can view contract items" ON public.rental_contract_item
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract rc
      WHERE rc.created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR rc.sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR rc.customer_id IN (
        SELECT c.id FROM public.customer c
        WHERE c.owner_user_id IN (
          SELECT p.id FROM public.profiles p WHERE p.supabase_user_id = auth.uid()
        )
      )
    )
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- --------------------------------------------------
-- contract_change_record SELECT — add customer_id check via parent contract
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view contract changes" ON public.contract_change_record;
CREATE POLICY "Users can view contract changes" ON public.contract_change_record
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract rc
      WHERE rc.created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR rc.sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR rc.customer_id IN (
        SELECT c.id FROM public.customer c
        WHERE c.owner_user_id IN (
          SELECT p.id FROM public.profiles p WHERE p.supabase_user_id = auth.uid()
        )
      )
    )
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );
