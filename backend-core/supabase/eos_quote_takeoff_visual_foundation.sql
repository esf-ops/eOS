-- eliteOS Quote Platform — AI takeoff & visual layout foundation (ADDITIVE)
-- Run manually AFTER: backend-core/supabase/eos_quote_platform.sql
-- Does NOT modify Moraware, Sales, or Identity tables.
--
-- Design goals:
-- - Async AI takeoff jobs + structured results (never auto-final without review policy).
-- - Visual layouts (2D/3D-lite geometry JSON) tied to quotes and optionally rooms.
-- - Measurement provenance per room for calculator + audit (feeds calculation_snapshot.measurement_source in app).
-- - Public responses must strip takeoff confidence, staff notes, and protected pricing (application layer).

-- ---------------------------------------------------------------------------
-- 1) Takeoff jobs (async pipeline; plans → candidate measurements)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_takeoff_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  source_type text NOT NULL,
  requested_by text,
  assigned_to text,
  confidence_score numeric,
  review_status text NOT NULL DEFAULT 'needs_review',
  input_file_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_takeoff_jobs_status_ck CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'processing'::text,
        'completed'::text,
        'failed'::text,
        'cancelled'::text
      ]
    )
  ),
  CONSTRAINT quote_takeoff_jobs_review_ck CHECK (
    review_status = ANY (
      ARRAY[
        'needs_review'::text,
        'in_review'::text,
        'approved'::text,
        'rejected'::text,
        'superseded'::text
      ]
    )
  )
);

COMMENT ON TABLE public.quote_takeoff_jobs IS 'Async AI/plan takeoff runs; results stay provisional until staff review and explicit apply-to-quote.';
COMMENT ON COLUMN public.quote_takeoff_jobs.input_file_ids IS 'Optional Supabase storage object ids; non-UUID file refs may live in metadata.input_file_refs.';
COMMENT ON COLUMN public.quote_takeoff_jobs.result_summary IS 'High-level counts, model version, latency — not authoritative line pricing.';

CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_quote ON public.quote_takeoff_jobs (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_status ON public.quote_takeoff_jobs (quote_id, status);
CREATE INDEX IF NOT EXISTS idx_quote_takeoff_jobs_review ON public.quote_takeoff_jobs (review_status);

-- ---------------------------------------------------------------------------
-- 2) Takeoff results (per-room / per-surface lines; approval workflow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_takeoff_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  takeoff_job_id uuid NOT NULL REFERENCES public.quote_takeoff_jobs (id) ON DELETE CASCADE,
  room_name text,
  surface_type text,
  measurement_type text,
  quantity numeric,
  unit_type text,
  confidence_score numeric,
  source_reference text,
  needs_review boolean NOT NULL DEFAULT true,
  approved_by text,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_takeoff_results IS 'Candidate measurements from takeoff; merge into quote_rooms / quote_measurement_sources only after review.';
COMMENT ON COLUMN public.quote_takeoff_results.needs_review IS 'When true, calculator must not treat row as final measurement unless product policy explicitly allows.';

CREATE INDEX IF NOT EXISTS idx_quote_takeoff_results_quote ON public.quote_takeoff_results (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_takeoff_results_job ON public.quote_takeoff_results (takeoff_job_id);
CREATE INDEX IF NOT EXISTS idx_quote_takeoff_results_review ON public.quote_takeoff_results (quote_id, needs_review);

-- ---------------------------------------------------------------------------
-- 3) Visual layouts (geometry + measurements JSON; optional room link)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_visual_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  quote_room_id uuid REFERENCES public.quote_rooms (id) ON DELETE SET NULL,
  layout_name text,
  layout_type text,
  source_type text,
  room_name text,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
  rendered_preview_path text,
  created_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quote_visual_layouts IS 'Client-authored or assisted layouts; geometry is intentionally schemaless JSON until format stabilizes.';
COMMENT ON COLUMN public.quote_visual_layouts.geometry IS 'Future: normalized polylines, anchors, cabinet runs; keep version in metadata.schema_version.';

CREATE INDEX IF NOT EXISTS idx_quote_visual_layouts_quote ON public.quote_visual_layouts (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_visual_layouts_room ON public.quote_visual_layouts (quote_room_id);

-- ---------------------------------------------------------------------------
-- 4) Measurement sources (provenance linking rooms to takeoff/layout/manual)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_measurement_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quote_headers (id) ON DELETE CASCADE,
  quote_room_id uuid REFERENCES public.quote_rooms (id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  countertop_sqft numeric,
  backsplash_sqft numeric,
  total_sqft numeric,
  confidence_score numeric,
  is_active boolean NOT NULL DEFAULT true,
  approved_by text,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_measurement_sources_type_ck CHECK (
    source_type = ANY (
      ARRAY[
        'manual_dimensions'::text,
        'room_builder'::text,
        'visual_layout'::text,
        'ai_takeoff'::text,
        'staff_adjusted'::text,
        'imported_template'::text,
        'legacy'::text,
        'other'::text
      ]
    )
  )
);

COMMENT ON TABLE public.quote_measurement_sources IS 'Which takeoff/layout/manual edit produced the sqft driving pricing; supports stacked history via is_active.';
COMMENT ON COLUMN public.quote_measurement_sources.source_id IS 'Optional FK target (e.g. quote_takeoff_results.id, quote_visual_layouts.id) — not enforced as polymorphic FK.';

CREATE INDEX IF NOT EXISTS idx_quote_measurement_sources_quote ON public.quote_measurement_sources (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_measurement_sources_room ON public.quote_measurement_sources (quote_room_id);
CREATE INDEX IF NOT EXISTS idx_quote_measurement_sources_active ON public.quote_measurement_sources (quote_id, is_active);
CREATE INDEX IF NOT EXISTS idx_quote_measurement_sources_source ON public.quote_measurement_sources (source_type, source_id);
