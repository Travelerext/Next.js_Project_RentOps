-- ============================================
-- Migration 0026: Complete process_inbound rewrite
-- 1. Backfill return_inspection from existing inbound
-- 2. Rewrite process_inbound with inspection creation + return_request advance
-- ============================================

-- Backfill return_inspection from existing inbound_records
INSERT INTO public.return_inspection (
  inspection_no, order_id, contract_id, equipment_id, customer_id,
  inspector_id, inspected_at,
  is_overdue, overdue_days,
  is_damaged, is_missing_parts, is_dirty, needs_repair,
  repair_estimate, customer_confirmed, created_by
)
SELECT
  'RI' || to_char(ib.operated_at, 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
  COALESCE(ib.order_id, e.current_order_id),
  COALESCE(ib.contract_id, e.current_contract_id),
  ib.equipment_id,
  COALESCE(o.customer_id, ib.operator_id),
  ib.operator_id, ib.operated_at,
  false, 0,
  ib.inspection_result = 'DAMAGED' OR ib.inspection_result = 'NEEDS_REPAIR',
  ib.inspection_result = 'MISSING_PARTS',
  ib.inspection_result = 'DIRTY',
  ib.inspection_result = 'NEEDS_REPAIR',
  '0', true, ib.created_by
FROM public.inbound_record ib
LEFT JOIN public.equipment e ON e.id = ib.equipment_id
LEFT JOIN public.rental_order o ON o.id = ib.order_id
WHERE ib.business_type = 'RETURN_INBOUND'
  AND (ib.order_id IS NOT NULL OR e.current_order_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.return_inspection ri
    WHERE ri.equipment_id = ib.equipment_id
      AND ri.inspected_at::date = ib.operated_at::date
  );

-- Rewrite process_inbound
CREATE OR REPLACE FUNCTION public.process_inbound(
  p_equipment_id UUID, p_warehouse_id UUID, p_order_id UUID,
  p_contract_id UUID, p_inbound_no TEXT,
  p_inspection_result VARCHAR(50), p_inspection_notes TEXT, p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_equipment RECORD; v_profile_id UUID; v_new_status VARCHAR(50); v_customer_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE supabase_user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', '用户档案不存在'); END IF;

  SELECT * INTO v_equipment FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', '设备不存在'); END IF;
  IF v_equipment.status != 'RENTED' THEN
    RETURN jsonb_build_object('success', false, 'error', '设备状态不允许入库：' || v_equipment.status);
  END IF;

  v_new_status := CASE WHEN p_inspection_result = 'NEEDS_REPAIR' THEN 'IN_MAINTENANCE' ELSE 'IN_STOCK' END;

  v_customer_id := v_equipment.current_customer_id;
  IF v_customer_id IS NULL AND p_order_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id FROM public.rental_order WHERE id = p_order_id;
  END IF;

  -- inbound record
  INSERT INTO public.inbound_record (inbound_no, business_type, order_id, contract_id, equipment_id, warehouse_id, inspection_result, inspection_notes, operator_id, operated_at, created_by)
  VALUES (p_inbound_no, 'RETURN_INBOUND', p_order_id, p_contract_id, p_equipment_id, p_warehouse_id, p_inspection_result, p_inspection_notes, v_profile_id, now(), v_profile_id);

  -- update equipment
  UPDATE public.equipment SET status = v_new_status, current_location_type = 'WAREHOUSE', warehouse_id = p_warehouse_id,
    current_order_id = NULL, current_contract_id = NULL, current_customer_id = NULL,
    updated_by = v_profile_id, updated_at = now(), version = version + 1 WHERE id = p_equipment_id;

  -- status log
  INSERT INTO public.equipment_status_log (equipment_id, from_status, to_status, change_reason, business_type, business_id, changed_by)
  VALUES (p_equipment_id, v_equipment.status, v_new_status, '归还入库', 'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id);

  -- location log
  INSERT INTO public.equipment_location_log (equipment_id, from_location_type, from_location_id, to_location_type, to_location_id, business_type, business_id, operator_id)
  VALUES (p_equipment_id, 'PROJECT_SITE', NULL, 'WAREHOUSE', p_warehouse_id, 'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id);

  -- ★ return_inspection
  INSERT INTO public.return_inspection (inspection_no, order_id, contract_id, equipment_id, customer_id, inspector_id, inspected_at, is_overdue, overdue_days, is_damaged, is_missing_parts, is_dirty, needs_repair, repair_estimate, customer_confirmed, created_by)
  VALUES ('RI'||to_char(now(),'YYYYMMDDHH24MISS')||floor(random()*1000)::text,
    COALESCE(p_order_id, v_equipment.current_order_id),
    COALESCE(p_contract_id, v_equipment.current_contract_id),
    p_equipment_id, COALESCE(v_customer_id, v_profile_id), v_profile_id, now(), false, 0,
    p_inspection_result IN ('DAMAGED','NEEDS_REPAIR'), p_inspection_result = 'MISSING_PARTS', p_inspection_result = 'DIRTY',
    p_inspection_result = 'NEEDS_REPAIR', '0', true, v_profile_id);

  -- ★ advance return_request — try multiple ways to match
  UPDATE public.return_request SET request_status = 'PENDING_APPROVAL', updated_at = now()
  WHERE request_status = 'PENDING'
    AND (
      (p_order_id IS NOT NULL AND order_id = p_order_id)
      OR (p_contract_id IS NOT NULL AND contract_id = p_contract_id)
      OR (p_equipment_id IS NOT NULL AND equipment_id = p_equipment_id)
    );

  -- notification
  INSERT INTO public.notification (recipient_id, notification_type, title, content, business_type, business_id)
  VALUES (v_profile_id, 'EQUIPMENT_INBOUND', '设备已入库', '设备 '||v_equipment.equipment_no||' 已完成归还入库', 'INBOUND', p_order_id);

  -- audit
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'INBOUND', 'EQUIPMENT', p_equipment_id, jsonb_build_object('inbound_no',p_inbound_no));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.process_inbound(UUID,UUID,UUID,UUID,TEXT,VARCHAR,TEXT,UUID) TO authenticated;
