# Account Directory QuickBooks Customer Enrichment — Windows worker (Phases 0–2)
#
# READ-ONLY ODBC → Brain ingest. Completely separate from Sales Financial Truth.
# DSN: slabOS_QuickBooks_Local_RO only. No QuickBooks writes. Thryve untouched.
#
# QB Server eOS working copy (scripts live here — do NOT require a second clone at C:\eliteOS):
#   C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync
#
# Non-repo runtime data:
#   config: C:\eliteOS\config\ad-qb-customer-sync.env
#   logs:   C:\eliteOS\logs\account-directory-qb-customer-sync\
#
# Do NOT register Task Scheduler or run production ingest from this doc alone —
# follow ops approval + FEATURE_DECISIONS §311.
#
# Manual apply SQL first (Brain/Supabase):
#   backend-core/supabase/eliteos_account_directory_qb_customer_enrichment_v1.sql
#
# ---------------------------------------------------------------------------
# Persistent configuration (recommended)
# ---------------------------------------------------------------------------
# Path (outside git):
#   C:\eliteOS\config\ad-qb-customer-sync.env
#
# Start from (in this folder):
#   ad-qb-customer-sync.env.example
#
# Required keys (QB_AD_CUSTOMER_* only — never QB_SALES_*):
#   QB_AD_CUSTOMER_DSN=slabOS_QuickBooks_Local_RO
#   QB_AD_CUSTOMER_EXPECTED_COMPANY=Elite Stone Fabrications
#   QB_AD_CUSTOMER_ORGANIZATION_ID=<uuid>
#   QB_AD_CUSTOMER_SYNC_INGEST_URL=https://<brain>/api/internal/account-directory/quickbooks-customer-sync
#   QB_AD_CUSTOMER_SYNC_INGEST_TOKEN=<secret>   # NOT QB_SALES_SYNC_INGEST_TOKEN; never commit
#
# Optional:
#   QB_AD_CUSTOMER_SYNC_CHUNK_SIZE=400
#   QB_AD_CUSTOMER_SYNC_LOG_DIR=C:\eliteOS\logs\account-directory-qb-customer-sync
#   QB_AD_CUSTOMER_SYNC_LOCK_DIR=C:\eliteOS\logs\account-directory-qb-customer-sync
#
# ---------------------------------------------------------------------------
# Logs (separate from Sales)
# ---------------------------------------------------------------------------
#   C:\eliteOS\logs\account-directory-qb-customer-sync\ad-qb-customer-sync-YYYYMMDD-HHMMSS.log
# Retention: wrapper deletes logs older than ~30 days on each run.
# Logs include PASS/FAIL and worker stdout (counts when present). Tokens are never logged.
#
# ---------------------------------------------------------------------------
# Live DSN column verification (read-only; before first ingest)
# ---------------------------------------------------------------------------
#   cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DiagnoseColumns
#
# Equivalent SQL:
#   SELECT ColumnName, DataType, Length, IsNullable
#   FROM sys_tablecolumns
#   WHERE TableName = 'Customers'
#   ORDER BY ColumnName
#
# Expected Customers columns:
#   Id, Name, FullName, ParentId, Sublevel, IsActive, BillingCity, BillingState
# Job detection: ParentId and/or Sublevel > 0 (not the Job column).
# Canonical prepared identity: ListID (Id).
#
# ---------------------------------------------------------------------------
# Manual verification — production wrapper (required before Task Scheduler)
# ---------------------------------------------------------------------------
# Wrapper/worker resolve via $PSScriptRoot (this folder). Config/logs stay under C:\eliteOS\...
#
#   cd C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync
#
# Dry-run via wrapper (loads config, lock, logs; no ingest):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-ad-qb-customer-sync.ps1 -ConfigPath C:\eliteOS\config\ad-qb-customer-sync.env -DryRun
#
# Live ingest via wrapper (exact manual test command):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\run-ad-qb-customer-sync.ps1 -ConfigPath C:\eliteOS\config\ad-qb-customer-sync.env
#
# Direct worker (dev / DiagnoseColumns):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1
#
# Non-overlap: wrapper refuses a second run while lock pid is alive
#   (C:\eliteOS\logs\account-directory-qb-customer-sync\ad-qb-customer-sync.lock).
#
# ---------------------------------------------------------------------------
# Task Scheduler (do NOT register automatically)
# ---------------------------------------------------------------------------
# Task name : slabOS Account Directory QB Customer Sync
# Cadence   : once nightly (default 02:15 local) — proposed only until ops -Apply
# Action    : run-ad-qb-customer-sync.ps1 from this working copy (not Sales worker)
#
# Read-only collision preflight (reports whether the task name exists + nearby tasks/times):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Preflight
#
# Preview (also runs preflight; does not register):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1
#
# Explicit register (only after successful manual wrapper PASS):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Apply
#
# Unattended principal (secure prompt — never pass Windows password on the command line):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-ad-qb-customer-sync-task.ps1 -Apply -RunAsUser DOMAIN\qb-sync-user
# Or set "Run whether user is logged on or not" in Task Scheduler UI after an interactive register.
#
# Equivalent schtasks sketch (ops reference; prefer the installer script; no password on CLI):
#   schtasks /Create /TN "slabOS Account Directory QB Customer Sync" /SC DAILY /ST 02:15 /RL HIGHEST /F ^
#     /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Administrator\Documents\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync\run-ad-qb-customer-sync.ps1 -ConfigPath C:\eliteOS\config\ad-qb-customer-sync.env"
