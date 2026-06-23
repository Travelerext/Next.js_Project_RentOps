-- Trigger: auto-reset PENDING_OUTBOUND equipment when contract is terminated
CREATE OR REPLACE FUNCTION public.trg_reset_equipment_on_contract_terminate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_status = 'TERMINATED' AND OLD.contract_status != 'TERMINATED' THEN
    UPDATE public.equipment
    SET status = 'IN_STOCK',
        current_order_id = NULL,
        current_contract_id = NULL,
        current_customer_id = NULL,
        updated_at = now()
    WHERE status = 'PENDING_OUTBOUND'
      AND current_contract_id = NEW.id;

    INSERT INTO public.equipment_status_log (equipment_id, from_status, to_status, change_reason, business_type, business_id, changed_by)
    SELECT id, 'PENDING_OUTBOUND', 'IN_STOCK', '合同终止-自动退回', 'CONTRACT_TERMINATE', NEW.id, NEW.updated_by
    FROM public.equipment
    WHERE status = 'PENDING_OUTBOUND' AND current_contract_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_terminate_reset_equipment ON public.rental_contract;
CREATE TRIGGER trg_contract_terminate_reset_equipment
  AFTER UPDATE ON public.rental_contract
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reset_equipment_on_contract_terminate();

-- Also clean up existing stuck data
UPDATE public.equipment e
SET status = 'IN_STOCK', current_order_id = NULL, current_contract_id = NULL, current_customer_id = NULL, updated_at = now()
FROM public.rental_contract rc
WHERE e.status = 'PENDING_OUTBOUND' AND e.current_contract_id = rc.id AND rc.contract_status = 'TERMINATED';
