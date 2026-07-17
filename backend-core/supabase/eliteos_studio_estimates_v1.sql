-- eliteOS Studio Estimates v1 — durable Elite 100 Studio estimate persistence.
-- Additive / idempotent. Apply manually; do not run in DE automation.
-- Does NOT create or modify Digital Estimate (quote_publications*) tables.
--
-- Brain (service_role) is the only accessor. Anon/authenticated have no policies.

create extension if not exists pgcrypto;

create table if not exists public.studio_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_case_id text not null,
  takeoff_job_id text,
  source_takeoff_result_id text,
  status text not null
    check (status in (
      'draft',
      'needs_takeoff_approval',
      'ready_to_price',
      'priced',
      'approved',
      'superseded'
    )),
  revision integer not null default 1 check (revision >= 1),
  scope_json jsonb not null default '{}'::jsonb,
  calculation_snapshot_json jsonb,
  calculation_fingerprint text,
  pricing_engine text,
  pricing_version integer,
  approval_json jsonb,
  stale_reason text,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  approved_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  superseded_at timestamptz
);

comment on table public.studio_estimates is
  'Elite 100 Studio estimates (scope → calculate → approve). Org-scoped; Brain service_role only. Not Digital Estimate publications.';

-- One active (non-superseded) estimate per organization + intake case.
create unique index if not exists uq_studio_estimates_one_active_per_case
  on public.studio_estimates (organization_id, intake_case_id)
  where status <> 'superseded';

create index if not exists idx_studio_estimates_org_case_updated
  on public.studio_estimates (organization_id, intake_case_id, updated_at desc);

create index if not exists idx_studio_estimates_org_status
  on public.studio_estimates (organization_id, status);

-- organization_id is immutable after insert.
create or replace function public.studio_estimates_org_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable on studio_estimates rows'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.studio_estimates_org_immutable() from public;
revoke all on function public.studio_estimates_org_immutable() from anon, authenticated;

drop trigger if exists trg_studio_estimates_org_immutable on public.studio_estimates;
create trigger trg_studio_estimates_org_immutable
  before update on public.studio_estimates
  for each row execute function public.studio_estimates_org_immutable();

-- RLS: deny anon/authenticated by default; service_role bypasses RLS.
revoke all on table public.studio_estimates from anon, authenticated;
alter table public.studio_estimates enable row level security;
-- No policies for anon/authenticated ⇒ deny by default.
