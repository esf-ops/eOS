# AI Takeoff Foundation

**Status:** Foundation built (2026-06-01)  
**Head:** AI Takeoff Head (planned, `Quote / Revenue` category)  
**See also:** [`eliteOS-master-head-map.md`](./eliteOS-master-head-map.md) · [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) entry **48**

---

## End-state vision

Dealers and internal estimators upload cabinet plans or field measurement sketches. eliteOS extracts countertop and backsplash measurements from the plan, calculates material costs across every price group, allows add-ons and custom items, and produces a finished quote ready for the customer.

**AI must not become the final pricing authority.** AI produces a reviewable measurement *draft*. eliteOS validates and calculates from structured dimensions. The estimator approves or rejects the draft before any quote is created.

---

## Why AI Takeoff is separate from Internal Estimate beta

The Internal Estimate beta is a hand-entry quoting tool for staff. AI Takeoff will eventually feed *into* Internal Estimate (and possibly partner/dealer flows), but it is a separate concern:

| Concern | Internal Estimate | AI Takeoff |
|---------|-------------------|------------|
| Input source | Manual entry by estimator | Structured extraction from plan/PDF |
| Measurement authority | Estimator | eliteOS recomputed from raw dimensions |
| Error correction | Estimator adjusts fields | Validator flags discrepancies before import |
| Release gate | Live beta (staff only) | Foundation only — no UI yet |
| Pricing | Uses `quoteCalculator.js` | Does NOT touch pricing — pure measurement |

Keeping them separate means AI Takeoff can be built, tested, and iterated without risking Internal Estimate beta stability.

---

## Architecture: contract-first

All AI Takeoff data flows through a **versioned contract** defined in `backend-core/src/takeoff/`.

```
AI / Manual Entry
       │
       ▼
TakeoffResult (schema v1.0)
       │
   ┌───┴───────────────────────────────┐
   │                                   │
   ▼                                   ▼
computeTakeoffMeasurements()     aiProvidedTotals (stored for audit)
   │
   ▼
validateTakeoffResult()
   │    (compare AI vs computed,
   │     flag bad dimensions,
   │     flag low confidence)
   ▼
planTakeoffImport()
   │
   ▼
ImportPlan  ──▶  (future UI applies to RoomScopeBuilder draft)
```

Each layer is a **pure function** — no side effects, no I/O, no pricing calls.

---

## AI is not the pricing authority

```
AI Takeoff                     eliteOS
────────────────               ─────────────────────────────────────
Extracts: lengthIn,            Recomputes: sf = L×D/144
          depthIn,             Calculates: Group Promo–F (+ Remnant)
          backsplashLinearIn   Applies: markup, add-ons, use-tax
                               Rounds: per Elite ceiling rules
                               Prices: via quoteCalculator.js (unchanged)
```

The AI may include `aiProvidedTotals` (e.g., `countertopExactSf: 59.96`) for audit comparison. The validator flags any mismatch > 0.05 sf as a warning. The computed value from eliteOS's deterministic calculator is **always authoritative**.

---

## Deterministic math validator

`takeoffMeasurementCalc.mjs` recomputes square footage independently:

- **Rectangle:** `sf = (lengthIn × depthIn) / 144`
- **Triangle:** `sf = (lengthIn × depthIn) / 144 / 2`
- **Corner deduction:** `sf = (depthA × depthB) / 144` (applied when explicitly declared)
- **Backsplash via linear inches:** `sf = (linearIn × heightIn) / 144` (default height 4")
- **Chargeable ceiling:** round exact sf up to next whole integer, unless already a whole number within 0.005 tolerance

No pricing rates, no markup, no Supabase — pure arithmetic.

---

## Spec 73 fixture (known-good reference)

`backend-core/src/takeoff/fixtures/spec73.fixture.mjs` encodes the known Spec 73 kitchen plan:

| Run | Length | Depth | sf |
|-----|--------|-------|----|
| Dishwasher wall / left run | 91.5" | 25.5" | 16.20 |
| Sink wall center | 72.0" | 25.5" | 12.75 |
| Peninsula | 77.5" | 41.0" | 22.07 |
| Stove wall left | 26.5" | 25.5" | 4.69 |
| Stove wall right | 24.0" | 25.5" | 4.25 |
| **Countertop total** | | | **59.96 sf** |
| Backsplash 238" × 4" | 238.0" | 4.0" | **6.61 sf** |
| **Combined total** | | | **66.57 sf** |

The validator passes this fixture with zero errors. Run: `npm run eos:test:takeoff-contract`.

---

## AI Takeoff Lab v1 shell (`app-ai-takeoff/`)

**Status:** Built 2026-06-01. Fixture/reviewer only.

The lab head is a **read-only review UI**. It:
- Loads the Spec 73 fixture at startup (no file upload, no API call)
- Runs `computeTakeoffMeasurements`, `validateTakeoffResult`, and `planTakeoffImport` locally
- Displays measurement summary cards, room/area/run table, validator diagnostics, and import plan
- Shows a **disabled** "Import to Internal Estimate — coming later" button explaining the boundary
- Does **not** write data anywhere, does not call the Brain API, does not touch Internal Estimate

Cross-app dependency note: `app-ai-takeoff/vite.config.ts` aliases `@takeoff-core` →
`backend-core/src/takeoff/`. The takeoff modules are pure ESM with no Node.js builtins — vite
bundles them cleanly. `fs.allow: [repoRoot]` enables cross-workspace resolution during dev.
TypeScript ambient declarations are in `src/takeoff.d.ts`.

**Lab v2 (2026-06-01):** Adds a pasted JSON workbench — paste any `TakeoffResult` JSON from an AI tool (Gemini, ChatGPT, etc.), click Validate, and the summary/rooms/diagnostics/import-preview update with the recomputed result. Still no live AI call, no file upload, no storage, no Internal Estimate mutation. Source label in the header shows "Spec 73 sample", "Pasted takeoff JSON", or "Invalid draft". A "Copy summary" button copies computed sf + diagnostics to clipboard.

The lab head is **not registered in Home Launcher** in v1/v2. It is a local dev/lab tool only.
Dev server: `npm run dev --prefix app-ai-takeoff` → `http://localhost:5186`.

---

## Files shipped (v1–v5)

```
backend-core/src/takeoff/
  takeoffContract.mjs            Schema constants, factory helpers, JSDoc types (v1)
  takeoffMeasurementCalc.mjs     Deterministic sf calculator (pure) (v1)
  takeoffValidator.mjs           Structured diagnostics (pure) (v1)
  takeoffImportPlanner.mjs       RoomScopeBuilder import plan mapper (pure) (v1)
  takeoff.contract.test.mjs      Contract + fixture tests (v1)
  takeoffWorkspaceService.mjs    Workspace persistence (quote_takeoff_jobs / results) (v4.5)
  takeoffWorkspaceService.test.mjs
  takeoffWorkspaceRoutes.js      API routes (v4 → v5 with generate-ai-draft) (v5)
  takeoffExtractionPrompt.mjs    AI extraction system prompt (v5)
  takeoffAiProvider.mjs          Provider factory + env config (v5)
  openAiTakeoffProvider.mjs      OpenAI Responses API implementation (v5)
  takeoffExtractionService.mjs   Orchestration: download → AI → recompute → save (v5)
  takeoffExtractionService.test.mjs  18 tests, all mocked (v5)
  fixtures/
    spec73.fixture.mjs           Known-good Spec 73 fixture (v1)

app-ai-takeoff/
  src/
    TakeoffLabApp.tsx            Top-level shell (v1 → v5: ai-draft mode)
    components/
      TakeoffPlanFileSection.tsx  Upload + workspace + AI generate button (v4 → v5)
      TakeoffSummaryCards.tsx
      TakeoffRoomsReview.tsx
      TakeoffDiagnosticsPanel.tsx
      TakeoffImportPreview.tsx
      TakeoffWorkbench.tsx
    styles.css                   AI draft styles (v5)
    lib/
      api.ts
      supabase.ts
      authSession.ts
      config.ts

docs/eliteos/
  ai-takeoff-foundation.md     This document
```

Scripts added to root `package.json`:
```bash
npm run eos:test:takeoff-contract            # contract tests (16 groups)
npm run eos:test:takeoff-workspace-service   # workspace tests (22 tests)
npm run eos:test:takeoff-extraction-service  # extraction tests (18 tests) — NEW v5
npm run eos:build:ai-takeoff                 # build the lab head
```

---

## Import planner: area → shape group mapping

| Counter run count | Shape group type | Overlap mode |
|-------------------|-----------------|--------------|
| 1 | straight | none |
| 2 | L-Shape | auto |
| 3 | U-Shape | auto |
| ≥ 4 | manual + warning | none |

Backsplash expressed as `backsplashLinearIn` maps to a separate `Backsplash` group with one splash piece.

If a shape cannot be cleanly represented, the planner emits a `UNSUPPORTED_SHAPE` warning rather than forcing a malformed import.

---

## First implementation boundaries

**Built in this slice:**
- Versioned JSON contract (schema v1.0)
- Factory helpers (`makeTakeoffResult`, `makeTakeoffRoom`, `makeTakeoffArea`, `makeTakeoffRun`)
- Deterministic measurement calculator
- Validator with structured diagnostics (15 diagnostic codes)
- Import planner → RoomScopeBuilder-compatible plan
- Spec 73 fixture (known-good reference)
- Contract tests (16 test groups, all passing)
- Architecture documentation

**Explicitly NOT built in this slice:**
- App UI (`app-ai-takeoff/`)
- File upload or PDF parsing
- Live AI API calls
- Internal Estimate buttons or wiring
- Supabase migrations or storage
- Pricing Admin changes
- Any changes to `quoteCalculator.js`, `prototypeQuoteMath.ts`, or Internal Estimate UI

---

## v5: Live AI Extraction (2026-06-01)

**Status:** Built.

### What v5 adds

Users upload a cabinet plan PDF or image to the AI Takeoff Lab, create a file-backed workspace, then click **"Generate AI takeoff draft."** The backend:

1. Verifies auth + org ownership.
2. Loads the source file row (gets `storage_path` — never exposed to client).
3. Downloads file bytes from private Supabase Storage using the service-role key.
4. Sends the file to OpenAI (Responses API) with a structured system prompt requesting `TakeoffResult` JSON.
5. Parses the AI response.
6. **Server-side recomputes** all square footage with `computeTakeoffMeasurements()` — AI totals are reference only.
7. Validates with `validateTakeoffResult()`.
8. Generates import plan with `planTakeoffImport()`.
9. Saves to `quote_takeoff_results` (or `quote_takeoff_jobs.result_summary` fallback) with `review_status = "needs_review"`.
10. Returns normalized JSON + computed + diagnostics + import plan.

The frontend loads the result into the existing review/edit UI with a "AI draft" pill and a note that estimator review is required.

### AI drafts are never authoritative

- `review_status` is always `"needs_review"` — the API never auto-approves.
- `aiProvidedTotals` stored for audit comparison but never used for pricing.
- Computed sf from `computeTakeoffMeasurements()` is always the authoritative value.
- Import to Internal Estimate remains disabled — this slice is review only.

### Provider-neutral design

- `takeoffAiProvider.mjs` — factory + config reader
- `openAiTakeoffProvider.mjs` — OpenAI Responses API (fetch-based, no npm package)
- Adding Gemini or Claude: add a new provider file + case in `getExtractionProvider()`

### Config (server env vars)

```
TAKEOFF_AI_ENABLED=1        required — must be exactly "1"
TAKEOFF_AI_PROVIDER=openai  default: openai
TAKEOFF_AI_MODEL=gpt-4o     default: gpt-4o
OPENAI_API_KEY=sk-...       required — never client-exposed
```

### Real PDFs are private

Raw customer PDFs, cabinet plans, and measurement sketches are used only as private manual QA / benchmarking inputs. They are **never committed to the repo**. Tests use sanitized synthetic data (Spec 73 fixture + minimal in-memory blobs). Real files live in private Supabase Storage only.

### Representative plan types designed for

- Hand-drawn countertop sketches with labeled dimensions, cutouts, waterfall notes
- Scanned/rotated PDFs (single-page)
- Multi-page cabinet design packets (elevation pages + field notes)
- Email + sketch hybrids
- Commercial/non-kitchen shapes with explicit sqft references
- Plans with unclear/missing dimensions (model marks low confidence; no guessing)

### Tests (v5)

```bash
npm run eos:test:takeoff-extraction-service  # 18 tests, all mocked
```

All tests use mocked AI provider and mocked Supabase. No real OpenAI calls in CI.

---

## v5.1: Backsplash tuning + diagnostics (2026-06-01)

**Status:** Built.

Enhanced the AI extraction prompt (v2) with explicit backsplash rules: structured `backsplashLinearIn`/`backsplashHeightIn` fields, handling of "no B/S" vs. positive notes, `aiProvidedTotals.backsplashExactSf`, and "full height" cases.

Added two new validator diagnostics:
- `AI_BACKSPLASH_TOTAL_NOT_STRUCTURED` — AI reported a backsplash total but no structured run was produced.
- `POSSIBLE_BACKSPLASH_NOTE` — Notes mention backsplash/tile keywords but computed backsplash = 0.

Added "AI assumptions & review notes" panel to the Lab UI, consolidating all project/room/area notes in one prominent place.

**Observed hand sketch job 001 result after v5.1 (prompt v2):**
- Countertop exact: **68.41 sf** (regressed from 76.97 sf — island shrank to 86″ × 56″)
- Backsplash exact: **1.04 sf** (slight improvement from 0.00 sf, but still below target of 4 sf)
- Prompt v2 made backsplash slightly better but countertop significantly worse.

---

## v5.2: Benchmark / evaluation harness (2026-06-02)

**Status:** Built.

### Motivation

After v5.1 prompt tuning, countertop accuracy regressed from 76.97 sf to 68.41 sf against the hand sketch 001 estimator target of 78 sf. Without a structured evaluation harness, it is impossible to know whether a prompt/model change made things better or worse.

### What v5.2 adds

**`backend-core/src/takeoff/takeoffBenchmark.mjs`** — pure evaluation helpers:
- `HAND_SKETCH_BENCHMARK_001` — dev-only fixture with estimator-approved targets (78 sf CT / 4 sf BS), known failure modes, and extraction history notes.
- `evaluateTakeoffAgainstBenchmark(computed, benchmark)` — computes delta, % error, pass/fail, and `backsplashHighSeverity` flag per category. Always uses **eliteOS computed totals** — never raw AI totals.
- `compareAiTakeoffRuns(previousEval, currentEval)` — compares two evaluations and flags regressions (current error > previous error by > 0.5 sf).

**`app-ai-takeoff/src/components/TakeoffBenchmarkPanel.tsx`** — Lab UI evaluation panel:
- Manual fields for expected CT sf and BS sf.
- Tolerance ± sf input.
- "Load hand sketch target" button pre-fills from `HAND_SKETCH_BENCHMARK_001` (78 sf / 4 sf).
- "Evaluate current draft" runs the pure function client-side — no backend call needed.
- Results table: Expected / Computed / Delta / % Error / Pass per row.
- Summary pill: PASS / NEEDS REVIEW / REGRESSION.
- High-severity callout when expected BS > 0 but computed = 0.
- Local QA notes textarea (not persisted).

**Prompt version badge** — when an AI draft is active, a small badge in the source pills area shows `Prompt vX · model-name` using metadata returned by the extraction endpoint.

### Benchmark rules

- eliteOS computed totals are the measurement being compared, not raw AI totals.
- Missing backsplash when `expectedBacksplashSf > 0` → `backsplashHighSeverity = true` → not a pass.
- CT or BS delta > tolerance (default ±2 sf) → `needs_review`.
- Comparison: current run error > previous run error by > 0.5 sf → `regression`.

### Private PDFs stay private

Raw customer PDFs, cabinet plans, and measurement sketches are **never committed to the repo**. The `HAND_SKETCH_BENCHMARK_001` fixture contains only estimator-approved numeric targets and descriptive notes — no raw measurement data or customer PII.

### When to run evaluation

Run `evaluateTakeoffAgainstBenchmark` against the hand sketch benchmark 001 target after **every** prompt or model change before shipping. A regression in countertop (e.g. > 2 sf delta) or missing backsplash must be investigated before proceeding.

### Import gate

Import into Internal Estimate should wait until the hand sketch job 001 benchmark passes consistently (both CT and BS within tolerance) across at least two extraction runs. Do not enable the import button until extraction accuracy is verified.

### Tests

```bash
npm run eos:test:takeoff-benchmark  # 7 tests, all pure
```

---

## Quote-import planning (architecture note)

This section describes the intended flow for converting an AI draft into a quote. **This is not implemented yet.** It is documented here so the architecture is clear before the import slice is built.

### Intended flow

```
AI draft  →  estimator review  →  reviewed TakeoffResult  →  Internal Estimate import
```

1. **AI draft** — `runAiTakeoffExtraction` produces a `TakeoffResult` with `status: "draft"` and `reviewStatus: "needs_review"`. AI output is never authoritative for pricing.
2. **Estimator review** — The estimator reviews the AI Takeoff Lab, corrects dimensions, confirms backsplash, and clicks "Save reviewed takeoff draft." `reviewStatus` may be changed to `"reviewed"`.
3. **Reviewed TakeoffResult** — The saved result is stored in `quote_takeoff_results`. `status` should be `"reviewed"` or `"approved"` before import is enabled.
4. **Internal Estimate import** — A future "Import from Takeoff" button reads the `ImportPlan` and calls `appendGuidedShapeGroup` to populate rooms/areas/runs in the Internal Estimate draft. The estimator still completes: customer name, account, material selection, pricing, color TBD flags, edge profiles, add-ons, and tax.
5. **Quote Library draft** (later) — After the Internal Estimate is saved, a Quote Library entry can be created with `status: "Needs estimator review"` and the `quote_file_id` linked to the new `quote_id` for traceability.

### What import must NOT do

- Import must never auto-calculate final pricing or apply markup.
- Import must never auto-approve a draft or change `reviewStatus` to `"approved"`.
- Import must never mutate an already-saved quote — it only populates a new Internal Estimate draft.
- Import must never expose `storage_path` or AI provider credentials to the frontend.

### Status (v5.1)

The "Import to Internal Estimate" button in the Lab is intentionally disabled. The `importPlanJson` is computed and stored in `quote_takeoff_results` for when the import slice is built.

---

## Future slices (separate approval required)

### Import into Internal Estimate
Add an "Import from Takeoff" button to Internal Estimate that reads an approved `ImportPlan` and calls `appendGuidedShapeGroup` to populate room shapes. No behavior change to existing manual entry.

### Dealer upload flow
Allow partner/dealer portals to upload plans and receive a quote based on the approved takeoff. Requires dealer auth, org-scoped storage, and the partner quote flow.

### Multi-room support
Expand fixture and import planner for multi-room plans (bathrooms, pantry, laundry in addition to kitchen).

---

## Quote Files + Takeoff Storage Architecture

See [`quote-files-storage.md`](./quote-files-storage.md) for the full design.

**Summary:** `quote_files` is the general-purpose file attachment table for Internal Estimate and all quote types. AI Takeoff (`takeoff_jobs` / `takeoff_results`) is an optional processing layer on top. Most Internal Estimate files will never run through AI Takeoff.

| Table / Component | Role |
|---|---|
| `quote_files` | General file metadata; one row per uploaded file; org-scoped |
| `quote_file_events` | Append-only audit trail for file lifecycle and handoff actions |
| `quote_takeoff_jobs` (extended) | AI processing job, now with nullable `quote_id` for pre-quote flows |
| `quote_takeoff_results` (extended) | Full contract JSON stored alongside existing sparse measurement rows |
| `eliteos-quote-files` bucket | Private Supabase Storage bucket (not yet created — draft only) |
| `buildQuoteFileStoragePath()` | Pure helper for deterministic storage path construction |
| `sanitizeStorageFilename()` | Pure filename sanitizer (path traversal prevention) |

**Status (2026-06-01):** SQL draft written, not applied. Bucket not created. No upload UI. No Supabase writes.

---

## Durable decisions

See `FEATURE_DECISIONS.md` entries **48** (contract-first, AI-not-authority), **49** (quote files storage architecture), and **50** (provider-neutral extraction layer, AI output never authoritative, raw PDFs not committed).
