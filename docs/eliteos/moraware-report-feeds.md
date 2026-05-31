# Moraware Report Feeds (additive ingestion lane)

**Product context:** Moraware records the work. eliteOS explains the work. Report feeds are an **additional ingestion lane beside the existing Moraware API sync** — not a replacement.

## Why report feeds exist

The Moraware API/SDK sync captures structured operational data into Brain raw + normalized tables. Saved Moraware reports expose two complementary assets:

1. **Spreadsheet CSV exports** — business-friendly report columns (worksheet sqft, color, room, salesperson, etc.).
2. **Rendered HTML report pages** — stable identity links:
   - `/sys/job/<id>`
   - `/sys/account/<id>`

Combining CSV rows + HTML-derived IDs gives faster, trustable prepared facts for Sales Worksheet and future operational heads without relying on a fragile one-off scrape script.

## Current validated status (2026-05-31)

| Milestone | Status |
|-----------|--------|
| SQL schema | **Applied manually** in Supabase (`eliteos_moraware_report_feeds.sql`); partial unique index `uq_moraware_prepared_sales_worksheet_facts_one_active` in place |
| Parse/enrich POC | Local-file dry-run + unit tests; sanitized fixtures only |
| Staging persistence | **Smoke validated** via `persistReportFeedLocal.js` with `SUPABASE_WRITE_ENABLED=1` (runs, column profiles, raw rows, identity links) |
| API mirror identity enrichment | **Validated** — run `8f5e74d1`: 6,957 matched / 29 ambiguous / 0 unmatched |
| Matched-only promotion (persisted run) | **Validated** — run `8f5e74d1`: 6,957 prepared facts active; 29 ambiguous excluded |
| View 220 contract (Sales Worksheet History Facts) | **Contract built** — 34-column contract, hash `ca05eadcaeea…`, fixture, parser tests; Supabase feed INSERT ready to run manually (see [View 220 section](#view-220-sales-worksheet-history-facts)) |
| Live Moraware download | **Not built** — no governed fetch, no browser scrape, no cookies/SID in repo |
| Dashboard reads | **Not wired** — prepared facts exist in Supabase but no UI reads them yet |

### Key run IDs (Supabase)

| Org | `organization_id` | Feed id | Run id | Notes |
|-----|-------------------|---------|--------|-------|
| Real Elite | `89180433-9fab-4024-bec9-a14d870bd0a8` | `e8c0433a-c243-4cc5-b8bb-7842ec64a0e7` | `afc7b49d-af7a-4fec-85a0-0fdb11046ea3` | `validated`, 3 rows, 3 matched; **no** prepared facts written |
| Real Elite | (same) | (same) | `cb765461-f181-4ca8-a22d-b44e0bec0766` | `failed` — schema drift (16-col hash vs 76-col real); duplicate identity-link key. Prompted 76-col hardening. HTML snapshot: 22 job links / 4 account links vs 6,986 CSV rows — HTML pagination confirmed. |
| Real Elite | (same) | (same) | `8f5e74d1-482f-4f38-b694-548b1bc239a1` | `needs_review` (29 ambiguous rows remain unresolved) — **6,957 matched-only prepared facts promoted 2026-05-31**. See [v1 validation results](#v1-validation-results-run-8f5e74d1) below. |
| Test org | `00000000-0000-0000-0000-000000000001` | `a053cb9a-e362-4c5a-8f47-895314cec85a` | `a660473b-b200-4d14-ba0b-5b713c475c9c` | Promotion smoke 1: 3 inserted, 0 superseded |
| Test org | (same) | (same) | `6d54c835-058f-47f8-a831-db8efca86a5b` | Promotion smoke 2: 3 inserted, 3 superseded + `superseded_by` backfill |

**Phase A (2026-05-30):** Governed download **design contract** documented below — **no fetch implementation yet**.

**Next safe slice:** inspect existing integration config patterns → verify Moraware login mechanics manually → implement `fetchReportFeedArtifacts` as network-only module if server-side login is feasible.

### v1 validation results (run `8f5e74d1`)

**Date promoted:** 2026-05-31  
**Mode:** matched-only (`--apply --matched-only`)  
**Run status:** `needs_review` (29 ambiguous rows remain excluded)

| Metric | Value |
|--------|-------|
| Active prepared fact rows | **6,957** |
| Distinct jobs (by `job_id`) | **2,634** |
| Total worksheet sqft | **176,516.00** |
| Identity matched | 6,957 |
| Ambiguous rows excluded | 29 |
| Unmatched rows | 0 |
| Old facts superseded | 0 (first promotion — no prior active rows) |

**Validation checks performed:**

- Job-status sqft totals reconcile to the overall `total_worksheet_sqft` aggregate of 176,516.00.
- Outlier check: no rows with `total_worksheet_sqft > 500` found (sanity cap in `parseSqft` is 99,999; no unit-error outliers detected).
- Rows with `null total_worksheet_sqft` exist and are expected (worksheet lines that do not carry a sqft value); validation queries must sort nulls last or filter them explicitly.

**Known v1 gaps:**

| Gap | Notes |
|-----|-------|
| `account_salesperson` not in prepared facts | v1 maps `job_salesperson` only; `"Account Salesperson"` is column 2 in the 76-col contract but is not currently a typed column on `moraware_prepared_sales_worksheet_facts`. Add in a future migration if per-account salesperson reporting is needed. |
| 29 ambiguous rows excluded | These rows matched more than one `brain_moraware_jobs` entry for the same normalised `account_name + job_name` key. They remain in `moraware_report_raw_rows` with `identity_status = "ambiguous_identity"` and are not in prepared facts. Resolve by running `--review-ambiguous`, investigating the duplicates in `brain_moraware_jobs`, and re-promoting once resolved. |
| Branch / location not in prepared facts | `branch_or_process` is always `null` in v1 — "Branch" column is absent from the real Moraware view 219 export. Deferred to Account Mapping head. |
| Dashboards not wired | `moraware_prepared_sales_worksheet_facts` has 6,957 active rows but nothing reads them yet. |

## Governed download design (Phase A — docs only)

This section is the implementation contract for the next slice. **Nothing here is built yet** — no fetch code, credential tables, API routes, cron, or Moraware network access.

### 1. Governed download goal

Replace the manual workflow (“save CSV to disk + save HTML to disk + run local script”) with a **backend/server-side acquisition layer** that returns the same two artifacts the existing pipeline already understands:

| Output | Type | Consumer |
|--------|------|----------|
| `csvText` | string | `parseCsvReportRows` → staging raw rows |
| `htmlText` | string | `parseReportHtmlIdentityRows` → identity links |
| `metadata` | object | run record, source provenance, fetch timestamps |

The fetch layer **must hand off** to the existing path — no parallel ingestion lane:

```
fetchReportFeedArtifacts (future)
  → processReportFeedLocal({ csvText, htmlText, … })
  → persistReportFeedRun (staging)
  → optional promoteReportFeedFacts (MORAWARE_REPORT_FEED_PROMOTE=1)
```

**Invariants:**

- **One parser, one promotion path** — do not create a second parser, second promotion path, or dashboard shortcut.
- **Same contract** — `processReportFeedLocal`, `persistReportFeedRun`, `shouldPromoteReportRun`, and `promoteReportFeedFacts` remain unchanged; the fetch module only supplies text + metadata instead of disk reads.
- **Same gates** — `SUPABASE_WRITE_ENABLED=1` for staging; `MORAWARE_REPORT_FEED_PROMOTE=1` for prepared facts; run must reach `validated` before promotion.

Planned module name: `fetchReportFeedArtifacts` (location TBD — see credential model below).

### 2. Credential model (decision placeholder)

Credentials **must** be org-scoped and backend-only. Implementation location is **to be finalized after verifying Moraware login mechanics** (human-reviewed spike).

| Requirement | Status |
|-------------|--------|
| Org-scoped (`organization_id`) | Required |
| Backend/scripts only — never frontend or client bundles | Required |
| No credentials in repo, fixtures, logs, or committed env | Required |
| No cookies, SID, or session headers committed to git | Required |
| No raw Moraware session persisted in Supabase | **Not approved** unless explicitly decided later |
| Separate report-feed credentials from existing Moraware API/SDK credentials | **Preferred** if login/session/permission behavior differs |

**Open (next slice):** Where credentials live (e.g. `organization_integration_configs` extension vs dedicated table vs secret manager reference). Do **not** create credential tables until login mechanics are verified and storage pattern is chosen.

### 3. Fetch contract — view 219 (Sales Worksheet Facts)

Two canonical paths relative to the Moraware base URL (org-specific host from integration config):

| Artifact | Path |
|----------|------|
| CSV export | `/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report` |
| HTML report | `/sys/report/?view=219` |

**Date window:** Controlled by the **saved Moraware report view** (view 219), not by the downloader. For Sales Worksheet Facts, the intended default is **Year-to-Date / current year** as configured in Moraware Admin on that saved view.

**v1 rule:** The downloader **must not** manipulate Moraware date pickers, query params for date ranges, or UI automation to change the window. If the saved view’s date range is wrong, fix it in Moraware Admin — do not scrape around it.

`metadata` should include at minimum: `morawareViewId`, `reportType`, `organizationId`, `fetchedAt`, and optional `sourceHost` (no secrets).

### 4. Session lifecycle (v1 preferred design)

| Approach | v1 stance |
|----------|-----------|
| Server-side HTTP login + cookie jar in process memory | **Preferred** if feasible without browser automation |
| Login once per run; short-lived in-memory session only | **Preferred** |
| Persist SID/cookies to git, fixtures, Supabase, or debug output | **Forbidden** |
| Headless browser (Puppeteer/Playwright) | **Out of scope for v1** — requires separate threat-model approval |
| Long-lived session reuse across cron runs | **Deferred** — v1 is manual trigger only |

Session material exists only for the duration of a single CLI/script invocation and is discarded when the process exits.

### 5. Failure behavior

All failures must produce a run in **`failed`** or **`needs_review`** status and **must not** touch active prepared facts (`moraware_prepared_sales_worksheet_facts` where `is_active = true`).

| Failure code | Typical cause | Run status | Prepared facts |
|--------------|---------------|------------|------------------|
| `auth_failed` | Bad credentials, expired session, login page returned | `failed` | Unchanged |
| `report_not_found` | 404, wrong view id, permission denied on report | `failed` | Unchanged |
| `empty_export` | CSV/HTML empty or zero data rows | `needs_review` or `failed` | Unchanged |
| `timeout` | Network or Moraware slowness exceeds limit | `failed` | Unchanged |
| `schema_drift` | Header hash ≠ feed `expected_column_hash` | `needs_review` | Unchanged |
| `identity_ambiguous` | Duplicate HTML keys or duplicate row hashes after enrich | `needs_review` | Unchanged |

Staging rows for a failed/`needs_review` run may be written (audit trail) but promotion gates (`shouldPromoteReportRun`) must block any supersede of active prepared facts.

### 6. Raw artifact storage policy (open decision)

Whether to persist downloaded CSV/HTML beyond in-memory processing is **not decided**. Document options for the next slice:

| Option | Pros | Cons |
|--------|------|------|
| **Ephemeral** — process in memory, persist only parsed staging rows | Minimal PII retention; simpler security | No re-parse without re-fetch |
| **Supabase Storage** — org-prefixed paths, TTL | Audit/replay; operator debugging | PII/customer data in object store; RLS + retention policy required |

If storage is approved later:

- Paths must be **org-prefixed** (e.g. `{organization_id}/moraware-report-feeds/{run_id}/…`).
- Define a **retention TTL** (open — e.g. 30/90 days).
- Treat stored files as **PII/customer data** — same handling rules as live Moraware exports.
- `source_files` JSON on `moraware_report_runs` should reference storage URIs **only if** storage is explicitly approved; until then, omit or use non-PII placeholders (e.g. `{ "mode": "ephemeral" }`).

### 7. Manual trigger first (v1)

v1 governed download is **manual CLI/script only** — operator-initiated, same spirit as `persistReportFeedLocal.js` today.

- No cron, cloud worker, or scheduled job until a **later explicit approval**.
- No HTTP API routes exposing fetch to browsers or external callers.
- Env gates remain: `SUPABASE_WRITE_ENABLED=1`, optional `MORAWARE_REPORT_FEED_PROMOTE=1`.

### 8. Explicitly out of scope (until separately approved)

- Live cron / cloud worker scheduling
- Dashboard reads from prepared facts
- API routes for report-feed fetch
- Browser scraping / headless automation
- Moraware date picker or UI manipulation
- Automatic Elite org promotion (real tenant)
- Changes to existing Moraware API/SDK sync
- Quote math, Internal Estimate, public/partner quote, Monday sync
- Credential tables, secret commits, or Supabase session storage
- Deployment config changes for report feeds

### 9. Next recommended implementation slice

After this documentation is committed:

1. **Inspect** existing org-scoped integration config patterns (e.g. how Moraware API credentials are stored today) — read-only reconnaissance.
2. **Verify Moraware login mechanics** manually with human review (can server-side HTTP login reach view 219 CSV + HTML without a browser?).
3. **If feasible:** implement `fetchReportFeedArtifacts` as a **network-only** module that returns `{ csvText, htmlText, metadata }` and wire a new script that calls `processReportFeedLocal` → `persistReportFeedRun` (same as local path, different input source).
4. **If not feasible:** stop and record findings; do not proceed to headless browser without separate threat-model approval.

Use **Sonnet (or stronger)** for credential/session/fetch implementation; use cheaper models for docs and small edits.

---

## Current feed: Sales Worksheet Facts (view 219)

| Field | Value |
|-------|--------|
| Name | eliteOS - Sales Worksheet Facts |
| Moraware view | `219` |
| Report type | `sales_worksheet_facts` |
| CSV export path | `/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report` |
| HTML report path | `/sys/report/?view=219` |
| Expected column hash | `8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade` |
| Prior hash (16-column real shape) | `71d40fbb6a946c015c5dad7b74ca11b1287e0c939eaa53a12cf674b518d0114d` — retired 2026-05-30 |
| Prior hash (simplified columns) | `4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8` — retired 2026-05-30 |

**Column mapping decision (Option B — real Moraware export shape):** eliteOS accepts the real Moraware export as-is and normalizes it into clean prepared facts. Moraware view 219 is **not** forced to match simplified legacy column names.

**Branch/location decision (v1):** Branch is not present in the real view 219 export and is **not** a required contract column. `branch_or_process` is always `null` in v1 promoted facts. Future: derive location/ownership through Account Mapping / Identity Enrichment.

**Export granularity:** view 219 is **worksheet-line level** — one CSV row per worksheet section (countertop, backsplash, etc.), multiple rows per job. Prepared facts are one row per CSV row. Row hashes include worksheet-line discriminators so two lines for the same job produce distinct hashes.

### Real Moraware column contract (76 columns, no Branch)

The real view 219 export has **76 normalized columns**. Columns 1–15 are core worksheet/sales fields mapped to prepared-fact columns. Columns 16–75 are activity, install, and customer-service status fields stored in `raw_row` only (v1). Column 76 is the sqft total.

**Verified from live run** `cb765461-f181-4ca8-a22d-b44e0bec0766` (2026-05-30).

#### Core mapped columns (1–15 + sqft at 76)

| Moraware column | eliteOS prepared field | Notes |
|-----------------|------------------------|-------|
| Account Name | `account_name` | Required for HTML identity match |
| Account Salesperson | `raw_row` only | Not a typed prepared-fact column in v1 |
| Job Name | `job_name` | Required for HTML identity match |
| Job Creation Date | `job_creation_date` | |
| Job Salesperson | `job_salesperson` | |
| Job Status | `job_status` | |
| Job Notes | `raw_row` only | |
| Stone | `stone` | |
| Job Worksheet - Form Name | row hash discriminator + `raw_row` | Not a separate prepared-fact column |
| Job Worksheet - Room | `room` | |
| Job Worksheet - Color | `color` | |
| Job Worksheet - Edge | `raw_row` only | |
| Job Worksheet - Thickness | `raw_row` only | |
| Job Worksheet - Back Splash Type | `raw_row` only | |
| Job Worksheet - Back Splash Height | `raw_row` only | |
| Total Job Worksheet - Sq.Ft. by Job Creation Date (col 76) | `total_worksheet_sqft` (numeric) | |
| Branch/location | `branch_or_process` = **null** | Not in export; deferred to Account Mapping |
| HTML identity | `account_id`, `job_id` | Nullable when unmatched |

#### Activity / status columns (16–75, `raw_row` only in v1)

Columns 16–75 are grouped by activity type in sets of 5 (`Status`, `Date`, `Sched Time`, `Assigned To`, `Notes`):

- Last Customer Service — Basic (16–20)
- Last Customer Service — Challenging (21–25)
- First Install — Quartz Basic (26–30)
- First Install — Quartz Challenging (31–35)
- First Install — Granite Basic (36–40)
- First Install — Granite Challenging (41–45)
- First Install — Quartzite/Marble (46–50)
- First Install — Waterfalls (51–55)
- First Install — Special Edge (56–60)
- First Install — Fireplace/Shower Walls (61–65)
- First Customer Service — Basic (66–70)
- First Customer Service — Challenging (71–75)

## Architecture (Brain tables)

SQL source (applied manually in Supabase 2026-05-30): [`backend-core/supabase/eliteos_moraware_report_feeds.sql`](../../backend-core/supabase/eliteos_moraware_report_feeds.sql)

| Table | Purpose |
|-------|---------|
| `moraware_report_feeds` | Org-scoped feed definitions + expected column contract |
| `moraware_report_runs` | One import attempt (local file today; live download later) |
| `moraware_report_column_profiles` | Header hash + non-empty profiling per run |
| `moraware_report_raw_rows` | Raw CSV rows under a run |
| `moraware_report_identity_links` | HTML-derived account/job identity map |
| `moraware_prepared_sales_worksheet_facts` | Promoted dashboard-ready facts (active/superseded) |

All tables use `organization_id` for SaaS readiness. RLS is **not** enabled in the draft SQL (service-role writes only until a dedicated security milestone).

## Manual Supabase apply (when ready)

**Do not apply until you have reviewed the SQL and replaced sentinel org IDs.**

1. Open Supabase → **SQL** → **New query**.
2. Paste the full contents of [`backend-core/supabase/eliteos_moraware_report_feeds.sql`](../../backend-core/supabase/eliteos_moraware_report_feeds.sql).
3. Run once. Re-run is safe (`IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`).
4. Verify tables exist: `moraware_report_feeds`, `moraware_report_runs`, `moraware_report_column_profiles`, `moraware_report_raw_rows`, `moraware_report_identity_links`, `moraware_prepared_sales_worksheet_facts`.
5. Seed the Sales Worksheet Facts feed using the commented `INSERT` at the bottom of the SQL file — **replace** `organization_id` with your real tenant UUID. Use `expected_column_hash = '8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade'` (76-column real shape, verified run `cb765461`, 2026-05-30).
6. Do **not** paste live Moraware CSV/HTML exports into the SQL editor.

### Apply-readiness notes (schema review)

| Area | Design |
|------|--------|
| Active prepared facts | Partial unique index on `(organization_id, report_feed_id, row_hash) WHERE is_active = true` — allows many superseded historical rows |
| Supersede chain | `is_active`, `superseded_at`, `superseded_by` (self-FK to replacement row) |
| Run deletion | Prepared facts use `ON DELETE RESTRICT` for `report_run_id` — promoted facts are not silently removed when a run row is deleted |
| Raw/staging tables | Still `ON DELETE CASCADE` from runs — safe for staging cleanup |
| Run status | Application values: `running`, `validated`, `needs_review`, `failed`, `promoted` |
| Identity status | Application values: `matched`, `needs_identity_review`, `ambiguous_identity` |
| RLS | Deferred — add org-scoped policies before authenticated dashboard reads hit these tables directly |

## Identity enrichment strategy

### Current behavior (best-effort)

1. Parse CSV rows for business columns.
2. Parse HTML report rows and extract:
   - `job_id`, `job_name` from `/sys/job/<id>`
   - `account_id`, `account_name` from `/sys/account/<id>`
3. Build an identity map keyed by normalized `Account Name + Job Name`.
4. Enrich CSV rows:
   - **matched** — exactly one HTML identity for the key
   - **needs_identity_review** — no HTML match (row still stored as raw; never fails staging)
   - **ambiguous_identity** — duplicate HTML keys that map to different IDs; `is_ambiguous=true` in identity-links table; never silently guessed

Unmatched and ambiguous rows are **always persisted as staging data**. They never block a run or fail silently. Duplicate HTML match keys are deduplicated before insert and never cause a unique-constraint violation.

### Known limitation: HTML report pagination (discovered 2026-05-30)

The saved view 219 HTML report (`/sys/report/?view=219`) is **paginated/limited by Moraware**. Both `view-219.html` and attempted `view-219-allpages.html` contained only:

- **22 unique `/sys/job/` links**
- **4 unique `/sys/account/` links**

while the real CSV export has **6,986 rows**. This means the vast majority of CSV rows will be `needs_identity_review` until a full-coverage identity source is available.

**This is expected behavior for v1.** Unmatched rows are not errors — they represent jobs and accounts that exist in Moraware but were not visible in the paginated HTML snapshot.

### Post-hoc API mirror enrichment (implemented 2026-05-31)

After initial staging, run the API mirror enrichment pass to resolve `needs_identity_review` rows using `brain_moraware_jobs` as the full-coverage identity source.

**Matching rules (v1):**
- Exact normalized `account_name + job_name` match only — using `makeIdentityMatchKey()` (strips location prefixes, lowercases, removes punctuation).
- No fuzzy matching. No account-name-only matching. No guessing.
- Only rows with `identity_status = "needs_identity_review"` are eligible — existing `matched` and `ambiguous_identity` rows are never downgraded.
- Duplicate key in `brain_moraware_jobs` with same IDs → harmless; one entry kept.
- Duplicate key with different `source_account_id`/`source_job_id` → `ambiguous_identity` for all CSV rows matching that key.
- Default mode is **dry-run** — prints plan, no writes.
- Pass `--apply` (with `SUPABASE_WRITE_ENABLED=1`) to commit changes.

**Writes on apply:**
- `moraware_report_raw_rows`: UPDATE `account_id`, `job_id`, `identity_status`, `identity_reason` for matched/ambiguous rows (batched ≤500 per query, grouped by account+job).
- `moraware_report_identity_links`: UPSERT one row per unique match key (`source=api_mirror`); HTML-enriched keys are skipped via `on conflict do nothing`.
- `moraware_report_runs`: UPDATE `matched_identity_count`, `unmatched_identity_count`, `ambiguous_identity_count`; append enrichment entry to `summary.apiMirrorEnrichments[]`.

**CLI usage:**

```bash
# Step 1 — dry-run (always run first)
MORAWARE_REPORT_RUN_ID=<run-id> \
MORAWARE_DEFAULT_ORGANIZATION_ID=<org-id> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run eos:moraware:enrich-report-run-api-mirror

# Step 2 — apply after reviewing dry-run output
MORAWARE_REPORT_RUN_ID=<run-id> \
MORAWARE_DEFAULT_ORGANIZATION_ID=<org-id> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
SUPABASE_WRITE_ENABLED=1 \
npm run eos:moraware:enrich-report-run-api-mirror -- --apply
```

**Source modules:**
- `buildApiMirrorIdentityMap.js` — pure; builds identity Map + duplicateKeys Set from brain_moraware_jobs rows.
- `planApiMirrorEnrichment.js` — pure; produces toMatch/toAmbiguous/toSkip plan from staged rows + identity map.
- `enrichRunFromApiMirror.js` — orchestrator; reads DB, builds plan, applies writes.
- `enrichReportRunFromApiMirror.js` — CLI entry point.

**Future full-coverage options (if API mirror proves insufficient):**

| Option | Mechanism |
|--------|-----------|
| True all-pages HTML | Verify if Moraware supports an all-pages HTML variant (not just CSV) |
| Account Mapping / Identity Enrichment head | Separate account-mapping layer with fuzzy/exact lookup — supports non-Moraware feeds |

Utilities live in [`backend-core/src/moraware/reportFeeds/`](../../backend-core/src/moraware/reportFeeds/).

## Local-file POC (dry-run)

This POC reads **local files only**. It does not download Moraware, scrape live Moraware, or write to Supabase.

### Example env vars

```bash
export MORAWARE_REPORT_CSV_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.csv
export MORAWARE_REPORT_HTML_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.html
export MORAWARE_REPORT_VIEW_ID=219
export MORAWARE_REPORT_TYPE=sales_worksheet_facts
export MORAWARE_DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001
npm run eos:moraware:report-feed-poc
```

### Output

Summary JSON is written to `debug/moraware/report-feeds/` (gitignored). Review run status, header hash, identity counts, and sample enriched rows there.

### Tests

```bash
npm run eos:test:moraware-report-feed
```

Fixtures are sanitized fake account/job names — no real customer data, cookies, or session headers.

## Staging persistence + promotion (local files → Supabase)

### Recommended run sequence

```
1. persistReportFeedLocal          (staging: CSV+HTML → raw rows + HTML identity links)
2. enrichReportRunFromApiMirror --dry-run   (review: how many rows API mirror can resolve)
3. enrichReportRunFromApiMirror --apply     (apply: update raw rows + insert API mirror links)
4. promoteReportRunMatchedFacts --review-ambiguous  (review: inspect ambiguous match keys)
5. promoteReportRunMatchedFacts              (dry-run: show promotion plan, no writes)
6. promoteReportRunMatchedFacts --apply --matched-only  (apply: promote only matched rows)
```

Steps 1–3 stage and identity-enrich the data.  Steps 4–6 promote it to prepared facts.

**Key decision point at step 5/6:**
- If `ambiguous_identity_count > 0`, pass `--matched-only` at apply time.  Ambiguous rows are excluded from prepared facts but remain in `moraware_report_raw_rows` for review.
- If `unmatched_identity_count > 0`, promotion is blocked.  Re-run enrichment or resolve manually before promoting.
- If `schema_drift.detected = true`, promotion is blocked.  Do not promote until the feed contract is updated.

### persistReportFeedLocal

Script: [`persistReportFeedLocal.js`](../../backend-core/src/scripts/moraware/persistReportFeedLocal.js) — `npm run eos:moraware:persist-report-feed-local`

- Reads **local** CSV + HTML only (no Moraware network).
- **Staging** writes (`moraware_report_runs`, column profiles, raw rows, identity links) require `SUPABASE_WRITE_ENABLED=1` plus service role env.
- **Promotion** to `moraware_prepared_sales_worksheet_facts` additionally requires `MORAWARE_REPORT_FEED_PROMOTE=1` and a `validated` run with no schema drift, ambiguous identities, or duplicate row hashes.
- Failed or `needs_review` runs do **not** replace latest active prepared facts.

```bash
export MORAWARE_REPORT_CSV_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.csv
export MORAWARE_REPORT_HTML_FILE=backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.html
export MORAWARE_REPORT_VIEW_ID=219
export MORAWARE_REPORT_TYPE=sales_worksheet_facts
export MORAWARE_DEFAULT_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001
export SUPABASE_WRITE_ENABLED=1
# Optional: MORAWARE_REPORT_FEED_PROMOTE=1
npm run eos:moraware:persist-report-feed-local
```

Tests:

```bash
npm run eos:test:moraware-report-feed
npm run eos:test:moraware-report-feed-persistence
npm run eos:test:moraware-report-feed-promotion
npm run eos:test:moraware-report-feed-promote-persistence
```

### promoteReportRunMatchedFacts (persisted-run promotion)

Script: [`promoteReportRunMatchedFacts.js`](../../backend-core/src/scripts/moraware/promoteReportRunMatchedFacts.js) — `npm run eos:moraware:promote-report-run-matched-facts`

Promotes `moraware_report_raw_rows` (already staged + enriched) to `moraware_prepared_sales_worksheet_facts`.  This is the post-enrichment promotion path that reads from the DB rather than from an in-memory `processResult`.

**Gate checks (hard blocks):**
| Condition | Result |
|-----------|--------|
| `schema_drift.detected = true` | BLOCKED — schema contract must match |
| `unmatched_identity_count > 0` | BLOCKED — unmatched rows have no IDs; promoting null-ID facts would corrupt analytics |
| `ambiguous_identity_count > 0` without `--matched-only` | BLOCKED — requires explicit opt-in to exclude ambiguous rows |
| Run already `promoted` | BLOCKED — idempotency guard |

**Matched-only policy:**
- Pass `--matched-only` when `ambiguous_identity_count > 0`.
- Only `moraware_report_raw_rows` with `identity_status = "matched"` are promoted.
- Ambiguous rows are **excluded** — never promoted, never guessed, never altered by this step.
- Run status after matched-only apply: **remains `needs_review`** (ambiguous rows still require resolution).
- Run status after full clean apply (0 ambiguous): updated to `"promoted"`.

**Supersede semantics (same as local-file path):**
1. All deactivations first (`is_active = false`, `superseded_at = now`) — batched ≤500.
2. All inserts next (`is_active = true`) — batched ≤500; rollback to re-activate on failure.
3. `superseded_by` backfill — row-by-row, non-fatal.

**Run summary JSON:**  On apply, appends a `promotions[]` entry to `moraware_report_runs.summary`:
```json
{
  "promotedAt": "2026-...",
  "mode": "matched_only",
  "matchedRowCount": 6957,
  "ambiguousExcluded": 29,
  "unmatchedExcluded": 0,
  "insertCount": 6957,
  "deactivateCount": 0,
  "backfillCount": 0
}
```

**CLI usage:**

```bash
# Step 1 — review ambiguous rows (read-only)
MORAWARE_REPORT_RUN_ID=<run-id> \
MORAWARE_DEFAULT_ORGANIZATION_ID=<org-id> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run eos:moraware:promote-report-run-matched-facts -- --review-ambiguous

# Step 2 — dry-run (always run first)
MORAWARE_REPORT_RUN_ID=<run-id> \
MORAWARE_DEFAULT_ORGANIZATION_ID=<org-id> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run eos:moraware:promote-report-run-matched-facts

# Step 3 — apply matched-only (writes prepared facts)
MORAWARE_REPORT_RUN_ID=<run-id> \
MORAWARE_DEFAULT_ORGANIZATION_ID=<org-id> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
SUPABASE_WRITE_ENABLED=1 \
npm run eos:moraware:promote-report-run-matched-facts -- --apply --matched-only
```

For the real Elite run `8f5e74d1-482f-4f38-b694-548b1bc239a1`:
- 6,957 matched rows eligible; 29 ambiguous excluded.
- `--matched-only` required because `ambiguous_identity_count = 29`.
- After apply the run status will remain `needs_review` (ambiguous rows unresolved).

**Source modules:**
- `promotePersistedRunMatchedFacts.js` — orchestrator + pure helpers (`checkPersistedRunGates`, `persistedRawRowToEnrichedRow`, `reviewAmbiguousRows`).
- `promoteReportRunMatchedFacts.js` — CLI entry point.
- Reuses `mapPreparedSalesWorksheetFact`, `planPreparedFactSupersede`, `loadActivePreparedFacts` from existing promotion helpers.

**Tests:** `npm run eos:test:moraware-report-feed-promote-persisted`

---

## Production promotion pattern (future)

When live automation is enabled:

1. Download CSV + HTML (server-side, governed credentials).
2. Store raw files + create `moraware_report_run`.
3. Import raw rows under `report_run_id`.
4. Validate headers + row counts (`expected_column_hash`).
5. Parse HTML identity links.
6. Enrich raw rows with `account_id` / `job_id`.
7. Normalize to staging / prepared facts.
8. **Promote only after success** — prior prepared rows become inactive/superseded, not blindly deleted.
9. Dashboards read **latest successful prepared facts** only.
10. Failed imports keep last successful data visible.
11. Schema/header drift creates a `needs_review` or failed run — not corrupted dashboards.

## Report library plan (future feeds)

| Feed | Purpose |
|------|---------|
| Sales Worksheet Facts | Sales worksheet sqft, color, room, salesperson |
| Production Activity / Phase Facts | Shop/production phase reporting |
| Job Context / Handoff Facts | Template/install handoff context |
| Machine / Resource Schedule | Capacity and machine scheduling |
| Template / Install Calendar | Calendar-oriented operational facts |
| Purchasing / Material Readiness | Material readiness and purchasing signals |
| Issues / Customer Service | CS/issue tracking facts |

Treat each saved Moraware view as a **versioned integration contract** with its own expected columns and header hash.

## Warnings

- **Do not hardcode credentials** or store Moraware cookies/session headers in repo, fixtures, logs, or tests.
- **Do not rely on one giant report** for all heads — prefer focused feeds with explicit contracts.
- **Do not let failed report imports replace current prepared facts.**
- **Report definitions are integration contracts** — header drift must fail loudly (`needs_review`).
- **Moraware mappings must become organization-scoped** before external SaaS reuse.
- **Do not commit real Moraware exports** containing customer PII.
- **Do not commit generated debug output** unless intentionally sanitized for tests.

## View 220: Sales Worksheet History Facts

**Purpose:** Historical worksheet export (date-ranged) used for YoY / Sales Dashboard trend analytics.

**`report_type`:** `sales_worksheet_history_facts`  
**`moraware_view_id`:** `220`  
**Columns:** 34  
**Header hash:** `ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000`  
**Observed live export (2026-05-31):** 22,899 rows · 562,602.50 total sqft · 2025-01-02 through 2026-05-30

### Architecture decisions

- **Separate feed, shared prepared table.** View 220 uses `moraware_prepared_sales_worksheet_facts` — the same table as view 219 — scoped by `report_feed_id`. A second prepared table is not needed; `report_feed_id` provides full isolation. See Feature Decision 45.
- **Dashboard queries MUST filter by `report_feed_id`.** Without this filter, view 219 and view 220 rows are double-counted (same worksheet lines appear in both views with different date scopes).
- **All existing pipeline modules reused.** Parsing, staging, API mirror identity enrichment, ambiguity review, and matched-only promotion all work without modification.
- **`Job Status` absent.** View 220 does not include a Job Status column. The `job_status` field in promoted prepared facts will be `null` for view 220 rows. This is safe — the mapper uses `enrichedRow.jobStatus || null` and the enrichment layer defaults missing columns to `""`.
- **Row hash isolation.** `reportType` is a component of `computeReportRowHash`. View 219 rows (`sales_worksheet_facts`) and view 220 rows (`sales_worksheet_history_facts`) for the same worksheet line will always produce **different** row hashes, preventing collision in the partial unique index.
- **`Account Status`, sink/faucet/stove/shop/worksite columns** → `raw_row` only in v1. No new typed prepared-fact columns required; no DB migration needed.

### 34-column contract

| # | Column | Prepared-fact mapping |
|---|--------|-----------------------|
| 1 | Account Name | `account_name` |
| 2 | Account Salesperson | `raw_row` only (v1) |
| 3 | Account Status | `raw_row` only (v1) |
| 4 | Job Name | `job_name` |
| 5 | Job Creation Date | `job_creation_date` |
| 6 | Job Salesperson | `job_salesperson` |
| 7 | Job Notes | `raw_row` only (v1) |
| 8 | Stone | `stone` |
| 9 | Job Worksheet - Form Name | row hash discriminator + `raw_row` |
| 10 | Job Worksheet - Room | `room` |
| 11 | Job Worksheet - Color | `color` |
| 12–15 | Edge, Thickness, Back Splash Type/Height | `raw_row` only (v1) |
| 16–33 | Sink, Faucet, Stove, Stone Care Kit, Dry Treat, Shop Comments, Worksite Conditions | `raw_row` only (v1) |
| 34 | Total Job Worksheet - Sq.Ft. by Job Creation Date | `total_worksheet_sqft` |

Note: `job_status` is absent from view 220. Promoted prepared facts will have `job_status = null` for this feed.

### Supabase feed INSERT (run manually — replace org UUID)

```sql
insert into public.moraware_report_feeds (
  organization_id, name, moraware_view_id, report_type,
  export_path, html_path, expected_columns, expected_column_hash, cadence, notes
) values (
  '00000000-0000-0000-0000-000000000000',
  'eliteOS - Sales Worksheet History Facts',
  220,
  'sales_worksheet_history_facts',
  '/sys/report/?view=220&spreadsheet=1&exportType=AllPages&table=Report',
  '/sys/report/?view=220',
  '["Account Name","Account Salesperson","Account Status","Job Name","Job Creation Date","Job Salesperson","Job Notes","Stone","Job Worksheet - Form Name","Job Worksheet - Room","Job Worksheet - Color","Job Worksheet - Edge","Job Worksheet - Thickness","Job Worksheet - Back Splash Type","Job Worksheet - Back Splash Height","Job Worksheet - Sink Type","Job Worksheet - We have the sink","Job Worksheet - ESF Provided Sink Make & Model","Job Worksheet - Faucet Type","Job Worksheet - We have Faucet","Job Worksheet - ESF Provided Faucet Make & Model","Job Worksheet - Faucet at Jobsite","Job Worksheet - Not Provided by ESF Sink Make & Model","Job Worksheet - Not Provided by ESF Faucet Make & Model","Job Worksheet - Stove Type","Job Worksheet - Stove Ripper Needed","Job Worksheet - Stove Ripper NOT Needed","Job Worksheet - Make & Model","Job Worksheet - Stone Care Kit","Job Worksheet - Dry Treat","Job Worksheet - Shop Comments","Job Worksheet - More Shop Comments","Job Worksheet - Special Worksite Conditions","Total Job Worksheet - Sq.Ft. by Job Creation Date"]'::jsonb,
  'ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000',
  'manual',
  'Historical worksheet export (date-ranged) for YoY / trend analytics. Separate feed from view 219; dashboard queries must scope by report_feed_id. Job Status absent from this view; job_status will be null in prepared facts.'
)
on conflict (organization_id, report_type) do nothing;
```

### Run sequence (once feed row is seeded in Supabase)

```bash
# 1. Stage CSV
SUPABASE_WRITE_ENABLED=1 npm run eos:moraware:stage-report-run -- \
  --report-feed-id <view220-feed-uuid> --csv-path ./view-220.csv

# 2. Enrich identity from API mirror
SUPABASE_WRITE_ENABLED=1 npm run eos:moraware:enrich-report-run-api-mirror -- \
  --run-id <run-uuid> --organization-id <org-uuid>

# 3. Review ambiguous rows (read-only)
npm run eos:moraware:promote-report-run-matched-facts -- \
  --run-id <run-uuid> --organization-id <org-uuid> --review-ambiguous

# 4. Dry-run promotion
npm run eos:moraware:promote-report-run-matched-facts -- \
  --run-id <run-uuid> --organization-id <org-uuid>

# 5. Apply matched-only promotion
SUPABASE_WRITE_ENABLED=1 npm run eos:moraware:promote-report-run-matched-facts -- \
  --run-id <run-uuid> --organization-id <org-uuid> --apply --matched-only
```

### Source files

- **Contract:** `backend-core/src/moraware/reportFeeds/constants.js` — `SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS`, `SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH`, `SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE`
- **Fixture:** `backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-history-facts.sample.csv`
- **Tests:** `backend-core/src/moraware/reportFeeds/reportFeedParser.test.mjs` — `testView220*` functions
- **SQL seed:** `backend-core/supabase/eliteos_moraware_report_feeds.sql` — commented INSERT at end of file

---

## Relationship to existing Moraware API sync

The scheduled Moraware API / cloud worker pipeline remains the primary structured sync path. Report feeds complement it by:

- exposing report-native business columns faster than full SDK surface mapping, and
- supplying HTML-derived job/account IDs where the CSV alone lacks stable keys.

Neither lane replaces the other.

## Future live-download automation

**Phase A (2026-05-30):** Design contract documented in [Governed download design](#governed-download-design-phase-a--docs-only) above.

**Still required before cron/dashboards:**

- Credential vault implementation (after login-mechanics spike)
- Raw file storage decision (ephemeral vs Supabase Storage)
- Dashboard reads gated on `is_active` prepared facts + RLS
- Security review for any HTML fetch path
- Explicit approval for scheduled/cloud worker triggers

See also: [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) entries **37** (additive lane), **38** (SQL supersede semantics), **39** (governed download v1 contract).
