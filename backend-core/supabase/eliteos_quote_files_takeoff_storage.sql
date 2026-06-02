-- eliteOS — Quote Files + Takeoff Storage Foundation (DRAFT — DO NOT APPLY AUTOMATICALLY)
--
-- Apply manually in Supabase SQL editor after review + backup.
-- Prerequisites: eos_quote_platform.sql, eos_saas_foundation.sql,
--                eos_quote_takeoff_visual_foundation.sql, eliteos_audit_foundation.sql
--
-- Design:
--   quote_files is the GENERAL PURPOSE file attachment table for Internal Estimate,
--   partner quotes, and any other quote-related files. It is not specific to AI Takeoff.
--   AI Takeoff (takeoff_jobs / takeoff_results) is an OPTIONAL processing layer on top.
--
--   Actual file bytes live in Supabase Storage (private bucket), never in Postgres rows.
--   Postgres tracks metadata, ownership, quote linkage, lifecycle, and audit events.
--
-- Existing tables this file extends (additive only):
--   - quote_takeoff_jobs    (add organization_id, quote_file_id, nullable quote_id,
--                            model fields, timestamps, user UUID)
--   - quote_takeoff_results (add organization_id, schema_version, normalized JSON cols,
--                            review_status text, reviewer UUID)
--
-- New tables:
--   - quote_files           (general file attachment metadata)
--   - quote_file_events     (audit/lifecycle events for file actions)
--
-- Storage bucket convention (configure in Supabase dashboard, NOT via SQL):
--   Bucket: eliteos-quote-files   (private; no public read)
--   Path:   org/{organization_id}/{context}/{context_id}/files/{quote_file_id}/{safe_filename}
--   Context examples:
--     internal-quotes/{quote_id}/files/{file_id}/{filename}
--     partner-quotes/{quote_id}/files/{file_id}/{filename}
--     takeoff-jobs/{takeoff_job_id}/files/{file_id}/{filename}
--     unlinked/files/{file_id}/{filename}
--   Download: signed URL (generated server-side, never expose storage_path in browser)
--
-- Security:
--   All rows scoped by organization_id.
--   Backend validates quote/org ownership before issuing signed URL.
--   Never expose storage_path directly to customers or untrusted clients.
--   storage_provider field allows future migration to R2/S3 without schema change.
-- =============================================================================


-- =============================================================================
-- A. quote_files — general file attachment metadata
-- =============================================================================
--
-- One row per uploaded file. Files themselves live in object storage.
-- A file can exist without a quote (pre-quote upload), without a takeoff job
-- (most files will never run through AI Takeoff), and without a partner account.
--
-- quote_id references quote_headers.id regardless of quote_source. Use
-- quote_headers.quote_source to distinguish internal_quote / partner_quote /
-- public_consumer. No separate internal_quote_id column is needed because
-- quote_headers is the unified quote identity table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_files (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,

  -- Quote linkage (nullable — files can exist before a quote is created)
  -- quote_headers.quote_source tells you whether this is internal/partner/public.
  quote_id            uuid        REFERENCES public.quote_headers (id) ON DELETE SET NULL,

  -- Optional partner account scoping (for pre-quote partner uploads)
  partner_account_id  uuid        REFERENCES public.quote_partner_accounts (id) ON DELETE SET NULL,

  -- Optional takeoff job linkage (most files will NOT have a takeoff job)
  takeoff_job_id      uuid        REFERENCES public.quote_takeoff_jobs (id) ON DELETE SET NULL,

  -- Who uploaded this file
  uploaded_by_user_id uuid        REFERENCES auth.users (id) ON DELETE SET NULL,

  -- Object storage metadata (bytes live in storage, not here)
  storage_provider    text        NOT NULL DEFAULT 'supabase',
  storage_bucket      text        NOT NULL DEFAULT 'eliteos-quote-files',
  storage_path        text        NOT NULL,          -- org/{org_id}/.../{file_id}/{safe_name}
  original_filename   text        NOT NULL,          -- user-provided name at upload time
  safe_filename       text,                          -- sanitized version used in storage path
  mime_type           text,
  file_size_bytes     bigint,
  file_hash           text,                          -- sha256 hex; for duplicate detection later

  -- File classification
  file_role           text        NOT NULL DEFAULT 'other',
  --   cabinet_plan      — floor plan / cabinet elevation showing countertop layout
  --   measurement_plan  — field measurement sketch or drawing
  --   signed_quote      — customer-signed PDF approval
  --   customer_pdf      — generated customer estimate PDF
  --   shop_drawing      — internal fabrication drawing
  --   photo             — site/slab/installation photo
  --   spec              — material spec sheet
  --   contract          — purchase or fabrication contract
  --   other             — uncategorized

  visibility          text        NOT NULL DEFAULT 'internal',
  --   internal          — staff/fabricator only
  --   partner           — visible to the linked partner account
  --   customer          — customer-accessible (future; tightly gated)

  status              text        NOT NULL DEFAULT 'active',
  --   uploaded          — newly uploaded, not yet confirmed
  --   active            — confirmed; shown in file panels
  --   archived          — hidden from default lists; preserved for audit
  --   deleted           — soft-deleted; storage object may be purged separately

  -- Lifecycle timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  archived_at         timestamptz,

  -- Extensible metadata (model pipeline output, OCR results, etc.)
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT quote_files_role_ck CHECK (
    file_role IN (
      'cabinet_plan', 'measurement_plan', 'signed_quote', 'customer_pdf',
      'shop_drawing', 'photo', 'spec', 'contract', 'other'
    )
  ),
  CONSTRAINT quote_files_visibility_ck CHECK (
    visibility IN ('internal', 'partner', 'customer')
  ),
  CONSTRAINT quote_files_status_ck CHECK (
    status IN ('uploaded', 'active', 'archived', 'deleted')
  ),
  CONSTRAINT quote_files_provider_ck CHECK (
    storage_provider IN ('supabase', 'r2', 's3', 'other')
  ),
  -- Prevent duplicate storage paths within the same bucket
  CONSTRAINT quote_files_storage_path_unique UNIQUE (storage_bucket, storage_path)
);

COMMENT ON TABLE public.quote_files IS
  'General-purpose file attachment metadata for Internal Estimate and partner/public quotes. '
  'File bytes live in Supabase Storage (eliteos-quote-files bucket, private). '
  'Postgres tracks ownership, quote linkage, and lifecycle only. '
  'AI Takeoff (takeoff_job_id) is an optional processing layer — most files will never run through it.';

COMMENT ON COLUMN public.quote_files.quote_id IS
  'References quote_headers.id. Use quote_headers.quote_source to distinguish '
  'internal_quote / partner_quote / public_consumer. Nullable — a file may be '
  'uploaded before a quote exists and linked later.';

COMMENT ON COLUMN public.quote_files.storage_path IS
  'Path within the storage bucket. Never expose this directly to untrusted clients. '
  'Backend generates a short-lived signed URL for every download.';

COMMENT ON COLUMN public.quote_files.storage_provider IS
  'Allows future migration to Cloudflare R2 or AWS S3 without schema change.';

COMMENT ON COLUMN public.quote_files.file_hash IS
  'SHA-256 hex digest of the raw file bytes. Nullable; populated at upload time when available. '
  'Supports duplicate detection and integrity verification.';

COMMENT ON COLUMN public.quote_files.file_role IS
  'Semantic role for this file. Controls which panels show it and what actions are available.';

COMMENT ON COLUMN public.quote_files.metadata IS
  'Extensible bag: OCR status, AI model pipeline version, upload source, '
  'Moraware handoff result, external references, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_files_org           ON public.quote_files (organization_id);
CREATE INDEX IF NOT EXISTS idx_quote_files_quote         ON public.quote_files (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_files_partner       ON public.quote_files (partner_account_id) WHERE partner_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_files_takeoff_job   ON public.quote_files (takeoff_job_id) WHERE takeoff_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_files_uploaded_by   ON public.quote_files (uploaded_by_user_id) WHERE uploaded_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_files_org_status    ON public.quote_files (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_files_org_role      ON public.quote_files (organization_id, file_role);
CREATE INDEX IF NOT EXISTS idx_quote_files_org_created   ON public.quote_files (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_files_file_hash     ON public.quote_files (file_hash) WHERE file_hash IS NOT NULL;


-- =============================================================================
-- B. quote_file_events — audit trail for file lifecycle and handoff actions
-- =============================================================================
--
-- Append-only audit log. Complements eos_action_log (which handles head-level
-- actions) with file-specific granularity. One row per meaningful event.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_file_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  quote_file_id    uuid        NOT NULL REFERENCES public.quote_files (id) ON DELETE CASCADE,
  actor_user_id    uuid        REFERENCES auth.users (id) ON DELETE SET NULL,

  action           text        NOT NULL,
  --   uploaded             — file bytes confirmed in storage
  --   downloaded           — signed URL issued (user intent to download)
  --   linked_to_quote      — quote_files.quote_id set / updated
  --   linked_to_takeoff    — quote_files.takeoff_job_id set
  --   takeoff_started      — takeoff_job moved to processing
  --   takeoff_approved     — takeoff_result approved by staff
  --   takeoff_rejected     — takeoff_result rejected
  --   sent_to_moraware     — file sent to Moraware handoff
  --   archived             — status changed to archived
  --   deleted              — status changed to deleted (soft)
  --   visibility_changed   — visibility value updated

  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- metadata examples:
  --   { "quote_id": "...", "quote_source": "internal_quote" }   for linked_to_quote
  --   { "takeoff_job_id": "..." }                                for takeoff_started
  --   { "moraware_job_id": "...", "outcome": "success" }        for sent_to_moraware
  --   { "signed_url_expires_at": "..." }                        for downloaded
  --   { "old_visibility": "internal", "new_visibility": "partner" }

  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quote_file_events_action_ck CHECK (
    action IN (
      'uploaded', 'downloaded', 'linked_to_quote', 'linked_to_takeoff',
      'takeoff_started', 'takeoff_approved', 'takeoff_rejected',
      'sent_to_moraware', 'archived', 'deleted', 'visibility_changed'
    )
  )
);

COMMENT ON TABLE public.quote_file_events IS
  'Append-only audit trail for file lifecycle actions. One row per event. '
  'Complements eos_action_log with file-specific granularity.';

COMMENT ON COLUMN public.quote_file_events.actor_user_id IS
  'Nullable — system-initiated events (e.g. automatic archival) may have no actor.';

COMMENT ON COLUMN public.quote_file_events.metadata IS
  'Action-specific context: quote_id, takeoff_job_id, signed URL expiry, etc.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quote_file_events_org          ON public.quote_file_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_quote_file_events_file         ON public.quote_file_events (quote_file_id);
CREATE INDEX IF NOT EXISTS idx_quote_file_events_actor        ON public.quote_file_events (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_file_events_action       ON public.quote_file_events (action);
CREATE INDEX IF NOT EXISTS idx_quote_file_events_created      ON public.quote_file_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_file_events_file_created ON public.quote_file_events (quote_file_id, created_at DESC);


-- =============================================================================
-- C. Additive changes to existing quote_takeoff_jobs
--    (eos_quote_takeoff_visual_foundation.sql)
-- =============================================================================
--
-- EXISTING: quote_takeoff_jobs has quote_id NOT NULL (requires a quote upfront).
--           This block makes quote_id nullable (constraint relaxation — backward-safe)
--           and adds org scoping, proper file FK, user UUID, and model metadata.
--
-- IMPORTANT: Making quote_id nullable allows pre-quote takeoff flows:
--   AI Takeoff Lab → quote_files created → takeoff_job created (no quote yet)
--   → takeoff approved → quote created → quote_id backfilled.
--   Existing rows with non-null quote_id are unaffected.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.quote_takeoff_jobs') IS NOT NULL THEN

    -- Org scoping (additive)
    ALTER TABLE public.quote_takeoff_jobs
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

    -- Primary plan file linkage (one canonical file per job; extras via quote_files.takeoff_job_id)
    -- quote_files must be created before this foreign key can reference it.
    -- If quote_files does not exist yet when this runs, wrap in a DO block that checks.
    IF to_regclass('public.quote_files') IS NOT NULL THEN
      ALTER TABLE public.quote_takeoff_jobs
        ADD COLUMN IF NOT EXISTS quote_file_id uuid REFERENCES public.quote_files (id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.quote_takeoff_jobs
        ADD COLUMN IF NOT EXISTS quote_file_id uuid; -- FK added manually after quote_files created
    END IF;

    -- Make quote_id nullable to allow pre-quote takeoff jobs
    ALTER TABLE public.quote_takeoff_jobs
      ALTER COLUMN quote_id DROP NOT NULL;

    -- Proper user UUID (replaces freetext requested_by; keep requested_by for backward compat)
    ALTER TABLE public.quote_takeoff_jobs
      ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

    -- AI model metadata
    ALTER TABLE public.quote_takeoff_jobs
      ADD COLUMN IF NOT EXISTS model_provider text,
      ADD COLUMN IF NOT EXISTS model_version  text;

    -- Pipeline timing
    ALTER TABLE public.quote_takeoff_jobs
      ADD COLUMN IF NOT EXISTS started_at   timestamptz,
      ADD COLUMN IF NOT EXISTS completed_at timestamptz;

    -- Indexes for new columns
    CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_org
      ON public.quote_takeoff_jobs (organization_id) WHERE organization_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_file
      ON public.quote_takeoff_jobs (quote_file_id) WHERE quote_file_id IS NOT NULL;

    COMMENT ON COLUMN public.quote_takeoff_jobs.quote_id IS
      'Nullable after v2 additive migration. Allows pre-quote takeoff jobs in AI Takeoff Lab. '
      'Set to quote_headers.id once a quote is created from the approved takeoff.';

    COMMENT ON COLUMN public.quote_takeoff_jobs.quote_file_id IS
      'The canonical input plan file for this job. Additional files attached via quote_files.takeoff_job_id.';

  END IF;
END $$;


-- =============================================================================
-- D. Additive changes to existing quote_takeoff_results
--    (eos_quote_takeoff_visual_foundation.sql)
-- =============================================================================
--
-- EXISTING: quote_takeoff_results has sparse row-per-measurement structure
--           (room_name, surface_type, quantity). The new takeoff contract stores
--           the full structured result as JSON blobs alongside the existing columns.
--
-- Additive only — existing columns and rows untouched.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.quote_takeoff_results') IS NOT NULL THEN

    -- Org scoping
    ALTER TABLE public.quote_takeoff_results
      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations (id);

    -- Contract version that produced this result
    ALTER TABLE public.quote_takeoff_results
      ADD COLUMN IF NOT EXISTS schema_version text;

    -- Full structured JSON from the takeoff contract pipeline
    ALTER TABLE public.quote_takeoff_results
      ADD COLUMN IF NOT EXISTS raw_ai_result_json        jsonb, -- AI output before normalization (audit only)
      ADD COLUMN IF NOT EXISTS normalized_takeoff_json   jsonb, -- validated TakeoffResult (schema v1.0+)
      ADD COLUMN IF NOT EXISTS computed_measurements_json jsonb, -- output of computeTakeoffMeasurements()
      ADD COLUMN IF NOT EXISTS validation_diagnostics_json jsonb, -- output of validateTakeoffResult()
      ADD COLUMN IF NOT EXISTS import_plan_json           jsonb; -- output of planTakeoffImport()

    -- Structured review status (replaces boolean needs_review for richer workflow)
    -- Keep needs_review boolean for backward compat; add review_status text in parallel.
    ALTER TABLE public.quote_takeoff_results
      ADD COLUMN IF NOT EXISTS review_status text,
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

    -- Index
    CREATE INDEX IF NOT EXISTS idx_quote_takeoff_results_org
      ON public.quote_takeoff_results (organization_id) WHERE organization_id IS NOT NULL;

    COMMENT ON COLUMN public.quote_takeoff_results.review_status IS
      'needs_review | in_review | approved | rejected. Parallel to boolean needs_review; '
      'prefer review_status in new code. needs_review boolean kept for backward compat.';

    COMMENT ON COLUMN public.quote_takeoff_results.normalized_takeoff_json IS
      'Full TakeoffResult (schema v1.0+) after AI output is validated and normalized. '
      'Never used directly for pricing — always re-run through computeTakeoffMeasurements().';

    COMMENT ON COLUMN public.quote_takeoff_results.raw_ai_result_json IS
      'Verbatim AI output before normalization. Stored for audit and model improvement only. '
      'Must not be shown to customers or used as pricing authority.';

  END IF;
END $$;


-- =============================================================================
-- E. RLS policy comments (policies to be applied separately after review)
-- =============================================================================
--
-- Current RLS posture for quote_files:
--   - No RLS enabled until backend read/write patterns are validated.
--   - Backend reads/writes via service_role (behind auth + head access gates).
--   - Plan for future row-level policies:
--
-- INTERNAL STAFF (authenticated, role = 'staff' or 'admin' for the org):
--   SELECT WHERE organization_id = (session org)
--   INSERT/UPDATE WHERE organization_id = (session org)
--
-- PARTNER USERS (authenticated, role = 'partner_user' for the partner account):
--   SELECT WHERE
--     organization_id = (session fabricator org)
--     AND partner_account_id = (session partner account)
--     AND visibility IN ('partner', 'customer')
--   No INSERT/UPDATE/DELETE (backend-mediated via signed-upload URL)
--
-- CUSTOMERS (future; not yet implemented):
--   SELECT WHERE
--     visibility = 'customer'
--     AND quote_id = (session customer quote — verified in application layer)
--   No INSERT/UPDATE/DELETE
--
-- ANON: No access.
--
-- STORAGE BUCKET (eliteos-quote-files):
--   - Private: no public READ
--   - Service role: full access
--   - All downloads: server-side signed URL (short TTL, e.g. 1 hour)
--   - Never expose storage_path to untrusted clients; it reveals org + quote structure
--   - Backend must verify ownership before issuing signed URL:
--       1. Confirm quote_files.organization_id == session org
--       2. Confirm quote_files.status == 'active' (not deleted/archived)
--       3. Confirm requester has access to the linked quote/partner account
--       4. Issue signed URL; log event in quote_file_events (action = 'downloaded')
-- =============================================================================


-- =============================================================================
-- Summary of what this file contains
-- =============================================================================
--
-- NEW tables:
--   public.quote_files         — general file attachment metadata (Internal Estimate + AI Takeoff)
--   public.quote_file_events   — append-only audit trail for file lifecycle actions
--
-- ADDITIVE changes to existing tables:
--   public.quote_takeoff_jobs
--     + organization_id uuid
--     + quote_file_id uuid  (FK to quote_files; primary plan file for the job)
--     + quote_id altered: NOT NULL → nullable  (allows pre-quote takeoff)
--     + created_by_user_id uuid
--     + model_provider text, model_version text
--     + started_at timestamptz, completed_at timestamptz
--
--   public.quote_takeoff_results
--     + organization_id uuid
--     + schema_version text
--     + raw_ai_result_json jsonb
--     + normalized_takeoff_json jsonb
--     + computed_measurements_json jsonb
--     + validation_diagnostics_json jsonb
--     + import_plan_json jsonb
--     + review_status text
--     + reviewed_by_user_id uuid
--     + reviewed_at timestamptz
--
-- NOT APPLIED: RLS policies (apply separately after backend patterns confirmed)
-- NOT CREATED:  Supabase Storage bucket (create via dashboard: eliteos-quote-files, private)
-- =============================================================================
