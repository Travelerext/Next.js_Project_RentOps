-- Customer self-service RLS and table privileges.
-- This migration is intentionally idempotent so a rebuilt Supabase database
-- gets the same Data API grants and RLS policies as the existing app expects.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer TO authenticated;
GRANT SELECT ON public.rental_order TO authenticated;
GRANT SELECT ON public.rental_order_item TO authenticated;
GRANT SELECT ON public.rental_contract TO authenticated;
GRANT SELECT ON public.rental_contract_item TO authenticated;
GRANT SELECT ON public.receivable TO authenticated;
GRANT SELECT ON public.deposit_record TO authenticated;
GRANT SELECT ON public.payment_record TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoice_record TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_voucher TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rental_inquiry TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rental_inquiry_item TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_repair_request TO authenticated;
GRANT SELECT, INSERT ON public.maintenance_work_order TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification TO authenticated;

CREATE OR REPLACE FUNCTION public.rentops_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.supabase_user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.rentops_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.primary_role
  FROM public.profiles p
  WHERE p.supabase_user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.rentops_current_profile_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rentops_current_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rentops_current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rentops_current_role() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_contract_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_voucher ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_inquiry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_inquiry_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_repair_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_work_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (supabase_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (supabase_user_id = (SELECT auth.uid()))
  WITH CHECK (supabase_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view customers" ON public.customer;
DROP POLICY IF EXISTS "Authenticated can insert customers" ON public.customer;
DROP POLICY IF EXISTS "Admin can update customers" ON public.customer;
DROP POLICY IF EXISTS "Customer self service customers select" ON public.customer;
DROP POLICY IF EXISTS "Customer self service customers insert" ON public.customer;
DROP POLICY IF EXISTS "Customer self service customers update" ON public.customer;
CREATE POLICY "Customer self service customers select" ON public.customer
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_user_id = public.rentops_current_profile_id()
      OR public.rentops_current_role() <> 'CUSTOMER'
    )
  );
CREATE POLICY "Customer self service customers insert" ON public.customer
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = public.rentops_current_profile_id()
    OR public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER', 'GENERAL_MANAGER')
  );
CREATE POLICY "Customer self service customers update" ON public.customer
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_user_id = public.rentops_current_profile_id()
      OR public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER', 'FINANCE', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      owner_user_id = public.rentops_current_profile_id()
      OR public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER', 'FINANCE', 'FINANCE_MANAGER', 'GENERAL_MANAGER')
    )
  );

DROP POLICY IF EXISTS "Users can view own orders" ON public.rental_order;
DROP POLICY IF EXISTS "Customer self service orders select" ON public.rental_order;
CREATE POLICY "Customer self service orders select" ON public.rental_order
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.rentops_current_role() <> 'CUSTOMER'
      OR EXISTS (
        SELECT 1
        FROM public.customer c
        WHERE c.id = rental_order.customer_id
          AND c.owner_user_id = public.rentops_current_profile_id()
          AND c.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can view order items" ON public.rental_order_item;
DROP POLICY IF EXISTS "Customer self service order items select" ON public.rental_order_item;
CREATE POLICY "Customer self service order items select" ON public.rental_order_item
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.rental_order ro
      JOIN public.customer c ON c.id = ro.customer_id
      WHERE ro.id = rental_order_item.order_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND ro.deleted_at IS NULL
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view own contracts" ON public.rental_contract;
DROP POLICY IF EXISTS "Customer self service contracts select" ON public.rental_contract;
CREATE POLICY "Customer self service contracts select" ON public.rental_contract
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.rentops_current_role() <> 'CUSTOMER'
      OR EXISTS (
        SELECT 1
        FROM public.customer c
        WHERE c.id = rental_contract.customer_id
          AND c.owner_user_id = public.rentops_current_profile_id()
          AND c.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Users can view contract items" ON public.rental_contract_item;
DROP POLICY IF EXISTS "Customer self service contract items select" ON public.rental_contract_item;
CREATE POLICY "Customer self service contract items select" ON public.rental_contract_item
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.rental_contract rc
      JOIN public.customer c ON c.id = rc.customer_id
      WHERE rc.id = rental_contract_item.contract_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND rc.deleted_at IS NULL
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view receivables" ON public.receivable;
DROP POLICY IF EXISTS "Customer self service receivables select" ON public.receivable;
CREATE POLICY "Customer self service receivables select" ON public.receivable
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = receivable.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view deposits" ON public.deposit_record;
DROP POLICY IF EXISTS "Customer self service deposits select" ON public.deposit_record;
CREATE POLICY "Customer self service deposits select" ON public.deposit_record
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = deposit_record.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view payments" ON public.payment_record;
DROP POLICY IF EXISTS "Customer self service payments select" ON public.payment_record;
CREATE POLICY "Customer self service payments select" ON public.payment_record
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = payment_record.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view invoices" ON public.invoice_record;
DROP POLICY IF EXISTS "Finance can create invoices" ON public.invoice_record;
DROP POLICY IF EXISTS "Finance can update invoices" ON public.invoice_record;
DROP POLICY IF EXISTS "Customer self service invoices select" ON public.invoice_record;
DROP POLICY IF EXISTS "Customer self service invoices insert" ON public.invoice_record;
DROP POLICY IF EXISTS "Customer self service invoices update" ON public.invoice_record;
CREATE POLICY "Customer self service invoices select" ON public.invoice_record
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = invoice_record.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );
CREATE POLICY "Customer self service invoices insert" ON public.invoice_record
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER', 'SALES', 'SALES_MANAGER', 'GENERAL_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = invoice_record.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );
CREATE POLICY "Customer self service invoices update" ON public.invoice_record
  FOR UPDATE TO authenticated
  USING (public.rentops_current_role() IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER'))
  WITH CHECK (public.rentops_current_role() IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER'));

DROP POLICY IF EXISTS "Equipment operations voucher staff or owner" ON public.payment_voucher;
DROP POLICY IF EXISTS "Customer self service payment vouchers all" ON public.payment_voucher;
CREATE POLICY "Customer self service payment vouchers all" ON public.payment_voucher
  FOR ALL TO authenticated
  USING (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = payment_voucher.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = payment_voucher.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Equipment operations inquiry staff or owner" ON public.rental_inquiry;
DROP POLICY IF EXISTS "Customer self service inquiries all" ON public.rental_inquiry;
CREATE POLICY "Customer self service inquiries all" ON public.rental_inquiry
  FOR ALL TO authenticated
  USING (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = rental_inquiry.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = rental_inquiry.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Equipment operations inquiry item via parent" ON public.rental_inquiry_item;
DROP POLICY IF EXISTS "Customer self service inquiry items all" ON public.rental_inquiry_item;
CREATE POLICY "Customer self service inquiry items all" ON public.rental_inquiry_item
  FOR ALL TO authenticated
  USING (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.rental_inquiry ri
      JOIN public.customer c ON c.id = ri.customer_id
      WHERE ri.id = rental_inquiry_item.inquiry_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'SALES', 'SALES_MANAGER')
    OR EXISTS (
      SELECT 1
      FROM public.rental_inquiry ri
      JOIN public.customer c ON c.id = ri.customer_id
      WHERE ri.id = rental_inquiry_item.inquiry_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Equipment operations repair staff or owner" ON public.customer_repair_request;
DROP POLICY IF EXISTS "Customer self service repairs all" ON public.customer_repair_request;
CREATE POLICY "Customer self service repairs all" ON public.customer_repair_request
  FOR ALL TO authenticated
  USING (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = customer_repair_request.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = customer_repair_request.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view own work orders" ON public.maintenance_work_order;
DROP POLICY IF EXISTS "Customer self service work orders select" ON public.maintenance_work_order;
DROP POLICY IF EXISTS "Customer self service work orders insert" ON public.maintenance_work_order;
CREATE POLICY "Customer self service work orders select" ON public.maintenance_work_order
  FOR SELECT TO authenticated
  USING (
    public.rentops_current_role() <> 'CUSTOMER'
    OR reported_by = public.rentops_current_profile_id()
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = maintenance_work_order.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );
CREATE POLICY "Customer self service work orders insert" ON public.maintenance_work_order
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rentops_current_role() IN ('SYSTEM_ADMIN', 'MAINTENANCE', 'MAINTENANCE_SUPERVISOR')
    OR EXISTS (
      SELECT 1
      FROM public.customer c
      WHERE c.id = maintenance_work_order.customer_id
        AND c.owner_user_id = public.rentops_current_profile_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification;
DROP POLICY IF EXISTS "Users can update own read state" ON public.notification;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notification;
CREATE POLICY "Users can view own notifications" ON public.notification
  FOR SELECT TO authenticated
  USING (recipient_id = public.rentops_current_profile_id());
CREATE POLICY "Users can update own read state" ON public.notification
  FOR UPDATE TO authenticated
  USING (recipient_id = public.rentops_current_profile_id())
  WITH CHECK (recipient_id = public.rentops_current_profile_id());
CREATE POLICY "Authenticated can insert notifications" ON public.notification
  FOR INSERT TO authenticated
  WITH CHECK (public.rentops_current_profile_id() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.bind_existing_customer_to_current_user(
  p_customer_no text,
  p_contact_phone text DEFAULT NULL,
  p_tax_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_role text;
  v_customer record;
  v_customer_no text;
  v_phone text;
  v_tax_no text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '未登录');
  END IF;

  SELECT p.id, p.primary_role
  INTO v_profile_id, v_role
  FROM public.profiles p
  WHERE p.supabase_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '用户档案不存在');
  END IF;

  IF v_role IS DISTINCT FROM 'CUSTOMER' THEN
    RETURN jsonb_build_object('success', false, 'error', '仅客户账号可绑定客户资料');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer c
    WHERE c.owner_user_id = v_profile_id
      AND c.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '当前账号已经绑定客户资料');
  END IF;

  v_customer_no := upper(
    regexp_replace(
      translate(coalesce(p_customer_no, ''), '‐‑‒–—―−﹘﹣－', '----------'),
      '[-\s]+',
      '',
      'g'
    )
  );
  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  v_tax_no := upper(regexp_replace(coalesce(p_tax_no, ''), '\s+', '', 'g'));

  IF length(v_customer_no) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '客户编号不能为空');
  END IF;

  IF length(v_phone) = 0 AND length(v_tax_no) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '请填写联系电话或纳税人识别号用于校验');
  END IF;

  SELECT c.id, c.owner_user_id, c.contact_phone, c.tax_no
  INTO v_customer
  FROM public.customer c
  WHERE c.deleted_at IS NULL
    AND upper(
      regexp_replace(
        translate(coalesce(c.customer_no, ''), '‐‑‒–—―−﹘﹣－', '----------'),
        '[-\s]+',
        '',
        'g'
      )
    ) = v_customer_no
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '未找到匹配的客户编号，请确认编号完整且未被删除');
  END IF;

  IF v_customer.owner_user_id IS NOT NULL AND v_customer.owner_user_id <> v_profile_id THEN
    RETURN jsonb_build_object('success', false, 'error', '该客户资料已绑定其他账号');
  END IF;

  IF NOT (
    (length(v_phone) > 0 AND v_phone = regexp_replace(coalesce(v_customer.contact_phone, ''), '\D', '', 'g'))
    OR
    (length(v_tax_no) > 0 AND v_tax_no = upper(regexp_replace(coalesce(v_customer.tax_no, ''), '\s+', '', 'g')))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '客户编号与联系电话/税号不匹配');
  END IF;

  UPDATE public.customer
  SET owner_user_id = v_profile_id,
      updated_by = v_profile_id,
      updated_at = now()
  WHERE id = v_customer.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.bind_existing_customer_to_current_user(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_existing_customer_to_current_user(text, text, text) TO authenticated;
