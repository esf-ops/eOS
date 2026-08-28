-- eliteOS Sales Ops performance attribution v3 — additive
-- Manual apply: Supabase SQL editor or authenticated CLI against the verified
-- eliteOS production project. IF NOT EXISTS / policy-name guards are safe.
-- Do NOT rewrite eliteos_sales_ops_v1.sql, v2, or v2.1.
--
-- Purpose:
--   Immutable salesperson square-foot attribution facts. Current Monday ownership
--   is never the historical credit authority. Rows are written only by Brain when
--   a governed qualifying event is approved. This file does not seed actuals and
--   does not enable Moraware/Monday/QuickBooks writes.
--
-- Rollback (if applied and empty):
--   DROP TABLE IF EXISTS public.sales_ops_sf_attribution_facts CASCADE;
-- If this file was never applied: nothing to roll back.
--
-- Security:
--   RLS enabled; service_role bypasses RLS (Brain). authenticated SELECT is
--   org + ownership/manager scoped. Mutations via service_role only.

create table if not exists public.sales_ops_sf_attribution_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  salesperson_user_id uuid not null,
  account_directory_account_id uuid not null,
  sales_ops_account_id uuid null,
  moraware_account_id text null,
  moraware_job_id text null,
  qualifying_event text not null,
  qualifying_date date not null,
  performance_month text not null,
  credited_sf numeric not null,
  attribution_basis text not null default 'explicit_fact',
  source_observed_at timestamptz null,
  reversal_of_id uuid null references public.sales_ops_sf_attribution_facts(id) on delete set null,
  status text not null default 'credited',
  created_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_sf_attr_month_chk check (performance_month ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint sales_ops_sf_attr_status_chk check (status in ('credited', 'reversed')),
  constraint sales_ops_sf_attr_event_nonempty check (length(btrim(qualifying_event)) > 0),
  constraint sales_ops_sf_attr_basis_nonempty check (length(btrim(attribution_basis)) > 0)
);

create index if not exists sales_ops_sf_attr_org_user_month_idx
  on public.sales_ops_sf_attribution_facts (organization_id, salesperson_user_id, performance_month);

create index if not exists sales_ops_sf_attr_org_ad_month_idx
  on public.sales_ops_sf_attribution_facts (organization_id, account_directory_account_id, performance_month);

create index if not exists sales_ops_sf_attr_org_job_idx
  on public.sales_ops_sf_attribution_facts (organization_id, moraware_job_id)
  where moraware_job_id is not null;

create unique index if not exists sales_ops_sf_attr_credited_job_uidx
  on public.sales_ops_sf_attribution_facts (
    organization_id,
    moraware_job_id,
    qualifying_event,
    performance_month
  )
  where status = 'credited' and moraware_job_id is not null;

drop trigger if exists sales_ops_sf_attr_updated_at on public.sales_ops_sf_attribution_facts;

alter table public.sales_ops_sf_attribution_facts enable row level security;

revoke all on public.sales_ops_sf_attribution_facts from anon, authenticated;
grant select on public.sales_ops_sf_attribution_facts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sales_ops_sf_attribution_facts'
      and policyname = 'sales_ops_sf_attr_select_scoped'
  ) then
    create policy sales_ops_sf_attr_select_scoped
      on public.sales_ops_sf_attribution_facts for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          salesperson_user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
          or exists (
            select 1 from public.sales_ops_manager_assignments ma
            where ma.organization_id = sales_ops_sf_attribution_facts.organization_id
              and ma.manager_user_id = (select auth.uid())
              and ma.report_user_id = sales_ops_sf_attribution_facts.salesperson_user_id
              and ma.active = true
          )
        )
      );
  end if;
end $$;

comment on table public.sales_ops_sf_attribution_facts is
  'eliteOS-owned Sales Ops SF credit facts. Monday current owner does not rewrite history. Populated only after a governed qualifying event is approved.';
comment on column public.sales_ops_sf_attribution_facts.salesperson_user_id is
  'eliteOS user credited at the qualifying event. Not derived from today''s Monday assignment.';
comment on column public.sales_ops_sf_attribution_facts.account_directory_account_id is
  'Canonical Account Directory UUID. Never aggregate by account name.';
