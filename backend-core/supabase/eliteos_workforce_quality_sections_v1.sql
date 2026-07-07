-- eliteOS Workforce Quality — section-based weekly grading (additive)
-- Apply after eliteos_workforce_quality_v1.sql and eliteos_workforce_quality_roster_v1.sql

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
