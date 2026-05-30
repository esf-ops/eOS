# Moraware Report Feeds (additive ingestion lane)

**Product context:** Moraware records the work. eliteOS explains the work. Report feeds are an **additional ingestion lane beside the existing Moraware API sync** — not a replacement.

## Why report feeds exist

The Moraware API/SDK sync captures structured operational data into Brain raw + normalized tables. Saved Moraware reports expose two complementary assets:

1. **Spreadsheet CSV exports** — business-friendly report columns (worksheet sqft, color, room, salesperson, etc.).
2. **Rendered HTML report pages** — stable identity links:
   - `/sys/job/<id>`
   - `/sys/account/<id>`

Combining CSV rows + HTML-derived IDs gives faster, trustable prepared facts for Sales Worksheet and future operational heads without relying on a fragile one-off scrape script.

## Current feed: Sales Worksheet Facts (view 219)

| Field | Value |
|-------|--------|
| Name | eliteOS - Sales Worksheet Facts |
| Moraware view | `219` |
| Report type | `sales_worksheet_facts` |
| CSV export path | `/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report` |
| HTML report path | `/sys/report/?view=219` |
| Validated header hash | `4e657f1f731e9fb054e0b9d8d4d6b1f586e612875d139ee33e4a083a5a6cfdb8` (run `afc7b49d`, 2026-05-30) |

Expected business columns (integration contract):

- Account Name
- Job Name
- Job Status
- Job Creation Date
- Job Salesperson
- Total Job Worksheet Sq.Ft.
- Color
- Stone
- Room
- Branch

## Architecture (Brain tables)

Draft SQL (not auto-applied): [`backend-core/supabase/eliteos_moraware_report_feeds.sql`](../../backend-core/supabase/eliteos_moraware_report_feeds.sql)

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

## Future live-download automation (not in this POC)

Before enabling automation:

- Server-side credential vault + org-scoped Moraware Admin mappings
- Raw file storage policy
- Supabase apply of `eliteos_moraware_report_feeds.sql`
- Promotion job with supersede semantics
- Dashboard reads gated on `is_active` prepared facts
- Security review for any HTML fetch path

See also: [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) entry *Moraware Report Feeds as additive prepared-facts ingestion lane*.
