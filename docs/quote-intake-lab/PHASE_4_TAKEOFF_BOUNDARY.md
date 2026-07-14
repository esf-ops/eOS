# Quote Intake Lab — Phase 4A Takeoff Boundary

**Date:** 2026-07-14  
**Status:** Investigation + documentation only — **no TakeoffAdapter implementation**  
**Phase:** 4A (read-only research)  
**Do not begin Phase 4B until this document is accepted.**

**Related:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`DO_NOT_TOUCH.md`](./DO_NOT_TOUCH.md) · [`BUILD_PLAN.md`](./BUILD_PLAN.md) · [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md) · [`PHASE_3_1_NOTES.md`](./PHASE_3_1_NOTES.md)

---

## 1. Purpose and constraints

Define a safe, isolated **TakeoffAdapter** boundary so Quote Intake Lab can eventually process an accepted case’s countertop plan attachment through AI takeoff **without** touching the live AI Takeoff head, production tables, Internal Estimate import, Quote Library, or pricing.

This phase:

- Inspects the existing AI Takeoff implementation
- Classifies modules for reuse vs isolation
- Proposes adapter contracts and lab persistence
- Recommends an isolated execution architecture

This phase does **not**:

- Implement `TakeoffAdapter`
- Modify `app-ai-takeoff` or `backend-core/src/takeoff/*`
- Call Gemini or process attachment bytes
- Change production source, routes, tables, or env semantics
- Commit, push, or deploy

---

## 2. Existing Takeoff architecture map

### 2.1 High-level flow (production)

```
app-ai-takeoff (port 5186 / takeoff.eliteosfab.com)
    │  Bearer JWT
    ▼
backend-core takeoffWorkspaceRoutes.js  (/api/takeoff-jobs/*)
    │
    ├─ quote_files + eliteos-quote-files (private Storage)
    ├─ quote_takeoff_jobs / quote_takeoff_results (Supabase)
    ├─ takeoffGenerationOrchestrator / takeoffExtractionService
    │     ├─ Pass 1: page inventory (provider)
    │     ├─ Pass 2: dimension evidence (provider)
    │     └─ Pass 3: extraction → TakeoffResult draft
    ├─ Pure: takeoffMeasurementCalc (deterministic SF)
    ├─ Pure: takeoffValidator / approvalGate / QA / fabrication rules
    └─ (separate product path) POST /api/internal-quotes/import-from-takeoff
          → calculateQuote() + persistQuoteSubmission() → quote_headers
```

### 2.2 Frontend head

| Path | Role | Classification |
|------|------|----------------|
| `app-ai-takeoff/` | Live Takeoff Lab SPA (Vite, React 19, port 5186) | **Do not touch under any circumstances** for Phase 4B lab work |
| `app-ai-takeoff/src/TakeoffLabApp.tsx` | Main shell, run history, import readiness | Production-coupled — do not use |
| `app-ai-takeoff/src/components/TakeoffWorkbench.tsx` | Room/area/run edit workbench | Production-coupled — do not use |
| `app-ai-takeoff/src/components/TakeoffImportPreview.tsx` | IE import gate UI | Production-coupled — do not use |
| `app-ai-takeoff/src/lib/supabase.ts` | Browser Supabase client | Production-coupled — do not use |
| `app-ai-takeoff/src/lib/takeoffGenerationPoll.mjs` | Async job poll helper | Must be wrapped (pattern only) |
| `app-ai-takeoff/src/lib/reviewActionPath.mjs` | Next-action path helper | Safe pure-module reuse (optional) |
| `app-ai-takeoff/vite.config.ts` | `@takeoff-core` → `backend-core/src/takeoff` | Safe read-only import (alias pattern) |

### 2.3 Internal Estimate takeoff surfaces (hard boundary)

| Path | Role | Classification |
|------|------|----------------|
| `app-internal-estimate/**/Takeoff*` | Import receipt, checklist, comparison, add-ons | **Do not touch under any circumstances** |
| `POST /api/internal-quotes/import-from-takeoff` | Creates IE quote from approved takeoff | **Do not touch / never call** |
| `POST /api/internal-quotes/:id/detach-takeoff-import` | Detach import block | **Do not touch / never call** |
| `backend-core/src/quotes/internalQuoteTakeoffImport.mjs` | Import orchestration + `calculateQuote` + persist | Production-coupled — do not use |
| `backend-core/src/quotes/internalQuotesApi.js` | Mounts import routes | **Do not touch** |

### 2.4 Backend routes (`takeoffWorkspaceRoutes.js`)

All production takeoff HTTP routes require auth + `requireHeadAccess("ai_takeoff")`. **Lab must not call these.**

| Route | Purpose |
|-------|---------|
| `GET /api/takeoff/config` | Safe provider config (no secrets) |
| `POST/GET /api/takeoff-jobs` | Create / list workspaces |
| `GET /api/takeoff-jobs/:id` | Job status |
| `POST /api/takeoff-jobs/:id/process` | Phase E async process |
| `POST /api/takeoff-jobs/:id/generate-ai-draft` | AI extraction (202 async on Vercel) |
| `POST .../results`, `.../corrections`, `.../approve` | Save / correct / approve |
| `GET .../results/latest`, `.../results/:resultId` | Fetch results |
| `POST .../feedback`, `.../issue-report` | Beta ops |
| `GET /api/takeoff-beta/qa-summary` | Beta QA summary |

### 2.5 Gemini / provider implementation

| Path | Role | Classification |
|------|------|----------------|
| `geminiTakeoffProvider.mjs` | REST `generateContent` with **inline file bytes** (PDF/images); uses `GEMINI_API_KEY` | Production-coupled — do not use (replicate **pattern** only) |
| `openAiTakeoffProvider.mjs` | OpenAI Responses extraction | Production-coupled — do not use |
| `exayardTakeoffProvider.mjs` / `exayardClient.mjs` | Exayard hosted analysis | Production-coupled — do not use |
| `takeoffAiProvider.mjs` | Provider factory + env (`TAKEOFF_AI_*`) | Production-coupled — do not use |
| `takeoffPageInventoryService.mjs` | Pass 1 orchestration | Production-coupled — do not use |
| `takeoffDimensionEvidenceService.mjs` | Pass 2 orchestration | Production-coupled — do not use |
| `takeoffExtractionService.mjs` | Full pipeline + DB/Storage | Production-coupled — do not use |
| `takeoffGenerationOrchestrator.mjs` | Vercel `waitUntil` async | Production-coupled — do not use |
| `takeoffProcessOrchestrator.mjs` | DB-backed Phase E async | Production-coupled — do not use |

**Prompt builders (text only, no I/O):**

| Path | Classification |
|------|----------------|
| `takeoffPageInventoryPrompt.mjs` | Safe pure-module reuse **or** replicate additively if lab prompt versions must diverge |
| `takeoffDimensionEvidencePrompt.mjs` | Same |
| `takeoffExtractionPrompt.mjs` | Same |

### 2.6 Deterministic measurement + validation (pure)

| Path | Role | Classification |
|------|------|----------------|
| `takeoffContract.mjs` | `TakeoffResult` schema v1.0, factories, constants | **Safe pure-module reuse** |
| `takeoffMeasurementCalc.mjs` | `sfFromRun`, `computeTakeoffMeasurements`, chargeable ceiling | **Safe pure-module reuse** |
| `takeoffValidator.mjs` | Diagnostic codes vs schema/measurements | **Safe pure-module reuse** |
| `takeoffApprovalGate.mjs` | `evaluateTakeoffApprovalGate`, review filters | **Safe pure-module reuse** |
| `takeoffQaGate.mjs` | Automatic quality gate | **Safe pure-module reuse** |
| `takeoffFabricationRules.mjs` | Deterministic fabrication findings | **Safe pure-module reuse** |
| `takeoffReviewStatus.mjs` | Review state normalize/derive | **Safe pure-module reuse** |
| `takeoffWorkflowState.mjs` | Workflow step / canApprove cards | Safe pure-module reuse (lab may subset) |
| `takeoffEvidenceRunReconciliation.mjs` | Evidence ↔ run reconciliation | **Safe pure-module reuse** |
| `reviewedTakeoffMath.mjs` | Reviewed math consistency | **Safe pure-module reuse** |
| `takeoffWorkbenchHelpers.mjs` | Immutable edit patches | Safe pure-module reuse |
| `roomVerificationView.mjs` | Per-room verification view model | Safe pure-module reuse |
| `takeoffImportPlanner.mjs` | Maps to IE Guided Shape groups | Must be wrapped — lab must not import to IE |
| `takeoffImportPayload.mjs` | Builds `takeoff_import_v1` | Must be wrapped — lab may reuse **shape ideas** but must **never** feed IE import |
| `takeoffImportWorkflow.mjs` / `takeoffImportMeasurements.mjs` | IE readiness / deltas | Must be wrapped — IE-facing |

### 2.7 Storage and Supabase tables

| Artifact | Role | Lab rule |
|----------|------|----------|
| Bucket `eliteos-quote-files` | Private plan bytes | **Never use** for lab |
| `quote_files` / `quote_file_events` | File metadata + audit | **Never write** |
| `quote_takeoff_jobs` | Production workspace | **Never write** |
| `quote_takeoff_results` | Production AI/result JSON | **Never write** |
| `quote_measurement_sources` | Provenance on quotes | **Never write** |
| `quote_headers` (+ `source_takeoff_*`) | Quotes + IE import traceability | **Never write** |
| `quote_visual_layouts` | Visual layout geometry | Out of scope / do not touch |

### 2.8 Status model (production)

| Layer | Values |
|-------|--------|
| Job `status` | `pending` → `processing` → `completed` \| `failed` \| `cancelled` |
| Job `review_status` | `needs_review` \| `in_review` \| `approved` \| `rejected` \| `superseded` |
| Contract `TakeoffResult.status` | `draft` \| `reviewed` \| `approved` \| `rejected` |
| App workflow | `ai_draft` → `needs_review` → `review_complete` → `approved_for_import` → `imported` |

Lab must continue using **`qil_*`** case statuses only (`qil_takeoff_processing`, `qil_needs_manual_takeoff`, `qil_ready_for_review`, …). Do not overload production job enums onto production tables.

### 2.9 Background jobs

- Production generation often returns **202** and continues via `@vercel/functions` `waitUntil`.
- Env: `TAKEOFF_GENERATE_ASYNC`, `TAKEOFF_GENERATE_SYNC`, `TAKEOFF_ASYNC_*`, `VERCEL`.
- Lab must **not** mount into this Vercel worker path. Lab takeoff should be sync or lab-local async on loopback only.

### 2.10 Structured model (rooms / pieces / measurements)

Canonical contract: `TakeoffResult` (`schemaVersion: "1.0"`).

```
TakeoffResult
  rooms[] → TakeoffRoom
    areas[] → TakeoffArea (countertop | backsplash | fhb | peninsula | island)
      runs[] → TakeoffRun { lengthIn, depthIn, shape, pieceType, evidence ids… }
      cutouts[], exclusions[], cornerDeductions[], backsplash*
  confidence, warnings[], aiProvidedTotals?, source?
```

**Piece types:** `counter` | `splash` | `fhb`  
**Run shapes (calc):** `rect` | `tri`  
**Import/group shapes (IE):** `straight` | `L-Shape` | `U-Shape` | `Galley` | `Island` | `Backsplash` | `Waterfall` | `manual`

### 2.11 Evidence / confidence

- Pass 2 builds a dimension-evidence table (ids, labels, values, units, confidence, page).
- Runs may reference `lengthEvidenceId` / `depthEvidenceId` / `evidenceIds`.
- Confidence: `high` | `medium` | `low` on rooms/runs; `requiresEstimatorReview` when unclear.
- Reconciliation produces unsupported / conflicting / unused-dimension findings.

### 2.12 Review, correction, approval

- Corrections persist via production `POST .../corrections` → resets `needs_review`.
- Approval via `evaluateTakeoffApprovalGate` + server re-validate on `POST .../approve`.
- Approve does **not** import; import is a separate IE route with beta confirmation text.

### 2.13 `takeoff_import_v1` snapshot

Built by `buildTakeoffImportPayload()` (`TAKEOFF_IMPORT_SCHEMA_VERSION = "takeoff_import_v1"`).

Contains: job/result ids, approved-by metadata, totals (exact + chargeable), rooms/pieces, suggested add-ons, warnings, audit.

Stored on IE quotes under `calculation_snapshot.internal_ui.takeoff_import`.  
**Lab must never call the import route or write this onto `quote_headers`.** A lab-local “reviewed takeoff snapshot” may mirror useful fields but must be a **distinct** schema/namespace (e.g. `qil_reviewed_takeoff_v1`).

### 2.14 Production environment variables

| Variable | Notes |
|----------|-------|
| `TAKEOFF_AI_ENABLED` | Master switch (`"1"`) |
| `TAKEOFF_AI_PROVIDER` | `openai` \| `gemini` \| `exayard` |
| `OPENAI_API_KEY` / `TAKEOFF_AI_MODEL` | OpenAI path |
| `GEMINI_API_KEY` / `GEMINI_TAKEOFF_MODEL` | Gemini path (default model historically `gemini-2.5-pro`) |
| `EXAYARD_*` | Exayard path |
| `TAKEOFF_GENERATE_ASYNC` / `SYNC` / `ASYNC_*` | Job scheduling |
| `SUPABASE_SERVICE_ROLE_KEY` | Downloads private plan files — **never in browser; never for lab prod tables** |
| Frontend `VITE_SUPABASE_*`, `VITE_BACKEND_URL` | Takeoff head only |

Lab Phase 4B should use **separate** `QIL_TAKEOFF_*` (or extend existing `QIL_*`) vars — not silently share `TAKEOFF_AI_*` / production Storage.

### 2.15 Tests and fixtures

Notable pure/fixture assets:

- `backend-core/src/takeoff/fixtures/spec73.fixture.mjs` — known-good kitchen (safe read-only)
- Extensive `*.test.mjs` for calc, validator, gates, import payload, reconciliation

Integration tests that mock Supabase/Vercel/providers must not be reused to drive lab persistence.

---

## 3. Exact production coupling

| Coupling | Mechanism | Lab impact |
|----------|-----------|------------|
| Auth + head gate | `requireAuth` + `ai_takeoff` head access | Lab UI must not call these routes |
| Org scope | `organization_id` on jobs/files/results | Lab stays local IDB / future lab tables only in early 4B |
| Storage | Service-role signed download of `eliteos-quote-files` | Lab uses IndexedDB attachment bytes already stored in Phase 2 |
| Persistence | Writes `quote_takeoff_*` | Forbidden |
| Async infra | Vercel `waitUntil` | Forbidden |
| IE import | `importInternalEstimateFromTakeoff` → `calculateQuote` + `persistQuoteSubmission` | Forbidden |
| Pricing | Import path runs calculator; materials TBD | Lab Phase 4 must not price |
| Monday | Import sets `skipMondaySync: true` but still creates quote | Lab still must not call import |

---

## 4. Exact do-not-touch areas

### 4.1 Applications

- `app-ai-takeoff/**` (behavior/source)
- `app-internal-estimate/**` (especially Takeoff* panels)
- `app-quote/**`, `app-quote-library/**`, `app-home/**`, `app-visualizer/**`
- Production launcher registration

### 4.2 Routes / APIs

- Entire `/api/takeoff-jobs/*` and `/api/takeoff/*` / `/api/takeoff-beta/*`
- `POST /api/internal-quotes/import-from-takeoff`
- `POST /api/internal-quotes/:id/detach-takeoff-import`
- Any quote persist / library / delivery routes

### 4.3 Tables / storage

- `quote_takeoff_jobs`, `quote_takeoff_results`
- `quote_files`, `quote_file_events`
- `eliteos-quote-files` bucket
- `quote_headers`, `quote_measurement_sources`, `quote_visual_layouts`

### 4.4 Modules that must never be imported into the lab

- `takeoffWorkspaceRoutes.js`
- `takeoffWorkspaceService.mjs`
- `takeoffExtractionService.mjs`
- `takeoffGenerationOrchestrator.mjs` / `takeoffProcessOrchestrator.mjs`
- `geminiTakeoffProvider.mjs` / `openAiTakeoffProvider.mjs` / `exayard*` / `takeoffAiProvider.mjs`
- `internalQuoteTakeoffImport.mjs` (+ detach/checklist IE writers)
- Frontend Supabase clients from Takeoff / IE heads

### 4.5 Brain / server.js

- Do **not** modify `backend-core/server.js` for Phase 4B takeoff (same Option B isolation as Phase 3.1).
- Unmounted note file `backend-core/src/quoteIntakeLab/phase31LiveBoundary.mjs` remains documentation-only unless a later phase re-decides Brain hosting.

---

## 5. Safe reusable modules

**Preferred reuse (read-only import, no edits in 4B unless tests stay green):**

1. `takeoffContract.mjs` — schema constants / factories  
2. `takeoffMeasurementCalc.mjs` — **authoritative SF**  
3. `takeoffValidator.mjs`  
4. `takeoffApprovalGate.mjs` (lab “accept takeoff” can mirror subset of blockers)  
5. `takeoffQaGate.mjs`  
6. `takeoffFabricationRules.mjs`  
7. `takeoffReviewStatus.mjs` / `takeoffEvidenceRunReconciliation.mjs` / `reviewedTakeoffMath.mjs`  
8. `fixtures/spec73.fixture.mjs` — synthetic expected geometry for adapter unit tests  

**Pattern reuse only (do not import modules):**

- Gemini REST + query-key auth + never-log-URL (as in `geminiTakeoffProvider` and lab `geminiJsonClient`)
- Explicit user acknowledgment before sending bytes
- Loopback bind + lab request token (Phase 3.1 server)

**Do not “reuse” by calling production HTTP or writing production tables.**

---

## 6. Proposed TakeoffAdapter contract (not implemented)

Aligns with ARCHITECTURE §7.2 but expands types for Phase 4B.

### 6.1 Interfaces (TypeScript sketch)

```ts
/** Lab-local attachment reference — bytes never leave via production Storage. */
type TakeoffAttachment = {
  attachmentId: string;
  caseId: string;
  filename: string;
  contentType: string;          // application/pdf | image/*
  sizeBytes: number;
  contentHash: string;          // sha256 of local bytes
  source: "imported_eml" | "manual_paste" | "synthetic_fixture";
  approvedForTransmission: boolean;  // user ack recorded before send
};

type TakeoffRequest = {
  caseId: string;
  runId?: string;               // server-assigned if omitted
  attachment: TakeoffAttachment;
  /** Hints from accepted classification snapshot (non-authoritative). */
  classificationHints?: {
    statedSquareFootage?: number | null;
    sinkCutoutCount?: number | null;
    edgeProfile?: string | null;
    backsplashDescription?: string | null;
    projectName?: string | null;
  };
  actorLabel: string;
  /** Must be true — synthetic plans only for first live tests. */
  syntheticPlanAcknowledged: boolean;
  liveTransmissionAcknowledged: boolean;
};

type TakeoffPage = {
  pageNumber: number;
  role?: "plan" | "elevation" | "schedule" | "other" | "unknown";
  notes?: string[];
};

type TakeoffEvidence = {
  id: string;
  pageNumber: number;
  label: string;
  value: number | string | null;
  unit?: string | null;
  confidence?: "high" | "medium" | "low";
  locationNote?: string | null;
  excerpt?: string | null;      // safe short text; never store full model dump
};

type TakeoffMeasurement = {
  lengthIn: number | null;
  depthIn: number | null;
  shape: "rect" | "tri";
  pieceType: "counter" | "splash" | "fhb";
  /** Deterministic — never trust model SF for this field. */
  exactSf: number;
  evidenceIds?: string[];
};

type TakeoffPiece = {
  id: string;
  label: string;
  roomId: string;
  areaId?: string;
  measurement: TakeoffMeasurement;
  cutouts?: Array<{ type: string; label?: string; confidence?: string }>;
  notes?: string[];
  requiresEstimatorReview?: boolean;
};

type TakeoffRoom = {
  id: string;
  name: string;
  roomType?: string;
  sourcePages?: number[];
  confidence?: "high" | "medium" | "low";
  pieces: TakeoffPiece[];
  /** Deterministic room rollup from pieces. */
  exactCountertopSf: number;
  exactBacksplashSf: number;
};

type TakeoffWarning = {
  code: string;
  severity: "blocking" | "informational";
  stage: "inventory" | "evidence" | "extraction" | "normalize" | "calc" | "gate";
  message: string;
  path?: string | null;
  estimatorActionRequired: boolean;
};

type TakeoffCorrection = {
  id: string;
  at: string;
  actorLabel: string;
  path: string;                 // e.g. rooms[0].pieces[1].measurement.lengthIn
  before: unknown;
  after: unknown;
  note?: string | null;
};

type TakeoffRun = {
  id: string;
  caseId: string;
  attachmentId: string;
  attachmentContentHash: string;
  providerName: string;
  providerMode: "live" | "simulated" | "fixture";
  providerVersion: string;
  startedAt: string;
  completedAt: string | null;
  status: "queued" | "processing" | "completed" | "needs_manual" | "failed";
  humanReviewState: "unreviewed" | "corrected" | "accepted" | "superseded";
  pages: TakeoffPage[];
  rooms: TakeoffRoom[];
  evidence: TakeoffEvidence[];
  warnings: TakeoffWarning[];
  corrections: TakeoffCorrection[];
  /** Deterministic totals — authoritative for lab SF display. */
  totals: {
    countertopExactSf: number;
    backsplashExactSf: number;
    combinedExactSf: number;
    sinkCutoutCount: number;
    chargeableCountertopSf?: number;
    chargeableBacksplashSf?: number;
  };
  /** Optional AI-declared totals — audit only. */
  aiProvidedTotals?: {
    countertopExactSf?: number | null;
    backsplashExactSf?: number | null;
    combinedExactSf?: number | null;
  } | null;
  confidence?: "high" | "medium" | "low" | null;
  /** Optional: store production-shaped TakeoffResult JSON for calc/validate reuse. */
  contractResult?: unknown;
  failure?: { code: string; message: string } | null;
  acceptedSnapshotId?: string | null;
};

type ReviewedTakeoffSnapshot = {
  id: string;
  schemaVersion: "qil_reviewed_takeoff_v1";
  caseId: string;
  runId: string;
  acceptedAt: string;
  acceptedBy: string;
  attachmentContentHash: string;
  rooms: TakeoffRoom[];
  totals: TakeoffRun["totals"];
  evidence: TakeoffEvidence[];
  warnings: TakeoffWarning[];
  corrections: TakeoffCorrection[];
  note: string; // e.g. "Lab reviewed takeoff — does not import Internal Estimate or Quote Library."
};

interface TakeoffAdapter {
  /** Enqueue or run; must require both ack flags for live byte transmission. */
  run(req: TakeoffRequest): Promise<{ ok: boolean; runId: string; status: TakeoffRun["status"] }>;
  getRun(runId: string): Promise<TakeoffRun | null>;
  listRuns(caseId: string): Promise<TakeoffRun[]>;
  applyCorrections(
    caseId: string,
    runId: string,
    corrections: Array<{ path: string; value: unknown; note?: string }>
  ): Promise<{ ok: boolean }>;
  /**
   * Accept freezes ReviewedTakeoffSnapshot in lab persistence only.
   * Must NOT call import-from-takeoff, calculateQuote, or quote persist.
   * Blocking warnings / empty geometry prevent acceptance.
   */
  accept(
    caseId: string,
    runId: string,
    opts?: { actorLabel?: string }
  ): Promise<{ ok: boolean; snapshotId: string }>;
  getAcceptedSnapshot(caseId: string): Promise<ReviewedTakeoffSnapshot | null>;
}
```

### 6.2 Minimum result for Elite 100 quoting (lab)

Required before case can leave takeoff toward `qil_ready_for_review`:

| Field | Source of truth |
|-------|-----------------|
| Rooms/areas | Human-reviewed structure (AI draft OK) |
| Countertop pieces | Runs/pieces with length + depth |
| Length & depth (inches) | Evidence-backed or human-corrected |
| Piece exact SF | **`sfFromRun` / `computeTakeoffMeasurements`** |
| Total countertop SF | Deterministic rollup |
| Sink cutout count | Cutouts array (+ classification hint cross-check) |
| Edge / perimeter | When supported; else missing/unreadable flag |
| Backsplash measurements | Scope + linear/height or splash runs; deterministic SF |
| Evidence / source locations | Evidence ids + pages |
| Confidence | Room/run level + overall |
| Contradictions | Warnings + reconciliation findings |
| Missing / unreadable dims | Blocking warnings / `needs_manual` |
| Human corrections | Append-only on run |
| Approval state | `humanReviewState` + snapshot |

### 6.3 Authority rule (non-negotiable)

1. **Gemini** extracts evidence and proposed geometry (draft).  
2. **eliteOS** deterministically calculates square footage (`takeoffMeasurementCalc`).  
3. **Estimator** verifies and accepts a lab snapshot.  
4. **AI is never authoritative** for SF, pricing, IE import, or Quote Library.

---

## 7. Proposed lab data model

Early Phase 4B (matches Phase 2–3.1 local-first approach):

| Store (IndexedDB v3+ or memory) | Purpose |
|----------------------------------|---------|
| `takeoffRuns` | `TakeoffRun` history keyed by case |
| `reviewedTakeoffSnapshots` | Accepted frozen snapshots |
| `takeoffAuditEvents` | Start / complete / correct / accept |
| Case overlay fields | `latestTakeoffRunId`, `acceptedTakeoffSnapshotId`, proposed SF from deterministic totals, sink count |

Later (optional staging Supabase): `quote_intake_lab_takeoff_runs` etc. — **never** `quote_takeoff_*`.

Attachment bytes remain in existing Phase 2 local blob store; takeoff reads by `attachmentId` + verifies `contentHash`.

---

## 8. Proposed state machine (lab case)

```
qil_intake_review | qil_manual_review | qil_processing_attachments
        │  (estimator selects plan + acks + Run takeoff)
        ▼
qil_takeoff_processing
        │
        ├─ success + reviewable geometry → overlay measurements; stay for review UI
        │       → (accept takeoff snapshot) → qil_ready_for_review
        ├─ weak / unreadable → qil_needs_manual_takeoff
        └─ hard failure → qil_failed (or soft-fail restore prior status, same as Phase 3.1 live)
```

Rules:

- Takeoff only after classification snapshot acceptance (or explicit 4B decision: allow from `qil_intake_review` with accepted classification).
- Accept takeoff ≠ IE import ≠ quote create ≠ pricing.
- Production Takeoff workflow statuses are not written.

---

## 9. Attachment-transmission security

| Control | Requirement |
|---------|-------------|
| Scope | Single **selected** attachment per run; hash logged |
| First live tests | **Synthetic / fixture plans only** (example.com cases + lab fixtures) |
| User ack | Checkbox: bytes will be sent to Gemini via loopback lab server |
| Transport | Lab intelligence server only (`127.0.0.1`); not Brain; not `/api/takeoff-jobs` |
| Credentials | Server-only `QIL_*` key; never `VITE_*` Gemini key |
| Logging | No URL-with-key, no full PDF dump, no raw model chain-of-thought |
| Audit | contentHash, filename, size, actor, timestamps, provider mode/version |
| Production Storage | Never upload lab plans to `eliteos-quote-files` |
| Classification parallel | Classification remains text/metadata-only; takeoff is the only byte-sending path |

---

## 10. Deterministic calculation boundary

| Step | Owner |
|------|-------|
| Page roles / dimension table / proposed runs | Model (draft) |
| Normalize into contract-shaped `TakeoffResult` | Lab normalize (additive) |
| Exact SF / chargeable SF / rollups | `computeTakeoffMeasurements` |
| Diagnostics | `validateTakeoffResult` |
| Evidence conflicts | `reconcileRunsWithEvidence` (optional 4B) |
| Display SF on case | From deterministic totals only |
| AI totals | Stored under `aiProvidedTotals` for comparison; never priced |

---

## 11. Estimator review boundary

- Confirm / edit length, depth, piece type, room names, cutouts, backsplash scope.
- Mark unknown / needs manual.
- Blocking validation warnings (invalid geometry, schema integrity) prevent accept.
- Informational warnings remain visible in run history (same philosophy as Phase 3.1.1).
- Acceptance writes `ReviewedTakeoffSnapshot` + case overlay; does **not** call IE import or pricing.

---

## 12. Recommended isolated execution architecture

### Recommendation: **Extend the existing loopback lab server (port 5197)** — Option B+

| Option | Verdict |
|--------|---------|
| **A. Call production `/api/takeoff-jobs/*`** | Rejected — production coupling |
| **B. Extend `app-quote-intake-lab/server` (5197)** | **Recommended** |
| **C. Separate loopback takeoff process (e.g. 5198)** | Acceptable if 5197 becomes too heavy; more ops overhead |
| **D. Import `geminiTakeoffProvider` / extraction service into lab** | Rejected — pulls Storage/Supabase/Vercel coupling |
| **E. Mount routes in `server.js`** | Rejected for Phase 4B |

**Why B:**

- Same security envelope as Phase 3.1: loopback bind, Origin allowlist, lab request token, disabled-by-default flag.
- Classification stays text-only on `/classify`; takeoff adds e.g. `POST /takeoff` with explicit size limits and ack checks.
- Pure calc/validate modules imported read-only from `backend-core/src/takeoff/*.mjs`.
- Provider transport **replicated additively** (new `geminiTakeoffLabClient.mjs` under lab server) following REST pattern — **not** importing production provider modules.
- No `server.js` change; production Takeoff head unchanged.

**Lab env (proposed names — implement in 4B):**

- `QIL_TAKEOFF_AI_ENABLED=false` (default)
- `QIL_TAKEOFF_MODEL` (explicit; no hardcoded model in source)
- `QIL_GEMINI_API_KEY` (existing lab key) / opt-in shared key only with explicit flag
- Existing `QIL_LAB_REQUEST_TOKEN`, `QIL_ALLOWED_ORIGIN`

---

## 13. Recommended Phase 4B implementation slices

Execute only after Phase 4A acceptance. Stop between slices for review.

| Slice | Deliverable | Must not |
|-------|-------------|----------|
| **4B.0** | Adapter interfaces + simulated/fixture provider returning contract-shaped geometry (e.g. spec73) | No Gemini, no bytes |
| **4B.1** | IDB/memory persistence for runs/snapshots; case overlay SF from deterministic calc | No production tables |
| **4B.2** | Lab UI: select local attachment, synthetic-only gate, ack, run, show rooms/pieces/SF/evidence/warnings | No production API |
| **4B.3** | Corrections + accept snapshot → `qil_ready_for_review` / `qil_needs_manual_takeoff` | No IE import |
| **4B.4** | Loopback `/takeoff` endpoint + additive Gemini client; sync only; synthetic plans | No Brain mount |
| **4B.5** | Optional: evidence reconciliation + approval-gate subset; smoke with paid synthetic plan | No production Storage |
| **4B.6** | Regression: production takeoff unit tests still pass if any pure module was touched; lab tests for adapter | Do not “fix forward” by editing IE |

**Explicitly out of 4B:** pricing, Quote Library, Outlook/Resend, Home Launcher, Visualizer, Internal Estimate import UX.

---

## 14. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Accidental call to production takeoff routes | High | Adapter has no backend-core route client; CI grep ban |
| Accidental IE import | Critical | Never import `internalQuoteTakeoffImport`; accept ≠ import |
| Editing pure modules breaks Takeoff Lab / IE | High | Prefer no edits; if required, run takeoff `*.test.mjs` + manual IE import smoke |
| Sending customer PDFs too early | High | Synthetic-only gate + ack + hash audit |
| Confusing lab SF with AI totals | Medium | UI provenance (Phase 3.1.1 pattern); hide AI totals or label audit-only |
| Prompt/schema drift from production | Medium | Document lab prompt versions; optional reuse of prompt builders read-only |
| Blob size / Gemini limits (20 MB class) | Medium | Preflight size/type checks |
| Async complexity | Medium | Sync-only on loopback until proven |

---

## 15. Unresolved questions

1. **Classification prerequisite:** Must a classification snapshot be accepted before takeoff, or may takeoff run from `qil_intake_review` with unreviewed fields?  
2. **Multi-attachment plans:** First live tests = one PDF; multi-page vs multi-file policy?  
3. **Prompt strategy:** Reuse production prompt modules verbatim vs lab-versioned forks (`qil-takeoff-extract-v1`)?  
4. **Edge/perimeter:** Production extraction support level vs lab MVP “flag missing”?  
5. **Staging Supabase timing:** Stay IDB-only through 4B or introduce `quote_intake_lab_takeoff_*`?  
6. **Shared Gemini key:** Continue requiring `QIL_ALLOW_SHARED_GEMINI_KEY` for shared `GEMINI_API_KEY`?  
7. **Chargeable vs exact SF** in lab quoting path (Phase 5+): mirror production ceiling rule now?

---

## 16. Stop conditions

Stop Phase 4B implementation immediately if any of the following occur:

- Any write to `quote_takeoff_jobs` / `quote_takeoff_results` / `quote_files` / `eliteos-quote-files`
- Any call to `import-from-takeoff` or quote persist
- Production Takeoff head behavior/regression without intentional approved refactor
- Gemini key appears in `VITE_*` or browser bundle
- Non-synthetic customer plans transmitted without explicit product approval
- `server.js` modified to mount takeoff/intake routes without architecture re-approval

---

## 17. Rollback strategy

| Layer | Rollback |
|-------|----------|
| Lab adapter / UI | Feature-flag off; case paths skip to `qil_needs_manual_takeoff` |
| Lab server `/takeoff` | Set `QIL_TAKEOFF_AI_ENABLED=false`; stop process |
| IDB stores | Clear lab takeoff object stores; does not affect fixtures/classification unnecessarily if keyed separately |
| Pure module edits (if any) | `git revert` + re-run takeoff unit tests |
| Production | Should be unchanged — verify by not deploying lab-related Brain changes |

---

## 18. Classification legend (quick reference)

| Tag | Meaning |
|-----|---------|
| Safe read-only import | Inspect / copy patterns; do not bind runtime to production side effects |
| Safe pure-module reuse | Import `.mjs` with no I/O; do not modify without takeoff regression tests |
| Must be wrapped | Concepts OK behind lab adapter; do not call production writers |
| Must be replicated additively | New lab code following pattern (Gemini REST, orchestration) |
| Production-coupled — do not use | Requires Supabase/Storage/Vercel/IE |
| Do not touch under any circumstances | Live product surfaces — IE import UI, Takeoff head source, import route |

---

## 19. Confirmations (Phase 4A)

- Existing AI Takeoff is **live and production-connected**, not disposable.
- Lab pathway will process **local attachment bytes** through an **isolated loopback server**, reuse **pure calc/validate**, and store results only in **lab persistence**.
- Lab will **never** write existing takeoff tables, call Internal Estimate import, write Quote Library, or calculate customer pricing in Phase 4B.
- **No source code was modified** in Phase 4A; only this document was added.
