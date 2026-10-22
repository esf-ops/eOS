# Estimating Command Center — architecture audit, source map and design (DRAFT FOR REVIEW)

**Superseded framing:** the command center is now one view of the connected workspace — see `CONNECTED_WORKSPACE_DESIGN.md` (identities, ownership, v1 scope, validation gate). This document remains the source map and metric reference.
**Status:** Proposal + local prototype only. No schema, no Brain routes, no deploy, no head registration, QuickBooks writes untouched.
**Prototype:** `app-estimating-command-center/` (fixture data, clearly labeled). `npm run dev` with `VITE_ECC_FIXTURE_PREVIEW=1` → http://localhost:5199.
**Audit date:** 2026-10-05. Production evidence = read-only aggregate SELECTs (counts, max timestamps, run statuses) against Supabase project `wbxbzhxsdlkpqsviyzkt`. No customer rows were read into this document.

## 1. Operating model

1. Estimates originate in **QuickBooks Desktop** (estimate transactions on a Customer:Job).
2. Estimating staff manage revisions and follow-up until the job is **sold** (sales order created from the estimate).
3. **Tanya** receives the sold-job handoff and **initiates the job in Moraware**.

The command center observes this flow. It does not become a CRM, does not own customer identity, and does not write to QuickBooks or Moraware.

## 2. Source map (evidence-backed)

### 2.1 Observed freshness (production, 2026-10-05 ~16:48 UTC)

| Feed | Writer | Table(s) | Rows | Last success | State |
|---|---|---|---|---|---|
| QB ODBC sales (estimates, SOs, invoices) | `quickbooks-sdk-connector/sales-sync/sync-sales-financials.ps1` (CData ODBC, Windows task, every 2h) | `sales_quickbooks_sync_runs`, `sales_quickbooks_financial_transactions` | 134 runs; 2,351 estimates / 1,863 SOs / 1,866 invoices (since 2026-06-12) | **2026-09-10 05:12** | **Stopped ~25 days.** Last runs all `success`; no failure rows → the task stopped running, it did not fail. |
| QB AD customer sync | `account-directory-sync/` (ODBC, nightly 02:15) | `ad_qb_customer_sync_runs`, `ad_qb_customer_facts` | 18 runs; 71,011 customer/job facts | **2026-09-09 07:17** | **Stopped ~26 days** |
| QB finance | `finance-sync/sync-finance.ps1` (ODBC) | `qb_finance_sync_runs`, `qb_finance_*` | 198 runs | **2026-09-10 01:40** | **Stopped ~25 days** |
| QB direct SDK snapshot | C# `quickbooks-sdk-connector` (QBXMLRP2) + `importQuickBooksStaging.mjs` | `qb_sync_runs`, `brain_quickbooks_*` | 88,702 estimates, 31,127 SOs, 45,900 invoices, 287 reps, 45 classes, 469 items | **2026-07-10** (run `20260710-130918-512b1dca`; last import attempt row is `failed`) | **One-time snapshot**; no recurring upload exists |
| Moraware incremental | **Mac mini** LaunchAgent `com.eliteos.moraware-incremental` (hourly; `/Users/chrishenely/eOS-worker`, FEATURE_DECISIONS §344) | `moraware_sync_runs`, `brain_moraware_jobs` (4,123), cursor in `organization_integration_configs.moraware_incremental_cursor` | 17,369 runs | **2026-09-02 18:03 UTC** (cursor `last_attempt_at` same; no failures since) | **Stopped ~33 days. Rechecked 2026-10-05 17:08 UTC after the Mac mini came back: still no new run, attempt or record update.** |
| Moraware new-job discovery | same incremental (creation window) | `brain_moraware_jobs.created_at_source` | newest = 2026-08-17 | — | **Broken before the outage:** 332 runs Aug 18–Sep 2 found 0 creation-window candidates |
| Moraware nightly + View 219 | **Mac mini** LaunchAgent `com.eliteos.moraware-nightly` (01:30 CT) | `moraware_report_runs`, `moraware_prepared_sales_worksheet_facts` (29,838) | 26 runs | 2026-08-28 (`promoted`) | No promoted run after the agent was installed 2026-08-28 |
| Monday mirror | Sales Ops Monday sync | `sales_ops_accounts` (853) | — | 2026-10-05 16:51 | Fresh |
| Account Directory identity | manual / controlled seed | `account_directory_accounts` (654), `account_directory_external_links` (QB 399 / Moraware 228 / Monday 18) | — | 2026-09-01 | Config-like, not a feed |
| Color catalog | slabOS config | `slab_color_catalog_items` (100), `slab_color_aliases` (12) | — | 2026-06-05 | Static |

**Conclusion:** no live reporting is trustworthy today. Every QuickBooks and Moraware feed stopped in early September without logging a failure. QuickBooks points at the Windows QuickBooks host's scheduled tasks. Moraware points at the **Mac mini** restart: its jobs are LaunchAgents that only load after a user logs in, so a rebooted Mac mini sitting at the login window runs nothing (runbook → "Mac mini production host"). Silent stoppage is now covered by the Brain stale-feed check (`backend-core/src/integrationHealth/`, hourly Vercel Cron) — pending deploy and an alert recipient.

### 2.2 Tables, IDs and ownership

| Concept | Authority | Table / key | Notes |
|---|---|---|---|
| Customer identity | **Account Directory** | `account_directory_accounts.id` (UUID) | Identity only — **no transaction, estimate, job or status data** (confirmed: Account 360 reads other tables at request time). No owner/branch columns (FEATURE_DECISIONS §161). |
| QB customer ↔ AD | Account Directory | `account_directory_external_links` (`external_system='quickbooks_desktop'`, `external_id` = **root** customer ListID) | 399 links. Child job ListIDs are facts only (`ad_qb_customer_facts.parent_list_id`, `is_job`). |
| QB customer/job facts | QuickBooks | `ad_qb_customer_facts (organization_id, qb_list_id)` | ~86% of QB customer rows are jobs (Customer:Job). |
| Estimates (fresh, thin) | QuickBooks | `sales_quickbooks_financial_transactions (organization_id, transaction_type, source_id=TxnID)` | Only Id, RefNumber, date, customer, total, `qb_customer_list_id`, `qb_root_customer_list_id`. **No sales rep, class, lines, links, EditSequence.** |
| Estimates (rich, frozen) | QuickBooks | `brain_quickbooks_estimates (organization_id, qb_txn_id)` + `raw_payload`; `intel_sales_rep_list_id`, `intel_is_linked` (v3/v4 applied; 88,702 backfilled) | 62% have SalesRepRef (55,054). ClassRef ("ESF - {Branch}") only in `raw_payload`. RefNumber deliberately not a column (privacy rule, staging SQL L36–42). No estimate-line table. |
| Sales orders | QuickBooks | same two tables, `transaction_type='sales_order'` / `brain_quickbooks_sales_orders` | Estimate→SO link: **LinkedTxn never extracted**; ~95% of SOs carry memo `Estimate {RefNumber}:` (ELITE_STONE_SALES_FINANCIAL_TRUTH §3.2). |
| Sales reps | QuickBooks | `brain_quickbooks_sales_reps (qb_list_id)` | **No mapping to slabOS users** (`slabosMapping.js` "NEEDS_BUSINESS_DECISION"). |
| Branch | none canonical | QB `ClassRef` (45 classes, unmapped) · `organization_branches` (1 row, unused) · `sales_branches` (0 rows, no org id) · free-text `branch` on `sales_ops_accounts`, `quote_headers` | Sales-order writer already stops on `branch_class_unresolved`. |
| Account owner | **Monday** | `sales_ops_accounts.assigned_user_id` via `account_directory_external_links (monday)` | `sales_ops_monday_rep_mappings` (6 rows) maps Monday people → users by exact email. |
| Material / color | slabOS | `slab_color_catalog_items`, `slab_color_aliases`; Elite 100 fixture JSON | **No QB item/line → color crosswalk.** QB color lives in free-text line `Desc`. |
| Moraware job | **Moraware** | `brain_moraware_jobs (source_job_id, source_account_id)`, `salesperson_name`, `status_name` | Read-only. Links to AD only via `account_directory_external_links (moraware)`. **No link to QB estimate/SO.** 10 rows still carry the placeholder zero-UUID organization. |
| Estimate follow-up | none | — | `account_directory_follow_ups` is account-level (no estimate/opportunity reference). |
| Estimator | none | — | QuickBooks has no estimator field in the mirror; may live in a custom field / `Other` — unverified. |

## 3. Relationship model

```
Customer            account_directory_accounts.id  ←(external_links: quickbooks_desktop root ListID)
  └─ Opportunity    QB Customer:Job ListID (ad_qb_customer_facts.is_job) — fallback: root ListID + first estimate TxnID
       └─ Estimate revisions   QB estimate TxnIDs on that job (EditSequence = in-place edits)
            └─ Sold            QB sales order (LinkedTxn when extracted; memo "Estimate {Ref}" fallback, flagged)
                 └─ Handoff    sold → Tanya (received / in progress / initiated)
                      └─ Moraware job   brain_moraware_jobs.source_job_id, captured by Tanya at initiation
```

- **Opportunity = QuickBooks job.** Re-quotes are new estimate TxnIDs on the same job, or edits to the same TxnID (EditSequence bump). The current mirrors overwrite in place, so **in-place edit history is not retained** unless the incremental reader stores snapshots per EditSequence.
- **Sold** is the sales-order event, never `IsActive` (QB has no accepted flag; docs: "Do not interpret IsActive as accepted").
- **Moraware link** must be explicit: Tanya records the Moraware job ID when she initiates it. Until then the head shows *candidate* Moraware jobs (same AD account, near date) but never auto-links (no fuzzy identity per production authority rules).

### Role separation (never collapsed into one "rep" field)

| Role | Source | Grain | Unknown handling |
|---|---|---|---|
| **Account owner** | Monday `sales_ops_accounts.assigned_user_id` | Customer | "No owner" when account unlinked to Monday |
| **Sales rep** | QB `SalesRepRef` on the estimate | Estimate revision (current revision wins) | "No sales rep" bucket (38% of historic estimates); unmapped initials shown as initials |
| **Estimator** | TBD (QB custom field / template, or slabOS assignment) | Estimate revision | "Unknown" until a source is chosen |
| **Branch** | QB `ClassRef` on the estimate → org-scoped class→branch map | Estimate revision | "Unknown branch" + raw class name |

## 4. Head sections (prototype)

1. **Source freshness strip** — every feed with authority, cadence, last success and state (fresh / stale / snapshot / static / unknown). Metrics inherit the worst state of their dependencies.
2. **Attention queue** — actionable items (follow-up due, no follow-up record, sold without handoff, handoff without Moraware job, revision churn) separated from data-quality gaps (missing rep, unlinked customer, unmapped class).
3. **Quote & sales metrics** — period-scoped, each with definition tooltip, state pill and click-through drill-down into the job table.
4. **Job table** — one row per opportunity; filters for branch, sales rep (incl. "No sales rep"), stage, color, search; drill-down chip.
5. **Color report** — per color jobs / sold jobs / known sq ft, with multi-color, unknown and unmatched-text totals.
6. **Tanya's handoff queue** — sold jobs ordered: not sent → with Tanya → in progress → in Moraware; shows sales-order link method.

Reuse: shared `EliteosTopbar`, `shared/eliteos-ui/tokens.css` + `primitives.css`, `shared/eliteos-supabase` session, `/api/me` bootstrap (copied from `app-finance`), localhost-in-production guard from `app-sales`.

## 5. Metric definitions

All metrics: `null` = unknown (rendered "Unknown" with reason), never 0. States: `ok`, `partial` (some records lack the value and are excluded), `stale` (a dependency feed is past its window), `unknown`.

| Metric | Definition | Revisions | Multi-color |
|---|---|---|---|
| Opportunities quoted | Distinct opportunities whose **first** active revision is dated in the period | Counted once | Counted once |
| Estimate revisions | Active estimate TxnIDs dated in the period | Each counts | n/a |
| Quoted value | Σ **current** revision total of opportunities first quoted in period | Superseded revisions excluded | Once |
| Jobs sold | Opportunities whose sold event is dated in period | n/a | Once |
| Sold value | Σ sales-order total, once per opportunity | Sold revision only | Once |
| Close rate (cohort) | Sold-to-date ÷ opportunities first quoted in period; `null` when denominator is 0 | Once | Once |
| Open pipeline | Σ current revision total of open (not sold, not lost) opportunities, any period | Current only | Once |
| Median days to close | First revision date → sold date, jobs sold in period | From first revision | Once |
| Sold, not yet in Moraware | Sold opportunities without a confirmed Moraware job ID | n/a | Once |
| Color report jobs | Opportunities quoted or sold in period containing the color, from the **sold** revision if sold else current | Scope revision only | **Counted under each color** — per-color jobs may sum to more than total jobs; sq ft summed only where the line provides it |

Unknowns surfaced explicitly: no line detail → color *unknown*; line text with no catalog match → *unmatched color text*; missing SalesRepRef → *No sales rep*; unmapped Class → *Unknown branch*; missing total → excluded and metric marked `partial`.

Why "estimates sent" ≠ "quotes": counting estimate rows inflates quote counts by every re-quote and inflates pipeline by superseded revisions. The prototype tests pin this (`eccModel.test.mjs`).

## 6. Prerequisite: restore reliable QuickBooks reads (direct SDK)

**Verified approach:** direct Desktop SDK COM (`QBXMLRP2.RequestProcessor`, qbXML 13.0) via the C# connector — documented as the validated path (`docs/quickbooks/ELITE_STONE_QUICKBOOKS_LIVE_READ.md` L108). CData Gateway is not production-validated (L125–127). ODBC workers stay in place; nothing is replaced.

### 6.1 Immediate (operations, no code)
- Determine why the Windows tasks (`eliteOS QuickBooks Sales Sync`, AD customer sync, finance) stopped after 2026-09-10. All last runs were `success`; there are no failure rows. Needs host access (not available to this agent).
- Moraware (Mac mini): run the checks in the runbook's "Mac mini production host" section; convert the jobs to LaunchDaemons (approved; `deploy/moraware-worker/convert-macos-agents-to-daemons.sh`, run on the Mac mini) and pass a no-login reboot test; fix new-job discovery.
- Stale-feed alert: implemented as `GET /api/internal/integration-feeds/stale-check` (cron-secret gated, hourly). Not yet deployed.

### 6.2 ID-parsing issue (audited, reproduced, not changed)
- `backend-core/src/quickbooks/live/quickBooksLiveQbxml.js` L224–236: `XMLParser` without `parseTagValue: false`. Reproduced locally: `8000021E-1635950935` → `0`, `12E4` → `120000`, `00123` → `123`. Recorded in FEATURE_DECISIONS #392 as follow-up.
- Fixed pattern already exists: `elite100EstimateStudio/qbSalesOrder/studioSalesOrderQbxml.mjs` L10–18 (`parseTagValue: false`) with regression test `studioSalesOrderQueue.test.mjs` L475.
- Safe paths: C# normalizer emits strings; staging `parseQbId` / `parseOpaqueId` are string-only and reject numbers; ODBC workers cast `[string]$r.Id`.
- **Proposed fix (on approval):** set `parseTagValue: false` (and keep `#text` handling) in the live parser; add the same three regression cases. Risk: callers that relied on numeric amounts must parse explicitly — audit `extractTxnLinkSummary` / `extractListSummary` amounts.

### 6.3 Direct-SDK incremental reader (design, not built)
Current C# extractor is snapshot-only: no `ModifiedDateRangeFilter`, never sends `IncludeLinkedTxns`, estimate lines can silently fall back to `IncludeLineItems=false` (`EstimateQueryHandler.cs` L42–56).
1. Add an incremental mode: `EstimateQueryRq` / `SalesOrderQueryRq` with `ModifiedDateRangeFilter` (watermark − overlap), `IncludeLineItems=true`, `IncludeLinkedTxns=true`, iterator paging; record when lines were omitted.
2. Upload through a protected Brain ingest endpoint (planned "Phase 3D") with an org-bound worker token (pattern: `QB_SALES_ORDER_AGENT_TOKEN` bound to org) — not a service-role key on the VM.
3. Upsert `brain_quickbooks_estimates` / `_sales_orders` on `(organization_id, qb_txn_id)`; keep `qb_sync_runs` per run; take the shared CData/QB single-flight lock so it never overlaps ODBC readers.
4. Reconcile daily against the ODBC lane (counts and totals by day); both remain until parity is proven.

### 6.4 Migration requirements (none applied)
| Need | Reason | Type |
|---|---|---|
| Estimate/SO line table (or retained line JSON + extracted `color_text`, `qb_item_list_id`, sqft) | Color reporting, multi-color | Additive |
| `intel_class_list_id` on estimates/SOs | Branch | Additive generated column |
| Estimate revision history keyed `(org, qb_txn_id, qb_edit_sequence)` | In-place edit history | Additive |
| Org-scoped mappings: QB Class → branch, QB SalesRep → user | Role separation | Additive config (or `organization_integration_configs`) |
| Handoff record `(org, opportunity key, sales order TxnID, state, received/initiated at, moraware_job_id, actor)` + audit events | Tanya queue, explicit Moraware link | Additive |
| Opportunity-level follow-up (extend `account_directory_follow_ups` with optional QB job/estimate reference, or new table) | Follow-up tracking without a CRM | Additive |
| Decision on RefNumber column | Staff need estimate numbers; staging privacy rule excludes it | Decision first |

Stale migration headers to reconcile before any apply: `eliteos_quickbooks_staging_v1.sql` says "DO NOT APPLY" but is live; `eliteos_studio_qb_sales_order_jobs_v1.sql` says "NOT APPLIED" but the table exists in production (0 rows); `quote_qb_item_mappings` documented "prepared, not applied" but exists (9 rows).

## 7. Gaps and decisions needed

1. **All QB and Moraware feeds stopped** (§2.1) — blocks live data.
2. **Estimator source** — no field identified.
3. **Sales rep → user mapping** and **Class → branch mapping** — business decisions.
4. **Estimate→SO link** — memo parsing works for ~95%; LinkedTxn needs the incremental SDK reader.
5. **Moraware ↔ sold job** — no existing link; capture at Tanya's initiation.
6. **Follow-up storage** — only account-level follow-ups exist.
7. **QB color data** is free text; needs alias matching into `slab_color_aliases` (`source_system='quickbooks'`) with an "unmatched" bucket.
8. **Lost/expired** — QB has no lost state; needs a staff action or age-based expiry rule.
9. **Security findings found during audit (not fixed):** `/api/sales/*` and QBI accept `?organization_id=` without checking it against the caller's org; 10 Moraware job rows carry the zero-UUID org; QBI topbar passes non-existent props.
10. **SYSTEM_BLUEPRINT** cites the new-head checklist as §15; it is §16.

## 8. Smallest implementation (after review)

1. **Ops:** restart/diagnose stopped workers; add stale-feed alerting.
2. **Brain read endpoint** `GET /api/estimating-command-center/overview` — `requireAuth` + `requireHeadAccess("estimating_command_center")`, organization from the caller only (Finance pattern, no query override), explicit DTO built from existing tables (`sales_quickbooks_financial_transactions` + `ad_qb_customer_facts` + AD links + `brain_quickbooks_*` enrichment + `brain_moraware_jobs` + `sales_ops_accounts`), reusing `eccModel.mjs` logic server-side, with per-source freshness (Finance `freshness.mjs` pattern). Bounded, SQL-side period filters.
3. **Head registration** per SYSTEM_BLUEPRINT §16 (slug, launcher, `HEAD_URL_*`, CORS, build script, head map, FEATURE_DECISIONS entry).
4. **Direct-SDK incremental reader** (§6.3) + ID-parser fix (§6.2).
5. **Additive schema** (§6.4) for handoff, mappings, lines — only after design sign-off.

No new CRM: identity stays in Account Directory, ownership in Monday, transactions in QuickBooks, production in Moraware.
