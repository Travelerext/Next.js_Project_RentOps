-- Trigger: create return_inspection when contract is terminated
CREATE OR REPLACE FUNCTION public.trg_create_inspection_on_contract_terminate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_status IN ('TERMINATED', 'EXPIRED')
     AND (OLD.contract_status IS NULL OR OLD.contract_status NOT IN ('TERMINATED', 'EXPIRED')) THEN

    INSERT INTO public.return_inspection (
      inspection_no, order_id, contract_id, equipment_id, customer_id,
      inspector_id, inspected_at,
      is_overdue, overdue_days,
      is_damaged, is_missing_parts, is_dirty, needs_repair,
      repair_estimate, customer_confirmed, created_by
    )
    SELECT
      'RI' || to_char(ib.operated_at, 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
      ib.order_id, ib.contract_id, ib.equipment_id, NEW.customer_id,
      ib.operator_id, ib.operated_at,
      false, 0, false, false, false, false,
      '0', true, ib.created_by
    FROM public.inbound_record ib
    WHERE ib.contract_id = NEW.id
      AND ib.business_type = 'RETURN_INBOUND'
      AND NOT EXISTS (
        SELECT 1 FROM public.return_inspection ri
        WHERE ri.equipment_id = ib.equipment_id
          AND ri.inspected_at::date = ib.operated_at::date
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_terminate_create_inspection ON public.rental_contract;
CREATE TRIGGER trg_contract_terminate_create_inspection
  AFTER UPDATE ON public.rental_contract
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_inspection_on_contract_terminate();

-- Backfill: create inspections for already terminated contracts
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
  false, 0, false, false, false, false,
  '0', true, ib.created_by
FROM public.inbound_record ib
JOIN public.rental_contract rc ON rc.id = ib.contract_id
WHERE ib.business_type = 'RETURN_INBOUND'
  AND rc.contract_status IN ('TERMINATED', 'EXPIRED')
  AND NOT EXISTS (
    SELECT 1 FROM public.return_inspection ri
    WHERE ri.equipment_id = ib.equipment_id
      AND ri.inspected_at::date = ib.operated_at::date
  );
