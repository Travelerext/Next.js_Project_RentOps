-- ============================================
-- Equipment Rental Management System
-- Initial Database Migration for Supabase PostgreSQL
-- ============================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================
-- PROFILES & AUTH
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no     VARCHAR(50) UNIQUE,
  username        VARCHAR(100) UNIQUE NOT NULL,
  display_name    VARCHAR(200) NOT NULL,
  real_name       VARCHAR(200),
  phone           VARCHAR(50),
  email           VARCHAR(255),
  account_type    VARCHAR(50) NOT NULL DEFAULT 'INTERNAL_STAFF',
  account_status  VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  login_enabled   BOOLEAN NOT NULL DEFAULT false,
  department_id   UUID,
  station_id      UUID,
  warehouse_id    UUID,
  primary_role    VARCHAR(50),
  default_dashboard VARCHAR(50) NOT NULL DEFAULT 'SALES_DASHBOARD',
  last_login_at   TIMESTAMPTZ,
  last_login_ip   VARCHAR(50),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (supabase_user_id, username, display_name, email, login_enabled, account_status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, false, 'PENDING');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ROLES & PERMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.role (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code       VARCHAR(50) UNIQUE NOT NULL,
  role_name       VARCHAR(100) NOT NULL,
  role_type       VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
  description     TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permission (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_code   VARCHAR(100) UNIQUE NOT NULL,
  permission_name   VARCHAR(200) NOT NULL,
  module_code       VARCHAR(50) NOT NULL,
  permission_type   VARCHAR(50) NOT NULL DEFAULT 'MENU',
  description       TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  sensitive         BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_role (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
  UNIQUE(profile_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.role_permission (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permission(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.data_scope_rule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type   VARCHAR(50) NOT NULL,
  scope_type      VARCHAR(50) NOT NULL DEFAULT 'ALL',
  scope_value     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ORGANIZATION
-- ============================================
CREATE TABLE IF NOT EXISTS public.department (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  parent_id   UUID REFERENCES public.department(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.station (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  address     TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warehouse (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  station_id  UUID REFERENCES public.station(id),
  address     TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CUSTOMER
-- ============================================
CREATE TABLE IF NOT EXISTS public.customer (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no             VARCHAR(50) UNIQUE NOT NULL,
  name                    VARCHAR(300) NOT NULL,
  short_name              VARCHAR(100),
  contact_name            VARCHAR(200),
  contact_phone           VARCHAR(50),
  tax_no                  VARCHAR(50),
  invoice_title           VARCHAR(300),
  invoice_address_phone   TEXT,
  invoice_bank_account    TEXT,
  customer_type           VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE',
  credit_level            VARCHAR(10) NOT NULL DEFAULT 'B',
  credit_limit            DECIMAL(15,2) NOT NULL DEFAULT 0,
  risk_level              VARCHAR(50) NOT NULL DEFAULT 'LOW',
  is_blacklisted          BOOLEAN NOT NULL DEFAULT false,
  is_monthly_settlement   BOOLEAN NOT NULL DEFAULT false,
  monthly_settlement_cycle INTEGER,
  lock_ordering           BOOLEAN NOT NULL DEFAULT false,
  lock_reason             TEXT,
  status                  VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id           UUID REFERENCES public.profiles(id),
  metadata                JSONB DEFAULT '{}',
  remark                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id),
  updated_by              UUID REFERENCES public.profiles(id),
  deleted_at              TIMESTAMPTZ,
  version                 INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_level ON public.customer(credit_level);
CREATE INDEX IF NOT EXISTS idx_customer_risk_level ON public.customer(risk_level);
CREATE INDEX IF NOT EXISTS idx_customer_owner ON public.customer(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_customer_status ON public.customer(status);

CREATE TABLE IF NOT EXISTS public.customer_contact (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  phone         VARCHAR(50),
  position      VARCHAR(100),
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  remark        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_credit_record (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
  credit_level_before VARCHAR(10),
  credit_level_after  VARCHAR(10),
  risk_type           VARCHAR(50) NOT NULL,
  risk_description    TEXT,
  related_order_id    UUID,
  related_contract_id UUID,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by          UUID REFERENCES public.profiles(id),
  handling_result     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- EQUIPMENT
-- ============================================
CREATE TABLE IF NOT EXISTS public.equipment_category (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          VARCHAR(200) NOT NULL,
  parent_id                     UUID REFERENCES public.equipment_category(id),
  description                   TEXT,
  requires_operator_certificate BOOLEAN NOT NULL DEFAULT false,
  sort_order                    INTEGER NOT NULL DEFAULT 0,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_model (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id           UUID NOT NULL REFERENCES public.equipment_category(id),
  model_name            VARCHAR(200) NOT NULL,
  brand                 VARCHAR(100),
  specification         VARCHAR(500),
  tonnage               DECIMAL(10,2),
  standard_daily_rent   DECIMAL(15,2),
  standard_monthly_rent DECIMAL(15,2),
  standard_hourly_rent  DECIMAL(15,2),
  standard_deposit      DECIMAL(15,2),
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_no                    VARCHAR(50) UNIQUE NOT NULL,
  name                            VARCHAR(300) NOT NULL,
  category_id                     UUID NOT NULL REFERENCES public.equipment_category(id),
  model_id                        UUID REFERENCES public.equipment_model(id),
  factory_no                      VARCHAR(100),
  brand                           VARCHAR(100),
  manufacturer_id                 UUID,
  specification                   VARCHAR(500),
  tonnage                         DECIMAL(10,2),
  condition_level                 VARCHAR(10) NOT NULL DEFAULT 'A',
  newness_level                   VARCHAR(20) NOT NULL DEFAULT 'GOOD',
  purchase_date                   DATE,
  purchase_price                  DECIMAL(15,2),
  service_years                   INTEGER,
  depreciation_years              INTEGER NOT NULL DEFAULT 8,
  residual_rate                   DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  current_residual_value          DECIMAL(15,2),
  warehouse_id                    UUID REFERENCES public.warehouse(id),
  station_id                      UUID REFERENCES public.station(id),
  current_location_type           VARCHAR(50) NOT NULL DEFAULT 'WAREHOUSE',
  current_location_id             UUID,
  current_location_text           TEXT,
  current_customer_id             UUID REFERENCES public.customer(id),
  current_project_site_id         UUID,
  current_order_id                UUID,
  current_contract_id             UUID,
  current_responsible_user_id     UUID REFERENCES public.profiles(id),
  current_operator_id             UUID REFERENCES public.profiles(id),
  status                          VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
  standard_rent                   DECIMAL(15,2),
  standard_deposit                DECIMAL(15,2),
  gps_enabled                     BOOLEAN NOT NULL DEFAULT false,
  requires_operator_certificate   BOOLEAN NOT NULL DEFAULT false,
  with_driver_rental              BOOLEAN NOT NULL DEFAULT false,
  scrapped                        BOOLEAN NOT NULL DEFAULT false,
  photo_paths                     JSONB DEFAULT '[]',
  nameplate_photo_paths           JSONB DEFAULT '[]',
  metadata                        JSONB DEFAULT '{}',
  remark                          TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES public.profiles(id),
  updated_by                      UUID REFERENCES public.profiles(id),
  deleted_at                      TIMESTAMPTZ,
  version                         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_equipment_status ON public.equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON public.equipment(category_id);
CREATE INDEX IF NOT EXISTS idx_equipment_station ON public.equipment(station_id);
CREATE INDEX IF NOT EXISTS idx_equipment_warehouse ON public.equipment(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_equipment_available ON public.equipment(status) WHERE status = 'IN_STOCK';

CREATE TABLE IF NOT EXISTS public.equipment_document (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  document_type   VARCHAR(50) NOT NULL,
  file_name       VARCHAR(500) NOT NULL,
  storage_path    VARCHAR(1000) NOT NULL,
  file_size       BIGINT,
  mime_type       VARCHAR(100),
  uploaded_by     UUID REFERENCES public.profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_status_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  from_status     VARCHAR(50),
  to_status       VARCHAR(50) NOT NULL,
  change_reason   TEXT,
  business_type   VARCHAR(50) NOT NULL,
  business_id     UUID NOT NULL,
  changed_by      UUID REFERENCES public.profiles(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_location_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id        UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  from_location_type  VARCHAR(50),
  from_location_id    UUID,
  from_location_text  TEXT,
  to_location_type    VARCHAR(50) NOT NULL,
  to_location_id      UUID,
  to_location_text    TEXT,
  latitude            DECIMAL(10,7),
  longitude           DECIMAL(10,7),
  located_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  business_type       VARCHAR(50) NOT NULL,
  business_id         UUID NOT NULL,
  operator_id         UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- RENTAL ORDER & CONTRACT
-- ============================================
CREATE TABLE IF NOT EXISTS public.rental_order (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no              VARCHAR(50) UNIQUE NOT NULL,
  customer_id           UUID NOT NULL REFERENCES public.customer(id),
  project_site_id       UUID,
  sales_user_id         UUID NOT NULL REFERENCES public.profiles(id),
  order_type            VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
  order_status          VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  pricing_mode          VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
  planned_start_at      TIMESTAMPTZ,
  planned_end_at        TIMESTAMPTZ,
  actual_start_at       TIMESTAMPTZ,
  actual_end_at         TIMESTAMPTZ,
  total_rent_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_deposit_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  transport_fee         DECIMAL(15,2) NOT NULL DEFAULT 0,
  material_fee          DECIMAL(15,2) NOT NULL DEFAULT 0,
  other_fee             DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  receivable_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
  unpaid_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  monthly_settlement    BOOLEAN NOT NULL DEFAULT false,
  temporary_order       BOOLEAN NOT NULL DEFAULT false,
  risk_warning_triggered BOOLEAN NOT NULL DEFAULT false,
  risk_warnings         JSONB DEFAULT '[]',
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  updated_by            UUID REFERENCES public.profiles(id),
  deleted_at            TIMESTAMPTZ,
  version               INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_order_customer ON public.rental_order(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_sales ON public.rental_order(sales_user_id);
CREATE INDEX IF NOT EXISTS idx_order_status ON public.rental_order(order_status);

CREATE TABLE IF NOT EXISTS public.rental_order_item (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES public.rental_order(id) ON DELETE CASCADE,
  equipment_id              UUID NOT NULL REFERENCES public.equipment(id),
  equipment_model_id        UUID REFERENCES public.equipment_model(id),
  quantity                  DECIMAL(10,2) NOT NULL DEFAULT 1,
  equipment_condition_level VARCHAR(10) NOT NULL DEFAULT 'A',
  pricing_mode              VARCHAR(50) NOT NULL,
  standard_unit_price       DECIMAL(15,2) NOT NULL,
  actual_unit_price         DECIMAL(15,2) NOT NULL,
  deposit_amount            DECIMAL(15,2) NOT NULL DEFAULT 0,
  rent_amount               DECIMAL(15,2) NOT NULL DEFAULT 0,
  start_at                  TIMESTAMPTZ,
  end_at                    TIMESTAMPTZ,
  expected_return_at        TIMESTAMPTZ,
  item_status               VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  price_adjusted            BOOLEAN NOT NULL DEFAULT false,
  price_adjustment_reason   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_contract (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no                     VARCHAR(50) UNIQUE NOT NULL,
  order_id                        UUID NOT NULL REFERENCES public.rental_order(id),
  customer_id                     UUID NOT NULL REFERENCES public.customer(id),
  sales_user_id                   UUID NOT NULL REFERENCES public.profiles(id),
  contract_type                   VARCHAR(50) NOT NULL DEFAULT 'FORMAL',
  contract_status                 VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  start_at                        TIMESTAMPTZ NOT NULL,
  end_at                          TIMESTAMPTZ NOT NULL,
  signed_at                       TIMESTAMPTZ,
  effective_at                    TIMESTAMPTZ,
  terminated_at                   TIMESTAMPTZ,
  rent_calculation_rule           JSONB NOT NULL DEFAULT '{}',
  total_rent_amount               DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_amount                  DECIMAL(15,2) NOT NULL DEFAULT 0,
  penalty_rule                    JSONB DEFAULT '{}',
  late_fee_rule                   JSONB DEFAULT '{}',
  damage_compensation_rule        JSONB DEFAULT '{}',
  invoice_rule                    JSONB DEFAULT '{}',
  monthly_settlement_rule         JSONB DEFAULT '{}',
  contract_file_path              VARCHAR(1000),
  special_terms                   TEXT,
  remark                          TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES public.profiles(id),
  updated_by                      UUID REFERENCES public.profiles(id),
  deleted_at                      TIMESTAMPTZ,
  version                         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.rental_contract_item (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id             UUID NOT NULL REFERENCES public.rental_contract(id) ON DELETE CASCADE,
  order_item_id           UUID REFERENCES public.rental_order_item(id),
  equipment_id            UUID NOT NULL REFERENCES public.equipment(id),
  equipment_model_id      UUID REFERENCES public.equipment_model(id),
  equipment_no_snapshot   VARCHAR(50) NOT NULL,
  equipment_name_snapshot VARCHAR(300) NOT NULL,
  condition_snapshot      VARCHAR(10) NOT NULL,
  rent_unit_price         DECIMAL(15,2) NOT NULL,
  deposit_amount          DECIMAL(15,2) NOT NULL,
  rent_amount             DECIMAL(15,2) NOT NULL,
  start_at                TIMESTAMPTZ NOT NULL,
  end_at                  TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_change_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES public.rental_contract(id) ON DELETE CASCADE,
  change_type     VARCHAR(50) NOT NULL,
  before_content  JSONB,
  after_content   JSONB,
  reason          TEXT,
  changed_by      UUID NOT NULL REFERENCES public.profiles(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approval_id     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INVENTORY (INBOUND/OUTBOUND/TRANSFER)
-- ============================================
CREATE TABLE IF NOT EXISTS public.outbound_record (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_no           VARCHAR(50) UNIQUE NOT NULL,
  business_type         VARCHAR(50) NOT NULL,
  order_id              UUID REFERENCES public.rental_order(id),
  contract_id           UUID REFERENCES public.rental_contract(id),
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  warehouse_id          UUID NOT NULL REFERENCES public.warehouse(id),
  project_site_id       UUID,
  borrower_name         VARCHAR(200),
  signer_name           VARCHAR(200),
  attachment_checklist  TEXT,
  photo_paths           JSONB DEFAULT '[]',
  remark                TEXT,
  operator_id           UUID REFERENCES public.profiles(id),
  operated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  version               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.inbound_record (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_no            VARCHAR(50) UNIQUE NOT NULL,
  business_type         VARCHAR(50) NOT NULL,
  outbound_record_id    UUID REFERENCES public.outbound_record(id),
  order_id              UUID REFERENCES public.rental_order(id),
  contract_id           UUID REFERENCES public.rental_contract(id),
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  warehouse_id          UUID NOT NULL REFERENCES public.warehouse(id),
  inspection_result     VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  inspection_notes      TEXT,
  photo_paths           JSONB DEFAULT '[]',
  remark                TEXT,
  operator_id           UUID REFERENCES public.profiles(id),
  operated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  version               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.equipment_transfer (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no           VARCHAR(50) UNIQUE NOT NULL,
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  from_warehouse_id     UUID REFERENCES public.warehouse(id),
  to_warehouse_id       UUID REFERENCES public.warehouse(id),
  from_station_id       UUID REFERENCES public.station(id),
  to_station_id         UUID REFERENCES public.station(id),
  transfer_status       VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  outbound_operator_id  UUID REFERENCES public.profiles(id),
  outbound_at           TIMESTAMPTZ,
  arrival_operator_id   UUID REFERENCES public.profiles(id),
  arrival_at            TIMESTAMPTZ,
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  version               INTEGER NOT NULL DEFAULT 1
);

-- ============================================
-- RETURN INSPECTION & SETTLEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS public.return_inspection (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_no         VARCHAR(50) UNIQUE NOT NULL,
  order_id              UUID NOT NULL REFERENCES public.rental_order(id),
  contract_id           UUID NOT NULL REFERENCES public.rental_contract(id),
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  customer_id           UUID NOT NULL REFERENCES public.customer(id),
  inspector_id          UUID NOT NULL REFERENCES public.profiles(id),
  inspected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_overdue            BOOLEAN NOT NULL DEFAULT false,
  overdue_days          INTEGER NOT NULL DEFAULT 0,
  is_damaged            BOOLEAN NOT NULL DEFAULT false,
  damage_description    TEXT,
  is_missing_parts      BOOLEAN NOT NULL DEFAULT false,
  missing_parts_desc    TEXT,
  is_dirty              BOOLEAN NOT NULL DEFAULT false,
  cleanliness_note      TEXT,
  needs_repair          BOOLEAN NOT NULL DEFAULT false,
  repair_estimate       DECIMAL(15,2) NOT NULL DEFAULT 0,
  photo_paths           JSONB DEFAULT '[]',
  customer_confirmed    BOOLEAN NOT NULL DEFAULT false,
  customer_confirmed_by VARCHAR(200),
  customer_confirmed_at TIMESTAMPTZ,
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  version               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.return_settlement (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_no           VARCHAR(50) UNIQUE NOT NULL,
  inspection_id           UUID NOT NULL REFERENCES public.return_inspection(id),
  contract_id             UUID NOT NULL REFERENCES public.rental_contract(id),
  order_id                UUID NOT NULL REFERENCES public.rental_order(id),
  customer_id             UUID NOT NULL REFERENCES public.customer(id),
  unpaid_rent             DECIMAL(15,2) NOT NULL DEFAULT 0,
  overdue_rent            DECIMAL(15,2) NOT NULL DEFAULT 0,
  late_fee                DECIMAL(15,2) NOT NULL DEFAULT 0,
  penalty                 DECIMAL(15,2) NOT NULL DEFAULT 0,
  damage_compensation     DECIMAL(15,2) NOT NULL DEFAULT 0,
  missing_parts_comp      DECIMAL(15,2) NOT NULL DEFAULT 0,
  cleaning_fee            DECIMAL(15,2) NOT NULL DEFAULT 0,
  repair_fee              DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_deduction         DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_balance         DECIMAL(15,2) NOT NULL DEFAULT 0,
  refund_amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
  additional_charge       DECIMAL(15,2) NOT NULL DEFAULT 0,
  settlement_status       VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  refund_id               UUID,
  remark                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id),
  version                 INTEGER NOT NULL DEFAULT 1
);

-- ============================================
-- FINANCE
-- ============================================
CREATE TABLE IF NOT EXISTS public.receivable (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_no   VARCHAR(50) UNIQUE NOT NULL,
  customer_id     UUID NOT NULL REFERENCES public.customer(id),
  order_id        UUID REFERENCES public.rental_order(id),
  contract_id     UUID REFERENCES public.rental_contract(id),
  receivable_type VARCHAR(50) NOT NULL,
  amount          DECIMAL(15,2) NOT NULL,
  paid_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  unpaid_amount   DECIMAL(15,2) NOT NULL,
  due_date        DATE NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
  overdue_days    INTEGER NOT NULL DEFAULT 0,
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id),
  updated_by      UUID REFERENCES public.profiles(id),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.payment_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no      VARCHAR(50) UNIQUE NOT NULL,
  customer_id     UUID NOT NULL REFERENCES public.customer(id),
  order_id        UUID REFERENCES public.rental_order(id),
  contract_id     UUID REFERENCES public.rental_contract(id),
  receivable_id   UUID REFERENCES public.receivable(id),
  payment_type    VARCHAR(50) NOT NULL,
  payment_method  VARCHAR(50) NOT NULL,
  amount          DECIMAL(15,2) NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  payer_name      VARCHAR(200),
  bank_flow_no    VARCHAR(100),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.deposit_record (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_no        VARCHAR(50) UNIQUE NOT NULL,
  customer_id       UUID NOT NULL REFERENCES public.customer(id),
  order_id          UUID NOT NULL REFERENCES public.rental_order(id),
  contract_id       UUID NOT NULL REFERENCES public.rental_contract(id),
  amount            DECIMAL(15,2) NOT NULL,
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  deducted_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  refunded_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  available_amount  DECIMAL(15,2) NOT NULL,
  deposit_status    VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT',
  source_payment_id UUID REFERENCES public.payment_record(id),
  remark            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES public.profiles(id),
  version           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.refund_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_no       VARCHAR(50) UNIQUE NOT NULL,
  customer_id     UUID NOT NULL REFERENCES public.customer(id),
  deposit_id      UUID NOT NULL REFERENCES public.deposit_record(id),
  order_id        UUID REFERENCES public.rental_order(id),
  contract_id     UUID REFERENCES public.rental_contract(id),
  refund_amount   DECIMAL(15,2) NOT NULL,
  refund_method   VARCHAR(50) NOT NULL,
  refund_status   VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
  reason          TEXT,
  approval_id     UUID,
  refunded_at     TIMESTAMPTZ,
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.reconciliation_statement (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_no            VARCHAR(50) UNIQUE NOT NULL,
  customer_id             UUID NOT NULL REFERENCES public.customer(id),
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  total_receivable_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_unpaid_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  deposit_balance         DECIMAL(15,2) NOT NULL DEFAULT 0,
  status                  VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  confirmed_at            TIMESTAMPTZ,
  remark                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id),
  version                 INTEGER NOT NULL DEFAULT 1
);

-- ============================================
-- MAINTENANCE
-- ============================================
CREATE TABLE IF NOT EXISTS public.maintenance_work_order (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_no         VARCHAR(50) UNIQUE NOT NULL,
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  customer_id           UUID REFERENCES public.customer(id),
  contract_id           UUID REFERENCES public.rental_contract(id),
  project_site_id       UUID,
  reported_by           UUID NOT NULL REFERENCES public.profiles(id),
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  fault_description     TEXT NOT NULL,
  fault_level           VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
  stopped               BOOLEAN NOT NULL DEFAULT false,
  affects_construction  BOOLEAN NOT NULL DEFAULT false,
  assigned_to           UUID REFERENCES public.profiles(id),
  assigned_at           TIMESTAMPTZ,
  repair_started_at     TIMESTAMPTZ,
  repair_finished_at    TIMESTAMPTZ,
  fault_cause           TEXT,
  repair_result         TEXT,
  labor_hours           DECIMAL(10,2) NOT NULL DEFAULT 0,
  maintenance_fee       DECIMAL(15,2) NOT NULL DEFAULT 0,
  parts_fee             DECIMAL(15,2) NOT NULL DEFAULT 0,
  outsourced            BOOLEAN NOT NULL DEFAULT false,
  manufacturer_warranty BOOLEAN NOT NULL DEFAULT false,
  status                VARCHAR(50) NOT NULL DEFAULT 'PENDING_DISPATCH',
  photo_paths           JSONB DEFAULT '[]',
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id),
  updated_by            UUID REFERENCES public.profiles(id),
  version               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.maintenance_plan (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  plan_name             VARCHAR(300) NOT NULL,
  cycle_type            VARCHAR(50) NOT NULL,
  cycle_value           INTEGER NOT NULL,
  next_maintenance_at   TIMESTAMPTZ,
  responsible_user_id   UUID REFERENCES public.profiles(id),
  status                VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.maintenance_record (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id),
  work_order_id         UUID REFERENCES public.maintenance_work_order(id),
  maintenance_plan_id   UUID REFERENCES public.maintenance_plan(id),
  maintenance_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  maintainer_id         UUID REFERENCES public.profiles(id),
  content               TEXT,
  fee                   DECIMAL(15,2) NOT NULL DEFAULT 0,
  next_maintenance_at   TIMESTAMPTZ,
  photo_paths           JSONB DEFAULT '[]',
  remark                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.spare_part (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_no           VARCHAR(50) UNIQUE NOT NULL,
  part_name         VARCHAR(300) NOT NULL,
  specification     VARCHAR(500),
  applicable_model_id UUID REFERENCES public.equipment_model(id),
  current_stock     DECIMAL(10,2) NOT NULL DEFAULT 0,
  safety_stock      DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit              VARCHAR(50) NOT NULL DEFAULT 'PIECE',
  unit_price        DECIMAL(15,2),
  warehouse_id      UUID REFERENCES public.warehouse(id),
  supplier_id       UUID,
  status            VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES public.profiles(id),
  version           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.spare_part_stock_movement (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id         UUID NOT NULL REFERENCES public.spare_part(id),
  movement_type   VARCHAR(50) NOT NULL,
  quantity        DECIMAL(10,2) NOT NULL,
  unit_price      DECIMAL(15,2),
  amount          DECIMAL(15,2) NOT NULL DEFAULT 0,
  business_type   VARCHAR(50),
  business_id     UUID,
  operator_id     UUID REFERENCES public.profiles(id),
  operated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- APPROVAL
-- ============================================
CREATE TABLE IF NOT EXISTS public.approval_request (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_no       VARCHAR(50) UNIQUE NOT NULL,
  approval_type     VARCHAR(100) NOT NULL,
  business_type     VARCHAR(50) NOT NULL,
  business_id       UUID NOT NULL,
  applicant_id      UUID NOT NULL REFERENCES public.profiles(id),
  title             VARCHAR(500) NOT NULL,
  description       TEXT,
  approval_config   JSONB NOT NULL DEFAULT '{}',
  current_step      INTEGER NOT NULL DEFAULT 1,
  status            VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  remark            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  version           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.approval_step_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id     UUID NOT NULL REFERENCES public.approval_request(id) ON DELETE CASCADE,
  step            INTEGER NOT NULL,
  approver_id     UUID REFERENCES public.profiles(id),
  action          VARCHAR(50),
  comment         TEXT,
  acted_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- NOTIFICATION & AUDIT
-- ============================================
CREATE TABLE IF NOT EXISTS public.notification (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id      UUID NOT NULL REFERENCES public.profiles(id),
  notification_type VARCHAR(50) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  content           TEXT,
  business_type     VARCHAR(50),
  business_id       UUID,
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID REFERENCES public.profiles(id),
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(50),
  resource_id     UUID,
  detail          JSONB,
  ip_address      VARCHAR(50),
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_work_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

-- Profiles: user sees own
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (supabase_user_id = auth.uid());

-- Admin can see all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = auth.uid() AND p.primary_role = 'SYSTEM_ADMIN'
    )
  );

-- Notifications: user sees own
CREATE POLICY "Users can view own notifications" ON public.notification
  FOR SELECT USING (
    recipient_id IN (
      SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid()
    )
  );

-- Equipment: everyone authenticated can view
CREATE POLICY "Authenticated can view equipment" ON public.equipment
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- SUPABASE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification;

-- ============================================
-- POSTGRES FUNCTIONS FOR TRANSACTIONS
-- ============================================

-- Contract activation
CREATE OR REPLACE FUNCTION public.activate_contract(
  p_contract_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_contract RECORD;
  v_receivable_no TEXT;
BEGIN
  SELECT * INTO v_contract
  FROM public.rental_contract
  WHERE id = p_contract_id AND contract_status = 'SIGNED'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '合同状态不允许激活');
  END IF;

  UPDATE public.rental_contract
  SET contract_status = 'ACTIVE',
      effective_at = now(),
      updated_at = now(),
      version = version + 1
  WHERE id = p_contract_id;

  UPDATE public.rental_order
  SET order_status = 'IN_PROGRESS',
      updated_at = now(),
      version = version + 1
  WHERE id = v_contract.order_id;

  -- Generate deposit receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;
  INSERT INTO public.receivable (receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by)
  VALUES (
    v_receivable_no, v_contract.customer_id, v_contract.order_id,
    p_contract_id, 'DEPOSIT', v_contract.deposit_amount,
    v_contract.deposit_amount, CURRENT_DATE, 'UNPAID', p_user_id
  );

  -- Generate first month rent receivable
  v_receivable_no := 'REC' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000+1000)::text;
  INSERT INTO public.receivable (receivable_no, customer_id, order_id, contract_id,
    receivable_type, amount, unpaid_amount, due_date, status, created_by)
  VALUES (
    v_receivable_no, v_contract.customer_id, v_contract.order_id,
    p_contract_id, 'RENT', v_contract.total_rent_amount,
    v_contract.total_rent_amount, CURRENT_DATE + INTERVAL '30 days', 'UNPAID', p_user_id
  );

  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'CONTRACT_ACTIVATE', 'CONTRACT', p_contract_id,
    jsonb_build_object('contract_no', v_contract.contract_no));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('contract_id', p_contract_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Outbound processing
CREATE OR REPLACE FUNCTION public.process_outbound(
  p_equipment_id UUID,
  p_warehouse_id UUID,
  p_order_id UUID,
  p_contract_id UUID,
  p_outbound_no TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_prev_status VARCHAR(50);
BEGIN
  SELECT status INTO v_prev_status FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;

  INSERT INTO public.outbound_record (
    outbound_no, business_type, equipment_id, warehouse_id,
    order_id, contract_id, operator_id, created_by
  ) VALUES (
    p_outbound_no, 'RENTAL_OUTBOUND', p_equipment_id, p_warehouse_id,
    p_order_id, p_contract_id, p_user_id, p_user_id
  );

  UPDATE public.equipment
  SET status = 'RENTED',
      current_location_type = 'PROJECT_SITE',
      current_order_id = p_order_id,
      current_contract_id = p_contract_id,
      updated_by = p_user_id,
      updated_at = now(),
      version = version + 1
  WHERE id = p_equipment_id;

  INSERT INTO public.equipment_status_log (
    equipment_id, from_status, to_status, change_reason,
    business_type, business_id, changed_by
  ) VALUES (
    p_equipment_id, v_prev_status, 'RENTED', '租赁出库',
    'RENTAL_OUTBOUND', p_equipment_id, p_user_id
  );

  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'OUTBOUND', 'EQUIPMENT', p_equipment_id,
    jsonb_build_object('outbound_no', p_outbound_no));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Payment reconciliation
CREATE OR REPLACE FUNCTION public.process_payment_reconciliation(
  p_receivable_id UUID,
  p_amount DECIMAL,
  p_payment_method VARCHAR,
  p_payer_name VARCHAR,
  p_bank_flow_no VARCHAR,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_receivable RECORD;
  v_payment_no TEXT;
  v_new_paid DECIMAL;
  v_new_unpaid DECIMAL;
  v_new_status VARCHAR(50);
BEGIN
  SELECT * INTO v_receivable
  FROM public.receivable
  WHERE id = p_receivable_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '应收记录不存在');
  END IF;

  v_new_paid := v_receivable.paid_amount + p_amount;
  v_new_unpaid := v_receivable.amount - v_new_paid;

  IF v_new_unpaid <= 0 THEN
    v_new_status := 'PAID';
    v_new_unpaid := 0;
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'UNPAID';
  END IF;

  UPDATE public.receivable
  SET paid_amount = v_new_paid,
      unpaid_amount = v_new_unpaid,
      status = v_new_status,
      updated_at = now(),
      version = version + 1
  WHERE id = p_receivable_id;

  v_payment_no := 'PAY' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text;

  INSERT INTO public.payment_record (
    payment_no, customer_id, order_id, contract_id, receivable_id,
    payment_type, payment_method, amount, payer_name, bank_flow_no, created_by
  ) VALUES (
    v_payment_no, v_receivable.customer_id, v_receivable.order_id,
    v_receivable.contract_id, p_receivable_id, v_receivable.receivable_type,
    p_payment_method, p_amount, p_payer_name, p_bank_flow_no, p_user_id
  );

  INSERT INTO public.audit_log (actor_id, action, resource_type, resource_id, detail)
  VALUES (p_user_id, 'PAYMENT', 'RECEIVABLE', p_receivable_id,
    jsonb_build_object('payment_no', v_payment_no, 'amount', p_amount));

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('payment_no', v_payment_no));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INSERT DEFAULT ROLES
-- ============================================
INSERT INTO public.role (role_code, role_name, role_type, description) VALUES
  ('SYSTEM_ADMIN', '系统管理员', 'BUILT_IN', '系统最高权限'),
  ('SALES', '业务员', 'BUILT_IN', '租赁业务操作'),
  ('EQUIPMENT_MANAGER', '设备管理员', 'BUILT_IN', '设备资产管理'),
  ('FINANCE', '财务人员', 'BUILT_IN', '财务操作'),
  ('MAINTENANCE', '维修人员', 'BUILT_IN', '维修运维'),
  ('APPROVER', '审批/管理层', 'BUILT_IN', '审批和经营分析'),
  ('CUSTOMER', '客户', 'BUILT_IN', '客户自助')
ON CONFLICT (role_code) DO NOTHING;

-- Insert sample equipment categories
INSERT INTO public.equipment_category (name, description) VALUES
  ('挖掘机', '各类液压挖掘机'),
  ('装载机', '各类装载机'),
  ('推土机', '各类推土机'),
  ('压路机', '各类压路机'),
  ('起重机', '各类汽车吊、履带吊'),
  ('混凝土设备', '搅拌机、泵车等'),
  ('高空作业平台', '剪叉式、臂式登高车'),
  ('叉车', '各类叉车'),
  ('其他设备', '其他工程机械设备')
ON CONFLICT DO NOTHING;
