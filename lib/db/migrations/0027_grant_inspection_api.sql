-- Grant Data API access to return_inspection and return_settlement
-- New tables are NOT automatically exposed to Supabase Data API
GRANT SELECT, INSERT, UPDATE ON public.return_inspection TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.return_settlement TO authenticated;

-- Fix stuck PENDING_OUTBOUND equipment with terminated contracts
UPDATE public.equipment e
SET status = 'IN_STOCK',
    current_order_id = NULL,
    current_contract_id = NULL,
    current_customer_id = NULL,
    updated_at = now()
FROM public.rental_contract rc
WHERE e.status = 'PENDING_OUTBOUND'
  AND e.current_contract_id = rc.id
  AND rc.contract_status = 'TERMINATED';
