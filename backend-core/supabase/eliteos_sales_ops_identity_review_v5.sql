-- eliteOS Sales Ops identity review v5 — additive
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite v1/v2/v2.1/v3/v4.
--
-- Purpose:
--   Widen identity-review status to EXACT_SOURCE_ID (conclusive Monday source ID).
--   Bulk human-approval audit actions + match_method.
-- Does not auto-link on name.
-- Does not enable Monday/Moraware/QuickBooks writes.
-- Does not credit Moraware actuals.

alter table public.sales_ops_account_identity_reviews
  drop constraint if exists sales_ops_id_review_status_chk;

alter table public.sales_ops_account_identity_reviews
  add constraint sales_ops_id_review_status_chk
  check (status in (
    'EXACT_SOURCE_ID',
    'EXACT_AUTO_LINKABLE',
    'REVIEW_REQUIRED',
    'NO_CANDIDATE',
    'CONFLICT'
  ));

alter table public.sales_ops_account_identity_review_events
  drop constraint if exists sales_ops_id_review_event_action_chk;

alter table public.sales_ops_account_identity_review_events
  add constraint sales_ops_id_review_event_action_chk
  check (action in (
    'rebuild',
    'auto_link',
    'approve',
    'reject',
    'conflict_blocked',
    'bulk_approve',
    'bulk_reject',
    'skip'
  ));

alter table public.sales_ops_account_identity_review_events
  add column if not exists match_method text null;

comment on column public.sales_ops_account_identity_review_events.match_method is
  'Evidence method shown at decision time (exact_display_name, existing_monday_external_link, exact_alias, ...). Not automatic identity.';
