-- ============================================
-- Migration 0017: Add return_request table + RLS
-- ============================================
-- A lightweight "退租申请" that sales/finance can create
-- to initiate the return process. Equipment manager then
-- performs the physical scan inbound, linking to this request.
-- ============================================

CREATE TABLE IF NOT EXISTS public.return_request (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no      VARCHAR(50) UNIQUE NOT NULL,
  order_id        UUID REFERENCES public.rental_order(id),
  contract_id     UUID REFERENCES public.rental_contract(id),
  customer_id     UUID NOT NULL REFERENCES public.customer(id),
  equipment_id    UUID REFERENCES public.equipment(id),
  requested_by    UUID NOT NULL REFERENCES public.profiles(id),
  reason          TEXT,
  request_status  VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  -- PENDING → APPROVED (equipment manager accepts) → COMPLETED (inbound done)
  -- or REJECTED / CANCELLED
  approved_by     UUID REFERENCES public.profiles(id),
  approved_at     TIMESTAMPTZ,
  inbound_id      UUID, -- linked inbound_record when processed
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_return_request_order ON public.return_request(order_id);
CREATE INDEX idx_return_request_contract ON public.return_request(contract_id);
CREATE INDEX idx_return_request_status ON public.return_request(request_status);
CREATE INDEX idx_return_request_customer ON public.return_request(customer_id);

-- RLS
ALTER TABLE public.return_request ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can view
CREATE POLICY "Authenticated can view return requests" ON public.return_request
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: authenticated users can create
CREATE POLICY "Authenticated can insert return requests" ON public.return_request
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: creator, equipment manager, or admin
CREATE POLICY "Creator can update return requests" ON public.return_request
  FOR UPDATE TO authenticated
  USING (
    requested_by IN (SELECT id FROM public.profiles WHERE supabase_user_id = auth.uid())
    OR public.get_current_user_primary_role() IN ('SYSTEM_ADMIN', 'EQUIPMENT_MANAGER', 'EQUIPMENT_SUPERVISOR')
  );
