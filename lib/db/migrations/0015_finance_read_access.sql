-- ============================================
-- Migration 0015: Allow FINANCE role to read orders, contracts, customers
-- ============================================
-- FINANCE role users need read-only access to customer, order, and
-- contract data to do their job (verify receivables against source docs).
-- Previously only FINANCE_MANAGER had this access.
-- ============================================

-- rental_order SELECT
DROP POLICY IF EXISTS "Users can view own orders" ON public.rental_order;
CREATE POLICY "Users can view own orders" ON public.rental_order
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE'
    )
  );

-- rental_order_item SELECT
DROP POLICY IF EXISTS "Users can view order items" ON public.rental_order_item;
CREATE POLICY "Users can view order items" ON public.rental_order_item
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.rental_order
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE'
    )
  );

-- rental_contract SELECT
DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
CREATE POLICY "Users can view own contracts" ON public.rental_contract
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE'
    )
  );

-- rental_contract_item SELECT
DROP POLICY IF EXISTS "Users can view contract items" ON public.rental_contract_item;
CREATE POLICY "Users can view contract items" ON public.rental_contract_item
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE'
    )
  );

-- customer SELECT — allow FINANCE to view all customers
DROP POLICY IF EXISTS "Authenticated can view customers" ON public.customer;
CREATE POLICY "Authenticated can view customers" ON public.customer
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );
