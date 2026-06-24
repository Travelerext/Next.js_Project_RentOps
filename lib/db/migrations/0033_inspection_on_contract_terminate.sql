-- Shared function: create return_inspection for a contract if terminated
CREATE OR REPLACE FUNCTION public.create_inspection_if_terminated(p_contract_id UUID)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rental_contract WHERE id = p_contract_id AND contract_status IN ('TERMINATED', 'EXPIRED')) THEN
    RETURN;
  END IF;

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
      WHERE ri.equipment_id = ib.equipment_id
        AND ri.inspected_at::date = ib.operated_at::date
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger 1: contract becomes terminated → create inspections
CREATE OR REPLACE FUNCTION public.trg_contract_terminated()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_status IN ('TERMINATED', 'EXPIRED')
     AND (OLD.contract_status IS NULL OR OLD.contract_status NOT IN ('TERMINATED', 'EXPIRED')) THEN
    PERFORM public.create_inspection_if_terminated(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_terminated ON public.rental_contract;
CREATE TRIGGER trg_contract_terminated
  AFTER UPDATE ON public.rental_contract
  FOR EACH ROW EXECUTE FUNCTION public.trg_contract_terminated();

-- Trigger 2: equipment returned → create inspections if contract already terminated
CREATE OR REPLACE FUNCTION public.trg_inbound_inspection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.business_type = 'RETURN_INBOUND' AND NEW.contract_id IS NOT NULL THEN
    PERFORM public.create_inspection_if_terminated(NEW.contract_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_inspection ON public.inbound_record;
CREATE TRIGGER trg_inbound_inspection
  AFTER INSERT ON public.inbound_record
  FOR EACH ROW EXECUTE FUNCTION public.trg_inbound_inspection();

-- Backfill
SELECT public.create_inspection_if_terminated(id)
FROM public.rental_contract
WHERE contract_status IN ('TERMINATED', 'EXPIRED');
