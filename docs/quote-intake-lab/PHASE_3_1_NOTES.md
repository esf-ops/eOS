# Quote Intake Lab — Phase 3.1 notes

**Date:** 2026-07-14
**Status:** Implemented (isolated live Gemini provider behind Phase 3 contract)

## Visualizer Gemini pathway discovered

| Piece | Path | Role |
|-------|------|------|
| Frontend | `app-visualizer/src/lib/api.ts` | `POST /api/public-visualizer/render` multipart |
| Routes | `backend-core/src/visualizer/*Routes.js` | Mounted in `server.js` |
| Factory | `visualizerRenderProvider.mjs` | Provider/env selection |
| Gemini client | `geminiVisualizerRenderProvider.mjs` | REST `generateContent`, **image** modalities |
| Credentials | `GEMINI_API_KEY` (server-only) | Query-param auth; URL never logged |
| Parallel takeoff | `geminiTakeoffProvider.mjs` | JSON extraction for plans (also REST; file bytes) |

Transport pattern (reusable as a **pattern**, not as a module import):

- Node built-in `fetch`
- `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`
- Never log the request URL
- Keys never returned to clients

## Components safe / not reused

| Classification | Items |
|----------------|-------|
| Safe pattern to replicate | REST fetch, query-key auth, no-URL logging, timeout race, JSON `responseMimeType` (from takeoff pattern) |
| Must not reuse | Visualizer prompts, image payload, `responseModalities: IMAGE`, public/internal visualizer routes, takeoff file/PDF extractors |
| Unsafe for lab | Calling deployed Visualizer endpoints; importing Visualizer render providers for email text |
| Additive Brain note only | `backend-core/src/quoteIntakeLab/phase31LiveBoundary.mjs` (unmounted) |

## Selected architecture: **Option B**

Isolated lab intelligence server under `app-quote-intake-lab/server/`:

- Bind `127.0.0.1:5197`
- Explicit `npm run live-server`
- Never registered in `backend-core/server.js`
- Disabled by default (`QIL_LIVE_AI_ENABLED=false`)
- Own lab credential + lab request token

**Why not Option A:** There is no generic Gemini client module. Visualizer’s Gemini provider is image-generation-specific. Takeoff’s is file/PDF extraction. Importing either would couple the lab to production modules or require Brain mounting — forbidden in Phase 3.1.

## How Visualizer remains unaffected

- No edits under `app-visualizer/**` or `backend-core/src/visualizer/**`
- No change to Visualizer env semantics
- Lab uses `QIL_*` vars; optional shared key only with `QIL_ALLOW_SHARED_GEMINI_KEY=true`

## Local server

```
app-quote-intake-lab/server/
  index.mjs              # HTTP server
  config.mjs             # QIL_* config
  geminiJsonClient.mjs   # text/JSON Gemini REST client
  classifyPipeline.mjs   # two-pass flow
  prompts.mjs            # versioned prompts
  validateClassificationResult.mjs
  sanitizeLiveRequest.mjs
  smoke.mjs              # optional paid smoke
```

Endpoints:

- `GET /health` — safe config (no secrets)
- `POST /classify` — JSON classify (token + origin + body limits)

## Provider configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `QIL_LIVE_AI_ENABLED` | false | Master switch |
| `QIL_AI_PROVIDER` | gemini | Provider name |
| `QIL_AI_MODEL` | _(required)_ | Extraction model — not hardcoded |
| `QIL_AI_VERIFICATION_MODEL` | same as model | Verification pass |
| `QIL_AI_VERIFICATION_ENABLED` | true | Two-pass toggle |
| `QIL_GEMINI_API_KEY` | — | Preferred lab key |
| `QIL_ALLOW_SHARED_GEMINI_KEY` | false | Opt-in read of `GEMINI_API_KEY` |
| `QIL_LAB_REQUEST_TOKEN` | — | Browser→lab-server auth (not Gemini secret) |
| `QIL_ALLOWED_ORIGIN` | `http://127.0.0.1:5196` | Strict CORS |
| `VITE_QIL_LIVE_SERVER_URL` | `http://127.0.0.1:5197` | Frontend target |
| `VITE_QIL_LAB_REQUEST_TOKEN` | — | Frontend lab token |

See `app-quote-intake-lab/.env.example` and `server/.env.example`.

## Credential boundary

- Gemini key: **server process only** (`QIL_GEMINI_API_KEY`)
- Never in `VITE_*`, IndexedDB, localStorage, or browser bundles
- Lab request token ≠ provider credential
- Logs: operational codes/messages only — never bodies, keys, or excerpts of customer content

## Live enablement / frontend selection

- Simulated remains default
- Explicit provider dropdown + live acknowledgment checkbox
- No auto-run
- Soft failures (server down / disabled) restore prior case status
- Live runs labeled `providerMode: "live"` in history

## Prompt versions

- Extraction: `qil-extract-v1`
- Verification: `qil-verify-v1`

Stored on each live result under `result.verification`.

## Two-pass verification

1. Extraction → proposed JSON
2. Verification → compare to sources, strip unsupported claims
3. Server-side schema + evidence validation (excerpt must exist in source)

## Security controls

- Loopback bind only
- Strict Origin (no `*`)
- `Content-Type: application/json`
- `X-QIL-Lab-Token`
- Body size limit
- Concurrency limit
- Timeouts
- Attachment bytes / HTML rejected
- Live disabled → 503

## Persistence / audit

Uses existing Phase 3 IDB run history. Live and simulated runs coexist; neither overwrites accepted runs.

## How to run

```bash
# Terminal A — queue UI
cd app-quote-intake-lab && npm run dev

# Terminal B — live intelligence (optional)
cp server/.env.example server/.env   # fill placeholders
# set QIL_LIVE_AI_ENABLED=true, QIL_AI_MODEL, QIL_GEMINI_API_KEY, tokens
npm run live-server

# Optional paid smoke (never in npm test)
npm run live-smoke
```

## Known limitations

- Text/metadata classification only — no attachment contents
- Model must be configured explicitly
- Lab server is local-only; not a production deployment
- Catalog validation remains non-authoritative

## Confirmations

- Attachment contents are **not** read or transmitted
- Production Visualizer, Brain mounts, Supabase, Quote Library, takeoff, Outlook, Resend remain untouched

---

## Phase 3.1.1 — Provenance + validation-warning correction

**Date:** 2026-07-14
**Status:** Implemented (presentation / persistence / acceptance guardrails only — no prompt, schema, or transport changes)

### Defects observed on first successful live run

1. Summary showed `95% · simulated` while provider metadata correctly showed LIVE Gemini.
2. Queue / case summary showed live values as `48.5 sf*` / `95%*` (fixture asterisk reuse).
3. Live smoke reported `validationWarnings=2` but workspace presentation was not prominent / structured.

### Root causes

| Defect | Cause |
|--------|--------|
| Simulated confidence label | `ClassificationWorkspace` hard-coded ` · simulated` after confidence, ignoring `activeRun.providerMode`. |
| Fixture asterisks on live values | `formatSf` / `formatConfidence` always appended `*`; queue/case summary had no provenance model. |
| Warnings “missing” | Warnings existed on `result.warnings` / run payload but were rendered as an unlabeled optional list under Summary — easy to miss; not structured with code/stage/blocking. Overlay did not persist provider/review provenance fields. |

### Provenance display rules

Presentation is derived from **dataSource + classificationProviderMode + classificationReviewState** (and per-field `humanReviewState`), never from confidence alone.

| Kind | Compact UI examples |
|------|---------------------|
| Fixture simulated (uncclassified fixture) | `64.1 sf*` / `90%*` |
| Simulated classifier | `48.5 sf · simulated` / `80% · simulated` |
| Live Gemini — unreviewed | `48.5 sf · AI extracted` / `95% · Live Gemini · unreviewed` |
| Live Gemini — human confirmed | `… · confirmed` |
| Human corrected | `… · corrected` |
| Human accepted snapshot | `… · accepted` |

Fixture asterisks remain **fixture-only**.

### Observed live-smoke warnings (count = 2)

Historical `npm run live-smoke` logged only the count (`validationWarnings=2`), not the strings. No second paid live request was run for this correction.

Reconstruction on the same smoke corpus (valid excerpts with invalid `charStart`/`charEnd`) produces exactly two **informational** validator warnings — the expected pattern when Gemini cites a correct excerpt but wrong character offsets:

1. `Field statedSquareFootage: invalid character range — coerced from excerpt location.`
   - **Stage:** evidence_validation (post-verification normalize)
   - **Cause:** excerpt found in body; range coerced from excerpt location
   - **Expected:** yes (not a contract defect)
   - **Blocking:** no

2. `Field requestedColorText: invalid character range — coerced from excerpt location.`
   - Same stage/cause/expectation/blocking as above for a second field

`server/smoke.mjs` now prints each warning string (truncated) so future smoked runs capture exact text without dumping provider payloads.

### Blocking vs informational warnings

| Severity | When | Acceptance |
|----------|------|------------|
| **Blocking** | Schema integrity problems, unsupported top-level pricing/takeoff keys, **unresolved** invalid evidence | **Blocked** until field-level human resolution (edit / mark unknown) or a clean re-run for contract defects without `fieldKey` |
| **Informational** | Evidence range coercion, enum/severity coercion, dropped unsupported field keys, stripped forbidden provider claims after sanitize, evidence cleared-to-unknown | Visible; acceptance may continue |

UI shows code, safe explanation, field (when applicable), estimator-action flag, and stage. Warnings persist on the run (`validationWarnings` + `warnings`) and remain in run history after reload / after accept for informational cases.

### Corrections made

- `provenance.mjs` + case overlay fields `classificationProviderMode` / `classificationReviewState`
- Confidence / SF formatters provenance-aware
- Structured `validationWarnings.mjs` + prominent workspace + history panel
- Accept guard for blocking warnings (`BLOCKING_VALIDATION_WARNINGS`)
- Regression tests in `phase311Provenance.test.mjs`

---

## Phase 4B.4B.1 — Evidence-resolution correction (classification)

**Date:** 2026-07-15
**Status:** Implemented (no paid Gemini call; evidence validation not weakened)

### Observed live symptom (synthetic fixture)

Live classification surfaced:

1. `EVIDENCE_INVALID` (blocking)
2. `EVIDENCE_INVALID_CLEARED` (informational)
3. `UNSUPPORTED_CLAIM_STRIPPED` (informational)

Estimator field edits did not unblock acceptance.

### Root cause

Server evidence validation emits **two** strings per failed field:

1. `Field <key>: evidence excerpt not found in <source>…` → structured as blocking `EVIDENCE_INVALID`
2. `Field <key>: evidence invalid — value marked unknown…` → informational `EVIDENCE_INVALID_CLEARED` (value already sanitized to unknown; AI value **not** trusted)

Acceptance (`acceptClassification`) previously treated **any** original blocking `validationWarnings` entry as permanently blocking. `applyCorrections` updated field values but never wrote a **reviewed resolution** overlay. Confirm remained available even when evidence failed. Warning cards lacked field / rejected-value / resolution affordances in the narrow panel.

Exact affected field on a given live run is the `fieldKey` carried by each `EVIDENCE_INVALID` message (often one hallucination per run; common pattern is a non-matching excerpt such as a “combined / takeoff” SF claim that is not present in the email body). Rejected numeric/text values are cleared before display; claimed source is typically `body`. `UNSUPPORTED_CLAIM_STRIPPED` stays informational when the claim was stripped and no trusted field depends on it.

### Field-level warning structure

Every structured warning now includes: `warningId`, `code`, `severity`, `stage`, `fieldKey`, `fieldLabel`, safe rejected-value summary (when present), claimed source type, safe excerpt (when present), validation failure reason, `blockingState`, `resolutionState`, resolution method/actor/time, related correction ID. Blocking warnings without `fieldKey` are `contract_defect`.

### Human resolution

| Action | Effect |
|--------|--------|
| Edit (+ required note) | Human value authoritative (`manual_correction`); warning → `resolved_by_human_correction` |
| Mark unknown (+ confirmation note) | Field unknown; warning → `resolved_by_marked_unknown`; missing-info rules recalculated |
| Clear (+ confirmation note) | Optional clear; warning → `resolved_by_cleared` |
| Confirm | **Forbidden** while unresolved `EVIDENCE_INVALID` on that field |

Original AI warnings remain immutable on the run; resolutions live in `warningResolutions` (and correction fallback). Accepted snapshots store `warningResolutions` + `reviewedWarnings`.

### Acceptance gate

Uses `activeBlockingWarnings(run)` — historical `EVIDENCE_INVALID` may remain visible but stops blocking after audited human edit / mark-unknown / clear when missing-information policy is satisfied. Schema/top-level blockers without field resolution still require a clean re-run.