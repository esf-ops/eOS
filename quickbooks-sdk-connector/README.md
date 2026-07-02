# EliteOS QuickBooks SDK Connector

Read-only local extractor for **QuickBooks Desktop** using the official **QBXML Request Processor** via late-bound COM (`QBXMLRP2.RequestProcessor`).

This tool **only issues query requests**. It does not create, edit, delete, or modify any QuickBooks records, and it does not write to Supabase.

## Target deployment path (Windows Server VM)

```
C:\eliteOS\quickbooks-sdk-connector
```

Clone or sync this folder to that path on the VM where QuickBooks Enterprise and the Desktop SDK are installed.

## Prerequisites

1. **Windows Server** with QuickBooks Enterprise running (or able to open the company file).
2. **QuickBooks Desktop SDK** installed (same machine as QuickBooks).
3. **.NET Framework 4.8 Developer Pack** — [download](https://dotnet.microsoft.com/download/dotnet-framework/net48).
4. SDKTestPlus3 (or equivalent) already connects successfully to the live company file.

## Build

```powershell
cd C:\eliteOS\quickbooks-sdk-connector
dotnet build EliteOS.QuickBooksSdkConnector.csproj -c Release
```

Build on the Windows VM with Visual Studio Build Tools or the .NET Framework 4.8 SDK. No compile-time COM reference is required; the connector creates the Request Processor at runtime from ProgID `QBXMLRP2.RequestProcessor`.

## Run

```powershell
cd C:\eliteOS\quickbooks-sdk-connector
.\run-extract.ps1
```

Or:

```powershell
$env:QB_COMPANY_FILE = "C:\Path\To\Elite Stone Fabrications.QBW"   # optional
$env:QBXML_VERSION = "13.0"                                           # match your SDK / SDKTestPlus3
dotnet run --project EliteOS.QuickBooksSdkConnector.csproj -c Release
```

If `QB_COMPANY_FILE` is unset, QuickBooks uses the **currently open** company file (QuickBooks should be running and logged in).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QB_CONNECTOR_ROOT` | (auto-detect) | Project root; defaults to folder containing `.csproj` |
| `QB_COMPANY_FILE` | *(empty)* | Full path to `.QBW` file; empty = currently open company |
| `QB_APP_NAME` | `EliteOS QuickBooks SDK Connector` | Application name passed to `OpenConnection2` |
| `QB_APP_ID` | `{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}` | Application ID GUID |
| `QBXML_VERSION` | `13.0` | QBXML version header (match SDKTestPlus3) |
| `QB_MAX_RETURNED` | `100` | Iterator page size |
| `QB_EXPORTS_ROOT` | `{root}\exports` | Export base directory |
| `QB_LOGS_ROOT` | `{root}\logs` | Log directory |
| `QB_DEBUG_ROOT` | `{root}\debug` | Debug output root (failed outbound QBXML requests) |
| `QB_ENTITIES` | *(empty = all)* | Comma-separated entity filter, e.g. `accounts,classes,sales-reps,terms,estimates` |
| `QB_ESTIMATE_CHUNK_START_YEAR` | `2000` | Earliest year for estimate monthly fallback chunks |

### Selective entity run (fix/debug without full extract)

```powershell
$env:QB_ENTITIES = "accounts,classes,sales-reps,terms,estimates"
.\run-extract.ps1
```

## Failed-request diagnostics

When an entity query fails (XML parse error, non-zero `statusCode`, or `ProcessRequest` exception), the connector writes the **exact outbound QBXML request** to:

```
debug/failed-requests/{entity}-{label}-{timestamp}.xml
```

Only failed entities are captured — successful customer/invoice payloads are not written to debug.

## Output layout

Each run creates a timestamped folder under `exports/`:

```
exports/YYYY-MM-DD-HHMMSS/
  company.xml
  company.json
  customers/
    batch-001.xml
    batch-001.json
    ...
  invoices/
  invoice-lines/
  items/
  payments/
  vendors/
  bills/
  purchase-orders/
  accounts/
  classes/
  sales-reps/
  terms/
  estimates/
  sales-orders/
  manifest.json
```

- **Raw QBXML** — `*.xml` batch files per entity.
- **Normalized JSON** — `*.json` with nested dictionaries converted from QBXML `*Ret` elements.
- **Invoice line items** — also written under `invoice-lines/` when present in invoice responses.
- **manifest.json** — run metadata: `runId`, `startedAt`, `completedAt`, per-entity `batchCount`, `recordCount`, and `errors`.

Logs are written to `logs/{runId}.log`.

## Entities extracted

| Entity | QBXML request | Strategy |
|--------|---------------|----------|
| Company | `CompanyQueryRq` | Single request |
| Customers & jobs | `CustomerQueryRq` | Iterator (`MaxReturned=100`) |
| Invoices (+ lines) | `InvoiceQueryRq` + `IncludeLineItems` | Iterator |
| Items | `ItemQueryRq` | Iterator |
| Receive payments | `ReceivePaymentQueryRq` | Iterator |
| Vendors | `VendorQueryRq` | Iterator |
| Bills | `BillQueryRq` | Iterator |
| Purchase orders | `PurchaseOrderQueryRq` | Iterator |
| Accounts | `AccountQueryRq` + `ActiveStatus` | Simple list (no iterator) |
| Classes | `ClassQueryRq` + `ActiveStatus` | Simple list (no iterator) |
| Sales reps | `SalesRepQueryRq` | Simple list (no iterator) |
| Terms | `StandardTermsQueryRq` + `DateDrivenTermsQueryRq` | Two simple queries under `terms/` |
| Estimates | `EstimateQueryRq` | Iterator, then fallback without line items, then monthly date chunks |
| Sales orders (+ lines) | `SalesOrderQueryRq` + `IncludeLineItems` | Iterator |

Large iterator queries use `iterator="Start"` then `iterator="Continue"` with the returned `iteratorID` until `iteratorRemainingCount` is `0`.

**Estimates fallback order:** (1) `IncludeLineItems=true`, (2) `IncludeLineItems=false`, (3) monthly `TxnDateRangeFilter` chunks from `QB_ESTIMATE_CHUNK_START_YEAR` through the current month.

## Security notes

- Exports may contain **PII and financial data**. Do not commit `exports/` or `logs/` to git.
- Run only on the trusted Windows VM with SDK access.
- No Supabase or network upload is performed by this tool.

## Verifying batch JSON output (post-serializer fix)

After building and before running a full QuickBooks extract, confirm the JSON
serializer writes real record bodies, not C# anonymous-object `.ToString()` strings.

### Quick build-time verification (no QB connection required)

```powershell
cd C:\eliteOS\quickbooks-sdk-connector
.\verify-batch-json.ps1
```

This script compiles and runs a self-contained test with fake data, asserting:
- Top-level value is a JSON **object** (not a string).
- `records` is a JSON **array**.
- Output does **not** contain `System.Collections.Generic`.
- Output does **not** contain `System.Object`.

All checks must pass before running a full extract.

### Post-run structural spot-check

After a real extract completes, inspect one batch file from any entity:

```powershell
# Replace the timestamp with the actual run folder name
$batchFile = "C:\eliteOS\quickbooks-sdk-connector\exports\YYYY-MM-DD-HHMMSS\customers\batch-001.json"
$content = Get-Content $batchFile -Raw | ConvertFrom-Json

# Must be an object with a records array, not a string
Write-Host "Top type:  $($content.GetType().Name)"        # Should: PSCustomObject
Write-Host "entityType: $($content.entityType)"           # Should: customers
Write-Host "recordCount: $($content.recordCount)"         # Should: 100 (or MaxReturned)
Write-Host "records length: $($content.records.Count)"    # Must match recordCount
Write-Host "First record type: $($content.records[0].GetType().Name)" # Should: PSCustomObject

# Confirm no .NET type names leaked into the file
if (Get-Content $batchFile -Raw | Select-String "System.Collections.Generic") {
    Write-Host "FAIL: serializer bug still present — re-build and verify"
} else {
    Write-Host "PASS: no .NET type names found"
}
```

The `backend-core` Phase 1 preview tool also confirms readiness — once the serializer
is fixed and the extract is re-run, the preview output should show:
- `selfReportedOnlyFileCount=0` for every entity
- No "not ingest-ready" warnings

Until both gates pass, the export is **not suitable for Phase 2 staging**.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success, no entity errors |
| `2` | Completed with one or more entity-level errors (see manifest and log) |
| `1` | Fatal error (connection/session failure) |
