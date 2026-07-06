-- CR08 database-triggered workflows.
-- These triggers derive alerts, suggestions, cost allocations, notifications and status syncs
-- from persisted business events. Human approval/handling remains in application actions.

DROP POLICY IF EXISTS "cr08 equipment managers update location" ON public.equipment;
CREATE POLICY "cr08 equipment managers update location" ON public.equipment
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')
    )
  );

DROP POLICY IF EXISTS "cr08 insurance allocation finance write" ON public.equipment_insurance_cost_allocation;
CREATE POLICY "cr08 insurance allocation finance write" ON public.equipment_insurance_cost_allocation
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER')
    )
  );

CREATE OR REPLACE FUNCTION public.cr08_notify_roles(
  p_roles text[],
  p_type text,
  p_title text,
  p_content text,
  p_business_type text,
  p_business_id uuid,
  p_action_url text DEFAULT NULL,
  p_level text DEFAULT 'INFO',
  p_dedupe_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.notification (
    recipient_id,
    notification_type,
    type,
    title,
    content,
    business_type,
    business_id,
    action_url,
    level,
    dedupe_key,
    source_event,
    source_module
  )
  SELECT
    p.id,
    p_type,
    p_type,
    p_title,
    p_content,
    p_business_type,
    p_business_id,
    p_action_url,
    p_level,
    CASE WHEN p_dedupe_key IS NULL THEN NULL ELSE p_dedupe_key || ':' || p.id::text END,
    'CR08_TRIGGER',
    'CR08'
  FROM public.profiles p
  WHERE p.account_status = 'ACTIVE'
    AND p.login_enabled = true
    AND p.primary_role = ANY(p_roles)
    AND (p_dedupe_key IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.notification n
      WHERE n.recipient_id = p.id
        AND n.dedupe_key = p_dedupe_key || ':' || p.id::text
    ));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cr08_notify_customer_owner(
  p_customer_id uuid,
  p_type text,
  p_title text,
  p_content text,
  p_business_type text,
  p_business_id uuid,
  p_action_url text DEFAULT NULL,
  p_level text DEFAULT 'INFO',
  p_dedupe_key text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.notification (
    recipient_id,
    notification_type,
    type,
    title,
    content,
    business_type,
    business_id,
    action_url,
    level,
    dedupe_key,
    source_event,
    source_module
  )
  SELECT
    c.owner_user_id,
    p_type,
    p_type,
    p_title,
    p_content,
    p_business_type,
    p_business_id,
    p_action_url,
    p_level,
    CASE WHEN p_dedupe_key IS NULL THEN NULL ELSE p_dedupe_key || ':' || c.owner_user_id::text END,
    'CR08_TRIGGER',
    'CR08'
  FROM public.customer c
  WHERE c.id = p_customer_id
    AND c.owner_user_id IS NOT NULL
    AND (p_dedupe_key IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.notification n
      WHERE n.recipient_id = c.owner_user_id
        AND n.dedupe_key = p_dedupe_key || ':' || c.owner_user_id::text
    ));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cr08_alert_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'ALT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.cr08_work_order_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'WO' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.cr08_suggestion_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'PM' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.cr08_distance_meters(
  p_lat1 numeric,
  p_lon1 numeric,
  p_lat2 numeric,
  p_lon2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371000 * 2 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2)), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians((p_lon2 - p_lon1) / 2)), 2)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.cr08_health_level(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 90 THEN 'EXCELLENT'
    WHEN p_score >= 75 THEN 'GOOD'
    WHEN p_score >= 60 THEN 'FAIR'
    WHEN p_score >= 40 THEN 'POOR'
    ELSE 'HIGH_RISK'
  END;
$$;

CREATE OR REPLACE FUNCTION public.cr08_after_telemetry_upsert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_equipment_no text;
  v_fault_count integer := 0;
  v_health_score integer := 100;
  v_health_level text;
  v_next_due numeric;
  v_remaining numeric;
  v_fence record;
  v_distance numeric;
  v_alert_id uuid;
BEGIN
  SELECT equipment_no INTO v_equipment_no
  FROM public.equipment
  WHERE id = NEW.equipment_id;

  UPDATE public.iot_terminal
  SET last_seen_at = NEW.reported_at,
      status = 'ONLINE',
      updated_at = now()
  WHERE id = NEW.terminal_id;

  UPDATE public.equipment
  SET current_location_type = 'GPS',
      current_location_text = CASE
        WHEN NEW.latitude IS NULL OR NEW.longitude IS NULL THEN current_location_text
        ELSE 'GPS ' || NEW.latitude::text || ', ' || NEW.longitude::text
      END,
      updated_at = now()
  WHERE id = NEW.equipment_id;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    INSERT INTO public.equipment_location_log (
      equipment_id,
      from_location_type,
      to_location_type,
      to_location_text,
      latitude,
      longitude,
      located_at,
      business_type,
      business_id
    )
    VALUES (
      NEW.equipment_id,
      'UNKNOWN',
      'GPS',
      'GPS ' || NEW.latitude::text || ', ' || NEW.longitude::text,
      NEW.latitude,
      NEW.longitude,
      NEW.reported_at,
      'IOT_TELEMETRY',
      NEW.equipment_id
    );
  END IF;

  SELECT jsonb_array_length(COALESCE(NEW.fault_codes, '[]'::jsonb)) INTO v_fault_count;

  IF v_fault_count > 0 AND NOT EXISTS (
    SELECT 1
    FROM public.equipment_alert
    WHERE equipment_id = NEW.equipment_id
      AND alert_type = 'FAULT_CODE'
      AND status IN ('OPEN','ACKNOWLEDGED','PROCESSING')
  ) THEN
    INSERT INTO public.equipment_alert (
      alert_no,
      equipment_id,
      terminal_id,
      alert_type,
      alert_level,
      title,
      content,
      fault_codes,
      occurred_at
    )
    VALUES (
      public.cr08_alert_no(),
      NEW.equipment_id,
      NEW.terminal_id,
      'FAULT_CODE',
      CASE WHEN v_fault_count >= 3 THEN 'CRITICAL' ELSE 'WARNING' END,
      '设备故障码告警',
      '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 上报故障码。',
      NEW.fault_codes,
      NEW.reported_at
    )
    RETURNING id INTO v_alert_id;

    PERFORM public.cr08_notify_roles(
      ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR'],
      'EQUIPMENT_FAULT_CODE_ALERT',
      '设备故障码告警',
      '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 上报故障码，请复核。',
      'EQUIPMENT_ALERT',
      v_alert_id,
      '/equipment/alerts/' || v_alert_id::text,
      'WARNING',
      'fault:' || NEW.equipment_id::text
    );
  END IF;

  IF NEW.hydraulic_pressure IS NOT NULL
     AND (NEW.hydraulic_pressure < 5 OR NEW.hydraulic_pressure > 35)
     AND NOT EXISTS (
       SELECT 1
       FROM public.equipment_alert
       WHERE equipment_id = NEW.equipment_id
         AND alert_type = 'HYDRAULIC_PRESSURE'
         AND status IN ('OPEN','ACKNOWLEDGED','PROCESSING')
     ) THEN
    INSERT INTO public.equipment_alert (
      alert_no,
      equipment_id,
      terminal_id,
      alert_type,
      alert_level,
      title,
      content,
      occurred_at
    )
    VALUES (
      public.cr08_alert_no(),
      NEW.equipment_id,
      NEW.terminal_id,
      'HYDRAULIC_PRESSURE',
      'WARNING',
      '液压压力异常',
      '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 液压压力为 ' || NEW.hydraulic_pressure::text || '。',
      NEW.reported_at
    )
    RETURNING id INTO v_alert_id;

    PERFORM public.cr08_notify_roles(
      ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR'],
      'EQUIPMENT_FAULT_CODE_ALERT',
      '液压压力异常',
      '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 液压压力异常，请检查。',
      'EQUIPMENT_ALERT',
      v_alert_id,
      '/equipment/alerts/' || v_alert_id::text,
      'WARNING',
      'pressure:' || NEW.equipment_id::text
    );
  END IF;

  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    FOR v_fence IN
      SELECT *
      FROM public.equipment_geofence
      WHERE status = 'ACTIVE'
        AND fence_type = 'CIRCLE'
        AND equipment_id = NEW.equipment_id
        AND center_latitude IS NOT NULL
        AND center_longitude IS NOT NULL
        AND radius_meters IS NOT NULL
        AND (effective_start_at IS NULL OR effective_start_at <= NEW.reported_at)
        AND (effective_end_at IS NULL OR effective_end_at >= NEW.reported_at)
    LOOP
      v_distance := public.cr08_distance_meters(
        v_fence.center_latitude,
        v_fence.center_longitude,
        NEW.latitude,
        NEW.longitude
      );

      IF v_distance > v_fence.radius_meters AND NOT EXISTS (
        SELECT 1
        FROM public.equipment_alert
        WHERE equipment_id = NEW.equipment_id
          AND geofence_id = v_fence.id
          AND alert_type = 'GEOFENCE'
          AND status IN ('OPEN','ACKNOWLEDGED','PROCESSING')
      ) THEN
        INSERT INTO public.equipment_alert (
          alert_no,
          equipment_id,
          terminal_id,
          geofence_id,
          alert_type,
          alert_level,
          title,
          content,
          occurred_at
        )
        VALUES (
          public.cr08_alert_no(),
          NEW.equipment_id,
          NEW.terminal_id,
          v_fence.id,
          'GEOFENCE',
          v_fence.alert_level,
          '设备越界告警',
          '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 已离开电子围栏 ' || v_fence.name || '。',
          NEW.reported_at
        )
        RETURNING id INTO v_alert_id;

        PERFORM public.cr08_notify_roles(
          ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR','SALES_MANAGER'],
          'EQUIPMENT_GEOFENCE_ALERT',
          '设备越界告警',
          '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 已离开电子围栏 ' || v_fence.name || '。',
          'EQUIPMENT_ALERT',
          v_alert_id,
          '/equipment/alerts/' || v_alert_id::text,
          v_fence.alert_level,
          'geofence:' || v_fence.id::text || ':' || NEW.equipment_id::text
        );
      END IF;
    END LOOP;
  END IF;

  v_health_score := 100
    - LEAST(30, v_fault_count * 10)
    - CASE WHEN NEW.hydraulic_pressure IS NULL THEN 0 WHEN NEW.hydraulic_pressure < 5 OR NEW.hydraulic_pressure > 35 THEN 15 ELSE 0 END
    - LEAST(20, GREATEST(0, floor(COALESCE(NEW.engine_hours, 0) / 1000))::integer * 5)
    - CASE WHEN NEW.battery_level IS NOT NULL AND NEW.battery_level < 20 THEN 5 ELSE 0 END;
  v_health_score := GREATEST(0, LEAST(100, v_health_score));
  v_health_level := public.cr08_health_level(v_health_score);

  INSERT INTO public.equipment_health_score (
    equipment_id,
    score,
    score_level,
    calculated_at,
    basis
  )
  VALUES (
    NEW.equipment_id,
    v_health_score,
    v_health_level,
    NEW.reported_at,
    jsonb_build_object(
      'fault_count', v_fault_count,
      'engine_hours', NEW.engine_hours,
      'hydraulic_pressure', NEW.hydraulic_pressure,
      'battery_level', NEW.battery_level
    )
  );

  IF COALESCE(NEW.engine_hours, 0) > 0 THEN
    v_next_due := ceil(NEW.engine_hours / 250) * 250;
    IF v_next_due = NEW.engine_hours THEN
      v_remaining := 0;
    ELSE
      v_remaining := v_next_due - NEW.engine_hours;
    END IF;

    IF v_remaining <= 40 AND NOT EXISTS (
      SELECT 1
      FROM public.predictive_maintenance_suggestion
      WHERE equipment_id = NEW.equipment_id
        AND status IN ('OPEN','CONFIRMED')
    ) THEN
      INSERT INTO public.predictive_maintenance_suggestion (
        suggestion_no,
        equipment_id,
        suggestion_type,
        suggested_maintenance_at,
        remaining_hours,
        risk_level,
        reason,
        status
      )
      VALUES (
        public.cr08_suggestion_no(),
        NEW.equipment_id,
        'RUNNING_HOURS',
        now() + interval '7 days',
        v_remaining,
        CASE WHEN v_fault_count > 0 OR v_health_score < 60 THEN 'HIGH' ELSE 'MEDIUM' END,
        '运行小时接近 250 小时保养阈值，建议安排预测性维护。',
        'OPEN'
      )
      RETURNING id INTO v_alert_id;

      PERFORM public.cr08_notify_roles(
        ARRAY['MAINTENANCE_SUPERVISOR','EQUIPMENT_SUPERVISOR'],
        'PREDICTIVE_MAINTENANCE_DUE',
        '预测性维护建议',
        '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 接近保养阈值。',
        'PREDICTIVE_MAINTENANCE',
        v_alert_id,
        '/maintenance/predictive',
        'WARNING',
        'predictive:' || NEW.equipment_id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_telemetry_upsert ON public.equipment_telemetry_latest;
CREATE TRIGGER trg_cr08_after_telemetry_upsert
AFTER INSERT OR UPDATE ON public.equipment_telemetry_latest
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_telemetry_upsert();

CREATE OR REPLACE FUNCTION public.cr08_after_terminal_status_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_binding record;
  v_alert_id uuid;
BEGIN
  IF NEW.status = 'OFFLINE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_binding IN
      SELECT b.equipment_id, e.equipment_no
      FROM public.equipment_iot_binding b
      JOIN public.equipment e ON e.id = b.equipment_id
      WHERE b.terminal_id = NEW.id
        AND b.unbound_at IS NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.equipment_alert
        WHERE terminal_id = NEW.id
          AND equipment_id = v_binding.equipment_id
          AND alert_type = 'TERMINAL_OFFLINE'
          AND status IN ('OPEN','ACKNOWLEDGED','PROCESSING')
      ) THEN
        INSERT INTO public.equipment_alert (
          alert_no,
          equipment_id,
          terminal_id,
          alert_type,
          alert_level,
          title,
          content
        )
        VALUES (
          public.cr08_alert_no(),
          v_binding.equipment_id,
          NEW.id,
          'TERMINAL_OFFLINE',
          'WARNING',
          'IoT 终端离线',
          '设备 ' || v_binding.equipment_no || ' 绑定终端 ' || NEW.terminal_no || ' 已离线。'
        )
        RETURNING id INTO v_alert_id;

        PERFORM public.cr08_notify_roles(
          ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR'],
          'IOT_TERMINAL_OFFLINE',
          'IoT 终端离线',
          '设备 ' || v_binding.equipment_no || ' 绑定终端 ' || NEW.terminal_no || ' 已离线。',
          'EQUIPMENT_ALERT',
          v_alert_id,
          '/equipment/alerts/' || v_alert_id::text,
          'WARNING',
          'terminal-offline:' || NEW.id::text
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_terminal_status_update ON public.iot_terminal;
CREATE TRIGGER trg_cr08_after_terminal_status_update
AFTER UPDATE OF status ON public.iot_terminal
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_terminal_status_update();

CREATE OR REPLACE FUNCTION public.cr08_after_rental_inquiry_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.cr08_notify_roles(
    ARRAY['SALES','SALES_MANAGER'],
    'CUSTOMER_INQUIRY_SUBMITTED',
    '客户提交租赁意向',
    '客户提交了租赁意向 ' || NEW.inquiry_no || '，请及时跟进。',
    'RENTAL_INQUIRY',
    NEW.id,
    '/sales/inquiries/' || NEW.id::text,
    'INFO',
    'inquiry-submitted:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_rental_inquiry_insert ON public.rental_inquiry;
CREATE TRIGGER trg_cr08_after_rental_inquiry_insert
AFTER INSERT ON public.rental_inquiry
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_rental_inquiry_insert();

CREATE OR REPLACE FUNCTION public.cr08_after_payment_voucher_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.cr08_notify_roles(
    ARRAY['FINANCE','FINANCE_MANAGER'],
    'PAYMENT_VOUCHER_SUBMITTED',
    '客户提交付款凭证',
    '客户提交了付款凭证 ' || NEW.voucher_no || '，金额 ' || NEW.amount::text || '。',
    'PAYMENT_VOUCHER',
    NEW.id,
    '/finance/payments',
    'INFO',
    'voucher-submitted:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_payment_voucher_insert ON public.payment_voucher;
CREATE TRIGGER trg_cr08_after_payment_voucher_insert
AFTER INSERT ON public.payment_voucher
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_payment_voucher_insert();

CREATE OR REPLACE FUNCTION public.cr08_after_payment_voucher_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('APPROVED','REJECTED','CONFIRMED') THEN
    PERFORM public.cr08_notify_customer_owner(
      NEW.customer_id,
      'PAYMENT_VOUCHER_' || NEW.status,
      '付款凭证状态更新',
      '您的付款凭证 ' || NEW.voucher_no || ' 状态已更新为 ' || NEW.status || '。',
      'PAYMENT_VOUCHER',
      NEW.id,
      '/customer/bills',
      CASE WHEN NEW.status = 'REJECTED' THEN 'WARNING' ELSE 'SUCCESS' END,
      'voucher-status:' || NEW.id::text || ':' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_payment_voucher_status ON public.payment_voucher;
CREATE TRIGGER trg_cr08_after_payment_voucher_status
AFTER UPDATE OF status ON public.payment_voucher
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_payment_voucher_status();

CREATE OR REPLACE FUNCTION public.cr08_after_customer_repair_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_order_id uuid;
BEGIN
  INSERT INTO public.maintenance_work_order (
    work_order_no,
    equipment_id,
    customer_id,
    reported_by,
    fault_description,
    fault_level,
    status,
    photo_paths,
    remark,
    created_by
  )
  VALUES (
    public.cr08_work_order_no(),
    NEW.equipment_id,
    NEW.customer_id,
    COALESCE(
      NEW.created_by,
      (SELECT id FROM public.profiles WHERE primary_role = 'MAINTENANCE_SUPERVISOR' ORDER BY created_at LIMIT 1),
      (SELECT id FROM public.profiles WHERE account_status = 'ACTIVE' ORDER BY created_at LIMIT 1)
    ),
    NEW.fault_description,
    'NORMAL',
    'PENDING_DISPATCH',
    NEW.photo_urls,
    '客户 Portal 报修自动生成',
    NEW.created_by
  )
  RETURNING id INTO v_work_order_id;

  UPDATE public.customer_repair_request
  SET work_order_id = v_work_order_id,
      status = 'DISPATCHING',
      updated_at = now()
  WHERE id = NEW.id;

  PERFORM public.cr08_notify_roles(
    ARRAY['MAINTENANCE_SUPERVISOR'],
    'CUSTOMER_REPAIR_SUBMITTED',
    '客户提交报修',
    '客户提交了报修单 ' || NEW.request_no || '，系统已生成待派单工单。',
    'CUSTOMER_REPAIR',
    NEW.id,
    '/maintenance/work-orders/' || v_work_order_id::text,
    'WARNING',
    'customer-repair:' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_customer_repair_insert ON public.customer_repair_request;
CREATE TRIGGER trg_cr08_after_customer_repair_insert
AFTER INSERT ON public.customer_repair_request
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_customer_repair_insert();

CREATE OR REPLACE FUNCTION public.cr08_after_work_order_status_for_customer_repair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_repair record;
  v_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := CASE NEW.status
    WHEN 'PENDING_DISPATCH' THEN 'DISPATCHING'
    WHEN 'ASSIGNED' THEN 'DISPATCHED'
    WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    WHEN 'VERIFIED' THEN 'COMPLETED'
    WHEN 'CLOSED' THEN 'CLOSED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE NULL
  END;

  IF v_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customer_repair_request
  SET status = v_status,
      updated_at = now()
  WHERE work_order_id = NEW.id
  RETURNING id, request_no, customer_id INTO v_repair;

  IF v_repair.id IS NOT NULL AND v_status IN ('COMPLETED','CLOSED','CANCELLED') THEN
    PERFORM public.cr08_notify_customer_owner(
      v_repair.customer_id,
      'CUSTOMER_REPAIR_' || v_status,
      '报修进度更新',
      '您的报修单 ' || v_repair.request_no || ' 状态已更新为 ' || v_status || '。',
      'CUSTOMER_REPAIR',
      v_repair.id,
      '/customer/repairs/' || v_repair.id::text,
      CASE WHEN v_status = 'CANCELLED' THEN 'WARNING' ELSE 'SUCCESS' END,
      'customer-repair-status:' || v_repair.id::text || ':' || v_status
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_work_order_status_for_customer_repair ON public.maintenance_work_order;
CREATE TRIGGER trg_cr08_after_work_order_status_for_customer_repair
AFTER UPDATE OF status ON public.maintenance_work_order
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_work_order_status_for_customer_repair();

CREATE OR REPLACE FUNCTION public.cr08_after_contract_sign_task_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contract record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'SIGNED' THEN
    UPDATE public.rental_contract
    SET contract_status = 'SIGNED',
        signed_at = COALESCE(signed_at, now()),
        contract_file_path = COALESCE(NEW.signed_file_url, contract_file_path),
        updated_at = now()
    WHERE id = NEW.contract_id
      AND contract_status IN ('DRAFT','PENDING_SIGN')
    RETURNING contract_no, sales_user_id INTO v_contract;

    IF v_contract.sales_user_id IS NOT NULL THEN
      INSERT INTO public.notification (
        recipient_id,
        notification_type,
        type,
        title,
        content,
        business_type,
        business_id,
        action_url,
        level,
        dedupe_key,
        source_event,
        source_module
      )
      VALUES (
        v_contract.sales_user_id,
        'CONTRACT_SIGN_COMPLETED',
        'CONTRACT_SIGN_COMPLETED',
        '合同签署完成',
        '合同 ' || v_contract.contract_no || ' 已完成电子签署。',
        'CONTRACT',
        NEW.contract_id,
        '/sales/contracts/' || NEW.contract_id::text,
        'SUCCESS',
        'contract-signed:' || NEW.contract_id::text || ':' || v_contract.sales_user_id::text,
        'CR08_TRIGGER',
        'CR08'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_contract_sign_task_status ON public.contract_sign_task;
CREATE TRIGGER trg_cr08_after_contract_sign_task_status
AFTER UPDATE OF status ON public.contract_sign_task
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_contract_sign_task_status();

CREATE OR REPLACE FUNCTION public.cr08_after_insurance_policy_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_months integer;
  v_idx integer;
  v_month date;
  v_amount numeric;
BEGIN
  DELETE FROM public.equipment_insurance_cost_allocation
  WHERE policy_id = NEW.id;

  v_months := GREATEST(
    1,
    (
      (date_part('year', age(NEW.end_date, NEW.start_date))::integer * 12) +
      date_part('month', age(NEW.end_date, NEW.start_date))::integer +
      1
    )
  );
  v_amount := round((NEW.premium_amount / v_months)::numeric, 2);

  FOR v_idx IN 0..(v_months - 1) LOOP
    v_month := (date_trunc('month', NEW.start_date)::date + (v_idx || ' months')::interval)::date;
    IF v_month <= date_trunc('month', NEW.end_date)::date THEN
      INSERT INTO public.equipment_insurance_cost_allocation (
        policy_id,
        equipment_id,
        allocation_month,
        amount
      )
      VALUES (NEW.id, NEW.equipment_id, v_month, v_amount)
      ON CONFLICT (policy_id, allocation_month)
      DO UPDATE SET amount = EXCLUDED.amount;
    END IF;
  END LOOP;

  IF NEW.status = 'ACTIVE' AND NEW.end_date <= current_date + 30 THEN
    PERFORM public.cr08_notify_roles(
      ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','FINANCE','FINANCE_MANAGER'],
      CASE WHEN NEW.end_date < current_date THEN 'INSURANCE_EXPIRED' ELSE 'INSURANCE_EXPIRING' END,
      CASE WHEN NEW.end_date < current_date THEN '设备保险已过期' ELSE '设备保险即将到期' END,
      '保单 ' || NEW.policy_no || ' 到期日为 ' || NEW.end_date::text || '。',
      'INSURANCE_POLICY',
      NEW.id,
      '/finance/insurance/' || NEW.id::text,
      CASE WHEN NEW.end_date < current_date THEN 'ERROR' ELSE 'WARNING' END,
      'insurance-expiry:' || NEW.id::text || ':' || NEW.end_date::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_insurance_policy_insert ON public.equipment_insurance_policy;
CREATE TRIGGER trg_cr08_after_insurance_policy_insert
AFTER INSERT ON public.equipment_insurance_policy
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_insurance_policy_change();

DROP TRIGGER IF EXISTS trg_cr08_after_insurance_policy_update ON public.equipment_insurance_policy;
CREATE TRIGGER trg_cr08_after_insurance_policy_update
AFTER UPDATE OF premium_amount, start_date, end_date, status ON public.equipment_insurance_policy
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_insurance_policy_change();

CREATE OR REPLACE FUNCTION public.cr08_after_insurance_claim_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.cr08_notify_roles(
      ARRAY['FINANCE','FINANCE_MANAGER','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR'],
      'INSURANCE_CLAIM_UPDATED',
      '保险理赔状态更新',
      '理赔单 ' || NEW.claim_no || ' 状态为 ' || NEW.status || '。',
      'INSURANCE_CLAIM',
      NEW.id,
      '/finance/insurance/claims/' || NEW.id::text,
      'INFO',
      'claim-status:' || NEW.id::text || ':' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cr08_after_insurance_claim_insert ON public.equipment_insurance_claim;
CREATE TRIGGER trg_cr08_after_insurance_claim_insert
AFTER INSERT ON public.equipment_insurance_claim
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_insurance_claim_status();

DROP TRIGGER IF EXISTS trg_cr08_after_insurance_claim_status ON public.equipment_insurance_claim;
CREATE TRIGGER trg_cr08_after_insurance_claim_status
AFTER UPDATE OF status ON public.equipment_insurance_claim
FOR EACH ROW
EXECUTE FUNCTION public.cr08_after_insurance_claim_status();

CREATE OR REPLACE FUNCTION public.cr08_scan_insurance_expiry()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT id, policy_no, end_date
    FROM public.equipment_insurance_policy
    WHERE status = 'ACTIVE'
      AND end_date <= current_date + 30
  LOOP
    v_count := v_count + public.cr08_notify_roles(
      ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','FINANCE','FINANCE_MANAGER'],
      CASE WHEN v_policy.end_date < current_date THEN 'INSURANCE_EXPIRED' ELSE 'INSURANCE_EXPIRING' END,
      CASE WHEN v_policy.end_date < current_date THEN '设备保险已过期' ELSE '设备保险即将到期' END,
      '保单 ' || v_policy.policy_no || ' 到期日为 ' || v_policy.end_date::text || '。',
      'INSURANCE_POLICY',
      v_policy.id,
      '/finance/insurance/' || v_policy.id::text,
      CASE WHEN v_policy.end_date < current_date THEN 'ERROR' ELSE 'WARNING' END,
      'insurance-scan:' || v_policy.id::text || ':' || current_date::text
    );
  END LOOP;

  RETURN v_count;
END;
$$;
