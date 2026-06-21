-- ============================================
-- Fix: process_maintenance_parts_usage auth check
-- ============================================
-- The original function compared auth.uid() directly to p_user_id,
-- but p_user_id is a profiles.id (not auth.users.id).
-- This migration fixes the auth check to use supabase_user_id.
-- Also fixes the notification to target MAINTENANCE_SUPERVISOR role.

CREATE OR REPLACE FUNCTION public.process_maintenance_parts_usage(
  p_part_id UUID,
  p_work_order_id UUID,
  p_quantity DECIMAL(10,2),
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_part RECORD;
BEGIN
  -- Authorization: caller's auth.uid must match the profile's supabase_user_id
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
    AND supabase_user_id = auth.uid()
  ) THEN
    -- Admin override
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role IN ('SYSTEM_ADMIN', 'MAINTENANCE_SUPERVISOR')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足：仅维修人员和管理员可领用配件');
    END IF;
  END IF;

  -- Lock part row
  SELECT * INTO v_part
  FROM public.spare_part
  WHERE id = p_part_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '配件不存在');
  END IF;

  IF v_part.current_stock < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', '配件库存不足，当前库存：' || v_part.current_stock);
  END IF;

  -- 1. Deduct stock
  UPDATE public.spare_part
  SET current_stock = current_stock - p_quantity,
      status = CASE WHEN (current_stock - p_quantity) <= 0 THEN 'OUT_OF_STOCK'
                    WHEN (current_stock - p_quantity) <= safety_stock THEN 'ACTIVE'
                    ELSE status END,
      updated_at = now(),
      version = version + 1
  WHERE id = p_part_id;

  -- 2. Record movement
  INSERT INTO public.spare_part_stock_movement (
    part_id, movement_type, quantity,
    unit_price, amount,
    business_type, business_id,
    operator_id
  ) VALUES (
    p_part_id, 'OUTBOUND_MAINTENANCE', p_quantity,
    v_part.unit_price, COALESCE(v_part.unit_price, 0) * p_quantity,
    'MAINTENANCE', p_work_order_id,
    p_user_id
  );

  -- 3. Update work order parts fee
  UPDATE public.maintenance_work_order
  SET parts_fee = COALESCE(parts_fee, 0) + (COALESCE(v_part.unit_price, 0) * p_quantity),
      updated_at = now()
  WHERE id = p_work_order_id;

  -- 4. Low stock notification (to maintenance supervisors)
  IF (v_part.current_stock - p_quantity) <= v_part.safety_stock THEN
    INSERT INTO public.notification (
      recipient_id, notification_type, title, content,
      business_type, business_id
    )
    SELECT
      p.id, 'LOW_STOCK',
      '配件库存不足: ' || v_part.part_name,
      '配件 ' || v_part.part_name || ' 当前库存 ' || (v_part.current_stock - p_quantity)::text || '，低于安全库存 ' || v_part.safety_stock::text || '，请尽快补货',
      'SPARE_PART', p_part_id
    FROM public.profiles p
    WHERE p.primary_role IN ('MAINTENANCE_SUPERVISOR', 'SYSTEM_ADMIN')
    AND p.account_status = 'ACTIVE';
  END IF;

  -- 5. Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'MAINTENANCE_PARTS_USAGE', 'SPARE_PART', p_part_id,
    jsonb_build_object('quantity', p_quantity, 'work_order_id', p_work_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
