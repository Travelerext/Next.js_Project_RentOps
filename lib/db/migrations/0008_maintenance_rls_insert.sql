-- ============================================
-- Migration 0008: RLS policies + SECURITY DEFINER functions for maintenance
-- ============================================
-- Only MAINTENANCE_SUPERVISOR + SYSTEM_ADMIN can INSERT/UPDATE/DELETE spare_part.
-- Regular MAINTENANCE staff can only:
--   1. SELECT spare parts (already granted in 0005)
--   2. Consume parts via process_maintenance_parts_usage() (SECURITY DEFINER, already in 0005)
--   3. Stock-in via process_spare_part_stock_in() (SECURITY DEFINER, added below)

-- --------------------------------------------------
-- maintenance_plan
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert maintenance plans" ON public.maintenance_plan;
CREATE POLICY "Authenticated can insert maintenance plans" ON public.maintenance_plan
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Maintenance can update plans" ON public.maintenance_plan;
CREATE POLICY "Maintenance can update plans" ON public.maintenance_plan
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
  );

-- --------------------------------------------------
-- maintenance_record
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert maintenance records" ON public.maintenance_record;
CREATE POLICY "Authenticated can insert maintenance records" ON public.maintenance_record
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Maintenance can update records" ON public.maintenance_record;
CREATE POLICY "Maintenance can update records" ON public.maintenance_record
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
  );

-- --------------------------------------------------
-- spare_part — only supervisor + admin can manage
-- --------------------------------------------------
DROP POLICY IF EXISTS "Supervisor can insert spare parts" ON public.spare_part;
CREATE POLICY "Supervisor can insert spare parts" ON public.spare_part
  FOR INSERT WITH CHECK (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE_SUPERVISOR')
  );

DROP POLICY IF EXISTS "Supervisor can update spare parts" ON public.spare_part;
CREATE POLICY "Supervisor can update spare parts" ON public.spare_part
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE_SUPERVISOR')
  );

DROP POLICY IF EXISTS "Supervisor can delete spare parts" ON public.spare_part;
CREATE POLICY "Supervisor can delete spare parts" ON public.spare_part
  FOR DELETE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE_SUPERVISOR')
  );

-- --------------------------------------------------
-- spare_part_stock_movement
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert stock movements" ON public.spare_part_stock_movement;
CREATE POLICY "Authenticated can insert stock movements" ON public.spare_part_stock_movement
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- SECURITY DEFINER: Stock-in spare part
-- Allows regular MAINTENANCE staff to add stock without direct UPDATE permission
-- ============================================
CREATE OR REPLACE FUNCTION public.process_spare_part_stock_in(
  p_part_id UUID,
  p_quantity DECIMAL(10,2),
  p_unit_price DECIMAL(15,2),
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_part RECORD;
  v_price DECIMAL(15,2);
  v_amount DECIMAL(15,2);
BEGIN
  -- Authorization: must be authenticated
  IF (SELECT auth.uid() IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', '未登录');
  END IF;

  -- Lock spare part row
  SELECT * INTO v_part
  FROM public.spare_part
  WHERE id = p_part_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '配件不存在');
  END IF;

  v_price := COALESCE(p_unit_price, v_part.unit_price, 0);
  v_amount := p_quantity * v_price;

  -- 1. Increase stock
  UPDATE public.spare_part
  SET current_stock = current_stock + p_quantity,
      unit_price = CASE WHEN p_unit_price IS NOT NULL THEN p_unit_price ELSE unit_price END,
      status = 'ACTIVE',
      updated_at = now()
  WHERE id = p_part_id;

  -- 2. Record stock movement
  INSERT INTO public.spare_part_stock_movement (
    part_id, movement_type, quantity, unit_price, amount, operator_id
  ) VALUES (
    p_part_id, 'INBOUND_PURCHASE', p_quantity, v_price, v_amount, p_user_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- rental_order_item — INSERT was missing, blocking addOrderItem
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert order items" ON public.rental_order_item;
CREATE POLICY "Authenticated can insert order items" ON public.rental_order_item
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- --------------------------------------------------
-- approval_request / approval_step_record
-- Originally only applicant + SYSTEM_ADMIN could see. Managers need access too.
-- INSERT / UPDATE were missing entirely.
-- --------------------------------------------------

-- approval_request — allow authenticated to insert
DROP POLICY IF EXISTS "Authenticated can insert approvals" ON public.approval_request;
CREATE POLICY "Authenticated can insert approvals" ON public.approval_request
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- approval_request — expand SELECT to include manager roles
DROP POLICY IF EXISTS "Users can view own approvals" ON public.approval_request;
CREATE POLICY "Users can view own approvals" ON public.approval_request
  FOR SELECT USING (
    applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- approval_request — allow managers to UPDATE
DROP POLICY IF EXISTS "Managers can update approvals" ON public.approval_request;
CREATE POLICY "Managers can update approvals" ON public.approval_request
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- approval_step_record — allow authenticated to insert
DROP POLICY IF EXISTS "Authenticated can insert approval steps" ON public.approval_step_record;
CREATE POLICY "Authenticated can insert approval steps" ON public.approval_step_record
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- approval_step_record — expand SELECT to include manager roles
DROP POLICY IF EXISTS "Users can view approval steps" ON public.approval_step_record;
CREATE POLICY "Users can view approval steps" ON public.approval_step_record
  FOR SELECT USING (
    approval_id IN (
      SELECT id FROM public.approval_request
      WHERE applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- --------------------------------------------------
-- audit_log — only SYSTEM_ADMIN could view, INSERT was missing
-- --------------------------------------------------
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.audit_log;
CREATE POLICY "Admin can view audit logs" ON public.audit_log
  FOR SELECT USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- --------------------------------------------------
-- rental_order UPDATE — expand to include manager roles
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can update own orders" ON public.rental_order;
CREATE POLICY "Users can update own orders" ON public.rental_order
  FOR UPDATE USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
  );

-- --------------------------------------------------
-- rental_contract UPDATE — expand to include manager roles
-- --------------------------------------------------
DROP POLICY IF EXISTS "Admin can update contracts" ON public.rental_contract;
CREATE POLICY "Admin can update contracts" ON public.rental_contract
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
  );

-- ============================================
-- Expand SELECT policies to include all manager roles
-- Many tables only allowed SYSTEM_ADMIN or the record owner to SELECT.
-- Sales/finance/general managers need read access to do their jobs.
-- ============================================

-- rental_order SELECT
DROP POLICY IF EXISTS "Users can view own orders" ON public.rental_order;
CREATE POLICY "Users can view own orders" ON public.rental_order
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- rental_contract SELECT
DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
CREATE POLICY "Users can view own contracts" ON public.rental_contract
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
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
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
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
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- contract_change_record SELECT
DROP POLICY IF EXISTS "Users can view contract changes" ON public.contract_change_record;
CREATE POLICY "Users can view contract changes" ON public.contract_change_record
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- profiles SELECT — expand to allow manager roles to view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
  );

-- rental_contract_item — INSERT was missing
DROP POLICY IF EXISTS "Authenticated can insert contract items" ON public.rental_contract_item;
CREATE POLICY "Authenticated can insert contract items" ON public.rental_contract_item
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- receivable SELECT (was all authenticated, this is fine but let's verify)
-- No change needed — "Authenticated can view receivables" already allows all roles.
