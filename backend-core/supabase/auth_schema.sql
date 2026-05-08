-- eOS Auth + audit foundation (non-destructive extension)
--
-- Requires:
--   create extension if not exists pgcrypto;
--
-- Assumes Supabase Auth schema exists (auth.users).

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer',
  department text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint user_profiles_role_check
    check (role in (
      'admin',
      'executive',
      'sales',
      'production',
      'shop_tv',
      'installer',
      'accounting',
      'purchasing',
      'customer_service',
      'viewer'
    ))
);

create index if not exists idx_user_profiles_role on user_profiles(role);
create index if not exists idx_user_profiles_email on user_profiles(email);

create table if not exists eos_action_log (
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

create index if not exists idx_eos_action_log_user_id on eos_action_log(user_id);
create index if not exists idx_eos_action_log_job_id on eos_action_log(job_id);
create index if not exists idx_eos_action_log_head on eos_action_log(head);
create index if not exists idx_eos_action_log_action_type on eos_action_log(action_type);

create table if not exists eos_login_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  event_type text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_eos_login_log_user_id on eos_login_log(user_id);
create index if not exists idx_eos_login_log_user_email on eos_login_log(user_email);

