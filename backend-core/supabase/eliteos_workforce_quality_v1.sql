-- eliteOS Workforce Quality v1 — supervisor-logged mistakes + weekly letter grades
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).

create extension if not exists pgcrypto;

-- ── Categories (org-configurable, add-as-you-go) ─────────────────────────────

create table if not exists public.workforce_mistake_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workforce_mistake_categories_org_active
  on public.workforce_mistake_categories (organization_id, is_active, sort_order);

-- ── Mistake log (immutable audit trail; never deleted on weekly reset) ───────

create table if not exists public.workforce_mistakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_user_id uuid not null,
  logged_by_user_id uuid not null,
  category_id uuid references public.workforce_mistake_categories (id) on delete set null,
  category_label text not null default 'Other',
  severity text not null default 'minor'
    check (severity in ('minor', 'moderate', 'major')),
  description text,
  occurred_at timestamptz not null default now(),
  week_start date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workforce_mistakes_org_week_employee
  on public.workforce_mistakes (organization_id, week_start, employee_user_id);

create index if not exists idx_workforce_mistakes_org_employee_occurred
  on public.workforce_mistakes (organization_id, employee_user_id, occurred_at desc);

-- ── Frozen weekly grades (for performance reviews) ───────────────────────────

create table if not exists public.workforce_grade_week_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_user_id uuid not null,
  week_start date not null,
  mistake_count integer not null default 0,
  weighted_mistake_count numeric(8, 2) not null default 0,
  letter_grade text not null,
  category_breakdown jsonb not null default '{}'::jsonb,
  snapshotted_at timestamptz not null default now(),
  unique (organization_id, employee_user_id, week_start)
);

create index if not exists idx_workforce_grade_snapshots_org_employee
  on public.workforce_grade_week_snapshots (organization_id, employee_user_id, week_start desc);

-- ── Org grading settings ─────────────────────────────────────────────────────

create table if not exists public.workforce_grade_settings (
  organization_id uuid primary key,
  timezone text not null default 'America/Chicago',
  week_start_day smallint not null default 1
    check (week_start_day between 0 and 6),
  grade_thresholds jsonb not null default '[
    {"grade": "A", "maxMistakes": 1},
    {"grade": "B", "maxMistakes": 3},
    {"grade": "C", "maxMistakes": 6},
    {"grade": "D", "maxMistakes": 10}
  ]'::jsonb,
  severity_weights jsonb not null default '{
    "minor": 1,
    "moderate": 2,
    "major": 3
  }'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.workforce_mistake_categories is
  'Org-scoped mistake categories for supervisor logging; add-as-you-go.';
comment on table public.workforce_mistakes is
  'Supervisor-logged employee mistakes; week_start denormalized for weekly grade buckets.';
comment on table public.workforce_grade_week_snapshots is
  'Frozen letter grade per employee per closed week; used for performance reviews.';
comment on table public.workforce_grade_settings is
  'Per-org grading thresholds, timezone, and week boundary configuration.';
