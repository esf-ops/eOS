-- eliteOS Account Directory Notes v1 — internal staff notes on canonical AD UUIDs
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS safe).
-- Do NOT apply automatically from CI/agents.
--
-- Purpose:
--   Durable internal notes for Account 360, keyed only by organization_id +
--   account_directory_accounts.id. No QuickBooks, Moraware, or customer-name identity.
--
-- Requires:
--   public.account_directory_accounts
--   public.account_directory_bump_row_version()
--   (eliteos_account_directory_v1.sql)
--
-- Rollback (if applied and empty):
--   DROP TABLE IF EXISTS public.account_directory_notes CASCADE;
-- If this file was never applied: nothing to roll back in the database.
--
-- Security:
--   RLS enabled; service_role bypasses RLS (backend-core uses service role).
--   authenticated policies require organization membership via user_profiles.

create table if not exists public.account_directory_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.account_directory_accounts(id),
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null,
  archived_at timestamptz null,
  archived_by uuid null,
  row_version bigint not null default 1,
  constraint account_directory_notes_body_nonempty
    check (length(btrim(body)) > 0),
  constraint account_directory_notes_body_max
    check (char_length(body) <= 4000)
);

comment on table public.account_directory_notes is
  'Internal eliteOS staff notes for Account Directory accounts. Identity is organization_id + account_id UUID only.';

create index if not exists account_directory_notes_org_account_created_idx
  on public.account_directory_notes (organization_id, account_id, created_at desc);

create index if not exists account_directory_notes_org_account_active_idx
  on public.account_directory_notes (organization_id, account_id, created_at desc)
  where archived_at is null;

drop trigger if exists account_directory_notes_row_version on public.account_directory_notes;
create trigger account_directory_notes_row_version
  before update on public.account_directory_notes
  for each row execute function public.account_directory_bump_row_version();

alter table public.account_directory_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_directory_notes'
      and policyname = 'account_directory_notes_select_org'
  ) then
    create policy account_directory_notes_select_org
      on public.account_directory_notes for select to authenticated
      using (
        organization_id in (
          select organization_id from public.user_profiles
          where id = auth.uid() and organization_id is not null
        )
      );
  end if;
end $$;
