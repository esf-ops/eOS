-- eOS System Admin / Partner user management (non-destructive extension)
-- Requires: pgcrypto (`gen_random_uuid`)
-- Apply after `auth_schema.sql` (depends on `user_profiles` + auth.users)

-- ---------------------------------------------------------------------------
-- Widens `user_profiles.role` to Partner Quoting + future heads (safe for existing rows)
-- ---------------------------------------------------------------------------
alter table user_profiles drop constraint if exists user_profiles_role_check;

alter table user_profiles add constraint user_profiles_role_check check (
  role in (
    'admin',
    'executive',
    'sales',
    'production',
    'shop_tv',
    'installer',
    'accounting',
    'purchasing',
    'customer_service',
    'hr',
    'safety',
    'marketing',
    'dealer_admin',
    'dealer_user',
    'viewer',
    'finance'
  )
);

-- Internal vs partner identity (UI + policy hinting; not a substitute for RLS)
alter table user_profiles add column if not exists user_kind text default 'internal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_user_kind_check'
  ) then
    alter table user_profiles
      add constraint user_profiles_user_kind_check
      check (user_kind in ('internal', 'dealer_partner'));
  end if;
end $$;

alter table user_profiles add column if not exists last_login_at timestamptz;

create index if not exists idx_user_profiles_user_kind on user_profiles(user_kind);

-- ---------------------------------------------------------------------------
-- Dealer & pricing master data
-- ---------------------------------------------------------------------------
create table if not exists dealer_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  external_ref text unique,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_dealer_accounts_name on dealer_accounts(account_name);

create table if not exists pricing_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Per-user head routing (replaces ad-hoc JSON; enforce in API)
-- ---------------------------------------------------------------------------
create table if not exists user_head_access (
  user_id uuid not null references user_profiles(id) on delete cascade,
  head_slug text not null,
  created_at timestamptz default now(),
  primary key (user_id, head_slug)
);

create index if not exists idx_user_head_access_head on user_head_access(head_slug);

-- ---------------------------------------------------------------------------
-- Dealer / quoting entitlements (multiple accounts per user allowed)
-- ---------------------------------------------------------------------------
create table if not exists user_account_access (
  user_id uuid not null references user_profiles(id) on delete cascade,
  dealer_account_id uuid not null references dealer_accounts(id) on delete cascade,
  dealer_role text,
  pricing_group_id uuid references pricing_groups(id),
  can_view_all_dealer_quotes boolean not null default false,
  can_manage_dealer_users boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, dealer_account_id)
);

create index if not exists idx_user_account_access_dealer on user_account_access(dealer_account_id);

-- ---------------------------------------------------------------------------
-- Lightweight per-user dealer preferences (non-authoritative flags)
-- ---------------------------------------------------------------------------
create table if not exists dealer_user_settings (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  preferences jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
