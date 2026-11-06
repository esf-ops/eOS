-- =============================================================================
-- eliteos_slabsmith_partner_write_requests_v1.sql
--
-- Purpose:
--   Durable queue for Elite-controlled Slabsmith partner write intents (Thryve).
--   Partner calls Brain; Brain stores allowlisted field patches. A future Windows
--   apply worker (Elite-owned) may apply patches to Slabsmith SQL — that worker
--   and SLABSMITH_PARTNER_WRITE_ENABLED=1 are separate enablement steps.
--
-- Access model:
--   Brain (service_role) only. ENABLE RLS; revoke anon/authenticated; no
--   PostgREST client policies.
--
-- Does NOT:
--   - connect to Slabsmith SQL
--   - enable partner writes by itself
--   - mutate slab_inventory as authority for Slabsmith
--
-- Apply status: NOT APPLIED. Additive only. Draft — apply after review.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.slabsmith_partner_write_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_request_id text,
  slab_inventory_id uuid REFERENCES public.slab_inventory (id) ON DELETE SET NULL,
  external_slab_id text,
  inventory_id text,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'accepted',
  apply_status text NOT NULL DEFAULT 'queued_pending_worker',
  source text NOT NULL DEFAULT 'partner_api_v1',
  last_error text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_slabsmith_partner_write_status CHECK (
    status IN ('accepted', 'rejected', 'cancelled')
  ),
  CONSTRAINT chk_slabsmith_partner_write_apply_status CHECK (
    apply_status IN (
      'queued_pending_worker',
      'in_progress',
      'applied',
      'failed',
      'cancelled'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_slabsmith_partner_write_org_client_req
  ON public.slabsmith_partner_write_requests (organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slabsmith_partner_write_org_created
  ON public.slabsmith_partner_write_requests (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_slabsmith_partner_write_org_apply
  ON public.slabsmith_partner_write_requests (organization_id, apply_status, created_at)
  WHERE apply_status IN ('queued_pending_worker', 'in_progress', 'failed');

COMMENT ON TABLE public.slabsmith_partner_write_requests IS
  'Partner (Thryve) write intents for Slabsmith. Brain-only. SQL apply is a separate Windows worker + env gate.';

ALTER TABLE public.slabsmith_partner_write_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.slabsmith_partner_write_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.slabsmith_partner_write_requests TO service_role;

COMMIT;
