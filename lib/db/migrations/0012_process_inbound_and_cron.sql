-- ============================================
-- Migration 0012: process_inbound + RLS INSERT policies + pg_cron jobs
-- ============================================
-- 1. process_inbound — Atomic return inbound processing
-- 2. INSERT RLS policies for tables written by direct server actions
-- 3. pg_cron jobs for overdue marking and expiry reminders
-- ============================================

-- --------------------------------------------------
-- 1. process_inbound — Atomically process equipment return inbound
--    Replaces the non-atomic scanInbound server action.
--    Handles: inbound_record creation, equipment status update,
--    status/location logging, order item update, notification, audit.
-- --------------------------------------------------
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
  -- Resolve profile ID from auth user ID
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE supabase_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  -- Authorization: caller must match p_user_id or be admin/manager
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role IN ('SYSTEM_ADMIN', 'EQUIPMENT_MANAGER', 'SALES_MANAGER')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock equipment row
  SELECT * INTO v_equipment
  FROM public.equipment
  WHERE id = p_equipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '设备不存在');
  END IF;

  IF v_equipment.status != 'RENTED' THEN
    RETURN jsonb_build_object('success', false, 'error', '设备状态不允许入库，当前状态：' || v_equipment.status);
  END IF;

  -- Determine new status based on inspection result
  v_new_status := CASE
    WHEN p_inspection_result = 'NORMAL' THEN 'IN_STOCK'
    WHEN p_inspection_result = 'NEEDS_REPAIR' THEN 'IN_MAINTENANCE'
    WHEN p_inspection_result = 'PENDING_REVIEW' THEN 'PENDING_INSPECTION'
    ELSE 'IN_STOCK'
  END;

  -- 1. Create inbound record
  INSERT INTO public.inbound_record (
    inbound_no, business_type,
    order_id, contract_id,
    equipment_id, warehouse_id,
    inspection_result, inspection_notes,
    operator_id, operated_at, created_by
  ) VALUES (
    p_inbound_no, 'RETURN_INBOUND',
    p_order_id, p_contract_id,
    p_equipment_id, p_warehouse_id,
    p_inspection_result, p_inspection_notes,
    v_profile_id, now(), v_profile_id
  );

  -- 2. Update equipment status
  UPDATE public.equipment
  SET status = v_new_status,
      current_location_type = 'WAREHOUSE',
      warehouse_id = p_warehouse_id,
      current_order_id = NULL,
      current_contract_id = NULL,
      current_customer_id = NULL,
      current_project_site_id = NULL,
      current_location_text = NULL,
      updated_by = v_profile_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_equipment_id;

  -- 3. Log status change
  INSERT INTO public.equipment_status_log (
    equipment_id, from_status, to_status, change_reason,
    business_type, business_id, changed_by
  ) VALUES (
    p_equipment_id, v_equipment.status, v_new_status, '归还入库',
    'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  -- 4. Log location change
  INSERT INTO public.equipment_location_log (
    equipment_id, from_location_type, from_location_id,
    to_location_type, to_location_id,
    business_type, business_id, operator_id
  ) VALUES (
    p_equipment_id, 'PROJECT_SITE', NULL,
    'WAREHOUSE', p_warehouse_id,
    'RETURN_INBOUND', COALESCE(p_order_id, p_contract_id, p_equipment_id), v_profile_id
  );

  -- 5. Update order item status to RETURNED
  IF p_order_id IS NOT NULL THEN
    UPDATE public.rental_order_item
    SET item_status = 'RETURNED', updated_at = now()
    WHERE order_id = p_order_id AND equipment_id = p_equipment_id;

    -- Check if all items are returned — update order to PARTIAL_RETURN or trigger completion
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

  -- 6. Notification
  INSERT INTO public.notification (
    recipient_id, notification_type, title, content,
    business_type, business_id
  ) VALUES (
    v_profile_id, 'EQUIPMENT_INBOUND',
    '设备已入库', '设备 ' || v_equipment.equipment_no || ' 已完成归还入库（验收结果：' || p_inspection_result || '）',
    'INBOUND', p_order_id
  );

  -- 7. Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (v_profile_id, 'INBOUND', 'EQUIPMENT', p_equipment_id,
    jsonb_build_object(
      'inbound_no', p_inbound_no,
      'order_id', p_order_id,
      'inspection_result', p_inspection_result,
      'new_status', v_new_status
    ));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_inbound(
  UUID, UUID, UUID, UUID, TEXT, VARCHAR, TEXT, UUID
) TO authenticated;


-- --------------------------------------------------
-- 2. INSERT RLS policies for tables written by direct server actions
--    (not through SECURITY DEFINER functions)
-- --------------------------------------------------

-- 2.1 return_inspection — written by equipment manager during inbound
DROP POLICY IF EXISTS "Authenticated can insert return inspections" ON public.return_inspection;
CREATE POLICY "Authenticated can insert return inspections" ON public.return_inspection
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.2 return_settlement — written by confirmSettlement
DROP POLICY IF EXISTS "Authenticated can insert return settlements" ON public.return_settlement;
CREATE POLICY "Authenticated can insert return settlements" ON public.return_settlement
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.3 refund_record — written by requestRefund and confirmSettlement
DROP POLICY IF EXISTS "Authenticated can insert refund records" ON public.refund_record;
CREATE POLICY "Authenticated can insert refund records" ON public.refund_record
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.4 reconciliation_statement — written by finance
DROP POLICY IF EXISTS "Authenticated can insert reconciliation statements" ON public.reconciliation_statement;
CREATE POLICY "Authenticated can insert reconciliation statements" ON public.reconciliation_statement
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.5 inbound_record — fallback for any direct inserts (process_inbound is SECURITY DEFINER)
DROP POLICY IF EXISTS "Authenticated can insert inbound records" ON public.inbound_record;
CREATE POLICY "Authenticated can insert inbound records" ON public.inbound_record
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.6 outbound_record — fallback for any direct inserts (process_outbound is SECURITY DEFINER)
DROP POLICY IF EXISTS "Authenticated can insert outbound records" ON public.outbound_record;
CREATE POLICY "Authenticated can insert outbound records" ON public.outbound_record
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.7 equipment_status_log — fallback for direct inserts
DROP POLICY IF EXISTS "Authenticated can insert status logs" ON public.equipment_status_log;
CREATE POLICY "Authenticated can insert status logs" ON public.equipment_status_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.8 equipment_location_log — fallback for direct inserts
DROP POLICY IF EXISTS "Authenticated can insert location logs" ON public.equipment_location_log;
CREATE POLICY "Authenticated can insert location logs" ON public.equipment_location_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.9 notification — written by various server actions
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notification;
CREATE POLICY "Authenticated can insert notifications" ON public.notification
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');


-- --------------------------------------------------
-- 3. pg_cron jobs: overdue marking + expiry reminders
-- --------------------------------------------------

-- 3.1 Daily job: mark overdue orders
-- Runs at 02:00 every day. Marks orders past planned_end_at as OVERDUE.
SELECT cron.schedule(
  'mark-overdue-orders',
  '0 2 * * *',
  $$
    WITH overdue_orders AS (
      UPDATE public.rental_order
      SET order_status = 'OVERDUE',
          updated_at = now(),
          version = version + 1
      WHERE order_status IN ('IN_PROGRESS', 'PARTIAL_RETURN')
        AND planned_end_at < now()
        AND deleted_at IS NULL
      RETURNING id, order_no, customer_id, sales_user_id
    )
    INSERT INTO public.notification (recipient_id, notification_type, title, content, business_type, business_id)
    SELECT
      p.id,
      'CONTRACT_OVERDUE',
      '合同已逾期',
      '订单 ' || o.order_no || ' 已超过计划结束时间，请及时跟进归还。',
      'ORDER',
      o.id
    FROM overdue_orders o
    JOIN public.profiles p ON p.id = o.sales_user_id;
  $$
);

-- 3.2 Daily job: mark overdue receivables
-- Runs at 02:30 every day. Marks unpaid receivables past due_date as OVERDUE.
SELECT cron.schedule(
  'mark-overdue-receivables',
  '30 2 * * *',
  $$
    WITH overdue_rec AS (
      UPDATE public.receivable
      SET status = 'OVERDUE',
          overdue_days = EXTRACT(DAY FROM now() - due_date)::INTEGER,
          updated_at = now()
      WHERE status IN ('UNPAID', 'PARTIAL')
        AND due_date < now()
        AND deleted_at IS NULL
      RETURNING id, receivable_no, customer_id, order_id, amount, unpaid_amount
    )
    INSERT INTO public.notification (recipient_id, notification_type, title, content, business_type, business_id)
    SELECT
      p.id,
      'RECEIVABLE_OVERDUE',
      '应收已逾期',
      '应收 ' || r.receivable_no || '（金额：¥' || r.unpaid_amount::TEXT || '）已逾期，请跟进收款。',
      'RECEIVABLE',
      r.id
    FROM overdue_rec r
    CROSS JOIN (
      SELECT id FROM public.profiles
      WHERE primary_role IN ('FINANCE', 'FINANCE_MANAGER', 'SYSTEM_ADMIN', 'GENERAL_MANAGER')
        AND account_status = 'ACTIVE'
    ) p;
  $$
);

-- 3.3 Daily job: expiry reminders (7 days before planned end)
-- Runs at 08:00 every day. Notifies sales users about contracts expiring within 7 days.
SELECT cron.schedule(
  'expiry-reminders',
  '0 8 * * *',
  $$
    WITH expiring_orders AS (
      SELECT id, order_no, customer_id, sales_user_id, planned_end_at
      FROM public.rental_order
      WHERE order_status IN ('IN_PROGRESS', 'PARTIAL_RETURN')
        AND planned_end_at BETWEEN now() AND now() + INTERVAL '7 days'
        AND deleted_at IS NULL
    )
    INSERT INTO public.notification (recipient_id, notification_type, title, content, business_type, business_id)
    SELECT
      profiles.id,
      'CONTRACT_EXPIRING',
      '合同即将到期',
      '订单 ' || eo.order_no || ' 将于 ' || to_char(eo.planned_end_at, 'YYYY-MM-DD') || ' 到期，请提前联系客户确认归还或续租。',
      'ORDER',
      eo.id
    FROM expiring_orders eo
    JOIN public.profiles ON profiles.id = eo.sales_user_id
    WHERE eo.sales_user_id IS NOT NULL;
  $$
);
