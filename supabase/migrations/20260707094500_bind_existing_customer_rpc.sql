-- Bind an existing customer record to the current authenticated customer account.
-- Kept in a separate migration because 20260707093000 may already be applied.

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

NOTIFY pgrst, 'reload schema';
