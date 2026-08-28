-- eliteOS Sales Ops Monday full-fidelity mirror v2
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS safe).
-- Do NOT apply automatically from CI/agents. Do not run against production unless instructed.
--
-- Requires: eliteos_sales_ops_v1.sql (already applied).
-- Optional: public.account_directory_accounts (FK added only if that table exists).
--
-- Purpose:
--   Additive Layer A Monday source mirror + Layer B projection extensions.
--   Future Monday columns land in sales_ops_monday_column_values without further DDL.
--   Account Directory UUID remains canonical eliteOS identity; Monday item IDs are external.
--   Does NOT drop, truncate, or rewrite quote/pricing/v1 Sales Ops tables.
--
-- Rollback (if applied and empty):
--   ALTER TABLE public.sales_ops_monday_config
--     DROP COLUMN IF EXISTS subitem_board_id,
--     DROP COLUMN IF EXISTS board_schema,
--     DROP COLUMN IF EXISTS last_full_reconcile_at,
--     DROP COLUMN IF EXISTS read_enabled,
--     DROP COLUMN IF EXISTS write_enabled,
--     DROP COLUMN IF EXISTS schema_inspected_at,
--     DROP COLUMN IF EXISTS membership_hash;
--   ALTER TABLE public.sales_ops_accounts
--     DROP COLUMN IF EXISTS account_directory_account_id,
--     DROP COLUMN IF EXISTS source_state,
--     DROP COLUMN IF EXISTS monday_created_at,
--     DROP COLUMN IF EXISTS last_seen_at,
--     DROP COLUMN IF EXISTS group_id,
--     DROP COLUMN IF EXISTS key_contact,
--     DROP COLUMN IF EXISTS est_kitchens_per_month,
--     DROP COLUMN IF EXISTS description;
--   DROP TABLE IF EXISTS public.sales_ops_monday_sync_state CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_docs CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_assets CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_updates CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_column_values CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_groups CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_users CASCADE;
--   DROP TABLE IF EXISTS public.sales_ops_monday_items CASCADE;
-- If this file was never applied: nothing to roll back.
--
-- Security:
--   RLS enabled. Layer A tables: no GRANT to anon/authenticated (Brain/service_role only).
--   Mutations via service_role. Browser uses /api/sales-ops/* DTOs only.

-- ── config extensions ────────────────────────────────────────────────────────

alter table public.sales_ops_monday_config
  add column if not exists subitem_board_id text null,
  add column if not exists board_schema jsonb not null default '{}'::jsonb,
  add column if not exists last_full_reconcile_at timestamptz null,
  add column if not exists read_enabled boolean not null default true,
  add column if not exists write_enabled boolean not null default false,
  add column if not exists schema_inspected_at timestamptz null,
  add column if not exists membership_hash text null;

comment on column public.sales_ops_monday_config.subitem_board_id is
  'Tenant subitem board id (Elite seed 18397319923). Not a SaaS-global constant.';
comment on column public.sales_ops_monday_config.read_enabled is
  'When true, Brain may ingest Monday into the local mirror. Independent of writes.';
comment on column public.sales_ops_monday_config.write_enabled is
  'When true, Brain may mutate Monday. Must remain false until separately approved.';
comment on column public.sales_ops_monday_config.enabled is
  'Legacy write gate. Prefer write_enabled. Kept for v1 compatibility.';

update public.sales_ops_monday_config
set write_enabled = coalesce(write_enabled, false) and coalesce(enabled, false)
where true;

-- Elite tenant config only (not SaaS-global).
update public.sales_ops_monday_config c
set
  subitem_board_id = coalesce(c.subitem_board_id, '18397319923'),
  account_master_board_id = coalesce(c.account_master_board_id, '18397092941'),
  read_enabled = true,
  write_enabled = false,
  enabled = false
from public.organizations o
where c.organization_id = o.id
  and o.organization_key = 'elite_stone_fabrication';

-- ── Layer B projection extensions ────────────────────────────────────────────

alter table public.sales_ops_accounts
  add column if not exists account_directory_account_id uuid null,
  add column if not exists source_state text not null default 'active',
  add column if not exists monday_created_at timestamptz null,
  add column if not exists last_seen_at timestamptz null,
  add column if not exists group_id text null,
  add column if not exists key_contact text null,
  add column if not exists est_kitchens_per_month numeric null,
  add column if not exists description text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_ops_accounts_source_state_chk'
  ) then
    alter table public.sales_ops_accounts
      add constraint sales_ops_accounts_source_state_chk
      check (source_state in ('active', 'archived', 'deleted', 'unavailable'));
  end if;
end $$;

create index if not exists sales_ops_accounts_ad_id_idx
  on public.sales_ops_accounts (organization_id, account_directory_account_id)
  where account_directory_account_id is not null;

create index if not exists sales_ops_accounts_source_state_idx
  on public.sales_ops_accounts (organization_id, source_state, assigned_user_id);

create index if not exists sales_ops_accounts_list_keyset_idx
  on public.sales_ops_accounts (organization_id, assigned_user_id, account_name, id)
  where archived = false and source_state = 'active';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'account_directory_accounts'
  ) and not exists (
    select 1 from pg_constraint where conname = 'sales_ops_accounts_ad_fk'
  ) then
    alter table public.sales_ops_accounts
      add constraint sales_ops_accounts_ad_fk
      foreign key (account_directory_account_id)
      references public.account_directory_accounts(id)
      on delete set null;
  end if;
end $$;

comment on column public.sales_ops_accounts.id is
  'Sales Ops projection-row identity. Not the canonical customer identity.';
comment on column public.sales_ops_accounts.account_directory_account_id is
  'Canonical eliteOS account identity when an exact Monday external link exists. Nullable until linked.';

-- ── Layer A: items (parent + subitem) ────────────────────────────────────────

create table if not exists public.sales_ops_monday_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text not null,
  parent_monday_item_id text null,
  item_kind text not null default 'item',
  item_name text not null default '',
  group_id text null,
  group_title text null,
  monday_url text null,
  description text null,
  monday_created_at timestamptz null,
  monday_updated_at timestamptz null,
  source_state text not null default 'active',
  last_seen_at timestamptz null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_monday_items_kind_chk check (item_kind in ('item', 'subitem')),
  constraint sales_ops_monday_items_state_chk check (source_state in ('active', 'archived', 'deleted', 'unavailable'))
);

create unique index if not exists sales_ops_monday_items_uidx
  on public.sales_ops_monday_items (organization_id, monday_board_id, monday_item_id);

create index if not exists sales_ops_monday_items_parent_idx
  on public.sales_ops_monday_items (organization_id, parent_monday_item_id)
  where parent_monday_item_id is not null;

create index if not exists sales_ops_monday_items_org_state_idx
  on public.sales_ops_monday_items (organization_id, source_state, last_seen_at);

drop trigger if exists sales_ops_monday_items_updated_at on public.sales_ops_monday_items;
create trigger sales_ops_monday_items_updated_at
  before update on public.sales_ops_monday_items
  for each row execute function public.sales_ops_set_updated_at();

comment on table public.sales_ops_monday_items is
  'Layer A Monday item/subitem mirror. source_snapshot is server-side only.';
comment on column public.sales_ops_monday_items.source_snapshot is
  'Server-side GraphQL snapshot. Never grant to authenticated/anon. Never return to the browser.';

-- ── Layer A: column values (future columns need no DDL) ──────────────────────

create table if not exists public.sales_ops_monday_column_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text not null,
  column_id text not null,
  column_title text null,
  column_type text null,
  display_text text null,
  value jsonb not null default 'null'::jsonb,
  monday_updated_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_monday_col_uidx
  on public.sales_ops_monday_column_values (organization_id, monday_board_id, monday_item_id, column_id);

create index if not exists sales_ops_monday_col_item_idx
  on public.sales_ops_monday_column_values (organization_id, monday_item_id);

drop trigger if exists sales_ops_monday_col_updated_at on public.sales_ops_monday_column_values;
create trigger sales_ops_monday_col_updated_at
  before update on public.sales_ops_monday_column_values
  for each row execute function public.sales_ops_set_updated_at();

comment on table public.sales_ops_monday_column_values is
  'Complete Monday column EAV. Identity is column_id; title is mutable metadata.';

-- ── Layer A: updates + replies ───────────────────────────────────────────────

create table if not exists public.sales_ops_monday_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text not null,
  monday_update_id text not null,
  parent_monday_update_id text null,
  creator_monday_id text null,
  creator_name text null,
  body_text text null,
  body_html text null,
  monday_created_at timestamptz null,
  monday_updated_at timestamptz null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_monday_updates_uidx
  on public.sales_ops_monday_updates (organization_id, monday_update_id);

create index if not exists sales_ops_monday_updates_item_idx
  on public.sales_ops_monday_updates (organization_id, monday_item_id, monday_created_at desc);

create index if not exists sales_ops_monday_updates_parent_idx
  on public.sales_ops_monday_updates (organization_id, parent_monday_update_id)
  where parent_monday_update_id is not null;

drop trigger if exists sales_ops_monday_updates_updated_at on public.sales_ops_monday_updates;
create trigger sales_ops_monday_updates_updated_at
  before update on public.sales_ops_monday_updates
  for each row execute function public.sales_ops_set_updated_at();

-- ── Layer A: assets ──────────────────────────────────────────────────────────

create table if not exists public.sales_ops_monday_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text null,
  monday_update_id text null,
  monday_asset_id text not null,
  column_id text null,
  filename text null,
  file_extension text null,
  file_size bigint null,
  mime_type text null,
  associated_kind text not null default 'item',
  monday_created_at timestamptz null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_monday_assets_kind_chk
    check (associated_kind in ('item', 'subitem', 'update', 'reply', 'column'))
);

create unique index if not exists sales_ops_monday_assets_uidx
  on public.sales_ops_monday_assets (organization_id, monday_asset_id);

create index if not exists sales_ops_monday_assets_item_idx
  on public.sales_ops_monday_assets (organization_id, monday_item_id);

drop trigger if exists sales_ops_monday_assets_updated_at on public.sales_ops_monday_assets;
create trigger sales_ops_monday_assets_updated_at
  before update on public.sales_ops_monday_assets
  for each row execute function public.sales_ops_set_updated_at();

comment on table public.sales_ops_monday_assets is
  'Asset metadata only. Do not store or return private Monday URLs as public application URLs.';

-- ── Layer A: docs ────────────────────────────────────────────────────────────

create table if not exists public.sales_ops_monday_docs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_item_id text not null,
  column_id text null,
  monday_doc_id text not null,
  title text null,
  source_url text null,
  accessibility text not null default 'unknown',
  blocks jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_monday_docs_access_chk
    check (accessibility in ('available', 'unsupported', 'inaccessible', 'unknown'))
);

create unique index if not exists sales_ops_monday_docs_uidx
  on public.sales_ops_monday_docs (organization_id, monday_doc_id, monday_item_id);

create index if not exists sales_ops_monday_docs_item_idx
  on public.sales_ops_monday_docs (organization_id, monday_item_id);

drop trigger if exists sales_ops_monday_docs_updated_at on public.sales_ops_monday_docs;
create trigger sales_ops_monday_docs_updated_at
  before update on public.sales_ops_monday_docs
  for each row execute function public.sales_ops_set_updated_at();

-- ── Layer A: users / teams (external identities) ─────────────────────────────

create table if not exists public.sales_ops_monday_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_user_id text not null,
  kind text not null default 'person',
  display_name text null,
  email text null,
  source_metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_monday_users_kind_chk check (kind in ('person', 'team'))
);

create unique index if not exists sales_ops_monday_users_uidx
  on public.sales_ops_monday_users (organization_id, monday_user_id);

drop trigger if exists sales_ops_monday_users_updated_at on public.sales_ops_monday_users;
create trigger sales_ops_monday_users_updated_at
  before update on public.sales_ops_monday_users
  for each row execute function public.sales_ops_set_updated_at();

comment on table public.sales_ops_monday_users is
  'Cached Monday person/team identities. Never treat monday_user_id as an eliteOS user UUID.';

-- ── Layer A: groups ──────────────────────────────────────────────────────────

create table if not exists public.sales_ops_monday_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  monday_group_id text not null,
  title text null,
  position text null,
  archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_monday_groups_uidx
  on public.sales_ops_monday_groups (organization_id, monday_board_id, monday_group_id);

drop trigger if exists sales_ops_monday_groups_updated_at on public.sales_ops_monday_groups;
create trigger sales_ops_monday_groups_updated_at
  before update on public.sales_ops_monday_groups
  for each row execute function public.sales_ops_set_updated_at();

-- ── sync state (census watermarks; not a duplicate of sync_log) ──────────────

create table if not exists public.sales_ops_monday_sync_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  monday_board_id text not null,
  sync_mode text not null default 'full',
  last_successful_reconcile_at timestamptz null,
  last_complete_census_at timestamptz null,
  last_cursor text null,
  membership_hash text null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_monday_sync_mode_chk check (sync_mode in ('full', 'incremental'))
);

create unique index if not exists sales_ops_monday_sync_state_uidx
  on public.sales_ops_monday_sync_state (organization_id, monday_board_id, sync_mode);

drop trigger if exists sales_ops_monday_sync_state_updated_at on public.sales_ops_monday_sync_state;
create trigger sales_ops_monday_sync_state_updated_at
  before update on public.sales_ops_monday_sync_state
  for each row execute function public.sales_ops_set_updated_at();

-- ── RLS / grants (Layer A is Brain-only) ─────────────────────────────────────

alter table public.sales_ops_monday_items enable row level security;
alter table public.sales_ops_monday_column_values enable row level security;
alter table public.sales_ops_monday_updates enable row level security;
alter table public.sales_ops_monday_assets enable row level security;
alter table public.sales_ops_monday_docs enable row level security;
alter table public.sales_ops_monday_users enable row level security;
alter table public.sales_ops_monday_groups enable row level security;
alter table public.sales_ops_monday_sync_state enable row level security;

revoke all on public.sales_ops_monday_items from anon, authenticated;
revoke all on public.sales_ops_monday_column_values from anon, authenticated;
revoke all on public.sales_ops_monday_updates from anon, authenticated;
revoke all on public.sales_ops_monday_assets from anon, authenticated;
revoke all on public.sales_ops_monday_docs from anon, authenticated;
revoke all on public.sales_ops_monday_users from anon, authenticated;
revoke all on public.sales_ops_monday_groups from anon, authenticated;
revoke all on public.sales_ops_monday_sync_state from anon, authenticated;
