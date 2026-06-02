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

## Files shipped (this slice)

```
backend-core/src/takeoff/
  takeoffContract.mjs          Schema constants, factory helpers, JSDoc types
  takeoffMeasurementCalc.mjs   Deterministic sf calculator (pure)
  takeoffValidator.mjs         Structured diagnostics (pure)
  takeoffImportPlanner.mjs     RoomScopeBuilder import plan mapper (pure)
  takeoff.contract.test.mjs    Contract + fixture tests
  fixtures/
    spec73.fixture.mjs         Known-good Spec 73 fixture

app-ai-takeoff/                Lab head shell (v1 — fixture viewer only)
  index.html
  package.json
  vite.config.ts               @takeoff-core alias → backend-core/src/takeoff/
  tsconfig.json
  src/
    main.tsx
    TakeoffLabApp.tsx           Top-level shell
    takeoff.d.ts                Ambient type declarations for .mjs imports
    components/
      TakeoffSummaryCards.tsx
      TakeoffRoomsReview.tsx
      TakeoffDiagnosticsPanel.tsx
      TakeoffImportPreview.tsx
    styles.css

docs/eliteos/
  ai-takeoff-foundation.md     This document
```

Scripts added to root `package.json`:
```
npm run eos:test:takeoff-contract   # contract tests
npm run eos:build:ai-takeoff        # build the lab head
# eos:check:local now includes eos:build:ai-takeoff at the end
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

## Future slices (separate approval required)

### Next slice: AI extraction integration
Wire a real AI call (vision or structured extraction) to produce a `TakeoffResult` draft from an uploaded plan. The contract and validator are already in place.

### AI Takeoff Lab head (`app-ai-takeoff/`)
Standalone head for uploading plans, reviewing AI-produced drafts, running the validator UI, and approving for import. Deployed on a separate hostname; does not touch Internal Estimate beta.

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

See `FEATURE_DECISIONS.md` entries **48** (contract-first, AI-not-authority) and **49** (quote files storage architecture).
