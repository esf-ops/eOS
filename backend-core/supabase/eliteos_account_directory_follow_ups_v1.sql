-- eliteOS Account Directory Follow-ups v1 — internal staff follow-ups on canonical AD UUIDs
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
-- Do NOT apply automatically from CI/agents.
--
-- Purpose:
--   Durable internal follow-ups/reminders for Account 360, keyed only by
--   organization_id + account_directory_accounts.id. No QuickBooks, Moraware,
--   calendar, email, or customer-facing reminder writes.
--
-- Requires:
--   public.account_directory_accounts
--   public.account_directory_bump_row_version()
--   (eliteos_account_directory_v1.sql)
--
-- Rollback (if applied and empty):
--   DROP TABLE IF EXISTS public.account_directory_follow_ups CASCADE;
-- If this file was never applied: nothing to roll back in the database.
--
-- Security:
--   RLS enabled; service_role bypasses RLS (backend-core uses service role).
--   authenticated policies require organization membership via user_profiles.

create table if not exists public.account_directory_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  title text not null,
  details text null,
  due_at timestamptz not null,
  status text not null default 'open',
  assigned_to uuid null, -- optional user_profiles.id; no FK (same as notes created_by)
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  completed_at timestamptz null,
  completed_by uuid null,
  archived_at timestamptz null,
  archived_by uuid null,
  row_version bigint not null default 1,
  constraint account_directory_follow_ups_title_nonempty
    check (length(btrim(title)) > 0),
  constraint account_directory_follow_ups_title_max
    check (char_length(title) <= 200),
  constraint account_directory_follow_ups_details_max
    check (details is null or char_length(details) <= 4000),
  constraint account_directory_follow_ups_status_check
    check (status in ('open', 'completed'))
);

comment on table public.account_directory_follow_ups is
  'Internal eliteOS staff follow-ups for Account Directory accounts. Identity is organization_id + account_id UUID only.';

create index if not exists account_directory_follow_ups_org_account_status_due_idx
  on public.account_directory_follow_ups (organization_id, account_id, status, due_at);

create index if not exists account_directory_follow_ups_org_account_open_idx
  on public.account_directory_follow_ups (organization_id, account_id, due_at, created_at, id)
  where archived_at is null and status = 'open';

create index if not exists account_directory_follow_ups_org_account_completed_idx
  on public.account_directory_follow_ups (organization_id, account_id, completed_at desc, id)
  where archived_at is null and status = 'completed';

-- Future org-wide "My Follow-ups" list (not built in this phase).
create index if not exists account_directory_follow_ups_org_assignee_open_idx
  on public.account_directory_follow_ups (organization_id, assigned_to, due_at, id)
  where archived_at is null and status = 'open' and assigned_to is not null;

drop trigger if exists account_directory_follow_ups_row_version on public.account_directory_follow_ups;
create trigger account_directory_follow_ups_row_version
  before update on public.account_directory_follow_ups
  for each row execute function public.account_directory_bump_row_version();

alter table public.account_directory_follow_ups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_follow_ups'
      and policyname = 'account_directory_follow_ups_select_org'
  ) then
    create policy account_directory_follow_ups_select_org
      on public.account_directory_follow_ups for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;
