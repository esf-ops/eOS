-- =============================================================================
-- eliteos_studio_estimate_lifecycle_closeout_v1.sql
--
-- Purpose:
--   Additive persistence for Studio Final Acceptance, Sold Review, Mark Sold,
--   lifecycle events, and All Estimates query helpers.
--
-- Access model:
--   Brain (service_role) only. ENABLE RLS; revoke anon/authenticated; no
--   PostgREST policies. Public Final Acceptance and staff sold-review / Mark Sold
--   write only through backend-core routes.
--
-- Does NOT:
--   - create quote_headers rows for Studio estimates
--   - write QuickBooks / Moraware
--   - auto-email or auto-publish
--   - alter approved calculation or publication snapshots in place
--
-- Atomicity:
--   Entire body runs inside a single transaction. Missing parent tables abort
--   with RAISE EXCEPTION (no partial lifecycle objects). Prefer re-apply of a
--   clean migration over repairing arbitrary partial schemas.
--
-- DO NOT APPLY AUTOMATICALLY — user applies manually in Supabase after review.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Required parents — fail closed (do not NOTICE + continue)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.studio_estimates') IS NULL THEN
    RAISE EXCEPTION
      'Required parent table public.studio_estimates is missing — aborting Studio lifecycle closeout migration (no partial objects)';
  END IF;
  IF to_regclass('public.quote_publications') IS NULL THEN
    RAISE EXCEPTION
      'Required parent table public.quote_publications is missing — aborting Studio lifecycle closeout migration (no partial objects)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Lifecycle status vocabulary (denormalized on studio_estimates for All Estimates).
-- Estimate status (draft/priced/approved/…) remains the commercial authority.
-- Publication status remains on quote_publications.
-- ---------------------------------------------------------------------------
ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS lifecycle_status text;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS sold_at timestamptz;

ALTER TABLE public.studio_estimates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Soft check: allow NULL (legacy rows) or known values.
-- Constraint existence scoped to this table (not global conname only).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_estimates_lifecycle_status_check'
      AND conrelid = 'public.studio_estimates'::regclass
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
  'Immutable customer Final Acceptance. Distinct from Review Request. Never Mark Sold. Brain service_role only.';

-- Prevent in-place mutation of acceptance rows
CREATE OR REPLACE FUNCTION public.studio_estimate_acceptances_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_acceptances is immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_acceptances_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_acceptances_immutable() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_acceptances_no_update
  ON public.studio_estimate_acceptances;
CREATE TRIGGER trg_studio_estimate_acceptances_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_acceptances_immutable();

-- Tenant consistency (repository convention: validation trigger, not composite parent UNIQUE)
CREATE OR REPLACE FUNCTION public.studio_estimate_acceptances_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  est_org uuid;
  pub_org uuid;
BEGIN
  SELECT organization_id INTO est_org
  FROM public.studio_estimates
  WHERE id = NEW.studio_estimate_id;
  IF est_org IS NULL THEN
    RAISE EXCEPTION 'studio estimate not found for acceptance'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM est_org THEN
    RAISE EXCEPTION 'acceptance organization_id must match studio estimate'
      USING ERRCODE = '23514';
  END IF;

  SELECT organization_id INTO pub_org
  FROM public.quote_publications
  WHERE id = NEW.publication_id;
  IF pub_org IS NULL THEN
    RAISE EXCEPTION 'publication not found for acceptance'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM pub_org THEN
    RAISE EXCEPTION 'acceptance organization_id must match publication'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_acceptances_org_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_acceptances_org_match() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_acceptances_org_match
  ON public.studio_estimate_acceptances;
CREATE TRIGGER trg_studio_estimate_acceptances_org_match
  BEFORE INSERT OR UPDATE ON public.studio_estimate_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_acceptances_org_match();

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
  'Staff sold-review checklist for Accepted — Awaiting Sold Review estimates. Locks after Mark Sold.';

CREATE OR REPLACE FUNCTION public.studio_estimate_sold_reviews_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  est_org uuid;
  acc_org uuid;
BEGIN
  SELECT organization_id INTO est_org
  FROM public.studio_estimates
  WHERE id = NEW.studio_estimate_id;
  IF est_org IS NULL THEN
    RAISE EXCEPTION 'studio estimate not found for sold review'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM est_org THEN
    RAISE EXCEPTION 'sold review organization_id must match studio estimate'
      USING ERRCODE = '23514';
  END IF;

  SELECT organization_id INTO acc_org
  FROM public.studio_estimate_acceptances
  WHERE id = NEW.acceptance_id;
  IF acc_org IS NULL THEN
    RAISE EXCEPTION 'acceptance not found for sold review'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM acc_org THEN
    RAISE EXCEPTION 'sold review organization_id must match acceptance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_sold_reviews_org_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_sold_reviews_org_match() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_sold_reviews_org_match
  ON public.studio_estimate_sold_reviews;
CREATE TRIGGER trg_studio_estimate_sold_reviews_org_match
  BEFORE INSERT OR UPDATE ON public.studio_estimate_sold_reviews
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_sold_reviews_org_match();

-- Lock sold-review checklist after a sold snapshot references the review
-- (or the same org+estimate). Does not mutate sold snapshots.
CREATE OR REPLACE FUNCTION public.studio_estimate_sold_reviews_lock_after_sold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  review_id uuid;
  org_id uuid;
  estimate_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    review_id := OLD.id;
    org_id := OLD.organization_id;
    estimate_id := OLD.studio_estimate_id;
  ELSE
    review_id := NEW.id;
    org_id := NEW.organization_id;
    estimate_id := NEW.studio_estimate_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.studio_estimate_sold_snapshots s
    WHERE s.sold_review_id = review_id
       OR (s.organization_id = org_id AND s.studio_estimate_id = estimate_id)
  ) THEN
    RAISE EXCEPTION 'studio_estimate_sold_reviews is locked after Mark Sold'
      USING ERRCODE = '25006';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_sold_reviews_lock_after_sold() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_sold_reviews_lock_after_sold() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_sold_reviews_lock_after_sold
  ON public.studio_estimate_sold_reviews;
CREATE TRIGGER trg_studio_estimate_sold_reviews_lock_after_sold
  BEFORE UPDATE OR DELETE ON public.studio_estimate_sold_reviews
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_sold_reviews_lock_after_sold();

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
    REFERENCES public.quote_publications (id) ON DELETE RESTRICT,
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
  'Immutable Mark Sold snapshot. Does not create QB/Moraware/email side effects. Brain service_role only.';

CREATE OR REPLACE FUNCTION public.studio_estimate_sold_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_sold_snapshots is immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_sold_snapshots_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_sold_snapshots_immutable() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_sold_snapshots_no_update
  ON public.studio_estimate_sold_snapshots;
CREATE TRIGGER trg_studio_estimate_sold_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_sold_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_sold_snapshots_immutable();

CREATE OR REPLACE FUNCTION public.studio_estimate_sold_snapshots_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  est_org uuid;
  acc_org uuid;
  review_org uuid;
  pub_org uuid;
BEGIN
  SELECT organization_id INTO est_org
  FROM public.studio_estimates
  WHERE id = NEW.studio_estimate_id;
  IF est_org IS NULL THEN
    RAISE EXCEPTION 'studio estimate not found for sold snapshot'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM est_org THEN
    RAISE EXCEPTION 'sold snapshot organization_id must match studio estimate'
      USING ERRCODE = '23514';
  END IF;

  SELECT organization_id INTO acc_org
  FROM public.studio_estimate_acceptances
  WHERE id = NEW.acceptance_id;
  IF acc_org IS NULL THEN
    RAISE EXCEPTION 'acceptance not found for sold snapshot'
      USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM acc_org THEN
    RAISE EXCEPTION 'sold snapshot organization_id must match acceptance'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.sold_review_id IS NOT NULL THEN
    SELECT organization_id INTO review_org
    FROM public.studio_estimate_sold_reviews
    WHERE id = NEW.sold_review_id;
    IF review_org IS NULL THEN
      RAISE EXCEPTION 'sold review not found for sold snapshot'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM review_org THEN
      RAISE EXCEPTION 'sold snapshot organization_id must match sold review'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.publication_id IS NOT NULL THEN
    SELECT organization_id INTO pub_org
    FROM public.quote_publications
    WHERE id = NEW.publication_id;
    IF pub_org IS NULL THEN
      RAISE EXCEPTION 'publication not found for sold snapshot'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM pub_org THEN
      RAISE EXCEPTION 'sold snapshot organization_id must match publication'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_sold_snapshots_org_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_sold_snapshots_org_match() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_estimate_sold_snapshots_org_match
  ON public.studio_estimate_sold_snapshots;
CREATE TRIGGER trg_studio_estimate_sold_snapshots_org_match
  BEFORE INSERT OR UPDATE ON public.studio_estimate_sold_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_sold_snapshots_org_match();

-- ---------------------------------------------------------------------------
-- Append-only lifecycle events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_estimate_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intake_case_id text,
  studio_estimate_id uuid
    REFERENCES public.studio_estimates (id) ON DELETE RESTRICT,
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

-- Lifecycle evidence FKs (RESTRICT — do not cascade-delete history).
-- Added via scoped DO blocks so a completed re-run remains safe and a prior
-- table created without these FKs can gain them on re-apply within a txn.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'studio_estimate_lifecycle_events_publication_id_fkey'
      AND conrelid = 'public.studio_estimate_lifecycle_events'::regclass
  ) THEN
    ALTER TABLE public.studio_estimate_lifecycle_events
      ADD CONSTRAINT studio_estimate_lifecycle_events_publication_id_fkey
      FOREIGN KEY (publication_id)
      REFERENCES public.quote_publications (id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'studio_estimate_lifecycle_events_acceptance_id_fkey'
      AND conrelid = 'public.studio_estimate_lifecycle_events'::regclass
  ) THEN
    ALTER TABLE public.studio_estimate_lifecycle_events
      ADD CONSTRAINT studio_estimate_lifecycle_events_acceptance_id_fkey
      FOREIGN KEY (acceptance_id)
      REFERENCES public.studio_estimate_acceptances (id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'studio_estimate_lifecycle_events_sold_snapshot_id_fkey'
      AND conrelid = 'public.studio_estimate_lifecycle_events'::regclass
  ) THEN
    ALTER TABLE public.studio_estimate_lifecycle_events
      ADD CONSTRAINT studio_estimate_lifecycle_events_sold_snapshot_id_fkey
      FOREIGN KEY (sold_snapshot_id)
      REFERENCES public.studio_estimate_sold_snapshots (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_lifecycle_events_org_estimate
  ON public.studio_estimate_lifecycle_events (organization_id, studio_estimate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_studio_lifecycle_events_org_case
  ON public.studio_estimate_lifecycle_events (organization_id, intake_case_id, created_at DESC);

COMMENT ON TABLE public.studio_estimate_lifecycle_events IS
  'Append-only Studio lifecycle audit. No secrets, tokens, or full draft payloads. Brain service_role only.';

CREATE OR REPLACE FUNCTION public.studio_estimate_lifecycle_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'studio_estimate_lifecycle_events is append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_lifecycle_events_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_lifecycle_events_immutable() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_lifecycle_events_no_update
  ON public.studio_estimate_lifecycle_events;
CREATE TRIGGER trg_studio_lifecycle_events_no_update
  BEFORE UPDATE OR DELETE ON public.studio_estimate_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_lifecycle_events_immutable();

CREATE OR REPLACE FUNCTION public.studio_estimate_lifecycle_events_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_org uuid;
BEGIN
  IF NEW.studio_estimate_id IS NOT NULL THEN
    SELECT organization_id INTO linked_org
    FROM public.studio_estimates
    WHERE id = NEW.studio_estimate_id;
    IF linked_org IS NULL THEN
      RAISE EXCEPTION 'studio estimate not found for lifecycle event'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM linked_org THEN
      RAISE EXCEPTION 'lifecycle event organization_id must match studio estimate'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.publication_id IS NOT NULL THEN
    SELECT organization_id INTO linked_org
    FROM public.quote_publications
    WHERE id = NEW.publication_id;
    IF linked_org IS NULL THEN
      RAISE EXCEPTION 'publication not found for lifecycle event'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM linked_org THEN
      RAISE EXCEPTION 'lifecycle event organization_id must match publication'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.acceptance_id IS NOT NULL THEN
    SELECT organization_id INTO linked_org
    FROM public.studio_estimate_acceptances
    WHERE id = NEW.acceptance_id;
    IF linked_org IS NULL THEN
      RAISE EXCEPTION 'acceptance not found for lifecycle event'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM linked_org THEN
      RAISE EXCEPTION 'lifecycle event organization_id must match acceptance'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.sold_snapshot_id IS NOT NULL THEN
    SELECT organization_id INTO linked_org
    FROM public.studio_estimate_sold_snapshots
    WHERE id = NEW.sold_snapshot_id;
    IF linked_org IS NULL THEN
      RAISE EXCEPTION 'sold snapshot not found for lifecycle event'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM linked_org THEN
      RAISE EXCEPTION 'lifecycle event organization_id must match sold snapshot'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_estimate_lifecycle_events_org_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_estimate_lifecycle_events_org_match() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_lifecycle_events_org_match
  ON public.studio_estimate_lifecycle_events;
CREATE TRIGGER trg_studio_lifecycle_events_org_match
  BEFORE INSERT OR UPDATE ON public.studio_estimate_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.studio_estimate_lifecycle_events_org_match();

-- ---------------------------------------------------------------------------
-- RLS + privilege posture (match studio_estimates / quote_publications)
-- No anon/authenticated policies — deny by default. service_role bypasses RLS.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.studio_estimate_acceptances FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_estimate_acceptances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_estimate_acceptances TO service_role;
ALTER TABLE public.studio_estimate_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_estimate_sold_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_estimate_sold_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_estimate_sold_reviews TO service_role;
ALTER TABLE public.studio_estimate_sold_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_estimate_sold_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_estimate_sold_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_estimate_sold_snapshots TO service_role;
ALTER TABLE public.studio_estimate_sold_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_estimate_lifecycle_events FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_estimate_lifecycle_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_estimate_lifecycle_events TO service_role;
ALTER TABLE public.studio_estimate_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- Intentionally no CREATE POLICY for anon/authenticated.
-- Direct PostgREST access is denied; backend-core service-role is the only path.
-- Final Acceptance still writes only through backend-core public session routes.

COMMIT;

-- =============================================================================
-- VERIFICATION (manual — run after apply; do not auto-apply this file)
-- =============================================================================
--
-- 1) Lifecycle columns on studio_estimates
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'studio_estimates'
--   AND column_name IN ('lifecycle_status','accepted_at','sold_at','archived_at')
-- ORDER BY column_name;
--
-- 2) Four lifecycle tables exist
-- SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN (
--     'studio_estimate_acceptances',
--     'studio_estimate_sold_reviews',
--     'studio_estimate_sold_snapshots',
--     'studio_estimate_lifecycle_events'
--   )
-- ORDER BY c.relname;
-- -- Expect: relrowsecurity = true, relforcerowsecurity = false (service_role BYPASSRLS)
--
-- 3) Primary keys
-- SELECT c.conrelid::regclass AS table_name, c.conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- WHERE c.contype = 'p'
--   AND c.conrelid IN (
--     'public.studio_estimate_acceptances'::regclass,
--     'public.studio_estimate_sold_reviews'::regclass,
--     'public.studio_estimate_sold_snapshots'::regclass,
--     'public.studio_estimate_lifecycle_events'::regclass
--   )
-- ORDER BY 1;
--
-- 4) Foreign keys (incl. lifecycle event publication/acceptance/sold_snapshot)
-- SELECT c.conrelid::regclass AS table_name, c.conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- WHERE c.contype = 'f'
--   AND c.conrelid IN (
--     'public.studio_estimate_acceptances'::regclass,
--     'public.studio_estimate_sold_reviews'::regclass,
--     'public.studio_estimate_sold_snapshots'::regclass,
--     'public.studio_estimate_lifecycle_events'::regclass
--   )
-- ORDER BY 1, 2;
--
-- 5) Unique constraints
-- SELECT c.conrelid::regclass AS table_name, c.conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- WHERE c.contype = 'u'
--   AND c.conrelid IN (
--     'public.studio_estimate_acceptances'::regclass,
--     'public.studio_estimate_sold_reviews'::regclass,
--     'public.studio_estimate_sold_snapshots'::regclass
--   )
-- ORDER BY 1, 2;
--
-- 6) Triggers (immutability, org match, sold-review lock)
-- SELECT event_object_table, trigger_name, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE event_object_schema = 'public'
--   AND event_object_table IN (
--     'studio_estimate_acceptances',
--     'studio_estimate_sold_reviews',
--     'studio_estimate_sold_snapshots',
--     'studio_estimate_lifecycle_events'
--   )
-- ORDER BY event_object_table, trigger_name;
--
-- 7) Indexes
-- SELECT tablename, indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename LIKE 'studio_estimate_%'
-- ORDER BY tablename, indexname;
--
-- 8) Table privileges (anon / authenticated / service_role)
-- SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'studio_estimate_acceptances',
--     'studio_estimate_sold_reviews',
--     'studio_estimate_sold_snapshots',
--     'studio_estimate_lifecycle_events'
--   )
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- GROUP BY grantee, table_name
-- ORDER BY table_name, grantee;
-- -- Expect: no rows for anon/authenticated; service_role has SELECT/INSERT/UPDATE/DELETE
--
-- 9) Policies (should be empty — no PostgREST exposure)
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'studio_estimate_acceptances',
--     'studio_estimate_sold_reviews',
--     'studio_estimate_sold_snapshots',
--     'studio_estimate_lifecycle_events'
--   );
-- -- Expect: zero rows
--
-- 10) Zero legacy tables altered (spot-check)
-- SELECT to_regclass('public.quote_headers') IS NOT NULL AS quote_headers_exists;
-- -- This migration must not ADD/DROP columns on quote_headers / Internal Estimate tables.
--
-- 11) Sample cross-organization rejection (service_role; use real org A estimate + org B uuid)
-- -- BEGIN;
-- -- INSERT INTO public.studio_estimate_acceptances (
-- --   organization_id, intake_case_id, studio_estimate_id, estimate_revision, publication_id,
-- --   customer_safe_snapshot_json
-- -- ) VALUES (
-- --   '<org-b-uuid>', 'case-x', '<org-a-estimate-uuid>', 1, '<org-a-publication-uuid>', '{}'::jsonb
-- -- );
-- -- -- Expect: raise acceptance organization_id must match studio estimate / publication
-- -- ROLLBACK;
--
-- 12) Sold-review lock after Mark Sold (after a real sold snapshot exists)
-- -- UPDATE public.studio_estimate_sold_reviews SET notes = 'tamper' WHERE id = '<sold-review-id>';
-- -- -- Expect: studio_estimate_sold_reviews is locked after Mark Sold
--
-- Intentionally omitted composite FKs on (organization_id, id):
--   Parent tables studio_estimates / quote_publications use PK(id) only. Adding
--   UNIQUE(organization_id, id) would restructure production parents. Org match
--   triggers follow the existing digital-estimate / quote-intake convention.
--
-- Intentionally omitted FK:
--   studio_estimate_acceptances.publication_snapshot_id — optional evidence pointer;
--   not required for lifecycle closeout uniqueness and may be null for some paths.
--
-- Compatibility:
--   intake_case_id NOT NULL is compatible: New Estimate / Manual Scope always create
--   a quote_intake case and set studio_estimates.intake_case_id before publication
--   eligibility.
--
-- Idempotency:
--   Re-running a completed migration is safe (IF NOT EXISTS / CREATE OR REPLACE /
--   scoped constraint checks / ENABLE RLS / REVOKE+GRANT). A failure aborts the
--   whole transaction. Do not rely on repairing arbitrary half-applied older copies;
--   roll back and re-apply.
--
-- Deployment order:
--   1) Apply this SQL in Supabase SQL editor (manual).
--   2) Confirm verification queries.
--   3) Deploy backend that mounts Final Acceptance / sold-review routes.
--   4) Smoke: accept → sold-review → mark sold on a pilot org.
--
-- Rollback guidance (destructive — only if no production rows):
--   BEGIN;
--   DROP TABLE IF EXISTS public.studio_estimate_lifecycle_events;
--   DROP TABLE IF EXISTS public.studio_estimate_sold_snapshots;
--   DROP TABLE IF EXISTS public.studio_estimate_sold_reviews;
--   DROP TABLE IF EXISTS public.studio_estimate_acceptances;
--   ALTER TABLE public.studio_estimates
--     DROP COLUMN IF EXISTS lifecycle_status,
--     DROP COLUMN IF EXISTS accepted_at,
--     DROP COLUMN IF EXISTS sold_at,
--     DROP COLUMN IF EXISTS archived_at;
--   COMMIT;
--   Limitation: cannot roll back once acceptance/sold rows exist without data loss.
-- =============================================================================
