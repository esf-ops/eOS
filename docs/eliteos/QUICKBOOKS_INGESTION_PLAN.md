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

**Current archive status — extraction counts confirmed, but archive is NOT staging-ready.**

The archived export at `~/eliteos-local-archive/quickbooks-20260701/full-success`
(run ID `20260701-185251-3b5132b7`) proves the connector's entity coverage and
self-reported record counts (262,654 across 14 entity types, 0 errors). However, every
batch file contains only a C# anonymous-object `.ToString()` string rather than actual
record bodies. For example, `customers/batch-001.json` (192 bytes, claiming 100 records)
contains:

```
"{ entityType = customers, batchNumber = 1, recordCount = 100, records = System.Collections.Generic.List`1[...] }"
```

The `records` field holds the .NET type name, not the serialized records. The actual
customer, invoice, and financial data was never written to disk. **This archive cannot
feed Phase 2 staging.** The preview tool now correctly identifies this condition:
`selfReportedOnlyFileCount > 0` for every entity, with a per-entity warning
`[entity] N batch file(s) contain only a self-reported count, not materialized records
(connector serialization bug: record bodies were not serialized to disk) — not ingest-ready`.

**Root cause (connector-side, not yet fixed):**
`quickbooks-sdk-connector/Normalization/JsonSerializationHelper.cs`'s `WriteValue`
switch has no case for a plain C# anonymous object. The payload passed by
`IteratorQueryRunner.WriteJson`/`RunSingleQuery` (`new { entityType, batchNumber,
recordCount, records }`) does not match `IDictionary<string, object>`, `IDictionary`,
or `IEnumerable`, so it falls through to
`default: writer.WriteStringValue(Convert.ToString(value))` and the object's `.ToString()`
representation is written as a JSON string instead of a real JSON object.

**Required connector fix before Phase 2:** Change the payload type passed to
`WriteIndentedJson` from an anonymous type to `IDictionary<string, object>`, e.g.:

```csharp
WriteIndentedJson(filePath, new Dictionary<string, object>
{
    ["entityType"] = entityType,
    ["batchNumber"] = batchNumber,
    ["recordCount"] = records.Count,
    ["records"] = records,
});
```

After fixing and re-running, verify one batch file is a real JSON object (not a
192-byte string) before proceeding to Phase 2. The Phase 1 preview tool will
automatically show `selfReportedOnlyFileCount=0` and no not-ingest-ready warnings once
the connector serializer is corrected.

**Never commit real QuickBooks export data.** `quickbooks-sdk-connector/exports/` and
`quickbooks-sdk-connector/logs/` are git-ignored. Test fixtures for the reader/summary
modules use small, obviously fake data only (e.g. `Fake Test Customer`, `FAKE-customers-1-0`)
— never real customer, invoice, or financial data.

## Future Phases

### Phase 2 — Staging Schema

Design organization-scoped Supabase staging tables for raw QuickBooks payloads,
mirroring the Moraware `brain_moraware_*` pattern (e.g. `brain_quickbooks_customers`,
`brain_quickbooks_invoices`, `brain_quickbooks_invoice_lines`, etc.), each with
`organization_id`, a `sync_run_id` foreign key, and raw JSON payload storage. No
normalized/business-logic tables yet — staging mirrors QuickBooks Ret elements as
closely as practical.

### Phase 3 — backend-core Import Endpoint

Add a protected internal import endpoint (`POST /api/internal/quickbooks-sync/import`,
shared-secret auth via header, same pattern as
`POST /api/internal/moraware-sync/import`) that accepts batches produced by the
Windows VM connector (or a future uploader script) and writes them into Phase 2
staging tables. Chunked payloads for large entities (invoices, bills, sales orders)
following the Moraware chunked-import precedent. Sync run metadata (`runId`,
`startedAt`, `completedAt`, per-entity counts, errors) recorded per import, similar to
`moraware_sync_runs`.

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
