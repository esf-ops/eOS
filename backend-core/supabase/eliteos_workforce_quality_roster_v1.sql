-- eliteOS Workforce Quality — roster members + test team seed (additive)
-- Apply after eliteos_workforce_quality_v1.sql

create table if not exists public.workforce_roster_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  full_name text not null,
  email text,
  department text,
  job_title text,
  is_active boolean not null default true,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workforce_roster_members_org_active
  on public.workforce_roster_members (organization_id, is_active, full_name);

-- Allow grading roster members without eliteOS login
alter table public.workforce_mistakes
  alter column employee_user_id drop not null;

alter table public.workforce_mistakes
  add column if not exists employee_roster_id uuid references public.workforce_roster_members (id) on delete set null;

create index if not exists idx_workforce_mistakes_org_roster_week
  on public.workforce_mistakes (organization_id, employee_roster_id, week_start)
  where employee_roster_id is not null;

alter table public.workforce_grade_week_snapshots
  alter column employee_user_id drop not null;

alter table public.workforce_grade_week_snapshots
  add column if not exists employee_roster_id uuid references public.workforce_roster_members (id) on delete set null;

-- Replace single-column unique with source-aware partial indexes
alter table public.workforce_grade_week_snapshots
  drop constraint if exists workforce_grade_week_snapshots_organization_id_employee_user_key;

drop index if exists workforce_grade_week_snapshots_org_user_week_key;
drop index if exists idx_workforce_grade_snapshots_org_user_week;

create unique index if not exists idx_workforce_grade_snapshots_org_user_week
  on public.workforce_grade_week_snapshots (organization_id, employee_user_id, week_start)
  where employee_user_id is not null;

create unique index if not exists idx_workforce_grade_snapshots_org_roster_week
  on public.workforce_grade_week_snapshots (organization_id, employee_roster_id, week_start)
  where employee_roster_id is not null;

comment on table public.workforce_roster_members is
  'Graded team members who may not have eliteOS logins; org-scoped roster for HR Head.';

-- Five test team members for Elite Stone Fabrication (idempotent)
insert into public.workforce_roster_members (
  id, organization_id, full_name, email, department, job_title, is_test, is_active
)
select
  v.id,
  o.id,
  v.full_name,
  v.email,
  v.department,
  v.job_title,
  true,
  true
from public.organizations o
cross join (
  values
    ('a1000001-0001-4001-8001-000000000001'::uuid, 'Jordan Ellis', 'jordan.ellis.test@eliteosfab.local', 'Production', 'CNC Operator'),
    ('a1000001-0001-4001-8001-000000000002'::uuid, 'Morgan Chen', 'morgan.chen.test@eliteosfab.local', 'Install', 'Lead Installer'),
    ('a1000001-0001-4001-8001-000000000003'::uuid, 'Riley Brooks', 'riley.brooks.test@eliteosfab.local', 'Estimating', 'Junior Estimator'),
    ('a1000001-0001-4001-8001-000000000004'::uuid, 'Casey Nguyen', 'casey.nguyen.test@eliteosfab.local', 'Customer Service', 'Service Coordinator'),
    ('a1000001-0001-4001-8001-000000000005'::uuid, 'Taylor Reed', 'taylor.reed.test@eliteosfab.local', 'Shop', 'Polish & QC')
) as v(id, full_name, email, department, job_title)
where o.organization_key = 'elite_stone_fabrication'
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  department = excluded.department,
  job_title = excluded.job_title,
  is_test = excluded.is_test,
  is_active = excluded.is_active,
  updated_at = now();
