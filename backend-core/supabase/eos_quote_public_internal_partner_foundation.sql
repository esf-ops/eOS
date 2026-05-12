-- eliteOS — Public / Internal / Partner quote foundation (ADDITIVE)
-- DO NOT run automatically. Review and apply manually in Supabase.
--
-- Adds: quote_sales_territories, quote_source_configs, quote_lead_assignments,
--       quote_submission_payloads
-- Optional: extend quote_headers.quote_source usage (values are plain text; no breaking change).
--
-- Notes:
-- - Public consumer submissions are planning leads — not final field-template quotes.
-- - Territory assignment starts with ZIP / city / county / branch / state matching; geocoding later.
-- - Monday sync remains server-side; boards selected via env vars documented in three-head-quote-architecture.md.
-- - Public users must never receive wholesale / protected pricing in browser-facing payloads (enforced in API layer).

-- ---------------------------------------------------------------------------
-- 1) Sales territories — closest rep assignment for public leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_sales_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_name text NOT NULL,
  match_type text NOT NULL,
  match_value text NOT NULL,
  branch text,
  assigned_sales_rep text,
  assigned_sales_rep_email text,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_sales_territories IS 'Maps geographic or branch keys to default salesperson for public quote leads.';
COMMENT ON COLUMN public.quote_sales_territories.match_type IS 'zip | city | county | state | branch | manual';

CREATE INDEX IF NOT EXISTS idx_quote_sales_territories_match ON public.quote_sales_territories (match_type, match_value);
CREATE INDEX IF NOT EXISTS idx_quote_sales_territories_active ON public.quote_sales_territories (is_active);
CREATE INDEX IF NOT EXISTS idx_quote_sales_territories_priority ON public.quote_sales_territories (priority);

-- ---------------------------------------------------------------------------
-- 2) Quote source configs — public / internal / partner behavior + Monday env key names
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_source_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_source text NOT NULL UNIQUE,
  display_name text NOT NULL,
  monday_board_env_key text,
  default_pricing_structure_code text,
  requires_auth boolean NOT NULL DEFAULT true,
  public_safe boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_source_configs IS 'Per-quote-source flags and Monday board env var name (not the secret).';
COMMENT ON COLUMN public.quote_source_configs.monday_board_env_key IS 'Example: MONDAY_PUBLIC_QUOTES_BOARD_ID — server reads process.env[key].';

CREATE INDEX IF NOT EXISTS idx_quote_source_configs_active ON public.quote_source_configs (is_active);

INSERT INTO public.quote_source_configs (
  quote_source,
  display_name,
  monday_board_env_key,
  default_pricing_structure_code,
  requires_auth,
  public_safe,
  is_active
)
VALUES
  (
    'public_consumer',
    'Public consumer quote',
    'MONDAY_PUBLIC_QUOTES_BOARD_ID',
    'public_retail',
    false,
    true,
    true
  ),
  (
    'internal_quote',
    'Internal Elite quote',
    'MONDAY_INTERNAL_QUOTES_BOARD_ID',
    NULL,
    true,
    false,
    true
  ),
  (
    'partner_quote',
    'Partner portal quote',
    'MONDAY_PARTNER_QUOTES_BOARD_ID',
    NULL,
    true,
    false,
    true
  )
ON CONFLICT (quote_source) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Lead assignment audit — how a public lead was routed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  assignment_source text NOT NULL,
  assigned_sales_rep text,
  assigned_sales_rep_email text,
  branch text,
  matched_territory_id uuid REFERENCES public.quote_sales_territories (id) ON DELETE SET NULL,
  confidence text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_lead_assignments IS 'Stores territory-based (or manual) salesperson assignment for a quote lead.';

CREATE INDEX IF NOT EXISTS idx_quote_lead_assignments_quote ON public.quote_lead_assignments (quote_id);

-- ---------------------------------------------------------------------------
-- 4) Submission payloads — audit / support (not returned to anonymous clients)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_submission_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  quote_source text NOT NULL,
  submitted_payload jsonb NOT NULL,
  normalized_payload jsonb,
  public_response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_submission_payloads IS 'Raw and normalized request bodies for quote submissions; internal/support use.';

CREATE INDEX IF NOT EXISTS idx_quote_submission_payloads_quote ON public.quote_submission_payloads (quote_id);
