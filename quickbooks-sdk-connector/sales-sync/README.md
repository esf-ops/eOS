# eliteOS QuickBooks Sales ODBC Sync Worker
#
# READ-ONLY ODBC -> Brain ingest. Completely separate from Account Directory customer sync.
# DSN: slabOS_QuickBooks_Local_RO only. No QuickBooks writes. Thryve untouched.
#
# QB Server eOS working copy (scripts live here - do NOT require a second clone at C:\eliteOS):
#   C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\sales-sync
#
# Non-repo runtime data:
#   config: C:\eliteOS\config\sales-qb-sync.env
#   logs:   C:\eliteOS\logs\sales-qb-sync\
#
# Do NOT register Task Scheduler or run production ingest from this doc alone —
# follow ops approval + FEATURE_DECISIONS §309.

## Architecture

```
QuickBooks Desktop
  -> CData ODBC DSN slabOS_QuickBooks_Local_RO
  -> sync-sales-financials.ps1 (read-only SELECT; unchanged calculation/query behavior)
  -> HTTPS POST /api/internal/sales/quickbooks-sync
  -> Supabase prepared facts
  -> Sales QuickBooks Financial Truth Beta
```

| Item | Value |
|------|--------|
| DSN | `slabOS_QuickBooks_Local_RO` (64-bit **System** DSN) |
| ConnectDirectly | `True` |
| Readonly | `True` |
| Backend | Never connects to QuickBooks |
| Thryve / Remote Connector | Separate; **untouched** |
| AD customer sync | Separate scripts/token (`QB_AD_CUSTOMER_*`) |

## Persistent configuration

Path (outside git):

```
C:\eliteOS\config\sales-qb-sync.env
```

Start from `sales-qb-sync.env.example` in this folder.

| Variable | Required | Notes |
|----------|----------|-------|
| `QB_SALES_DSN` | no | default `slabOS_QuickBooks_Local_RO` |
| `QB_SALES_EXPECTED_COMPANY` | no | default `Elite Stone Fabrications` |
| `QB_SALES_ORGANIZATION_ID` | yes | org UUID |
| `QB_SALES_SYNC_INGEST_URL` | yes* | ingest URL (* unless `-DryRun`) |
| `QB_SALES_SYNC_INGEST_TOKEN` | yes* | bearer token — **never** `QB_AD_CUSTOMER_SYNC_INGEST_TOKEN`; never commit |
| `QB_SALES_SYNC_LOOKBACK_DAYS` | no | default **60** (incremental; wrapper does not change this) |
| `QB_SALES_SYNC_START_DATE` | for `-Backfill` only | `YYYY-MM-DD` |
| `QB_SALES_SYNC_CHUNK_SIZE` | no | default `400` (max 500) |

## Backend env vars

| Variable | Notes |
|----------|-------|
| `QB_FINANCIAL_TRUTH_ENABLED=1` | feature flag (default off) |
| `QB_SALES_SYNC_INGEST_TOKEN` | same secret the worker sends |
| `QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS` | optional; default 14400 (4h) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Brain only — **not** on QB Server |

## Logs

```
C:\eliteOS\logs\sales-qb-sync\sales-qb-sync-YYYYMMDD-HHMMSS.log
```

Retention: wrapper deletes logs older than ~30 days on each run. Tokens are never logged.

## Manual verification — production wrapper (required before Task Scheduler)

```powershell
cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\sales-sync

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-qb-sync.ps1 -ConfigPath C:\eliteOS\config\sales-qb-sync.env -DryRun

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-qb-sync.ps1 -ConfigPath C:\eliteOS\config\sales-qb-sync.env
```

Default wrapper mode is **incremental** (worker 60-day lookback). Explicit backfill only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-sales-qb-sync.ps1 -ConfigPath C:\eliteOS\config\sales-qb-sync.env -Backfill
```

Direct worker (dev):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-sales-financials.ps1
```

Non-overlap lock: `C:\eliteOS\logs\sales-qb-sync\sales-qb-sync.lock`

## Task Scheduler (do NOT register automatically)

| Item | Value |
|------|--------|
| Task name | `eliteOS QuickBooks Sales Sync` |
| Cadence | every **2 hours** (not 15 minutes) |
| Action | `run-sales-qb-sync.ps1` (incremental; not `-Backfill`) |
| Overlap | `MultipleInstances IgnoreNew` + wrapper lock |

Read-only collision preflight (reports Sales task + nearby QB/AD tasks including AD nightly):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1 -Preflight
```

Preview (also runs preflight; does not register):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1
```

Explicit register (only after successful manual wrapper PASS):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1 -Apply
```

Unattended principal (secure prompt — never pass Windows password on the command line):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-sales-qb-sync-task.ps1 -Apply -RunAsUser DOMAIN\qb-sync-user
```

Or set "Run whether user is logged on or not" in Task Scheduler UI after an interactive register.

## Definitions (unchanged)

- **Quoted $** — sum of estimate amounts in selected dashboard date range
- **Sales Orders $** — sum of sales order amounts in range (**not** renamed Booked/Sold)
- **Invoiced $** — sum of invoice `Amount` in range
- **Collected $** — sum of receive payment `Amount` in range
- **Open A/R** — sum of current unpaid invoice `Balance` as of latest refresh (not historical as-of end date)

No raw QuickBooks payloads or credentials in the browser.
