-- Manual apply (Supabase SQL editor):
--   1) Open Supabase -> SQL -> New query.
--   2) Paste this file; run once. Re-run is safe (IF NOT EXISTS).
--   3) These indexes support Quote Library pagination/search/filter as quote history grows.
--
-- Do not apply automatically from the app deploy pipeline.

-- Default library list: org-scoped, latest revisions, not archived, newest first.
CREATE INDEX IF NOT EXISTS idx_quote_headers_org_latest_archive_updated
  ON public.quote_headers (organization_id, is_current_revision, archived_at, updated_at DESC);

-- Common filters used by Quote Library tabs and dropdowns.
CREATE INDEX IF NOT EXISTS idx_quote_headers_org_status_updated
  ON public.quote_headers (organization_id, quote_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_source_updated
  ON public.quote_headers (organization_id, quote_source, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_created
  ON public.quote_headers (organization_id, created_at DESC);

-- Quote-number lookup/search support.
CREATE INDEX IF NOT EXISTS idx_quote_headers_org_quote_number
  ON public.quote_headers (organization_id, quote_number);

-- Trigram indexes improve ilike '%term%' global search when pg_trgm is enabled.
-- Uncomment only if the extension is available/enabled in the target Supabase project.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_customer_name_trgm
--   ON public.quote_headers USING gin (customer_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_project_name_trgm
--   ON public.quote_headers USING gin (project_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_project_address_trgm
--   ON public.quote_headers USING gin (project_address gin_trgm_ops);
