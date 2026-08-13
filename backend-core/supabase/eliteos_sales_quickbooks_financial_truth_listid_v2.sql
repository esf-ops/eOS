-- eliteOS Sales QuickBooks Financial Truth — ListID enrichment (v2)
-- Manual apply in Supabase SQL editor. DO NOT auto-run from app boot.
-- Do NOT deploy/apply from this PR alone — ops approval required.
--
-- Phase 0 production proof (CData DSN slabOS_QuickBooks_Local_RO):
--   Invoices / SalesOrders / Estimates / ReceivePayments expose CustomerId.
--   Invoices.CustomerId equals Customers.Id (root ListID for sample roots).
--
-- Additive only: nullable QB customer identity columns for later Account Directory
-- Financial Intelligence joins. Sales Dashboard org totals ignore these columns.
-- Never join by CustomerName. Never write Account Directory identity tables.

alter table public.sales_quickbooks_financial_transactions
  add column if not exists qb_customer_list_id text,
  add column if not exists qb_root_customer_list_id text;

alter table public.sales_quickbooks_open_ar_current
  add column if not exists qb_customer_list_id text,
  add column if not exists qb_root_customer_list_id text;

create index if not exists idx_sales_qb_fin_txn_org_root_list_id
  on public.sales_quickbooks_financial_transactions (organization_id, qb_root_customer_list_id)
  where qb_root_customer_list_id is not null;

create index if not exists idx_sales_qb_fin_txn_org_customer_list_id
  on public.sales_quickbooks_financial_transactions (organization_id, qb_customer_list_id)
  where qb_customer_list_id is not null;

create index if not exists idx_sales_qb_open_ar_org_root_list_id
  on public.sales_quickbooks_open_ar_current (organization_id, qb_root_customer_list_id)
  where qb_root_customer_list_id is not null;

create index if not exists idx_sales_qb_open_ar_org_customer_list_id
  on public.sales_quickbooks_open_ar_current (organization_id, qb_customer_list_id)
  where qb_customer_list_id is not null;

comment on column public.sales_quickbooks_financial_transactions.qb_customer_list_id is
  'ODBC CustomerId (= Customers.Id / QB ListID). May be a job/subcustomer.';
comment on column public.sales_quickbooks_financial_transactions.qb_root_customer_list_id is
  'Resolved root Customers.Id via ad_qb_customer_facts ParentId walk. Null if unresolved.';
comment on column public.sales_quickbooks_open_ar_current.qb_customer_list_id is
  'ODBC CustomerId (= Customers.Id / QB ListID). May be a job/subcustomer.';
comment on column public.sales_quickbooks_open_ar_current.qb_root_customer_list_id is
  'Resolved root Customers.Id via ad_qb_customer_facts ParentId walk. Null if unresolved.';
