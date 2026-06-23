-- Allow nullable FK columns for inspections without orders/contracts
ALTER TABLE public.return_inspection ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN customer_id DROP NOT NULL;

-- Trigger: auto-create return_inspection on equipment return
CREATE OR REPLACE FUNCTION public.trg_create_inspection_on_inbound()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  IF NEW.business_type != 'RETURN_INBOUND' THEN RETURN NEW; END IF;

  -- Get customer from contract
  v_customer_id := NULL;
  IF NEW.contract_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id FROM public.rental_contract WHERE id = NEW.contract_id;
  END IF;

  -- Skip if already exists
  IF EXISTS (SELECT 1 FROM public.return_inspection WHERE equipment_id = NEW.equipment_id AND inspected_at::date = NEW.operated_at::date) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.return_inspection (
    inspection_no, order_id, contract_id, equipment_id, customer_id,
    inspector_id, inspected_at,
    is_overdue, overdue_days,
    is_damaged, is_missing_parts, is_dirty, needs_repair,
    repair_estimate, customer_confirmed, created_by
  ) VALUES (
    'RI' || to_char(now(), 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
    NEW.order_id, NEW.contract_id, NEW.equipment_id, v_customer_id,
    NEW.operator_id, NEW.operated_at,
    false, 0,
    NEW.inspection_result IN ('DAMAGED', 'NEEDS_REPAIR'),
    NEW.inspection_result = 'MISSING_PARTS',
    NEW.inspection_result = 'DIRTY',
    NEW.inspection_result = 'NEEDS_REPAIR',
    '0', true, NEW.created_by
  );

  UPDATE public.return_request
  SET request_status = 'PENDING_APPROVAL', updated_at = now()
  WHERE request_status = 'PENDING'
    AND (equipment_id = NEW.equipment_id OR order_id = NEW.order_id OR contract_id = NEW.contract_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the inbound transaction
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_create_inspection ON public.inbound_record;
CREATE TRIGGER trg_inbound_create_inspection
  AFTER INSERT ON public.inbound_record
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_inspection_on_inbound();

-- Backfill
INSERT INTO public.return_inspection (
  inspection_no, order_id, contract_id, equipment_id, customer_id,
  inspector_id, inspected_at,
  is_overdue, overdue_days,
  is_damaged, is_missing_parts, is_dirty, needs_repair,
  repair_estimate, customer_confirmed, created_by
)
SELECT
  'RI' || to_char(ib.operated_at, 'YYYYMMDDHH24MISS') || floor(random()*1000)::text,
  ib.order_id, ib.contract_id, ib.equipment_id,
  COALESCE(rc.customer_id, ib.operator_id),
  ib.operator_id, ib.operated_at,
  false, 0,
  ib.inspection_result IN ('DAMAGED', 'NEEDS_REPAIR'),
  ib.inspection_result = 'MISSING_PARTS',
  ib.inspection_result = 'DIRTY',
  ib.inspection_result = 'NEEDS_REPAIR',
  '0', true, ib.created_by
FROM public.inbound_record ib
LEFT JOIN public.rental_contract rc ON rc.id = ib.contract_id
WHERE ib.business_type = 'RETURN_INBOUND'
  AND ib.contract_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.return_inspection ri
    WHERE ri.equipment_id = ib.equipment_id AND ri.inspected_at::date = ib.operated_at::date
  );
