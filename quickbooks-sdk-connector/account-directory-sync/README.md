# Account Directory QuickBooks Customer Enrichment — Windows worker (Phases 0–2)
#
# READ-ONLY ODBC → Brain ingest. Separate env/token from Sales Financial Truth.
#
# Do NOT register Task Scheduler or run production import from this doc alone —
# follow ops approval + FEATURE_DECISIONS §311.
#
# Manual apply SQL first:
#   backend-core/supabase/eliteos_account_directory_qb_customer_enrichment_v1.sql
#
# Env (Windows):
#   QB_AD_CUSTOMER_DSN=slabOS_QuickBooks_Local_RO
#   QB_AD_CUSTOMER_EXPECTED_COMPANY=Elite Stone Fabrications
#   QB_AD_CUSTOMER_ORGANIZATION_ID=<uuid>
#   QB_AD_CUSTOMER_SYNC_INGEST_URL=https://<brain>/api/internal/account-directory/quickbooks-customer-sync
#   QB_AD_CUSTOMER_SYNC_INGEST_TOKEN=<secret>   # NOT QB_SALES_SYNC_INGEST_TOKEN
#
# Live DSN column verification (read-only; run before first ingest):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DiagnoseColumns
#
# Equivalent SQL (same DSN / company file):
#   SELECT ColumnName, DataType, Length, IsNullable
#   FROM sys_tablecolumns
#   WHERE TableName = 'Customers'
#   ORDER BY ColumnName
#
# Expected Customers columns for this worker:
#   Id, Name, FullName, ParentId, Sublevel, IsActive, BillingCity, BillingState
# Job detection uses ParentId and/or Sublevel > 0 (not the Job column).
# Canonical prepared identity: ListID (Id).
#
# Dry-run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1 -DryRun
#
# Live ingest (after SQL + token configured + DiagnoseColumns PASS):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-ad-qb-customers.ps1
#
# Optional scheduled task installer is intentionally NOT included in v1 —
# register only after a successful manual dry-run + live pass.
