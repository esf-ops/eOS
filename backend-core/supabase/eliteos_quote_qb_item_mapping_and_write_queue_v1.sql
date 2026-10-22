-- eliteOS Quote ↔ QuickBooks item mapping + transport-independent write queue (v1)
--
-- Phase 0 foundation. DO NOT auto-apply from app boot.
-- Manual apply only after review (Supabase SQL editor or authenticated CLI).
--
-- Non-goals:
--   - No QuickBooks writes
--   - No EstimateAdd
--   - Does not modify CData ODBC READ workers or Readonly DSN
--   - Does not change quoteCalculator pricing
--
-- Prerequisites (already live on Elite production as of Phase 0 audit):
--   - public.brain_quickbooks_items (from eliteos_quickbooks_staging_v1.sql)
--   - public.quote_headers / quote_handoff_documents
--
-- Authority rules:
--   - QuickBooks item identity = qb_list_id (never FullName alone)
--   - pricing_source is independent of qb_list_id
--   - Automatic QuickBooks writeback remains disabled until a later gated phase

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Organization-scoped concept → QuickBooks item mappings
-- ---------------------------------------------------------------------------
create table if not exists public.quote_qb_item_mappings (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null,
  eliteos_concept_key  text        not null,
  qb_list_id           text        not null,
  -- Display / operator reference only — not the identity key.
  qb_full_name         text,
  pricing_source       text        not null,
  customer_facing_name text,
  notes                text,
  is_active            boolean     not null default true,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint quote_qb_item_mappings_pricing_source_ck
    check (pricing_source in (
      'eliteos_pricing_admin',
      'quickbooks_item_price',
      'custom_quote_price',
      'none'
    )),
  constraint quote_qb_item_mappings_concept_ck
    check (char_length(trim(eliteos_concept_key)) > 0),
  constraint quote_qb_item_mappings_list_id_ck
    check (char_length(trim(qb_list_id)) > 0)
);

comment on table public.quote_qb_item_mappings is
  'Maps eliteOS quote concepts to QuickBooks Desktop item ListIDs. ListID is identity; pricing_source is independent. No QB writes from this table.';

comment on column public.quote_qb_item_mappings.qb_list_id is
  'QuickBooks Item ListID (canonical identity). Do not use FullName for joins.';

comment on column public.quote_qb_item_mappings.qb_full_name is
  'Optional FullName snapshot for operator visibility; may drift — ListID remains authoritative.';

comment on column public.quote_qb_item_mappings.pricing_source is
  'Which system owns the quote rate for this concept. Mapping to a QB item does NOT imply quickbooks_item_price.';

create unique index if not exists uq_quote_qb_item_mappings_org_concept_active
  on public.quote_qb_item_mappings (organization_id, eliteos_concept_key)
  where is_active = true;

create index if not exists idx_quote_qb_item_mappings_org_list
  on public.quote_qb_item_mappings (organization_id, qb_list_id);

create index if not exists idx_quote_qb_item_mappings_org_active
  on public.quote_qb_item_mappings (organization_id)
  where is_active = true;

alter table public.quote_qb_item_mappings enable row level security;

drop policy if exists "quote_qb_item_mappings service role bypass"
  on public.quote_qb_item_mappings;
create policy "quote_qb_item_mappings service role bypass"
  on public.quote_qb_item_mappings
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.quote_qb_item_mappings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Transport-independent QuickBooks write queue (no executor in Phase 0)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_qb_write_queue (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null,
  quote_id            uuid        references public.quote_headers (id) on delete set null,
  quote_revision      integer,
  operation_type      text        not null default 'EstimateAdd',
  environment         text        not null default 'test',
  idempotency_key     text        not null,
  payload_hash        text,
  status              text        not null default 'pending',
  attempt_count       integer     not null default 0,
  last_attempt_at     timestamptz,
  last_error_code     text,
  last_error_message  text,
  qb_txn_id           text,
  qb_edit_sequence    text,
  qb_ref_number       text,
  request_payload     jsonb,
  response_payload    jsonb,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint quote_qb_write_queue_status_ck
    check (status in ('pending', 'claimed', 'succeeded', 'failed', 'canceled')),
  constraint quote_qb_write_queue_environment_ck
    check (environment in ('test', 'production')),
  constraint quote_qb_write_queue_operation_ck
    check (char_length(trim(operation_type)) > 0),
  constraint quote_qb_write_queue_idempotency_ck
    check (char_length(trim(idempotency_key)) > 0),
  constraint quote_qb_write_queue_attempt_ck
    check (attempt_count >= 0)
);

comment on table public.quote_qb_write_queue is
  'Future QuickBooks write jobs (EstimateAdd, etc.). Phase 0: schema only — no worker may execute rows. Transport-independent.';

comment on column public.quote_qb_write_queue.environment is
  'Must be test for Phase 1 smoke. Production requires separate explicit enablement.';

comment on column public.quote_qb_write_queue.idempotency_key is
  'Unique per org. Succeeded rows must never be re-executed with the same key.';

create unique index if not exists uq_quote_qb_write_queue_org_idempotency
  on public.quote_qb_write_queue (organization_id, idempotency_key);

create index if not exists idx_quote_qb_write_queue_org_status
  on public.quote_qb_write_queue (organization_id, status, created_at desc);

create index if not exists idx_quote_qb_write_queue_quote
  on public.quote_qb_write_queue (quote_id)
  where quote_id is not null;

alter table public.quote_qb_write_queue enable row level security;

drop policy if exists "quote_qb_write_queue service role bypass"
  on public.quote_qb_write_queue;
create policy "quote_qb_write_queue service role bypass"
  on public.quote_qb_write_queue
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.quote_qb_write_queue from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Optional Elite Stone strong-match seeds (ListIDs verified against
--    brain_quickbooks_items + SDK ItemQuery export 20260710).
--    Idempotent. Skipped when organization_key is absent.
--    pricing_source = eliteos_pricing_admin for all Phase 0 seeds —
--    QB sales price is NOT quote authority.
-- ---------------------------------------------------------------------------
insert into public.quote_qb_item_mappings (
  organization_id,
  eliteos_concept_key,
  qb_list_id,
  qb_full_name,
  pricing_source,
  customer_facing_name,
  notes,
  is_active
)
select
  o.id,
  v.eliteos_concept_key,
  v.qb_list_id,
  v.qb_full_name,
  v.pricing_source,
  v.customer_facing_name,
  v.notes,
  true
from public.organizations o
cross join (
  values
    (
      'tear_out',
      '8000005C-1327168522',
      'Tear Out',
      'eliteos_pricing_admin',
      'Tear Out',
      'Phase 0 strong match. Prefer Tear Out over Labor:Tear Out Labor (Granite) pending accounting confirmation for duplicates.'
    ),
    (
      'cooktop_cutout',
      '80000023-1327168507',
      'Cooktop Cutout',
      'eliteos_pricing_admin',
      'Cooktop cutout',
      'Phase 0 strong match.'
    ),
    (
      'electrical_outlet_cutout',
      '8000002C-1327168509',
      'Electrical Cutouts',
      'eliteos_pricing_admin',
      'Electrical outlet cutout',
      'Phase 0 strong match.'
    ),
    (
      'kitchen_sink_cutout',
      '8000006D-1327168526',
      'Undermount Sink Cutout',
      'eliteos_pricing_admin',
      'Kitchen sink cutout',
      'Phase 0 strong match to Undermount Sink Cutout.'
    ),
    (
      'vanity_bar_sink_cutout',
      '8000006E-1327168527',
      'Undermount Sink Cutout Bar',
      'eliteos_pricing_admin',
      'Vanity/bar sink cutout',
      'Phase 0 strong match.'
    ),
    (
      'vanity_sink_cutout',
      '800000DF-1412265128',
      'Undermount Sink cutout Vanity',
      'eliteos_pricing_admin',
      'Vanity sink cutout',
      'Phase 0 strong match. Distinct from bar cutout ListID.'
    ),
    (
      'waterfall',
      '8000023B-1652221291',
      'Edge:Waterfall End Panels',
      'eliteos_pricing_admin',
      'Waterfall',
      'Phase 0 strong match.'
    ),
    (
      'polish_waterfall_backside',
      '8000023C-1652272304',
      'Edge:Polished Waterfall Back',
      'eliteos_pricing_admin',
      'Polish waterfall backside',
      'Phase 0 strong match.'
    ),
    (
      'popup_outlet_cutout',
      '80000263-1668527188',
      'Labor:Pop-up Cutout',
      'eliteos_pricing_admin',
      'Pop-up outlet cutout',
      'Phase 0 strong match. Not Flush Pop-Up Cutout.'
    )
) as v(
  eliteos_concept_key,
  qb_list_id,
  qb_full_name,
  pricing_source,
  customer_facing_name,
  notes
)
where o.organization_key = 'elite_stone_fabrication'
  and not exists (
    select 1
    from public.quote_qb_item_mappings m
    where m.organization_id = o.id
      and m.eliteos_concept_key = v.eliteos_concept_key
      and m.is_active = true
  );
