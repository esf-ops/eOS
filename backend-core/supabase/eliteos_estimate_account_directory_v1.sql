-- eliteOS Estimate Studio ↔ Account Directory Phase 1
-- Manual apply only (Supabase SQL editor). Do NOT apply from CI/agents.
-- Prerequisite: public.quote_headers exists; public.account_directory_accounts|contacts|locations exist
--   (eliteos_account_directory_v1.sql).
--
-- Purpose:
--   Nullable live Account Directory references on internal quotes + frozen
--   customer_identity_snapshot so saved estimates keep historical identity.
--
-- Rollback (if unused):
--   ALTER TABLE public.quote_headers DROP COLUMN IF EXISTS customer_identity_snapshot;
--   ALTER TABLE public.quote_headers DROP COLUMN IF EXISTS account_directory_location_id;
--   ALTER TABLE public.quote_headers DROP COLUMN IF EXISTS account_directory_contact_id;
--   ALTER TABLE public.quote_headers DROP COLUMN IF EXISTS account_directory_account_id;
--   DROP INDEX IF EXISTS public.idx_quote_headers_account_directory_account;

-- ---------------------------------------------------------------------------
-- Live identity references (nullable; historical quotes stay valid as null)
-- ON DELETE SET NULL — never cascade-delete estimates when an account is removed
-- ---------------------------------------------------------------------------

ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS account_directory_account_id uuid
    REFERENCES public.account_directory_accounts (id)
    ON DELETE SET NULL;

ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS account_directory_contact_id uuid
    REFERENCES public.account_directory_contacts (id)
    ON DELETE SET NULL;

ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS account_directory_location_id uuid
    REFERENCES public.account_directory_locations (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.quote_headers.account_directory_account_id IS
  'Optional live FK to Account Directory account. Null for legacy unlinked quotes. Not a QuickBooks List ID.';

COMMENT ON COLUMN public.quote_headers.account_directory_contact_id IS
  'Optional live FK to selected estimating contact. Historical soft-inactive contacts may remain referenced.';

COMMENT ON COLUMN public.quote_headers.account_directory_location_id IS
  'Optional live FK to selected account location (not a project/jobsite location).';

CREATE INDEX IF NOT EXISTS idx_quote_headers_account_directory_account
  ON public.quote_headers (account_directory_account_id)
  WHERE account_directory_account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Frozen customer identity snapshot (stamped at save / explicit refresh)
-- Shape (canonical):
--   {
--     "accountId": "uuid",
--     "contactId": "uuid|null",
--     "locationId": "uuid|null",
--     "accountDisplayName": "string",
--     "legalName": "string|null",
--     "accountStatus": "active|prospect|…",
--     "quickbooksLinked": false,
--     "contactDisplayName": "string|null",
--     "contactEmail": "string|null",
--     "contactPhone": "string|null",
--     "locationLabel": "string|null",
--     "addressLine1": "string|null",
--     "addressLine2": "string|null",
--     "city": "string|null",
--     "state": "string|null",
--     "postalCode": "string|null",
--     "snapshotAt": "ISO-8601"
--   }
-- Never store raw QuickBooks IDs or financial fields here.
-- ---------------------------------------------------------------------------

ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS customer_identity_snapshot jsonb;

COMMENT ON COLUMN public.quote_headers.customer_identity_snapshot IS
  'Frozen customer/account identity at save time for print/email/PDF and historical accuracy. Independent of later Account Directory edits.';
