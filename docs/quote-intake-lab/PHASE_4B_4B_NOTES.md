# Quote Intake Lab — Phase 4B.4B notes

**Date:** 2026-07-14  
**Status:** Implemented (UI wiring for live Gemini takeoff through loopback server)  
**Related:** [`PHASE_4B_4A_NOTES.md`](./PHASE_4B_4A_NOTES.md) · [`PHASE_4B_3_NOTES.md`](./PHASE_4B_3_NOTES.md)

---

## Scope

Wire Live Gemini takeoff into Takeoff Review:

- Provider selector (Simulated default / Live Gemini)
- Synthetic-only allowlist (exact committed hashes)
- Explicit transmission acknowledgment
- Byte load only after Run
- Client hash verification
- Persist via `TakeoffService` + existing correction/acceptance

**Confirmation:** No paid Gemini request was automatically run during 4B.4B implementation/validation. Manual live runs are operator-driven.

---

## Synthetic allowlist

| Hash | Fixture |
|------|---------|
| `0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb` | `qil-synth-kitchen-island-plan.pdf` |

Blocked: unknown hashes, placeholder tiny PDFs, attachments &lt; 500 bytes.

UI copy: *Live Gemini takeoff is currently restricted to approved synthetic fixtures.*  
No bypass.

Module: `src/takeoff/syntheticLiveAllowlist.mjs`

---

## EML fixture

| Path | Role |
|------|------|
| `src/fixtures/eml/synth-kitchen-island-live-takeoff.eml` | Importable synthetic email with real PDF bytes |
| `fixtures/takeoff/generateSyntheticTakeoffEml.mjs` | Regenerator (`npm run generate-synth-takeoff-eml`) |

Body includes Example Homes LLC / Maple Court Kitchen / Calacatta Mira / eased / 1 sink / 39.25 SF / standard 4″ splash.

Import stores PDF bytes in IndexedDB with the approved hash.

---

## Provider selection

- Simulated = default
- Selection resets when switching cases
- Scenario dropdown only in Simulated mode
- Live mode shows loopback takeoff health (unavailable / disabled / misconfigured / ready)

---

## Acknowledgment & byte access

Ack checkbox unchecked by default. Run live stays disabled until checked.

Bytes load only when:

1. Provider = Live  
2. Hash allowlisted  
3. Eligibility passes  
4. Ack checked  
5. User clicks **Run live takeoff**

Then: client SHA-256 verify → `TakeoffService` → `LiveGeminiTakeoffAdapter` → `POST /takeoff` with lab token (no Gemini key in browser). Transient base64 cleared after request.

Opening Takeoff Review does **not** load attachment bytes. The browser bundle never imports server `sanitizeTakeoffRequest` / `node:crypto` (test-only `directPipeline` wrappers perform sanitization in Node tests).

---

## Progress / failure

Approximate staged progress for the multi-pass server pipeline. Failures persist failed runs, keep prior successes + drafts/snapshots, show safe codes, allow retry; never silent-fall back to simulated.

---

## Provenance

Live runs labeled **Live Gemini takeoff** (never Simulated) with provider/version, prompt versions, attachment hash, unreviewed, deterministic authority, non-authoritative provider totals.

---

## Correction / acceptance

Unchanged on live runs: correction draft → approval gate → immutable `qil_reviewed_takeoff_v1`.

---

## Preview

**Preview synthetic plan** loads allowlisted PDF from IndexedDB into a revoked object URL. Local only; not evidence-overlay sync. Arbitrary/untrusted PDF preview remains disabled.

---

## Manual live-test steps

1. `npm run live-server` with `QIL_LIVE_TAKEOFF_ENABLED=true`, models, and key configured  
2. Start lab UI; set `VITE_QIL_LAB_REQUEST_TOKEN` matching server  
3. Import `synth-kitchen-island-live-takeoff.eml`  
4. Classify (simulated OK) → accept Elite 100 snapshot  
5. Open Takeoff Review → Live Gemini → ack → Run live takeoff  
6. Compare to ground truth (39.25 / 3.33 / 42.58 / sink 1)  
7. Enter correction mode → confirm pieces/sink/rooms/warnings → accept snapshot  
8. Confirm history shows Live Gemini provenance  

Optional paid smoke remains `npm run live-takeoff-smoke` (not part of automated tests).

---

## Phase boundary

Next phases may expand real-customer plan testing only with separate product approval. Do not weaken the synthetic allowlist without that approval.

---

## Phase 4B.4B.1 — Classification evidence-resolution (follow-up)

**Date:** 2026-07-15  
**Status:** Implemented — tightly scoped correction (not a new feature phase)

### Root cause

Live synthetic classification often produces paired warnings for the same field:

- Blocking `EVIDENCE_INVALID` (excerpt/source failed validation)
- Informational `EVIDENCE_INVALID_CLEARED` (sanitizer already cleared the value to unknown)

Acceptance ignored human field corrections and kept blocking on the immutable AI warning list. Confirm was still offered for failed-evidence fields.

### Resolution model

- Immutable AI `validationWarnings` retained for run history  
- Reviewed `warningResolutions` overlay (+ correction fallback)  
- Edit (note required) / Mark unknown / Clear resolve field-scoped `EVIDENCE_INVALID`  
- Confirm forbidden on unresolved invalid evidence  
- Acceptance uses `activeBlockingWarnings`  
- Snapshot stores resolution audit  

See also `PHASE_3_1_NOTES.md` § Phase 4B.4B.1.

### Confirmation

No paid Gemini request was run for this correction. Production Takeoff / Brain routes untouched. Evidence excerpt matching rules unchanged (only safer metadata appended to warning strings).
