-- eliteOS Profile & Preferences v1 — User Preferences Table
-- Additive only. Manual apply required — do NOT run automatically.
-- Apply via Supabase SQL editor or psql as a superuser/owner.
-- See docs/eliteos/FEATURE_DECISIONS.md §34 for full rationale.
--
-- Purpose:
--   Per-user UI preference storage for the eliteOS Profile & Preferences surface
--   (app-home, /profile route). Stores safe user-owned settings only.
--
-- Security model:
--   RLS enabled. Users may only read/write their own row via auth.uid() = user_id.
--   Backend (/api/me/preferences) additionally validates allowed keys and values
--   and explicitly forbids role, org_id, head-access, or any permission change.
--
-- Graceful degradation:
--   Backend routes handle missing table gracefully (returns defaults, no-op writes).
--   Frontend falls back to localStorage-only until this migration is applied.
--   No data is lost; localStorage values are written to DB on next save after apply.

create table if not exists user_preferences (
  user_id                      uuid        primary key references auth.users(id) on delete cascade,
  -- default_landing_head: optional head slug to highlight in the launcher.
  -- Validated server-side against the known head slug list.
  default_landing_head         text,
  -- table_density: row spacing preference for data tables.
  table_density                text        not null default 'comfortable',
  -- open_heads_in_new_tab: whether the Home Launcher opens tool links in a new tab.
  open_heads_in_new_tab        boolean     not null default true,
  -- show_advanced_panels_default: whether technical/diagnostic details open by default.
  show_advanced_panels_default boolean     not null default false,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  constraint user_preferences_table_density_check
    check (table_density in ('comfortable', 'compact')),

  constraint user_preferences_landing_head_check
    check (
      default_landing_head is null
      or default_landing_head in (
        'quote', 'quote_library', 'pricing_admin', 'system_admin',
        'sales', 'executive', 'brain_health', 'public_quote',
        'production', 'shop_tv', 'install', 'purchasing',
        'customer_service', 'hr', 'safety', 'org_directory'
      )
    )
);

-- Primary key covers exact-match lookups. Explicit named index for clarity.
create index if not exists user_preferences_user_id_idx
  on user_preferences (user_id);

-- Row-level security
alter table user_preferences enable row level security;

-- Users may select their own row only
create policy "user_preferences_select_own"
  on user_preferences
  for select
  using (auth.uid() = user_id);

-- Users may insert their own row only
create policy "user_preferences_insert_own"
  on user_preferences
  for insert
  with check (auth.uid() = user_id);

-- Users may update their own row only (backend still validates column values)
create policy "user_preferences_update_own"
  on user_preferences
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin/super_admin roles may read all rows for support visibility (read-only)
create policy "user_preferences_admin_select"
  on user_preferences
  for select
  using (
    exists (
      select 1
      from user_profiles up
      where up.id = auth.uid()
        and up.role in ('admin', 'super_admin')
        and up.is_active = true
    )
  );
