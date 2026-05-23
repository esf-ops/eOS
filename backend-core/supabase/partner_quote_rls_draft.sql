-- =============================================================================
-- DRAFT — Partner Quote RLS (DO NOT APPLY IN PRODUCTION WITHOUT SIGN-OFF)
-- =============================================================================
--
-- Status: Draft for review only. Not wired into migrations or CI apply steps.
-- Brain API today uses service role and enforces partner scope in application code.
-- Enabling RLS without auditing every server path can break Internal Estimate,
-- Quote Library, Pricing Admin, and batch jobs.
--
-- Prerequisites before apply:
--   1. verifyPartnerQuoteLeakage.mjs passes in target environment
--   2. Regression test internal + partner flows with service role
--   3. Document exception for service_role bypass (Supabase default)
--   4. Update docs/eliteos/FEATURE_DECISIONS.md with apply date + owner
--
-- Rollback: ALTER TABLE ... DISABLE ROW LEVEL SECURITY; DROP POLICY ...
-- =============================================================================

-- Helper: active partner account IDs for the current auth user (same org).
CREATE OR REPLACE FUNCTION public.partner_quote_accessible_account_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT qpua.partner_account_id
  FROM public.quote_partner_user_access qpua
  WHERE qpua.user_id = auth.uid()
    AND qpua.is_active = true;
$$;

COMMENT ON FUNCTION public.partner_quote_accessible_account_ids IS
  'DRAFT RLS helper: partner accounts the logged-in user may access via quote_partner_user_access.';

-- ---------------------------------------------------------------------------
-- quote_partner_user_access — users see only their own rows
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_partner_user_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_quote_user_access_select_own ON public.quote_partner_user_access;
CREATE POLICY partner_quote_user_access_select_own
  ON public.quote_partner_user_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts/updates reserved for service role / admin tooling (no authenticated write policy in v1 draft).

-- ---------------------------------------------------------------------------
-- quote_partner_accounts — select only assigned partners
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_partner_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_quote_accounts_select_assigned ON public.quote_partner_accounts;
CREATE POLICY partner_quote_accounts_select_assigned
  ON public.quote_partner_accounts
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.partner_quote_accessible_account_ids()));

-- ---------------------------------------------------------------------------
-- quote_partner_branding_settings — select for assigned partners
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_partner_branding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_quote_branding_select_assigned ON public.quote_partner_branding_settings;
CREATE POLICY partner_quote_branding_select_assigned
  ON public.quote_partner_branding_settings
  FOR SELECT
  TO authenticated
  USING (partner_account_id IN (SELECT public.partner_quote_accessible_account_ids()));

-- ---------------------------------------------------------------------------
-- quote_headers — partner_quote rows scoped to assigned partner_account_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_headers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_quote_headers_select_scoped ON public.quote_headers;
CREATE POLICY partner_quote_headers_select_scoped
  ON public.quote_headers
  FOR SELECT
  TO authenticated
  USING (
    quote_source = 'partner_quote'
    AND partner_account_id IN (SELECT public.partner_quote_accessible_account_ids())
  );

-- Authenticated partners may insert/update only their partner_quote rows (draft — validate triggers).
DROP POLICY IF EXISTS partner_quote_headers_insert_scoped ON public.quote_headers;
CREATE POLICY partner_quote_headers_insert_scoped
  ON public.quote_headers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    quote_source = 'partner_quote'
    AND partner_account_id IN (SELECT public.partner_quote_accessible_account_ids())
  );

DROP POLICY IF EXISTS partner_quote_headers_update_scoped ON public.quote_headers;
CREATE POLICY partner_quote_headers_update_scoped
  ON public.quote_headers
  FOR UPDATE
  TO authenticated
  USING (
    quote_source = 'partner_quote'
    AND partner_account_id IN (SELECT public.partner_quote_accessible_account_ids())
  )
  WITH CHECK (
    quote_source = 'partner_quote'
    AND partner_account_id IN (SELECT public.partner_quote_accessible_account_ids())
  );

-- NOTE: internal_quote / public_consumer rows need separate policies or RLS breaks other heads.
-- This draft does NOT add permissive policies for non-partner quote_source — that is intentional
-- to force a follow-up migration that either:
--   (a) disables RLS on quote_headers until composite policies exist, or
--   (b) adds staff policies using a custom claim / separate role.
--
-- Child tables (optional follow-up draft):
--   quote_line_items, quote_rooms — FK quote_id IN (SELECT id FROM quote_headers WHERE ...)

-- ---------------------------------------------------------------------------
-- quote_partner_pricing_assignments — read assignments for accessible partners only
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_partner_pricing_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_pricing_assignments_select_scoped ON public.quote_partner_pricing_assignments;
CREATE POLICY partner_pricing_assignments_select_scoped
  ON public.quote_partner_pricing_assignments
  FOR SELECT
  TO authenticated
  USING (partner_account_id IN (SELECT public.partner_quote_accessible_account_ids()));
