-- eliteOS QuickBooks Full Finance Foundation (Phase 1)
-- Manual apply in Supabase SQL editor. DO NOT auto-run from app boot.
-- DO NOT apply as a 2025 historical backfill. Schema only.
--
-- Transport: Windows QB Server → CData ODBC DSN slabOS_QuickBooks_Local_RO
--            → PowerShell finance domain workers
--            → POST /api/internal/finance/quickbooks-sync
-- Backend never connects to QuickBooks. SELECT-only. No QB writes.
-- Thryve / Remote Connector / Sales Dashboard math / AD identity: untouched.
--
-- Canonical accounting basis v1: Accrual.
-- Opening accounting state: Balance Sheet as-of 2024-12-31 (not current Accounts.Balance).
-- Historical transaction target (later ops only): 2025-01-01 → current.
--
-- Privacy: QuickBooks ListIDs / TxnIDs stored for durable joins; never expose in UI.

-- ---------------------------------------------------------------------------
-- Sync control
-- ---------------------------------------------------------------------------

create table if not exists public.qb_finance_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  domain text not null
    check (domain in ('master', 'revenue_ar', 'ap', 'cash', 'accounting')),
  run_kind text not null default 'incremental'
    check (run_kind in ('incremental', 'window', 'opening', 'dry_run')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  worker_version text,
  company_name text,
  coverage_start_date date,
  coverage_end_date date,
  report_basis text not null default 'Accrual',
  row_counts jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qb_fin_sync_runs_org_domain_started
  on public.qb_finance_sync_runs (organization_id, domain, started_at desc);

create table if not exists public.qb_finance_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  domain text not null
    check (domain in ('master', 'revenue_ar', 'ap', 'cash', 'accounting')),
  dataset text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'failed')),
  sync_run_id uuid,
  row_count integer,
  source_count integer,
  warning_count integer default 0,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, domain, dataset, period_start, period_end)
);

create index if not exists idx_qb_fin_ckpt_org_domain_status
  on public.qb_finance_sync_checkpoints (organization_id, domain, status, period_start);

-- ---------------------------------------------------------------------------
-- Masters
-- ---------------------------------------------------------------------------

create table if not exists public.qb_finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_account_id text not null,
  name text,
  full_name text,
  account_number text,
  account_type text,
  special_type text,
  parent_account_id text,
  parent_account_name text,
  cash_flow_classification text,
  is_active boolean,
  current_balance numeric,
  account_balance numeric,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_account_id)
);

create index if not exists idx_qb_fin_accounts_org_type
  on public.qb_finance_accounts (organization_id, account_type);

create table if not exists public.qb_finance_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_vendor_id text not null,
  name text,
  company_name text,
  vendor_type_name text,
  is_active boolean,
  account_number text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_vendor_id)
);

create index if not exists idx_qb_fin_vendors_org_name
  on public.qb_finance_vendors (organization_id, name);

create table if not exists public.qb_finance_account_balances_current (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_account_id text not null,
  account_name text,
  account_type text,
  balance numeric,
  account_balance numeric,
  as_of_captured_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_account_id)
);

-- ---------------------------------------------------------------------------
-- Revenue / AR extensions (Sales Truth tables remain separate)
-- ---------------------------------------------------------------------------

create table if not exists public.qb_finance_payment_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receive_payment_id text not null,
  applied_to_ref_id text not null,
  applied_amount numeric,
  applied_payment_amount numeric,
  applied_txn_type text,
  applied_txn_date date,
  applied_reference_number text,
  payment_date date,
  qb_customer_list_id text,
  customer_name text,
  time_modified timestamptz,
  source_composite_id text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, receive_payment_id, applied_to_ref_id)
);

create index if not exists idx_qb_fin_pay_app_org_date
  on public.qb_finance_payment_applications (organization_id, payment_date);

create index if not exists idx_qb_fin_pay_app_org_applied
  on public.qb_finance_payment_applications (organization_id, applied_to_ref_id);

create table if not exists public.qb_finance_credit_memos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_txn_id text not null,
  reference_number text,
  txn_date date,
  qb_customer_list_id text,
  customer_name text,
  amount numeric,
  open_amount numeric,
  memo text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

create index if not exists idx_qb_fin_credit_memos_org_date
  on public.qb_finance_credit_memos (organization_id, txn_date);

create table if not exists public.qb_finance_sales_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_txn_id text not null,
  reference_number text,
  txn_date date,
  qb_customer_list_id text,
  customer_name text,
  amount numeric,
  deposit_to_account_id text,
  deposit_to_account_name text,
  memo text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

create index if not exists idx_qb_fin_sales_receipts_org_date
  on public.qb_finance_sales_receipts (organization_id, txn_date);

create table if not exists public.qb_finance_linked_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_txn_type text not null,
  source_txn_id text not null,
  linked_txn_type text not null,
  linked_txn_id text not null,
  linked_amount numeric,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_txn_type, source_txn_id, linked_txn_type, linked_txn_id)
);

-- ---------------------------------------------------------------------------
-- AP
-- ---------------------------------------------------------------------------

create table if not exists public.qb_finance_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_bill_id text not null,
  reference_number text,
  txn_date date,
  due_date date,
  terms_name text,
  terms_list_id text,
  qb_vendor_id text,
  vendor_name text,
  amount numeric,
  open_amount numeric,
  is_paid boolean,
  ap_account_id text,
  ap_account_name text,
  memo text,
  time_created timestamptz,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_bill_id)
);

create index if not exists idx_qb_fin_bills_org_date
  on public.qb_finance_bills (organization_id, txn_date);

create index if not exists idx_qb_fin_bills_org_vendor
  on public.qb_finance_bills (organization_id, qb_vendor_id);

create table if not exists public.qb_finance_vendor_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_txn_id text not null,
  reference_number text,
  txn_date date,
  qb_vendor_id text,
  vendor_name text,
  amount numeric,
  memo text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

create table if not exists public.qb_finance_bill_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bill_payment_id text not null,
  payment_method text not null
    check (payment_method in ('check', 'credit_card')),
  applied_to_ref_id text not null,
  applied_amount numeric,
  applied_balance_remaining numeric,
  applied_reference_number text,
  applied_txn_date date,
  applied_txn_type text,
  payment_date date,
  qb_vendor_id text,
  vendor_name text,
  bank_or_cc_account_id text,
  bank_or_cc_account_name text,
  time_modified timestamptz,
  source_composite_id text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, bill_payment_id, payment_method, applied_to_ref_id)
);

create index if not exists idx_qb_fin_bill_app_org_date
  on public.qb_finance_bill_applications (organization_id, payment_date);

create table if not exists public.qb_finance_open_ap_current (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_bill_id text not null,
  reference_number text,
  bill_date date,
  due_date date,
  terms_name text,
  terms_list_id text,
  qb_vendor_id text,
  vendor_name text,
  original_amount numeric,
  open_amount numeric not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_bill_id)
);

create index if not exists idx_qb_fin_open_ap_org
  on public.qb_finance_open_ap_current (organization_id, open_amount desc);

-- ---------------------------------------------------------------------------
-- Cash
-- ---------------------------------------------------------------------------

create table if not exists public.qb_finance_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_deposit_id text not null,
  txn_date date,
  deposit_to_account_id text,
  deposit_to_account_name text,
  total_deposit numeric,
  memo text,
  time_created timestamptz,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_deposit_id)
);

create index if not exists idx_qb_fin_deposits_org_date
  on public.qb_finance_deposits (organization_id, txn_date);

create table if not exists public.qb_finance_deposit_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_deposit_id text not null,
  source_line_id text not null,
  total_deposit numeric,
  item_amount numeric,
  item_txn_type text,
  item_ref_id text,
  entity_name text,
  entity_id text,
  payment_method_name text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_deposit_id, source_line_id)
);

create index if not exists idx_qb_fin_deposit_lines_item_ref
  on public.qb_finance_deposit_line_items (organization_id, item_ref_id);

create table if not exists public.qb_finance_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_check_id text not null,
  reference_number text,
  txn_date date,
  payee_name text,
  payee_id text,
  bank_account_id text,
  bank_account_name text,
  amount numeric,
  memo text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_check_id)
);

create index if not exists idx_qb_fin_checks_org_date
  on public.qb_finance_checks (organization_id, txn_date);

create table if not exists public.qb_finance_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_transfer_id text not null,
  txn_date date,
  from_account_id text,
  from_account_name text,
  to_account_id text,
  to_account_name text,
  amount numeric,
  memo text,
  time_created timestamptz,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_transfer_id)
);

create index if not exists idx_qb_fin_transfers_org_date
  on public.qb_finance_transfers (organization_id, txn_date);

-- Normalized cash events. Never sum customer_receipt + bank_deposit as cash-in.
create table if not exists public.qb_finance_cash_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_role text not null
    check (event_role in (
      'customer_receipt',
      'bank_deposit',
      'bank_deposit_line',
      'bank_disbursement',
      'transfer',
      'undeposited_queue'
    )),
  source_txn_type text not null,
  source_txn_id text not null,
  source_line_id text not null default '',
  txn_date date,
  amount numeric,
  account_id text,
  account_name text,
  linked_txn_type text,
  linked_txn_id text,
  memo text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, event_role, source_txn_type, source_txn_id, source_line_id)
);

create index if not exists idx_qb_fin_cash_events_org_role_date
  on public.qb_finance_cash_events (organization_id, event_role, txn_date);

create table if not exists public.qb_finance_undeposited_current (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_txn_id text not null,
  txn_type text,
  txn_date date,
  qb_customer_list_id text,
  customer_name text,
  amount numeric,
  reference_number text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

-- ---------------------------------------------------------------------------
-- Accounting / reports (authoritative P&L and BS are QuickBooks reports)
-- ---------------------------------------------------------------------------

-- Journal lines are explicit journals only — not the entire GL.
create table if not exists public.qb_finance_journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  journal_entry_id text not null,
  line_id text not null,
  line_type text,
  txn_date date,
  line_account_id text,
  line_account_name text,
  line_amount numeric,
  entity_name text,
  entity_id text,
  memo text,
  class_name text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, journal_entry_id, line_id)
);

create index if not exists idx_qb_fin_je_lines_org_date
  on public.qb_finance_journal_entry_lines (organization_id, txn_date);

-- Cross-transaction activity index. NOT a double-entry ledger.
-- Live: date-bounded Bills returned one summarized row, blank TxnLineId, AP account.
create table if not exists public.qb_finance_transaction_index (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  qb_txn_id text not null,
  txn_line_id text not null default '',
  txn_type text,
  txn_date date,
  entity_name text,
  entity_id text,
  account_name text,
  account_id text,
  reference_number text,
  amount numeric,
  amount_in_home_currency numeric,
  memo text,
  time_modified timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, qb_txn_id, txn_line_id)
);

create index if not exists idx_qb_fin_txn_index_org_date_type
  on public.qb_finance_transaction_index (organization_id, txn_date, txn_type);

create table if not exists public.qb_finance_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  report_type text not null
    check (report_type in ('profit_and_loss', 'balance_sheet')),
  source_view text not null,
  report_basis text not null default 'Accrual',
  period_start date,
  period_end date,
  as_of_date date,
  is_opening boolean not null default false,
  control_totals jsonb not null default '{}'::jsonb,
  sync_run_id uuid,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qb_fin_report_snap_org_type_asof
  on public.qb_finance_report_snapshots (organization_id, report_type, as_of_date desc);

create table if not exists public.qb_finance_report_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  snapshot_id uuid not null references public.qb_finance_report_snapshots (id) on delete cascade,
  line_order integer not null,
  label text,
  amount numeric,
  row_type text,
  created_at timestamptz not null default now(),
  unique (snapshot_id, line_order)
);

create index if not exists idx_qb_fin_report_lines_org_snap
  on public.qb_finance_report_lines (organization_id, snapshot_id);

-- Opening account/state extracted from the as-of Balance Sheet (2024-12-31).
-- Do not populate from current Accounts.Balance.
create table if not exists public.qb_finance_opening_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  as_of_date date not null,
  report_basis text not null default 'Accrual',
  line_label text not null,
  amount numeric,
  row_type text,
  qb_account_id text,
  snapshot_id uuid,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, as_of_date, report_basis, line_label)
);

create table if not exists public.qb_finance_reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sync_run_id uuid,
  check_type text not null,
  report_basis text not null default 'Accrual',
  period_start date,
  period_end date,
  as_of_date date,
  eliteos_value numeric,
  quickbooks_value numeric,
  delta numeric,
  tolerance_abs numeric,
  status text not null
    check (status in ('pass', 'warn', 'fail', 'info')),
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_qb_fin_recon_org_created
  on public.qb_finance_reconciliation_results (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: service_role only (Brain ingest). No anon/authenticated grants.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'qb_finance_sync_runs',
    'qb_finance_sync_checkpoints',
    'qb_finance_accounts',
    'qb_finance_vendors',
    'qb_finance_account_balances_current',
    'qb_finance_payment_applications',
    'qb_finance_credit_memos',
    'qb_finance_sales_receipts',
    'qb_finance_linked_transactions',
    'qb_finance_bills',
    'qb_finance_vendor_credits',
    'qb_finance_bill_applications',
    'qb_finance_open_ap_current',
    'qb_finance_deposits',
    'qb_finance_deposit_line_items',
    'qb_finance_checks',
    'qb_finance_transfers',
    'qb_finance_cash_events',
    'qb_finance_undeposited_current',
    'qb_finance_journal_entry_lines',
    'qb_finance_transaction_index',
    'qb_finance_report_snapshots',
    'qb_finance_report_lines',
    'qb_finance_opening_balances',
    'qb_finance_reconciliation_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ' service role', t);
    execute format(
      'create policy %I on public.%I as permissive for all to service_role using (true) with check (true)',
      t || ' service role',
      t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
