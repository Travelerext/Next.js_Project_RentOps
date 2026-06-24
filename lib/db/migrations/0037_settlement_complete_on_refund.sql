-- Trigger: complete settlement when refund is executed
CREATE OR REPLACE FUNCTION public.trg_complete_settlement_on_refund()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.refund_status = 'REFUNDED' AND OLD.refund_status != 'REFUNDED' AND NEW.contract_id IS NOT NULL THEN
    UPDATE public.return_settlement
    SET settlement_status = 'COMPLETED', updated_at = now()
    WHERE contract_id = NEW.contract_id
      AND settlement_status != 'COMPLETED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refund_complete_settlement ON public.refund_record;
CREATE TRIGGER trg_refund_complete_settlement
  AFTER UPDATE ON public.refund_record
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_complete_settlement_on_refund();
