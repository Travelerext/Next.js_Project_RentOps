-- Trigger: auto-complete settlement when receivables are paid
CREATE OR REPLACE FUNCTION public.trg_complete_settlement_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unpaid_amount > 0 THEN RETURN NEW; END IF;
  IF NEW.contract_id IS NULL THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.receivable
    WHERE contract_id = NEW.contract_id
      AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      AND unpaid_amount > 0
  ) THEN
    UPDATE public.return_settlement
    SET settlement_status = 'COMPLETED', updated_at = now()
    WHERE contract_id = NEW.contract_id
      AND settlement_status != 'COMPLETED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receivable_paid_complete_settlement ON public.receivable;
CREATE TRIGGER trg_receivable_paid_complete_settlement
  AFTER UPDATE ON public.receivable
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_complete_settlement_on_payment();

-- Fix already-paid settlements
UPDATE public.return_settlement rs
SET settlement_status = 'COMPLETED', updated_at = now()
WHERE rs.settlement_status IN ('CHARGE_PENDING', 'REFUND_PENDING')
  AND NOT EXISTS (
    SELECT 1 FROM public.receivable r
    WHERE r.contract_id = rs.contract_id
      AND r.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
      AND r.unpaid_amount > 0
  );
