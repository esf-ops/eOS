# eliteOS ↔ QuickBooks catalog foundation (Phase 0)

**Status:** Implemented in-repo; SQL **not auto-applied**.  
**Non-goals:** No EstimateAdd, no Web Connector, no ODBC write, no pricing cutover.

## Rules

1. **QuickBooks item identity ≠ eliteOS pricing authority.**  
   Mapping stores `qb_list_id` + independent `pricing_source` (`eliteos_pricing_admin` | `quickbooks_item_price` | `custom_quote_price` | `none`).
2. **Internal Estimate** remains the job/estimating engine.
3. **Pricing Admin** (or live calculator until Admin is wired) remains quote pricing authority unless a mapping explicitly sets `quickbooks_item_price`.
4. **Automatic QuickBooks writeback remains disabled** (`qb_write_enabled: false` on handoff; queue executor throws).

## Item mirror

Canonical READ mirror: `brain_quickbooks_items` (ListID + EditSequence + item_type + is_active + `raw_payload`).  
SDK ItemQuery export retains FullName, SalesAndPurchase.SalesPrice/SalesDesc, Income/Expense accounts, tax codes inside `raw_payload`.

## Mapping + queue SQL

`backend-core/supabase/eliteos_quote_qb_item_mapping_and_write_queue_v1.sql` — manual apply only.

## Code

- `backend-core/src/quotes/quoteQbCatalog/*` — seeds, safety gates, queue preview stubs  
- `quoteLibraryHandoffPayloads.js` — doc_version 2 enrichment (ListID metadata; no write)

## Phase 1 dry-run (EstimateAdd not transmitted)

See FEATURE_DECISIONS §378.

Operator (Windows QB VM, TEST company only):

```powershell
cd C:\eliteOS\...\quickbooks-sdk-connector\estimate-write
powershell -NoProfile -ExecutionPolicy Bypass -File .\dry-run-estimate-write.ps1
```

Requires `QB_WRITE_DRY_RUN=true`. Prints EstimateAdd qbXML and **DRY RUN — NOTHING SENT TO QUICKBOOKS**.
