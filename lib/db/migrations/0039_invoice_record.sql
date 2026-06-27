-- ============================================
-- 0039_invoice_record
-- ============================================

CREATE TABLE IF NOT EXISTS public.invoice_record (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no         VARCHAR(50) UNIQUE NOT NULL,
  customer_id        UUID NOT NULL REFERENCES public.customer(id),
  order_id           UUID NOT NULL REFERENCES public.rental_order(id),
  contract_id        UUID REFERENCES public.rental_contract(id),
  invoice_type       VARCHAR(50) NOT NULL DEFAULT 'SPECIAL_VAT',
  invoice_status     VARCHAR(50) NOT NULL DEFAULT 'ISSUED',
  title              VARCHAR(300) NOT NULL,
  tax_no             VARCHAR(50),
  address_phone      TEXT,
  bank_account       TEXT,
  amount_without_tax DECIMAL(15,2) NOT NULL,
  tax_rate           DECIMAL(5,4) NOT NULL DEFAULT 0.1300,
  tax_amount         DECIMAL(15,2) NOT NULL,
  total_amount       DECIMAL(15,2) NOT NULL,
  item_snapshot      JSONB NOT NULL DEFAULT '[]',
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES public.profiles(id),
  updated_by         UUID REFERENCES public.profiles(id),
  version            INTEGER NOT NULL DEFAULT 1
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_record_order_id_unique'
      AND conrelid = 'public.invoice_record'::regclass
  ) THEN
    ALTER TABLE public.invoice_record
      ADD CONSTRAINT invoice_record_order_id_unique UNIQUE (order_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_record_amounts_non_negative'
      AND conrelid = 'public.invoice_record'::regclass
  ) THEN
    ALTER TABLE public.invoice_record
      ADD CONSTRAINT invoice_record_amounts_non_negative
      CHECK (amount_without_tax >= 0 AND tax_amount >= 0 AND total_amount >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_record_tax_rate_range'
      AND conrelid = 'public.invoice_record'::regclass
  ) THEN
    ALTER TABLE public.invoice_record
      ADD CONSTRAINT invoice_record_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_customer_issued ON public.invoice_record(customer_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_order ON public.invoice_record(order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_contract ON public.invoice_record(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON public.invoice_record(invoice_status);

ALTER TABLE public.invoice_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view invoices" ON public.invoice_record;
CREATE POLICY "Users can view invoices" ON public.invoice_record
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND (
          p.primary_role IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER', 'SALES', 'SALES_MANAGER', 'GENERAL_MANAGER')
          OR EXISTS (
            SELECT 1 FROM public.customer c
            WHERE c.id = invoice_record.customer_id
              AND c.owner_user_id = p.id
          )
        )
    )
  );

DROP POLICY IF EXISTS "Finance can create invoices" ON public.invoice_record;
CREATE POLICY "Finance can create invoices" ON public.invoice_record
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER')
    )
  );

DROP POLICY IF EXISTS "Finance can update invoices" ON public.invoice_record;
CREATE POLICY "Finance can update invoices" ON public.invoice_record
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.supabase_user_id = (SELECT auth.uid())
        AND p.primary_role IN ('SYSTEM_ADMIN', 'FINANCE', 'FINANCE_MANAGER')
    )
  );
