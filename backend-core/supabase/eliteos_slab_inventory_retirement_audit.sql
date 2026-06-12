-- =============================================================================
-- eliteOS slab_inventory retirement audit columns
-- Draft migration — DO NOT apply automatically.
-- Apply manually in Supabase SQL editor after review.
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Adds audit columns that support SOFT-RETIREMENT of slabs/remnants which are
-- no longer present in the latest successful FULL inventory snapshot. The core
-- behaviour (excluding retired rows from active views) only needs the existing
-- `is_active` column; these columns add traceability for when/why/which sync
-- run retired a row, plus a `last_seen_at` timestamp and a human-readable
-- `inventory_status`.
--
-- PREREQUISITE FOR ENABLING RETIREMENT
-- ────────────────────────────────────
-- Apply this migration BEFORE setting SLAB_INVENTORY_RETIRE_MISSING_ENABLED=1 on
-- the backend. With the flag on, the Slabsmith ingest path writes these columns
-- on every upsert (reactivation) and on retirement UPDATEs. If the flag is off
-- (default), these columns are never written and the migration is harmless.
--
-- SAFETY
-- ──────
-- No DML (no INSERT/UPDATE/DELETE/TRUNCATE). Additive columns only.
-- All ALTER statements use IF NOT EXISTS to be idempotent / re-runnable.
-- No hard deletes anywhere. Retirement is is_active=false (soft) only.
-- Scoped at the application layer to organization_id + external_source +
-- external_company_code; this migration changes no RLS policies.
--
-- =============================================================================

BEGIN;

ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS inventory_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NULL;

ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS retired_at timestamptz NULL;

ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS retired_by_sync_run_id uuid NULL
    REFERENCES public.slabcloud_sync_runs(id) ON DELETE RESTRICT;

ALTER TABLE public.slab_inventory
  ADD COLUMN IF NOT EXISTS retired_reason text NULL;

COMMENT ON COLUMN public.slab_inventory.inventory_status IS
  'Human-readable status: ''active'' or ''retired_missing_from_source''. '
  'Mirrors is_active; is_active=false implies retired_missing_from_source.';

COMMENT ON COLUMN public.slab_inventory.last_seen_at IS
  'Timestamp this row was last present in a successful full inventory sync.';

COMMENT ON COLUMN public.slab_inventory.retired_at IS
  'When the row was soft-retired (missing from latest successful full sync). '
  'NULL while active. Row is never hard-deleted.';

COMMENT ON COLUMN public.slab_inventory.retired_by_sync_run_id IS
  'The slabcloud_sync_runs.id of the successful full sync that retired this row.';

COMMENT ON COLUMN public.slab_inventory.retired_reason IS
  'Why the row was retired, e.g. ''missing_from_latest_successful_full_sync''.';

-- Partial index to make retired-inventory audit queries cheap without affecting
-- the existing active-only filters.
CREATE INDEX IF NOT EXISTS idx_slab_inventory_org_retired
  ON public.slab_inventory (organization_id, external_source, retired_at)
  WHERE is_active = false;

COMMIT;
