-- Partner Quote Foundation v1 (additive only — safe to re-run)
-- Apply after: eos_quote_platform.sql, eos_saas_foundation.sql
-- Manual: Supabase SQL editor or `psql` against project DB.

-- ---------------------------------------------------------------------------
-- 1) Partner user ↔ account access (org-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_partner_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  partner_account_id uuid NOT NULL REFERENCES public.quote_partner_accounts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'partner_user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT quote_partner_user_access_role_check CHECK (
    role IN ('partner_admin', 'partner_user', 'viewer')
  )
);

COMMENT ON TABLE public.quote_partner_user_access IS
  'Maps external partner users to a fabricator org + quote_partner_accounts row. Enforced in backend partner-quote APIs.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_partner_user_access_org_user_partner
  ON public.quote_partner_user_access (organization_id, user_id, partner_account_id);

CREATE INDEX IF NOT EXISTS idx_quote_partner_user_access_user_org_active
  ON public.quote_partner_user_access (user_id, organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_quote_partner_user_access_partner_active
  ON public.quote_partner_user_access (partner_account_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 2) quote_partner_accounts — slug, display, optional dealer bridge, status
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_partner_accounts
  ADD COLUMN IF NOT EXISTS account_slug text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  IF to_regclass('public.dealer_accounts') IS NOT NULL THEN
    ALTER TABLE public.quote_partner_accounts
      ADD COLUMN IF NOT EXISTS dealer_account_id uuid REFERENCES public.dealer_accounts (id);
    CREATE INDEX IF NOT EXISTS idx_quote_partner_accounts_dealer_account_id
      ON public.quote_partner_accounts (dealer_account_id)
      WHERE dealer_account_id IS NOT NULL;
  END IF;
END $$;

-- Normalize legacy is_active → status when status unset
UPDATE public.quote_partner_accounts
SET status = CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;

ALTER TABLE public.quote_partner_accounts
  ALTER COLUMN status SET DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_partner_accounts_org_slug
  ON public.quote_partner_accounts (organization_id, account_slug)
  WHERE account_slug IS NOT NULL AND organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_partner_accounts_org_slug_lookup
  ON public.quote_partner_accounts (organization_id, account_slug);

-- ---------------------------------------------------------------------------
-- 3) Per-partner branding (co-branding for partner portal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_partner_branding_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  partner_account_id uuid NOT NULL REFERENCES public.quote_partner_accounts (id) ON DELETE CASCADE,
  logo_url text,
  primary_color text,
  secondary_color text,
  display_name_override text,
  footer_text text,
  terms_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_quote_partner_branding_partner UNIQUE (partner_account_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_partner_branding_org_partner
  ON public.quote_partner_branding_settings (organization_id, partner_account_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 4) quote_headers — creator user id for partner audit
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users (id);

CREATE INDEX IF NOT EXISTS idx_quote_headers_created_by_user_id
  ON public.quote_headers (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
-- Removed optional invalid Postgres index predicate using now/current_date/current_timestamp.
-- This index can be replaced later with a simpler active-only constraint or trigger.
--
--
---- ---------------------------------------------------------------------------
---- 5) One active pricing assignment per partner (partial unique index)
---- ---------------------------------------------------------------------------
--CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_partner_pricing_assignments_one_active
--  ON public.quote_partner_pricing_assignments (partner_account_id)
--  WHERE is_active = true AND (ends_at IS NULL OR ends_at > now());
