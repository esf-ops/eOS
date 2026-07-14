# Quote Intake Lab — Phase 4B.4A notes

**Date:** 2026-07-14  
**Status:** Implemented (server-side live Gemini takeoff foundation + synthetic plan fixture)  
**Related:** [`PHASE_4_TAKEOFF_BOUNDARY.md`](./PHASE_4_TAKEOFF_BOUNDARY.md) · [`PHASE_4B_3_NOTES.md`](./PHASE_4B_3_NOTES.md) · [`DO_NOT_TOUCH.md`](./DO_NOT_TOUCH.md)

---

## Scope of this phase

**In scope**

- Isolated loopback `POST /takeoff` endpoint (independent of `/classify`)
- Lab-owned Gemini multimodal transport (inline PDF/image)
- Three-pass prompt pipeline + structured validation
- Deterministic eliteOS measurement authority
- Committed synthetic countertop plan PDF + ground-truth JSON
- Fake staged-provider tests (no Gemini cost)
- Optional `npm run live-takeoff-smoke` (not run in 4B.4A)

**Out of scope (Phase 4B.4B+)**

- Browser UI wiring / “Run live takeoff” button
- Paid smoke execution as part of the phase
- Production Takeoff / Brain mount / IE / pricing / Quote Library

**Confirmation:** No paid Gemini request was executed during Phase 4B.4A implementation or validation.

---

## Server architecture

Host remains `app-quote-intake-lab/server` on `127.0.0.1:5197` (Option B).

| Endpoint | Purpose | Body limit |
|----------|---------|------------|
| `GET /health` | Safe config (no secrets) | n/a |
| `POST /classify` | Text classification only | `QIL_AI_MAX_BODY_BYTES` (default **256 KB**) |
| `POST /takeoff` | Live plan takeoff | `QIL_TAKEOFF_MAX_BODY_BYTES` (derived from attachment limit) |

Independent takeoff controls:

- `QIL_LIVE_TAKEOFF_ENABLED`
- `QIL_TAKEOFF_MODEL` / `QIL_TAKEOFF_VERIFICATION_MODEL`
- `QIL_TAKEOFF_TIMEOUT_MS`
- `QIL_TAKEOFF_MAX_ATTACHMENT_BYTES`
- `QIL_TAKEOFF_MAX_PAGES`
- `QIL_TAKEOFF_MAX_CONCURRENCY`

Gemini credential boundary unchanged: server-only `QIL_GEMINI_API_KEY` (optional shared opt-in). Never `VITE_*`.

Key modules:

| Path | Role |
|------|------|
| `server/takeoff/sanitizeTakeoffRequest.mjs` | Ack, MIME, size, SHA-256 verify |
| `server/takeoff/takeoffPrompts.mjs` | Versioned lab prompts |
| `server/takeoff/geminiTakeoffClient.mjs` | Multimodal REST client |
| `server/takeoff/validateProviderExtraction.mjs` | Pass validators |
| `server/takeoff/takeoffPipeline.mjs` | Staged pipeline + calc |
| `src/takeoff/liveGeminiTakeoffAdapter.mjs` | TakeoffAdapter (HTTP or direct) |

---

## Synthetic fixture and ground truth

| Artifact | Path |
|----------|------|
| PDF | `app-quote-intake-lab/fixtures/takeoff/qil-synth-kitchen-island-plan.pdf` |
| Ground truth | `…/qil-synth-kitchen-island-plan.ground-truth.json` |
| Generator | `…/generateSyntheticPlanPdf.mjs` (`npm run generate-synth-plan`) |

Geometry:

| Piece | Dims | SF |
|-------|------|-----|
| Main run | 120 × 25.5 in | **21.25** |
| Island | 72 × 36 in | **18.00** |
| Countertop total | | **39.25** |
| Standard backsplash | 120 × 4 in | **~3.33** |
| Sink count | 1 | (count only — not deducted) |

Clearly labeled “Synthetic Quote Intake Lab Fixture”; example.com / fictional identities only; valid PDF 1.4; no scripts/active content.

---

## Attachment transport

**Choice: strict JSON + base64** under a conservative lab attachment limit (default 4 MB).

| Tradeoff | Notes |
|----------|-------|
| Pros | Simple handler, easy fake tests, no multipart parser dependency |
| Cons | ~33% size overhead vs raw bytes; not ideal for very large scans |
| Rejected for 4B.4A | Multipart — deferred if size needs grow |

Classification’s 256 KB limit is **not** applied to `/takeoff`.

Never log `contentBase64` / attachment bytes.

---

## Hash verification

Server recomputes SHA-256 over decoded bytes and rejects `HASH_MISMATCH`, `SIZE_MISMATCH`, empty content, wrong magic bytes, oversized payloads.

---

## Prompt stages / versions

| Pass | Version constant | Purpose |
|------|------------------|---------|
| 1 Inventory | `qil-takeoff-inventory-v1` | Pages / countertop present / readable dims |
| 2 Evidence | `qil-takeoff-evidence-v1` | Dimension / annotation evidence + refs |
| 3 Geometry | `qil-takeoff-geometry-v1` | Rooms/pieces + verification + provider totals |

Prompts forbid: inventing dims, pricing, price group, customer comms, production calls, chain-of-thought. Unknown stays unknown. Evidence linkage required.

---

## Structured output + deterministic calc

Provider JSON → validate → map to existing lab `TakeoffRun` → `applyDeterministicMeasurements` (`takeoffMeasurementCalc`) → `validateLabTakeoffRun`.

- Deterministic measured SF is authoritative
- Provider totals are audit-only with variance
- Sink cutouts are count-only
- No chargeable / priced / sell / IE / Quote Library fields

---

## Security controls

- Loopback bind `127.0.0.1`
- Strict Origin allowlist
- `X-QIL-Lab-Token`
- No wildcard CORS
- Independent enable flags / body limits / concurrency / timeouts
- Safe logging (code + message only)
- Classification byte ban + 256 KB limit remain intact
- No production module imports (`app-ai-takeoff`, `geminiTakeoffProvider`, workspace routes)
- No `server.js` / Brain mount

---

## Fake-provider tests

`server/phase4b4a.test.mjs` covers valid synthetic extraction, missing/conflict/irregular dims, no countertop, unsupported evidence, timeout/rate limit, hash/ack/size failures, deterministic SF authority, sink non-deduction, no pricing fields, no sensitive logging, classification security intact, zero `fetch` calls.

Optional paid smoke: `npm run live-takeoff-smoke` (requires enable + model + key; **not run in 4B.4A**).

---

## Exact Phase 4B.4B frontend boundary

Next phase may:

1. Add UI control to run **live** takeoff (separate from simulated scenario runner)
2. Require explicit transmission acknowledgment in the browser
3. Send **one** selected local attachment (bytes + metadata + hash) to loopback `/takeoff`
4. Persist returned `TakeoffRun` via existing lab `TakeoffService` / IDB
5. Reuse existing Takeoff Review / correction workspace

Must not:

- Call production `/api/takeoff-jobs/*`
- Write production tables / Storage
- Skip ack or synthetic-only guard without product approval
- Put Gemini credentials in `VITE_*` / browser bundle
- Auto-run paid smoke in CI

---

## Limitations

- No UI integration in 4B.4A
- Live smoke not executed
- Sync-only loopback (no Vercel async)
- JSON/base64 transport only
