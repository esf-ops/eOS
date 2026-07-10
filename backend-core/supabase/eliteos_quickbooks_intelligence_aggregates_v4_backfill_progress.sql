-- eliteOS QuickBooks Intelligence Phase 4G.4 — Backfill progress markers + amount extraction
-- Manual apply only: Supabase SQL editor → paste → run once.
-- Do NOT apply automatically from CI/agents.
--
-- Why v4:
--   Phase 4G.3 backfill selected rows where intel_total_amount (etc.) IS NULL.
--   When TotalAmount extraction failed, those rows stayed eligible forever:
--     updated=100 remaining=45900 every round (same first N ids reprocessed).
--   Evidence: txn_date/due_date/open_amount/customer filled for 100 rows, but
--   total_amount_filled stayed 0.
--
-- v4 fix:
--   1) Process by intel_backfilled_at IS NULL (marker), not by nullable amounts.
--   2) Broader money extraction (TotalAmount → Subtotal → Amount; strip $ / commas).
--   3) Always set intel_backfilled_at + intel_backfill_version='v4' after a chunk.
--
-- Fake/sentinel payload shapes exercised by extraction helpers (never log these live):
--   {"TotalAmount":"1234.56"}
--   {"TotalAmount":{"#text":"1234.56"}}
--   {"Subtotal":"99.00"}                         -- fallback when TotalAmount absent
--   {"Amount":"50"}                              -- fallback
--   {"TotalAmount":"$1,234.56"}                   -- currency / comma form
--   {"BalanceRemaining":{"#text":"10.00"}}        -- open amount
--
-- Security: service_role only. Never returns raw_payload.
-- Depends on: eliteos_quickbooks_intelligence_aggregates_v3.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Improved money helper + total/open extractors
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.qb_json_scalar_text(j jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when j is null or j = 'null'::jsonb then null
    when jsonb_typeof(j) = 'object' and (j ? '#text') then nullif(btrim(j->>'#text'), '')
    when jsonb_typeof(j) = 'string' then nullif(btrim(j #>> '{}'), '')
    when jsonb_typeof(j) in ('number', 'boolean') then btrim(j #>> '{}')
    else null
  end;
$$;

-- Accept plain numbers, #text wrappers, commas, and leading $ / currency noise.
create or replace function public.qb_json_money(j jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when cleaned is null or cleaned = '' then null
    when cleaned ~ '^-?[0-9]+(\.[0-9]+)?$' then cleaned::numeric
    else null
  end
  from (
    select nullif(
      regexp_replace(
        regexp_replace(
          coalesce(public.qb_json_scalar_text(j), ''),
          '[,$]',
          '',
          'g'
        ),
        '^[^0-9.-]+',
        ''
      ),
      ''
    ) as cleaned
  ) t;
$$;

-- Invoice / estimate / SO billed total: try common QB amount keys in priority order.
-- Fake shapes: TotalAmount, Subtotal, Amount (string, number, or {"#text":"..."}).
create or replace function public.qb_intel_extract_total_amount(payload jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select coalesce(
    public.qb_json_money(payload -> 'TotalAmount'),
    public.qb_json_money(payload -> 'Subtotal'),
    public.qb_json_money(payload -> 'Amount'),
    public.qb_json_money(payload -> 'AppliedAmount')
  );
$$;

-- Open AR / balance remaining.
create or replace function public.qb_intel_extract_open_amount(payload jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select coalesce(
    public.qb_json_money(payload -> 'BalanceRemaining'),
    public.qb_json_money(payload -> 'OpenAmount'),
    public.qb_json_money(payload -> 'AmountDue')
  );
$$;

revoke all on function public.qb_json_scalar_text(jsonb) from public, anon, authenticated;
revoke all on function public.qb_json_money(jsonb) from public, anon, authenticated;
revoke all on function public.qb_intel_extract_total_amount(jsonb) from public, anon, authenticated;
revoke all on function public.qb_intel_extract_open_amount(jsonb) from public, anon, authenticated;
grant execute on function public.qb_json_scalar_text(jsonb) to service_role;
grant execute on function public.qb_json_money(jsonb) to service_role;
grant execute on function public.qb_intel_extract_total_amount(jsonb) to service_role;
grant execute on function public.qb_intel_extract_open_amount(jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Processed markers (progress is marker-based, not null-amount-based)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brain_quickbooks_invoices
  add column if not exists intel_backfilled_at timestamptz,
  add column if not exists intel_backfill_version text;

alter table public.brain_quickbooks_payments
  add column if not exists intel_backfilled_at timestamptz,
  add column if not exists intel_backfill_version text;

alter table public.brain_quickbooks_estimates
  add column if not exists intel_backfilled_at timestamptz,
  add column if not exists intel_backfill_version text;

alter table public.brain_quickbooks_sales_orders
  add column if not exists intel_backfilled_at timestamptz,
  add column if not exists intel_backfill_version text;

create index if not exists idx_qb_inv_intel_backfilled_at
  on public.brain_quickbooks_invoices (organization_id, intel_backfilled_at)
  where intel_backfilled_at is null;

create index if not exists idx_qb_pay_intel_backfilled_at
  on public.brain_quickbooks_payments (organization_id, intel_backfilled_at)
  where intel_backfilled_at is null;

create index if not exists idx_qb_est_intel_backfilled_at
  on public.brain_quickbooks_estimates (organization_id, intel_backfilled_at)
  where intel_backfilled_at is null;

create index if not exists idx_qb_so_intel_backfilled_at
  on public.brain_quickbooks_sales_orders (organization_id, intel_backfilled_at)
  where intel_backfilled_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Chunked backfill RPCs (marker-driven)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.qb_intelligence_backfill_invoices(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 20000));
  v_updated integer := 0;
  v_remaining integer := 0;
begin
  -- Select unprocessed rows first (marker), then update only those ids.
  -- Rows with null intel_total_amount are still marked processed so they are
  -- never reselected forever.
  with picked as (
    select i.id
    from public.brain_quickbooks_invoices i
    where i.intel_backfilled_at is null
    order by i.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_invoices i
    set
      intel_txn_date = coalesce(i.txn_date, public.qb_json_date(i.raw_payload -> 'TxnDate')),
      intel_due_date = public.qb_json_date(i.raw_payload -> 'DueDate'),
      intel_total_amount = public.qb_intel_extract_total_amount(i.raw_payload),
      intel_open_amount = public.qb_intel_extract_open_amount(i.raw_payload),
      intel_customer_list_id = coalesce(
        nullif(i.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(i.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(i.raw_payload -> 'SalesRepRef'),
      intel_backfilled_at = now(),
      intel_backfill_version = 'v4'
    from picked p
    where i.id = p.id
    returning i.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_invoices i
  where i.intel_backfilled_at is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'invoices',
    'updated', v_updated,
    'updated_count', v_updated,
    'remaining', v_remaining,
    'limit', v_limit,
    'backfill_version', 'v4'
  );
end;
$$;

create or replace function public.qb_intelligence_backfill_payments(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 20000));
  v_updated integer := 0;
  v_remaining integer := 0;
begin
  with picked as (
    select p.id
    from public.brain_quickbooks_payments p
    where p.intel_backfilled_at is null
    order by p.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_payments p
    set
      intel_txn_date = coalesce(p.txn_date, public.qb_json_date(p.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_intel_extract_total_amount(p.raw_payload),
      intel_customer_list_id = coalesce(
        nullif(p.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(p.raw_payload -> 'CustomerRef')
      ),
      intel_backfilled_at = now(),
      intel_backfill_version = 'v4'
    from picked x
    where p.id = x.id
    returning p.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_payments p
  where p.intel_backfilled_at is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'payments',
    'updated', v_updated,
    'updated_count', v_updated,
    'remaining', v_remaining,
    'limit', v_limit,
    'backfill_version', 'v4'
  );
end;
$$;

create or replace function public.qb_intelligence_backfill_estimates(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 20000));
  v_updated integer := 0;
  v_remaining integer := 0;
begin
  with picked as (
    select e.id
    from public.brain_quickbooks_estimates e
    where e.intel_backfilled_at is null
    order by e.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_estimates e
    set
      intel_txn_date = coalesce(e.txn_date, public.qb_json_date(e.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_intel_extract_total_amount(e.raw_payload),
      intel_customer_list_id = coalesce(
        nullif(e.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(e.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(e.raw_payload -> 'SalesRepRef'),
      intel_is_fully_invoiced = coalesce(public.qb_json_bool(e.raw_payload -> 'IsFullyInvoiced'), false),
      intel_is_linked = (
        coalesce(public.qb_json_bool(e.raw_payload -> 'IsFullyInvoiced'), false)
        or public.qb_payload_has_linked_invoice(e.raw_payload)
      ),
      intel_backfilled_at = now(),
      intel_backfill_version = 'v4'
    from picked x
    where e.id = x.id
    returning e.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_estimates e
  where e.intel_backfilled_at is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'estimates',
    'updated', v_updated,
    'updated_count', v_updated,
    'remaining', v_remaining,
    'limit', v_limit,
    'backfill_version', 'v4'
  );
end;
$$;

create or replace function public.qb_intelligence_backfill_sales_orders(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 20000));
  v_updated integer := 0;
  v_remaining integer := 0;
begin
  with picked as (
    select s.id
    from public.brain_quickbooks_sales_orders s
    where s.intel_backfilled_at is null
    order by s.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_sales_orders s
    set
      intel_txn_date = coalesce(s.txn_date, public.qb_json_date(s.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_intel_extract_total_amount(s.raw_payload),
      intel_customer_list_id = coalesce(
        nullif(s.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(s.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(s.raw_payload -> 'SalesRepRef'),
      intel_is_fully_invoiced = coalesce(public.qb_json_bool(s.raw_payload -> 'IsFullyInvoiced'), false),
      intel_is_linked = (
        coalesce(public.qb_json_bool(s.raw_payload -> 'IsFullyInvoiced'), false)
        or public.qb_payload_has_linked_invoice(s.raw_payload)
      ),
      intel_backfilled_at = now(),
      intel_backfill_version = 'v4'
    from picked x
    where s.id = x.id
    returning s.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_sales_orders s
  where s.intel_backfilled_at is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'sales_orders',
    'updated', v_updated,
    'updated_count', v_updated,
    'remaining', v_remaining,
    'limit', v_limit,
    'backfill_version', 'v4'
  );
end;
$$;

revoke all on function public.qb_intelligence_backfill_invoices(integer) from public, anon, authenticated;
revoke all on function public.qb_intelligence_backfill_payments(integer) from public, anon, authenticated;
revoke all on function public.qb_intelligence_backfill_estimates(integer) from public, anon, authenticated;
revoke all on function public.qb_intelligence_backfill_sales_orders(integer) from public, anon, authenticated;
grant execute on function public.qb_intelligence_backfill_invoices(integer) to service_role;
grant execute on function public.qb_intelligence_backfill_payments(integer) to service_role;
grant execute on function public.qb_intelligence_backfill_estimates(integer) to service_role;
grant execute on function public.qb_intelligence_backfill_sales_orders(integer) to service_role;

-- Manual smoke (safe; no raw_payload):
--   select public.qb_intel_extract_total_amount('{"TotalAmount":"12.34"}'::jsonb);
--   select public.qb_intel_extract_total_amount('{"Subtotal":{"#text":"9.50"}}'::jsonb);
--   select public.qb_intel_extract_total_amount('{"Amount":"$1,000.00"}'::jsonb);
--   select public.qb_intelligence_backfill_invoices(100);
--   -- remaining must drop; rows with null total still get intel_backfilled_at set
