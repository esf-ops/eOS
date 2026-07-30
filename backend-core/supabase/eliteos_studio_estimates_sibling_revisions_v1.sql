-- eliteOS Studio estimates — allow sibling non-superseded revisions
--
-- Product contract (FEATURE_DECISIONS §199 / V2 create-revision):
-- Opening an editable revision creates R+1 WITHOUT superseding the prior
-- approved/published row. R1 remains the customer publication target until
-- a newer revision successfully publishes.
--
-- The original unique partial index prevented that insert in Postgres
-- (in-memory tests never enforced it). Drop uniqueness; keep a plain index
-- for active-by-case lookups.
--
-- Apply before relying on createSiblingRevisionFrom / V2 create-revision
-- against Supabase.

drop index if exists uq_studio_estimates_one_active_per_case;

create index if not exists idx_studio_estimates_active_by_case
  on public.studio_estimates (organization_id, intake_case_id, revision desc)
  where status <> 'superseded';
