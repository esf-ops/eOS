-- eliteOS audit foundation hardening (additive / idempotent)
--
-- Apply manually in Supabase SQL editor or migration runner.
-- Reuses existing tables when present:
--   - eos_login_log  = auth/session events
--   - eos_action_log = meaningful authenticated actions
--
-- No destructive changes. No RLS/policy changes are made here; backend-core reads/writes
-- these tables server-side with the service role behind System Admin auth + role gates.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth/session events
-- ---------------------------------------------------------------------------
create table if not exists public.eos_login_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  event_type text,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.eos_login_log
  add column if not exists organization_id uuid,
  add column if not exists email text,
  add column if not exists tool_slug text,
  add column if not exists success boolean default true,
  add column if not exists failure_reason text,
  add column if not exists session_id text,
  add column if not exists request_id text;

create index if not exists idx_eos_login_log_user_id on public.eos_login_log(user_id);
create index if not exists idx_eos_login_log_user_email on public.eos_login_log(user_email);
create index if not exists idx_eos_login_log_created_at on public.eos_login_log(created_at desc);
create index if not exists idx_eos_login_log_event_type on public.eos_login_log(event_type);
create index if not exists idx_eos_login_log_tool_slug on public.eos_login_log(tool_slug);
create index if not exists idx_eos_login_log_organization_id on public.eos_login_log(organization_id);

comment on table public.eos_login_log is
  'eliteOS auth/session events. Exact Supabase password sign-in is not always visible to Brain; first authenticated API/session event is the durable sign-in/seen signal.';

-- ---------------------------------------------------------------------------
-- Meaningful action events
-- ---------------------------------------------------------------------------
create table if not exists public.eos_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_role text,
  head text,
  action_type text,
  entity_type text,
  entity_id text,
  job_id text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

alter table public.eos_action_log
  add column if not exists organization_id uuid,
  add column if not exists actor_user_id uuid,
  add column if not exists actor_email text,
  add column if not exists tool_slug text,
  add column if not exists entity_label text,
  add column if not exists outcome text default 'success',
  add column if not exists before_json jsonb,
  add column if not exists after_json jsonb,
  add column if not exists request_id text;

alter table public.eos_action_log
  alter column metadata set default '{}'::jsonb;

create index if not exists idx_eos_action_log_user_id on public.eos_action_log(user_id);
create index if not exists idx_eos_action_log_actor_user_id on public.eos_action_log(actor_user_id);
create index if not exists idx_eos_action_log_job_id on public.eos_action_log(job_id);
create index if not exists idx_eos_action_log_head on public.eos_action_log(head);
create index if not exists idx_eos_action_log_tool_slug on public.eos_action_log(tool_slug);
create index if not exists idx_eos_action_log_action_type on public.eos_action_log(action_type);
create index if not exists idx_eos_action_log_created_at on public.eos_action_log(created_at desc);
create index if not exists idx_eos_action_log_organization_id on public.eos_action_log(organization_id);
create index if not exists idx_eos_action_log_outcome on public.eos_action_log(outcome);

comment on table public.eos_action_log is
  'eliteOS meaningful authenticated action log. Stores governance-relevant actions only, never passwords/JWTs/secrets.';

-- Optional user profile seen timestamp. Existing code falls back to last_login_at when this column is absent.
alter table public.user_profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists idx_user_profiles_last_seen_at on public.user_profiles(last_seen_at desc);
