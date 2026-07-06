-- Move interactive workflows back to Server Actions.
-- Database triggers are kept only for telemetry-derived equipment signals.

DROP TRIGGER IF EXISTS trg_cr08_after_telemetry_upsert ON public.equipment_telemetry_latest;
DROP TRIGGER IF EXISTS trg_cr08_after_terminal_status_update ON public.iot_terminal;
DROP TRIGGER IF EXISTS trg_cr08_after_rental_inquiry_insert ON public.rental_inquiry;
DROP TRIGGER IF EXISTS trg_cr08_after_payment_voucher_insert ON public.payment_voucher;
DROP TRIGGER IF EXISTS trg_cr08_after_payment_voucher_status ON public.payment_voucher;
DROP TRIGGER IF EXISTS trg_cr08_after_customer_repair_insert ON public.customer_repair_request;
DROP TRIGGER IF EXISTS trg_cr08_after_work_order_status_for_customer_repair ON public.maintenance_work_order;
DROP TRIGGER IF EXISTS trg_cr08_after_contract_sign_task_status ON public.contract_sign_task;
DROP TRIGGER IF EXISTS trg_cr08_after_insurance_policy_insert ON public.equipment_insurance_policy;
DROP TRIGGER IF EXISTS trg_cr08_after_insurance_policy_update ON public.equipment_insurance_policy;
DROP TRIGGER IF EXISTS trg_cr08_after_insurance_claim_insert ON public.equipment_insurance_claim;
DROP TRIGGER IF EXISTS trg_cr08_after_insurance_claim_status ON public.equipment_insurance_claim;
DROP TRIGGER IF EXISTS trg_operations_after_telemetry_upsert ON public.equipment_telemetry_latest;
DROP TRIGGER IF EXISTS trg_operations_after_terminal_status_update ON public.iot_terminal;
DROP TRIGGER IF EXISTS trg_return_request_approval ON public.return_request;
DROP TRIGGER IF EXISTS trg_inbound_advance_return ON public.inbound_record;
DROP TRIGGER IF EXISTS trg_contract_terminate_reset_equipment ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_contract_terminated ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_contract_terminated_inspection ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_inbound_inspection ON public.inbound_record;
DROP TRIGGER IF EXISTS trg_receivable_paid_complete_settlement ON public.receivable;
DROP TRIGGER IF EXISTS trg_refund_complete_settlement ON public.refund_record;

DROP FUNCTION IF EXISTS public.cr08_after_telemetry_upsert();
DROP FUNCTION IF EXISTS public.cr08_after_terminal_status_update();
DROP FUNCTION IF EXISTS public.cr08_after_rental_inquiry_insert();
DROP FUNCTION IF EXISTS public.cr08_after_payment_voucher_insert();
DROP FUNCTION IF EXISTS public.cr08_after_payment_voucher_status();
DROP FUNCTION IF EXISTS public.cr08_after_customer_repair_insert();
DROP FUNCTION IF EXISTS public.cr08_after_work_order_status_for_customer_repair();
DROP FUNCTION IF EXISTS public.cr08_after_contract_sign_task_status();
DROP FUNCTION IF EXISTS public.cr08_after_insurance_policy_change();
DROP FUNCTION IF EXISTS public.cr08_after_insurance_claim_status();
DROP FUNCTION IF EXISTS public.cr08_scan_insurance_expiry();
DROP FUNCTION IF EXISTS public.cr08_notify_roles(text[], text, text, text, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.cr08_notify_customer_owner(uuid, text, text, text, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.cr08_alert_no();
DROP FUNCTION IF EXISTS public.cr08_work_order_no();
DROP FUNCTION IF EXISTS public.cr08_suggestion_no();
DROP FUNCTION IF EXISTS public.cr08_distance_meters(numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.cr08_health_level(integer);
DROP FUNCTION IF EXISTS public.notify_return_approval();
DROP FUNCTION IF EXISTS public.trg_advance_return_on_inbound();
DROP FUNCTION IF EXISTS public.trg_reset_equipment_on_contract_terminate();
DROP FUNCTION IF EXISTS public.trg_complete_settlement_on_payment();
DROP FUNCTION IF EXISTS public.trg_complete_settlement_on_refund();
DROP FUNCTION IF EXISTS public.trg_contract_terminated();
DROP FUNCTION IF EXISTS public.trg_inbound_inspection();
DROP FUNCTION IF EXISTS public.trg_contract_terminated_generate_inspections();
DROP FUNCTION IF EXISTS public.trg_inbound_generate_inspections();
DROP FUNCTION IF EXISTS public.create_inspection_if_terminated(uuid);
DROP FUNCTION IF EXISTS public.generate_inspections_for_contract(uuid);

DROP POLICY IF EXISTS "cr08 equipment managers update location" ON public.equipment;
DROP POLICY IF EXISTS "cr08 insurance allocation finance write" ON public.equipment_insurance_cost_allocation;
DROP POLICY IF EXISTS "equipment managers update location" ON public.equipment;
DROP POLICY IF EXISTS "insurance allocation finance write" ON public.equipment_insurance_cost_allocation;

CREATE POLICY "equipment managers update location" ON public.equipment
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

CREATE POLICY "insurance allocation finance write" ON public.equipment_insurance_cost_allocation
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

CREATE OR REPLACE FUNCTION public.operations_notify_roles(
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
    'DB_TRIGGER',
    'EQUIPMENT_TELEMETRY'
  FROM public.profiles p
  WHERE p.account_status = 'ACTIVE'
    AND p.login_enabled = true
    AND p.primary_role = ANY(p_roles)
    AND (
      p_dedupe_key IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.notification n
        WHERE n.recipient_id = p.id
          AND n.dedupe_key = p_dedupe_key || ':' || p.id::text
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.equipment_alert_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'ALT' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.predictive_suggestion_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'PM' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || upper(substr(md5(random()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.equipment_distance_meters(
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

CREATE OR REPLACE FUNCTION public.equipment_health_level(p_score integer)
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

CREATE OR REPLACE FUNCTION public.operations_after_telemetry_upsert()
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
      public.equipment_alert_no(),
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

    PERFORM public.operations_notify_roles(
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
      public.equipment_alert_no(),
      NEW.equipment_id,
      NEW.terminal_id,
      'HYDRAULIC_PRESSURE',
      'WARNING',
      '液压压力异常',
      '设备 ' || COALESCE(v_equipment_no, NEW.equipment_id::text) || ' 液压压力为 ' || NEW.hydraulic_pressure::text || '。',
      NEW.reported_at
    )
    RETURNING id INTO v_alert_id;

    PERFORM public.operations_notify_roles(
      ARRAY['EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR'],
      'EQUIPMENT_HYDRAULIC_PRESSURE_ALERT',
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
      v_distance := public.equipment_distance_meters(
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
          public.equipment_alert_no(),
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

        PERFORM public.operations_notify_roles(
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
  v_health_level := public.equipment_health_level(v_health_score);

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
        public.predictive_suggestion_no(),
        NEW.equipment_id,
        'RUNNING_HOURS',
        now() + interval '7 days',
        v_remaining,
        CASE WHEN v_fault_count > 0 OR v_health_score < 60 THEN 'HIGH' ELSE 'MEDIUM' END,
        '运行小时接近 250 小时保养阈值，建议安排预测性维护。',
        'OPEN'
      )
      RETURNING id INTO v_alert_id;

      PERFORM public.operations_notify_roles(
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

CREATE TRIGGER trg_operations_after_telemetry_upsert
AFTER INSERT OR UPDATE ON public.equipment_telemetry_latest
FOR EACH ROW
EXECUTE FUNCTION public.operations_after_telemetry_upsert();

CREATE OR REPLACE FUNCTION public.operations_after_terminal_status_update()
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
          public.equipment_alert_no(),
          v_binding.equipment_id,
          NEW.id,
          'TERMINAL_OFFLINE',
          'WARNING',
          'IoT 终端离线',
          '设备 ' || v_binding.equipment_no || ' 绑定终端 ' || NEW.terminal_no || ' 已离线。'
        )
        RETURNING id INTO v_alert_id;

        PERFORM public.operations_notify_roles(
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

CREATE TRIGGER trg_operations_after_terminal_status_update
AFTER UPDATE OF status ON public.iot_terminal
FOR EACH ROW
EXECUTE FUNCTION public.operations_after_terminal_status_update();
