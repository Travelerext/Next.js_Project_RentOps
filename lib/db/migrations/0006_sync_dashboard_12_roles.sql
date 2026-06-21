-- ============================================
-- Fix: Extend role_to_dashboard() to all 12 roles
-- ============================================
-- The original trigger only mapped 7 base roles.
-- 5 manager/supervisor roles (MAINTENANCE_SUPERVISOR, etc.)
-- fell through to ELSE 'SALES_DASHBOARD', causing wrong routing.
-- This migration updates the mapping function and backfills.

-- ─── Update mapping function (12 roles) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.role_to_dashboard(p_role VARCHAR(50))
RETURNS VARCHAR(50)
LANGUAGE sql
IMMUTABLE
RETURN
  CASE p_role
    -- 7 base roles
    WHEN 'SYSTEM_ADMIN'            THEN 'ADMIN_DASHBOARD'
    WHEN 'SALES'                   THEN 'SALES_DASHBOARD'
    WHEN 'EQUIPMENT_MANAGER'       THEN 'EQUIPMENT_DASHBOARD'
    WHEN 'FINANCE'                 THEN 'FINANCE_DASHBOARD'
    WHEN 'MAINTENANCE'             THEN 'MAINTENANCE_DASHBOARD'
    WHEN 'APPROVER'                THEN 'APPROVAL_DASHBOARD'
    WHEN 'CUSTOMER'                THEN 'CUSTOMER_DASHBOARD'
    -- 5 manager/supervisor roles (each with their own dedicated dashboard)
    WHEN 'SALES_MANAGER'           THEN 'SALES_MANAGER_DASHBOARD'
    WHEN 'FINANCE_MANAGER'         THEN 'FINANCE_MANAGER_DASHBOARD'
    WHEN 'EQUIPMENT_SUPERVISOR'    THEN 'EQUIPMENT_SUPERVISOR_DASHBOARD'
    WHEN 'GENERAL_MANAGER'         THEN 'GENERAL_MANAGER_DASHBOARD'
    WHEN 'MAINTENANCE_SUPERVISOR'  THEN 'MAINTENANCE_SUPERVISOR_DASHBOARD'
    ELSE 'SALES_DASHBOARD'
  END;

-- The trigger trg_sync_default_dashboard already exists and calls
-- role_to_dashboard() — no trigger change needed, just the function.

-- ─── Backfill existing rows ───────────────────────────────────────────

UPDATE public.profiles
SET default_dashboard = public.role_to_dashboard(primary_role)
WHERE primary_role IS NOT NULL
  AND primary_role != ''
  AND default_dashboard != public.role_to_dashboard(primary_role);
