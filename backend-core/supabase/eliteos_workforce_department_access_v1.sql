-- eliteOS Workforce Quality — department data-entry access (additive)
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
--
-- Prerequisites:
--   eliteos_workforce_quality_v1.sql
--   eliteos_workforce_quality_sections_v1.sql
--   eliteos_workforce_quality_scorecard_v1.sql
--
-- Assigns org users to department groups for scoped scorecard entry.
-- CEO/admin/executive/hr/super_admin retain full scorecard access via role.

create extension if not exists pgcrypto;

create table if not exists public.workforce_department_user_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  department_slug text not null
    check (
      department_slug in (
        'service_quality',
        'outside_partners',
        'plumbing',
        'shop_operations',
        'quoting',
        'machinery'
      )
    ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  unique (organization_id, user_id, department_slug)
);

create index if not exists idx_workforce_dept_access_org_user_active
  on public.workforce_department_user_access (organization_id, user_id)
  where is_active = true;

create index if not exists idx_workforce_dept_access_org_slug_active
  on public.workforce_department_user_access (organization_id, department_slug)
  where is_active = true;

comment on table public.workforce_department_user_access is
  'Org-scoped department group assignments for Weekly Operations Scorecard data entry.';

-- Attribution / edit timestamps on detailed mistakes (idempotent)
alter table public.workforce_mistakes
  add column if not exists updated_at timestamptz;

alter table public.workforce_mistakes
  add column if not exists updated_by_user_id uuid;

comment on column public.workforce_mistakes.updated_at is
  'Last edit timestamp for a detailed mistake row.';
comment on column public.workforce_mistakes.updated_by_user_id is
  'User who last edited the mistake row.';
