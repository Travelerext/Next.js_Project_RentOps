-- ============================================
-- Sync default_dashboard with primary_role
-- ============================================
-- The default_dashboard column should always mirror primary_role.
-- This migration:
--   1. Creates a helper function that maps role → dashboard
--   2. Creates a trigger to auto-sync on INSERT/UPDATE
--   3. Backfills existing rows

-- ─── Mapping function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.role_to_dashboard(p_role VARCHAR(50))
RETURNS VARCHAR(50)
LANGUAGE sql
IMMUTABLE
RETURN
  CASE p_role
    WHEN 'SYSTEM_ADMIN'       THEN 'ADMIN_DASHBOARD'
    WHEN 'SALES'              THEN 'SALES_DASHBOARD'
    WHEN 'EQUIPMENT_MANAGER'  THEN 'EQUIPMENT_DASHBOARD'
    WHEN 'FINANCE'            THEN 'FINANCE_DASHBOARD'
    WHEN 'MAINTENANCE'        THEN 'MAINTENANCE_DASHBOARD'
    WHEN 'APPROVER'           THEN 'APPROVAL_DASHBOARD'
    WHEN 'CUSTOMER'           THEN 'CUSTOMER_DASHBOARD'
    ELSE 'SALES_DASHBOARD'
  END;

-- ─── Trigger function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_default_dashboard()
RETURNS TRIGGER AS $$
BEGIN
  -- When primary_role is set/changed, auto-set default_dashboard
  IF NEW.primary_role IS NOT NULL AND NEW.primary_role != '' THEN
    NEW.default_dashboard := public.role_to_dashboard(NEW.primary_role);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_default_dashboard ON public.profiles;

CREATE TRIGGER trg_sync_default_dashboard
  BEFORE INSERT OR UPDATE OF primary_role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_default_dashboard();

-- ─── Backfill existing rows ─────────────────────────────────────────

UPDATE public.profiles
SET default_dashboard = public.role_to_dashboard(primary_role)
WHERE primary_role IS NOT NULL
  AND primary_role != ''
  AND default_dashboard != public.role_to_dashboard(primary_role);
