# EliteOS QuickBooks SDK Connector

Read-only local extractor for **QuickBooks Desktop** using the official **QBXML Request Processor** (`QBXMLRP2Lib.RequestProcessor2`).

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

The project references the registered COM type library `QBXMLRP2Lib` (GUID `17960609-0F97-4E49-A601-F548F86BDFF4`). Build must run on Windows with the SDK installed.

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

| Entity | QBXML request | Iterator |
|--------|---------------|----------|
| Company | `CompanyQueryRq` | No |
| Customers & jobs | `CustomerQueryRq` | Yes |
| Invoices (+ lines) | `InvoiceQueryRq` + `IncludeLineItems` | Yes |
| Items | `ItemQueryRq` | Yes |
| Receive payments | `ReceivePaymentQueryRq` | Yes |
| Vendors | `VendorQueryRq` | Yes |
| Bills | `BillQueryRq` | Yes |
| Purchase orders | `PurchaseOrderQueryRq` | Yes |
| Accounts | `AccountQueryRq` | Yes |
| Classes | `ClassQueryRq` | Yes |
| Sales reps | `SalesRepQueryRq` | Yes |
| Terms | `TermsQueryRq` | Yes |
| Estimates (+ lines) | `EstimateQueryRq` + `IncludeLineItems` | Yes |
| Sales orders (+ lines) | `SalesOrderQueryRq` + `IncludeLineItems` | Yes |

Large queries use `iterator="Start"` then `iterator="Continue"` with the returned `iteratorID` until `iteratorRemainingCount` is `0`.

## Security notes

- Exports may contain **PII and financial data**. Do not commit `exports/` or `logs/` to git.
- Run only on the trusted Windows VM with SDK access.
- No Supabase or network upload is performed by this tool.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success, no entity errors |
| `2` | Completed with one or more entity-level errors (see manifest and log) |
| `1` | Fatal error (connection/session failure) |
