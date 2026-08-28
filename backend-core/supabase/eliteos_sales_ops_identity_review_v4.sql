-- eliteOS Sales Ops identity review + compensation config v4 — additive
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite v1/v2/v2.1/v3.
--
-- Purpose:
--   Human-governed Monday → Account Directory linking.
--   Exact auto-link only from conclusive identifiers.
--   Compensation proposal/config and commission-report lifecycle.
--   Attribution fact columns for future worksheet/form identity.
--
-- Does not enable Monday/Moraware/QuickBooks writes.
-- Does not seed a published sales plan.
-- Does not credit Moraware actuals.

-- ── attribution additive columns ─────────────────────────────────────────────

alter table public.sales_ops_sf_attribution_facts
  add column if not exists moraware_form_id text null;

alter table public.sales_ops_sf_attribution_facts
  add column if not exists commission_eligible boolean null;

comment on column public.sales_ops_sf_attribution_facts.moraware_form_id is
  'Moraware worksheet/form source identity. Null until COMPLETED_INSTALLATION_SF fields are proven.';
comment on column public.sales_ops_sf_attribution_facts.commission_eligible is
  'Eligibility at credit time. Independent of current Monday ownership.';

-- Worksheet grain replaces the v3 job+month unique so one job can have multiple
-- worksheet events once COMPLETED_INSTALLATION_SF is field-proven.
drop index if exists public.sales_ops_sf_attr_credited_job_uidx;

create unique index if not exists sales_ops_sf_attr_credited_job_form_uidx
  on public.sales_ops_sf_attribution_facts (
    organization_id,
    moraware_job_id,
    moraware_form_id,
    qualifying_event
  )
  where status = 'credited'
    and moraware_job_id is not null
    and moraware_form_id is not null;

-- ── identity review hints (org evidence packs; candidate-only) ───────────────

create table if not exists public.sales_ops_identity_review_hints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  pack_key text not null,
  monday_name text not null,
  suggested_directory_name text null,
  evidence_kind text not null,
  strength text not null default 'standard',
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_id_hint_kind_chk check (evidence_kind in ('alias', 'exclusion', 'priority_book')),
  constraint sales_ops_id_hint_strength_chk check (strength in ('standard', 'weak'))
);

create unique index if not exists sales_ops_id_hint_uidx
  on public.sales_ops_identity_review_hints (organization_id, pack_key, monday_name, evidence_kind);

alter table public.sales_ops_identity_review_hints enable row level security;
revoke all on public.sales_ops_identity_review_hints from anon, authenticated;
grant select on public.sales_ops_identity_review_hints to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_identity_review_hints'
      and policyname = 'sales_ops_id_hint_select_org'
  ) then
    create policy sales_ops_id_hint_select_org
      on public.sales_ops_identity_review_hints for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
      );
  end if;
end $$;

insert into public.sales_ops_identity_review_hints (
  organization_id, pack_key, monday_name, suggested_directory_name, evidence_kind, strength, notes
)
select o.id, 'starter_handoff_v1', v.monday_name, v.suggested_directory_name, v.evidence_kind, v.strength, v.notes
from public.organizations o
cross join (
  values
    ('S&R Construction', 'S&R Construction', 'alias', 'standard', 'Starter-package exact name'),
    ('Dyersville- KDN Builders', 'KDN Builders', 'alias', 'standard', 'Starter-package alias'),
    ('Cabinet Studio Inc', 'Cabinet Studio', 'alias', 'standard', 'Starter-package alias'),
    ('Van Dyke Construction', 'Van Dyke Construction Co. LLC', 'alias', 'standard', 'Starter-package alias'),
    ('Dyersville- Ries Design', 'Ries Design', 'alias', 'standard', 'Starter-package alias'),
    ('Dyersville-Builders Select', 'Builders Select Cedar Falls', 'alias', 'standard', 'Starter-package alias'),
    ('Signature Homes', 'Signature Homes', 'alias', 'standard', 'Starter-package exact name'),
    ('BoWood Company', 'BoWood Company', 'alias', 'standard', 'Starter-package exact name'),
    ('Dyersville- Ubben''s Building Supplies, Inc.', 'Ubben''s Building Supplies, Inc.', 'alias', 'standard', 'Starter-package alias'),
    ('Dyersville- Epworth Cabinet Shop', 'Cabinet shop', 'alias', 'weak', 'Starter package: least exact match. Human confirmation required. Never auto-link.'),
    ('Allan Custom Homes', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('Carson Designs', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('Fisher Designs', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('Moore & Co.', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('TW Homes', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('Tim Jacobs Homebuilders', null, 'exclusion', 'standard', 'Not commissionable under the starter package'),
    ('Panther Builders', null, 'exclusion', 'standard', 'Not commissionable under the starter package')
) as v(monday_name, suggested_directory_name, evidence_kind, strength, notes)
where o.organization_key = 'elite_stone_fabrication'
on conflict (organization_id, pack_key, monday_name, evidence_kind) do nothing;

-- ── identity review queue ────────────────────────────────────────────────────

create table if not exists public.sales_ops_account_identity_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sales_ops_account_id uuid not null references public.sales_ops_accounts(id) on delete cascade,
  monday_board_id text not null,
  monday_item_id text not null,
  monday_account_name text not null,
  status text not null,
  auto_linkable boolean not null default false,
  candidates jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  conflict_reason text null,
  exclusion_hint boolean not null default false,
  linked_account_directory_account_id uuid null,
  rebuilt_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_id_review_status_chk check (
    status in ('EXACT_AUTO_LINKABLE', 'REVIEW_REQUIRED', 'NO_CANDIDATE', 'CONFLICT')
  )
);

create unique index if not exists sales_ops_id_review_account_uidx
  on public.sales_ops_account_identity_reviews (organization_id, sales_ops_account_id);

create index if not exists sales_ops_id_review_status_idx
  on public.sales_ops_account_identity_reviews (organization_id, status);

alter table public.sales_ops_account_identity_reviews enable row level security;
revoke all on public.sales_ops_account_identity_reviews from anon, authenticated;
grant select on public.sales_ops_account_identity_reviews to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_account_identity_reviews'
      and policyname = 'sales_ops_id_review_select_admin'
  ) then
    create policy sales_ops_id_review_select_admin
      on public.sales_ops_account_identity_reviews for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
            and up.role in ('admin', 'super_admin', 'executive')
        )
      );
  end if;
end $$;

create table if not exists public.sales_ops_account_identity_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_id uuid null references public.sales_ops_account_identity_reviews(id) on delete set null,
  sales_ops_account_id uuid null,
  monday_item_id text not null,
  monday_board_id text not null,
  account_directory_account_id uuid null,
  actor_user_id uuid not null,
  action text not null,
  reason text null,
  evidence_shown jsonb not null default '[]'::jsonb,
  prior_account_directory_account_id uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_id_review_event_action_chk check (
    action in ('rebuild', 'auto_link', 'approve', 'reject', 'conflict_blocked')
  )
);

create index if not exists sales_ops_id_review_events_org_idx
  on public.sales_ops_account_identity_review_events (organization_id, created_at desc);

alter table public.sales_ops_account_identity_review_events enable row level security;
revoke all on public.sales_ops_account_identity_review_events from anon, authenticated;
grant select on public.sales_ops_account_identity_review_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_account_identity_review_events'
      and policyname = 'sales_ops_id_review_event_select_admin'
  ) then
    create policy sales_ops_id_review_event_select_admin
      on public.sales_ops_account_identity_review_events for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
            and up.role in ('admin', 'super_admin', 'executive')
        )
      );
  end if;
end $$;

-- ── compensation proposal / commissionable / monthly report lifecycle ────────

create table if not exists public.sales_ops_compensation_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid null,
  status text not null default 'proposal',
  base_salary numeric null,
  rate_per_sf numeric null,
  effective_date date null,
  basis text not null default 'all_completed_sf',
  finally_approved boolean not null default false,
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_comp_status_chk check (status in ('proposal', 'approved', 'retired')),
  constraint sales_ops_comp_basis_chk check (
    basis in ('all_completed_sf', 'incremental_above_baseline', 'manual_exception')
  )
);

create unique index if not exists sales_ops_comp_org_user_uidx
  on public.sales_ops_compensation_proposals (organization_id, coalesce(user_id, '00000000-0000-4000-8000-000000000000'::uuid))
  where status <> 'retired';

alter table public.sales_ops_compensation_proposals enable row level security;
revoke all on public.sales_ops_compensation_proposals from anon, authenticated;
grant select on public.sales_ops_compensation_proposals to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_compensation_proposals'
      and policyname = 'sales_ops_comp_select_scoped'
  ) then
    create policy sales_ops_comp_select_scoped
      on public.sales_ops_compensation_proposals for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          user_id is null
          or user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
        )
      );
  end if;
end $$;

create table if not exists public.sales_ops_commissionable_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  account_directory_account_id uuid not null,
  eligible boolean not null,
  effective_from date null,
  effective_to date null,
  reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sales_ops_comm_acct_uidx
  on public.sales_ops_commissionable_accounts (organization_id, user_id, account_directory_account_id);

alter table public.sales_ops_commissionable_accounts enable row level security;
revoke all on public.sales_ops_commissionable_accounts from anon, authenticated;
grant select on public.sales_ops_commissionable_accounts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_commissionable_accounts'
      and policyname = 'sales_ops_comm_acct_select_scoped'
  ) then
    create policy sales_ops_comm_acct_select_scoped
      on public.sales_ops_commissionable_accounts for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
        )
      );
  end if;
end $$;

create table if not exists public.sales_ops_commission_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  period text not null,
  status text not null default 'DRAFT',
  eligible_sf numeric null,
  amount numeric null,
  locked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sales_ops_comm_report_period_chk check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint sales_ops_comm_report_status_chk check (
    status in ('DRAFT', 'PREPARED', 'REVIEWED', 'APPROVED', 'READY_FOR_PAYMENT', 'PAID', 'ADJUSTED')
  )
);

create unique index if not exists sales_ops_comm_report_uidx
  on public.sales_ops_commission_reports (organization_id, user_id, period);

alter table public.sales_ops_commission_reports enable row level security;
revoke all on public.sales_ops_commission_reports from anon, authenticated;
grant select on public.sales_ops_commission_reports to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sales_ops_commission_reports'
      and policyname = 'sales_ops_comm_report_select_scoped'
  ) then
    create policy sales_ops_comm_report_select_scoped
      on public.sales_ops_commission_reports for select to authenticated
      using (
        organization_id in (
          select up.organization_id from public.user_profiles up
          where up.id = (select auth.uid()) and up.organization_id is not null and up.is_active is true
        )
        and (
          user_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles actor
            where actor.id = (select auth.uid())
              and actor.role in ('admin', 'super_admin', 'executive')
          )
        )
      );
  end if;
end $$;

comment on table public.sales_ops_account_identity_reviews is
  'Monday → Account Directory review queue. Name/alias hints are candidates only.';
comment on table public.sales_ops_compensation_proposals is
  'Compensation configuration. finally_approved stays false until an explicit production approval.';
comment on table public.sales_ops_commission_reports is
  'Monthly commission workflow. Locked/paid rows must not silently recalculate.';
