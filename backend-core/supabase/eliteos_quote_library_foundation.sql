-- Manual apply (Supabase SQL editor):
--   1) Open Supabase → SQL → New query.
--   2) Paste this file; run once. Re-run is safe (IF NOT EXISTS / IF NOT EXISTS columns).
--   3) Confirm tables: quote_handoff_documents; column quote_headers.account_name.

--
-- Includes:
--   - quote_headers.account_name (nullable grouping label; UI/backend also derive when null)
--   - quote_handoff_documents (Moraware / QuickBooks entry doc payloads — no external writeback)
--
-- Prerequisite: public.quote_headers exists (eos_quote_platform.sql).
-- Optional: align organization_id with public.organizations(id) in a follow-up migration if desired.

-- ---------------------------------------------------------------------------
-- 1) Account label on quote headers (grouping / future CRM bridge)
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS account_name text;

COMMENT ON COLUMN public.quote_headers.account_name IS
  'Optional display grouping for Quote Library; derived from customer/project when null.';

-- ---------------------------------------------------------------------------
-- 2) Handoff documents (generated JSON only — staff copy/paste workflows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_handoff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  status text NOT NULL DEFAULT 'generated',
  payload jsonb NOT NULL,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_handoff_documents_quote ON public.quote_handoff_documents (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_handoff_documents_org ON public.quote_handoff_documents (organization_id);

COMMENT ON TABLE public.quote_handoff_documents IS
  'Quote Library handoff payloads (moraware_entry, quickbooks_entry). No Moraware/QB API writes from this table.';

-- Note: quote_status_history already ships in eos_quote_platform.sql — do not duplicate here.
