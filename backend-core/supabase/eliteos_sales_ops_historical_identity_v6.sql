-- eliteOS Sales Ops historical identity mapping v6 — additive
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite v1–v5.
--
-- Purpose:
--   Store a human-approved starter-alias → Account Directory UUID for
--   historical attribution without creating or merging a Monday CRM row.
--   Does not write sales_ops_sf_attribution_facts.
--   Does not enable Monday/Moraware/QuickBooks provider writes.

alter table public.sales_ops_identity_review_hints
  add column if not exists account_directory_account_id uuid null;

alter table public.sales_ops_identity_review_hints
  add column if not exists historical_identity_status text null;

alter table public.sales_ops_identity_review_hints
  drop constraint if exists sales_ops_id_hint_hist_status_chk;

alter table public.sales_ops_identity_review_hints
  add constraint sales_ops_id_hint_hist_status_chk
  check (
    historical_identity_status is null
    or historical_identity_status in ('approved')
  );

comment on column public.sales_ops_identity_review_hints.account_directory_account_id is
  'Human-approved canonical Account Directory UUID for historical starter-alias attribution. Not a Monday CRM link.';
comment on column public.sales_ops_identity_review_hints.historical_identity_status is
  'approved = Chris (or org admin) approved this alias→AD mapping for historical SF identity. Null = not approved.';
