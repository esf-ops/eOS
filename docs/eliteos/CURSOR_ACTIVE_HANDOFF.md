# Cursor active handoff (eliteOS / slabOS)

**Purpose:** Cheap context for new Cursor chats. Do not treat old chat transcripts as source of truth — use this file + `docs/eliteos/*` + `.cursor/rules/*`.

**Last updated:** 2026-06-03 (AI Takeoff v6.2.1 — estimator workflow polish; dev tools hidden by default)

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

## AI Takeoff Lab (2026-05-31, v5.9 built + deployed as protected head)

Contract-first foundation + file-backed workspace + live AI extraction + benchmark/evaluation harness + run history + debug view + four-step extraction (inventory → dimension evidence → targeted extraction → validator reconciliation) + cutout handling rules + sanitized benchmark evaluator + automatic QA gate (v5.8) + **swappable AI provider — Gemini support** (v5.9).

**Last updated:** 2026-05-31

### Current AI extraction status (Hand sketch benchmark 001)

| Run | Prompt | CT exact | BS exact | CT target | BS target | CT delta | Result |
|-----|--------|----------|----------|-----------|-----------|----------|--------|
| v5 run 1 | v1 | 76.97 sf | 0.00 sf | 78 sf | 4 sf | -1.03 | CT close / BS missed |
| v5.1 run | v2 | **68.41 sf** | 1.04 sf | 78 sf | 4 sf | -9.59 | CT **regressed** / BS partial |
| Later run | v2 | **48.97 sf** | 0.00 sf | 78 sf | 4 sf | -29.03 | CT **severe regression** / BS missed |
| v5.4 run | v3+inv | 44.99 sf | 3.07 sf | 78 sf | 4 sf | -33.01 | CT **still regressed** / BS partial |
| v5.5 runs | v4+inv+ev | TBD — run manually | — | 78 sf | 4 sf | — | Three-step evidence anchored |
| v5.6 runs | v5+inv+ev+ref | TBD — run manually | — | 78 sf | 4 sf | — | Ref total reconciliation |

**Status:** v5.9.2 — upload-first, nonstandard-depth QA, IE/QL UI alignment. Dark hero removed; page initializes to empty upload-first state (`sourceMode="none"`); Spec 73 only loads on explicit demo click (with demo badge). Start New Takeoff goes to empty state, not Spec 73. `NONSTANDARD_DEPTH_ASSUMED` validator code fires on island/peninsula/bar/desk/waterfall runs > 26" depth and escalates to `needs_review` in the QA gate. Token values updated to match IE/QL (radius, shadow, body background). Shell alignment (v5.9.1): topbar, brand-row, avatar user-menu, `auth-panel-standalone` match standard eliteOS protected-head pattern. Auth: `getSession()` + `onAuthStateChange` shared `.eliteosfab.com` cookie SSO.

**Deployed URL:** https://takeoff.eliteosfab.com — Vercel project `app-ai-takeoff`, domain `takeoff.eliteosfab.com`

**Head access:** `ai_takeoff` slug in `user_head_access` table (or admin/super_admin role which auto-passes). Backend enforces via `requireHeadAccess("ai_takeoff", ...)` on all takeoff API routes.

**CORS:** `takeoff.eliteosfab.com` is covered by the `*.eliteosfab.com` subdomain trust + `HEAD_URL_AI_TAKEOFF` env in backend. No wildcard CORS added.

### Known benchmark categories (v5.7)

| ID | Label | Expected CT | Expected BS | Expected Status | Confidence |
|----|-------|-------------|-------------|-----------------|------------|
| ref-001 | Simple written-reference desk | 31 | 0 | auto_pass | high |
| ref-002 | Kitchen with 4" BSP reference | 53 | 6 | review_required | high |
| ref-003 | No-backsplash kitchen reference | 49 | 0 | auto_pass | high |
| ref-004 | No-backsplash sketch reference | 50 | 0 | auto_pass | high |
| clean-rect-001 | Clean rectangle geometry | ~78 | 0 | auto_pass | high |
| waterfall-001 | Waterfall / stepped-shape | ~76.3 | 0 | review_required | medium |
| mixed-fhbs-001 | CT + standard BS + FHBS | 62 | 51 (11+40) | review_required | medium |
| high-bs-001 | High BS + mixed area split | 132 | ~23.2 | review_required | medium |
| messy-email-001 | Messy email + sketch | unknown | unknown | review_required | low |
| multi-page-001 | Multi-page cabinet packet | unknown | unknown | review_required | low |

### Status

| Piece | State |
|-------|-------|
| `takeoffContract.mjs` — schema v1.0; `cutouts[]` field + `CUTOUT_IN_EXCLUSIONS_WARNING` (v5.5); 5 new diagnostic codes incl. `REFERENCE_TOTAL_*` + `EVIDENCE_DIMENSION_NOT_USED` (v5.6) | **Built** |
| `takeoffMeasurementCalc.mjs` — deterministic sf calculator | **Built** |
| `takeoffValidator.mjs` — 18+ diagnostic codes incl. v5.1 BS guards, v5.5 cutout guard, v5.6 ref total + coverage checks | **Built** |
| `takeoffImportPlanner.mjs` — RoomScopeBuilder import plan | **Built** |
| `fixtures/spec73.fixture.mjs` — Spec 73 known-good fixture | **Built** |
| `takeoff.contract.test.mjs` — **24 tests** (A-X, incl. v5.5 T/U cutout tests + v5.6) | **Built, all passing** |
| `docs/eliteos/ai-takeoff-foundation.md` | **Written** |
| `app-ai-takeoff/` lab shell | **Built** |
| `takeoffWorkspaceService.mjs` — workspace persistence; `dimensionEvidence` in `getResultById` (v5.5) | **Built** |
| `takeoffWorkspaceService.test.mjs` — 30 tests | **Built, all passing** |
| `takeoffPageInventoryPrompt.mjs` — inventory prompt v1 (v5.4) | **Built** |
| `takeoffPageInventoryService.mjs` — page inventory service (v5.4) | **Built** |
| `takeoffPageInventoryService.test.mjs` — 10 tests | **Built, all passing** |
| `takeoffDimensionEvidencePrompt.mjs` — dimension evidence prompt **v2** (v5.6); adds `referenceTotals[]` | **Built** |
| `takeoffDimensionEvidenceService.mjs` — dimension evidence service; normalizes `referenceTotals` (v5.6) | **Built** |
| `takeoffDimensionEvidenceService.test.mjs` — **13 tests** | **Built, all passing** |
| `takeoffEvidenceCoverage.mjs` — pure coverage helper; `compareDimensionEvidenceToTakeoffRuns` (v5.6) | **Built** |
| `EVIDENCE_PROMPT_VERSION` = **v2** | — |
| `takeoffExtractionPrompt.mjs` — AI system prompt (**v5**, inventory + evidence + ref totals context) | **Built** |
| `PROMPT_VERSION` = **v5** | — |
| `takeoffAiProvider.mjs` + `openAiTakeoffProvider.mjs` — `dimensionEvidence` param (v5.5) | **Built** |
| `takeoffExtractionService.mjs` — four-step extraction (inv → evidence → extraction → validate w/ dimensionEvidence) | **Built** |
| `takeoffExtractionService.test.mjs` — 28 tests (21-24 v5.4, 25-28 v5.5) | **Built, all passing** |
| `POST /api/takeoff-jobs/:id/generate-ai-draft` endpoint | **Built** |
| `GET /api/takeoff-jobs/:id/results` — list run summaries (v5.3) | **Built** |
| `GET /api/takeoff-jobs/:id/results/:resultId` — load run with inv + evidence (v5.5) | **Built** |
| AI draft button + progress UI in `app-ai-takeoff/` | **Built** |
| `takeoffBenchmark.mjs` — eval helpers + 10 sanitized fixtures A–J (v5.7 schema) | **Built** |
| `takeoffBenchmark.test.mjs` — 7 tests | **Built, all passing** |
| `takeoffBenchmarkEvaluator.mjs` — NEW (v5.7): scores computed totals vs fixture, classifies failure category | **Built** |
| `takeoffBenchmarkEvaluator.test.mjs` — **17 tests** | **Built, all passing** |
| `TakeoffBenchmarkPanel.tsx` — preset buttons + evaluator analysis (v5.7) | **Built** |
| `takeoffQaGate.mjs` — NEW (v5.8): pure automatic QA gate; statuses: `ready_for_review / needs_review / do_not_import` | **Built** |
| `takeoffQaGate.test.mjs` — **23 tests** (incl. v5.8.1 benchmarkContext) | **Built, all passing** |
| `TakeoffQaGatePanel.tsx` — NEW (v5.8): estimator-facing QA result card; above Validation diagnostics | **Built** |
| `TakeoffLabApp.tsx` — `qaGate` via `useMemo`; "Start new takeoff" button (v5.8); `benchmarkQaContext` state (v5.8.1) | **Built** |
| `geminiTakeoffProvider.mjs` — NEW (v5.9): Gemini provider for all 3 AI passes | **Built** |
| `geminiTakeoffProvider.test.mjs` — **25 tests** | **Built, all passing** |
| `takeoffAiProvider.mjs` — updated (v5.9): `gemini` in `SUPPORTED_PROVIDERS`; `getInventoryProvider`/`getEvidenceProvider` helpers; provider-aware `readExtractionConfig` | **Built** |
| Prompt version badge in AI draft mode (v5.2) | **Built** |
| `TakeoffRunHistoryPanel.tsx` — run history panel + provider source pill (v5.9) | **Built** |
| `TakeoffDebugPanel.tsx` — debug view with page inv + dimension evidence sections (v5.5) | **Built** |
| `TakeoffPageInventoryPanel.tsx` — page classification panel (v5.4) | **Built** |
| `TakeoffDimensionEvidencePanel.tsx` — shows ref totals reconciliation + coverage warnings (v5.6) | **Built** |
| Internal Estimate "Import from Takeoff" button | **Not built — blocked on extraction accuracy + QA gate** |

### Spec 73 verified results
- Countertop exact sf: **59.96**
- Backsplash exact sf: **6.61**
- Combined exact sf: **66.57**
- Chargeable countertop: **60 sf** (ceiling)
- Chargeable backsplash: **7 sf** (ceiling)

### Key commands
```bash
npm run eos:test:takeoff-gemini-provider      # 25 tests (v5.9 Gemini provider)
npm run eos:test:takeoff-qa-gate              # 23 tests (v5.8 QA gate + v5.8.1 benchmarkContext)
npm run eos:test:takeoff-benchmark-evaluator  # 17 tests (v5.7 evaluator)
npm run eos:test:takeoff-contract             # 24 tests A-X (incl. v5.5 cutout + v5.6 ref total/coverage)
npm run eos:test:takeoff-workspace-service    # 30 tests
npm run eos:test:takeoff-extraction-service   # 28 tests (incl. v5.4 inv + v5.5 evidence)
npm run eos:test:takeoff-page-inventory       # 10 tests (v5.4)
npm run eos:test:takeoff-dimension-evidence   # 13 tests (v5.5 + v5.6)
npm run eos:test:takeoff-benchmark            # 7 tests (pure eval helpers)
npm run eos:test:pricing-authority            # confirm no pricing regression
npm run eos:check:local                       # full repo check
```

### Server env vars for live AI
```
TAKEOFF_AI_ENABLED=1        required
TAKEOFF_AI_PROVIDER=openai  default: openai
TAKEOFF_AI_MODEL=gpt-4o     default: gpt-4o
OPENAI_API_KEY=sk-...       never client-exposed
```

### Durable decisions
`FEATURE_DECISIONS.md` entries **48** (contract-first), **49** (quote files storage), **50** (provider-neutral extraction, AI-not-authoritative, no raw PDFs committed), **51** (v5.7 sanitized benchmark evaluator foundation), **52** (v5.8 automatic QA gate — must pass before any future import path), **53** (v5.9 provider swap for benchmarked comparison — every output still goes through eliteOS recompute + validator + QA gate).

### Lab versions
| Version | Status |
|---------|--------|
| v1 — Spec 73 fixture viewer | Built |
| v2 — Pasted JSON workbench | Built |
| v3 — Editable review fields | Built |
| v4 — File-backed workspace (no AI) | Built |
| v4.5 — Normalized workspace persistence | Built |
| v5 — Live AI extraction (OpenAI Responses API) | Built |
| v5.1 — Backsplash tuning, diagnostics, AI review notes UI | Built |
| v5.2 — Benchmark/evaluation harness, prompt regression guard | Built |
| v5.3 — Extraction run history, debug panel, _meta tracking | Built |
| v5.4 — Page inventory + targeted extraction pass | Built |
| v5.5 — Dimension evidence table + cutout handling rules | Built |
| v5.6 — Reference total reconciliation + evidence coverage warnings | Built |
| v5.7 — Sanitized benchmark evaluator foundation | **Built** |
| v5.8 — Automatic QA gate + estimator-friendly review mode | **Built** |
| v5.8.1 — QA gate respects selected benchmark/manual expected values | **Built** |
| v5.9 — Gemini provider test for PDF/vision extraction | **Built** |

Dev: `npm run dev --prefix app-ai-takeoff` -> `http://localhost:5186`. Not in Home Launcher yet.

### v6.0 status: evidence-first integrity (2026-05-31 ✅)

| Area | State |
|------|-------|
| New diagnostic codes (6) | **Done** — contract.mjs |
| `takeoffEvidenceRunReconciliation.mjs` | **Done** — pure helper, 18 tests passing |
| Validator integration | **Done** — calls reconciliation after evidence coverage check |
| QA gate integration (checks 11a–11e) | **Done** — escalates unsupported/changed/conflict/corner/review |
| Extraction prompt v6 | **Done** — assemblyNotes required, requiresEstimatorReview, evidence citation rules |
| UI: Evidence Trace panel | **Done** — compact per-run verdict table with badge + evidence ref |
| All existing tests | **All passing** (28 extraction, 25 QA gate, 18 reconciliation, 13 dim-evidence, 25 Gemini, 6 config) |
| Build | **Clean** (vite build, eos:check:local) |
| Import disabled | **Still disabled** — no change |

### v6.2.1 status: estimator workflow polish (2026-06-03 ✅)

| Area | State |
|------|-------|
| Page branding | "AI Takeoff Lab" → "AI Takeoff" throughout |
| JSON Workbench | **Hidden by default** — only visible when `VITE_TAKEOFF_SHOW_DEV_TOOLS=1` |
| Benchmark / Debug tools | **Hidden by default** — same flag required |
| AI assumptions section | Renamed → "Plan notes & AI review flags" with category split (plan notes vs AI flags) |
| Review Workbench heading | "Review measurements before saving" + concise helper copy |
| Table column headers | "Run label" → "Run / piece", "Status" → "Include?" |
| Include/exclude toggles | Text now "✓ included" / "↩ re-include" for clarity |
| Reviewer note placeholder | "Note: reason for accepting or changing…" |
| Evidence hint | Fixed stale `Δ0.0"` bug — now shows "nearest plan dim: …" |
| Save section | Button "Save reviewed takeoff" (drop "draft"); explanation added; better unresolved warning and success messages |
| Technical panels | Grouped under "Technical details" label with divider |
| Build | Clean |
| All tests | Passing (33 fabrication, 24 reconciliation, 25 QA gate) |

**Dev tools flag:** Set `VITE_TAKEOFF_SHOW_DEV_TOOLS=1` in `.env.local` to expose JSON Workbench, Benchmark tools, and Debug JSON.

### v6.2 status: deterministic fabrication rules engine + Kelley proof case (2026-06-03 ✅)

| Area | State |
|------|-------|
| `takeoffFabricationRules.mjs` (new) | **Done** — pure rules engine, 8 codes, 7 classifiers |
| `takeoffFabricationRules.test.mjs` (new) | **Done** — 33 tests all passing |
| Diagnostic codes (8 new) | **Done** — contract.mjs updated |
| Validator integration | **Done** — `evaluateTakeoffFabricationRules` merged into diagnostics; `NONSTANDARD_DEPTH_ASSUMED` refined with depth evidence check |
| QA gate integration (checks 10c–10d) | **Done** — cutout→do_not_import; ref-total/dup/bs-conflict/depth-unsupported→needs_review; positive signals for verified depth + no-b/s |
| Extraction prompt v6.1 | **Done** — `PROMPT_VERSION = "v6.1"`, explicit FABRICATION RULES section (6 subsections) |
| Kelley fixture | **Done** — `KELLEY_REVIEWED_RULE_FIXTURE`: ~39.91 sf / 0 bs / review_required; ref "50 sq' no b/s" is comparison-only |
| UI: Fabrication rules panel | **Done** — `TakeoffQaGatePanel.tsx` shows "Fabrication rules" subsection with per-finding icons |
| All tests | **All passing** (33 fabrication, 24 reconciliation, 25 QA gate, 17 benchmark evaluator, 28 extraction service) |
| Build | **Clean** (vite build, eos:check:local) |
| Import disabled | **Still disabled** — no change |

**Core principle (v6.2):** Reference totals are evidence for comparison, not calculation authority. Estimator-reviewed structured runs are the source of truth. eliteOS recompute is authoritative.

### Manual QA checklist (post v6.2)

1. Load Kelley reviewed draft.
2. Confirm measured total remains around 39.91 sf / 0 backsplash.
3. Confirm visible "50 sq' no b/s" note is labeled as reference evidence — no finding that it's authoritative.
4. Confirm no-b/s is honored — "No backsplash confirmed" info appears in Fabrication rules.
5. If "2 STOVE" ambiguity is present in assemblyNotes, confirm `INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED` fires.
6. Confirm island 36" depth with evidence shows `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE` (info, not warning).
7. Confirm excluded L leg does not leave an invalid corner deduction — `CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG` fires when a leg is excluded.
8. Save reviewed draft and reload — confirm Import remains disabled.
9. Confirm any assemblyNotes containing "to reconcile with" triggers `REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET`.

### Manual QA checklist (post v6.0 deployment)

1. Upload Spec 73 PDF.
2. Generate Gemini draft.
3. **Evidence Trace section** shows per-run verdicts — confirm 100", 40", 25.5", 90" runs show ✓ supported badges.
4. Confirm the "Right of stove" 24" run (if Gemini still generates it) shows ⚠ changed badge.
5. Confirm 109.5", 34.5", 54" stove-wall evidence dims appear in "High-confidence evidence not used in any run" list.
6. Confirm QA gate is **not green** when there are changed/unsupported dims.
7. Confirm L-shape corner deductions without overlapMode set trigger ✗ badge in trace.
8. Confirm eliteOS recompute still works correctly from structured runs.
9. Confirm "Import to Internal Estimate" remains disabled.
10. Confirm provider badge (Gemini/OpenAI) still shows near Generate button.

### Ongoing (pre-import)

- Do not enable import until benchmarks ref-001, ref-003, ref-004, clean-rect-001 consistently pass `auto_pass` in the benchmark evaluator AND `ready_for_review` in the QA gate on live runs, for both OpenAI and Gemini.
- Use benchmark evaluator results side-by-side to decide which provider performs better on the private plan library.

**Ongoing:**
- Do not enable import until benchmarks ref-001, ref-003, ref-004, clean-rect-001 consistently pass `auto_pass` in the benchmark evaluator AND `ready_for_review` in the QA gate on live runs, for both OpenAI and Gemini.
- Use benchmark evaluator results side-by-side to decide which provider performs better on the private plan library.

### Import gate
Do NOT enable "Import from Takeoff" until:
1. `evaluateTakeoffAgainstBenchmark(computed, HAND_SKETCH_BENCHMARK_001)` returns `pass` for both CT and BS.
2. Two consecutive runs show no regression vs each other.
3. Estimator manually reviews the draft.

### Future slices (separate approval required)
- Enable Internal Estimate "Import from Takeoff" button (gated above).
- Multi-room / multi-page plan improvements.
- Dealer/partner upload flow (separate auth/org scoping required).
---

## Quote Files + Takeoff Storage (2026-06-01)

File storage architecture for Internal Estimate, AI Takeoff, and sold-quote/Moraware handoff.

### Status

| Piece | State |
|-------|-------|
| `eliteos_quote_files_takeoff_storage.sql` — SQL draft | **Written** — not applied |
| Supabase bucket `eliteos-quote-files` | **Not created** |
| `quote_files` table | **Designed** — draft only |
| `quote_file_events` table | **Designed** — draft only |
| Additive changes to `quote_takeoff_jobs` | **Designed** — draft only |
| Additive changes to `quote_takeoff_results` | **Designed** — draft only |
| `quoteFileStoragePath.mjs` — pure helper | **Built** |
| `quoteFileStoragePath.test.mjs` — 10 test groups | **Built, all passing** |
| `docs/eliteos/quote-files-storage.md` | **Written** |
| Upload UI (Internal Estimate or Lab) | **Not built** |
| Signed URL endpoint | **Not built** |
| RLS policies | **Not applied** |

### Key decisions
- `quote_files` is general-purpose for Internal Estimate and all quote types; AI Takeoff is optional
- Files (bytes) in Supabase Storage; metadata in Postgres
- `quote_id` references `quote_headers.id` for all quote source types (no separate `internal_quote_id`)
- `quote_takeoff_jobs.quote_id` made nullable — allows pre-quote Lab uploads
- `storage_provider` field enables future R2/S3 migration without schema change
- All downloads via signed URLs — `storage_path` never exposed to clients

See `FEATURE_DECISIONS.md` entry **49** and `docs/eliteos/quote-files-storage.md`.

### Key commands
```bash
npm run eos:test:quote-file-storage   # 10 test groups, all passing
npm run eos:test:takeoff-contract     # 16 test groups, all passing
npm run eos:check:local               # full repo check
```

---

## Other heads (unchanged this slice)

Quote platform, Monday sync, Moraware API worker, pricing admin — **out of scope** unless the user names them. See `docs/eliteos/SYSTEM_BLUEPRINT.md` and `docs/eliteos/eliteOS-master-head-map.md`.
