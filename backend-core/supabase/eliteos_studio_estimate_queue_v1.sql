-- eliteOS Studio Estimate Queue v1 — operational open/activity columns
--
-- DO NOT APPLY AUTOMATICALLY. Manual apply after review.
-- Additive only on quote_intake_cases. Org-scoped via existing RLS.
--
-- Purpose:
--   Track first/last opened and last estimator activity for the Estimate Queue
--   dashboard without inventing a competing workflow-status table.

alter table public.quote_intake_cases
  add column if not exists first_opened_at timestamptz null,
  add column if not exists last_opened_at timestamptz null,
  add column if not exists last_activity_at timestamptz null,
  add column if not exists last_estimator_action text null;

comment on column public.quote_intake_cases.first_opened_at is
  'First time an estimator opened this case in Studio Estimate Queue / workspace.';
comment on column public.quote_intake_cases.last_opened_at is
  'Most recent estimator open of this case in Studio.';
comment on column public.quote_intake_cases.last_activity_at is
  'Most recent estimator activity timestamp for queue sorting.';
comment on column public.quote_intake_cases.last_estimator_action is
  'Short safe label of last estimator action (e.g. opened, assigned). Never stores secrets.';

create index if not exists quote_intake_cases_org_last_activity_idx
  on public.quote_intake_cases (organization_id, last_activity_at desc nulls last);

create index if not exists quote_intake_cases_org_received_idx
  on public.quote_intake_cases (organization_id, received_at desc nulls last);
