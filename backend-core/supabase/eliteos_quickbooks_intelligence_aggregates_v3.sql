-- eliteOS QuickBooks Intelligence Phase 4G.3 — Incremental migration + chunked backfill
-- Manual apply only: Supabase SQL editor → paste → run once.
-- Do NOT apply automatically from CI/agents.
--
-- Why v3 (replaces heavy v2 one-shot):
--   Phase 4G.2 used STORED generated intel_* columns that rewrite large staging
--   tables. That timed out in the Supabase SQL editor, leaving only the slow
--   qb_intelligence_executive_aggregate (v1-style raw_payload scans) installed.
--
-- v3 approach (SQL-editor safe):
--   A) Add nullable intel_* columns (no table rewrite)
--   B) Create helpers + section RPCs + chunked backfill RPCs (DDL only; fast)
--   C) Create indexes IF NOT EXISTS
--   D) Operators run backfill RPCs repeatedly (or the Node backfill script)
--   E) Section RPCs read intel_* only — never raw_payload on executive reads
--
-- Security: service_role only. Never returns raw_payload.
-- Depends on: eliteos_quickbooks_staging_v1.sql
--
-- Indexes: CREATE INDEX IF NOT EXISTS (non-CONCURRENTLY) for SQL-editor safety.
-- Do NOT use CREATE INDEX CONCURRENTLY inside a transaction.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Safe JSON helpers (never return raw_payload)
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

create or replace function public.qb_json_money(j jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when s is null or btrim(s) = '' then null
    when btrim(s) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(s)::numeric
    when replace(btrim(s), ',', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(btrim(s), ',', '')::numeric
    else null
  end
  from (select public.qb_json_scalar_text(j) as s) t;
$$;

create or replace function public.qb_json_date(j jsonb)
returns date
language sql
immutable
parallel safe
as $$
  select case
    when s is null then null
    when s ~ '^\d{4}-\d{2}-\d{2}' then left(s, 10)::date
    else null
  end
  from (select public.qb_json_scalar_text(j) as s) t;
$$;

create or replace function public.qb_json_bool(j jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case lower(coalesce(public.qb_json_scalar_text(j), ''))
    when 'true' then true
    when 't' then true
    when '1' then true
    when 'yes' then true
    when 'false' then false
    when 'f' then false
    when '0' then false
    when 'no' then false
    else null
  end;
$$;

-- Opaque ListID from a QB Ref object — never FullName / PII.
create or replace function public.qb_json_ref_list_id(j jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when j is null or j = 'null'::jsonb then null
    when jsonb_typeof(j) = 'object' then nullif(public.qb_json_scalar_text(j->'ListID'), '')
    else nullif(public.qb_json_scalar_text(j), '')
  end;
$$;

create or replace function public.qb_payload_has_linked_invoice(payload jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when payload is null then '[]'::jsonb
        when payload->'LinkedTxn' is null or payload->'LinkedTxn' = 'null'::jsonb then '[]'::jsonb
        when jsonb_typeof(payload->'LinkedTxn') = 'array' then payload->'LinkedTxn'
        else jsonb_build_array(payload->'LinkedTxn')
      end
    ) lt
    where nullif(public.qb_json_scalar_text(lt->'TxnID'), '') is not null
      and coalesce(public.qb_json_scalar_text(lt->'TxnType'), 'Invoice') = 'Invoice'
  );
$$;

revoke all on function public.qb_json_scalar_text(jsonb) from public, anon, authenticated;
revoke all on function public.qb_json_money(jsonb) from public, anon, authenticated;
revoke all on function public.qb_json_date(jsonb) from public, anon, authenticated;
revoke all on function public.qb_json_bool(jsonb) from public, anon, authenticated;
revoke all on function public.qb_json_ref_list_id(jsonb) from public, anon, authenticated;
revoke all on function public.qb_payload_has_linked_invoice(jsonb) from public, anon, authenticated;
grant execute on function public.qb_json_scalar_text(jsonb) to service_role;
grant execute on function public.qb_json_money(jsonb) to service_role;
grant execute on function public.qb_json_date(jsonb) to service_role;
grant execute on function public.qb_json_bool(jsonb) to service_role;
grant execute on function public.qb_json_ref_list_id(jsonb) to service_role;
grant execute on function public.qb_payload_has_linked_invoice(jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Nullable intel_* columns (no STORED/generated — no table rewrite)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brain_quickbooks_invoices
  add column if not exists intel_txn_date date,
  add column if not exists intel_due_date date,
  add column if not exists intel_total_amount numeric,
  add column if not exists intel_open_amount numeric,
  add column if not exists intel_customer_list_id text,
  add column if not exists intel_sales_rep_list_id text;

alter table public.brain_quickbooks_payments
  add column if not exists intel_txn_date date,
  add column if not exists intel_total_amount numeric,
  add column if not exists intel_customer_list_id text;

alter table public.brain_quickbooks_estimates
  add column if not exists intel_txn_date date,
  add column if not exists intel_total_amount numeric,
  add column if not exists intel_customer_list_id text,
  add column if not exists intel_sales_rep_list_id text,
  add column if not exists intel_is_fully_invoiced boolean,
  add column if not exists intel_is_linked boolean;

alter table public.brain_quickbooks_sales_orders
  add column if not exists intel_txn_date date,
  add column if not exists intel_total_amount numeric,
  add column if not exists intel_customer_list_id text,
  add column if not exists intel_sales_rep_list_id text,
  add column if not exists intel_is_fully_invoiced boolean,
  add column if not exists intel_is_linked boolean;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Indexes (after columns exist; non-CONCURRENTLY for SQL editor)
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists idx_qb_inv_org_intel_txn_date
  on public.brain_quickbooks_invoices (organization_id, intel_txn_date);

create index if not exists idx_qb_inv_org_intel_due_date
  on public.brain_quickbooks_invoices (organization_id, intel_due_date);

create index if not exists idx_qb_inv_org_intel_customer
  on public.brain_quickbooks_invoices (organization_id, intel_customer_list_id);

create index if not exists idx_qb_inv_org_intel_sales_rep
  on public.brain_quickbooks_invoices (organization_id, intel_sales_rep_list_id);

create index if not exists idx_qb_inv_org_intel_open
  on public.brain_quickbooks_invoices (organization_id, intel_open_amount)
  where intel_open_amount > 0;

create index if not exists idx_qb_pay_org_intel_txn_date
  on public.brain_quickbooks_payments (organization_id, intel_txn_date);

create index if not exists idx_qb_pay_org_intel_customer
  on public.brain_quickbooks_payments (organization_id, intel_customer_list_id);

create index if not exists idx_qb_est_org_intel_txn_date
  on public.brain_quickbooks_estimates (organization_id, intel_txn_date);

create index if not exists idx_qb_est_org_intel_customer
  on public.brain_quickbooks_estimates (organization_id, intel_customer_list_id);

create index if not exists idx_qb_est_org_intel_unlinked
  on public.brain_quickbooks_estimates (organization_id, intel_txn_date)
  where coalesce(intel_is_linked, false) = false;

create index if not exists idx_qb_so_org_intel_txn_date
  on public.brain_quickbooks_sales_orders (organization_id, intel_txn_date);

create index if not exists idx_qb_so_org_intel_customer
  on public.brain_quickbooks_sales_orders (organization_id, intel_customer_list_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Chunked backfill RPCs (safe counts only; extract once into intel_*)
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
  with picked as (
    select i.id
    from public.brain_quickbooks_invoices i
    where i.intel_txn_date is null
       or i.intel_total_amount is null
       or i.intel_open_amount is null
    order by i.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_invoices i
    set
      intel_txn_date = coalesce(i.txn_date, public.qb_json_date(i.raw_payload -> 'TxnDate')),
      intel_due_date = public.qb_json_date(i.raw_payload -> 'DueDate'),
      intel_total_amount = public.qb_json_money(i.raw_payload -> 'TotalAmount'),
      intel_open_amount = public.qb_json_money(i.raw_payload -> 'BalanceRemaining'),
      intel_customer_list_id = coalesce(
        nullif(i.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(i.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(i.raw_payload -> 'SalesRepRef')
    from picked p
    where i.id = p.id
    returning i.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_invoices i
  where i.intel_txn_date is null
     or i.intel_total_amount is null
     or i.intel_open_amount is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'invoices',
    'updated', v_updated,
    'remaining', v_remaining,
    'limit', v_limit
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
    where p.intel_txn_date is null
       or p.intel_total_amount is null
    order by p.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_payments p
    set
      intel_txn_date = coalesce(p.txn_date, public.qb_json_date(p.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_json_money(p.raw_payload -> 'TotalAmount'),
      intel_customer_list_id = coalesce(
        nullif(p.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(p.raw_payload -> 'CustomerRef')
      )
    from picked x
    where p.id = x.id
    returning p.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_payments p
  where p.intel_txn_date is null
     or p.intel_total_amount is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'payments',
    'updated', v_updated,
    'remaining', v_remaining,
    'limit', v_limit
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
    where e.intel_txn_date is null
       or e.intel_total_amount is null
       or e.intel_is_linked is null
    order by e.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_estimates e
    set
      intel_txn_date = coalesce(e.txn_date, public.qb_json_date(e.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_json_money(e.raw_payload -> 'TotalAmount'),
      intel_customer_list_id = coalesce(
        nullif(e.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(e.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(e.raw_payload -> 'SalesRepRef'),
      intel_is_fully_invoiced = coalesce(public.qb_json_bool(e.raw_payload -> 'IsFullyInvoiced'), false),
      intel_is_linked = (
        coalesce(public.qb_json_bool(e.raw_payload -> 'IsFullyInvoiced'), false)
        or public.qb_payload_has_linked_invoice(e.raw_payload)
      )
    from picked x
    where e.id = x.id
    returning e.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_estimates e
  where e.intel_txn_date is null
     or e.intel_total_amount is null
     or e.intel_is_linked is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'estimates',
    'updated', v_updated,
    'remaining', v_remaining,
    'limit', v_limit
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
    where s.intel_txn_date is null
       or s.intel_total_amount is null
       or s.intel_is_linked is null
    order by s.id
    limit v_limit
    for update skip locked
  ),
  upd as (
    update public.brain_quickbooks_sales_orders s
    set
      intel_txn_date = coalesce(s.txn_date, public.qb_json_date(s.raw_payload -> 'TxnDate')),
      intel_total_amount = public.qb_json_money(s.raw_payload -> 'TotalAmount'),
      intel_customer_list_id = coalesce(
        nullif(s.qb_customer_list_id, ''),
        public.qb_json_ref_list_id(s.raw_payload -> 'CustomerRef')
      ),
      intel_sales_rep_list_id = public.qb_json_ref_list_id(s.raw_payload -> 'SalesRepRef'),
      intel_is_fully_invoiced = coalesce(public.qb_json_bool(s.raw_payload -> 'IsFullyInvoiced'), false),
      intel_is_linked = (
        coalesce(public.qb_json_bool(s.raw_payload -> 'IsFullyInvoiced'), false)
        or public.qb_payload_has_linked_invoice(s.raw_payload)
      )
    from picked x
    where s.id = x.id
    returning s.id
  )
  select count(*)::int into v_updated from upd;

  select count(*)::int into v_remaining
  from public.brain_quickbooks_sales_orders s
  where s.intel_txn_date is null
     or s.intel_total_amount is null
     or s.intel_is_linked is null;

  return jsonb_build_object(
    'ok', true,
    'entity', 'sales_orders',
    'updated', v_updated,
    'remaining', v_remaining,
    'limit', v_limit
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Period assert + staging counts
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.qb_intelligence_assert_period(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns void
language plpgsql
immutable
as $$
begin
  if p_organization_id is null then
    raise exception 'organization_id is required' using errcode = '22023';
  end if;
  if p_date_from is null or p_date_to is null then
    raise exception 'date_from and date_to are required' using errcode = '22023';
  end if;
  if p_date_from > p_date_to then
    raise exception 'date_from must be <= date_to' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.qb_intelligence_assert_period(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.qb_intelligence_assert_period(uuid, date, date)
  to service_role;

create or replace function public.qb_intelligence_staging_counts(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_organization_id is null then
    raise exception 'organization_id is required' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'customers', (select count(*)::int from public.brain_quickbooks_customers c where c.organization_id = p_organization_id),
    'invoices', (select count(*)::int from public.brain_quickbooks_invoices i where i.organization_id = p_organization_id),
    'payments', (select count(*)::int from public.brain_quickbooks_payments p where p.organization_id = p_organization_id),
    'estimates', (select count(*)::int from public.brain_quickbooks_estimates e where e.organization_id = p_organization_id),
    'sales_orders', (select count(*)::int from public.brain_quickbooks_sales_orders s where s.organization_id = p_organization_id),
    'sales_reps', (select count(*)::int from public.brain_quickbooks_sales_reps r where r.organization_id = p_organization_id),
    'invoice_lines', (select count(*)::int from public.brain_quickbooks_invoice_lines l where l.organization_id = p_organization_id)
  );
end;
$$;

revoke all on function public.qb_intelligence_staging_counts(uuid) from public, anon, authenticated;
grant execute on function public.qb_intelligence_staging_counts(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Section RPCs — intel_* columns only (no raw_payload reads)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.qb_intelligence_invoice_summary(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  select jsonb_build_object(
    'invoice_count', count(*)::int,
    'billed_total', coalesce(sum(i.intel_total_amount), 0),
    'open_total', coalesce(sum(
      case when coalesce(i.intel_open_amount, 0) > 0 then i.intel_open_amount else 0 end
    ), 0),
    'customer_count', count(distinct nullif(i.intel_customer_list_id, ''))::int
  )
  into v_out
  from public.brain_quickbooks_invoices i
  where i.organization_id = p_organization_id
    and i.intel_txn_date is not null
    and i.intel_txn_date between p_date_from and p_date_to;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_payment_summary(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  select jsonb_build_object(
    'payment_count', count(*)::int,
    'collected_total', coalesce(sum(p.intel_total_amount), 0),
    'customer_count', count(distinct nullif(p.intel_customer_list_id, ''))::int
  )
  into v_out
  from public.brain_quickbooks_payments p
  where p.organization_id = p_organization_id
    and p.intel_txn_date is not null
    and p.intel_txn_date between p_date_from and p_date_to;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_estimate_summary(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  select jsonb_build_object(
    'estimate_count', count(*)::int,
    'estimate_total', coalesce(sum(e.intel_total_amount), 0),
    'linked_count', count(*) filter (where coalesce(e.intel_is_linked, false))::int,
    'unlinked_count', count(*) filter (where not coalesce(e.intel_is_linked, false))::int,
    'conversion_rate', case
      when count(*) = 0 then null
      else round((count(*) filter (where coalesce(e.intel_is_linked, false)))::numeric * 1000 / count(*)) / 10
    end
  )
  into v_out
  from public.brain_quickbooks_estimates e
  where e.organization_id = p_organization_id
    and e.intel_txn_date is not null
    and e.intel_txn_date between p_date_from and p_date_to;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_sales_order_summary(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  select jsonb_build_object(
    'sales_order_count', count(*)::int,
    'sales_order_total', coalesce(sum(s.intel_total_amount), 0),
    'linked_count', count(*) filter (where coalesce(s.intel_is_linked, false))::int,
    'unlinked_count', count(*) filter (where not coalesce(s.intel_is_linked, false))::int
  )
  into v_out
  from public.brain_quickbooks_sales_orders s
  where s.organization_id = p_organization_id
    and s.intel_txn_date is not null
    and s.intel_txn_date between p_date_from and p_date_to;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_ar_aging(
  p_organization_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, current_date);
  v_out jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required' using errcode = '22023';
  end if;

  with open_inv as (
    select
      i.intel_customer_list_id,
      coalesce(i.intel_open_amount, 0) as open_amount,
      coalesce(i.intel_due_date, i.intel_txn_date) as due_basis
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and coalesce(i.intel_open_amount, 0) > 0
  ),
  aged as (
    select
      *,
      case
        when due_basis is null then 'unknown'
        when (v_as_of - due_basis) <= 0 then 'current'
        when (v_as_of - due_basis) <= 30 then '1_30'
        when (v_as_of - due_basis) <= 60 then '31_60'
        when (v_as_of - due_basis) <= 90 then '61_90'
        else '90_plus'
      end as bucket
    from open_inv
  )
  select jsonb_build_object(
    'asOfDate', v_as_of,
    'open_invoice_count', count(*)::int,
    'open_balance_total', coalesce(sum(open_amount), 0),
    'overdue_invoice_count', count(*) filter (where bucket in ('1_30','31_60','61_90','90_plus'))::int,
    'overdue_balance_total', coalesce(sum(open_amount) filter (where bucket in ('1_30','31_60','61_90','90_plus')), 0),
    'buckets', jsonb_build_object(
      'current', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = 'current')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = 'current'), 0)
      ),
      '1_30', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '1_30')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = '1_30'), 0)
      ),
      '31_60', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '31_60')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = '31_60'), 0)
      ),
      '61_90', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '61_90')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = '61_90'), 0)
      ),
      '90_plus', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '90_plus')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = '90_plus'), 0)
      ),
      'unknown', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = 'unknown')::int,
        'balance_total', coalesce(sum(open_amount) filter (where bucket = 'unknown'), 0)
      )
    )
  )
  into v_out
  from aged;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_monthly_trend(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  with months as (
    select generate_series(
      date_trunc('month', p_date_from::timestamp)::date,
      date_trunc('month', p_date_to::timestamp)::date,
      interval '1 month'
    )::date as month_start
  ),
  inv as (
    select date_trunc('month', i.intel_txn_date)::date as month_start,
           count(*)::int as invoice_count,
           coalesce(sum(i.intel_total_amount), 0) as invoice_total
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and i.intel_txn_date between p_date_from and p_date_to
    group by 1
  ),
  pay as (
    select date_trunc('month', p.intel_txn_date)::date as month_start,
           count(*)::int as payment_count,
           coalesce(sum(p.intel_total_amount), 0) as payment_total
    from public.brain_quickbooks_payments p
    where p.organization_id = p_organization_id
      and p.intel_txn_date between p_date_from and p_date_to
    group by 1
  ),
  est as (
    select date_trunc('month', e.intel_txn_date)::date as month_start,
           count(*)::int as estimate_count,
           coalesce(sum(e.intel_total_amount), 0) as estimate_total
    from public.brain_quickbooks_estimates e
    where e.organization_id = p_organization_id
      and e.intel_txn_date between p_date_from and p_date_to
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', to_char(m.month_start, 'YYYY-MM'),
      'invoice_count', coalesce(i.invoice_count, 0),
      'invoice_total', coalesce(i.invoice_total, 0),
      'payment_count', coalesce(p.payment_count, 0),
      'payment_total', coalesce(p.payment_total, 0),
      'estimate_count', coalesce(e.estimate_count, 0),
      'estimate_total', coalesce(e.estimate_total, 0)
    )
    order by m.month_start
  ), '[]'::jsonb)
  into v_out
  from months m
  left join inv i on i.month_start = m.month_start
  left join pay p on p.month_start = m.month_start
  left join est e on e.month_start = m.month_start;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_top_customers(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date,
  p_sort text default 'risk_desc',
  p_top_n integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'risk_desc'));
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  with cust as (
    select
      i.intel_customer_list_id as qb_customer_list_id,
      count(*)::int as invoice_count,
      coalesce(sum(i.intel_total_amount), 0) as billed_total,
      coalesce(sum(
        case when coalesce(i.intel_open_amount, 0) > 0 then i.intel_open_amount else 0 end
      ), 0) as open_balance_total,
      max(i.intel_txn_date) as last_invoice_date
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and i.intel_txn_date between p_date_from and p_date_to
      and nullif(i.intel_customer_list_id, '') is not null
    group by i.intel_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_out
  from (
    select
      row_number() over (
        order by
          case when v_sort = 'newest' then extract(epoch from last_invoice_date) else null end desc nulls last,
          billed_total desc,
          qb_customer_list_id
      )::int as rank,
      qb_customer_list_id,
      invoice_count,
      billed_total,
      open_balance_total,
      last_invoice_date
    from cust
    order by
      case when v_sort = 'newest' then extract(epoch from last_invoice_date) else null end desc nulls last,
      billed_total desc,
      qb_customer_list_id
    limit v_top
  ) t;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_top_open_ar(
  p_organization_id uuid,
  p_top_n integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_out jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required' using errcode = '22023';
  end if;

  with open_cust as (
    select
      i.intel_customer_list_id as qb_customer_list_id,
      count(*)::int as open_invoice_count,
      coalesce(sum(i.intel_open_amount), 0) as open_balance_total
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and coalesce(i.intel_open_amount, 0) > 0
      and nullif(i.intel_customer_list_id, '') is not null
    group by i.intel_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_out
  from (
    select
      row_number() over (order by open_balance_total desc, qb_customer_list_id)::int as rank,
      qb_customer_list_id,
      open_invoice_count,
      open_balance_total
    from open_cust
    order by open_balance_total desc, qb_customer_list_id
    limit v_top
  ) t;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_top_payment_customers(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date,
  p_sort text default 'risk_desc',
  p_top_n integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'risk_desc'));
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  with pay_cust as (
    select
      p.intel_customer_list_id as qb_customer_list_id,
      count(*)::int as payment_count,
      coalesce(sum(p.intel_total_amount), 0) as payment_total,
      max(p.intel_txn_date) as last_payment_date
    from public.brain_quickbooks_payments p
    where p.organization_id = p_organization_id
      and p.intel_txn_date between p_date_from and p_date_to
      and nullif(p.intel_customer_list_id, '') is not null
    group by p.intel_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_out
  from (
    select
      row_number() over (
        order by
          case when v_sort = 'newest' then extract(epoch from last_payment_date) else null end desc nulls last,
          payment_total desc,
          qb_customer_list_id
      )::int as rank,
      qb_customer_list_id,
      payment_count,
      payment_total,
      last_payment_date,
      null::numeric as avg_days_to_pay
    from pay_cust
    order by
      case when v_sort = 'newest' then extract(epoch from last_payment_date) else null end desc nulls last,
      payment_total desc,
      qb_customer_list_id
    limit v_top
  ) t;

  return v_out;
end;
$$;

create or replace function public.qb_intelligence_top_estimate_leakage(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date,
  p_as_of date default null,
  p_sort text default 'risk_desc',
  p_top_n integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, p_date_to, current_date);
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'risk_desc'));
  v_out jsonb;
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  with leak as (
    select
      e.qb_txn_id,
      e.intel_customer_list_id as qb_customer_list_id,
      e.intel_txn_date as txn_date,
      coalesce(e.intel_total_amount, 0) as total_amount,
      case when e.intel_txn_date is null then null else (v_as_of - e.intel_txn_date) end as days_since_estimate,
      'unlinked_estimate'::text as reason
    from public.brain_quickbooks_estimates e
    where e.organization_id = p_organization_id
      and e.intel_txn_date between p_date_from and p_date_to
      and coalesce(e.intel_is_linked, false) = false
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_out
  from (
    select
      row_number() over (
        order by
          case when v_sort = 'newest' then extract(epoch from txn_date) else null end desc nulls last,
          total_amount desc,
          qb_txn_id
      )::int as rank,
      qb_txn_id,
      qb_customer_list_id,
      total_amount,
      txn_date,
      days_since_estimate,
      reason
    from leak
    order by
      case when v_sort = 'newest' then extract(epoch from txn_date) else null end desc nulls last,
      total_amount desc,
      qb_txn_id
    limit v_top
  ) t;

  return v_out;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      'qb_intelligence_invoice_summary(uuid,date,date)',
      'qb_intelligence_payment_summary(uuid,date,date)',
      'qb_intelligence_estimate_summary(uuid,date,date)',
      'qb_intelligence_sales_order_summary(uuid,date,date)',
      'qb_intelligence_ar_aging(uuid,date)',
      'qb_intelligence_monthly_trend(uuid,date,date)',
      'qb_intelligence_top_customers(uuid,date,date,text,integer)',
      'qb_intelligence_top_open_ar(uuid,integer)',
      'qb_intelligence_top_payment_customers(uuid,date,date,text,integer)',
      'qb_intelligence_top_estimate_leakage(uuid,date,date,date,text,integer)'
    ]) as sig
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', r.sig);
    execute format('grant execute on function public.%s to service_role', r.sig);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Thin orchestrator for SQL smoke only (composes section RPCs; intel_* only)
--    Backend Phase 4G.3 does NOT call this for production reads.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.qb_intelligence_executive_aggregate(
  p_organization_id uuid,
  p_date_from date,
  p_date_to date,
  p_as_of date default null,
  p_sort text default 'risk_desc',
  p_top_n integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, p_date_to, current_date);
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'risk_desc'));
begin
  perform public.qb_intelligence_assert_period(p_organization_id, p_date_from, p_date_to);

  return jsonb_build_object(
    'ok', true,
    'mode', 'full_aggregate',
    'aggregate_version', 'v3',
    'is_sample_limited', false,
    'organization_id', p_organization_id,
    'as_of_date', v_as_of,
    'period', jsonb_build_object(
      'date_from', p_date_from,
      'date_to', p_date_to,
      'as_of', v_as_of,
      'sort', v_sort,
      'is_partial', false,
      'is_sample_limited', false,
      'max_rows', null,
      'page_size', null
    ),
    'staging_row_counts', public.qb_intelligence_staging_counts(p_organization_id),
    'invoice_summary', public.qb_intelligence_invoice_summary(p_organization_id, p_date_from, p_date_to),
    'payment_summary_period', public.qb_intelligence_payment_summary(p_organization_id, p_date_from, p_date_to),
    'estimate_summary', public.qb_intelligence_estimate_summary(p_organization_id, p_date_from, p_date_to),
    'sales_order_summary', public.qb_intelligence_sales_order_summary(p_organization_id, p_date_from, p_date_to),
    'ar_summary', public.qb_intelligence_ar_aging(p_organization_id, v_as_of),
    'monthly_trend', public.qb_intelligence_monthly_trend(p_organization_id, p_date_from, p_date_to),
    'top_lists', jsonb_build_object(
      'top_customers_by_revenue', public.qb_intelligence_top_customers(p_organization_id, p_date_from, p_date_to, v_sort, v_top),
      'top_open_ar_customers', public.qb_intelligence_top_open_ar(p_organization_id, v_top),
      'top_payment_customers', public.qb_intelligence_top_payment_customers(p_organization_id, p_date_from, p_date_to, v_sort, v_top),
      'top_estimate_leakage', public.qb_intelligence_top_estimate_leakage(p_organization_id, p_date_from, p_date_to, v_as_of, v_sort, v_top)
    )
  );
end;
$$;

revoke all on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer)
  from public, anon, authenticated;
grant execute on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer)
  to service_role;

comment on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer) is
  'Phase 4G.3 SQL smoke orchestrator over intel_* section RPCs. Backend prefers section RPCs directly. service_role only. Never returns raw_payload.';

-- Manual backfill (repeat until remaining=0):
--   select public.qb_intelligence_backfill_invoices(5000);
--   select public.qb_intelligence_backfill_payments(5000);
--   select public.qb_intelligence_backfill_estimates(5000);
--   select public.qb_intelligence_backfill_sales_orders(5000);
--
-- Smoke section RPC (after backfill):
--   select public.qb_intelligence_invoice_summary('<org-uuid>'::uuid, '2026-01-01'::date, current_date);
