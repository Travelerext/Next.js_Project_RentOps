-- ============================================
-- Migration 0016: Update deposit record on payment reconciliation
-- ============================================
-- When a deposit receivable is paid, the deposit_record should be
-- updated from PENDING_PAYMENT to PAID. Previously only the receivable
-- and order were updated, leaving deposits stuck at "待付".
-- ============================================

CREATE OR REPLACE FUNCTION public.process_payment_reconciliation(
  p_receivable_id UUID,
  p_amount DECIMAL(15,2),
  p_payment_method VARCHAR(50),
  p_payer_name VARCHAR(200),
  p_bank_flow_no VARCHAR(100),
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_receivable RECORD;
  v_payment_no TEXT;
  v_new_paid DECIMAL(15,2);
  v_new_status VARCHAR(50);
  v_profile_id UUID;
BEGIN
  -- Resolve profile ID from auth user ID
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE supabase_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  -- Authorization
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock receivable row
  SELECT * INTO v_receivable
  FROM public.receivable
  WHERE id = p_receivable_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '应收记录不存在');
  END IF;

  -- Create payment record
  v_payment_no := 'PAY' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;
  INSERT INTO public.payment_record (
    payment_no, customer_id, order_id, contract_id, receivable_id,
    payment_type, payment_method, amount, paid_at,
    payer_name, bank_flow_no, created_by
  ) VALUES (
    v_payment_no,
    v_receivable.customer_id,
    v_receivable.order_id,
    v_receivable.contract_id,
    p_receivable_id,
    v_receivable.receivable_type,
    p_payment_method,
    p_amount,
    now(),
    p_payer_name,
    p_bank_flow_no,
    v_profile_id
  );

  -- Update receivable
  v_new_paid := v_receivable.paid_amount + p_amount;
  IF v_new_paid >= v_receivable.amount THEN
    v_new_status := 'PAID';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := v_receivable.status;
  END IF;

  UPDATE public.receivable
  SET paid_amount = v_new_paid,
      unpaid_amount = v_receivable.amount - v_new_paid,
      status = v_new_status,
      updated_by = v_profile_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_receivable_id;

  -- Update order paid/unpaid amounts
  IF v_receivable.order_id IS NOT NULL THEN
    UPDATE public.rental_order
    SET paid_amount = COALESCE(paid_amount, 0) + p_amount,
        unpaid_amount = GREATEST(0, COALESCE(unpaid_amount, 0) - p_amount),
        updated_at = now()
    WHERE id = v_receivable.order_id;
  END IF;

  -- Update deposit record if this is a deposit payment
  IF v_receivable.receivable_type = 'DEPOSIT' AND v_receivable.contract_id IS NOT NULL THEN
    UPDATE public.deposit_record
    SET paid_amount = COALESCE(paid_amount, 0) + p_amount,
        available_amount = COALESCE(available_amount, 0) + p_amount,
        deposit_status = CASE
          WHEN COALESCE(paid_amount, 0) + p_amount >= amount THEN 'PAID'
          ELSE 'PAID'
        END,
        updated_at = now()
    WHERE contract_id = v_receivable.contract_id
      AND deposit_status = 'PENDING_PAYMENT';
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'PAYMENT', 'PAYMENT', p_receivable_id,
    jsonb_build_object('payment_no', v_payment_no, 'amount', p_amount, 'method', p_payment_method));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('payment_no', v_payment_no));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_payment_reconciliation(
  UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, UUID
) TO authenticated;

-- Fix existing deposits that are paid but still show PENDING_PAYMENT
UPDATE public.deposit_record d
SET deposit_status = 'PAID',
    updated_at = now()
WHERE d.deposit_status = 'PENDING_PAYMENT'
  AND EXISTS (
    SELECT 1 FROM public.receivable r
    WHERE r.contract_id = d.contract_id
      AND r.receivable_type = 'DEPOSIT'
      AND r.status = 'PAID'
  );
