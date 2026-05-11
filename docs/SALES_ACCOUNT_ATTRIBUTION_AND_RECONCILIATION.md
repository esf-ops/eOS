# Sales Account Attribution + Sq.Ft. Reconciliation (Foundation)

## Problem statement
Sales Head currently shows useful production Sq.Ft. totals, but **sales attribution is not trustworthy** without a formal, auditable mapping layer between:

- **Moraware report exports** (production/job worksheet Sq.Ft. source of truth)
- **Monday.com account master list** (account ownership / assigned salesperson source of truth)

The main issue is **account naming mismatch**: high-volume Moraware `Account Name` values frequently do not match Monday `Name` values exactly.

## Broader pattern: eOS Identity Resolution

Sales attribution is the **first implementation** of the broader **eOS Brain Identity Resolution** pattern: preserve raw source evidence, generate match suggestions, require human approval for uncertain links, and keep audit history so mappings can change without rewriting upstream systems. See `docs/EOS_BRAIN_IDENTITY_RESOLUTION_ARCHITECTURE.md` and the additive schema proposal `backend-core/supabase/eos_identity_resolution.sql`.

## Key business rules
- **Active real sales reps (only):**
  - Casey Schenke
  - Thera McEnany
  - Michael Joseph
- **Moraware “Job Salesperson” is not the final attribution.**
- **Moraware remains source of truth** for production/job/worksheet **Sq.Ft.**
- **Monday account master** is the source of truth for **account ownership** where possible.
- eOS requires a **crosswalk/mapping** layer between Moraware and Monday.
- Account ownership must be **editable later without code changes** (Supabase tables).

## Source files (local)
These scripts default to reading:
- Moraware report CSV: `/Users/chris.henely/Downloads/Report (2).csv`
- Monday master XLSX: `/Users/chris.henely/Downloads/Account_Master_List_1778500823.xlsx`

Override with:
- `SALES_MORAWARE_REPORT_CSV`
- `SALES_MONDAY_ACCOUNT_MASTER_XLSX`

## Outputs (debug)
All scripts write to:
`debug/sales/latest/`

## Approach
### 1) Input inspection
Script: `backend-core/src/scripts/analyzeSalesAccountAttributionInputs.js`

Outputs:
- `sales-attribution-input-summary.json`
- `sales-attribution-input-summary.txt`

Includes:
- Column detection (Moraware + Monday)
- Row counts
- Moraware date bounds and total Sq.Ft.
- Top salesperson value distributions

### 2) Conservative name normalization + similarity
Module: `backend-core/src/sales/salesAccountNameNormalizer.js`

Key functions:
- `normalizeAccountName(name)`
- `normalizeAccountNameWithoutLocationPrefix(name)` (e.g. strips `Dyersville- `)
- `buildAccountTokens(name)`
- `scoreAccountNameSimilarity(a,b)` (ranking only; **never auto-approve fuzzy**)

### 3) Proposed account crosswalk suggestions
Script: `backend-core/src/scripts/buildSalesAccountCrosswalkSuggestions.js`

Outputs:
- `sales-account-crosswalk-suggestions.json`
- `sales-account-crosswalk-suggestions.txt`
- `sales-account-crosswalk-suggestions.csv`

Match types:
- `exact`: exact normalized match
- `prefix_stripped_exact`: match after stripping a location prefix
- `normalized_exact`: normalized match but ambiguous (duplicates)
- `alias_rule`: manual seed rule applied (unapproved by default)
- `fuzzy_suggested`: ranked suggestion (unapproved)
- `no_match`

Approval workflow:
- Only **unambiguous exact-ish matches** can be auto-approved (still review recommended).
- Manual seed rules and fuzzy suggestions are **unapproved** until explicitly approved.

### 4) Sq.Ft. reconciliation: Moraware report vs Brain
Script: `backend-core/src/scripts/reconcileSalesSqftReportToBrain.js`

Outputs:
- `sales-sqft-reconciliation.json`
- `sales-sqft-reconciliation.txt`
- `sales-sqft-reconciliation.csv`

Behavior:
- Uses Moraware report date window (Job Creation Date).
- Queries Brain (`brain_jobs.creation_date`) for the same date window.
- Sums `brain_jobs.worksheet_sqft` (no Sq.Ft. math changes).
- Produces deltas by normalized account key (location prefix stripped).

This answers:
> Is Brain Sq.Ft. wrong, or is it using a different definition/date/grouping than the Moraware report?

### 5) Supabase persistence (additive only)
SQL proposal (not auto-run):
`backend-core/supabase/sales_account_attribution.sql`

Tables:
- `sales_reps`
- `sales_branches`
- `sales_account_master`
- `sales_account_aliases`
- `sales_account_assignments`
- `sales_account_assignment_history`
- `sales_moraware_report_audit`
- `sales_account_attribution_audit`

Precedence order (must be enforced by code + future admin tooling):
1. Approved aliases/assignments in Supabase
2. Confidently-linked Monday/master records
3. Manual seed rules (suggestion only)
4. Moraware salesperson fallback only when nothing else applies
5. Unknown/unmapped

Never let a seed rule override an approved mapping.

### 6) Import script (dry-run first)
Script: `backend-core/src/scripts/importSalesAttributionData.js`

Default: dry-run.

Write mode requires:
- `SALES_ATTRIBUTION_IMPORT_WRITE=1`
- Supabase env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Tables created manually via `sales_account_attribution.sql`

Write-mode warnings:
- Never overwrite approved mappings unless explicitly enabled via
  `SALES_ATTRIBUTION_OVERWRITE_APPROVED=1`

## Mapping-ready Sales Head behavior
Sales backend now supports:
- Loading **approved mappings** from Supabase (when tables exist)
- Falling back gracefully when they do not exist
- Debug payload includes mapping source and basic coverage hints

## Sales Account Mapping Admin v1 (System Admin)
Admins can review and persist mappings at:

- Backend routes: `/api/admin/sales-account-mapping/*`
- UI: **System Admin → Sales Account Mapping**

### Schema health behavior
If the attribution schema is not installed, the UI shows:
- “Sales attribution schema is not installed yet.”
- Missing tables list
- Path: `backend-core/supabase/sales_account_attribution.sql`

The app must **not crash** when tables are missing; it will keep operating in read-only/suggestions mode.

### Review/approval workflow
The mapping admin reads:
- Latest suggestions from `debug/sales/latest/sales-account-crosswalk-suggestions.json`
- Existing alias decisions from Supabase (when installed)

Actions:
- **Approve mapping**: writes an approved alias row; may create/update an approved `current_owner` assignment when a master id exists.
- **Reject**: records a deliberate “rejected” decision (does not delete anything).
- **Mark unmapped**: records an “intentional_unmapped” decision so the account stops appearing as unresolved noise.
- **Assign house/direct**: records an approved alias with a non-rep owner (House Account / Direct / Unmapped).

Safety:
- Fuzzy suggestions are **never auto-approved**; approval requires explicit click.
- Changing an existing approved mapping requires **notes/reason**.

## Commands
Run locally:

```bash
npm run eos:analyze:sales-inputs
npm run eos:sales:crosswalk-suggestions
npm run eos:sales:reconcile-sqft
npm run eos:sales:attribution-dry-run
```

## Next steps (after foundation)
- Build System Admin UI to review/approve alias suggestions and assignments.
- Add tooling to convert Monday “Sales Executive” values into approved assignments for the 3 active reps only.
- Expand reconciliation to job-level matching when stable identifiers are available.

