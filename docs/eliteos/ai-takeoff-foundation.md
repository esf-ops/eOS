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

docs/eliteos/
  ai-takeoff-foundation.md     This document
```

Test script added to `package.json`:
```
npm run eos:test:takeoff-contract
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

## Durable decisions

See `FEATURE_DECISIONS.md` entry **48** for the architectural rationale for contract-first, AI-not-authority, and separate-head design.
