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

## v5.3: Extraction debug panel + run history (2026-06-02)

**Status:** Built.

### Goal

The benchmark panel (v5.2) revealed that AI extraction results vary dramatically across runs — the same hand sketch benchmark 001 has produced outputs ranging from 76.97 CT / 0 BS to 68.41 CT / 1.04 BS to 48.97 CT / 0 BS, while the estimator target is 78 CT / 4 BS. Before tuning prompts or models further, we need a layer to **understand** why results vary, not just that they do.

v5.3 adds:
- **Run history** — a persistent, queryable list of all AI extraction attempts for a workspace.
- **Run metadata** — every stored result now carries `promptVersion`, `modelUsed`, and a timestamp in a `_meta` envelope injected into `raw_ai_result_json`.
- **Debug view** — a collapsed panel showing the full normalized JSON, computed measurements, validation diagnostics, and import plan for the current loaded result.
- **Regression comparison** — the run history panel shows CT/BS deltas versus the currently loaded run so the estimator can see relative quality at a glance.

### What v5.3 adds

**Backend: `takeoffExtractionService.mjs`** changes:
- `raw_ai_result_json` now stores a `_meta` envelope: `{ promptVersion, modelUsed, savedAt }` alongside the AI's raw output. No schema change needed — `_meta` is a reserved prefix in the stored JSON.
- Response now includes `resultRowId` (the `quote_takeoff_results.id` for the run, or null if the NOT NULL fallback triggered).

**Backend: `takeoffWorkspaceService.mjs`** new exports:
- `listTakeoffResults({ supabase, organizationId, takeoffJobId })` — returns up to 20 safe run summaries (no full JSON, no storage_path). Extracts `promptVersion`/`modelUsed` from `_meta`. Falls back to `result_summary` when no table rows exist.
- `getResultById({ supabase, organizationId, takeoffJobId, resultId })` — loads a specific result by ID with fresh server-side recompute.

**Backend: `takeoffWorkspaceRoutes.js`** new endpoints:
- `GET /api/takeoff-jobs/:id/results` — list safe run summaries.
- `GET /api/takeoff-jobs/:id/results/:resultId` — load a specific result in full (registered after `/results/latest` to avoid Express route collision).

**Frontend: `TakeoffRunHistoryPanel.tsx`** (new):
- Fetches run history on mount and after each new extraction (`refreshKey` prop).
- Shows a compact table: timestamp, prompt version, model, CT sf, BS sf (with `+/- X sf` delta vs currently loaded run, color-coded), warning count, "Load" button.
- "Load this run" fetches the full result by ID and calls `onLoadRun` to restore it into the review UI.
- "Loaded ✓" indicator marks the currently active run.

**Frontend: `TakeoffDebugPanel.tsx`** (new):
- Collapsed `<details>` element, always rendered but hidden by default.
- Four sections with Copy buttons: normalized TakeoffResult JSON, computed measurements, validation diagnostics, import plan.
- Internal Lab only — not shown in Internal Estimate or Quote Library.

### Current known benchmark results (hand sketch benchmark 001)

| Run | Prompt | CT sf | BS sf | Target CT | Target BS | CT delta | BS delta |
|-----|--------|-------|-------|-----------|-----------|----------|----------|
| v5 run 1 | v1 | 76.97 | 0.00 | 78 | 4 | -1.03 | -4.00 |
| v5 run 2 | v2 | 68.41 | 1.04 | 78 | 4 | -9.59 | -2.96 |
| Later run | v2 | 48.97 | 0.00 | 78 | 4 | -29.03 | -4.00 |

The best observed CT result (76.97 sf) was close to target (78 sf), but has not been reproduced consistently. Backsplash remains unreliable across all runs.

### Import gate (unchanged)

Import into Internal Estimate remains blocked until:
1. The hand sketch benchmark 001 passes consistently (CT and BS within ±2 sf) across at least two consecutive extraction runs.
2. A human estimator reviews and approves the extraction result.
3. No regressions against the benchmark are introduced by prompt/model changes.

### Tests

```bash
npm run eos:test:takeoff-workspace-service  # includes 9 new tests for listTakeoffResults + getResultById
npm run eos:test:takeoff-extraction-service # includes 2 new tests for resultRowId + _meta
```

---

## v5.4: Page inventory + targeted extraction pass (2026-06-02)

**Status:** Built.

### Goal

Improve AI extraction accuracy and consistency by splitting the extraction into a **two-step workflow**:

1. **Page inventory pass** — classify each page (hand sketch, email, elevation, etc.), identify which pages contain measurement dimensions, and pre-extract visible dimension labels and notes as evidence.
2. **Targeted extraction pass** — run the full TakeoffResult extraction using the page inventory as context: tell the model which pages to focus on and provide the pre-classified dimension evidence as hints.

**Why this matters:** The same benchmark PDF has produced wildly inconsistent results (76.97 → 68.41 → 48.97 CT sf). The root cause is that a messy multi-page PDF (plan + email + elevation) causes the model to draw measurements from wrong pages, or focus on only part of a page, on each run. The inventory pass anchors the extraction to the correct page.

### What v5.4 adds

**New files:**
- `backend-core/src/takeoff/takeoffPageInventoryPrompt.mjs` — system prompt + user message for the classification pass. Includes `INVENTORY_PROMPT_VERSION = "v1"`.
- `backend-core/src/takeoff/takeoffPageInventoryService.mjs` — `runPageInventory()` service. Calls the OpenAI Responses API with the inventory prompt, parses `PageInventory` JSON, normalizes `recommendedMeasurementPages` / `pagesToIgnore`. Injectable `providerFn` for mocked tests.
- `backend-core/src/takeoff/takeoffPageInventoryService.test.mjs` — 10 tests covering parse success, parse failure, empty pages, provider capture, error propagation, and no-pricing/no-mutation guarantee.
- `app-ai-takeoff/src/components/TakeoffPageInventoryPanel.tsx` — Lab-internal UI panel showing per-page classification (type badge, relevance, CT dims, BS notes, summary) and expandable dimension/note evidence.

**Modified files:**
- `backend-core/src/takeoff/takeoffExtractionService.mjs`:
  - Added `inventoryProviderFn` parameter (injectable for testing).
  - After file download, runs `runPageInventory()` before the main extraction call.
  - Inventory failure is **non-fatal** — extraction continues without context.
  - Passes `pageInventory` to the provider call.
  - Stores `pageInventory` in `raw_ai_result_json._meta.pageInventory`.
  - Returns `pageInventory` in the response.
  - Existing tests (1–20) unaffected: they provide `providerFn` without `inventoryProviderFn`, so the inventory step is skipped automatically.
- `backend-core/src/takeoff/takeoffExtractionPrompt.mjs`:
  - Bumped `PROMPT_VERSION = "v3"` (user message now includes inventory context section).
  - `buildUserMessage()` now accepts optional `pageInventory` parameter and formats recommended pages, visible dimensions, and notes as a guidance section.
- `backend-core/src/takeoff/openAiTakeoffProvider.mjs`:
  - Added `pageInventory = null` parameter, passed to `buildUserMessage`.
- `backend-core/src/takeoff/takeoffWorkspaceService.mjs`:
  - `getResultById` now returns `pageInventory: meta.pageInventory ?? null` from `_meta`.
- `app-ai-takeoff/src/TakeoffLabApp.tsx`:
  - New `pageInventory` state. Updated after both new AI extraction (`handleAiDraftGenerated`) and historical run load (`handleLoadHistoricalRun`).
  - `TakeoffPageInventoryPanel` rendered conditionally below the Benchmark panel.
  - `pageInventory` passed to `TakeoffDebugPanel` for the JSON debug section.
- `app-ai-takeoff/src/components/TakeoffDebugPanel.tsx`:
  - Optional `pageInventory` prop; adds "Page inventory JSON" section with Copy button when present.
- `app-ai-takeoff/src/components/TakeoffRunHistoryPanel.tsx`:
  - `onLoadRun` callback now includes `pageInventory` from `getResultById`.
- `app-ai-takeoff/src/components/TakeoffPlanFileSection.tsx`:
  - `onAiDraftGenerated` meta type includes `pageInventory?: object | null`.
- `app-ai-takeoff/src/styles.css`:
  - Added comprehensive `inv-*` CSS rules for the page inventory panel.

### PageInventory schema (from `takeoffPageInventoryPrompt.mjs`)

```json
{
  "schemaVersion": "1.0",
  "pages": [
    {
      "pageNumber": 1,
      "pageType": "hand_sketch | cabinet_plan | elevation | email_context | rendering | spec | floor_plan | irrelevant | unknown",
      "measurementRelevance": "high | medium | low | none",
      "orientation": "upright | rotated_90 | ...",
      "containsCountertopDimensions": true,
      "containsBacksplashNotes": true,
      "containsCutoutNotes": false,
      "containsMaterialColorNotes": false,
      "summary": "...",
      "visibleDimensions": [{ "label": "Island", "value": "108 x 56", "unit": "in", "confidence": "high", "rawText": "..." }],
      "visibleNotes": [{ "text": "4\" B/S", "category": "backsplash", "confidence": "high" }],
      "recommendedForTakeoff": true,
      "reviewNotes": []
    }
  ],
  "recommendedMeasurementPages": [1],
  "pagesToIgnore": [2],
  "overallNotes": []
}
```

### Two-step extraction flow

```
Upload plan file
  → runPageInventory()     ← first AI call (classification)
  → pageInventory          ← recommended pages, dimension evidence
  → runAiTakeoffExtraction() ← second AI call (structured extraction with inventory context)
  → TakeoffResult + pageInventory stored in _meta
```

### Inventory context injected into extraction prompt (v3)

When inventory succeeds, the extraction user message includes:

```
── PAGE INVENTORY CONTEXT (from prior classification pass) ──
Recommended measurement page(s): 1
Pages to ignore (email/context only): 2
Pre-classified visible dimensions:
  Page 1 · Island: 108 x 56 in (high confidence)
  Page 1 · Sink wall: 91.5 in (high confidence)
Pre-classified visible notes:
  Page 1 · [backsplash] "4" B/S" (high confidence)
Instructions:
  - Focus extraction on the recommended page(s).
  - Do NOT treat email/context pages as measurement sources.
  - Use pre-classified dimensions as hints — confirm against the plan.
  - If extraction differs from hints, add a review note.
```

### Inventory failure handling

If the inventory AI call fails (network error, API timeout, parse failure), extraction proceeds without context. `pageInventory` is `null` in the response and `_meta`. A warning is logged server-side. This prevents inventory failures from blocking the extraction.

### Tests added

```bash
npm run eos:test:takeoff-page-inventory      # 10 new tests
npm run eos:test:takeoff-extraction-service  # +4 new tests (21–24), test 17 updated to v3
```

### Import gate (unchanged)

Import into Internal Estimate remains blocked until:
1. The hand sketch benchmark 001 passes consistently (CT and BS within ±2 sf) across at least two consecutive extraction runs.
2. A human estimator reviews and approves the extraction result.
3. No regressions against the benchmark are introduced by prompt/model changes.

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

---

## v5.5: Dimension evidence table + cutout handling rules (2026-06-02)

**Goal:** Force a dimension-first extraction step to prevent the model from missing or shrinking countertop pieces on messy hand sketches. Also enforce the business rule that sink/cooktop cutouts must never reduce material square footage.

**Motivation:** v5.4 page inventory improved page selection, but the final takeoff was still missing major pieces. A hand-sketch run computed 44.99 sf CT / 3.07 sf BS vs. estimator target 78 CT / 4 BS. The three-step flow (inventory → evidence → extraction) anchors the final extraction to a pre-verified dimension table.

### New files

| File | Purpose |
|---|---|
| `takeoffDimensionEvidencePrompt.mjs` | System prompt + user message for dimension evidence extraction pass |
| `takeoffDimensionEvidenceService.mjs` | Service that runs the second-pass dimension evidence extraction |
| `takeoffDimensionEvidenceService.test.mjs` | 10 mocked unit tests |
| `TakeoffDimensionEvidencePanel.tsx` | React UI panel showing extracted dimensions, notes, cutouts |

### Modified files

| File | Change |
|---|---|
| `takeoffContract.mjs` | Added `CUTOUT_IN_EXCLUSIONS_WARNING` diagnostic code; added `cutouts?: []` optional field to `TakeoffArea` |
| `takeoffValidator.mjs` | Fires `CUTOUT_IN_EXCLUSIONS_WARNING` when an exclusion label contains sink/cooktop/faucet/cutout/undermount |
| `takeoffExtractionPrompt.mjs` | Bumped to **v4**; added `_buildEvidenceContextSection()` that formats dimension evidence table into the user message; updated cutout/exclusions rule in system prompt |
| `openAiTakeoffProvider.mjs` | Accepts `dimensionEvidence` parameter; passes to `buildUserMessage` |
| `takeoffExtractionService.mjs` | Added `dimensionEvidenceProviderFn` param; new step 6b runs evidence after inventory; stores `dimensionEvidence` in `_meta`; returns `dimensionEvidence` in response |
| `takeoffWorkspaceService.mjs` | `getResultById` extracts `dimensionEvidence` from `_meta` and returns it |
| `takeoffExtractionService.test.mjs` | Added tests 25–28; updated test 17 to expect v4 |
| `takeoff.contract.test.mjs` | Added tests T and U for `CUTOUT_IN_EXCLUSIONS_WARNING` |
| `TakeoffDebugPanel.tsx` | Accepts `dimensionEvidence` prop; adds "Dimension evidence JSON" section |
| `TakeoffPlanFileSection.tsx` | Passes `dimensionEvidence` in `onAiDraftGenerated` callback |
| `TakeoffRunHistoryPanel.tsx` | Passes `dimensionEvidence` in `onLoadRun` callback |
| `TakeoffLabApp.tsx` | Manages `dimensionEvidence` state; renders `TakeoffDimensionEvidencePanel` |
| `styles.css` | Added `ev-*` CSS for evidence panel |
| `package.json` | Added `eos:test:takeoff-dimension-evidence` script |

### DimensionEvidence schema v1.0

```json
{
  "schemaVersion": "1.0",
  "evidencePromptVersion": "v1",
  "sourcePages": [1],
  "dimensions": [
    {
      "id": "dim-1",
      "pageNumber": 1,
      "label": "Island top",
      "rawText": "108 x 56",
      "lengthIn": 108,
      "depthIn": 56,
      "confidence": "high",
      "category": "countertop_run",
      "interpretationNotes": []
    }
  ],
  "notes": [
    { "pageNumber": 1, "text": "4\" B/S standard", "category": "backsplash", "confidence": "high" }
  ],
  "cutouts": [
    { "pageNumber": 1, "type": "sink", "label": "Sink cutout", "confidence": "high", "notes": [] }
  ],
  "uncertainItems": [],
  "reviewRequired": false
}
```

### Three-step extraction flow (v5.5)

```
1. Page inventory pass    → classifies pages; identifies measurement vs context pages
2. Dimension evidence pass → extracts all labeled dimensions, notes, cutouts as evidence table
3. Final extraction pass   → builds TakeoffResult using evidence table as primary source
```

Each step is non-fatal. If inventory or evidence fails, the extraction proceeds without that context rather than blocking the job.

### Cutout handling business rule

- **Sink/cooktop/faucet cutouts are fabrication operations, not material exclusions.**
- They must never appear in `area.exclusions[]`.
- They must never reduce material square footage.
- They are recorded in `area.cutouts[]` (new optional field) or `area.notes[]`.
- The extraction system prompt now explicitly forbids cutouts in exclusions.
- The validator fires `CUTOUT_IN_EXCLUSIONS_WARNING` (warning level) when an exclusion label contains sink, cooktop, faucet, cutout, or undermount.

### Evidence context injection (v4 prompt)

The dimension evidence table is formatted into the extraction user message as:

```
── DIMENSION EVIDENCE TABLE (from dimension extraction pass) ─────────────────
IMPORTANT: Build TakeoffResult runs primarily from this pre-extracted evidence.
Do NOT invent dimensions that are not in this table.
Do NOT put cutouts/sink/cooktop/faucet in area.exclusions[].

Extracted dimensions (create one run per dimension where applicable):
  [dim-1] Island top · 108 × 56 in · countertop_run · high confidence · page 1 — raw: "108 x 56"

Extracted notes:
  [backsplash] "4\" B/S standard" · high · page 1

Cutouts identified (add to notes[], NOT to exclusions[]):
  [sink] Sink cutout · high confidence · page 1

Rules for using this evidence table:
  1. For each dimension with both lengthIn and depthIn: create a TakeoffRun.
  2. For dimensions with depthIn=null: apply standard depth + add to assumptions[].
  ...
─────────────────────────────────────────────────────────────────────────────
```

---

## v5.6: Visible reference total reconciliation + evidence coverage warnings

**Status:** Built (2026-06-02)

### Goal

Make visible estimator reference totals first-class evidence; warn when evidence dimensions are not converted into final runs.

### Motivation

Even with 3-step extraction, the final `TakeoffResult` was ignoring visible sqft callouts written directly on plans — annotations like "50 sq' no b/s" or "4\" BSP = 6 sq'" that represent an estimator's own measured totals. Reference benchmarks 002–004 showed mismatches of 5–14 sf between these visible totals and what the AI extracted. `referenceTotals` makes those callouts a first-class reconciliation signal.

### New files

| File | Purpose |
|---|---|
| `backend-core/src/takeoff/takeoffEvidenceCoverage.mjs` (NEW) | Pure helper — `compareDimensionEvidenceToTakeoffRuns(dimensionEvidence, takeoffResult)` returns `{ unusedDimensions, coveredCount, totalHighConfidenceCount }`. Matches runs within ±5″ tolerance. |

### Modified files

| File | Change |
|---|---|
| `takeoffDimensionEvidencePrompt.mjs` | Bumped to **v2**; added `referenceTotals[]` schema and extraction rules |
| `takeoffDimensionEvidenceService.mjs` | Normalizes `referenceTotals` array |
| `takeoffContract.mjs` | Added 5 new diagnostic codes: `REFERENCE_TOTAL_COUNTERTOP_MISMATCH`, `REFERENCE_TOTAL_BACKSPLASH_MISMATCH`, `REFERENCE_TOTAL_COMBINED_MISMATCH`, `REFERENCE_TOTAL_NO_BS_CONFLICT`, `EVIDENCE_DIMENSION_NOT_USED` |
| `takeoffValidator.mjs` | Added optional third param `dimensionEvidence = null`; reference total reconciliation checks (tolerances: CT ±2 sf, BS ±1 sf, combined ±2 sf); evidence coverage check using `compareDimensionEvidenceToTakeoffRuns` |
| `takeoffExtractionPrompt.mjs` | Bumped to **v5**; added reference totals section in `_buildEvidenceContextSection` showing visible reference totals + reconciliation instructions |
| `takeoffExtractionService.mjs` | Passes `dimensionEvidence` as third arg to `validateTakeoffResult` |
| `takeoffBenchmark.mjs` | Added 4 reference benchmarks: `REFERENCE_BENCHMARK_001` (31 CT / 0 BS), `REFERENCE_BENCHMARK_002` (53 CT / 6 BS), `REFERENCE_BENCHMARK_003` (49 CT / 0 BS), `REFERENCE_BENCHMARK_004` (50 CT / 0 BS) |
| `TakeoffDimensionEvidencePanel.tsx` | Added `EvidenceReferenceTotal` type, `referenceTotals?` to `DimensionEvidence`, optional `computed` and `validation` props; shows reference totals table with reconciliation (CT ref vs computed delta, BS ref vs computed delta, pass/needs review badge); shows coverage warnings section for `EVIDENCE_DIMENSION_NOT_USED` diagnostics |
| `styles.css` | Added reference totals and coverage warning styles |

### `referenceTotals` schema

Reference totals are visible sqft callouts written on the plan by the estimator — e.g. "50 sq'", "50 sq' no b/s", "Kitchen 49 / NO BS", "4\" BSP = 6 sq'", "Reception Desk 31 sq'".

```json
{
  "id": "ref-1",
  "pageNumber": 1,
  "rawText": "50 sq' no b/s",
  "label": "Kitchen total",
  "countertopSf": 50,
  "backsplashSf": null,
  "combinedSf": null,
  "noBacksplash": true,
  "backsplashHeightIn": null,
  "confidence": "high",
  "notes": []
}
```

Fields: `id`, `pageNumber`, `rawText`, `label?`, `countertopSf?`, `backsplashSf?`, `combinedSf?`, `noBacksplash?`, `backsplashHeightIn?`, `confidence`, `notes?`.

**Reference totals are NOT final pricing authority.** They are high-priority reconciliation evidence. The eliteOS deterministic calculator (`computeTakeoffMeasurements`) remains authoritative for all pricing. Reference totals are stored in `dimensionEvidence.referenceTotals[]` (in `raw_ai_result_json._meta.dimensionEvidence`).

### Four-step extraction flow (v5.6)

```
1. Page inventory pass        → classifies pages; identifies measurement vs context pages (v5.4)
2. Dimension evidence pass    → extracts all labeled dimensions, notes, cutouts, referenceTotals (v5.5/v5.6)
3. Final extraction pass      → builds TakeoffResult; receives reference totals; adds reconciliation
                                 instructions to the prompt (v5.6)
4. Validator reconciliation   → fires REFERENCE_TOTAL_*_MISMATCH and EVIDENCE_DIMENSION_NOT_USED
   + coverage checks            warnings (v5.6)
```

Each step is non-fatal. Failures in earlier steps degrade gracefully without blocking the final extraction.

### New diagnostic codes (v5.6)

| Code | Severity | Trigger |
|---|---|---|
| `REFERENCE_TOTAL_COUNTERTOP_MISMATCH` | warning | Visible CT ref total differs from computed CT by > ±2 sf |
| `REFERENCE_TOTAL_BACKSPLASH_MISMATCH` | warning | Visible BS ref total differs from computed BS by > ±1 sf |
| `REFERENCE_TOTAL_COMBINED_MISMATCH` | warning | Visible combined ref total differs from computed combined by > ±2 sf |
| `REFERENCE_TOTAL_NO_BS_CONFLICT` | warning | Ref total says no backsplash but computed BS > 0 |
| `EVIDENCE_DIMENSION_NOT_USED` | warning | High-confidence dimension from evidence pass has no matching run in TakeoffResult (±5″ tolerance) |

### Prompt versions

- `EVIDENCE_PROMPT_VERSION` = `"v2"` (added `referenceTotals[]` extraction)
- `PROMPT_VERSION` = `"v5"` (reference totals injected into evidence context section)

---

## v5.7: Sanitized benchmark evaluator foundation

**Status:** Built (2026-06-02)

### Goal

Make AI Takeoff measurable by providing a deterministic evaluator that scores each AI run against known truth fixtures and classifies why a run failed. AI results are inconsistent across real plan types; this slice replaces "does it look right?" manual QA with structured, repeatable scoring.

### Motivation

Real-plan testing showed that even simple reference plans produce different results across AI runs. Without a structured evaluator:
- We cannot know if a prompt change improved or regressed extraction.
- We cannot classify whether a failure was a geometry issue, a backsplash classification issue, or a reference total reconciliation issue.
- We cannot gate the import path on meaningful accuracy criteria.

### New and modified files

| File | Change |
|------|--------|
| `takeoffBenchmark.mjs` | Expanded 4 reference fixtures (A–D) to full v5.7 schema + 6 new fixtures (E–J). All 10 fixtures include `category`, `planType`, `truthConfidence`, `expectedStatus`, `expectedStandardBacksplashSf`, `toleranceCountertopSf`, `toleranceBacksplashSf`, `expectedNoBacksplash`, `expectedBacksplashType`, `reviewGateReasons`. Source PDFs remain private. |
| `takeoffBenchmarkEvaluator.mjs` | NEW — pure function evaluator. Exports `evaluateTakeoffBenchmark(...)`. Scores computed totals vs fixture, classifies failure category, enforces review gates. |
| `takeoffBenchmarkEvaluator.test.mjs` | NEW — 17 tests covering all failure categories and boundary conditions. |
| `TakeoffBenchmarkPanel.tsx` | Preset buttons for all reference benchmarks. Rich evaluator output section with recommendation badge, failure category, reference totals status, evidence coverage, validator failures. |
| `TakeoffLabApp.tsx` | Passes `dimensionEvidence` and `validation` to `TakeoffBenchmarkPanel`. |
| `styles.css` | New preset button styles + rich evaluator output styles. |

### Benchmark fixture schema (v5.7)

Each fixture includes:

```javascript
{
  benchmarkId, label, category, planType,
  truthConfidence: "high" | "medium" | "low",
  expectedStatus: "auto_pass" | "review_required",
  expectedCountertopSf,
  expectedStandardBacksplashSf,
  expectedHighBacksplashSf?,        // optional (high 10" or 12" backsplash area)
  expectedFullHeightBacksplashSf?,  // optional (full-height backsplash)
  expectedCombinedSf?,
  expectedNoBacksplash?,
  expectedBacksplashType?,          // "none" | "standard_4in" | "high_backsplash" | "full_height" | "mixed"
  toleranceCountertopSf,
  toleranceBacksplashSf,
  visibleReferenceTotals?,
  expectedAreaBuckets?,
  importantExpectedDimensions?,
  knownFailureModes,
  reviewGateReasons?,
  notes,
}
```

### Evaluator output

```javascript
{
  benchmarkId, label, category, expectedStatus,
  finalRecommendation: "auto_pass" | "review_required" | "fail",
  failureCategory: "none" | "cutout_deduction_violation" | "extraction_failure" |
    "backsplash_classification_failure" | "geometry_failure" |
    "reference_reconciliation_failure" | "mixed_area_scope_failure" |
    "evidence_coverage_failure" | "review_gate_failure",
  countertop: { expectedSf, computedSf, deltaSf, errorPercent, pass },
  standardBacksplash: { ... },
  highBacksplash?: { expectedSf, note: "cannot decompose" },  // informational
  fullHeightBacksplash?: { expectedSf, note: "cannot decompose" },
  combined: { ... },
  referenceTotals: { expectedCaptured, captured, noBacksplashCorrect, mismatchWarnings[] },
  evidenceCoverage: { unusedHighConfidenceDimensions, pass },
  reviewGate: { expectedReviewRequired, modelAttemptedAutoPass, pass },
  validatorFailures: [],
  notes: [],
}
```

### Failure category logic (priority order)

1. **`cutout_deduction_violation`** — `CUTOUT_IN_EXCLUSIONS_WARNING` in diagnostics
2. **`extraction_failure`** — computed CT = 0 when fixture expects > 0
3. **`backsplash_classification_failure`** — invented BS on no-BS plan, or expected BS > 0 but computed = 0, or `REFERENCE_TOTAL_NO_BS_CONFLICT`
4. **`geometry_failure`** — CT pct error > 10%
5. **`reference_reconciliation_failure`** — any `REFERENCE_TOTAL_*` in diagnostics
6. **`mixed_area_scope_failure`** — FHBS or high BS expected, total BS mismatched
7. **`evidence_coverage_failure`** — `EVIDENCE_DIMENSION_NOT_USED` in diagnostics
8. **`review_gate_failure`** — fixture requires review, nothing else wrong
9. **`none`** — all checks pass

### Final recommendation rules

- **`fail`**: cutout deduction, extraction failure, invented BS on no-BS plan, CT pct error > 10%
- **`review_required`**: fixture `expectedStatus = review_required` (always), moderate failures
- **`auto_pass`**: all metrics within sf tolerance AND fixture `expectedStatus = auto_pass` AND no critical diagnostics

### Important invariants

- AI output remains **evidence, not authority**. Raw AI totals are never used for scoring.
- Source PDFs remain private — never committed to repo.
- Import path remains **blocked** until at minimum ref-001, ref-003, ref-004, clean-rect-001 consistently `auto_pass` in live runs.
- `expectedHighBacksplashSf` and `expectedFullHeightBacksplashSf` are informational in the evaluator output — `computedMeasurements.backsplashExactSf` cannot be decomposed into bucket types without structured AI output per bucket.

### Known benchmark categories (A–J)

| Fixture | Expected CT | Expected BS | Status |
|---------|-------------|-------------|--------|
| ref-001 — Simple written-reference desk | 31 | 0 (no BS) | auto_pass |
| ref-002 — Kitchen with 4" backsplash | 53 | 6 | review_required |
| ref-003 — No-backsplash kitchen | 49 | 0 (no BS) | auto_pass |
| ref-004 — No-backsplash sketch | 50 | 0 (no BS) | auto_pass |
| clean-rect-001 — Clean rectangle geometry | ~78 | 0 | auto_pass |
| waterfall-001 — Waterfall/stepped shape | ~76.3 | 0 | review_required |
| mixed-fhbs-001 — CT + standard BS + FHBS | 62 | 51 (11+40) | review_required |
| high-bs-001 — High BS + mixed area | 132 | ~23.2 | review_required |
| messy-email-001 — Messy email + sketch | unknown | unknown | review_required |
| multi-page-001 — Multi-page cabinet packet | unknown | unknown | review_required |

---

## v5.8: Automatic QA gate + estimator-friendly review mode

**Status:** Built (2026-05-31)

### Goal

Make AI Takeoff easier to use by automatically interpreting the existing diagnostics and evaluator data, then surfacing a clear estimator-facing QA result after every AI draft. The user should not need to inspect JSON, choose benchmark presets, or manually diagnose every warning.

### New file

| File | Purpose |
|---|---|
| `backend-core/src/takeoff/takeoffQaGate.mjs` | Pure QA gate evaluator — no I/O, no DB, no AI, no pricing |
| `backend-core/src/takeoff/takeoffQaGate.test.mjs` | 15 unit tests for the QA gate |
| `app-ai-takeoff/src/components/TakeoffQaGatePanel.tsx` | Estimator-facing QA result card |

### QA gate statuses

| Status | Severity | When |
|---|---|---|
| `ready_for_review` | green | No critical issues, structured runs captured, no significant mismatch |
| `needs_review` | yellow | Issues found (unused dims, moderate mismatch, BS not structured, etc.) |
| `do_not_import` | red | Critical issues: validation errors, large CT mismatch, cutout in exclusions, no-BS conflict, no measurement pages, 2+ unused dimensions |

**Import is always blocked in v5.8 regardless of QA status.** Best possible status is `ready_for_review`, not approved or importable.

### QA gate return shape

```js
{
  status:              "ready_for_review" | "needs_review" | "do_not_import",
  severity:            "green" | "yellow" | "red",
  headline:            string,
  summary:             string,
  topIssues: [{
    code, label, severity: "info"|"warning"|"critical",
    message, recommendedAction, source
  }],
  positiveSignals:     string[],
  reviewChecklist:     string[],
  importBlockedReason: string | null,
}
```

### Issue escalation rules (priority order)

1. `validationDiagnostics.hasErrors` → critical → `do_not_import`
2. No rooms/runs extracted (CT = 0) → critical → `do_not_import`
3. `CUTOUT_IN_EXCLUSIONS_WARNING` → critical → `do_not_import`
4. `EVIDENCE_DIMENSION_NOT_USED` × 2+ → critical → `do_not_import`
5. `REFERENCE_TOTAL_COUNTERTOP_MISMATCH` with pct error > 10% → critical → `do_not_import`
6. `REFERENCE_TOTAL_NO_BS_CONFLICT` → critical → `do_not_import`
7. `NO_MEASUREMENT_PAGES` (page inventory has pages but none are measurement pages) → critical → `do_not_import`
8. Benchmark `finalRecommendation === "fail"` → critical → `do_not_import`
9. `EVIDENCE_DIMENSION_NOT_USED` × 1 → warning → `needs_review`
10. `REFERENCE_TOTAL_COUNTERTOP_MISMATCH` pct ≤ 10% → warning → `needs_review`
11. `REFERENCE_TOTAL_BACKSPLASH_MISMATCH` → warning → `needs_review`
12. `AI_BACKSPLASH_TOTAL_NOT_STRUCTURED` → warning → `needs_review`

### Positive signals

- No validation errors
- Structured runs captured with CT > 0
- Reference totals present and reconciled (no mismatch diagnostics)
- All high-confidence dimensions used
- No-backsplash correctly recognized (BS = 0 when plan says no BS)
- Measurement pages identified in page inventory

### Backend integration

- `takeoffExtractionService.mjs` calls `evaluateTakeoffQaGate` after validation; stores result in `_meta.qaGate` and returns `qaGate` in the API response.
- `takeoffWorkspaceService.mjs` `getResultById` recomputes the QA gate from fresh data when loading historical runs.

### Frontend integration

- `TakeoffLabApp.tsx` computes `qaGate` as a `useMemo` from `activeState`, `dimensionEvidence`, and `pageInventory` — always current, reacts to edits.
- `TakeoffQaGatePanel` is placed directly below Measurement Summary, above Validation diagnostics.
- Existing debug/benchmark panels remain, visually demoted.

### Start New Takeoff (v5.8)

- A "↩ Start new takeoff" button appears in the hero pill area whenever a workspace is active (`takeoffJobId` is set).
- Clicking it removes `?takeoffJobId=` from the URL via `history.pushState` and resets all workspace state.
- If there are unsaved edits, a confirmation dialog is shown: "Start a new takeoff? This will leave the current workspace saved but clear it from the screen."
- No DB deletion — old data is still accessible by reopening the original URL.

---

## Deployment: AI Takeoff Lab as a protected head (takeoff.eliteosfab.com)

**Status:** Deployed (2026-05-31)

### Head registration

The AI Takeoff Lab is registered as a first-class eliteOS protected head with slug `ai_takeoff`:

| Property | Value |
|---|---|
| Slug | `ai_takeoff` |
| Label | AI Takeoff Lab |
| URL env | `HEAD_URL_AI_TAKEOFF=https://takeoff.eliteosfab.com` |
| Category | Revenue |
| Launcher visibility | admin / super_admin see it by default; other users need explicit `user_head_access` assignment |

All governance constants, launcher catalog, and deployment URL resolution are updated:
- `EOS_HEAD_SLUGS` in `eosGovernanceConstants.js`
- `HEAD_LAUNCHER_CATALOG` in `launcherHeads.js`
- `SLUG_TO_ENV_KEYS` in `headDeploymentUrls.js` (also adds it to CORS allowed origins automatically)

### Backend auth / head access

All takeoff API routes (`/api/takeoff-jobs/*`) require:
1. `requireAuth()` — valid Supabase Bearer token
2. `requireHeadAccess("ai_takeoff", ...)` — user must have `ai_takeoff` in their `actionableGrantSet`

Admin / super_admin users always pass the head access check. Non-admin users need the `ai_takeoff` slug explicitly assigned in `user_head_access` via System Admin.

The `headAccess` dep uses a safe no-op fallback in tests (where only `requireAuth` + `getSupabase` are injected), preserving existing test behavior.

### CORS

`https://takeoff.eliteosfab.com` is allowed by:
1. `*.eliteosfab.com` subdomain trust (active when `VERCEL_ENV=production` or `EOS_TRUST_ELITEOSFAB_SUBDOMAIN_ORIGINS=1`)
2. `collectHeadEnvOriginsForCors()` when `HEAD_URL_AI_TAKEOFF=https://takeoff.eliteosfab.com` is set

Local dev (`http://localhost:5186`) is covered by the `localhost:5173–5189` default range.

No wildcard CORS was added.

### Frontend auth

`app-ai-takeoff` already uses the eliteOS-standard patterns:
- `getSupabase()` with `buildEliteosSupabaseAuthOptions` from `@shared/eliteos-supabase`
- `resolveAccessToken()` for session refresh (120-second refresh window)
- Bearer token in `Authorization` header on all API calls
- Inline email/password sign-in form (same pattern as other eliteOS protected heads)
- User email displayed in topbar; sign-out button

No auth flow changes were needed.

### Frontend env vars

Frontend reads only Vite-safe variables. Production Vercel project should set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BACKEND_URL=https://backend-core-six.vercel.app
```

Never set `VITE_OPENAI_API_KEY`, `VITE_GEMINI_API_KEY`, or `VITE_SUPABASE_SERVICE_ROLE_KEY`.

### Vercel project setup

1. Create new Vercel project from the eOS monorepo.
2. Set **Root Directory** = `app-ai-takeoff`
3. Set **Framework** = Vite
4. **Build command**: `npm run build`
5. **Output directory**: `dist`
6. Add the three frontend env vars above.
7. Assign custom domain `takeoff.eliteosfab.com`.

### Cloudflare / DNS

Add a CNAME record:
- Name: `takeoff`
- Target: Vercel project's `cname.vercel-dns.com` (or as shown in Vercel domain settings)

### Backend Vercel env (backend-core project)

Add to the backend-core Vercel environment:

```env
HEAD_URL_AI_TAKEOFF=https://takeoff.eliteosfab.com

# AI Takeoff extraction (choose one provider):
TAKEOFF_AI_ENABLED=1
TAKEOFF_AI_PROVIDER=gemini            # or openai
GEMINI_TAKEOFF_MODEL=gemini-2.5-pro
GEMINI_API_KEY=<secret — set in Vercel env, never committed>
OPENAI_API_KEY=<secret — set in Vercel env, never committed>
```

### Supabase Auth

Ensure `https://takeoff.eliteosfab.com` is in the Supabase project's **Site URL** / **Redirect URLs** list under Authentication → URL Configuration. Add it alongside the other eliteOS head URLs.

The AI Takeoff Lab uses the same Supabase project and anon key as other eliteOS heads — no separate auth project is required.

---

## v5.9: Gemini provider test for PDF/vision extraction

**Status:** Built (2026-05-31)

### Overview

v5.9 adds Google Gemini as a swappable AI backend for the AI Takeoff Lab. The goal is to test whether Gemini performs better than OpenAI on PDF/vision countertop plan reading, using the existing benchmark evaluator and QA gate as objective scoring tools.

This is a provider/model comparison slice only. No import path was enabled and no pricing or quote data was touched.

### Provider selection

Set `TAKEOFF_AI_PROVIDER` in the server environment to choose the AI backend:

| `TAKEOFF_AI_PROVIDER` | Provider used |
|---|---|
| `openai` (default) | OpenAI `gpt-4o` (existing behavior unchanged) |
| `gemini` | Google Gemini `gemini-2.5-pro` (or `GEMINI_TAKEOFF_MODEL`) |
| _(anything else)_ | Backend error — startup rejected |

### Environment variables

For Gemini:
```env
TAKEOFF_AI_ENABLED=1
TAKEOFF_AI_PROVIDER=gemini
GEMINI_TAKEOFF_MODEL=gemini-2.5-pro
GEMINI_API_KEY=<your key — never commit>
```

For OpenAI (unchanged):
```env
TAKEOFF_AI_ENABLED=1
TAKEOFF_AI_PROVIDER=openai
TAKEOFF_AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
```

### Gemini provider behavior

- Uses the Gemini `generateContent` REST API (v1beta) via Node.js `fetch` — no npm package.
- Sends the PDF or image as inline base64 `inlineData` in the request body.
- Requests `responseMimeType: "application/json"` via `generationConfig`.
- Strips markdown code fences (`\`\`\`json ... \`\`\``) from the response as a safety measure — Gemini may return fences even when JSON mode is requested.
- Supports all three AI passes: page inventory, dimension evidence, and final TakeoffResult extraction, using the same prompts as the OpenAI provider (prompt versions unchanged).
- Returns `provider: "gemini"` and `modelUsed` (resolved model version from the API response) in every provider result.
- API key is **never** logged or returned to the frontend (it appears in the query string per Gemini's design — Gemini endpoints use `?key=...`).

### Run history / source pill

Every run now stores `provider` in the `_meta` envelope of `raw_ai_result_json`. The run history panel displays a colored source pill (green for `openai`, blue for `gemini`) next to the model name so it is immediately obvious which provider generated each historical run.

### Quality authority unchanged

Switching to Gemini does not change how AI output is evaluated. Regardless of provider:

1. eliteOS server **always recomputes** measurements from the AI-extracted rooms — AI totals are never used for pricing.
2. The **validator** runs reconciliation checks, reference total comparison, and coverage diagnostics.
3. The **benchmark evaluator** (`takeoffBenchmarkEvaluator.mjs`) scores the run against known truth fixtures.
4. The **QA gate** (`takeoffQaGate.mjs`) produces the final `ready_for_review / needs_review / do_not_import` verdict.
5. The **benchmark context** (v5.8.1) still turns the QA card red when the computed value diverges from a selected expected value — provider-agnostic.

The benchmark evaluator and QA gate are the source of truth for judging model quality across providers. AI output is always evidence, never authority.

### Files added / changed

| File | Change |
|---|---|
| `backend-core/src/takeoff/geminiTakeoffProvider.mjs` | **New** — Gemini provider for all 3 passes |
| `backend-core/src/takeoff/geminiTakeoffProvider.test.mjs` | **New** — 25 mocked tests |
| `backend-core/src/takeoff/takeoffAiProvider.mjs` | Add `gemini` to `SUPPORTED_PROVIDERS`; add `getInventoryProvider`, `getEvidenceProvider`; update `readExtractionConfig` for provider-aware key selection |
| `backend-core/src/takeoff/takeoffExtractionService.mjs` | Wire Gemini inventory/evidence providers; add `provider` to `_meta` envelope; provider-aware error message for missing API key |
| `backend-core/src/takeoff/takeoffWorkspaceService.mjs` | Expose `provider` from `_meta` in `listTakeoffResults` and `getResultById` |
| `app-ai-takeoff/src/components/TakeoffRunHistoryPanel.tsx` | Add `provider` field to `RunSummary`; display colored source pill in run history table |
| `app-ai-takeoff/src/styles.css` | Add `.run-history-provider-pill` styles (green for openai, blue for gemini) |
| `backend-core/.env.example` | Document all AI Takeoff env vars including Gemini block |
| `package.json` | Add `eos:test:takeoff-gemini-provider` script |

---

## v5.9.1: eliteOS shell alignment + session hydration fix

Deployed-head UX fix: `takeoff.eliteosfab.com` now renders the standard eliteOS protected-head shell and resolves the existing session from `.eliteosfab.com`-scoped cookies without prompting for sign-in again.

### Changes

**Auth hydration** — replaced `resolveAccessToken()` initial check with `supabase.auth.getSession()` + `onAuthStateChange` `applySession` pattern (matches Pricing Admin). Extracts `user_metadata.full_name/name/display_name` for display name. Session sharing via the shared `.eliteosfab.com` cookie requires `VITE_SUPABASE_URL` to match the same Supabase project as Home.

**Shell** — `div.shell` + `header.topbar` + `brand-row brand-row-link` (ESF logo → "eliteOS" wordmark → "AI Takeoff Lab · ESF") replacing standalone `lab-root`/`lab-topbar-*` CSS. Avatar dropdown (`topbar-account-wrap`) with user-menu (Open Home → `VITE_HEAD_URL_HOME`, Sign out) mirrors Pricing Admin/Quote Library.

**Sign-in panel** — `auth-panel auth-panel-standalone` matching the Pricing Admin sign-in pattern with `auth-panel-header`, `auth-panel-title`, `field-grid`, `btn.primary`.

**Hero** — `section.takeoff-hero` with `hero-aurora` background, `hero-eyebrow`, `hero-title`, `hero-sub`. Status pills shown only when signed in.

**JSON workbench** — wrapped in `<details class="lab-section-collapsible">`, collapsed by default, labeled "Developer / demo". Prevents it from appearing as the primary state for signed-in users.

**Footer** — `footer.footer-bar` appended after `</main>`.

### Impacted files (v5.9.1)

| File | Change |
|------|--------|
| `app-ai-takeoff/src/TakeoffLabApp.tsx` | Workspace helpers (`homeLauncherUrl`, `userInitialsFor`, etc.), auth `applySession` pattern, `userMetaName`/`userMenuOpen`/`userMenuRef` state, standard topbar + user-menu JSX, `auth-panel-standalone` sign-in panel, collapsible workbench, footer bar |
| `app-ai-takeoff/src/styles.css` | Remove `lab-root`/`lab-topbar-*`/`lab-hero-*`/`lab-main`. Add `shell`, `topbar`, `brand-row`, `brand-mark`, `brand-text`, `topbar-account-wrap`, `topbar-account`, `user-menu`, `takeoff-hero`, `hero-aurora`, `main`, `auth-panel-standalone`, `field-grid`, `btn`, `banner`, `footer-bar`, `lab-section-collapsible` |
| `app-ai-takeoff/src/vite-env.d.ts` | Add `VITE_HEAD_URL_HOME`, `VITE_ELITEOS_AUTH_COOKIE_DOMAIN` types |
| `app-ai-takeoff/.env.example` | Add `VITE_HEAD_URL_HOME`; document session-sharing prerequisite |

---

## v5.9.2: upload-first empty state + nonstandard depth QA + IE/QL UI alignment

Corrects the deployed `takeoff.eliteosfab.com` page to behave and look like an eliteOS head, not a standalone demo.

### Upload-first empty state

`sourceMode` initializes to `"none"` (new mode). All measurement sections (summary, QA gate, rooms, diagnostics, import preview, benchmark, debug) are gated on `hasActiveSource` (sourceMode !== "none") and are completely hidden until the user uploads a plan or explicitly loads the demo sample. Start New Takeoff now resets to `"none"` (empty upload-first state), not Spec 73.

### Spec 73 demo demotion

Spec 73 sample is only loadable via explicit click inside the JSON workbench (collapsed by default). When loaded, a yellow `demo-notice` banner appears: "Demo sample — not a real workspace." with a "Clear demo data" link. The 41" peninsula depth in the Spec 73 fixture is intentional test data and now correctly triggers `NONSTANDARD_DEPTH_ASSUMED` when the validator runs on it.

### NONSTANDARD_DEPTH_ASSUMED diagnostic (v5.9.2)

New `TAKEOFF_DIAGNOSTIC_CODE.NONSTANDARD_DEPTH_ASSUMED`. Fires in `takeoffValidator.mjs` on any `counter` run whose label matches `island|peninsula|raised bar|bar top|desk|waterfall|specialty` and whose depth exceeds 26". Standard 25.5" wall runs are NOT flagged. The `evaluateTakeoffQaGate` escalates this to `needs_review` (warning severity). Tests T24/T25 in `takeoffQaGate.test.mjs`.

### UI alignment with IE/QL

- Dark gradient hero removed → compact white `takeoff-page-sub` subheader with page title and description
- Token values aligned with IE/QL: `--r-lg:18px`, `--r-md:12px`, richer `--eos-shadow-sm`, IE/QL aurora radial-gradient body background
- Section spacing reduced (32px → 24px gap)
- `lab-card` no longer uses `overflow:hidden` to improve readability

### Impacted files (v5.9.2)

| File | Change |
|------|--------|
| `backend-core/src/takeoff/takeoffContract.mjs` | Add `NONSTANDARD_DEPTH_ASSUMED` code |
| `backend-core/src/takeoff/takeoffValidator.mjs` | Add nonstandard depth check in `validateRun` |
| `backend-core/src/takeoff/takeoffQaGate.mjs` | Add check 10b for `NONSTANDARD_DEPTH_ASSUMED` → warning |
| `backend-core/src/takeoff/takeoffQaGate.test.mjs` | Add T24 (NONSTANDARD_DEPTH_ASSUMED → needs_review), T25 (standard depth → no warning) |
| `app-ai-takeoff/src/TakeoffLabApp.tsx` | `sourceMode` init → `"none"`, `hasActiveSource`/`isDemoMode` derived, hero → compact subheader, content gated, demo notice, Start New Takeoff → empty state |
| `app-ai-takeoff/src/styles.css` | Remove dark hero; add `takeoff-page-sub`, `demo-notice`; update tokens to IE/QL values |

---

## v6.0: Evidence-first takeoff integrity — no silent geometry changes

Fixes the root cause of the Spec 73 geometry loss: the model was silently transforming correct dimension evidence (109.5", 34.5", 54", 100", 40", 23" depth, 90"×41" island) into an incorrect final TakeoffResult (24" right-of-stove, 23" depths everywhere, missing stove-wall spans).

### Core principle

Every final countertop run must be traceable to an extracted dimension evidence dimension. If no high-confidence evidence supports a run's length, the run is flagged. If a run's length differs from the nearest evidence by more than rounding tolerance, it is flagged as "changed." The QA gate escalates both conditions before any estimator review.

### New module: `takeoffEvidenceRunReconciliation.mjs`

Pure helper (no I/O, no DB, no AI). Input: `{ takeoffResult, dimensionEvidence }`. Output: `{ runLinks, unsupportedRuns, changedRuns, conflictingRuns, unusedHighConfidenceDimensions, cornerDeductionWarnings, diagnostics, checksRan }`.

**Verdict tiers:**
- `supported` — run length within ±1" of a high-confidence evidence dimension (same dim, rounding only)
- `changed` — nearest evidence is 1–10" away (model modified a dimension without explanation)
- `unsupported` — no evidence within ±10" (model invented this length)
- `exempt` — splash/fhb runs or no evidence available

**Standard depth exemption:** 25.5" (kitchen counter) and 21.5" (bathroom vanity) are always allowed without depth evidence.

### New diagnostic codes (v6.0)

| Code | When | Severity |
|------|------|----------|
| `RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE` | Run length >10" from all evidence | WARNING |
| `EVIDENCE_DIMENSION_CHANGED_IN_RUN` | Run length 1–10" from nearest evidence | WARNING |
| `CONFLICTING_DIMENSIONS_USED_SILENTLY` | Multiple evidence dims near a single run | WARNING |
| `UNSUPPORTED_CORNER_DEDUCTION` | cornerDeductions without L/U overlapMode | WARNING |
| `DRAFT_ASSEMBLY_REVIEW_REQUIRED` | run.requiresEstimatorReview === true | WARNING |
| `RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE` | (defined, not yet triggered) | WARNING |

### QA gate escalation

- 1 unsupported run → needs_review
- ≥2 unsupported runs → do_not_import (critical)
- Changed dims → needs_review
- Conflicting dims → needs_review
- Unsupported corner deduction → do_not_import (critical)
- AI-flagged review runs → needs_review

Positive signal: "All runs traceable to dimension evidence" added when no reconciliation issues found.

### Extraction prompt v6

- `PROMPT_VERSION` bumped to "v6"
- Every run must include `assemblyNotes` explaining which evidence dimension it used
- Optional `lengthEvidenceId`, `depthEvidenceId` fields in run (model cites evidence IDs)
- `requiresEstimatorReview: boolean` on run — model sets true when evidence conflicts
- Explicit instruction: do NOT silently pick between conflicting evidence; set review flag
- Explicit instruction: do NOT invent dimensions; cite evidence for every run

### UI: Evidence Trace panel

New "Evidence trace" section (below Dimension evidence, above Debug). Runs client-side (pure function via `@takeoff-core` alias). Shows:
- Summary bar: X supported / Y changed / Z unsupported / N evidence unused
- Per-run table: run label, length, depth, verdict badge (✓/⚠/✗), evidence reference
- Unused evidence list (high-confidence dims not matched by any run)
- Corner deduction warnings

### What doesn't change

- eliteOS recompute (takeoffMeasurementCalc.mjs) — unchanged
- Gemini/OpenAI provider routing — unchanged
- Import to Internal Estimate — remains disabled
- Pricing — untouched

### File changes

| File | Change |
|------|--------|
| `takeoffContract.mjs` | 6 new diagnostic codes; optional evidence trace fields added to TakeoffRun typedef + makeTakeoffRun factory |
| `takeoffEvidenceRunReconciliation.mjs` | New pure helper |
| `takeoffValidator.mjs` | Calls reconcileRunsWithEvidence after coverage check; emits new diagnostic codes |
| `takeoffQaGate.mjs` | 5 new QA gate checks (11a–11e); positive signal for clean reconciliation |
| `takeoffExtractionPrompt.mjs` | Bumped to v6; evidence traceability rules; schema example updated |
| `takeoffEvidenceRunReconciliation.test.mjs` | New — 18 test cases |
| `TakeoffEvidenceTracePanel.tsx` | New UI component |
| `TakeoffLabApp.tsx` | Import + render Evidence trace section |
| `styles.css` | CSS for `.et-*` evidence trace classes |
| `package.json` | `eos:test:takeoff-evidence-reconciliation` script |
| `takeoffExtractionService.test.mjs` | Updated PROMPT_VERSION assertion v5→v6 |

---

---

## v6.1: Takeoff Review Workbench + promoted review UI

*(see FEATURE_DECISIONS.md entry 61)*

---

## v6.2: Deterministic fabrication rules engine + Kelley rule fixture (2026-06-03)

**Status:** Built.

### Core principle

> Reference totals are evidence for comparison, not calculation authority.
> Estimator-reviewed structured runs are the source of truth.
> eliteOS recompute is authoritative. AI-provided totals are never authoritative.

### Motivation

The Kelley plan proof case exposed a failure mode where the AI tried to force geometry toward a written reference note ("50 sq' no b/s") rather than computing from visible dimensions. The estimator-reviewed result is ~39.91 sf / 0 backsplash — but the AI kept targeting 50 sf via assumed/reconciled geometry. v6.2 installs a deterministic rules engine that catches this class of error and makes the business rules machine-verifiable.

### New module: `takeoffFabricationRules.mjs`

Pure rules engine (no I/O, no DB, no AI, no pricing). Exports:
- `evaluateTakeoffFabricationRules({ takeoffResult, dimensionEvidence, validationDiagnostics, reviewState })`
- `classifyDepthEvidence(run, dimensionEvidence)`
- `shouldApplyCornerDeduction(area, excludedRunIds)`
- `classifyReferenceTotalUsage(takeoffResult)`
- `classifyBacksplashRule(takeoffResult, dimensionEvidence)`
- `classifyCutoutRule(takeoffResult)`
- `classifyInferredPieceRule(takeoffResult)`
- `classifyCornerDeductionRule(takeoffResult, reviewState)`
- `classifyNonstandardDepth(takeoffResult, dimensionEvidence)`

Returns findings: `{ code, level, message, path, recommendedAction, source: "fabrication_rule", ruleId }`

### Business rules encoded (A–G)

| Rule | Code | Level |
|------|------|-------|
| A — Reference total used as geometry target | `REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET` | warning |
| B — No-backsplash confirmed (positive) | `NO_BACKSPLASH_CONFIRMED` | info |
| B — Backsplash scope conflict | `BACKSPLASH_SCOPE_CONFLICT` | error/warning |
| C — Cutout deducted from material sf | `CUTOUT_DEDUCTED_FROM_MATERIAL` | error |
| D — Inferred duplicate piece | `INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED` | warning |
| E — Corner deduction with excluded/missing leg | `CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG` | warning |
| F — Nonstandard depth verified from evidence | `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE` | info |
| F — Nonstandard depth unsupported | `NONSTANDARD_DEPTH_UNSUPPORTED` | warning |

### Kelley reviewed rule fixture

New `KELLEY_REVIEWED_RULE_FIXTURE` in `takeoffBenchmark.mjs`:
- `expectedStatus: "review_required"`
- Expected countertop: 39.91 sf / backsplash: 0
- Visible reference: "50 sq' no b/s" — comparison evidence only
- Ambiguity: island 64 vs 69, "2 STOVE", excluded horizontal section
- Island 36" depth with evidence → VERIFIED, not unsupported
- Prevents system from blindly targeting 50 sf

### Validator changes (v6.2)

- `validateTakeoffResult` now calls `evaluateTakeoffFabricationRules` and merges findings into diagnostics.
- `validateRun` refined: `NONSTANDARD_DEPTH_ASSUMED` only fires when no depth evidence exists.
- When depth evidence IS present, the fabrication rules module emits `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE` (info) — the validator is silent.
- New codes added to `TAKEOFF_DIAGNOSTIC_CODE`: `REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET`, `NO_BACKSPLASH_CONFIRMED`, `BACKSPLASH_SCOPE_CONFLICT`, `CUTOUT_DEDUCTED_FROM_MATERIAL`, `INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED`, `CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG`, `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE`, `NONSTANDARD_DEPTH_UNSUPPORTED`.

### QA gate changes (v6.2)

New checks 10c and 10d in `evaluateTakeoffQaGate`:

| Issue | Severity | QA status |
|-------|----------|-----------|
| `CUTOUT_DEDUCTED_FROM_MATERIAL` | critical | do_not_import |
| `REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET` | warning | needs_review |
| `INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED` | warning | needs_review |
| `BACKSPLASH_SCOPE_CONFLICT` | warning/critical | needs_review / do_not_import |
| `CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG` | warning | needs_review |
| `NONSTANDARD_DEPTH_UNSUPPORTED` | warning | needs_review |
| `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE` | info | positive signal |
| `NO_BACKSPLASH_CONFIRMED` | info | positive signal |

### Extraction prompt v6.1

- Bumped `PROMPT_VERSION` to `"v6.1"`.
- Added explicit `FABRICATION RULES (v6.1)` section to the system prompt with 5 subsections:
  1. Reference totals are comparison-only (must not force geometry)
  2. No-backsplash: honor explicitly
  3. Cutouts: never in exclusions
  4. Duplicate/inferred pieces: geometry evidence required
  5. L/U-shape corner deductions: overlap must be visible
  6. Nonstandard depths: evidence required
- Updated `DO NOT` list to reference the new fabrication rules section.

### UI changes (v6.2)

- `TakeoffQaGatePanel.tsx`: added `fabricationFindings` optional prop; renders a compact "Fabrication rules" subsection with per-finding icons; updated `sourceBadge` to show "Fab rules" for `fabrication_rule` source.
- `TakeoffLabApp.tsx`: added `fabricationFindings` useMemo that calls `evaluateTakeoffFabricationRules` with current `activeState.result` and `excludedRunIds`; passes to `TakeoffQaGatePanel`.
- `styles.css`: added `qa-gate-fab-rules*` CSS rules.

### Tests (v6.2)

```bash
npm run eos:test:takeoff-fabrication-rules  # 33 new tests — all passing
```

All existing tests updated/confirmed:
```bash
npm run eos:test:takeoff-evidence-reconciliation  # 24 passing
npm run eos:test:takeoff-qa-gate                  # 25 passing
npm run eos:test:takeoff-benchmark-evaluator      # 17 passing
npm run eos:test:takeoff-extraction-service       # 28 passing (promptVersion v6.1)
npm run build --prefix app-ai-takeoff             # clean
npm run eos:check:local                           # clean
```

### Files changed (v6.2)

| File | Change |
|------|--------|
| `takeoffFabricationRules.mjs` | **New** — pure rules engine, 8 fabrication rule codes, 7 classifiers |
| `takeoffFabricationRules.test.mjs` | **New** — 33 tests |
| `takeoffContract.mjs` | Added 8 new diagnostic codes for fabrication rules |
| `takeoffValidator.mjs` | Imports fabrication rules; calls evaluateTakeoffFabricationRules; refines NONSTANDARD_DEPTH_ASSUMED with depth evidence check |
| `takeoffQaGate.mjs` | Checks 10c–10d for fabrication rule violations; new positive signals |
| `takeoffExtractionPrompt.mjs` | Bumped to v6.1; FABRICATION RULES section added |
| `takeoffBenchmark.mjs` | Added KELLEY_REVIEWED_RULE_FIXTURE |
| `TakeoffQaGatePanel.tsx` | fabricationFindings prop; "Fabrication rules" subsection; sourceBadge update |
| `TakeoffLabApp.tsx` | Import evaluateTakeoffFabricationRules; fabricationFindings useMemo; passes to panel |
| `styles.css` | qa-gate-fab-rules* CSS |
| `takeoffExtractionService.test.mjs` | Updated promptVersion assertion v6 → v6.1 |
| `package.json` | Added eos:test:takeoff-fabrication-rules script |

### Durable decisions

See `FEATURE_DECISIONS.md` entry **62** (deterministic fabrication rules engine; reference totals are comparison evidence, not calculation authority; Kelley fixture proof case).

---

## Durable decisions

See `FEATURE_DECISIONS.md` entries **48** (contract-first, AI-not-authority), **49** (quote files storage architecture), **50** (provider-neutral extraction layer, AI output never authoritative, raw PDFs not committed), **51** (benchmark truth fixtures, review gates), **52** (automatic QA gate must pass before any future import path), **53** (AI provider can be swapped server-side for benchmarked comparison; every model output still goes through eliteOS recompute, validator, benchmark evaluator, and QA gate), **54** (AI Takeoff deployed as protected head), **55** (shell alignment + session hydration), **56** (upload-first empty state + nonstandard depth QA + IE/QL alignment), and **60** (evidence-first integrity — runs must trace to evidence, reconciliation diagnostics, v6 prompt).
