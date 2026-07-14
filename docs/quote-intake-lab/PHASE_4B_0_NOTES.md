# Quote Intake Lab — Phase 4B.0 notes

**Date:** 2026-07-14  
**Status:** Implemented (lab TakeoffAdapter contract + SimulatedTakeoffAdapter only)  
**Related:** [`PHASE_4_TAKEOFF_BOUNDARY.md`](./PHASE_4_TAKEOFF_BOUNDARY.md)

---

## Contract implemented

Lab-owned modules under `app-quote-intake-lab/src/takeoff/`:

| Symbol | Module |
|--------|--------|
| Types / constants | `takeoffTypes.mjs` |
| Status machine | `takeoffStates.mjs` |
| `buildTakeoffRequest` | `buildTakeoffRequest.mjs` |
| Deterministic calc bridge | `labMeasurementCalc.mjs` |
| Lab validator | `validateLabTakeoff.mjs` |
| Synthetic scenarios | `simulatedScenarios.mjs` |
| `SimulatedTakeoffAdapter` | `simulatedTakeoffAdapter.mjs` |

Reviewed snapshot schema version (for later accept persistence): **`qil_reviewed_takeoff_v1`**.

TakeoffRequest requires: lab case id, accepted intake snapshot id, Elite 100 candidate decision, exactly one selected attachment (metadata + SHA-256), transmission-ack placeholder, actor, timestamp. Attachment **bytes are rejected**.

---

## Safe pure modules imported

| Module | Path | Why safe |
|--------|------|----------|
| `takeoffMeasurementCalc.mjs` | `backend-core/src/takeoff/` | Zero imports; no DB/Storage/env/network; only math |

Imported symbols: `sfFromRun`, `computeTakeoffMeasurements` (via lab bridge).

Lab summary **omits** chargeable / priced / sell keys even though the pure calc returns chargeable fields internally.

---

## Modules intentionally not reused

| Module | Reason |
|--------|--------|
| `takeoffContract.mjs` | Lab owns namespaced types; avoid crypto/UUID factories coupling |
| `takeoffValidator.mjs` | Transitive graph (evidence reconciliation, fabrication rules); lab owns validator |
| `takeoffApprovalGate` / QA / review helpers | Approval/import semantics are production IE-oriented; deferred |
| `geminiTakeoffProvider` / extraction / workspace services | Production-coupled |
| `takeoffImportPayload` (`takeoff_import_v1`) | IE import snapshot — never used |
| `spec73.fixture.mjs` | Real internal plan naming; lab uses synthetic `qil-synth-*` fixtures instead |

---

## Simulated-provider behavior

- Deterministic geometry from `scenarioId` or attachment `contentHash`
- No network, no PDF/image parsing
- Provider metadata: `SimulatedTakeoffAdapter` / `simulated` / `sim-takeoff-1.0.0`
- Evidence `simulatedNote` always declares simulated fixture provenance
- Never claims Gemini/human read a plan
- Never creates pricing or IE import fields

---

## Fixture scenarios

| ID | Scenario |
|----|----------|
| `qil-synth-straight-kitchen` | Straight kitchen run |
| `qil-synth-l-kitchen` | L-shaped kitchen (+ corner deduction) |
| `qil-synth-kitchen-island` | Kitchen + island |
| `qil-synth-multi-room` | Kitchen + bath |
| `qil-synth-sink-cutouts` | Two sinks; cutouts are count-only |
| `qil-synth-standard-splash` | Standard backsplash |
| `qil-synth-fhb` | Full-height backsplash |
| `qil-synth-missing-dim` | Missing depth → manual review |
| `qil-synth-conflict-dim` | Conflicting lengths → manual review |
| `qil-synth-irregular` | Unsupported geometry → manual review |

All identities / hashes are synthetic hex constants — not production digests.

---

## Deterministic calculation authority

1. Provider proposes dimensions + optional audit totals.  
2. `applyDeterministicMeasurements` maps lab rooms → calc-shaped result → `computeTakeoffMeasurements`.  
3. Piece `measuredSf` from `sfFromRun`.  
4. Provider variance stored separately; provider never authoritative.  
5. Sink cutouts **not** deducted from measured SF.

---

## Validation / warnings

Severities: `informational` | `estimator_review` | `approval_blocking`.

Includes: duplicate/orphan IDs, missing/conflicting dimensions, unsupported geometry, evidence linkage, provider-total variance, forbidden production/IE/library references, pricing-key prohibition, simulated evidence labeling.

---

## State model (4B.0)

- `qil_takeoff_not_started`
- `qil_takeoff_simulating`
- `qil_takeoff_review`
- `qil_takeoff_manual_review`
- `qil_takeoff_failed`

No approved / imported / quoted / sent / pricing-ready transitions.

---

## Explicit limitations

- No UI  
- No IndexedDB persistence  
- No live Gemini / attachment-byte transmission  
- No case repository wiring  
- Accept/snapshot freeze not implemented (schema constant only)  
- Production Takeoff / IE / Quote Library untouched  

---

## Phase 4B.1 persistence boundary

Next slice should:

- Persist `TakeoffRun` + audit in lab IDB (v3+ stores)
- Overlay case fields (`latestTakeoffRunId`, measured SF, sink count)
- **Still** no UI required if tests cover repository; prefer thin UI only if needed later in 4B.2
- Still no live Gemini
- Still no production tables/routes
