-- Grant EQUIPMENT_MANAGER and EQUIPMENT_SUPERVISOR read access to orders and contracts

-- rental_order SELECT
DROP POLICY IF EXISTS "Users can view own orders" ON public.rental_order;
CREATE POLICY "Users can view own orders" ON public.rental_order
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE',
      'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR'
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
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE',
      'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR'
    )
  );

-- rental_contract SELECT
DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
CREATE POLICY "Users can view own contracts" ON public.rental_contract
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN (
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE',
      'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR'
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
      'SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER', 'FINANCE',
      'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR'
    )
  );
