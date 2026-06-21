-- ============================================
-- Migration 0005: RLS Policies & Function Auth Fixes
-- ============================================
-- 1. Add auth.uid() checks to all SECURITY DEFINER functions
-- 2. Enable RLS on all remaining tables
-- 3. Add missing RLS policies

-- ============================================
-- PART 1: Auth Helper Functions
-- ============================================

-- Helper: get current user's profile id (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_current_user_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.profiles
  WHERE supabase_user_id = auth.uid()
  LIMIT 1;
$$;

-- ============================================
-- PART 2: Fix SECURITY DEFINER Functions
-- Add auth.uid() verification to prevent
-- unauthorized invocation by any authenticated user
-- ============================================

-- --------------------------------------------------
-- 2.1 activate_contract
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_contract(
  p_contract_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_contract RECORD;
  v_order RECORD;
  v_receivable_no TEXT;
BEGIN
  -- Authorization: caller must match p_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
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

  -- 3. Generate deposit receivable
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

  -- 4. Generate first rent receivable
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

  -- 5. Create deposit record
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

  -- 6. Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'CONTRACT_ACTIVATE', 'CONTRACT', p_contract_id,
    jsonb_build_object('contract_no', v_contract.contract_no));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('contract_id', p_contract_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.2 process_outbound
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_outbound(
  p_equipment_id UUID,
  p_warehouse_id UUID,
  p_order_id UUID,
  p_contract_id UUID,
  p_outbound_no TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_equipment RECORD;
BEGIN
  -- Authorization: caller must match p_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
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

  IF v_equipment.status NOT IN ('IN_STOCK', 'LOCKED') THEN
    RETURN jsonb_build_object('success', false, 'error', '设备状态不允许出库，当前状态：' || v_equipment.status);
  END IF;

  -- 1. Create outbound record
  INSERT INTO public.outbound_record (
    outbound_no, business_type,
    order_id, contract_id,
    equipment_id, warehouse_id,
    operator_id, operated_at, created_by
  ) VALUES (
    p_outbound_no, 'RENTAL_OUTBOUND',
    p_order_id, p_contract_id,
    p_equipment_id, p_warehouse_id,
    p_user_id, now(), p_user_id
  );

  -- 2. Update equipment status
  UPDATE public.equipment
  SET status = 'RENTED',
      current_location_type = 'PROJECT_SITE',
      current_order_id = p_order_id,
      current_contract_id = p_contract_id,
      updated_by = p_user_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_equipment_id;

  -- 3. Log status change
  INSERT INTO public.equipment_status_log (
    equipment_id, from_status, to_status, change_reason,
    business_type, business_id, changed_by
  ) VALUES (
    p_equipment_id, v_equipment.status, 'RENTED', '租赁出库',
    'RENTAL_OUTBOUND', p_order_id, p_user_id
  );

  -- 4. Log location change
  INSERT INTO public.equipment_location_log (
    equipment_id, from_location_type, from_location_id,
    to_location_type, to_location_id,
    business_type, business_id, operator_id
  ) VALUES (
    p_equipment_id, 'WAREHOUSE', p_warehouse_id,
    'PROJECT_SITE', NULL,
    'RENTAL_OUTBOUND', p_order_id, p_user_id
  );

  -- 5. Update order item status
  UPDATE public.rental_order_item
  SET item_status = 'OUTBOUND', updated_at = now()
  WHERE order_id = p_order_id AND equipment_id = p_equipment_id;

  -- 6. Notification
  INSERT INTO public.notification (
    recipient_id, notification_type, title, content,
    business_type, business_id
  ) VALUES (
    p_user_id, 'EQUIPMENT_OUTBOUND',
    '设备已出库', '设备 ' || v_equipment.equipment_no || ' 已完成出库操作',
    'OUTBOUND', p_order_id
  );

  -- 7. Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'OUTBOUND', 'EQUIPMENT', p_equipment_id,
    jsonb_build_object('outbound_no', p_outbound_no, 'order_id', p_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.3 process_payment_reconciliation
-- --------------------------------------------------
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
BEGIN
  -- Authorization: caller must match p_user_id or be admin
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
    p_user_id
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
      updated_by = p_user_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_receivable_id;

  -- Update order paid/unpaid amounts
  IF v_receivable.order_id IS NOT NULL THEN
    UPDATE public.rental_order
    SET paid_amount = paid_amount + p_amount,
        unpaid_amount = GREATEST(0, unpaid_amount - p_amount),
        updated_at = now()
    WHERE id = v_receivable.order_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'PAYMENT', 'PAYMENT', p_receivable_id,
    jsonb_build_object('payment_no', v_payment_no, 'amount', p_amount, 'method', p_payment_method));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('payment_no', v_payment_no));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.4 process_return_settlement
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_return_settlement(
  p_inspection_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_inspection RECORD;
  v_contract RECORD;
  v_settlement_no TEXT;
  v_total_deduction DECIMAL(15,2);
  v_deposit_balance DECIMAL(15,2);
  v_refund_amount DECIMAL(15,2);
  v_additional_charge DECIMAL(15,2);
BEGIN
  -- Authorization: caller must match p_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock inspection
  SELECT * INTO v_inspection
  FROM public.return_inspection
  WHERE id = p_inspection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '验收记录不存在');
  END IF;

  -- Get contract
  SELECT * INTO v_contract
  FROM public.rental_contract
  WHERE id = v_inspection.contract_id
  FOR UPDATE;

  -- Calculate deductions from inspection
  v_total_deduction := 0;
  IF v_inspection.is_damaged THEN
    v_total_deduction := v_total_deduction + v_inspection.repair_estimate;
  END IF;

  -- Create settlement
  v_settlement_no := 'STL' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;

  INSERT INTO public.return_settlement (
    settlement_no, inspection_id, contract_id, order_id, customer_id,
    unpaid_rent, overdue_rent, late_fee, penalty,
    damage_compensation, missing_parts_comp,
    cleaning_fee, repair_fee,
    total_deduction, deposit_balance, refund_amount, additional_charge,
    settlement_status, created_by
  ) VALUES (
    v_settlement_no, p_inspection_id, v_inspection.contract_id, v_inspection.order_id, v_inspection.customer_id,
    0, 0, 0, 0,
    CASE WHEN v_inspection.is_damaged THEN v_inspection.repair_estimate ELSE 0 END,
    0,
    CASE WHEN v_inspection.is_dirty THEN 200 ELSE 0 END,
    CASE WHEN v_inspection.is_damaged THEN v_inspection.repair_estimate ELSE 0 END,
    v_total_deduction,
    v_contract.deposit_amount,
    GREATEST(0, v_contract.deposit_amount - v_total_deduction),
    GREATEST(0, v_total_deduction - v_contract.deposit_amount),
    'CONFIRMED',
    p_user_id
  );

  -- Update equipment status
  UPDATE public.equipment
  SET status = CASE WHEN v_inspection.needs_repair THEN 'IN_MAINTENANCE' ELSE 'IN_STOCK' END,
      current_location_type = 'WAREHOUSE',
      current_order_id = NULL,
      current_contract_id = NULL,
      current_customer_id = NULL,
      updated_by = p_user_id,
      updated_at = now()
  WHERE id = v_inspection.equipment_id;

  -- Update order item
  UPDATE public.rental_order_item
  SET item_status = 'RETURNED', updated_at = now()
  WHERE order_id = v_inspection.order_id AND equipment_id = v_inspection.equipment_id;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'RETURN_SETTLEMENT', 'SETTLEMENT', v_inspection.id,
    jsonb_build_object('settlement_no', v_settlement_no, 'total_deduction', v_total_deduction));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('settlement_no', v_settlement_no));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.5 process_maintenance_parts_usage
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_maintenance_parts_usage(
  p_part_id UUID,
  p_work_order_id UUID,
  p_quantity DECIMAL(10,2),
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_part RECORD;
BEGIN
  -- Authorization: caller must match p_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
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
      status = CASE WHEN (current_stock - p_quantity) <= safety_stock THEN 'OUT_OF_STOCK' ELSE status END,
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
    v_part.unit_price, v_part.unit_price * p_quantity,
    'MAINTENANCE', p_work_order_id,
    p_user_id
  );

  -- 3. Update work order parts fee
  UPDATE public.maintenance_work_order
  SET parts_fee = parts_fee + (v_part.unit_price * p_quantity),
      updated_at = now()
  WHERE id = p_work_order_id;

  -- 4. Low stock notification
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
    WHERE p.primary_role = 'MAINTENANCE'
    LIMIT 1;
  END IF;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'MAINTENANCE_PARTS_USAGE', 'SPARE_PART', p_part_id,
    jsonb_build_object('quantity', p_quantity, 'work_order_id', p_work_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.6 create_order_with_validation
-- Special case: verify against p_sales_user_id
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_with_validation(
  p_customer_id UUID,
  p_sales_user_id UUID,
  p_pricing_mode VARCHAR(50),
  p_planned_start_at TIMESTAMPTZ,
  p_planned_end_at TIMESTAMPTZ,
  p_transport_fee DECIMAL(15,2),
  p_material_fee DECIMAL(15,2),
  p_other_fee DECIMAL(15,2),
  p_remark TEXT
) RETURNS JSONB AS $$
DECLARE
  v_customer RECORD;
  v_order_no TEXT;
  v_order_id UUID;
  v_risks JSONB := '[]'::JSONB;
  v_risk_warning BOOLEAN := false;
BEGIN
  -- Authorization: caller must match p_sales_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_sales_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Validate customer
  SELECT * INTO v_customer
  FROM public.customer
  WHERE id = p_customer_id AND deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '客户不存在');
  END IF;

  IF v_customer.is_blacklisted THEN
    RETURN jsonb_build_object('success', false, 'error', '客户已被列入黑名单，无法创建订单');
  END IF;

  IF v_customer.lock_ordering THEN
    RETURN jsonb_build_object('success', false, 'error', '客户已被锁单，原因：' || COALESCE(v_customer.lock_reason, '未提供'));
  END IF;

  -- Check risk
  IF v_customer.risk_level IN ('HIGH', 'CRITICAL') THEN
    v_risks := v_risks || jsonb_build_object(
      'type', 'HIGH_RISK',
      'level', v_customer.risk_level,
      'message', '客户风险等级为 ' || v_customer.risk_level || '，请谨慎操作'
    );
    v_risk_warning := true;
  END IF;

  -- Check unsettled receivables
  IF EXISTS (
    SELECT 1 FROM public.receivable
    WHERE customer_id = p_customer_id
      AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      AND due_date < CURRENT_DATE
  ) THEN
    v_risks := v_risks || jsonb_build_object(
      'type', 'UNSETTLED_RECEIVABLE',
      'message', '客户存在逾期未结算应收款'
    );
    v_risk_warning := true;
  END IF;

  -- Generate order number
  v_order_no := 'RO' || to_char(now(), 'YYYYMMDDHH24MISS') || upper(substr(md5(random()::text), 1, 4));

  -- Create order
  INSERT INTO public.rental_order (
    order_no, customer_id, sales_user_id,
    order_status, pricing_mode,
    planned_start_at, planned_end_at,
    transport_fee, material_fee, other_fee,
    risk_warning_triggered, risk_warnings,
    remark, created_by, updated_by
  ) VALUES (
    v_order_no, p_customer_id, p_sales_user_id,
    'DRAFT', p_pricing_mode,
    p_planned_start_at, p_planned_end_at,
    COALESCE(p_transport_fee, 0), COALESCE(p_material_fee, 0), COALESCE(p_other_fee, 0),
    v_risk_warning, v_risks,
    p_remark, p_sales_user_id, p_sales_user_id
  )
  RETURNING id INTO v_order_id;

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_sales_user_id, 'ORDER_CREATE', 'ORDER', v_order_id,
    jsonb_build_object('order_no', v_order_no, 'customer_id', p_customer_id, 'risk_warning', v_risk_warning));

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_order_id,
      'order_no', v_order_no,
      'risk_warning', v_risk_warning,
      'risks', v_risks
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------
-- 2.7 submit_order
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_order(
  p_order_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_item_count INTEGER;
BEGIN
  -- Authorization: caller must match p_user_id or be admin
  IF (SELECT auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE supabase_user_id = auth.uid()
      AND primary_role = 'SYSTEM_ADMIN'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', '权限不足');
    END IF;
  END IF;

  -- Lock order
  SELECT * INTO v_order
  FROM public.rental_order
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '订单不存在');
  END IF;

  IF v_order.order_status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', '只有草稿状态的订单可以提交');
  END IF;

  -- Check items exist
  SELECT COUNT(*) INTO v_item_count
  FROM public.rental_order_item
  WHERE order_id = p_order_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '订单没有设备明细，请先添加设备');
  END IF;

  -- Sum up totals
  UPDATE public.rental_order
  SET order_status = 'SUBMITTED',
      updated_by = p_user_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_order_id;

  -- Lock equipment
  UPDATE public.equipment
  SET status = 'LOCKED',
      updated_at = now()
  WHERE id IN (
    SELECT equipment_id FROM public.rental_order_item WHERE order_id = p_order_id
  );

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'ORDER_SUBMIT', 'ORDER', p_order_id,
    jsonb_build_object('order_no', v_order.order_no));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: Enable RLS on ALL remaining tables
-- ============================================

-- Organization
ALTER TABLE public.department ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse ENABLE ROW LEVEL SECURITY;

-- Roles & Permissions
ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_scope_rule ENABLE ROW LEVEL SECURITY;

-- Equipment sub-tables
ALTER TABLE public.equipment_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_location_log ENABLE ROW LEVEL SECURITY;

-- Order/Contract sub-tables
ALTER TABLE public.rental_order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_contract_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_change_record ENABLE ROW LEVEL SECURITY;

-- Customer sub-tables
ALTER TABLE public.customer_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_record ENABLE ROW LEVEL SECURITY;

-- Inventory
ALTER TABLE public.outbound_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_transfer ENABLE ROW LEVEL SECURITY;

-- Return & Settlement
ALTER TABLE public.return_inspection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_settlement ENABLE ROW LEVEL SECURITY;

-- Finance
ALTER TABLE public.payment_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_statement ENABLE ROW LEVEL SECURITY;

-- Maintenance
ALTER TABLE public.maintenance_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_stock_movement ENABLE ROW LEVEL SECURITY;

-- Approval
ALTER TABLE public.approval_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_step_record ENABLE ROW LEVEL SECURITY;

-- Audit
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 4: RLS Policies for tables that already
-- had RLS enabled but lacked policies
-- ============================================

-- --------------------------------------------------
-- 4.1 customer
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view customers" ON public.customer;
CREATE POLICY "Authenticated can view customers" ON public.customer
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can insert customers" ON public.customer;
CREATE POLICY "Authenticated can insert customers" ON public.customer
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can update customers" ON public.customer;
CREATE POLICY "Admin can update customers" ON public.customer
  FOR UPDATE USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- --------------------------------------------------
-- 4.2 rental_order
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own orders" ON public.rental_order;
CREATE POLICY "Users can view own orders" ON public.rental_order
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

DROP POLICY IF EXISTS "Authenticated can insert orders" ON public.rental_order;
CREATE POLICY "Authenticated can insert orders" ON public.rental_order
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own orders" ON public.rental_order;
CREATE POLICY "Users can update own orders" ON public.rental_order
  FOR UPDATE USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

-- --------------------------------------------------
-- 4.3 rental_contract
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
CREATE POLICY "Users can view own contracts" ON public.rental_contract
  FOR SELECT USING (
    created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

DROP POLICY IF EXISTS "Authenticated can insert contracts" ON public.rental_contract;
CREATE POLICY "Authenticated can insert contracts" ON public.rental_contract
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can update contracts" ON public.rental_contract;
CREATE POLICY "Admin can update contracts" ON public.rental_contract
  FOR UPDATE USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- --------------------------------------------------
-- 4.4 receivable
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view receivables" ON public.receivable;
CREATE POLICY "Authenticated can view receivables" ON public.receivable
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can update receivables" ON public.receivable;
CREATE POLICY "Admin can update receivables" ON public.receivable
  FOR UPDATE USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- --------------------------------------------------
-- 4.5 maintenance_work_order
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own maintenance orders" ON public.maintenance_work_order;
CREATE POLICY "Users can view own maintenance orders" ON public.maintenance_work_order
  FOR SELECT USING (
    reported_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR assigned_to IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE')
  );

DROP POLICY IF EXISTS "Authenticated can insert maintenance orders" ON public.maintenance_work_order;
CREATE POLICY "Authenticated can insert maintenance orders" ON public.maintenance_work_order
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can update maintenance orders" ON public.maintenance_work_order;
CREATE POLICY "Admin can update maintenance orders" ON public.maintenance_work_order
  FOR UPDATE USING (
    public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE')
  );

-- ============================================
-- PART 5: RLS Policies for newly-enabled tables
-- ============================================

-- --------------------------------------------------
-- 5.1 Reference / Lookup Tables
-- Authenticated users can read, only admins can modify
-- --------------------------------------------------

-- role
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.role;
CREATE POLICY "Authenticated can view roles" ON public.role
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage roles" ON public.role;
CREATE POLICY "Admin can manage roles" ON public.role
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- permission
DROP POLICY IF EXISTS "Authenticated can view permissions" ON public.permission;
CREATE POLICY "Authenticated can view permissions" ON public.permission
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage permissions" ON public.permission;
CREATE POLICY "Admin can manage permissions" ON public.permission
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- profile_role
DROP POLICY IF EXISTS "Admin can manage profile roles" ON public.profile_role;
CREATE POLICY "Admin can manage profile roles" ON public.profile_role
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- role_permission
DROP POLICY IF EXISTS "Admin can manage role permissions" ON public.role_permission;
CREATE POLICY "Admin can manage role permissions" ON public.role_permission
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- data_scope_rule
DROP POLICY IF EXISTS "Admin can manage data scope rules" ON public.data_scope_rule;
CREATE POLICY "Admin can manage data scope rules" ON public.data_scope_rule
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- --------------------------------------------------
-- 5.2 Organization (departments, stations, warehouses)
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view departments" ON public.department;
CREATE POLICY "Authenticated can view departments" ON public.department
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage departments" ON public.department;
CREATE POLICY "Admin can manage departments" ON public.department
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

DROP POLICY IF EXISTS "Authenticated can view stations" ON public.station;
CREATE POLICY "Authenticated can view stations" ON public.station
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage stations" ON public.station;
CREATE POLICY "Admin can manage stations" ON public.station
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

DROP POLICY IF EXISTS "Authenticated can view warehouses" ON public.warehouse;
CREATE POLICY "Authenticated can view warehouses" ON public.warehouse
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage warehouses" ON public.warehouse;
CREATE POLICY "Admin can manage warehouses" ON public.warehouse
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- --------------------------------------------------
-- 5.3 Equipment sub-tables
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view equipment categories" ON public.equipment_category;
CREATE POLICY "Authenticated can view equipment categories" ON public.equipment_category
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage equipment categories" ON public.equipment_category;
CREATE POLICY "Admin can manage equipment categories" ON public.equipment_category
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

DROP POLICY IF EXISTS "Authenticated can view equipment models" ON public.equipment_model;
CREATE POLICY "Authenticated can view equipment models" ON public.equipment_model
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage equipment models" ON public.equipment_model;
CREATE POLICY "Admin can manage equipment models" ON public.equipment_model
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

DROP POLICY IF EXISTS "Authenticated can view equipment documents" ON public.equipment_document;
CREATE POLICY "Authenticated can view equipment documents" ON public.equipment_document
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin can manage equipment documents" ON public.equipment_document;
CREATE POLICY "Admin can manage equipment documents" ON public.equipment_document
  FOR ALL USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

DROP POLICY IF EXISTS "Authenticated can view equipment status logs" ON public.equipment_status_log;
CREATE POLICY "Authenticated can view equipment status logs" ON public.equipment_status_log
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view equipment location logs" ON public.equipment_location_log;
CREATE POLICY "Authenticated can view equipment location logs" ON public.equipment_location_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.4 Order / Contract sub-tables
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view order items" ON public.rental_order_item;
CREATE POLICY "Users can view order items" ON public.rental_order_item
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.rental_order
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

DROP POLICY IF EXISTS "Users can view contract items" ON public.rental_contract_item;
CREATE POLICY "Users can view contract items" ON public.rental_contract_item
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

DROP POLICY IF EXISTS "Users can view contract changes" ON public.contract_change_record;
CREATE POLICY "Users can view contract changes" ON public.contract_change_record
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM public.rental_contract
      WHERE created_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
      OR sales_user_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

-- --------------------------------------------------
-- 5.5 Customer sub-tables
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view customer contacts" ON public.customer_contact;
CREATE POLICY "Authenticated can view customer contacts" ON public.customer_contact
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view customer credit" ON public.customer_credit_record;
CREATE POLICY "Authenticated can view customer credit" ON public.customer_credit_record
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.6 Inventory (outbound, inbound, transfer)
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view outbound records" ON public.outbound_record;
CREATE POLICY "Authenticated can view outbound records" ON public.outbound_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view inbound records" ON public.inbound_record;
CREATE POLICY "Authenticated can view inbound records" ON public.inbound_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view equipment transfers" ON public.equipment_transfer;
CREATE POLICY "Authenticated can view equipment transfers" ON public.equipment_transfer
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.7 Return & Settlement
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view return inspections" ON public.return_inspection;
CREATE POLICY "Authenticated can view return inspections" ON public.return_inspection
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view return settlements" ON public.return_settlement;
CREATE POLICY "Authenticated can view return settlements" ON public.return_settlement
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.8 Finance
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view payment records" ON public.payment_record;
CREATE POLICY "Authenticated can view payment records" ON public.payment_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view deposit records" ON public.deposit_record;
CREATE POLICY "Authenticated can view deposit records" ON public.deposit_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view refund records" ON public.refund_record;
CREATE POLICY "Authenticated can view refund records" ON public.refund_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view reconciliation statements" ON public.reconciliation_statement;
CREATE POLICY "Authenticated can view reconciliation statements" ON public.reconciliation_statement
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.9 Maintenance
-- --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view maintenance plans" ON public.maintenance_plan;
CREATE POLICY "Authenticated can view maintenance plans" ON public.maintenance_plan
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view maintenance records" ON public.maintenance_record;
CREATE POLICY "Authenticated can view maintenance records" ON public.maintenance_record
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view spare parts" ON public.spare_part;
CREATE POLICY "Authenticated can view spare parts" ON public.spare_part
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can view stock movements" ON public.spare_part_stock_movement;
CREATE POLICY "Authenticated can view stock movements" ON public.spare_part_stock_movement
  FOR SELECT USING (auth.role() = 'authenticated');

-- --------------------------------------------------
-- 5.10 Approval
-- --------------------------------------------------
DROP POLICY IF EXISTS "Users can view own approvals" ON public.approval_request;
CREATE POLICY "Users can view own approvals" ON public.approval_request
  FOR SELECT USING (
    applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

DROP POLICY IF EXISTS "Users can view approval steps" ON public.approval_step_record;
CREATE POLICY "Users can view approval steps" ON public.approval_step_record
  FOR SELECT USING (
    approval_id IN (
      SELECT id FROM public.approval_request
      WHERE applicant_id IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    )
    OR public.get_current_user_primary_role() = 'SYSTEM_ADMIN'
  );

-- --------------------------------------------------
-- 5.11 Audit Log
-- --------------------------------------------------
DROP POLICY IF EXISTS "Admin can view audit logs" ON public.audit_log;
CREATE POLICY "Admin can view audit logs" ON public.audit_log
  FOR SELECT USING (public.get_current_user_primary_role() = 'SYSTEM_ADMIN');

-- ============================================
-- END OF MIGRATION 0005
-- ============================================
