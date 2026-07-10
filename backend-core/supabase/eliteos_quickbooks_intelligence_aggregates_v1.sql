-- eliteOS QuickBooks Intelligence Phase 4G — DB-side executive aggregates
-- Manual apply only: Supabase SQL editor → paste → run once (IF NOT EXISTS / CREATE OR REPLACE safe).
-- Do NOT apply automatically from CI/agents.
--
-- Purpose:
--   Full-period aggregates over brain_quickbooks_* staging without loading all rows
--   into the application runtime. Amounts/dates that live only in raw_payload are
--   extracted inside SQL and NEVER returned as raw_payload.
--
-- Security:
--   SECURITY DEFINER helpers + RPC are executable by service_role only.
--   anon / authenticated cannot call these functions.
--
-- Depends on: eliteos_quickbooks_staging_v1.sql (brain_quickbooks_invoices/payments/
--   estimates/sales_orders already present with organization_id + txn_date indexes).

-- ── Scalar helpers (QBXML often wraps values as {"#text": "..."} ) ───────────

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
revoke all on function public.qb_payload_has_linked_invoice(jsonb) from public, anon, authenticated;
grant execute on function public.qb_json_scalar_text(jsonb) to service_role;
grant execute on function public.qb_json_money(jsonb) to service_role;
grant execute on function public.qb_json_date(jsonb) to service_role;
grant execute on function public.qb_json_bool(jsonb) to service_role;
grant execute on function public.qb_payload_has_linked_invoice(jsonb) to service_role;

-- Supporting indexes (txn_date org indexes already exist in staging v1).
-- Add covering-friendly composites for aggregate scans.
create index if not exists idx_qb_invoices_org_txn_date_cust
  on public.brain_quickbooks_invoices (organization_id, txn_date, qb_customer_list_id);

create index if not exists idx_qb_payments_org_txn_date_cust
  on public.brain_quickbooks_payments (organization_id, txn_date, qb_customer_list_id);

create index if not exists idx_qb_estimates_org_txn_date_cust
  on public.brain_quickbooks_estimates (organization_id, txn_date, qb_customer_list_id);

create index if not exists idx_qb_sales_orders_org_txn_date_cust
  on public.brain_quickbooks_sales_orders (organization_id, txn_date, qb_customer_list_id);

-- ── Main executive aggregate RPC ─────────────────────────────────────────────

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
security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, p_date_to, current_date);
  v_top integer := greatest(1, least(coalesce(p_top_n, 10), 25));
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'risk_desc'));
  v_invoice_summary jsonb;
  v_payment_summary jsonb;
  v_estimate_summary jsonb;
  v_sales_order_summary jsonb;
  v_ar_summary jsonb;
  v_monthly jsonb;
  v_top_revenue jsonb;
  v_top_open_ar jsonb;
  v_top_payments jsonb;
  v_top_leakage jsonb;
  v_counts jsonb;
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

  -- Staging row counts (metadata only; not period-filtered).
  select jsonb_build_object(
    'customers', (select count(*)::int from public.brain_quickbooks_customers c where c.organization_id = p_organization_id),
    'invoices', (select count(*)::int from public.brain_quickbooks_invoices i where i.organization_id = p_organization_id),
    'payments', (select count(*)::int from public.brain_quickbooks_payments p where p.organization_id = p_organization_id),
    'estimates', (select count(*)::int from public.brain_quickbooks_estimates e where e.organization_id = p_organization_id),
    'sales_orders', (select count(*)::int from public.brain_quickbooks_sales_orders s where s.organization_id = p_organization_id),
    'sales_reps', (select count(*)::int from public.brain_quickbooks_sales_reps r where r.organization_id = p_organization_id),
    'invoice_lines', (select count(*)::int from public.brain_quickbooks_invoice_lines l where l.organization_id = p_organization_id)
  ) into v_counts;

  -- Period invoice summary
  select jsonb_build_object(
    'invoice_count', count(*)::int,
    'billed_total', coalesce(sum(public.qb_json_money(i.raw_payload->'TotalAmount')), 0),
    'open_total', coalesce(sum(
      case
        when coalesce(public.qb_json_money(i.raw_payload->'BalanceRemaining'), 0) > 0
          then public.qb_json_money(i.raw_payload->'BalanceRemaining')
        else 0
      end
    ), 0),
    'customer_count', count(distinct nullif(i.qb_customer_list_id, ''))::int
  )
  into v_invoice_summary
  from public.brain_quickbooks_invoices i
  where i.organization_id = p_organization_id
    and i.txn_date is not null
    and i.txn_date between p_date_from and p_date_to;

  -- Period payment summary
  select jsonb_build_object(
    'payment_count', count(*)::int,
    'collected_total', coalesce(sum(public.qb_json_money(p.raw_payload->'TotalAmount')), 0),
    'customer_count', count(distinct nullif(p.qb_customer_list_id, ''))::int
  )
  into v_payment_summary
  from public.brain_quickbooks_payments p
  where p.organization_id = p_organization_id
    and p.txn_date is not null
    and p.txn_date between p_date_from and p_date_to;

  -- Period estimate summary
  with est as (
    select
      e.*,
      public.qb_json_money(e.raw_payload->'TotalAmount') as total_amount,
      public.qb_payload_has_linked_invoice(e.raw_payload)
        or coalesce(public.qb_json_bool(e.raw_payload->'IsFullyInvoiced'), false) as is_linked
    from public.brain_quickbooks_estimates e
    where e.organization_id = p_organization_id
      and e.txn_date is not null
      and e.txn_date between p_date_from and p_date_to
  )
  select jsonb_build_object(
    'estimate_count', count(*)::int,
    'estimate_total', coalesce(sum(total_amount), 0),
    'linked_count', count(*) filter (where is_linked)::int,
    'unlinked_count', count(*) filter (where not is_linked)::int,
    'conversion_rate', case
      when count(*) = 0 then null
      else round((count(*) filter (where is_linked))::numeric * 1000 / count(*)) / 10
    end
  )
  into v_estimate_summary
  from est;

  -- Period sales order summary
  with so as (
    select
      s.*,
      public.qb_json_money(s.raw_payload->'TotalAmount') as total_amount,
      public.qb_payload_has_linked_invoice(s.raw_payload)
        or coalesce(public.qb_json_bool(s.raw_payload->'IsFullyInvoiced'), false) as is_linked
    from public.brain_quickbooks_sales_orders s
    where s.organization_id = p_organization_id
      and s.txn_date is not null
      and s.txn_date between p_date_from and p_date_to
  )
  select jsonb_build_object(
    'sales_order_count', count(*)::int,
    'sales_order_total', coalesce(sum(total_amount), 0),
    'linked_count', count(*) filter (where is_linked)::int,
    'unlinked_count', count(*) filter (where not is_linked)::int
  )
  into v_sales_order_summary
  from so;

  -- AR aging as of date (open balance > 0; due_date from payload, else txn_date)
  with open_inv as (
    select
      i.qb_txn_id,
      i.qb_customer_list_id,
      coalesce(public.qb_json_money(i.raw_payload->'BalanceRemaining'), 0) as balance_remaining,
      coalesce(
        public.qb_json_date(i.raw_payload->'DueDate'),
        i.txn_date
      ) as due_basis
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and coalesce(public.qb_json_money(i.raw_payload->'BalanceRemaining'), 0) > 0
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
    'open_balance_total', coalesce(sum(balance_remaining), 0),
    'overdue_invoice_count', count(*) filter (where bucket in ('1_30','31_60','61_90','90_plus'))::int,
    'overdue_balance_total', coalesce(sum(balance_remaining) filter (where bucket in ('1_30','31_60','61_90','90_plus')), 0),
    'buckets', jsonb_build_object(
      'current', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = 'current')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = 'current'), 0)
      ),
      '1_30', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '1_30')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = '1_30'), 0)
      ),
      '31_60', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '31_60')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = '31_60'), 0)
      ),
      '61_90', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '61_90')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = '61_90'), 0)
      ),
      '90_plus', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = '90_plus')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = '90_plus'), 0)
      ),
      'unknown', jsonb_build_object(
        'invoice_count', count(*) filter (where bucket = 'unknown')::int,
        'balance_total', coalesce(sum(balance_remaining) filter (where bucket = 'unknown'), 0)
      )
    )
  )
  into v_ar_summary
  from aged;

  -- Monthly trend within period
  with months as (
    select generate_series(
      date_trunc('month', p_date_from::timestamp)::date,
      date_trunc('month', p_date_to::timestamp)::date,
      interval '1 month'
    )::date as month_start
  ),
  inv as (
    select date_trunc('month', i.txn_date)::date as month_start,
           count(*)::int as invoice_count,
           coalesce(sum(public.qb_json_money(i.raw_payload->'TotalAmount')), 0) as invoice_total
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and i.txn_date between p_date_from and p_date_to
    group by 1
  ),
  pay as (
    select date_trunc('month', p.txn_date)::date as month_start,
           count(*)::int as payment_count,
           coalesce(sum(public.qb_json_money(p.raw_payload->'TotalAmount')), 0) as payment_total
    from public.brain_quickbooks_payments p
    where p.organization_id = p_organization_id
      and p.txn_date between p_date_from and p_date_to
    group by 1
  ),
  est as (
    select date_trunc('month', e.txn_date)::date as month_start,
           count(*)::int as estimate_count,
           coalesce(sum(public.qb_json_money(e.raw_payload->'TotalAmount')), 0) as estimate_total
    from public.brain_quickbooks_estimates e
    where e.organization_id = p_organization_id
      and e.txn_date between p_date_from and p_date_to
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
  into v_monthly
  from months m
  left join inv i on i.month_start = m.month_start
  left join pay p on p.month_start = m.month_start
  left join est e on e.month_start = m.month_start;

  -- Top customers by period revenue
  with cust as (
    select
      i.qb_customer_list_id,
      count(*)::int as invoice_count,
      coalesce(sum(public.qb_json_money(i.raw_payload->'TotalAmount')), 0) as billed_total,
      coalesce(sum(
        case
          when coalesce(public.qb_json_money(i.raw_payload->'BalanceRemaining'), 0) > 0
            then public.qb_json_money(i.raw_payload->'BalanceRemaining')
          else 0
        end
      ), 0) as open_balance_total,
      max(i.txn_date) as last_invoice_date
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and i.txn_date between p_date_from and p_date_to
      and nullif(i.qb_customer_list_id, '') is not null
    group by i.qb_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_top_revenue
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

  -- Top open AR customers (as of)
  with open_cust as (
    select
      i.qb_customer_list_id,
      count(*)::int as open_invoice_count,
      coalesce(sum(public.qb_json_money(i.raw_payload->'BalanceRemaining')), 0) as open_balance_total
    from public.brain_quickbooks_invoices i
    where i.organization_id = p_organization_id
      and coalesce(public.qb_json_money(i.raw_payload->'BalanceRemaining'), 0) > 0
      and nullif(i.qb_customer_list_id, '') is not null
    group by i.qb_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_top_open_ar
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

  -- Top payment customers (period)
  with pay_cust as (
    select
      p.qb_customer_list_id,
      count(*)::int as payment_count,
      coalesce(sum(public.qb_json_money(p.raw_payload->'TotalAmount')), 0) as payment_total,
      max(p.txn_date) as last_payment_date
    from public.brain_quickbooks_payments p
    where p.organization_id = p_organization_id
      and p.txn_date between p_date_from and p_date_to
      and nullif(p.qb_customer_list_id, '') is not null
    group by p.qb_customer_list_id
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_top_payments
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

  -- Top estimate leakage (unlinked estimates in period)
  with leak as (
    select
      e.qb_txn_id,
      e.qb_customer_list_id,
      e.txn_date,
      coalesce(public.qb_json_money(e.raw_payload->'TotalAmount'), 0) as total_amount,
      case when e.txn_date is null then null else (v_as_of - e.txn_date) end as days_since_estimate,
      'unlinked_estimate'::text as reason
    from public.brain_quickbooks_estimates e
    where e.organization_id = p_organization_id
      and e.txn_date between p_date_from and p_date_to
      and not (
        public.qb_payload_has_linked_invoice(e.raw_payload)
        or coalesce(public.qb_json_bool(e.raw_payload->'IsFullyInvoiced'), false)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.rank), '[]'::jsonb)
  into v_top_leakage
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

  return jsonb_build_object(
    'ok', true,
    'mode', 'full_aggregate',
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
    'staging_row_counts', v_counts,
    'invoice_summary', v_invoice_summary,
    'payment_summary_period', v_payment_summary,
    'estimate_summary', v_estimate_summary,
    'sales_order_summary', v_sales_order_summary,
    'ar_summary', v_ar_summary,
    'monthly_trend', v_monthly,
    'top_lists', jsonb_build_object(
      'top_customers_by_revenue', coalesce(v_top_revenue, '[]'::jsonb),
      'top_open_ar_customers', coalesce(v_top_open_ar, '[]'::jsonb),
      'top_payment_customers', coalesce(v_top_payments, '[]'::jsonb),
      'top_estimate_leakage', coalesce(v_top_leakage, '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer)
  from public, anon, authenticated;
grant execute on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer)
  to service_role;

comment on function public.qb_intelligence_executive_aggregate(uuid, date, date, date, text, integer) is
  'Phase 4G QuickBooks Intelligence full-period aggregates. service_role only. Never returns raw_payload.';
