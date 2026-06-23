-- Fix ALL stuck PENDING return requests immediately
UPDATE public.return_request
SET request_status = 'PENDING_APPROVAL', updated_at = now()
WHERE request_status = 'PENDING';

-- Trigger: auto-advance return_request when inbound_record is created
CREATE OR REPLACE FUNCTION public.trg_advance_return_on_inbound()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.return_request
  SET request_status = 'PENDING_APPROVAL',
      inbound_id = NEW.id,
      updated_at = now()
  WHERE request_status = 'PENDING'
    AND (order_id = NEW.order_id OR contract_id = NEW.contract_id OR equipment_id = NEW.equipment_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_advance_return ON public.inbound_record;
CREATE TRIGGER trg_inbound_advance_return
  AFTER INSERT ON public.inbound_record
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_advance_return_on_inbound();
