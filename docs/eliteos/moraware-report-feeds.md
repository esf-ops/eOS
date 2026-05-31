# Moraware Report Feeds (additive ingestion lane)

**Product context:** Moraware records the work. eliteOS explains the work. Report feeds are an **additional ingestion lane beside the existing Moraware API sync** — not a replacement.

## Why report feeds exist

The Moraware API/SDK sync captures structured operational data into Brain raw + normalized tables. Saved Moraware reports expose two complementary assets:

1. **Spreadsheet CSV exports** — business-friendly report columns (worksheet sqft, color, room, salesperson, etc.).
2. **Rendered HTML report pages** — stable identity links:
   - `/sys/job/<id>`
   - `/sys/account/<id>`

Combining CSV rows + HTML-derived IDs gives faster, trustable prepared facts for Sales Worksheet and future operational heads without relying on a fragile one-off scrape script.

## Current validated status (2026-05-30)

| Milestone | Status |
|-----------|--------|
| SQL schema | **Applied manually** in Supabase (`eliteos_moraware_report_feeds.sql`); partial unique index `uq_moraware_prepared_sales_worksheet_facts_one_active` in place |
| Parse/enrich POC | Local-file dry-run + unit tests; sanitized fixtures only |
| Staging persistence | **Smoke validated** via `persistReportFeedLocal.js` with `SUPABASE_WRITE_ENABLED=1` (runs, column profiles, raw rows, identity links) |
| Prepared-fact promotion | **Smoke validated on test org only** (`00000000-0000-0000-0000-000000000001`); requires `MORAWARE_REPORT_FEED_PROMOTE=1` + validated run |
| Live Moraware download | **Not built** — no governed fetch, no browser scrape, no cookies/SID in repo |
| Dashboard reads | **Not wired** — prepared facts exist for test org only |
| Real Elite org prepared facts | **Intentionally not promoted** — staging run validated; promotion deferred |

### Key run IDs (Supabase)

| Org | `organization_id` | Feed id | Run id | Notes |
|-----|-------------------|---------|--------|-------|
| Real Elite | `89180433-9fab-4024-bec9-a14d870bd0a8` | `e8c0433a-c243-4cc5-b8bb-7842ec64a0e7` | `afc7b49d-af7a-4fec-85a0-0fdb11046ea3` | `validated`, 3 rows, 3 matched; **no** prepared facts written |
| Test org | `00000000-0000-0000-0000-000000000001` | `a053cb9a-e362-4c5a-8f47-895314cec85a` | `a660473b-b200-4d14-ba0b-5b713c475c9c` | Promotion smoke 1: 3 inserted, 0 superseded |
| Test org | (same) | (same) | `6d54c835-058f-47f8-a831-db8efca86a5b` | Promotion smoke 2: 3 inserted, 3 superseded + `superseded_by` backfill |

**Phase A (2026-05-30):** Governed download **design contract** documented below — **no fetch implementation yet**.

**Next safe slice:** inspect existing integration config patterns → verify Moraware login mechanics manually → implement `fetchReportFeedArtifacts` as network-only module if server-side login is feasible.

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
| Expected column hash | `71d40fbb6a946c015c5dad7b74ca11b1287e0c939eaa53a12cf674b518d0114d` |
| Prior hash (simplified columns) | `4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8` — retired 2026-05-30 |

**Column mapping decision (Option B — real Moraware export shape):** eliteOS accepts the real Moraware export as-is and normalizes it into clean prepared facts. Moraware view 219 is **not** forced to match simplified legacy column names.

**Branch/location decision (v1):** Branch is not present in the real view 219 export and is **not** a required contract column. `branch_or_process` is always `null` in v1 promoted facts. Future: derive location/ownership through Account Mapping / Identity Enrichment.

**Export granularity:** view 219 is **worksheet-line level** — one CSV row per worksheet section (countertop, backsplash, etc.), multiple rows per job. Prepared facts are one row per CSV row. Row hashes include worksheet-line discriminators so two lines for the same job produce distinct hashes.

### Real Moraware column contract (16 columns, no Branch)

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
| Total Job Worksheet - Sq.Ft. by Job Creation Date | `total_worksheet_sqft` (numeric) | |
| Branch/location | `branch_or_process` = **null** | Not in export; deferred to Account Mapping |
| HTML identity | `account_id`, `job_id` | Nullable when unmatched |

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
5. Seed the Sales Worksheet Facts feed using the commented `INSERT` at the bottom of the SQL file — **replace** `organization_id` with your real tenant UUID. The validated `expected_column_hash` is already set in the seed comment: `4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8` (validated run `afc7b49d`, 2026-05-30).
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

1. Parse CSV rows for business columns.
2. Parse HTML report rows and extract:
   - `job_id`, `job_name` from `/sys/job/<id>`
   - `account_id`, `account_name` from `/sys/account/<id>`
3. Build an identity map keyed by normalized `Account Name + Job Name`.
4. Enrich CSV rows:
   - **matched** — exactly one HTML identity for the key
   - **needs_identity_review** — no HTML match (row still stored as raw)
   - **ambiguous_identity** — duplicate HTML keys or duplicate row hash (never silently guessed)

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
