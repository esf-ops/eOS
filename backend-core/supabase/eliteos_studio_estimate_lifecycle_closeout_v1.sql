-- =============================================================================
-- eliteos_studio_estimate_lifecycle_closeout_v1.sql
--
-- Purpose:
--   Additive persistence for Studio Final Acceptance, Sold Review, Mark Sold,
--   lifecycle events, and All Estimates query helpers.
--
-- Does NOT:
--   - create quote_headers rows for Studio estimates
--   - write QuickBooks / Moraware
--   - auto-email or auto-publish
--   - alter approved calculation or publication snapshots in place
--
-- DO NOT APPLY AUTOMATICALLY — user applies manually in Supabase after review.
-- =============================================================================

-- Lifecycle status vocabulary (denormalized on studio_estimates for All Estimates).
-- Estimate status (draft/priced/approved/…) remains the commercial authority.
-- Publication status remains on quote_publications.
DO $$
BEGIN
  IF to_regclass('public.studio_estimates') IS NULL THEN
    RAISE NOTICE 'studio_estimates missing — skip lifecycle closeout';
    RETURN;
  END IF;

  ALTER TABLE public.studio_estimates
    ADD COLUMN IF NOT EXISTS lifecycle_status text;

  ALTER TABLE public.studio_estimates
    ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

  ALTER TABLE public.studio_estimates
    ADD COLUMN IF NOT EXISTS sold_at timestamptz;

  ALTER TABLE public.studio_estimates
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

  -- Soft check: allow NULL (legacy rows) or known values.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'studio_estimates_lifecycle_status_check'
  ) THEN
    ALTER TABLE public.studio_estimates
      ADD CONSTRAINT studio_estimates_lifecycle_status_check
      CHECK (
        lifecycle_status IS NULL
        OR lifecycle_status IN (
          'draft',
          'scope_confirmed',
          'calculated',
          'commercially_approved',
          'published',
          'changes_requested',
          'accepted_awaiting_sold_review',
          'sold',
          'archived'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_estimates_org_lifecycle
  ON public.studio_estimates (organization_id, lifecycle_status)
  WHERE lifecycle_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studio_estimates_org_accepted
  ON public.studio_estimates (organization_id, accepted_at DESC NULLS LAST)
  WHERE accepted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studio_estimates_org_sold
  ON public.studio_estimates (organization_id, sold_at DESC NULLS LAST)
  WHERE sold_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Immutable customer Final Acceptance records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_estimate_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intake_case_id text NOT NULL,
  studio_estimate_id uuid NOT NULL
    REFERENCES public.studio_estimates (id) ON DELETE RESTRICT,
  estimate_revision integer NOT NULL CHECK (estimate_revision >= 1),
  publication_id uuid NOT NULL
    REFERENCES public.quote_publications (id) ON DELETE RESTRICT,
  publication_snapshot_id uuid,
  configuration_session_id uuid,
  -- Safe public-session reference (hash only — never raw token)
  session_secret_hash text,
  customer_safe_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_display_total numeric,
  customer_configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  material_summary_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_version text,
  publication_snapshot_hash text,
  lifecycle_version text NOT NULL DEFAULT 'studio_lifecycle_closeout_v1',
  actor_type text NOT NULL DEFAULT 'customer'
    CHECK (actor_type = 'customer'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: one acceptance per active publication
  CONSTRAINT uq_studio_acceptance_org_publication
    UNIQUE (organization_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_acceptances_org_estimate
  ON public.studio_estimate_acceptances (organization_id, studio_estimate_id);

CREATE INDEX IF NOT EXISTS idx_studio_acceptances_org_case
  ON public.studio_estimate_acceptances (organization_id, intake_case_id);

COMMENT ON TABLE public.studio_estimate_acceptances IS
  'Immutable customer Final Acceptance. Distinct from Review Request. Never Mark Sold.';

-- Prevent in-place mutation of acceptance rows
CREATE OR REPLACE FUNCTION public.studio_estimate_acceptances_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_acceptances is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_estimate_acceptances_no_update
  ON public.studio_estimate_acceptances;
CREATE TRIGGER trg_studio_estimate_acceptances_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_acceptances_immutable();

-- ---------------------------------------------------------------------------
-- Staff sold-review checklist (mutable until Mark Sold)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_estimate_sold_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intake_case_id text NOT NULL,
  studio_estimate_id uuid NOT NULL
    REFERENCES public.studio_estimates (id) ON DELETE RESTRICT,
  acceptance_id uuid NOT NULL
    REFERENCES public.studio_estimate_acceptances (id) ON DELETE RESTRICT,
  checklist_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist_complete boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_sold_review_org_estimate
    UNIQUE (organization_id, studio_estimate_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_sold_reviews_org_acceptance
  ON public.studio_estimate_sold_reviews (organization_id, acceptance_id);

COMMENT ON TABLE public.studio_estimate_sold_reviews IS
  'Staff sold-review checklist for Accepted — Awaiting Sold Review estimates.';

-- ---------------------------------------------------------------------------
-- Immutable Mark Sold snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_estimate_sold_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intake_case_id text NOT NULL,
  studio_estimate_id uuid NOT NULL
    REFERENCES public.studio_estimates (id) ON DELETE RESTRICT,
  estimate_revision integer NOT NULL CHECK (estimate_revision >= 1),
  acceptance_id uuid NOT NULL
    REFERENCES public.studio_estimate_acceptances (id) ON DELETE RESTRICT,
  sold_review_id uuid
    REFERENCES public.studio_estimate_sold_reviews (id) ON DELETE RESTRICT,
  publication_id uuid
    REFERENCES public.quote_publications (id) ON DELETE SET NULL,
  sold_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_display_total numeric,
  checklist_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_version text NOT NULL DEFAULT 'studio_lifecycle_closeout_v1',
  sold_by_user_id uuid,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_sold_snapshot_org_estimate
    UNIQUE (organization_id, studio_estimate_id),
  CONSTRAINT uq_studio_sold_snapshot_org_acceptance
    UNIQUE (organization_id, acceptance_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_sold_snapshots_org_case
  ON public.studio_estimate_sold_snapshots (organization_id, intake_case_id);

COMMENT ON TABLE public.studio_estimate_sold_snapshots IS
  'Immutable Mark Sold snapshot. Does not create QB/Moraware/email side effects.';

CREATE OR REPLACE FUNCTION public.studio_estimate_sold_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_sold_snapshots is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_estimate_sold_snapshots_no_update
  ON public.studio_estimate_sold_snapshots;
CREATE TRIGGER trg_studio_estimate_sold_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_sold_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_sold_snapshots_immutable();

-- ---------------------------------------------------------------------------
-- Append-only lifecycle events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_estimate_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intake_case_id text,
  studio_estimate_id uuid
    REFERENCES public.studio_estimates (id) ON DELETE SET NULL,
  estimate_revision integer,
  publication_id uuid,
  acceptance_id uuid,
  sold_snapshot_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'estimate_created',
      'scope_confirmed',
      'calculated',
      'commercially_approved',
      'publication_created',
      'publication_replaced',
      'publication_revoked',
      'review_request_submitted',
      'revision_created',
      'customer_accepted',
      'sold_review_updated',
      'sold_review_completed',
      'marked_sold',
      'archived',
      'restored'
    )),
  actor_type text NOT NULL
    CHECK (actor_type IN ('customer', 'staff', 'system')),
  actor_user_id uuid,
  source_action text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_version text NOT NULL DEFAULT 'studio_lifecycle_closeout_v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_lifecycle_events_org_estimate
  ON public.studio_estimate_lifecycle_events (organization_id, studio_estimate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_studio_lifecycle_events_org_case
  ON public.studio_estimate_lifecycle_events (organization_id, intake_case_id, created_at DESC);

COMMENT ON TABLE public.studio_estimate_lifecycle_events IS
  'Append-only Studio lifecycle audit. No secrets, tokens, or full draft payloads.';

CREATE OR REPLACE FUNCTION public.studio_estimate_lifecycle_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_lifecycle_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_lifecycle_events_no_update
  ON public.studio_estimate_lifecycle_events;
CREATE TRIGGER trg_studio_lifecycle_events_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_lifecycle_events_immutable();

-- ---------------------------------------------------------------------------
-- RLS / access analysis (Brain service-role is the write path for Studio):
--   - Public clients never receive service-role keys.
--   - Final Acceptance / sold review / Mark Sold run only through backend-core routes
--     that enforce organization_id + auth (public session or staff head access).
--   - These tables are NOT exposed for direct authenticated-client writes.
--   - Prefer enabling RLS with deny-all policies for anon/authenticated roles
--     if PostgREST ever exposes these tables; until then Brain-only access.
--   - Application uniqueness + triggers enforce immutability; RLS does not
--     replace org checks in route handlers.
--
-- Public vs staff write boundaries:
--   Public (session cookie): INSERT into studio_estimate_acceptances only via
--     Final Acceptance service (customer_safe snapshot only).
--   Staff: sold_reviews upsert, sold_snapshots insert, lifecycle event reads.
--   Neither path writes quote_headers / QuickBooks / Moraware / email.
--
-- Compatibility:
--   Additive only. Existing studio_estimates rows remain valid (lifecycle_* NULL).
--   Does not alter quote_headers, Quote Library tables, Internal Estimate tables,
--   or existing quote_publications rows.
--
-- Verification (manual):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'studio_estimates'
--      AND column_name IN ('lifecycle_status','accepted_at','sold_at','archived_at');
--   SELECT to_regclass('public.studio_estimate_acceptances');
--   SELECT to_regclass('public.studio_estimate_sold_reviews');
--   SELECT to_regclass('public.studio_estimate_sold_snapshots');
--   SELECT to_regclass('public.studio_estimate_lifecycle_events');
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.studio_estimate_acceptances'::regclass
--      AND contype = 'u';
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.studio_estimate_sold_snapshots'::regclass
--      AND contype = 'u';
--
-- Deployment order:
--   1) Apply this SQL in Supabase SQL editor (manual).
--   2) Confirm verification queries.
--   3) Deploy backend that mounts Final Acceptance / sold-review routes.
--   4) Smoke: accept → sold-review → mark sold on a pilot org.
--
-- Rollback guidance (destructive — only if no production rows):
--   DROP TABLE IF EXISTS public.studio_estimate_lifecycle_events;
--   DROP TABLE IF EXISTS public.studio_estimate_sold_snapshots;
--   DROP TABLE IF EXISTS public.studio_estimate_sold_reviews;
--   DROP TABLE IF EXISTS public.studio_estimate_acceptances;
--   ALTER TABLE public.studio_estimates
--     DROP COLUMN IF EXISTS lifecycle_status,
--     DROP COLUMN IF EXISTS accepted_at,
--     DROP COLUMN IF EXISTS sold_at,
--     DROP COLUMN IF EXISTS archived_at;
--   Limitation: cannot roll back once acceptance/sold rows exist without data loss.
-- =============================================================================
