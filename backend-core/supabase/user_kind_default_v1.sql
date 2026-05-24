-- =============================================================================
-- DRAFT — user_profiles.user_kind NOT NULL default (DO NOT APPLY WITHOUT SIGN-OFF)
-- =============================================================================
--
-- Status: Draft. Not wired into CI or auto-apply.
-- Purpose: Make user_kind NOT NULL with DEFAULT 'internal' so:
--   1. assertInternalQuoteOperator always has a value to check — null cannot accidentally
--      create a partner-bypass path.
--   2. Bootstrap profile inserts (authMiddleware.js) already set user_kind = 'internal'
--      so new accounts are safe before this migration is applied.
--
-- Prerequisites:
--   1. Confirm no existing rows have user_kind IS NULL OR user_kind NOT IN (known kinds).
--      Run: SELECT id, email, user_kind FROM user_profiles WHERE user_kind IS NULL;
--   2. Backfill query in step 2 must complete without errors in staging before prod.
--   3. Confirm the auth bootstrap path in authMiddleware.js already sets user_kind (done in v1 hardening).
--
-- Rollback:
--   ALTER TABLE public.user_profiles ALTER COLUMN user_kind DROP NOT NULL;
--   ALTER TABLE public.user_profiles ALTER COLUMN user_kind DROP DEFAULT;
-- =============================================================================

-- Step 1: Backfill any existing NULL user_kind rows to 'internal'.
-- (dealer_partner rows must have been set explicitly; NULL rows are legacy internal staff.)
UPDATE public.user_profiles
SET user_kind = 'internal', updated_at = now()
WHERE user_kind IS NULL;

-- Step 2: Set NOT NULL constraint and default.
ALTER TABLE public.user_profiles
  ALTER COLUMN user_kind SET DEFAULT 'internal',
  ALTER COLUMN user_kind SET NOT NULL;

COMMENT ON COLUMN public.user_profiles.user_kind IS
  'User category for partner/internal routing. "internal" = ESF staff. "dealer_partner" = external partner user. '
  'assertInternalQuoteOperator blocks dealer_partner from internal/library/generic quote routes.';
