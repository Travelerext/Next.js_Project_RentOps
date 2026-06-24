-- Wipe ALL old inspection/return triggers first
DROP TRIGGER IF EXISTS trg_inbound_create_inspection ON public.inbound_record;
DROP TRIGGER IF EXISTS trg_inbound_advance_return ON public.inbound_record;
DROP TRIGGER IF EXISTS trg_inbound_inspection ON public.inbound_record;
DROP TRIGGER IF EXISTS trg_contract_terminate_create_inspection ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_contract_terminated_inspection ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_contract_terminate_reset_equipment ON public.rental_contract;
DROP TRIGGER IF EXISTS trg_receivable_paid_complete_settlement ON public.receivable;
DROP FUNCTION IF EXISTS public.trg_create_inspection_on_inbound;
DROP FUNCTION IF EXISTS public.trg_advance_return_on_inbound;
DROP FUNCTION IF EXISTS public.trg_inbound_generate_inspections;
DROP FUNCTION IF EXISTS public.trg_create_inspection_on_contract_terminate;
DROP FUNCTION IF EXISTS public.trg_contract_terminated;
DROP FUNCTION IF EXISTS public.trg_contract_terminated_generate_inspections;
DROP FUNCTION IF EXISTS public.trg_reset_equipment_on_contract_terminate;
DROP FUNCTION IF EXISTS public.trg_complete_settlement_on_payment;
DROP FUNCTION IF EXISTS public.create_inspection_if_terminated;
DROP FUNCTION IF EXISTS public.generate_inspections_for_contract;

-- Allow nullable FK columns
ALTER TABLE public.return_inspection ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN customer_id DROP NOT NULL;

-- Core function: create inspections from inbound records for a contract
-- Only acts when contract is TERMINATED or EXPIRED
CREATE OR REPLACE FUNCTION public.generate_inspections_for_contract(p_contract_id UUID)
RETURNS void AS $$
BEGIN
  -- Guard: only for terminated or expired (by status or by date)
  IF NOT EXISTS (
    SELECT 1 FROM public.rental_contract
    WHERE id = p_contract_id
      AND (
        contract_status IN ('TERMINATED', 'EXPIRED')
        OR (contract_status = 'ACTIVE' AND end_at < now())
      )
  ) THEN RETURN; END IF;

  INSERT INTO public.return_inspection (
    inspection_no, order_id, contract_id, equipment_id, customer_id,
    inspector_id, inspected_at,
    is_overdue, overdue_days,
    is_damaged, is_missing_parts, is_dirty, needs_repair,
    repair_estimate, customer_confirmed, created_by
  )
  SELECT
    'RI' || to_char(ib.operated_at, 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
    ib.order_id, ib.contract_id, ib.equipment_id, rc.customer_id,
    ib.operator_id, ib.operated_at,
    false, 0,
    ib.inspection_result IN ('DAMAGED', 'NEEDS_REPAIR'),
    ib.inspection_result = 'MISSING_PARTS',
    ib.inspection_result = 'DIRTY',
    ib.inspection_result = 'NEEDS_REPAIR',
    '0', true, ib.created_by
  FROM public.inbound_record ib
  JOIN public.rental_contract rc ON rc.id = ib.contract_id
  WHERE ib.contract_id = p_contract_id
    AND ib.business_type = 'RETURN_INBOUND'
    AND NOT EXISTS (
      SELECT 1 FROM public.return_inspection ri
      WHERE ri.contract_id = p_contract_id
        AND ri.equipment_id = ib.equipment_id
        AND ri.inspected_at::date = ib.operated_at::date
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger: contract becomes terminated → generate inspections
CREATE OR REPLACE FUNCTION public.trg_contract_terminated_generate_inspections()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_status IN ('TERMINATED', 'EXPIRED')
     AND (OLD.contract_status IS NULL OR OLD.contract_status NOT IN ('TERMINATED', 'EXPIRED')) THEN
    PERFORM public.generate_inspections_for_contract(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_terminated_inspection ON public.rental_contract;
CREATE TRIGGER trg_contract_terminated_inspection
  AFTER UPDATE ON public.rental_contract
  FOR EACH ROW EXECUTE FUNCTION public.trg_contract_terminated_generate_inspections();

-- Trigger: equipment returned → generate inspections if contract already terminated
CREATE OR REPLACE FUNCTION public.trg_inbound_generate_inspections()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.business_type = 'RETURN_INBOUND' AND NEW.contract_id IS NOT NULL THEN
    PERFORM public.generate_inspections_for_contract(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_inspection ON public.inbound_record;
CREATE TRIGGER trg_inbound_inspection
  AFTER INSERT ON public.inbound_record
  FOR EACH ROW EXECUTE FUNCTION public.trg_inbound_generate_inspections();

-- Fix stuck PENDING_APPROVAL
UPDATE public.return_request SET request_status = 'PENDING', updated_at = now()
WHERE request_status = 'PENDING_APPROVAL';

-- Backfill all terminated, expired, or past-due contracts
SELECT public.generate_inspections_for_contract(id)
FROM public.rental_contract
WHERE contract_status IN ('TERMINATED', 'EXPIRED')
   OR (contract_status = 'ACTIVE' AND end_at < now());
