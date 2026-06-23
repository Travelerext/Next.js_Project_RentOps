-- ============================================
-- Migration 0020: Return request flow — freeze, approve, terminate
-- ============================================
-- 1. Creating a return_request now freezes the contract
-- 2. After inbound, return_request moves to PENDING_APPROVAL
-- 3. Business manager approves → contract TERMINATED → finance settles
-- ============================================

-- Update process_inbound: auto-advance return_request to PENDING_APPROVAL
CREATE OR REPLACE FUNCTION public.process_inbound(
  p_equipment_id UUID,
  p_warehouse_id UUID,
  p_order_id UUID,
  p_contract_id UUID,
  p_inbound_no TEXT,
  p_inspection_result VARCHAR(50),
  p_inspection_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_equipment RECORD;
  v_profile_id UUID;
  v_new_status VARCHAR(50);
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE supabase_user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role IN ('SYSTEM_ADMIN', 'EQUIPMENT_MANAGER', 'SALES_MANAGER')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  SELECT * INTO v_equipment FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '设备不存在');
  END IF;

  IF v_equipment.status != 'RENTED' THEN
    RETURN jsonb_build_object('success', false, 'error', '设备状态不允许入库，当前状态：' || v_equipment.status);
  END IF;

  v_new_status := CASE
    WHEN p_inspection_result = 'NORMAL' THEN 'IN_STOCK'
    WHEN p_inspection_result = 'NEEDS_REPAIR' THEN 'IN_MAINTENANCE'
    WHEN p_inspection_result = 'PENDING_REVIEW' THEN 'PENDING_INSPECTION'
    ELSE 'IN_STOCK'
  END;

  INSERT INTO public.inbound_record (
    inbound_no, business_type, order_id, contract_id,
    equipment_id, warehouse_id, inspection_result, inspection_notes,
    operator_id, operated_at, created_by
  ) VALUES (
    p_inbound_no, 'RETURN_INBOUND', p_order_id, p_contract_id,
    p_equipment_id, p_warehouse_id, p_inspection_result, p_inspection_notes,
    v_profile_id, now(), v_profile_id
  );

  UPDATE public.equipment
  SET status = v_new_status, current_location_type = 'WAREHOUSE',
      warehouse_id = p_warehouse_id,
      current_order_id = NULL, current_contract_id = NULL,
      current_customer_id = NULL, current_project_site_id = NULL,
      current_location_text = NULL,
      updated_by = v_profile_id, updated_at = now(), version = version + 1
  WHERE id = p_equipment_id;

  INSERT INTO public.equipment_status_log (
    equipment_id, from_status, to_status, change_reason,
    business_type, business_id, changed_by
  ) VALUES (
    p_equipment_id, v_equipment.status, v_new_status, '归还入库',
    'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  INSERT INTO public.equipment_location_log (
    equipment_id, from_location_type, from_location_id,
    to_location_type, to_location_id,
    business_type, business_id, operator_id
  ) VALUES (
    p_equipment_id, 'PROJECT_SITE', NULL,
    'WAREHOUSE', p_warehouse_id,
    'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  IF p_order_id IS NOT NULL THEN
    UPDATE public.rental_order_item
    SET item_status = 'RETURNED', updated_at = now()
    WHERE order_id = p_order_id AND equipment_id = p_equipment_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.rental_order_item
      WHERE order_id = p_order_id AND item_status != 'RETURNED'
    ) THEN
      UPDATE public.rental_order
      SET order_status = 'COMPLETED', updated_at = now(), version = version + 1
      WHERE id = p_order_id AND order_status = 'IN_PROGRESS';
    ELSE
      UPDATE public.rental_order
      SET order_status = 'PARTIAL_RETURN', updated_at = now(), version = version + 1
      WHERE id = p_order_id AND order_status = 'IN_PROGRESS';
    END IF;
  END IF;

  -- Advance return_request to PENDING_APPROVAL if one exists for this order/contract
  UPDATE public.return_request
  SET request_status = 'PENDING_APPROVAL',
      inbound_id = (SELECT id FROM public.inbound_record WHERE inbound_no = p_inbound_no),
      updated_at = now()
  WHERE (order_id = p_order_id OR contract_id = p_contract_id)
    AND request_status = 'PENDING';

  INSERT INTO public.notification (
    recipient_id, notification_type, title, content, business_type, business_id
  ) VALUES (
    v_profile_id, 'EQUIPMENT_INBOUND', '设备已入库',
    '设备 ' || v_equipment.equipment_no || ' 已完成归还入库',
    'INBOUND', p_order_id
  );

  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'INBOUND', 'EQUIPMENT', p_equipment_id,
    jsonb_build_object('inbound_no', p_inbound_no, 'order_id', p_order_id,
      'inspection_result', p_inspection_result, 'new_status', v_new_status));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_inbound(UUID, UUID, UUID, UUID, TEXT, VARCHAR, TEXT, UUID) TO authenticated;

-- Notify approvers when a return request moves to PENDING_APPROVAL
CREATE OR REPLACE FUNCTION public.notify_return_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_status = 'PENDING_APPROVAL' AND OLD.request_status = 'PENDING' THEN
    INSERT INTO public.notification (recipient_id, notification_type, title, content, business_type, business_id)
    SELECT p.id, 'RETURN_APPROVAL', '退租申请待审批',
      '退租申请 ' || NEW.request_no || ' 已完成设备入库，等待审批确认',
      'RETURN_REQUEST', NEW.id
    FROM public.profiles p
    WHERE p.primary_role IN ('SALES_MANAGER', 'GENERAL_MANAGER', 'SYSTEM_ADMIN', 'APPROVER')
      AND p.account_status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_return_request_approval ON public.return_request;
CREATE TRIGGER trg_return_request_approval
  AFTER UPDATE OF request_status ON public.return_request
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_return_approval();
