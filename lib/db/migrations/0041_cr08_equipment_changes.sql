-- CR08 equipment change objects: IoT, customer portal, insurance and utilization.

CREATE TABLE IF NOT EXISTS public.iot_terminal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_no VARCHAR(80) NOT NULL UNIQUE,
  terminal_type VARCHAR(50) NOT NULL DEFAULT 'GPS',
  vendor VARCHAR(120),
  protocol VARCHAR(80),
  sim_no VARCHAR(80),
  installed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.equipment_iot_binding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  terminal_id UUID NOT NULL REFERENCES public.iot_terminal(id),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unbound_at TIMESTAMPTZ,
  bind_reason TEXT,
  unbind_reason TEXT,
  created_by UUID REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_iot_binding_one_active_terminal
  ON public.equipment_iot_binding(terminal_id)
  WHERE unbound_at IS NULL;

CREATE TABLE IF NOT EXISTS public.equipment_telemetry_latest (
  equipment_id UUID PRIMARY KEY REFERENCES public.equipment(id),
  terminal_id UUID REFERENCES public.iot_terminal(id),
  reported_at TIMESTAMPTZ NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  engine_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_consumption DECIMAL(12,2) NOT NULL DEFAULT 0,
  hydraulic_pressure DECIMAL(12,2),
  fault_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  battery_level DECIMAL(5,2),
  signal_strength DECIMAL(5,2),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_geofence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  fence_type VARCHAR(30) NOT NULL DEFAULT 'CIRCLE',
  equipment_id UUID REFERENCES public.equipment(id),
  contract_id UUID REFERENCES public.rental_contract(id),
  center_latitude DECIMAL(10,7),
  center_longitude DECIMAL(10,7),
  radius_meters INTEGER,
  polygon JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_start_at TIMESTAMPTZ,
  effective_end_at TIMESTAMPTZ,
  alert_level VARCHAR(30) NOT NULL DEFAULT 'WARNING',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.equipment_alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_no VARCHAR(60) NOT NULL UNIQUE,
  equipment_id UUID REFERENCES public.equipment(id),
  terminal_id UUID REFERENCES public.iot_terminal(id),
  geofence_id UUID REFERENCES public.equipment_geofence(id),
  alert_type VARCHAR(50) NOT NULL,
  alert_level VARCHAR(30) NOT NULL DEFAULT 'WARNING',
  title VARCHAR(200) NOT NULL,
  content TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  fault_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  handler_id UUID REFERENCES public.profiles(id),
  handling_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.predictive_maintenance_suggestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_no VARCHAR(60) NOT NULL UNIQUE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  suggestion_type VARCHAR(80) NOT NULL DEFAULT 'MAINTENANCE',
  suggested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suggested_maintenance_at TIMESTAMPTZ,
  remaining_hours DECIMAL(12,2),
  risk_level VARCHAR(30) NOT NULL DEFAULT 'MEDIUM',
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  confirmed_by UUID REFERENCES public.profiles(id),
  confirmed_at TIMESTAMPTZ,
  work_order_id UUID REFERENCES public.maintenance_work_order(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_health_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  score_level VARCHAR(30) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_inquiry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_no VARCHAR(60) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customer(id),
  contact_name VARCHAR(120),
  contact_phone VARCHAR(80),
  project_location TEXT,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  estimated_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  remark TEXT,
  converted_order_id UUID REFERENCES public.rental_order(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.rental_inquiry_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.rental_inquiry(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES public.equipment(id),
  equipment_model_id UUID REFERENCES public.equipment_model(id),
  equipment_name VARCHAR(300),
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  estimated_unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  estimated_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_sign_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.rental_contract(id),
  provider VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
  external_task_id VARCHAR(120),
  sign_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  signed_file_url TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_voucher (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no VARCHAR(60) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customer(id),
  receivable_id UUID REFERENCES public.receivable(id),
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
  bank_flow_no VARCHAR(120),
  file_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  review_comment TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.customer_repair_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no VARCHAR(60) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customer(id),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  fault_description TEXT NOT NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  work_order_id UUID REFERENCES public.maintenance_work_order(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.equipment_insurance_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_no VARCHAR(100) NOT NULL UNIQUE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  insurer_name VARCHAR(200) NOT NULL,
  insurance_type VARCHAR(80) NOT NULL,
  insured_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  premium_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  attachment_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  CHECK (end_date > start_date),
  CHECK (premium_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.equipment_insurance_claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no VARCHAR(60) NOT NULL UNIQUE,
  policy_id UUID REFERENCES public.equipment_insurance_policy(id),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  accident_date DATE NOT NULL,
  accident_location TEXT,
  accident_reason TEXT,
  assessed_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  claim_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  material_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.equipment_insurance_cost_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.equipment_insurance_policy(id),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  allocation_month DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id, allocation_month)
);

CREATE TABLE IF NOT EXISTS public.equipment_utilization_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  category_id UUID,
  model_id UUID,
  station_id UUID,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  calendar_days INTEGER NOT NULL DEFAULT 0,
  rented_days INTEGER NOT NULL DEFAULT 0,
  maintenance_days INTEGER NOT NULL DEFAULT 0,
  nominal_utilization DECIMAL(8,4) NOT NULL DEFAULT 0,
  available_utilization DECIMAL(8,4) NOT NULL DEFAULT 0,
  revenue_realization DECIMAL(8,4) NOT NULL DEFAULT 0,
  actual_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  theoretical_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  diagnosis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utilization_diagnosis_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name VARCHAR(120) NOT NULL,
  condition_key VARCHAR(80) NOT NULL,
  diagnosis TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.iot_terminal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_iot_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_telemetry_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_geofence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictive_maintenance_suggestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_health_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_inquiry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_inquiry_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sign_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_voucher ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_repair_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_insurance_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_insurance_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_insurance_cost_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_utilization_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilization_diagnosis_rule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr08 internal iot terminal" ON public.iot_terminal
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')));

CREATE POLICY "cr08 internal equipment iot" ON public.equipment_iot_binding
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')));

CREATE POLICY "cr08 internal telemetry" ON public.equipment_telemetry_latest
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE','MAINTENANCE_SUPERVISOR','SALES','SALES_MANAGER')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')));

CREATE POLICY "cr08 internal geofence alert" ON public.equipment_geofence
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')));

CREATE POLICY "cr08 internal equipment alerts" ON public.equipment_alert
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE','MAINTENANCE_SUPERVISOR','SALES_MANAGER')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')));

CREATE POLICY "cr08 predictive internal" ON public.predictive_maintenance_suggestion
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','MAINTENANCE','MAINTENANCE_SUPERVISOR','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','MAINTENANCE_SUPERVISOR','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')));

CREATE POLICY "cr08 health internal read" ON public.equipment_health_score
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role <> 'CUSTOMER'));
CREATE POLICY "cr08 health internal write" ON public.equipment_health_score
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','MAINTENANCE_SUPERVISOR')));

CREATE POLICY "cr08 inquiry staff or owner" ON public.rental_inquiry
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','SALES','SALES_MANAGER'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = rental_inquiry.customer_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','SALES','SALES_MANAGER'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = rental_inquiry.customer_id)
  );

CREATE POLICY "cr08 inquiry item via parent" ON public.rental_inquiry_item
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_inquiry ri WHERE ri.id = rental_inquiry_item.inquiry_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rental_inquiry ri WHERE ri.id = rental_inquiry_item.inquiry_id));

CREATE POLICY "cr08 sign task staff or contract customer" ON public.contract_sign_task
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','SALES','SALES_MANAGER'))
    OR EXISTS (
      SELECT 1 FROM public.rental_contract rc
      JOIN public.customer c ON c.id = rc.customer_id
      JOIN public.profiles p ON p.id = c.owner_user_id
      WHERE rc.id = contract_sign_task.contract_id AND p.supabase_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','SALES','SALES_MANAGER')));

CREATE POLICY "cr08 voucher staff or owner" ON public.payment_voucher
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = payment_voucher.customer_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = payment_voucher.customer_id)
  );

CREATE POLICY "cr08 repair staff or owner" ON public.customer_repair_request
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','MAINTENANCE','MAINTENANCE_SUPERVISOR'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = customer_repair_request.customer_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','MAINTENANCE','MAINTENANCE_SUPERVISOR'))
    OR EXISTS (SELECT 1 FROM public.profiles p JOIN public.customer c ON c.owner_user_id = p.id WHERE p.supabase_user_id = (SELECT auth.uid()) AND c.id = customer_repair_request.customer_id)
  );

CREATE POLICY "cr08 insurance staff policy" ON public.equipment_insurance_policy
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER')));

CREATE POLICY "cr08 insurance staff claim" ON public.equipment_insurance_claim
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER','EQUIPMENT_MANAGER')));

CREATE POLICY "cr08 insurance allocation staff" ON public.equipment_insurance_cost_allocation
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','FINANCE','FINANCE_MANAGER')));

CREATE POLICY "cr08 utilization staff" ON public.equipment_utilization_snapshot
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role <> 'CUSTOMER'));
CREATE POLICY "cr08 utilization staff insert" ON public.equipment_utilization_snapshot
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role IN ('SYSTEM_ADMIN','EQUIPMENT_MANAGER','EQUIPMENT_SUPERVISOR','FINANCE_MANAGER')));

CREATE POLICY "cr08 diagnosis staff" ON public.utilization_diagnosis_rule
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.supabase_user_id = (SELECT auth.uid()) AND p.primary_role <> 'CUSTOMER'));
