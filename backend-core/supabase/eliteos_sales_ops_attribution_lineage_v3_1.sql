-- eliteOS Sales Ops attribution lineage v3.1 — additive
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite eliteos_sales_ops_performance_attribution_v3.sql or identity_review_v4/v5.
--
-- Purpose:
--   Preserve source lineage, attribution effective dates, and immutable ownership
--   evidence on sales_ops_sf_attribution_facts. Does not seed facts. Does not
--   enable Monday/Moraware/QuickBooks writes. Does not rewrite credited history.
--
-- Rollback (if applied and columns unused):
--   ALTER TABLE public.sales_ops_sf_attribution_facts
--     DROP COLUMN IF EXISTS source_lineage,
--     DROP COLUMN IF EXISTS ownership_evidence,
--     DROP COLUMN IF EXISTS attribution_effective_start,
--     DROP COLUMN IF EXISTS attribution_effective_end;

alter table public.sales_ops_sf_attribution_facts
  add column if not exists source_lineage jsonb not null default '{}'::jsonb;

alter table public.sales_ops_sf_attribution_facts
  add column if not exists ownership_evidence jsonb not null default '{}'::jsonb;

alter table public.sales_ops_sf_attribution_facts
  add column if not exists attribution_effective_start date null;

alter table public.sales_ops_sf_attribution_facts
  add column if not exists attribution_effective_end date null;

comment on column public.sales_ops_sf_attribution_facts.source_lineage is
  'Prepared form-fact / report-run lineage for COMPLETED_INSTALLATION_SF. Never a Monday current-owner pointer.';
comment on column public.sales_ops_sf_attribution_facts.ownership_evidence is
  'Immutable snapshot of who was credited and why. Later Monday assignment changes must not rewrite this.';
comment on column public.sales_ops_sf_attribution_facts.attribution_effective_start is
  'Credit effective date (completed-install date). Independent of current CRM owner.';
comment on column public.sales_ops_sf_attribution_facts.attribution_effective_end is
  'Null while the fact remains in force. Reversal rows cover removals.';
