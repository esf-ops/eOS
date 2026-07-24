-- eliteOS Elite 100 Estimate Studio ↔ Account Directory continuity
-- Manual apply only (Supabase SQL editor). Do NOT apply from CI/agents.
-- Prerequisite: public.studio_estimates exists (eliteos_studio_estimates_v1.sql);
--   public.account_directory_accounts|contacts|locations exist
--   (eliteos_account_directory_v1.sql).
--
-- Purpose:
--   Nullable live Account Directory references on Studio estimates + frozen
--   customer_identity_snapshot so Digital Estimate publications keep historical
--   customer identity. Distinct from partner_account_id (trusted pricing).
--
-- Rollback (if unused):
--   ALTER TABLE public.studio_estimates DROP COLUMN IF EXISTS customer_identity_snapshot;
--   ALTER TABLE public.studio_estimates DROP COLUMN IF EXISTS account_directory_location_id;
--   ALTER TABLE public.studio_estimates DROP COLUMN IF EXISTS account_directory_contact_id;
--   ALTER TABLE public.studio_estimates DROP COLUMN IF EXISTS account_directory_account_id;
--   DROP INDEX IF EXISTS public.idx_studio_estimates_account_directory_account;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS account_directory_account_id uuid
    REFERENCES public.account_directory_accounts (id)
    ON DELETE SET NULL;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS account_directory_contact_id uuid
    REFERENCES public.account_directory_contacts (id)
    ON DELETE SET NULL;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS account_directory_location_id uuid
    REFERENCES public.account_directory_locations (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.studio_estimates.account_directory_account_id IS
  'Optional live FK to Account Directory account. Null for unlinked Studio estimates. Never a QuickBooks List ID. Never copied into partner pricing partnerAccountId.';

COMMENT ON COLUMN public.studio_estimates.account_directory_contact_id IS
  'Optional live FK to selected estimating contact.';

COMMENT ON COLUMN public.studio_estimates.account_directory_location_id IS
  'Optional live FK to selected account location (organization address; not necessarily the project/jobsite).';

CREATE INDEX IF NOT EXISTS idx_studio_estimates_account_directory_account
  ON public.studio_estimates (account_directory_account_id)
  WHERE account_directory_account_id IS NOT NULL;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS customer_identity_snapshot jsonb;

COMMENT ON COLUMN public.studio_estimates.customer_identity_snapshot IS
  'Frozen customer/account identity at save or explicit refresh. Digital Estimate publications must use this snapshot — never live Account Directory reads. No QB IDs, notes, or audit payloads.';
