# QuickBooks Ingestion Plan

## Purpose

QuickBooks Desktop (Elite Stone Fabrications, QuickBooks Enterprise) is the system of
record for accounting: customers, invoices, items, payments, vendors, bills, purchase
orders, accounts, classes, sales reps, terms, estimates, and sales orders. This plan
describes how eliteOS will eventually read that data into Brain (Supabase) so heads
like Sales / Accounts, Executive, and future Finance / Job Costing can use it — without
ever writing back to QuickBooks.

This mirrors the pattern already used for Moraware (`docs/eliteos/moraware-sync-foundation.md`):

`External system → local read-only extract → normalized staging → organization-scoped facts → heads`

## Current Phase: Phase 1 — Local Export Preview Only

**What exists today:**

- `quickbooks-sdk-connector/` (C#, `.NET 4.8`, late-bound COM) runs on the Windows
  Server VM that has QuickBooks Desktop SDK access. It performs **read-only** QBXML
  queries against the live Elite Stone Fabrications company file and writes local
  files only, under `quickbooks-sdk-connector/exports/<timestamp>/` and
  `quickbooks-sdk-connector/logs/`.
- `backend-core/src/quickbooks/quickBooksExportReader.js` and
  `quickBooksExportSummary.js` read an export folder produced by the connector and
  build a **safe summary**: run metadata, per-entity batch/record counts, missing or
  unknown folders, and warnings. No customer names, invoice numbers, addresses,
  emails, phone numbers, amounts, or memo text are read into the summary output.
- `backend-core/src/scripts/previewQuickBooksExport.mjs` is a local CLI that prints
  that summary for a given export folder path.

**What does NOT exist yet (by design):**

- No Supabase writes of any kind from the QuickBooks pipeline.
- No staging tables, migrations, or Brain schema for QuickBooks data.
- No backend-core HTTP import endpoint for QuickBooks data.
- No admin review UI for QuickBooks data.
- No scheduled/automatic upload from the Windows VM to Supabase.
- No service-role Supabase keys, and no Supabase credentials of any kind, on the
  Windows VM.
- No writeback to QuickBooks (the connector and this pipeline are read-only, full stop).

**Running the Phase 1 preview:**

```bash
node backend-core/src/scripts/previewQuickBooksExport.mjs /path/to/quickbooks-sdk-connector/exports/2026-07-01-165230
```

or, via npm script:

```bash
npm run qb:preview -- /path/to/quickbooks-sdk-connector/exports/2026-07-01-165230
```

Exit code `0` means `manifest.json` was found and valid (summary printed either way
once the folder exists; warnings do not change the exit code). Exit code `1` means
the manifest was missing, unreadable, or missing required fields, or no path argument
was given.

**Known encoding quirk (handled):** the connector writes JSON via .NET's
`Encoding.UTF8`, whose default instance emits a UTF-8 byte-order-mark (BOM) on every
file — manifest.json and all batch files. `backend-core/src/quickbooks/quickBooksJsonFileReader.js`
decodes and strips UTF-8/UTF-16LE/UTF-16BE BOMs (and stray leading control characters)
before parsing, so the reader/preview tool tolerates this without any changes needed
on the Windows VM connector.

**Current archive status — materialized and staging-ready.**

The validated materialized export at `~/eliteos-local-archive/quickbooks-20260710/full-materialized`
(run ID `20260710-130918-512b1dca`, QBXML 16.0) is the Phase 2 source of truth:

- Manifest valid: true
- Manifest record count: 263,461 across 14 entity types, 0 errors
- All manifest-backed discovered counts match
- `selfReportedOnlyFileCount=0` for all entities
- `unreadableFileCount=0`, `unrecognizedShapeFileCount=0`
- `invoice-lines` folder exists separately (expected — not in manifest by design)

The serialization bug from the 2026-07-01 archive is fixed. The connector now writes
real materialized JSON objects (via `Dictionary<string, object>` payloads) and the
`verify-batch-json.ps1` gate on the VM confirms the output shape before each full
extract. Phase 2 staging design is ready to apply once the Phase 3 import endpoint
is built and tested with fake data.

**Never commit real QuickBooks export data.** `quickbooks-sdk-connector/exports/` and
`quickbooks-sdk-connector/logs/` are git-ignored. Test fixtures for the reader/summary
modules use small, obviously fake data only (e.g. `Fake Test Customer`, `FAKE-customers-1-0`)
— never real customer, invoice, or financial data.

## Phase 2 — Staging Schema (design complete; not yet applied)

### Status

Design complete as of 2026-07-10.  Migration draft and staging row builder are in the
repo.  **Do not apply the migration until Phase 3 (import endpoint) is ready and a
full round-trip integration test with fake data has passed.**

### Files

| File | Purpose |
|---|---|
| `backend-core/supabase/eliteos_quickbooks_staging_v1.sql` | Migration draft (not applied) |
| `backend-core/src/quickbooks/quickBooksStaging.js` | Staging row builder / field extractor |
| `backend-core/src/quickbooks/quickBooksStaging.test.mjs` | 47 tests using fake QB-shaped data |

### Staging tables

| Entity folder | QB record type | Table | Conflict key |
|---|---|---|---|
| company | CompanyRet (singleton) | `brain_quickbooks_company` | `(organization_id)` |
| customers | CustomerRet | `brain_quickbooks_customers` | `(organization_id, qb_list_id)` |
| items | Item\*Ret | `brain_quickbooks_items` | `(organization_id, qb_list_id)` |
| vendors | VendorRet | `brain_quickbooks_vendors` | `(organization_id, qb_list_id)` |
| accounts | AccountRet | `brain_quickbooks_accounts` | `(organization_id, qb_list_id)` |
| classes | ClassRet | `brain_quickbooks_classes` | `(organization_id, qb_list_id)` |
| sales-reps | SalesRepRet | `brain_quickbooks_sales_reps` | `(organization_id, qb_list_id)` |
| terms | StandardTermsRet / DateDrivenTermsRet | `brain_quickbooks_terms` | `(organization_id, qb_list_id, term_type)` |
| invoices | InvoiceRet | `brain_quickbooks_invoices` | `(organization_id, qb_txn_id)` |
| invoice-lines | derived from InvoiceRet | `brain_quickbooks_invoice_lines` | `(organization_id, qb_txn_id, line_seq_number)` |
| payments | ReceivePaymentRet | `brain_quickbooks_payments` | `(organization_id, qb_txn_id)` |
| bills | BillRet | `brain_quickbooks_bills` | `(organization_id, qb_txn_id)` |
| purchase-orders | PurchaseOrderRet | `brain_quickbooks_purchase_orders` | `(organization_id, qb_txn_id)` |
| estimates | EstimateRet | `brain_quickbooks_estimates` | `(organization_id, qb_txn_id)` |
| sales-orders | SalesOrderRet | `brain_quickbooks_sales_orders` | `(organization_id, qb_txn_id)` |

Audit tables: `qb_sync_runs`, `qb_sync_errors`, `qb_data_quality_findings`.

`qb_data_quality_findings` uses a `unique nulls not distinct (...)` key (Postgres 15+) so
entity-level findings — where `entity_source_id` is null — stay idempotent on re-import.
With the default `NULLS DISTINCT`, two null-`entity_source_id` findings would never collide
and `ON CONFLICT` would duplicate them on every re-run.

### Column conventions

**List entities** (customers, vendors, items, accounts, classes, sales-reps, terms):
- `qb_list_id` — QuickBooks `ListID` (opaque identifier, not a name or PII)
- `qb_edit_sequence` — QuickBooks `EditSequence` (monotonically increasing version string)
- `time_created` / `time_modified` — from QB `TimeCreated` / `TimeModified`
- `is_active` — from QB `IsActive` (boolean)
- `account_type` (accounts only) — QB `AccountType` label (e.g. "Income", "COGS")
- `item_type` (items only) — QB item variant (e.g. "ItemInventoryRet")
- `term_type` (terms only) — "standard" | "date-driven"

**Transaction entities** (invoices, payments, bills, purchase-orders, estimates, sales-orders):
- `qb_txn_id` — QuickBooks `TxnID` (opaque identifier)
- `qb_edit_sequence` — same as above
- `txn_date` — QB `TxnDate` (date only, `date` column type)
- `time_created` / `time_modified` — from QB timestamps
- `qb_customer_list_id` — `CustomerRef.ListID` (opaque FK-like reference; invoices, payments, estimates, sales-orders)
- `qb_vendor_list_id` — `VendorRef.ListID` (opaque FK-like reference; bills, purchase-orders)

**Invoice lines** (derived):
- `qb_txn_id` — parent invoice `TxnID`
- `line_seq_number` — **NOT NULL** 0-based position of the line within the parent invoice; the idempotency key component
- `qb_txn_line_id` — line's own `TxnLineID`, a **nullable attribute only** (never part of the unique key — see idempotency note below)
- `txn_date` — inherited from parent invoice
- `qb_item_list_id` — `ItemRef.ListID` (opaque)
- `line_type` — e.g. "InvoiceLineRet" / "InvoiceLineGroupRet"

**All tables**: `organization_id`, `sync_run_id` (FK to `qb_sync_runs`), `source_system`,
`raw_payload` (full normalized Ret JSON), `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`.

**`qb_sync_runs` chunk/resume metadata** (nullable; for future chunked/resumable Phase 3 imports):
- `import_group_id` — shared across all chunk rows of one chunked import
- `chunk_index` — 0-based index of this chunk (`check chunk_index is null or >= 0`)
- `chunk_count` — total chunk count for the group (`check chunk_count is null or > 0`)
- A partial unique index `(organization_id, qb_run_id, chunk_index) where chunk_index is not null`
  makes chunk-run inserts idempotent; resume re-posts only the failed `chunk_index` values under
  the same `import_group_id`. These are single-shot `NULL` for non-chunked imports.

### Privacy rules

Named columns hold only opaque QB identifiers, version numbers, dates, boolean flags,
and type discriminators.  Customer names, vendor names, addresses, phone numbers, email
addresses, invoice reference numbers, dollar amounts, quantities, memo text, and item
descriptions are stored **only** in `raw_payload` — never in named columns, never
logged, never returned directly to the browser.  `raw_payload` is accessed only by
backend-core service-role code.

### Idempotency / upsert strategy

1. Import code calls `buildStagingRow(entityFolderName, record, { organizationId, syncRunId, qbXmlVersion })`.
   `organizationId` is **required and validated** — a missing/blank org fails closed with
   `{ ok: false, reason: "organizationId is required" }`; no sentinel org is ever silently substituted.
2. Before upserting, compare `incoming.qb_edit_sequence` with the stored value via
   `detectEditSequenceChange(incoming, stored)`.
3. If `"unchanged"`: update only `sync_run_id`, `last_seen_at`, `updated_at` (skip `raw_payload`).
4. If `"changed"` or `"unknown"`: upsert full row including `raw_payload`.
5. Conflict target comes from `getStagingUpsertConfig(entityFolderName).conflictColumns`, which is
   driven by the exported `QB_STAGING_UNIQUE_KEYS` map — the single source of truth kept in lockstep
   with the SQL `unique (...)` constraints so JS and SQL cannot drift.
6. `invoice-lines` conflict key is `(organization_id, qb_txn_id, line_seq_number)`. `line_seq_number`
   is always a non-null 0-based line position, so re-imports match on conflict and never duplicate.
   `qb_txn_line_id` is a nullable attribute only — it is **not** part of the key, because Postgres
   treats NULLs as distinct in a unique constraint, which would defeat `ON CONFLICT` idempotency.
   The staging builder fails closed if no stable `line_seq_number` can be determined.

### RLS and security

- RLS enabled on all 15 staging tables + 3 audit tables.
- Backend access is via the Supabase **service role**, which bypasses RLS entirely — so the
  `service_role` "bypass" policies are documentation of intent, **not** the mechanism that grants
  access. Access control is: use the service role only in backend-core (never in browser clients).
- Every table additionally `revoke all ... from anon, authenticated`, so the tables are unreachable
  via the Data API even if RLS were ever disabled.
- `organization_id` on every row; no hardcoded org-specific values. The zero-UUID sentinel is only a
  column default (matches Moraware precedent); the staging builder never substitutes it — a real
  `organizationId` must be passed explicitly.

### Applying the migration (when ready)

```bash
# Verify a full round-trip test with fake data first.
# Then apply in Supabase SQL editor:
#   backend-core/supabase/eliteos_quickbooks_staging_v1.sql
# Confirm tables exist and RLS is enabled:
# select tablename, rowsecurity from pg_tables
# where tablename like '%quickbooks%' or tablename like 'qb_%'
# order by tablename;
```

## Phase 2B — Local Staging Import Dry Run (implemented; no writes)

`backend-core/src/scripts/dryRunQuickBooksStagingImport.mjs` (script `qb:staging:dry-run`)
reads a materialized export, reuses the Phase 1 reader/summary for validation, then builds
Phase 2 staging rows **in memory** to prove the export would import cleanly. It performs
**no** Supabase writes, imports **no** Supabase client, makes **no** network calls, reads
**no** service-role env vars, and prints **only** safe counts/metadata (never records or
`raw_payload`).

```bash
npm run qb:staging:dry-run -- /path/to/export-folder
```

**Company is staged from the root `company.json`.** Company is a manifest entity (RecordCount 1)
written as a root file, not an entity folder. The dry-run reads `company.json`, builds the row
via `buildStagingRow("company", record, ctx)` (with `qb_xml_version` sourced from
`ctx.qbXmlVersion`), and counts it. If the manifest declares `company` but `company.json` is
missing/unreadable/unmaterialized/empty, the dry-run **fails closed** — company is never
silently skipped.

**Manifest-total reconciliation.** After building, the dry-run asserts
`sum(manifest entity RecordCounts, incl. company) === sum(built primary staging rows, excl.
derived invoice-lines)`. Any delta becomes a fail reason (`DRY RUN FAIL`), so a future manifest
entity that is not staged is caught automatically. Derived invoice-lines are excluded because
they are not a manifest entity.

**Invoice lines are derived from invoices, not from the standalone folder.** The connector's
standalone `invoice-lines` folder is a lossy flattening whose records carry no parent invoice
`TxnID` and no line sequence, so they cannot form the idempotent key
`(organization_id, qb_txn_id, line_seq_number)`. Instead, the dry-run derives invoice-line
rows from each invoice record's nested `InvoiceLineRet`
(`buildInvoiceLineRowsFromInvoiceRecord`), where the parent `TxnID` is present and the
**0-based array position** of each line within its invoice provides a stable
`line_seq_number`. The standalone `invoice-lines` folder is kept only as an informational
count cross-check.

**Line-ordering assumption (F2).** `line_seq_number` is derived from the 0-based document
order of lines within each invoice. This assumes QBXML returns invoice lines in stable
document order across extracts. Phase 3 should use `qb_txn_line_id` where available for
reconciliation / change detection, while keeping `line_seq_number` as the idempotent key.

**Fail-closed gates (DRY RUN FAIL before building rows):** manifest invalid;
`selfReportedOnlyFileCount > 0`; `unreadableFileCount > 0`; `unrecognizedShapeFileCount > 0`;
or a manifest-backed entity's record count ≠ its discovered count. The standalone
`invoice-lines` folder is fully exempt from block gates (it is a cross-check, not a source),
and its absence/mismatch never blocks the run — a count mismatch versus the derived total
raises a **warning + data-quality finding** only. After building, **any** per-record build
failure fails the run, including a derived invoice line that fails closed (missing parent
`TxnID`). Exit code `0` = PASS, `1` = FAIL.

**Record-shape note:** the connector serializes each scalar QBXML element as
`{ "@elementName": "<Tag>", "#text": "<value>" }`. The staging builder unwraps `#text`
(`unwrapQbScalar`) and derives `item_type` / `term_type` / `line_type` from `@elementName`
when no synthetic discriminator is present. Without this unwrap the staging mapping would
not match real exports.

**Dry-run result against the validated `quickbooks-20260710/full-materialized` archive:**

- All 14 manifest entities build cleanly — `company` (1) + the 13 folder entities — for a
  **manifest entity total of 263,462**, exactly matching the built primary staging rows
  (reconciliation passes).
- `invoice-lines` **derived from invoices**: **356,969 rows, 0 failures**, and the standalone
  `invoice-lines` folder count (356,969) **matches** the derived total exactly (cross-check).
- Total rows that would be upserted: **620,431**, 0 failures, 0 data-quality findings.
- Overall result: **DRY RUN PASS**.

The export is staging-ready. Migration remains draft-only; apply it only after Phase 3
(import endpoint) is built and a full round-trip has run on fake data.

## Phase 3A — Import Orchestrator against a Fake Repository (implemented; no writes)

`backend-core/src/quickbooks/quickBooksStagingImport.js` orchestrates a full staging import
by **reusing** the Phase 2B dry-run validation (`computeBlockReasons`,
`readEntityRecordBatches`, `manifestEntityCounts`) and the Phase 2 staging-row builders
(`buildStagingRow`, `buildInvoiceLineRowsFromInvoiceRecord`, `getStagingUpsertConfig`). It
writes through an injected **repository boundary**
(`backend-core/src/quickbooks/quickBooksStagingRepository.js`); the only implementation in
this phase is the in-memory fake (`createInMemoryQuickBooksStagingRepository`). There is
**no Supabase client, no service-role env, and no network** anywhere in this path.

Shared validation/reading helpers (`computeBlockReasons`, `readEntityRecordBatches`,
`manifestEntityCounts`) live in the library module
`backend-core/src/quickbooks/quickBooksExportValidation.js`; both the dry-run script and
the import orchestrator import from there (core ingestion never depends on a `scripts/` CLI
file).

Behaviour:

- **Fail-closed before writes:** if any dry-run gate trips (manifest invalid, self-reported,
  unreadable, unrecognized, or a manifest-backed count mismatch), the import returns
  `status: "failed"` and performs **zero** repository interaction — no audit run, no rows.
- **Error-path finalization:** the entire write phase runs inside a `try/catch`; if any
  repository call throws mid-import, the run is finalized `status: "failed"` (with a safe,
  sanitized message — never record content) instead of being left stuck `running`.
- **On pass:** opens an audit run (`createSyncRun`), then builds and **chunk-upserts**
  (default 500/chunk) company (root `company.json`), all primary manifest folder entities,
  and invoice-lines **derived from invoices** — each via its `getStagingUpsertConfig` conflict
  key, so the fake repo dedupes exactly as `ON CONFLICT (...) DO UPDATE` would. Derived
  invoice-line rows are buffered and flushed in `chunkSize` batches **across invoices**, not
  one upsert per invoice.
- **Idempotent:** re-running the same export updates rows in place (no duplicate inserts).
  The repository stamps `last_seen_at`/`updated_at` on every upsert (insert and update),
  preserving `first_seen_at`/`created_at`; a migration trigger
  (`qb_staging_touch_timestamps`) provides the same guarantee for the Phase 3B DB path.
- **Per-record isolation:** malformed/null records are recorded as safe `qb_sync_errors`
  rows and skipped; the rest still import. Any failures (or a reconciliation mismatch) mark
  the run `partial`; a fully clean import is `success`.
- **Audit + findings:** run status/counts/`finished_at` finalized in the run row; optional
  `importGroupId`/`chunkIndex`/`chunkCount` (for Phase 3B resumable chunked imports) are
  recorded on the run; data-quality findings recorded as counts only.
- **Best-effort counts:** `upsertRows` returns `{ inserted, updated, total }`; `total` is
  authoritative for control flow, while `inserted`/`updated` are best-effort (a real Supabase
  upsert may return them as `0`). The orchestrator uses them only for reporting.
- **Endpoint shape:** `buildImportResponse(result)` returns the safe HTTP contract a future
  protected internal route (`POST /api/internal/quickbooks-sync/import`) will emit
  (`200` success / `207` partial / `422` failed) — counts, IDs, and reasons only.

**Phase 3B note:** the record readers here load an entire entity folder into memory; the
Supabase-backed implementation must stream/chunk **reads** as well as writes for the full
export.

Tests (`quickBooksStagingImport.test.mjs`, fake data only) prove: clean import writes the
expected rows; repeated import is idempotent by conflict key; gate failures abort before any
writes; per-record malformed data is isolated; invoice-lines are derived from invoices;
company is imported; audit run status is correct; no PII sentinels leak into the
result/response/errors/findings/run metadata; and the import path imports no
Supabase/http/service-role/fetch.

## Future Phases

### Phase 3B — Supabase-backed Repository + Protected Endpoint

Add a service-role-backed implementation of the `QuickBooksStagingRepository` interface
(constructed only inside backend-core, never on the VM) and wire it behind a protected
internal route (`POST /api/internal/quickbooks-sync/import`, shared-secret header, same
pattern as `POST /api/internal/moraware-sync/import`). The orchestrator, chunking, gates,
idempotency, and response shape from Phase 3A carry over unchanged — only the repository
implementation swaps from the in-memory fake to Supabase. Apply
`eliteos_quickbooks_staging_v1.sql` before enabling this route.

### Phase 4 — Admin Review UI

System Admin (or a dedicated QuickBooks Admin panel) surfaces sync health, per-entity
row counts, data-quality findings, and recent errors — read-only, admin-gated, no raw
financial data dumped to the browser beyond what's already visible in QuickBooks
Admin's own UI conventions (see Moraware Admin v1 for the UX precedent).

### Phase 5 — Scheduled Connector Upload with Scoped Token

Once Phase 2–4 are validated with manual imports, add a scheduled task on the Windows
VM (Task Scheduler, similar to the Moraware cloud worker pattern) that runs the
connector, then uploads the resulting export batches to the Phase 3 import endpoint
using a **scoped, rotatable upload token** — not a Supabase service-role key. The VM
should never hold Supabase credentials; it only needs the shared import secret (or a
purpose-built scoped token) to reach the backend-core internal endpoint over HTTPS.

## Security

- QuickBooks Desktop SDK access stays on the Windows Server VM only.
- The connector (`quickbooks-sdk-connector/`) is query-only QBXML — no
  add/mod/delete/void requests are ever issued against QuickBooks.
- No Supabase service-role key, Moraware credentials, or other secrets on the
  Windows VM in this phase.
- Local export/log files may contain customer, invoice, and financial data — keep
  them out of git (already git-ignored) and off shared drives without organization
  scoping review.
- Future Phase 2+ staging tables must include `organization_id` per
  `docs/eliteos/FEATURE_DECISIONS.md` and the eliteOS architecture rule — no
  hardcoded single-tenant assumptions even though Elite Stone Fabrications is the
  first (and currently only) QuickBooks-connected organization.
- Future Phase 3 import endpoint must require a server-side secret header, matching
  the Moraware import endpoint precedent — never rely on UI-only hiding.
