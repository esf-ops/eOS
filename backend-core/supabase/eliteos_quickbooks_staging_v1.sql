-- QuickBooks Staging v1
--
-- DO NOT APPLY YET.  This is the Phase 2 design draft.
-- Apply only after Phase 3 backend-core import endpoint is ready and
-- a full round-trip integration test with fake data has passed.
--
-- Manual apply (Supabase SQL editor when ready):
--   1. Open Supabase -> SQL -> New query.
--   2. Paste this file; run once. Re-run is safe (IF NOT EXISTS guards throughout).
--   3. Do not paste real QuickBooks data into this file.
--
-- Pattern mirrors eliteos_moraware_sync_foundation_v1.sql:
--   External system -> local extract -> staging tables -> organization-scoped facts -> heads
--
-- Naming conventions:
--   qb_sync_runs / qb_sync_errors / qb_data_quality_findings  -- audit / run tracking
--   brain_quickbooks_*                                          -- entity staging tables
--
-- Idempotency / upsert (keys mirrored by QB_STAGING_UNIQUE_KEYS in quickBooksStaging.js):
--   List entities  (customers, vendors, items, accounts, classes, sales_reps):
--     unique (organization_id, qb_list_id)
--   Terms (standard + date-driven share a table):
--     unique (organization_id, qb_list_id, term_type)
--   Transaction entities (invoices, payments, bills, purchase_orders, estimates, sales_orders):
--     unique (organization_id, qb_txn_id)
--   Invoice lines:
--     unique (organization_id, qb_txn_id, line_seq_number)
--       line_seq_number is NOT NULL. qb_txn_line_id is nullable and therefore cannot be a
--       unique-key column: Postgres treats NULLs as distinct, so a null qb_txn_line_id would
--       never match ON CONFLICT and re-imports would duplicate invoice lines.
--   Company (singleton):
--     unique (organization_id)
--   All ON CONFLICT: update raw_payload + qb_edit_sequence + time_modified + last_seen_at
--   Change detection: compare incoming qb_edit_sequence; skip raw_payload update if unchanged.
--
-- Privacy rules:
--   Named columns hold only opaque QB IDs, version numbers, and dates.
--   Customer names, vendor names, addresses, phone numbers, email addresses, invoice
--   reference numbers, dollar amounts, quantity, memo text, and item descriptions are
--   stored only in raw_payload -- never in named columns, never logged, never returned
--   directly to the browser.  raw_payload is accessed only by backend-core service-role
--   code and never by anon / authenticated client paths.
--
-- Security:
--   RLS enabled on all tables.  Backend access is controlled by using the Supabase
--   SERVICE ROLE outside browser clients -- the service role bypasses RLS entirely, so
--   the "service role bypass" policies below are documentation of intent, not the actual
--   grant mechanism.  Every table additionally REVOKEs all privileges from anon and
--   authenticated so these tables are never reachable via the Data API even if RLS were
--   ever disabled.  organization_id on every row; no hardcoded org-specific values.

create extension if not exists pgcrypto;


-- ─────────────────────────────────────────────────────────────────────────────
-- Sync run audit
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.qb_sync_runs (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  source_system      text        not null default 'quickbooks',
  -- Connector-assigned run identifier, e.g. "20260710-130918-512b1dca".
  -- Stored as text; never used as a security boundary.
  qb_run_id          text        not null,
  qb_xml_version     text,
  -- "manual-import" | "full-extract" | "incremental" | "dry-run"
  mode               text        not null,
  -- "running" | "success" | "partial" | "failed"
  status             text        not null default 'running',
  -- VM-local timestamps from the connector manifest (informational only).
  started_at         timestamptz,
  finished_at        timestamptz,
  -- When backend-core received and began processing this run.
  imported_at        timestamptz not null default now(),
  -- Per-entity row accounting: { "customers": { "manifest": N, "imported": N, "skipped": N, "errors": N } }
  entity_counts      jsonb       not null default '{}'::jsonb,
  error_count        integer     not null default 0,
  -- Chunked/resumable import metadata (Phase 3). NULL for single-shot imports.
  -- A chunked import shares one import_group_id across all chunk rows; each chunk row
  -- records its own chunk_index (0-based) and the total chunk_count. A resume re-posts
  -- only the failed chunk_index values under the same import_group_id.
  import_group_id    uuid,
  chunk_index        integer,
  chunk_count        integer,
  -- Safe path / metadata only -- no QuickBooks record content.
  metadata           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint qb_sync_runs_chunk_index_nonneg check (chunk_index is null or chunk_index >= 0),
  constraint qb_sync_runs_chunk_count_positive check (chunk_count is null or chunk_count > 0)
);

alter table public.qb_sync_runs enable row level security;

-- Backend access is via the service role (which bypasses RLS). This policy documents
-- intent; it is not the mechanism that grants access.
create policy "qb_sync_runs service role bypass"
  on public.qb_sync_runs
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.qb_sync_runs from anon, authenticated;

-- Idempotent chunk-run inserts: one row per (org, run, chunk) when chunked.
create unique index if not exists uq_qb_sync_runs_org_run_chunk
  on public.qb_sync_runs (organization_id, qb_run_id, chunk_index)
  where chunk_index is not null;


create table if not exists public.qb_sync_errors (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  entity_type        text,                  -- "customers" | "invoices" | ...
  qb_list_id         text,                  -- for list entities; opaque ID, not a name
  qb_txn_id          text,                  -- for transaction entities; opaque ID
  -- "error" | "warning" | "info"
  severity           text        not null default 'error',
  -- "read" | "normalize" | "validate" | "upsert"
  stage              text,
  -- Safe message only -- must never contain raw QuickBooks payload content.
  message            text        not null,
  raw_error          jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

alter table public.qb_sync_errors enable row level security;

create policy "qb_sync_errors service role bypass"
  on public.qb_sync_errors
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.qb_sync_errors from anon, authenticated;


create table if not exists public.qb_data_quality_findings (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  -- "missing_list_id" | "missing_txn_date" | "missing_edit_sequence" | "inactive_record" | ...
  finding_type       text        not null,
  -- "warning" | "error" | "info"
  severity           text        not null default 'warning',
  entity_type        text        not null,
  -- qb_list_id or qb_txn_id, whichever applies; null for entity-level findings.
  entity_source_id   text,
  -- Safe description -- no raw QuickBooks field values.
  message            text        not null,
  metadata           jsonb       not null default '{}'::jsonb,
  detected_at        timestamptz not null default now(),
  resolved_at        timestamptz,
  unique (sync_run_id, finding_type, entity_type, entity_source_id)
);

alter table public.qb_data_quality_findings enable row level security;

create policy "qb_data_quality_findings service role bypass"
  on public.qb_data_quality_findings
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.qb_data_quality_findings from anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Company (singleton per org)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.brain_quickbooks_company (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  -- Sourced from the sync run / manifest (ctx.qbXmlVersion), NOT from the CompanyRet
  -- body (which has no QBXML envelope). Convenience mirror of qb_sync_runs.qb_xml_version.
  qb_xml_version     text,
  -- Full company information in raw_payload; no name columns at this level.
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id)
);

alter table public.brain_quickbooks_company enable row level security;

create policy "brain_quickbooks_company service role bypass"
  on public.brain_quickbooks_company
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_company from anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- List entities (have ListID + EditSeq; no TxnDate)
-- ─────────────────────────────────────────────────────────────────────────────

-- Customers (CustomerRet): ~36 k rows
create table if not exists public.brain_quickbooks_customers (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  -- ListID: opaque QuickBooks identifier, e.g. "80000001-1234567890".
  qb_list_id         text        not null,
  -- EditSeq: monotonically increasing version string; used for change detection.
  qb_edit_sequence   text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  -- Full CustomerRet JSON; never returned to browser.
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_customers enable row level security;

create policy "brain_quickbooks_customers service role bypass"
  on public.brain_quickbooks_customers
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_customers from anon, authenticated;


-- Items (Item*Ret variants): ~469 rows
create table if not exists public.brain_quickbooks_items (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  -- ItemServiceRet | ItemInventoryRet | ItemNonInventoryRet | ItemOtherChargeRet | ...
  item_type          text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_items enable row level security;

create policy "brain_quickbooks_items service role bypass"
  on public.brain_quickbooks_items
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_items from anon, authenticated;


-- Vendors (VendorRet): ~480 rows
create table if not exists public.brain_quickbooks_vendors (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_vendors enable row level security;

create policy "brain_quickbooks_vendors service role bypass"
  on public.brain_quickbooks_vendors
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_vendors from anon, authenticated;


-- Accounts (AccountRet): ~264 rows
create table if not exists public.brain_quickbooks_accounts (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  -- AccountType from QBXML: "Income" | "COGS" | "Expense" | "Bank" | "AccountsReceivable" | ...
  -- Safe type label; not a dollar amount or customer name.
  account_type       text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_accounts enable row level security;

create policy "brain_quickbooks_accounts service role bypass"
  on public.brain_quickbooks_accounts
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_accounts from anon, authenticated;


-- Classes (ClassRet): small (<100 rows)
create table if not exists public.brain_quickbooks_classes (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_classes enable row level security;

create policy "brain_quickbooks_classes service role bypass"
  on public.brain_quickbooks_classes
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_classes from anon, authenticated;


-- Sales reps (SalesRepRet): small (<50 rows)
create table if not exists public.brain_quickbooks_sales_reps (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id)
);

alter table public.brain_quickbooks_sales_reps enable row level security;

create policy "brain_quickbooks_sales_reps service role bypass"
  on public.brain_quickbooks_sales_reps
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_sales_reps from anon, authenticated;


-- Terms (StandardTermsRet + DateDrivenTermsRet): small (~3 rows)
-- Both term types have ListID + EditSeq.  term_type discriminates them in case
-- a ListID is ever reused across types (unlikely, but prevents silent data loss).
create table if not exists public.brain_quickbooks_terms (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id        uuid        references public.qb_sync_runs(id) on delete set null,
  source_system      text        not null default 'quickbooks',
  qb_list_id         text        not null,
  qb_edit_sequence   text,
  -- "standard" | "date-driven"
  term_type          text        not null,
  time_created       timestamptz,
  time_modified      timestamptz,
  is_active          boolean,
  raw_payload        jsonb       not null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, qb_list_id, term_type)
);

alter table public.brain_quickbooks_terms enable row level security;

create policy "brain_quickbooks_terms service role bypass"
  on public.brain_quickbooks_terms
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_terms from anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Transaction entities (have TxnID + EditSeq + TxnDate)
-- ─────────────────────────────────────────────────────────────────────────────

-- Invoices (InvoiceRet): ~45 k rows
create table if not exists public.brain_quickbooks_invoices (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  -- TxnID: opaque QuickBooks transaction identifier.
  qb_txn_id             text        not null,
  -- EditSeq: monotonically increasing version; used for change detection.
  qb_edit_sequence      text,
  -- TxnDate: date the transaction was created in QuickBooks (date only, no time).
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  -- CustomerRef.ListID: opaque ID only (not the customer name).
  qb_customer_list_id   text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_invoices enable row level security;

create policy "brain_quickbooks_invoices service role bypass"
  on public.brain_quickbooks_invoices
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_invoices from anon, authenticated;


-- Invoice lines (derived from InvoiceRet; extracted to a separate folder by the connector).
-- These are NOT represented in the connector manifest -- expected gap.
-- Each line belongs to a parent invoice (qb_txn_id) and has a stable 0-based position.
-- Idempotency key is (organization_id, qb_txn_id, line_seq_number). line_seq_number is
-- NOT NULL. qb_txn_line_id is kept only as a nullable attribute -- it cannot be part of
-- the unique key because it may be null and Postgres treats NULLs as distinct, which would
-- break ON CONFLICT idempotency and duplicate lines on re-import.
create table if not exists public.brain_quickbooks_invoice_lines (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  -- Parent invoice TxnID.
  qb_txn_id             text        not null,
  -- Zero-based position of this line within the parent invoice's line list. Idempotency key.
  line_seq_number       integer     not null,
  -- TxnLineID: line's own QB identifier within the parent transaction. Nullable attribute only.
  qb_txn_line_id        text,
  -- TxnDate inherited from the parent invoice.
  txn_date              date,
  -- ItemRef.ListID: opaque item ID (not the item name or description).
  qb_item_list_id       text,
  -- InvoiceLineRet | InvoiceLineGroupRet | ItemLineRet | ItemGroupLineRet
  line_type             text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id, line_seq_number)
);

alter table public.brain_quickbooks_invoice_lines enable row level security;

create policy "brain_quickbooks_invoice_lines service role bypass"
  on public.brain_quickbooks_invoice_lines
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_invoice_lines from anon, authenticated;


-- Payments / ReceivePayment (ReceivePaymentRet): ~22 k rows
create table if not exists public.brain_quickbooks_payments (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  qb_txn_id             text        not null,
  qb_edit_sequence      text,
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  qb_customer_list_id   text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_payments enable row level security;

create policy "brain_quickbooks_payments service role bypass"
  on public.brain_quickbooks_payments
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_payments from anon, authenticated;


-- Bills (BillRet): ~35 k rows
create table if not exists public.brain_quickbooks_bills (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  qb_txn_id             text        not null,
  qb_edit_sequence      text,
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  -- VendorRef.ListID: opaque ID (not the vendor name).
  qb_vendor_list_id     text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_bills enable row level security;

create policy "brain_quickbooks_bills service role bypass"
  on public.brain_quickbooks_bills
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_bills from anon, authenticated;


-- Purchase orders (PurchaseOrderRet): ~887 rows
create table if not exists public.brain_quickbooks_purchase_orders (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  qb_txn_id             text        not null,
  qb_edit_sequence      text,
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  qb_vendor_list_id     text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_purchase_orders enable row level security;

create policy "brain_quickbooks_purchase_orders service role bypass"
  on public.brain_quickbooks_purchase_orders
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_purchase_orders from anon, authenticated;


-- Estimates (EstimateRet): ~88 k rows
create table if not exists public.brain_quickbooks_estimates (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  qb_txn_id             text        not null,
  qb_edit_sequence      text,
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  qb_customer_list_id   text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_estimates enable row level security;

create policy "brain_quickbooks_estimates service role bypass"
  on public.brain_quickbooks_estimates
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_estimates from anon, authenticated;


-- Sales orders (SalesOrderRet): ~31 k rows
create table if not exists public.brain_quickbooks_sales_orders (
  id                    uuid        primary key default gen_random_uuid(),
  organization_id       uuid        not null default '00000000-0000-0000-0000-000000000000',
  sync_run_id           uuid        references public.qb_sync_runs(id) on delete set null,
  source_system         text        not null default 'quickbooks',
  qb_txn_id             text        not null,
  qb_edit_sequence      text,
  txn_date              date,
  time_created          timestamptz,
  time_modified         timestamptz,
  qb_customer_list_id   text,
  raw_payload           jsonb       not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, qb_txn_id)
);

alter table public.brain_quickbooks_sales_orders enable row level security;

create policy "brain_quickbooks_sales_orders service role bypass"
  on public.brain_quickbooks_sales_orders
  as permissive for all
  to service_role
  using (true)
  with check (true);

revoke all on public.brain_quickbooks_sales_orders from anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Sync run lookups
create index if not exists idx_qb_sync_runs_org_imported
  on public.qb_sync_runs (organization_id, imported_at desc);

create index if not exists idx_qb_sync_runs_org_started
  on public.qb_sync_runs (organization_id, started_at desc);

create index if not exists idx_qb_sync_runs_status
  on public.qb_sync_runs (status, imported_at desc);

create index if not exists idx_qb_sync_errors_run
  on public.qb_sync_errors (sync_run_id);

create index if not exists idx_qb_sync_errors_org_entity
  on public.qb_sync_errors (organization_id, entity_type, created_at desc);

create index if not exists idx_qb_dq_findings_open
  on public.qb_data_quality_findings (organization_id, resolved_at, finding_type);

-- Customers
create index if not exists idx_qb_customers_org_modified
  on public.brain_quickbooks_customers (organization_id, time_modified desc);

create index if not exists idx_qb_customers_org_active
  on public.brain_quickbooks_customers (organization_id, is_active);

-- Items
create index if not exists idx_qb_items_org_type
  on public.brain_quickbooks_items (organization_id, item_type);

-- Accounts
create index if not exists idx_qb_accounts_org_type
  on public.brain_quickbooks_accounts (organization_id, account_type);

-- Invoices (high-volume; date range queries are the dominant access pattern)
create index if not exists idx_qb_invoices_org_txn_date
  on public.brain_quickbooks_invoices (organization_id, txn_date desc);

create index if not exists idx_qb_invoices_org_customer
  on public.brain_quickbooks_invoices (organization_id, qb_customer_list_id);

create index if not exists idx_qb_invoices_org_modified
  on public.brain_quickbooks_invoices (organization_id, time_modified desc);

-- Invoice lines
create index if not exists idx_qb_invoice_lines_org_txn
  on public.brain_quickbooks_invoice_lines (organization_id, qb_txn_id);

create index if not exists idx_qb_invoice_lines_org_item
  on public.brain_quickbooks_invoice_lines (organization_id, qb_item_list_id);

-- Payments
create index if not exists idx_qb_payments_org_txn_date
  on public.brain_quickbooks_payments (organization_id, txn_date desc);

create index if not exists idx_qb_payments_org_customer
  on public.brain_quickbooks_payments (organization_id, qb_customer_list_id);

-- Bills
create index if not exists idx_qb_bills_org_txn_date
  on public.brain_quickbooks_bills (organization_id, txn_date desc);

create index if not exists idx_qb_bills_org_vendor
  on public.brain_quickbooks_bills (organization_id, qb_vendor_list_id);

-- Purchase orders
create index if not exists idx_qb_po_org_txn_date
  on public.brain_quickbooks_purchase_orders (organization_id, txn_date desc);

create index if not exists idx_qb_po_org_vendor
  on public.brain_quickbooks_purchase_orders (organization_id, qb_vendor_list_id);

-- Estimates
create index if not exists idx_qb_estimates_org_txn_date
  on public.brain_quickbooks_estimates (organization_id, txn_date desc);

create index if not exists idx_qb_estimates_org_customer
  on public.brain_quickbooks_estimates (organization_id, qb_customer_list_id);

-- Sales orders
create index if not exists idx_qb_sales_orders_org_txn_date
  on public.brain_quickbooks_sales_orders (organization_id, txn_date desc);

create index if not exists idx_qb_sales_orders_org_customer
  on public.brain_quickbooks_sales_orders (organization_id, qb_customer_list_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- Incremental sync (time_modified) indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- qb_sync_runs.mode = 'incremental' filters by time_modified. Every staging table
-- that has time_modified gets a (organization_id, time_modified desc) index so
-- incremental imports of any entity are index-backed, not sequential scans.
-- (invoice_lines has no time_modified -- lines inherit their parent invoice's dates.)

-- List entities
create index if not exists idx_qb_items_org_modified
  on public.brain_quickbooks_items (organization_id, time_modified desc);

create index if not exists idx_qb_vendors_org_modified
  on public.brain_quickbooks_vendors (organization_id, time_modified desc);

create index if not exists idx_qb_accounts_org_modified
  on public.brain_quickbooks_accounts (organization_id, time_modified desc);

create index if not exists idx_qb_classes_org_modified
  on public.brain_quickbooks_classes (organization_id, time_modified desc);

create index if not exists idx_qb_sales_reps_org_modified
  on public.brain_quickbooks_sales_reps (organization_id, time_modified desc);

create index if not exists idx_qb_terms_org_modified
  on public.brain_quickbooks_terms (organization_id, time_modified desc);

-- Transaction entities (customers + invoices already have a time_modified index above)
create index if not exists idx_qb_payments_org_modified
  on public.brain_quickbooks_payments (organization_id, time_modified desc);

create index if not exists idx_qb_bills_org_modified
  on public.brain_quickbooks_bills (organization_id, time_modified desc);

create index if not exists idx_qb_po_org_modified
  on public.brain_quickbooks_purchase_orders (organization_id, time_modified desc);

create index if not exists idx_qb_estimates_org_modified
  on public.brain_quickbooks_estimates (organization_id, time_modified desc);

create index if not exists idx_qb_sales_orders_org_modified
  on public.brain_quickbooks_sales_orders (organization_id, time_modified desc);

-- Chunk-group lookups for resumable imports
create index if not exists idx_qb_sync_runs_import_group
  on public.qb_sync_runs (import_group_id)
  where import_group_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run after applying to confirm shape)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- select table_name, pg_relation_size(quote_ident(table_name)) as bytes
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name like '%quickbooks%'
--   or table_name like 'qb_%'
-- order by table_name;
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where tablename like '%quickbooks%' or tablename like 'qb_%'
-- order by tablename;
