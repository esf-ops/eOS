-- eliteOS Org Directory v1 — planning org chart (JSON document per organization)
-- Not HR/payroll; does not modify user_head_access.

create table if not exists public.org_directory_charts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null default 'Organization Chart',
  chart_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_directory_charts_org_active
  on public.org_directory_charts (organization_id, is_active);

create table if not exists public.org_directory_editors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_email text,
  user_profile_id uuid,
  can_edit boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_email)
);

create index if not exists idx_org_directory_editors_org_email
  on public.org_directory_editors (organization_id, lower(user_email));

comment on table public.org_directory_charts is 'Org planning chart JSON per organization; not authoritative for eliteOS permissions.';
comment on table public.org_directory_editors is 'Non-admin users granted edit access to org chart (e.g. leadership planners).';
