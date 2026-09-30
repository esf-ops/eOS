-- =============================================================================
-- eliteos_studio_qb_sales_order_jobs_v1.sql
--
-- Purpose:
--   Durable queue for Studio / Quote Flow Mark Sold → QuickBooks SALES ORDER.
--   One job per (organization, idempotency key). The idempotency key binds the
--   publication, the accepted revision and the QuickBooks company, so a double
--   click, a replay or a lost acknowledgment can never create a second order.
--
-- Access model:
--   Brain (service_role) only. ENABLE RLS; revoke anon/authenticated; no
--   PostgREST policies. Staff read status / request retry only through
--   backend-core routes.
--
-- Does NOT:
--   - enable QuickBooks writes (Brain env gate QB_SALES_ORDER_WRITE_ENABLED,
--     QB_SALES_ORDER_WRITE_ENVIRONMENT=test and a company allowlist are required)
--   - create invoices, payments or deposits
--   - modify sold snapshots or acceptances
--
-- Depends on: eliteos_studio_estimate_lifecycle_closeout_v1.sql
-- Apply status: NOT APPLIED. Additive only.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.studio_qb_sales_order_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  studio_estimate_id uuid NOT NULL
    REFERENCES public.studio_estimates (id) ON DELETE RESTRICT,
  sold_snapshot_id uuid NOT NULL
    REFERENCES public.studio_estimate_sold_snapshots (id) ON DELETE RESTRICT,
  acceptance_id uuid NOT NULL
    REFERENCES public.studio_estimate_acceptances (id) ON DELETE RESTRICT,
  publication_id uuid
    REFERENCES public.quote_publications (id) ON DELETE RESTRICT,
  quote_number text,
  idempotency_key text NOT NULL,
  external_guid text NOT NULL,
  company_identity text,
  status text NOT NULL,
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_version text NOT NULL,
  blockers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  next_attempt_at timestamptz,
  possibly_in_quickbooks boolean NOT NULL DEFAULT false,
  customer_job_json jsonb,
  attempt_json jsonb,
  last_error_json jsonb,
  qb_txn_id text,
  qb_ref_number text,
  reconciliation_json jsonb,
  events_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by_user_id uuid,
  submitted_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_studio_qb_so_status CHECK (status IN (
    'blocked', 'queued', 'in_progress', 'retry_wait',
    'outcome_unknown', 'needs_attention', 'synced'
  )),
  CONSTRAINT chk_studio_qb_so_synced_has_txn CHECK (
    status <> 'synced' OR (qb_txn_id IS NOT NULL AND synced_at IS NOT NULL)
  ),
  CONSTRAINT uq_studio_qb_so_org_idempotency
    UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_qb_so_org_company_txn
  ON public.studio_qb_sales_order_jobs (organization_id, company_identity, qb_txn_id)
  WHERE qb_txn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studio_qb_so_due
  ON public.studio_qb_sales_order_jobs (next_attempt_at)
  WHERE status IN ('queued', 'retry_wait', 'outcome_unknown', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_studio_qb_so_org_estimate
  ON public.studio_qb_sales_order_jobs (organization_id, studio_estimate_id);

CREATE INDEX IF NOT EXISTS idx_studio_qb_so_org_status
  ON public.studio_qb_sales_order_jobs (organization_id, status, updated_at DESC);

COMMENT ON TABLE public.studio_qb_sales_order_jobs IS
  'Mark Sold → QuickBooks SALES ORDER queue. Synced only after QuickBooks read-back reconciles. Brain service_role only.';
COMMENT ON COLUMN public.studio_qb_sales_order_jobs.customer_job_json IS
  'Staff-selected QuickBooks customer:job ({listId|fullName, selectedByUserId, selectedAt}); overrides Account Directory resolution. Never name-matched.';
COMMENT ON COLUMN public.studio_qb_sales_order_jobs.attempt_json IS
  'In-flight attempt: {attemptId, step: company|lookup|add|readback, mustLookFirst, txnId}. Agent reports must match attemptId + step.';
COMMENT ON COLUMN public.studio_qb_sales_order_jobs.possibly_in_quickbooks IS
  'True once an add may have reached QuickBooks; the worker must query by ExternalGUID/memo marker before any re-add.';

CREATE OR REPLACE FUNCTION public.studio_qb_sales_order_jobs_org_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  sold_org uuid;
  sold_estimate uuid;
  sold_acceptance uuid;
BEGIN
  SELECT organization_id, studio_estimate_id, acceptance_id
    INTO sold_org, sold_estimate, sold_acceptance
  FROM public.studio_estimate_sold_snapshots
  WHERE id = NEW.sold_snapshot_id;
  IF sold_org IS NULL THEN
    RAISE EXCEPTION 'sold snapshot not found for sales order job' USING ERRCODE = '23503';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM sold_org
     OR NEW.studio_estimate_id IS DISTINCT FROM sold_estimate
     OR NEW.acceptance_id IS DISTINCT FROM sold_acceptance THEN
    RAISE EXCEPTION 'sales order job must match its sold snapshot organization, estimate and acceptance'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.sold_snapshot_id IS DISTINCT FROM OLD.sold_snapshot_id
    OR NEW.acceptance_id IS DISTINCT FROM OLD.acceptance_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION 'sales order job source is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'synced' AND NEW.status <> 'synced' THEN
    RAISE EXCEPTION 'a synced sales order job cannot be reopened' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.studio_qb_sales_order_jobs_org_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_qb_sales_order_jobs_org_match() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_studio_qb_sales_order_jobs_org_match
  ON public.studio_qb_sales_order_jobs;
CREATE TRIGGER trg_studio_qb_sales_order_jobs_org_match
  BEFORE INSERT OR UPDATE ON public.studio_qb_sales_order_jobs
  FOR EACH ROW EXECUTE FUNCTION public.studio_qb_sales_order_jobs_org_match();

REVOKE ALL ON TABLE public.studio_qb_sales_order_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_qb_sales_order_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_qb_sales_order_jobs TO service_role;
ALTER TABLE public.studio_qb_sales_order_jobs ENABLE ROW LEVEL SECURITY;

COMMIT;
