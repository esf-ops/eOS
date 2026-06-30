-- eliteOS — AI Takeoff Import Traceability Columns on quote_headers
--
-- Apply via Supabase Dashboard → SQL Editor, or psql.
-- Prerequisites: eos_quote_platform.sql, eos_quote_takeoff_visual_foundation.sql,
--                eliteos_quote_files_takeoff_storage.sql  (for quote_takeoff_jobs + quote_takeoff_results)
--
-- Adds two first-class FK columns that link an Internal Estimate quote back to the
-- AI Takeoff job and result snapshot it was created from. These enable:
--   • Forward lookup:  given a quote, find the source takeoff job/snapshot
--   • Reverse lookup:  given a takeoff job, find all quotes imported from it
--   • Audit:           immutable traceability for billing, dispute resolution, and model QA
--
-- Note: Traceability data is ALSO stored in calculation_snapshot.internal_ui.takeoff_import
-- (takeoffJobId / takeoffSnapshotId keys). The JSONB copy is always written; these direct
-- columns are an indexed, FK-enforced layer on top. The import code will automatically start
-- populating them once this migration is applied and the server restarts.
--
-- Apply: paste into Supabase Dashboard → SQL Editor → Run
-- After applying: restart the backend service (or trigger a PostgREST schema reload) so the
--   new columns appear in the schema cache and the import code can write to them.
-- =============================================================================

alter table public.quote_headers
  add column if not exists source_takeoff_job_id uuid
    references public.quote_takeoff_jobs (id) on delete set null,
  add column if not exists source_takeoff_snapshot_id uuid
    references public.quote_takeoff_results (id) on delete set null;

create index if not exists idx_quote_headers_source_takeoff_job_id
  on public.quote_headers (source_takeoff_job_id)
  where source_takeoff_job_id is not null;

create index if not exists idx_quote_headers_source_takeoff_snapshot_id
  on public.quote_headers (source_takeoff_snapshot_id)
  where source_takeoff_snapshot_id is not null;

comment on column public.quote_headers.source_takeoff_job_id is
  'AI Takeoff job this quote was imported from (nullable — set only for takeoff-import quotes). References quote_takeoff_jobs.id.';

comment on column public.quote_headers.source_takeoff_snapshot_id is
  'Specific approved takeoff result snapshot this quote was imported from. References quote_takeoff_results.id.';
