-- =============================================================================
-- eliteos_quote_takeoff_results_quote_id_nullable_v1.sql
--
-- Purpose:
--   Allow Studio / AI Takeoff / Shared Inbox results to persist without a legacy
--   quote_headers parent. quote_takeoff_jobs.quote_id is already nullable for the
--   same pre-quote Lab/Studio lineage; this aligns quote_takeoff_results.quote_id.
--
-- Why Path B (nullable), not fake quotes:
--   Studio lineage is intake_case_id → studio_estimates → Digital Estimate.
--   Legacy lineage is quote_headers → Internal Estimate / Quote Library.
--   Manufacturing quote_headers rows solely to satisfy NOT NULL would couple the
--   two lineages and create orphan Quote Library records.
--
-- Proven ownership:
--   organization_id + takeoff_job_id remain required.
--   quote_id FK is retained for non-null legacy values.
--
-- DO NOT APPLY AUTOMATICALLY — user applies manually in Supabase after review.
--
-- Idempotent: safe if quote_id is already nullable.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.quote_takeoff_results') IS NULL THEN
    RAISE NOTICE 'quote_takeoff_results missing — skip';
    RETURN;
  END IF;

  -- Drop NOT NULL only when still enforced.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quote_takeoff_results'
      AND column_name = 'quote_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.quote_takeoff_results
      ALTER COLUMN quote_id DROP NOT NULL;
  END IF;

  COMMENT ON COLUMN public.quote_takeoff_results.quote_id IS
    'Optional legacy quote_headers parent. Null for Studio/AI Takeoff pre-quote and '
    'intake-case jobs. When set, FK to quote_headers(id) ON DELETE CASCADE still applies. '
    'Authority for org isolation is organization_id + takeoff_job_id.';
END $$;

-- Verification (run manually after apply):
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'quote_takeoff_results'
--      AND column_name = 'quote_id';
--   -- expect YES
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.quote_takeoff_results'::regclass AND contype = 'f'
--      AND conname = 'quote_takeoff_results_quote_id_fkey';
--   -- expect FK still present
--
-- Rollback (only if no null quote_id rows exist):
--   ALTER TABLE public.quote_takeoff_results ALTER COLUMN quote_id SET NOT NULL;
--   -- will fail if any quote_id IS NULL
