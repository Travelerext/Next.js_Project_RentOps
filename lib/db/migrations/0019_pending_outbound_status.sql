-- ============================================
-- Migration 0019: Add PENDING_OUTBOUND equipment status
-- ============================================
-- Contract activation now sets equipment to PENDING_OUTBOUND
-- instead of RENTED. Only after physical scan-outbound does
-- the status change to RENTED.
-- ============================================

-- Update activate_contract: set equipment to PENDING_OUTBOUND, not RENTED
CREATE OR REPLACE FUNCTION public.activate_contract(
  p_contract_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_contract RECORD;
  v_order RECORD;
  v_item RECORD;
  v_prev_status VARCHAR(50);
  v_receivable_no TEXT;
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE supabase_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  SELECT * INTO v_contract
  FROM public.rental_contract
  WHERE id = p_contract_id AND contract_status = 'SIGNED'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '合同状态不允许激活');
  END IF;

  SELECT * INTO v_order
  FROM public.rental_order
  WHERE id = v_contract.order_id
  FOR UPDATE;

  -- 1. Update contract status
  UPDATE public.rental_contract
  SET contract_status = 'ACTIVE', effective_at = now(),
      updated_at = now(), version = version + 1
  WHERE id = p_contract_id;

  -- 2. Update order status
  UPDATE public.rental_order
  SET order_status = 'IN_PROGRESS', actual_start_at = now(),
      updated_at = now(), version = version + 1
  WHERE id = v_contract.order_id;

  -- 3. Set contract-item equipment to PENDING_OUTBOUND (not RENTED)
  FOR v_item IN
    SELECT rci.equipment_id, e.status AS current_status
    FROM public.rental_contract_item rci
    JOIN public.equipment e ON e.id = rci.equipment_id
    WHERE rci.contract_id = p_contract_id
  LOOP
    v_prev_status := v_item.current_status;

    UPDATE public.equipment
    SET status = 'PENDING_OUTBOUND',
        current_order_id = v_contract.order_id,
        current_contract_id = p_contract_id,
        current_customer_id = v_contract.customer_id,
        updated_at = now(), version = version + 1
    WHERE id = v_item.equipment_id;

    INSERT INTO public.equipment_status_log (
      equipment_id, from_status, to_status, change_reason,
      business_type, business_id, changed_by
    ) VALUES (
      v_item.equipment_id, v_prev_status, 'PENDING_OUTBOUND', '合同激活-待出库',
      'CONTRACT_ACTIVATE', p_contract_id, v_profile_id
    );
  END LOOP;

  -- 4. Generate deposit receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;
  INSERT INTO public.receivable (
    receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by
  ) VALUES (
    v_receivable_no, v_contract.customer_id, v_contract.order_id,
    p_contract_id, 'DEPOSIT', COALESCE(v_contract.deposit_amount, 0),
    COALESCE(v_contract.deposit_amount, 0), CURRENT_DATE, 'UNPAID', v_profile_id
  );

  -- 5. Generate first rent receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000+1000)::text;
  INSERT INTO public.receivable (
    receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by
  ) VALUES (
    v_receivable_no, v_contract.customer_id, v_contract.order_id,
    p_contract_id, 'RENT', COALESCE(v_contract.total_rent_amount, 0),
    COALESCE(v_contract.total_rent_amount, 0), CURRENT_DATE + INTERVAL '30 days', 'UNPAID', v_profile_id
  );

  -- 6. Create deposit record
  INSERT INTO public.deposit_record (
    deposit_no, customer_id, order_id, contract_id,
    amount, paid_amount, available_amount, deposit_status, created_by
  ) VALUES (
    'DEP' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
    v_contract.customer_id, v_contract.order_id, p_contract_id,
    COALESCE(v_contract.deposit_amount, 0), 0, COALESCE(v_contract.deposit_amount, 0),
    'PENDING_PAYMENT', v_profile_id
  );

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'CONTRACT_ACTIVATE', 'CONTRACT', p_contract_id,
    jsonb_build_object('order_id', v_contract.order_id));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.activate_contract(UUID, UUID) TO authenticated;

-- Update process_outbound: accept PENDING_OUTBOUND status
CREATE OR REPLACE FUNCTION public.process_outbound(
  p_equipment_id UUID, p_warehouse_id UUID, p_order_id UUID,
  p_contract_id UUID, p_outbound_no TEXT, p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_equipment RECORD;
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE supabase_user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE supabase_user_id = auth.uid() AND primary_role = 'SYSTEM_ADMIN') THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  SELECT * INTO v_equipment FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '设备不存在');
  END IF;

  -- Allow IN_STOCK (direct outbound) or PENDING_OUTBOUND (post-contract outbound)
  IF v_equipment.status NOT IN ('IN_STOCK', 'PENDING_OUTBOUND') THEN
    RETURN jsonb_build_object('success', false, 'error', '设备状态不允许出库，当前状态：' || v_equipment.status);
  END IF;

  INSERT INTO public.outbound_record (
    outbound_no, business_type, order_id, contract_id,
    equipment_id, warehouse_id, operator_id, operated_at, created_by
  ) VALUES (
    p_outbound_no, 'RENTAL_OUTBOUND', p_order_id, p_contract_id,
    p_equipment_id, p_warehouse_id, v_profile_id, now(), v_profile_id
  );

  UPDATE public.equipment
  SET status = 'RENTED', current_location_type = 'PROJECT_SITE',
      current_order_id = p_order_id, current_contract_id = p_contract_id,
      updated_by = v_profile_id, updated_at = now(), version = version + 1
  WHERE id = p_equipment_id;

  INSERT INTO public.equipment_status_log (
    equipment_id, from_status, to_status, change_reason,
    business_type, business_id, changed_by
  ) VALUES (
    p_equipment_id, v_equipment.status, 'RENTED', '租赁出库',
    'RENTAL_OUTBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  INSERT INTO public.equipment_location_log (
    equipment_id, from_location_type, from_location_id,
    to_location_type, to_location_id,
    business_type, business_id, operator_id
  ) VALUES (
    p_equipment_id, 'WAREHOUSE', p_warehouse_id,
    'PROJECT_SITE', NULL,
    'RENTAL_OUTBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  UPDATE public.rental_order_item
  SET item_status = 'OUTBOUND', updated_at = now()
  WHERE order_id = p_order_id AND equipment_id = p_equipment_id;

  INSERT INTO public.notification (
    recipient_id, notification_type, title, content, business_type, business_id
  ) VALUES (
    v_profile_id, 'EQUIPMENT_OUTBOUND', '设备已出库',
    '设备 ' || v_equipment.equipment_no || ' 已完成出库操作',
    'OUTBOUND', p_order_id
  );

  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'OUTBOUND', 'EQUIPMENT', p_equipment_id,
    jsonb_build_object('outbound_no', p_outbound_no, 'order_id', p_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_outbound(UUID, UUID, UUID, UUID, TEXT, UUID) TO authenticated;

-- Fix existing equipment: if RENTED but has no outbound_record, set to PENDING_OUTBOUND
UPDATE public.equipment e
SET status = 'PENDING_OUTBOUND', updated_at = now()
WHERE e.status = 'RENTED'
  AND NOT EXISTS (
    SELECT 1 FROM public.outbound_record o WHERE o.equipment_id = e.id
  );
