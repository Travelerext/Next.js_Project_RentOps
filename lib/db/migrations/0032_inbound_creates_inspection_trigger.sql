-- Allow nullable FK columns for inspections without orders/contracts
ALTER TABLE public.return_inspection ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.return_inspection ALTER COLUMN customer_id DROP NOT NULL;

-- Fix: revert PENDING_APPROVAL back to PENDING
UPDATE public.return_request SET request_status = 'PENDING', updated_at = now()
WHERE request_status = 'PENDING_APPROVAL';
