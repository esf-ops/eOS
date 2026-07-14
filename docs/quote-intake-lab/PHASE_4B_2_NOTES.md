# Quote Intake Lab — Phase 4B.2 notes

**Date:** 2026-07-14  
**Status:** Implemented (lab Takeoff Review workspace UI over SimulatedTakeoffAdapter + Phase 4B.1 persistence)  
**Related:** [`PHASE_4_TAKEOFF_BOUNDARY.md`](./PHASE_4_TAKEOFF_BOUNDARY.md) · [`PHASE_4B_0_NOTES.md`](./PHASE_4B_0_NOTES.md) · [`PHASE_4B_1_NOTES.md`](./PHASE_4B_1_NOTES.md)

---

## Workspace structure

Dedicated full-width workspace replaces the queue + narrow detail panel when open:

| Region | Role |
|--------|------|
| EliteosTopbar | Persistent; status chip reads `LAB · simulated takeoff` |
| IsolationBanner (`variant=takeoff`) | Simulated takeoff · contents not read · no production |
| Workspace header | Case / customer / project + **Back to queue** |
| Left pane | Attachment metadata, plan-preview placeholder (future 4B.4 viewport), simulated evidence refs |
| Right pane | Run controls, summary comparison, rooms/pieces, warnings, history, disabled 4B.3 actions |

Entry: case detail **Open Takeoff Review** (`TakeoffCaseEntry`) — not crammed into the side panel.

Modules:

- `src/components/takeoff/TakeoffReviewWorkspace.tsx`
- `src/components/takeoff/TakeoffCaseEntry.tsx`
- `src/takeoff/takeoffEligibility.mjs`
- `src/takeoff/scenarioCatalog.mjs`
- `src/takeoff/takeoffDisplay.mjs`

---

## Eligibility gates

`evaluateTakeoffEligibility` (pure) mirrors TakeoffService prerequisites without weakening them:

| Gate | Message when missing |
|------|----------------------|
| Accepted intake snapshot | Classification must be accepted |
| Not quote-related | Case is not quote-related |
| Elite 100 candidate | Case is not Elite 100 |
| Supported plan MIME + hash + size | No supported plan attachment / Attachment metadata is incomplete |
| Multiple supported plans | Multiple attachments require selection (blocks **run**, not open) |

`canOpenWorkspace` vs `canRun` are distinct. TakeoffService still enforces request validation on run.

Fixture plan attachments receive synthetic `sizeBytes` + `contentHash` via `getFixtureCases()` so classify → accept → takeoff works without real file bytes.

---

## Run controls

- Label: **Simulated test scenario** (10 `qil-synth-*` options)
- Default: `qil-synth-straight-kitchen` (simple kitchen, not a failure path)
- Copy states the scenario does **not** inspect the attachment
- Explicit **Run simulated takeoff** → `repo.runTakeoff` → TakeoffService → SimulatedTakeoffAdapter
- Busy state disables duplicate clicks
- Failures surface safe messages; history refreshes after every persist

---

## Attachment selection

- Metadata only (filename, MIME, size, hash)
- Exactly one radio selection
- No byte reads, object URLs, PDF open, or “analyzed” claims
- Run retains selected attachment id/hash on the immutable run row

---

## Summary / provenance

Distinct fields with provenance chips:

| Value | Provenance |
|-------|------------|
| Customer-stated SF | Email-stated / Email classification |
| Provider-proposed SF | Simulated provider proposal (non-authoritative) |
| Measured CT / BS / FHB / combined | eliteOS deterministic calculation |
| Human review | Unreviewed |
| Run | Simulated takeoff |

Never labeled chargeable / priced / sell / quote SF. Asterisks remain fixture-only elsewhere in the lab.

---

## Warning presentation

Grouped by severity: approval blocking · estimator review · informational.  
Each row: code, message, affected path, required action, source (`Simulated takeoff provider`), blocks-future-approval flag.  
Manual-review status uses a calm callout (not a crash style).

---

## Run history

All persisted runs for the case: id, time, provider/mode/version, scenario, state, measured SF, warning counts, attachment hash/filename, latest badge. Selecting a row inspects that immutable run without mutating it.

---

## Responsive behavior

- Desktop: two-pane operational layout; left reserved for future plan viewer
- ≤960px: stack panes; sticky header keeps Back to queue reachable
- ≤640px: comparison grid → single column; room/piece blocks read as cards

---

## Explicit limitations

- No Gemini / live takeoff provider
- No attachment-byte reads; no PDF/image preview
- No corrections, accept-takeoff snapshot, IE import, pricing, or Quote Library
- Simulated evidence must always be labeled simulated

---

## Phase 4B.3 correction / acceptance boundary

Next slice may add lab-owned measurement corrections and an accepted takeoff snapshot (`qil_reviewed_takeoff_v1`) with audit — still no live plan interpretation, no production Takeoff/IE/Quote Library writes.
