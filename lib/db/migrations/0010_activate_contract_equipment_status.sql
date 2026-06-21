-- ============================================
-- Migration 0010: activate_contract — also update equipment status to RENTED
-- ============================================
-- Previously, activate_contract only updated contract/order status
-- and created receivables, but did NOT mark equipment as RENTED.
-- This meant the contract showed "ACTIVE" but equipment stayed "IN_STOCK",
-- making it look like the contract hadn't taken effect.
-- ============================================

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
BEGIN
  -- Authorization: caller must match p_user_id or be admin/manager
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role IN ('SYSTEM_ADMIN', 'SALES_MANAGER', 'GENERAL_MANAGER')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock contract row
  SELECT * INTO v_contract
  FROM public.rental_contract
  WHERE id = p_contract_id AND contract_status = 'SIGNED'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '合同状态不允许激活');
  END IF;

  -- Lock order row
  SELECT * INTO v_order
  FROM public.rental_order
  WHERE id = v_contract.order_id
  FOR UPDATE;

  -- 1. Update contract status
  UPDATE public.rental_contract
  SET contract_status = 'ACTIVE',
      effective_at = now(),
      updated_at = now(),
      version = version + 1
  WHERE id = p_contract_id;

  -- 2. Update order status
  UPDATE public.rental_order
  SET order_status = 'IN_PROGRESS',
      actual_start_at = now(),
      updated_at = now(),
      version = version + 1
  WHERE id = v_contract.order_id;

  -- 3. Update all contract-item equipment to RENTED
  FOR v_item IN
    SELECT rci.equipment_id, e.status AS current_status
    FROM public.rental_contract_item rci
    JOIN public.equipment e ON e.id = rci.equipment_id
    WHERE rci.contract_id = p_contract_id
  LOOP
    v_prev_status := v_item.current_status;

    UPDATE public.equipment
    SET status = 'RENTED',
        current_order_id = v_contract.order_id,
        current_contract_id = p_contract_id,
        updated_by = p_user_id,
        updated_at = now(),
        version = version + 1
    WHERE id = v_item.equipment_id;

    -- Log status change for each equipment
    INSERT INTO public.equipment_status_log (
      equipment_id, from_status, to_status, change_reason,
      business_type, business_id, changed_by
    ) VALUES (
      v_item.equipment_id, v_prev_status, 'RENTED', '合同激活-租赁生效',
      'CONTRACT_ACTIVATE', p_contract_id, p_user_id
    );
  END LOOP;

  -- 4. Generate deposit receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;
  INSERT INTO public.receivable (
    receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by
  ) VALUES (
    v_receivable_no,
    v_contract.customer_id,
    v_contract.order_id,
    p_contract_id,
    'DEPOSIT',
    v_contract.deposit_amount,
    v_contract.deposit_amount,
    CURRENT_DATE,
    'UNPAID',
    p_user_id
  );

  -- 5. Generate first rent receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000+1000)::text;
  INSERT INTO public.receivable (
    receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by
  ) VALUES (
    v_receivable_no,
    v_contract.customer_id,
    v_contract.order_id,
    p_contract_id,
    'RENT',
    v_contract.total_rent_amount,
    v_contract.total_rent_amount,
    CURRENT_DATE + INTERVAL '30 days',
    'UNPAID',
    p_user_id
  );

  -- 6. Create deposit record
  INSERT INTO public.deposit_record (
    deposit_no, customer_id, order_id, contract_id,
    amount, paid_amount, deducted_amount, refunded_amount, available_amount,
    deposit_status, created_by
  ) VALUES (
    'DEP' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
    v_contract.customer_id,
    v_contract.order_id,
    p_contract_id,
    v_contract.deposit_amount,
    0, 0, 0,
    v_contract.deposit_amount,
    'PENDING_PAYMENT',
    p_user_id
  );

  -- 7. Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'CONTRACT_ACTIVATE', 'CONTRACT', p_contract_id,
    jsonb_build_object('contract_no', v_contract.contract_no));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('contract_id', p_contract_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
