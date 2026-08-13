-- eliteOS Sales QuickBooks Financial Truth — DueDate / Terms aging (v3)
-- Manual apply in Supabase SQL editor. DO NOT auto-run from app boot.
-- Do NOT deploy/apply from this change alone — ops approval required.
--
-- Phase 0 / Slice B production proof (CData DSN slabOS_QuickBooks_Local_RO):
--   Invoices.DueDate, Invoices.Terms, Invoices.TermsId exist.
--   True A/R aging uses DueDate only — never invoice Date inference.
--
-- Additive only. Sales Dashboard org totals ignore these columns.

alter table public.sales_quickbooks_open_ar_current
  add column if not exists due_date date,
  add column if not exists terms_name text,
  add column if not exists terms_list_id text;

alter table public.sales_quickbooks_financial_transactions
  add column if not exists due_date date,
  add column if not exists terms_name text,
  add column if not exists terms_list_id text;

create index if not exists idx_sales_qb_open_ar_org_root_due
  on public.sales_quickbooks_open_ar_current (organization_id, qb_root_customer_list_id, due_date)
  where qb_root_customer_list_id is not null;

comment on column public.sales_quickbooks_open_ar_current.due_date is
  'QuickBooks Invoices.DueDate. Authoritative for A/R aging. Never infer from invoice Date + Terms.';
comment on column public.sales_quickbooks_open_ar_current.terms_name is
  'QuickBooks Invoices.Terms (display). Safe for staff UI.';
comment on column public.sales_quickbooks_open_ar_current.terms_list_id is
  'QuickBooks Invoices.TermsId. Internal only — never expose in browser responses.';

comment on column public.sales_quickbooks_financial_transactions.due_date is
  'QuickBooks Invoices.DueDate when transaction_type=invoice; null for other types.';
comment on column public.sales_quickbooks_financial_transactions.terms_name is
  'QuickBooks Invoices.Terms when transaction_type=invoice; null for other types.';
comment on column public.sales_quickbooks_financial_transactions.terms_list_id is
  'QuickBooks Invoices.TermsId when transaction_type=invoice. Internal only — never expose in browser responses.';
