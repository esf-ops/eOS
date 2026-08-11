-- eliteOS Sales QuickBooks Financial Truth — prepared ODBC facts (v1)
-- Manual apply in Supabase SQL editor. DO NOT auto-run from app boot.
--
-- Transport: Windows QB Server → CData ODBC DSN slabOS_QuickBooks_Local_RO
--            → PowerShell worker → POST /api/internal/sales/quickbooks-sync
-- Backend never connects to QuickBooks. Thryve Remote Connector is untouched.
--
-- Privacy: customer_name is stored for ops/debug in prepared facts; Sales UI
-- Financial Truth Beta does not render customer names.

create table if not exists public.sales_quickbooks_financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_type text not null
    check (transaction_type in ('estimate', 'sales_order', 'invoice', 'payment')),
  source_id text not null,
  reference_number text,
  transaction_date date not null,
  customer_name text,
  amount numeric not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, transaction_type, source_id)
);

create index if not exists idx_sales_qb_fin_txn_org_date_type
  on public.sales_quickbooks_financial_transactions (organization_id, transaction_date, transaction_type);

create index if not exists idx_sales_qb_fin_txn_org_type_date
  on public.sales_quickbooks_financial_transactions (organization_id, transaction_type, transaction_date);

create index if not exists idx_sales_qb_fin_txn_source
  on public.sales_quickbooks_financial_transactions (organization_id, source_id);

-- Current Open A/R snapshot (as-of latest successful worker refresh).
-- Not historical as-of dashboard end date.
create table if not exists public.sales_quickbooks_open_ar_current (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_invoice_id text not null,
  reference_number text,
  invoice_date date,
  customer_name text,
  original_amount numeric,
  balance numeric not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_invoice_id)
);

create index if not exists idx_sales_qb_open_ar_org
  on public.sales_quickbooks_open_ar_current (organization_id);

create index if not exists idx_sales_qb_open_ar_org_balance
  on public.sales_quickbooks_open_ar_current (organization_id, balance desc);

create table if not exists public.sales_quickbooks_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  worker_version text,
  company_name text,
  coverage_start_date date,
  coverage_end_date date,
  estimates_count integer,
  sales_orders_count integer,
  invoices_count integer,
  payments_count integer,
  open_ar_count integer,
  warnings jsonb not null default '[]'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_qb_sync_runs_org_started
  on public.sales_quickbooks_sync_runs (organization_id, started_at desc);

create index if not exists idx_sales_qb_sync_runs_org_status
  on public.sales_quickbooks_sync_runs (organization_id, status, started_at desc);

alter table public.sales_quickbooks_financial_transactions enable row level security;
alter table public.sales_quickbooks_open_ar_current enable row level security;
alter table public.sales_quickbooks_sync_runs enable row level security;

drop policy if exists "sales_qb_fin_txn service role" on public.sales_quickbooks_financial_transactions;
create policy "sales_qb_fin_txn service role"
  on public.sales_quickbooks_financial_transactions
  as permissive for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "sales_qb_open_ar service role" on public.sales_quickbooks_open_ar_current;
create policy "sales_qb_open_ar service role"
  on public.sales_quickbooks_open_ar_current
  as permissive for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "sales_qb_sync_runs service role" on public.sales_quickbooks_sync_runs;
create policy "sales_qb_sync_runs service role"
  on public.sales_quickbooks_sync_runs
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.sales_quickbooks_financial_transactions from anon, authenticated;
revoke all on public.sales_quickbooks_open_ar_current from anon, authenticated;
revoke all on public.sales_quickbooks_sync_runs from anon, authenticated;
