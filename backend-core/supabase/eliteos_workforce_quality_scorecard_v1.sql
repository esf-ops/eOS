-- eliteOS Workforce Quality — scorecard workflow columns (additive)
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
--
-- Prerequisites (apply first if not already applied):
--   backend-core/supabase/eliteos_workforce_quality_v1.sql
--   backend-core/supabase/eliteos_workforce_quality_roster_v1.sql
--   backend-core/supabase/eliteos_workforce_quality_sections_v1.sql

alter table public.workforce_mistakes
  add column if not exists job_customer text;

alter table public.workforce_mistakes
  add column if not exists person_involved text;

alter table public.workforce_section_week_values
  add column if not exists value_payload jsonb not null default '{}'::jsonb;

comment on column public.workforce_mistakes.job_customer is
  'Optional job or customer reference for section incident logging.';
comment on column public.workforce_mistakes.person_involved is
  'Optional free-text person involved (not used for grading).';
comment on column public.workforce_section_week_values.value_payload is
  'Structured metric payload (median_days, average_days, weekly_sf, daily_sf, hours, currency).';
