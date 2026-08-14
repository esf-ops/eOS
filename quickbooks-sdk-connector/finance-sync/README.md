# eliteOS QuickBooks Full Finance Foundation (Phase 1)

READ-ONLY ODBC → Brain ingest. Isolated domains. **No QuickBooks writes. No 2025 historical backfill in this phase.**

```
QuickBooks Desktop
  -> CData ODBC DSN slabOS_QuickBooks_Local_RO (SELECT-only)
  -> sync-finance.ps1 -Domain {master|revenue_ar|ap|cash|accounting}
  -> POST /api/internal/finance/quickbooks-sync
  -> qb_finance_* prepared facts
```

Sales Financial Truth (`sync-sales-financials.ps1`) is unchanged and remains the Sales Dashboard / AD Financials lane.

## Single-flight CData lock

Concurrent ODBC readers have failed in production. Finance acquires:

`C:\eliteOS\logs\qb-odbc\qb-cdata-odbc.lock`

and refuses to start if Sales (`sales-qb-sync.lock`) or AD customer (`ad-qb-customer-sync.lock`) holds a live PID.

Sales wrapper also acquires the shared `qb-cdata-odbc.lock`.

## Config

```
C:\eliteOS\config\finance-qb-sync.env
```

Start from `finance-qb-sync.env.example`. Token must **not** equal Sales or AD ingest tokens.

Brain: `QB_FINANCE_SYNC_INGEST_TOKEN` (never in the browser).

## First small live verification (after SQL + Brain deploy)

From the QB Server eOS working copy — **one domain at a time**, never overlapping Sales:

```powershell
cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\finance-sync

powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain master -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain ap -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain cash -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain revenue_ar -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain accounting -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain accounting -CaptureOpening -DryRun
```

Then a **small live ingest** (default 14-day lookback), still not historical:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain master
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain ap
```

Re-run the same domain to prove idempotent upserts. Interrupted month: checkpoints skip `success` windows; use `-ForceCheckpoint` only to redo.

Opening capture (as-of **2024-12-31** Accrual Balance Sheet):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-finance-qb-sync.ps1 -Domain accounting -CaptureOpening
```

Do **not** pass `-HistoricalBackfill`. Worker refuses it unless `QB_FINANCE_ALLOW_HISTORICAL_BACKFILL=1` (not for Phase 1).

## Accounting rules (v1)

- Canonical basis: **Accrual**
- P&L / Balance Sheet: store QuickBooks `ProfitAndLossStandard` / `BalanceSheetStandard` as reconciliation snapshots — do not manufacture official statements from invoices/bills
- `BalanceSheetStandard` does **not** accept `ReturnRows`
- `Transactions` is an activity index, not a double-entry ledger
- Never sum ReceivePayment and its Deposit as two cash inflows (`ItemTxnType=ReceivePayment`, `ItemRefId` = payment TxnID)

## SQL (manual)

`backend-core/supabase/eliteos_qb_finance_foundation_v1.sql`

Do not auto-apply from app boot.
