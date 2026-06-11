-- Manual apply (Supabase SQL editor) — quote reliability + 15k-readiness indexes.
-- Re-run is safe (IF NOT EXISTS). Complements eliteos_quote_library_scalability_indexes.sql.

-- Person / account search columns used by Quote Library global search.
CREATE INDEX IF NOT EXISTS idx_quote_headers_org_prepared_by
  ON public.quote_headers (organization_id, prepared_by);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_created_by
  ON public.quote_headers (organization_id, created_by);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_account_name
  ON public.quote_headers (organization_id, account_name);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_quote_number_base
  ON public.quote_headers (organization_id, quote_number_base);

CREATE INDEX IF NOT EXISTS idx_quote_headers_org_family_current
  ON public.quote_headers (organization_id, quote_family_root_id, is_current_revision);

-- Snapshot account path used for search fallback (expression index).
CREATE INDEX IF NOT EXISTS idx_quote_headers_snapshot_internal_account
  ON public.quote_headers ((calculation_snapshot->'internal_ui'->>'account'))
  WHERE calculation_snapshot IS NOT NULL;

-- Optional trigram indexes for ilike '%term%' at scale (requires pg_trgm):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_customer_name_trgm
--   ON public.quote_headers USING gin (customer_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_project_name_trgm
--   ON public.quote_headers USING gin (project_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_quote_headers_account_name_trgm
--   ON public.quote_headers USING gin (account_name gin_trgm_ops);

COMMENT ON INDEX idx_quote_headers_org_prepared_by IS 'Quote Library search/filter by prepared_by';
COMMENT ON INDEX idx_quote_headers_org_created_by IS 'Quote Library search/filter by created_by';
COMMENT ON INDEX idx_quote_headers_org_account_name IS 'Quote Library account_name search';
COMMENT ON INDEX idx_quote_headers_org_quote_number_base IS 'Revision family base number lookup';
COMMENT ON INDEX idx_quote_headers_org_family_current IS 'Current revision per quote family';
COMMENT ON INDEX idx_quote_headers_snapshot_internal_account IS 'Search calculation_snapshot.internal_ui.account';
