-- ============================================
-- Migration 0013: Fix low-stock notification targets
-- ============================================
-- The 0011 version of process_maintenance_parts_usage changed the
-- low-stock notification to target only one random MAINTENANCE role
-- user (LIMIT 1), dropping MAINTENANCE_SUPERVISOR and SYSTEM_ADMIN.
-- This restores the correct behavior: notify ALL active supervisors
-- and admins about low stock.
-- ============================================

CREATE OR REPLACE FUNCTION public.process_maintenance_parts_usage(
  p_work_order_id UUID,
  p_part_id UUID,
  p_quantity DECIMAL(10,2),
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_part RECORD;
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
      AND primary_role IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock spare part row
  SELECT * INTO v_part
  FROM public.spare_part
  WHERE id = p_part_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '配件不存在');
  END IF;

  IF v_part.current_stock < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', '库存不足，当前库存：' || v_part.current_stock::text);
  END IF;

  -- 1. Deduct stock
  UPDATE public.spare_part
  SET current_stock = current_stock - p_quantity,
      updated_at = now()
  WHERE id = p_part_id;

  -- 2. Record stock movement
  INSERT INTO public.spare_part_stock_movement (
    part_id, movement_type, quantity, unit_price,
    amount, operator_id
  ) VALUES (
    p_part_id, 'OUTBOUND_MAINTENANCE', p_quantity,
    COALESCE(v_part.unit_price, 0),
    p_quantity * COALESCE(v_part.unit_price, 0),
    v_profile_id
  );

  -- 3. Update work order parts fee
  UPDATE public.maintenance_work_order
  SET parts_fee = COALESCE(parts_fee, 0) + (p_quantity * COALESCE(v_part.unit_price, 0)),
      updated_at = now()
  WHERE id = p_work_order_id;

  -- 4. Low stock notification — notify ALL active supervisors and admins
  IF (v_part.current_stock - p_quantity) <= v_part.safety_stock THEN
    INSERT INTO public.notification (
      recipient_id, notification_type, title, content,
      business_type, business_id
    ) SELECT
      p.id, 'LOW_STOCK',
      '配件库存不足: ' || v_part.part_name,
      '配件 ' || v_part.part_name || ' 当前库存 ' || (v_part.current_stock - p_quantity)::text || '，低于安全库存 ' || v_part.safety_stock::text,
      'SPARE_PART', p_part_id
    FROM public.profiles p
    WHERE p.primary_role IN ('MAINTENANCE_SUPERVISOR', 'SYSTEM_ADMIN')
      AND p.account_status = 'ACTIVE';
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'MAINTENANCE_PARTS_USAGE', 'SPARE_PART', p_part_id,
    jsonb_build_object('work_order_id', p_work_order_id, 'quantity', p_quantity));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_maintenance_parts_usage(
  UUID, UUID, DECIMAL, UUID
) TO authenticated;
