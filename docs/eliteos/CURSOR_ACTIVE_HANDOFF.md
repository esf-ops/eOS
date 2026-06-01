# Cursor active handoff (eliteOS / slabOS)

**Purpose:** Cheap context for new Cursor chats. Do not treat old chat transcripts as source of truth — use this file + `docs/eliteos/*` + `.cursor/rules/*`.

**Last updated:** 2026-05-31 (view 220 name-only promotion validated)

---

## Active workstream: Moraware report feeds

Additive ingestion lane beside existing Moraware API sync. Combines saved-report **CSV** + rendered **HTML** identity links → validated staging → optional promotion to prepared facts. **Does not replace** API sync.

### Current status

| Area | State |
|------|--------|
| Schema | Applied manually in Supabase |
| POC parse/enrich | Done (local files, fixtures, tests) |
| Staging persistence | Validated (`SUPABASE_WRITE_ENABLED=1`) |
| API mirror identity enrichment | **Built** — `enrichRunFromApiMirror` + CLI; dry-run default; exact account+job match only; no fuzzy |
| Matched-only promotion (persisted runs) | **Built** — `promotePersistedRunMatchedFacts` + CLI; dry-run default; matched rows only; ambiguous excluded |
| Promotion | Test org smoke-validated; **real Elite org `8f5e74d1` matched-only promoted 2026-05-31** — 6,957 active facts, 29 ambiguous excluded, run stays `needs_review` |
| View 220 contract (Sales Worksheet History Facts) | **Contract built** — 34-col, hash `ca05eadcaeea…`, fixture, tests; Supabase feed INSERT ready (manual) |
| Name-only promotion (view 220) | **Built** — `--allow-name-only`; view 220 only; matched + name-only rows; ambiguous excluded; run stays `needs_review` |
| View 220 row_hash collision fix | **Fixed & validated** — `buildExtraDiscriminators`; view 219 unchanged; 4 regression tests. Run `655eed33` discarded (stale); replaced by `7e532f55` |
| View 220 name-only promotion | **Promoted 2026-05-31** — run `7e532f55`, feed `02ae8a2a`; 22,875 active facts / 561,989.50 sqft; 6,985 matched + 15,890 name-only; 24 ambiguous excluded; run `needs_review` |
| Governed download design (Phase A) | **Documented** — see [`moraware-report-feeds.md` § Governed download design](./moraware-report-feeds.md#governed-download-design-phase-a--docs-only) |
| Live download / scrape / cron / API routes | **Not built** |
| Dashboards reading prepared facts | **Not built** |

Full detail: [`moraware-report-feeds.md`](./moraware-report-feeds.md)

### Key IDs

| Org | `organization_id` | Feed id | Notable run id |
|-----|-------------------|---------|----------------|
| Real Elite | `89180433-9fab-4024-bec9-a14d870bd0a8` | `e8c0433a-c243-4cc5-b8bb-7842ec64a0e7` (view 219) | `afc7b49d` (validated staging, no promo); `cb765461` (failed — schema drift); `8f5e74d1` (**matched-only promoted** — 6,957 facts / 29 ambiguous excluded; `needs_review`) |
| Real Elite | (same) | `02ae8a2a-ea1f-4d03-ae59-276af15435ed` (view 220) | `655eed33` (stale — pre-hash-fix; do not promote); `7e532f55` (**name-only promoted 2026-05-31** — 22,875 facts / 561,989.50 sqft / 24 ambiguous excluded; `needs_review`) |
| Test org | `00000000-0000-0000-0000-000000000001` | `a053cb9a-e362-4c5a-8f47-895314cec85a` | `a660473b-b200-4d14-ba0b-5b713c475c9c` (promo smoke 1); `6d54c835-058f-47f8-a831-db8efca86a5b` (promo smoke 2, supersede) |

Sales Worksheet Facts (view 219) contract: `report_type=sales_worksheet_facts`, hash `8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade` (76-col). Columns 1–15 + col 76 → prepared facts; cols 16–75 raw_row only.

Sales Worksheet History Facts (view 220) contract: `report_type=sales_worksheet_history_facts`, hash `ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000` (34-col). Feed `02ae8a2a-ea1f-4d03-ae59-276af15435ed`. Same prepared table as view 219; **dashboard queries must filter by `report_feed_id = '02ae8a2a-ea1f-4d03-ae59-276af15435ed'`**. Job Status absent → `job_status = null` in promoted facts.

**Run `655eed33`** — stale (pre-hash-fix, 12 collision groups). Do not promote.  
**Run `7e532f55`** — **name-only promoted 2026-05-31**. 22,875 active facts / 561,989.50 sqft / 6,985 matched + 15,890 name-only / 24 ambiguous excluded. Run status `needs_review` (identity partial).

**View 220 name-only promotion:** use `--allow-name-only` (NOT `--matched-only`). Name-only facts have null `job_id`/`account_id`; `identity_status = "needs_identity_review"`. Run status stays `needs_review`. **Cannot be used on view 219 feeds** — DB-enforced. Dashboard queries must handle null ID joins explicitly.

### Key commands

```bash
# Dry-run POC (no Supabase)
npm run eos:moraware:report-feed-poc

# Staging (+ optional immediate promotion with MORAWARE_REPORT_FEED_PROMOTE=1)
npm run eos:moraware:persist-report-feed-local

# Post-hoc API mirror enrichment (dry-run first, then --apply)
npm run eos:moraware:enrich-report-run-api-mirror
npm run eos:moraware:enrich-report-run-api-mirror -- --apply  # add SUPABASE_WRITE_ENABLED=1

# Matched-only promotion of a persisted+enriched run
npm run eos:moraware:promote-report-run-matched-facts -- --review-ambiguous  # read-only
npm run eos:moraware:promote-report-run-matched-facts                         # dry-run
npm run eos:moraware:promote-report-run-matched-facts -- --apply --matched-only  # add SUPABASE_WRITE_ENABLED=1

# View 220 name-only promotion (matches + unmatched included, ambiguous excluded)
npm run eos:moraware:promote-report-run-matched-facts -- --apply --allow-name-only  # add SUPABASE_WRITE_ENABLED=1

# Tests
npm run eos:test:moraware-report-feed
npm run eos:test:moraware-report-feed-persistence
npm run eos:test:moraware-api-mirror-enrichment
npm run eos:test:moraware-report-feed-promotion
npm run eos:test:moraware-report-feed-promote-persistence
npm run eos:test:moraware-report-feed-promote-persisted

# Repo sanity
npm run eos:check:local
```

Promotion gates (persisted-run path): `SUPABASE_WRITE_ENABLED=1`, `--apply --matched-only`, no schema drift, no unmatched rows.
Promotion gates (local-file path): `SUPABASE_WRITE_ENABLED=1`, `MORAWARE_REPORT_FEED_PROMOTE=1`, run `validated`, no schema drift / ambiguous / duplicate row hashes.

Code: `backend-core/src/moraware/reportFeeds/`, scripts under `backend-core/src/scripts/moraware/`.

---

## Next slice (recommended)

**Phase A complete (2026-05-30):** Governed download design contract is in [`moraware-report-feeds.md`](./moraware-report-feeds.md#governed-download-design-phase-a--docs-only). No fetch code yet.

**Staging hardening complete (2026-05-30):** 76-column real contract in place; identity-link dedup fixed; error serialization improved. **Manual Supabase UPDATE required** — update the Elite and test org `moraware_report_feeds` rows to `expected_column_hash = '8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade'` before the next staging run.

**HTML pagination finding (2026-05-30):** The saved view 219 HTML (`/sys/report/?view=219`) is paginated by Moraware — only **22 job links + 4 account links** visible, vs 6,986 CSV rows. HTML identity enrichment is intentionally best-effort. High `needs_identity_review` counts are expected and normal until a full-coverage identity source is wired (true all-pages HTML, Moraware API mirror, or Account Mapping). This does not block staging. Do not attempt to solve HTML pagination in the current slice.

**API mirror enrichment built (2026-05-31):** `enrichRunFromApiMirror` + CLI implemented. Uses `brain_moraware_jobs` as full-coverage identity source after HTML-only staging. Dry-run default; exact account+job match only; no fuzzy matching; never touches promoted runs or prepared facts.

**Matched-only promotion built (2026-05-31):** `promotePersistedRunMatchedFacts` + CLI implemented. Reads from `moraware_report_raw_rows` (post-enrichment DB rows), promotes only `identity_status = "matched"` rows to prepared facts, excludes ambiguous rows, preserves supersede semantics. Dry-run default; `--apply --matched-only` required when ambiguous rows exist.

**v1 validation complete (2026-05-31):** Run `8f5e74d1` matched-only promoted. Results: 6,957 active prepared facts, 2,634 distinct jobs, 176,516.00 total worksheet sqft, 29 ambiguous rows excluded (run stays `needs_review`). See [`moraware-report-feeds.md` § v1 validation results](./moraware-report-feeds.md#v1-validation-results-run-8f5e74d1) for full detail.

**View 220 contract built (2026-05-31):** 34-column `sales_worksheet_history_facts` contract. Fixture, parser tests, and commented Supabase feed INSERT added. All existing pipeline modules reuse without modification. No DB migration needed. Supabase feed INSERT must be run manually before staging.

**View 220 row_hash collision fix (2026-05-31):** `buildExtraDiscriminators` now folds all 34 raw column values (sorted by name) into the hash for `sales_worksheet_history_facts`, eliminating collisions between rows that share all base fields but differ in detail columns (Edge, Thickness, Sink Type, etc.). View 219 hashes are fully unchanged. 4 new regression tests pass. Old run `655eed33` discarded; replaced by run `7e532f55`.

**View 220 name-only promotion complete (2026-05-31):** Run `7e532f55` promoted from feed `02ae8a2a`. 22,875 active prepared facts / 561,989.50 sqft. 6,985 matched (177,070.50 sqft) + 15,890 name-only (384,919.00 sqft). 24 ambiguous excluded. Run status `needs_review` (identity partial). See [`moraware-report-feeds.md` § v2 validation results](./moraware-report-feeds.md#v2-validation-results-run-7e532f55).

**Next immediate steps (view 220):** ✅ Staging, enrichment, and name-only promotion are complete. No pending operator actions.

- Dashboard wiring requires separate approval. When building: always filter by `report_feed_id = '02ae8a2a-ea1f-4d03-ae59-276af15435ed'` and handle null `job_id`/`account_id` explicitly in joins.
- The 24 ambiguous excluded rows can be investigated via `--review-ambiguous` if ID resolution is desired later.

**Next immediate steps (view 219):**
1. (Optional) Resolve the 29 ambiguous rows from run `8f5e74d1`.
2. (Optional) Add `account_salesperson` as a typed column if per-account salesperson reporting is needed.
3. Wire a dashboard to read from `moraware_prepared_sales_worksheet_facts` (separate approval — see "Do not build yet"). **Always filter by `report_feed_id`. Handle null `job_id`/`account_id` in view 220 rows.**

**Phase B (governed download — still pending):**

1. Verify Moraware login mechanics manually — use [`moraware-login-mechanics-checklist.md`](./moraware-login-mechanics-checklist.md) (browser/network only; no fetch code yet).
2. If feasible: implement `fetchReportFeedArtifacts` (network-only) → existing `processReportFeedLocal` → `persistReportFeedRun` path.
3. If not feasible: document findings; do **not** add headless browser without separate threat-model approval.

Use **Sonnet** for credential/session/fetch work. Still no cron, API routes, or dashboard reads.

Later slices (separate approval): raw artifact storage decision → scheduled worker → dashboard reads behind RLS.

---

## Do not build yet (unless explicitly requested)

- Live Moraware download automation
- Browser scraping or session/cookie handling in repo
- API routes, cloud worker cron, deployment changes for report feeds
- Dashboard reads from `moraware_prepared_sales_worksheet_facts`
- Changes to quote math, Internal Estimate, public/partner quote, Monday sync
- Replacing or breaking existing Moraware API sync
- Committing real Moraware exports, cookies, SID, or credentials
- Promoting prepared facts for real Elite org without explicit approval

---

## Safety invariants (report feeds)

- Prepared facts promoted only with `MORAWARE_REPORT_FEED_PROMOTE=1`
- Failed / `needs_review` runs must not replace latest successful prepared facts
- Old prepared facts: supersede/deactivate (`is_active`, `superseded_by`), not blind delete
- Service-role Supabase writes: backend/scripts only, gated by env flags

Durable decisions: `FEATURE_DECISIONS.md` entries **37** (additive lane), **38** (SQL supersede semantics), **39** (governed download v1 contract), **40** (Option B real export shape, Branch deferred), **41** (76-column full contract, identity-link dedup, error serialization hardening), **42** (HTML identity is best-effort; view 219 HTML is paginated; full identity deferred), **43** (API mirror enrichment: exact match, dry-run default, no promotion), **44** (matched-only promotion: ambiguous excluded, unmatched blocks, dry-run default, no auto-promote), **45** (view 220 separate feed, shared prepared table, report_feed_id scoping required, job_status null OK), **46** (name-only promotion: view 220 only, null IDs allowed, run stays needs_review, DB-enforced type guard), **47** (view 220 row_hash collision fix: two-tier hash, full-row extra discriminators, view 219 unchanged).

---

## Model usage (Cursor)

| Task | Model |
|------|--------|
| Docs, handoff updates, tiny script comment fixes, running local tests | Auto / cheaper default |
| Governed download, credentials/security, transaction logic, auth/RLS, quote/pricing math | Sonnet (or stronger) — review security checklist in `.cursor/rules/security-audit.mdc` |

---

---

## AI Takeoff foundation (2026-06-01)

Contract-first foundation for AI Takeoff — pure functions, no UI, no AI API calls, no Internal Estimate changes.

### Status

| Piece | State |
|-------|-------|
| `takeoffContract.mjs` — versioned schema v1.0, factory helpers | **Built** |
| `takeoffMeasurementCalc.mjs` — deterministic sf calculator | **Built** |
| `takeoffValidator.mjs` — structured diagnostics (15 codes) | **Built** |
| `takeoffImportPlanner.mjs` — RoomScopeBuilder import plan | **Built** |
| `fixtures/spec73.fixture.mjs` — Spec 73 known-good fixture | **Built** |
| `takeoff.contract.test.mjs` — 16 test groups | **Built, all passing** |
| `docs/eliteos/ai-takeoff-foundation.md` | **Written** |
| `app-ai-takeoff/` UI head | **Not built** |
| Live AI API extraction | **Not built** |
| Internal Estimate "Import from Takeoff" button | **Not built** |
| Supabase storage for takeoff jobs/results | **Not built** |

### Spec 73 verified results
- Countertop exact sf: **59.96**
- Backsplash exact sf: **6.61**
- Combined exact sf: **66.57**
- Chargeable countertop: **60 sf** (ceiling)
- Chargeable backsplash: **7 sf** (ceiling)

### Key commands
```bash
npm run eos:test:takeoff-contract   # all 16 test groups
npm run eos:test:pricing-authority  # confirm no pricing regression
npm run eos:check:local             # full repo check
```

### Durable decision
See `FEATURE_DECISIONS.md` entry **48** (contract-first, AI-not-authority, separate head).

### Next slice (requires separate approval)
1. Wire a real AI call (vision model) to produce a `TakeoffResult` draft from an uploaded plan image/PDF.
2. Or: Build the `app-ai-takeoff/` lab head UI — plan upload → draft review → validator display → approve/reject.

---

## Other heads (unchanged this slice)

Quote platform, Monday sync, Moraware API worker, pricing admin — **out of scope** unless the user names them. See `docs/eliteos/SYSTEM_BLUEPRINT.md` and `docs/eliteos/eliteOS-master-head-map.md`.
