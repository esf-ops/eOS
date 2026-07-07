-- eliteOS Workforce Quality — section-based weekly grading (additive)
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
--
-- Prerequisites (apply first if not already applied):
--   backend-core/supabase/eliteos_workforce_quality_v1.sql
--   backend-core/supabase/eliteos_workforce_quality_roster_v1.sql

create extension if not exists pgcrypto;

-- ── Grading sections (org-scoped operational areas) ───────────────────────────

create table if not exists public.workforce_grading_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  goal_display text not null default '0',
  goal_numeric numeric(14, 2),
  metric_kind text not null default 'count'
    check (metric_kind in ('count', 'days', 'production', 'currency', 'hours')),
  grading_enabled boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unit_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workforce_grading_sections_org_name
  on public.workforce_grading_sections (organization_id, lower(name));

create index if not exists idx_workforce_grading_sections_org_active_sort
  on public.workforce_grading_sections (organization_id, is_active, sort_order);

-- ── Link mistakes to sections (people are no longer graded) ───────────────────

alter table public.workforce_mistakes
  add column if not exists section_id uuid references public.workforce_grading_sections (id) on delete set null;

create index if not exists idx_workforce_mistakes_org_section_week
  on public.workforce_mistakes (organization_id, section_id, week_start)
  where section_id is not null;

-- ── Manual weekly metric values (lead times, production, quoting, etc.) ───────

create table if not exists public.workforce_section_week_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  section_id uuid not null references public.workforce_grading_sections (id) on delete cascade,
  week_start date not null,
  actual_numeric numeric(14, 2),
  actual_display text,
  logged_by_user_id uuid,
  updated_at timestamptz not null default now(),
  unique (organization_id, section_id, week_start)
);

create index if not exists idx_workforce_section_week_values_org_week
  on public.workforce_section_week_values (organization_id, week_start);

-- ── Frozen weekly section grades ──────────────────────────────────────────────

create table if not exists public.workforce_section_week_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  section_id uuid not null references public.workforce_grading_sections (id) on delete cascade,
  week_start date not null,
  incident_count integer not null default 0,
  actual_display text,
  letter_grade text,
  goal_display text not null default '0',
  snapshotted_at timestamptz not null default now(),
  unique (organization_id, section_id, week_start)
);

create index if not exists idx_workforce_section_snapshots_org_week
  on public.workforce_section_week_snapshots (organization_id, week_start desc);

comment on table public.workforce_grading_sections is
  'Org-scoped operational grading sections (e.g. shop remakes, lead times).';
comment on table public.workforce_section_week_values is
  'Manual weekly metric entry for non-count sections (production SF, lead times, etc.).';
comment on table public.workforce_section_week_snapshots is
  'Frozen letter grade per section per closed week.';

-- ── Default ESF operational sections (idempotent seed) ────────────────────────

insert into public.workforce_grading_sections (
  id,
  organization_id,
  name,
  goal_display,
  goal_numeric,
  metric_kind,
  grading_enabled,
  sort_order,
  unit_label,
  is_active
)
select
  v.id,
  o.id,
  v.name,
  v.goal_display,
  v.goal_numeric,
  v.metric_kind,
  v.grading_enabled,
  v.sort_order,
  v.unit_label,
  true
from public.organizations o
cross join (
  values
    ('b2000001-0001-4001-8001-000000000001'::uuid, 'Office induced service calls/remakes', '0', 0::numeric, 'count', true, 10, null::text),
    ('b2000001-0001-4001-8001-000000000002'::uuid, 'Templating induced service calls/remakes', '0', 0::numeric, 'count', true, 20, null::text),
    ('b2000001-0001-4001-8001-000000000003'::uuid, 'Template/Install lead times', '14', 14::numeric, 'days', true, 30, 'days'),
    ('b2000001-0001-4001-8001-000000000004'::uuid, 'Outside partner remakes', '0', 0::numeric, 'count', true, 40, null::text),
    ('b2000001-0001-4001-8001-000000000005'::uuid, 'Outside partner missed quality control inspections', '0', 0::numeric, 'count', true, 50, null::text),
    ('b2000001-0001-4001-8001-000000000006'::uuid, 'Programming induced remakes/service calls', '0', 0::numeric, 'count', true, 60, null::text),
    ('b2000001-0001-4001-8001-000000000007'::uuid, 'Weekly quoting value', 'TBD', null::numeric, 'currency', false, 70, 'USD'),
    ('b2000001-0001-4001-8001-000000000008'::uuid, 'Plumbing accessories non billable service calls', '0', 0::numeric, 'count', true, 80, null::text),
    ('b2000001-0001-4001-8001-000000000009'::uuid, 'Shop induced remakes/service calls', '0', 0::numeric, 'count', true, 90, null::text),
    ('b2000001-0001-4001-8001-000000000010'::uuid, 'Weekly/daily shop production', '9,250sf weekly / 1,850sf daily', 9250::numeric, 'production', true, 100, 'sf weekly'),
    ('b2000001-0001-4001-8001-000000000011'::uuid, 'Shop machinery down time', '0', 0::numeric, 'hours', true, 110, 'hrs'),
    ('b2000001-0001-4001-8001-000000000012'::uuid, 'ESF non billable service calls', '0', 0::numeric, 'count', true, 120, null::text),
    ('b2000001-0001-4001-8001-000000000013'::uuid, 'Installation induced service calls/remakes', '0', 0::numeric, 'count', true, 130, null::text)
) as v(id, name, goal_display, goal_numeric, metric_kind, grading_enabled, sort_order, unit_label)
where o.organization_key = 'elite_stone_fabrication'
on conflict (id) do update set
  name = excluded.name,
  goal_display = excluded.goal_display,
  goal_numeric = excluded.goal_numeric,
  metric_kind = excluded.metric_kind,
  grading_enabled = excluded.grading_enabled,
  sort_order = excluded.sort_order,
  unit_label = excluded.unit_label,
  is_active = excluded.is_active,
  updated_at = now();
