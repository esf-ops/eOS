# Quote Intake Lab — Phase 4B.3 notes

**Date:** 2026-07-14  
**Status:** Implemented (lab estimator corrections + immutable `qil_reviewed_takeoff_v1` snapshots)  
**Also:** Phase **4B.3.1** acceptance idempotency, revision workflow, provenance + completed-control fixes (same date)  
**Related:** [`PHASE_4B_2_NOTES.md`](./PHASE_4B_2_NOTES.md) · [`PHASE_4_TAKEOFF_BOUNDARY.md`](./PHASE_4_TAKEOFF_BOUNDARY.md)

---

## Correction model

Corrections never mutate the source `TakeoffRun`. Operations append to a mutable **correction draft**; a pure **reviewed projection** replays ops onto a clone of provider rooms.

Key modules:

| Module | Role |
|--------|------|
| `correctionTypes.mjs` | Ops + review states |
| `reviewedProjection.mjs` | Apply ops + deterministic reviewed calc |
| `approvalGate.mjs` | Acceptance blockers |
| `takeoffCorrectionService.mjs` | Draft / accept orchestration |
| `TakeoffCorrectionPanel.tsx` | Correction-mode UI |

---

## Persistence migration

| Item | Value |
|------|--------|
| DB name | `quote-intake-lab-v1` |
| Version | **3 → 4** |

New stores:

| Store | Key | Indexes |
|-------|-----|---------|
| `takeoffCorrectionDrafts` | `id` | `byCase`, `byRun` |
| `reviewedTakeoffSnapshots` | `id` | `byCase` |

Correction audit continues in `takeoffAuditEvents`.  
Memory store mirrors the same API. `clearImported` cascades drafts + reviewed snapshots for imported case IDs only.

---

## Reviewed projection

- Provider rooms/pieces/evidence/warnings remain on the immutable run
- Draft ops: confirm / edit dims / reassign / exclude / restore / add / rooms / backsplash / sink / evidence / warning resolve
- Excluded pieces leave reviewed totals but remain listed as excluded
- Estimator **direct SF** pieces require a reason/note and carry `provenance: estimator_entered`

---

## Deterministic recalculation

After every op, projection recomputes via `applyReviewedDeterministicMeasurements`:

- Geometry pieces → existing `takeoffMeasurementCalc` bridge
- Direct-SF exceptions added by piece type after geometry calc
- Backsplash linear/height/manual SF via `areaMeta`
- Sink count override is display/count only — **never** deducted from SF

Distinct layers retained: email-stated · provider-proposed · original deterministic · final reviewed.

---

## Approval gate

Accept only when all blockers clear:

- Intake still accepted + Elite 100
- Attachment hash matches draft
- Every included provider piece confirmed/corrected
- Added pieces valid (geometry or direct SF + reason)
- Missing dims / unsupported geometry corrected
- Blocking warnings fixed (not dismissed) + resolution note
- Estimator-review warnings acknowledged with note
- Sink count confirmed
- Rooms with pieces marked reviewed
- Deterministic calc valid

---

## Accepted snapshot schema / immutability

`schemaVersion: qil_reviewed_takeoff_v1` with reviewed rooms/pieces, excluded/added ids, sink count, original + final calc layers, variances, warning resolutions, ops, fingerprint, `labMetadata.noPricing|noInternalEstimateImport|noQuoteLibrary|noCustomerEmail`.

- `saveReviewedTakeoffSnapshot` rejects duplicate ids
- Re-accept of **identical** reviewed projections is blocked (see 4B.3.1); material revisions create a **new** snapshot; prior rows retained
- Latest pointer via overlay `latestReviewedTakeoffSnapshotId`
- Snapshot records `sourceRunId` so older-run basis is visible
- Snapshot fields: `snapshotFingerprint`, `materiallyCorrected`, `parentSnapshotId`, `supersedesSnapshotId`

---

## Phase 4B.3.1 — acceptance integrity & provenance

### Acceptance idempotency

Before writing a snapshot, `TakeoffCorrectionService.acceptSnapshot` computes a deterministic **reviewed-projection fingerprint** (`reviewedFingerprint.mjs`) over:

- Source run ID + attachment hash + accepted intake snapshot ID
- Reviewed rooms/pieces (normalized)
- Exclusions / additions
- Sink count + warning resolutions
- Final deterministic totals
- Material ops summary

If the draft fingerprint matches the **latest accepted** snapshot fingerprint (or a revision draft’s `baselineFingerprint`), acceptance returns:

- `ok: false`
- `code: TAKEOFF_NO_CHANGES_SINCE_ACCEPTANCE`
- Message that the latest accepted snapshot already represents these reviewed values  
- **No** new snapshot row

Historical duplicate snapshots already in local test data are not deleted.

### Material-change fingerprint / provenance

`hasMaterialCorrections` is true only when human ops (or resulting scope/totals) **materially** differ from the source run — confirm / acknowledge / mark-reviewed alone are **review-only**.

| Stage | Primary SF label | Provenance chips |
|-------|------------------|------------------|
| Before accept | Draft reviewed SF | Unaccepted draft · Unchanged from original… **or** Human corrected |
| After accept | Accepted reviewed SF | Accepted reviewed · Human reviewed · (+ Human corrected only if material) |

### Revision workflow

After successful accept:

1. Draft is **frozen** (`frozen: true`, review state `accepted_lab_snapshot`)
2. Correction edits / Accept are disabled; UI shows locked accepted review
3. **Create revision** (`createTakeoffRevision`) seeds a new draft from the latest accepted projection, copies ops, sets `parentSnapshotId` + `baselineFingerprint`
4. Acceptance requires a material fingerprint change; identical re-accept is not a revision

### Completed-control behavior

| Control | Completed UI | Reopen |
|---------|--------------|--------|
| Sink confirm | Confirmed (active Confirm hidden) | Edit / Reopen |
| Room reviewed | Reviewed (Mark reviewed hidden) | Reopen review |
| Warning resolve | Resolved + note (Acknowledge hidden) | Reopen resolution |

### Acceptance confirmation dialog

Summarizes draft reviewed SF, sink count, included/excluded/added pieces, resolved warnings, remaining blockers, source run, attachment, and that acceptance creates an **immutable lab snapshot only**. Accept stays disabled while blockers remain.

### Snapshot history UI

Shows Latest, Accepted, Superseded by revision (when not latest), source run, parent snapshot, materially corrected vs review-only, short fingerprint.

---

## Audit behavior

Events include: `correction_draft_created`, `piece_confirmed`, `measurement_corrected`, `piece_excluded`, `piece_added`, `room_corrected`, `backsplash_corrected`, `sink_count_corrected`, `warning_resolved`, `correction_draft_saved`, `correction_draft_discarded`, `takeoff_snapshot_accepted`.

Safe metadata only — no bytes / credentials / prompts / hidden reasoning.

---

## UI behavior

Takeoff Review → **Enter correction mode**:

- Original vs corrected values per piece
- Primary **Draft reviewed SF** (pre-accept) / **Accepted reviewed SF** (post-accept)
- Blocker list, save/discard draft, accept dialog (draft language)
- After accept: locked draft + **Create revision** (no repeated Accept)
- Accepted snapshot history + inspect older snapshots
- Downstream IE/pricing buttons removed → concise unavailable note

---

## Visual refinements

1. Empty warning severity groups de-emphasized (“none” line)
2. No disabled Import IE / Price buttons
3. Reviewed SF visually primary in correction mode (draft vs accepted labels)
4. Provenance chips: Simulated provider · Original deterministic · Draft/Accepted reviewed · Unaccepted draft / Human reviewed · Human corrected only when material · Accepted snapshot

---

## Known limitations

- No Gemini / live plan interpretation
- No PDF/image preview
- No pricing / IE import / Quote Library
- Correction ops are lab-scoped; not production takeoff tables

---

## Phase 4B.4 live-takeoff boundary

Next phase may introduce an isolated live takeoff provider path (still lab-scoped) with explicit transmission acknowledgment — **without** production Takeoff head, IE import, or Quote Library coupling. PDF preview remains a later viewport concern unless scoped separately.
