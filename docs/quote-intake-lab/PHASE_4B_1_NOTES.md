# Quote Intake Lab — Phase 4B.1 notes

**Date:** 2026-07-14  
**Status:** Implemented (local takeoff persistence + TakeoffService; no UI / no live Gemini)  
**Related:** [`PHASE_4_TAKEOFF_BOUNDARY.md`](./PHASE_4_TAKEOFF_BOUNDARY.md) · [`PHASE_4B_0_NOTES.md`](./PHASE_4B_0_NOTES.md)

---

## Database version change

| Item | Value |
|------|--------|
| DB name | `quote-intake-lab-v1` (unchanged) |
| Version | **2 → 3** |

### New object stores (v3)

| Store | Key | Indexes |
|-------|-----|---------|
| `takeoffRuns` | `id` | `byCase` |
| `takeoffAuditEvents` | `id` | `byCase` |
| `takeoffCaseOverlays` | `caseId` | — |

### Preserved from v1/v2

`cases`, `attachments`, `dedupe`, `classificationRuns`, `reviewedSnapshots`, `auditEvents`, `caseOverlays`.

---

## Repository / service methods

**Store (IdbLabStore + MemoryLabStore):**  
`saveTakeoffRun`, `getTakeoffRun`, `listTakeoffRuns`, `getLatestTakeoffRun`, `appendTakeoffAuditEvent`, `listTakeoffAuditEvents`, `getTakeoffOverlay`, `listTakeoffOverlays`, `setTakeoffOverlay`  
`clearImported` cascades takeoff stores for imported case IDs only.

**TakeoffService:**  
`runTakeoff`, `listRuns`, `getRun`, `getLatestRun`, `getOverlay`, `listAuditEvents`  
- Injected `takeoffAdapter` (default `SimulatedTakeoffAdapter`)  
- Never hard-codes a live provider

**LocalQuoteIntakeRepository:**  
`runTakeoff`, `listTakeoffRuns`, `getTakeoffRun`, `getLatestTakeoffRun`, `getTakeoffOverlay`, `listTakeoffAuditEvents`  
Merges `takeoffCaseOverlays` into `getCase` / `listCases` without mutating classification overlay fields.

---

## Run immutability

- `saveTakeoffRun` rejects duplicate IDs (`TAKEOFF_RUN_IMMUTABLE`)
- Re-run creates a new run id; prior rows unchanged
- Overlay latest pointer may move; historical runs stay frozen

---

## Overlay fields (takeoff-only store)

| Field | Meaning |
|-------|---------|
| `statedSquareFootage` | Email / intake extraction (copied; not overwritten by measure) |
| `measuredCountertopSquareFootage` | Deterministic takeoff CT SF |
| `measuredBacksplashSquareFootage` | Deterministic splash SF |
| `measuredFullHeightBacksplashSquareFootage` | Deterministic FHB SF |
| `measuredCombinedSquareFootage` | Deterministic combined |
| `providerProposedSquareFootage` | Audit-only provider total |
| `takeoffVariance` | Provider − measured (combined) |
| `takeoffSinkCutoutCount` | Cutout count (not SF deduction) |
| `latestTakeoffRunId` | Pointer |
| `latestTakeoffState` | `qil_takeoff_*` |
| `takeoffProviderMode` | e.g. `simulated` |
| `takeoffWarningCounts` | By severity + total |
| `takeoffUpdatedAt` | ISO timestamp |

Never: priced / chargeable / sell SF, quote totals, IE / Quote Library IDs.

---

## Stated versus measured SF

- Classification continues to own `proposedSquareFootage` (email stated SF)
- Takeoff overlay copies that into `statedSquareFootage` for comparison
- Measured fields come only from deterministic calc on the takeoff run
- Failed runs update latest pointer/state but **retain** prior measured SF when present

---

## Audit events

`takeoff_requested` → `takeoff_started` → `takeoff_completed` | `takeoff_requires_manual_review` | `takeoff_failed` → `latest_takeoff_overlay_updated`

Safe metadata only — no bytes, credentials, prompts, or hidden reasoning.  
`listTakeoffAuditEvents` returns chronological ascending order.

---

## Clear-import cascade

Clears imported cases’ takeoff runs, takeoff audit events, and takeoff overlays.  
Preserves fixture takeoff data and unrelated non-imported overlays.  
Production systems remain untouched (no connection).

---

## Known limitations

- No takeoff UI  
- No attachment-byte reading  
- No live Gemini takeoff  
- No review/correction/accept snapshot persistence yet  
- Adapter still may keep an in-memory map; **authoritative** history is the lab store  

---

## Phase 4B.2 UI boundary

Next slice should add estimator-facing takeoff workspace UI (select plan attachment, run simulated takeoff, show rooms/SF/warnings/history) reading only through `LocalQuoteIntakeRepository` — still no live Gemini or production routes.
