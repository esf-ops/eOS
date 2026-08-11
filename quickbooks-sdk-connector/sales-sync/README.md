# eliteOS QuickBooks Sales ODBC Sync Worker

**Supported slabOS QuickBooks transport:** direct local **CData ODBC** on the QuickBooks Windows Server.

| Item | Value |
|------|--------|
| DSN | `slabOS_QuickBooks_Local_RO` (64-bit **System** DSN) |
| ConnectDirectly | `True` |
| Readonly | `True` |
| QBXMLVersion | `16.0` |
| Application Name | `slabOS QuickBooks Read` |
| QuickBooks mode | Multi-User (do not force Single-User) |
| Backend | Never connects to QuickBooks |
| Thryve / Remote Connector | Separate; **untouched** |
| Raw QBXML-over-HTTP | **Not used** |

## Architecture

```
QuickBooks Desktop
  -> CData ODBC DSN slabOS_QuickBooks_Local_RO
  -> sync-sales-financials.ps1 (read-only SELECT)
  -> HTTPS POST /api/internal/sales/quickbooks-sync
  -> Supabase prepared facts
  -> Sales QuickBooks Financial Truth Beta
```

## Windows env vars

| Variable | Required | Notes |
|----------|----------|-------|
| `QB_SALES_DSN` | no | default `slabOS_QuickBooks_Local_RO` |
| `QB_SALES_EXPECTED_COMPANY` | no | default `Elite Stone Fabrications` (exact match gate) |
| `QB_SALES_ORGANIZATION_ID` | yes | org UUID |
| `QB_SALES_SYNC_INGEST_URL` | yes* | full URL to ingest endpoint (* unless `-DryRun`) |
| `QB_SALES_SYNC_INGEST_TOKEN` | yes* | bearer token (* unless `-DryRun`) — never commit |
| `QB_SALES_SYNC_START_DATE` | for `-Backfill` | `YYYY-MM-DD` |
| `QB_SALES_SYNC_LOOKBACK_DAYS` | no | default `60` |
| `QB_SALES_SYNC_CHUNK_SIZE` | no | default `400` (max 500) |

## Backend env vars

| Variable | Notes |
|----------|-------|
| `QB_FINANCIAL_TRUTH_ENABLED=1` | feature flag (default off) |
| `QB_SALES_SYNC_INGEST_TOKEN` | same secret the worker sends |
| `QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS` | optional; default 14400 (4h) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Brain only — **not** on QB Server |

## Manual commands (QB Server)

Dry run (ODBC + company gate + queries; no upload):

```powershell
cd C:\eliteOS\quickbooks-sdk-connector\sales-sync
$env:QB_SALES_ORGANIZATION_ID = "<org-uuid>"
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1 -DryRun
```

First incremental upload:

```powershell
$env:QB_SALES_DSN = "slabOS_QuickBooks_Local_RO"
$env:QB_SALES_EXPECTED_COMPANY = "Elite Stone Fabrications"
$env:QB_SALES_ORGANIZATION_ID = "<org-uuid>"
$env:QB_SALES_SYNC_INGEST_URL = "https://<backend>/api/internal/sales/quickbooks-sync"
$env:QB_SALES_SYNC_INGEST_TOKEN = "<secret>"
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1
```

First backfill (month windows from start date):

```powershell
$env:QB_SALES_SYNC_START_DATE = "2024-01-01"
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1 -Backfill
```

## Task Scheduler

Preview only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1
```

Explicit register (production-test unattended QuickBooks access first):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1 -Apply
```

## Definitions

- **Quoted $** — sum of estimate amounts in selected dashboard date range
- **Sales Orders $** — sum of sales order amounts in range (**not** renamed Booked/Sold)
- **Invoiced $** — sum of invoice `Amount` in range
- **Collected $** — sum of receive payment `Amount` in range
- **Open A/R** — sum of current unpaid invoice `Balance` as of latest refresh (not historical as-of end date)

No raw QuickBooks payloads or credentials in the browser.
