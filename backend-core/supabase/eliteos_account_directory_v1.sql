-- eliteOS Account Directory v1 — additive foundation tables
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
-- Do NOT apply automatically from CI/agents.
--
-- Purpose:
--   Standalone account identity + estimating contacts/locations/aliases +
--   QuickBooks Desktop root List ID external links. Does NOT touch estimates,
--   quote_headers, brain_quickbooks_*, sales_account_master, or CRM staging.
--
-- Rollback (if applied and empty):
--   DROP TABLE IF EXISTS public.account_directory_audit_events CASCADE;
--   DROP TABLE IF EXISTS public.account_directory_external_links CASCADE;
--   DROP TABLE IF EXISTS public.account_directory_aliases CASCADE;
--   DROP TABLE IF EXISTS public.account_directory_locations CASCADE;
--   DROP TABLE IF EXISTS public.account_directory_contacts CASCADE;
--   DROP TABLE IF EXISTS public.account_directory_accounts CASCADE;
--   DROP FUNCTION IF EXISTS public.account_directory_bump_row_version() CASCADE;
-- If this file was never applied: nothing to roll back in the database.
--
-- Security:
--   RLS enabled; service_role bypasses RLS (backend-core uses service role).
--   authenticated policies require organization membership via user_profiles.

-- ── row_version helper ───────────────────────────────────────────────────────

create or replace function public.account_directory_bump_row_version()
returns trigger
language plpgsql
as $$
begin
  new.row_version := coalesce(old.row_version, 0) + 1;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ── accounts ─────────────────────────────────────────────────────────────────

create table if not exists public.account_directory_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  display_name text not null,
  legal_name text null,
  status text not null default 'active'
    check (status in ('active', 'prospect', 'inactive', 'archived', 'needs_review')),
  source text not null default 'manual',
  parent_account_id uuid null references public.account_directory_accounts(id),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  archived_at timestamptz null,
  archived_by uuid null,
  row_version bigint not null default 1,
  constraint account_directory_accounts_display_name_nonempty
    check (length(btrim(display_name)) > 0)
);

create index if not exists account_directory_accounts_org_status_idx
  on public.account_directory_accounts (organization_id, status);

create index if not exists account_directory_accounts_org_display_name_idx
  on public.account_directory_accounts (organization_id, lower(display_name));

create index if not exists account_directory_accounts_org_archived_idx
  on public.account_directory_accounts (organization_id, archived_at);

drop trigger if exists account_directory_accounts_row_version on public.account_directory_accounts;
create trigger account_directory_accounts_row_version
  before update on public.account_directory_accounts
  for each row execute function public.account_directory_bump_row_version();

-- ── contacts ─────────────────────────────────────────────────────────────────

create table if not exists public.account_directory_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  first_name text null,
  last_name text null,
  display_name text not null,
  title_role text null,
  email text null,
  phone text null,
  phone_normalized text null,
  contact_type text null,
  is_primary_estimating boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  row_version bigint not null default 1,
  constraint account_directory_contacts_display_name_nonempty
    check (length(btrim(display_name)) > 0)
);

create index if not exists account_directory_contacts_account_idx
  on public.account_directory_contacts (account_id, is_active);

create index if not exists account_directory_contacts_org_email_idx
  on public.account_directory_contacts (organization_id, lower(email))
  where email is not null;

create index if not exists account_directory_contacts_org_phone_idx
  on public.account_directory_contacts (organization_id, phone_normalized)
  where phone_normalized is not null;

create unique index if not exists account_directory_contacts_one_primary_active
  on public.account_directory_contacts (account_id)
  where is_primary_estimating = true and is_active = true;

drop trigger if exists account_directory_contacts_row_version on public.account_directory_contacts;
create trigger account_directory_contacts_row_version
  before update on public.account_directory_contacts
  for each row execute function public.account_directory_bump_row_version();

-- ── locations ────────────────────────────────────────────────────────────────

create table if not exists public.account_directory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  label text not null default 'Main',
  address_line1 text null,
  address_line2 text null,
  city text null,
  state text null,
  postal_code text null,
  source_address_raw text null,
  location_type text not null default 'account'
    check (location_type in ('account', 'billing', 'shipping', 'other')),
  is_primary_account_location boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  row_version bigint not null default 1
);

create index if not exists account_directory_locations_account_idx
  on public.account_directory_locations (account_id, is_active);

create index if not exists account_directory_locations_org_city_idx
  on public.account_directory_locations (organization_id, lower(coalesce(city, '')));

create unique index if not exists account_directory_locations_one_primary_active
  on public.account_directory_locations (account_id)
  where is_primary_account_location = true and is_active = true;

drop trigger if exists account_directory_locations_row_version on public.account_directory_locations;
create trigger account_directory_locations_row_version
  before update on public.account_directory_locations
  for each row execute function public.account_directory_bump_row_version();

-- ── aliases ──────────────────────────────────────────────────────────────────

create table if not exists public.account_directory_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  alias_value text not null,
  alias_source text not null default 'manual',
  normalized_match_value text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  row_version bigint not null default 1,
  constraint account_directory_aliases_value_nonempty
    check (length(btrim(alias_value)) > 0)
);

create index if not exists account_directory_aliases_account_idx
  on public.account_directory_aliases (account_id, is_active);

create index if not exists account_directory_aliases_org_norm_idx
  on public.account_directory_aliases (organization_id, normalized_match_value)
  where is_active = true;

drop trigger if exists account_directory_aliases_row_version on public.account_directory_aliases;
create trigger account_directory_aliases_row_version
  before update on public.account_directory_aliases
  for each row execute function public.account_directory_bump_row_version();

-- ── external links (QuickBooks Desktop root List ID, etc.) ───────────────────

create table if not exists public.account_directory_external_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  external_system text not null,
  external_id text not null,
  external_display_name text null,
  source_snapshot_date text null,
  linked_at timestamptz not null default timezone('utc', now()),
  linked_by uuid null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  row_version bigint not null default 1
);

create index if not exists account_directory_external_links_account_idx
  on public.account_directory_external_links (account_id, is_active);

create unique index if not exists account_directory_external_links_active_unique
  on public.account_directory_external_links (organization_id, external_system, external_id)
  where is_active = true;

drop trigger if exists account_directory_external_links_row_version on public.account_directory_external_links;
create trigger account_directory_external_links_row_version
  before update on public.account_directory_external_links
  for each row execute function public.account_directory_bump_row_version();

-- ── domain audit events (additive; also use eos_action_log from API) ─────────

create table if not exists public.account_directory_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  account_id uuid null references public.account_directory_accounts(id),
  action text not null,
  actor_user_id uuid null,
  changed_fields jsonb not null default '[]'::jsonb,
  old_values jsonb null,
  new_values jsonb null,
  request_id text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists account_directory_audit_events_account_idx
  on public.account_directory_audit_events (account_id, created_at desc);

create index if not exists account_directory_audit_events_entity_idx
  on public.account_directory_audit_events (organization_id, entity_type, entity_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.account_directory_accounts enable row level security;
alter table public.account_directory_contacts enable row level security;
alter table public.account_directory_locations enable row level security;
alter table public.account_directory_aliases enable row level security;
alter table public.account_directory_external_links enable row level security;
alter table public.account_directory_audit_events enable row level security;

-- Authenticated users may read rows for their organization only.
-- Mutations are expected via backend-core service_role (bypasses RLS).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_accounts'
      and policyname = 'account_directory_accounts_select_org'
  ) then
    create policy account_directory_accounts_select_org
      on public.account_directory_accounts for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_contacts'
      and policyname = 'account_directory_contacts_select_org'
  ) then
    create policy account_directory_contacts_select_org
      on public.account_directory_contacts for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_locations'
      and policyname = 'account_directory_locations_select_org'
  ) then
    create policy account_directory_locations_select_org
      on public.account_directory_locations for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_aliases'
      and policyname = 'account_directory_aliases_select_org'
  ) then
    create policy account_directory_aliases_select_org
      on public.account_directory_aliases for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_external_links'
      and policyname = 'account_directory_external_links_select_org'
  ) then
    create policy account_directory_external_links_select_org
      on public.account_directory_external_links for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_audit_events'
      and policyname = 'account_directory_audit_events_select_org'
  ) then
    create policy account_directory_audit_events_select_org
      on public.account_directory_audit_events for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where user_id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;
