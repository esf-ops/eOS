-- eOS Brain Identity Resolution — ADDITIVE SCHEMA PROPOSAL
-- DO NOT RUN AUTOMATICALLY. Apply manually in Supabase after review.
--
-- Purpose: generic canonical entities, source evidence rows, links, suggestions, and audit.
-- Safety: additive only; no destructive changes to existing tables.

-- Extensions (if needed for gen_random_uuid):
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) eos_entities — canonical company-level entities
CREATE TABLE IF NOT EXISTS public.eos_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  display_name text NOT NULL,
  canonical_key text,
  active boolean DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  raw_metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_eos_entities_entity_type ON public.eos_entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_eos_entities_canonical_key ON public.eos_entities (canonical_key);
CREATE INDEX IF NOT EXISTS idx_eos_entities_active ON public.eos_entities (active);

-- 2) eos_source_records — raw evidence per upstream system
CREATE TABLE IF NOT EXISTS public.eos_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_record_type text NOT NULL,
  source_record_id text,
  source_name text,
  normalized_source_name text,
  raw_json jsonb,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  sync_run_id text NULL,
  active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_eos_source_records_source_system ON public.eos_source_records (source_system);
CREATE INDEX IF NOT EXISTS idx_eos_source_records_source_record_type ON public.eos_source_records (source_record_type);
CREATE INDEX IF NOT EXISTS idx_eos_source_records_normalized_source_name ON public.eos_source_records (normalized_source_name);
CREATE INDEX IF NOT EXISTS idx_eos_source_records_active ON public.eos_source_records (active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_eos_source_records_system_type_id
  ON public.eos_source_records (source_system, source_record_type, source_record_id)
  WHERE source_record_id IS NOT NULL AND trim(source_record_id) <> '';

-- 3) eos_entity_links — source record -> canonical entity (governed)
CREATE TABLE IF NOT EXISTS public.eos_entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eos_entity_id uuid REFERENCES public.eos_entities(id),
  source_record_id uuid REFERENCES public.eos_source_records(id),
  entity_type text NOT NULL,
  source_system text,
  source_name text,
  normalized_source_name text,
  match_type text,
  confidence text,
  status text DEFAULT 'needs_review',
  approved boolean DEFAULT false,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  link_status text DEFAULT 'active',
  effective_start_date date,
  effective_end_date date,
  notes text,
  raw_match_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_entity_links_eos_entity_id ON public.eos_entity_links (eos_entity_id);
CREATE INDEX IF NOT EXISTS idx_eos_entity_links_source_record_id ON public.eos_entity_links (source_record_id);
CREATE INDEX IF NOT EXISTS idx_eos_entity_links_entity_type ON public.eos_entity_links (entity_type);
CREATE INDEX IF NOT EXISTS idx_eos_entity_links_status ON public.eos_entity_links (status);
CREATE INDEX IF NOT EXISTS idx_eos_entity_links_approved ON public.eos_entity_links (approved);
CREATE INDEX IF NOT EXISTS idx_eos_entity_links_link_status ON public.eos_entity_links (link_status);

-- Optional (review before enabling): one active approved link per source row + entity type
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_eos_entity_links_one_active_approved_per_source
--   ON public.eos_entity_links (source_record_id, entity_type)
--   WHERE link_status = 'active' AND approved = true;

-- 4) eos_identity_suggestions — batch/job output prior to human decision
CREATE TABLE IF NOT EXISTS public.eos_identity_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  source_record_id uuid REFERENCES public.eos_source_records(id),
  suggested_eos_entity_id uuid REFERENCES public.eos_entities(id),
  suggested_display_name text,
  match_type text,
  confidence numeric,
  confidence_label text,
  rationale text,
  alternate_matches jsonb,
  suggestion_status text DEFAULT 'needs_review',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  raw_suggestion jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_identity_suggestions_entity_type ON public.eos_identity_suggestions (entity_type);
CREATE INDEX IF NOT EXISTS idx_eos_identity_suggestions_suggestion_status ON public.eos_identity_suggestions (suggestion_status);
CREATE INDEX IF NOT EXISTS idx_eos_identity_suggestions_confidence_label ON public.eos_identity_suggestions (confidence_label);

-- 5) eos_identity_audit_log — append-style governance trail
CREATE TABLE IF NOT EXISTS public.eos_identity_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text,
  eos_entity_id uuid NULL,
  source_record_id uuid NULL,
  entity_link_id uuid NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid NULL,
  changed_at timestamptz DEFAULT now(),
  reason text
);

CREATE INDEX IF NOT EXISTS idx_eos_identity_audit_log_entity_type ON public.eos_identity_audit_log (entity_type);
CREATE INDEX IF NOT EXISTS idx_eos_identity_audit_log_eos_entity_id ON public.eos_identity_audit_log (eos_entity_id);
CREATE INDEX IF NOT EXISTS idx_eos_identity_audit_log_source_record_id ON public.eos_identity_audit_log (source_record_id);
CREATE INDEX IF NOT EXISTS idx_eos_identity_audit_log_changed_at ON public.eos_identity_audit_log (changed_at);
