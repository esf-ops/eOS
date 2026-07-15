# Phase 6P.0 — Takeoff Integration Map

**Date:** 2026-07-15
**Status:** Analysis only
**Related:** [`PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md`](./PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md)

---

## 1. Exact live execution path (inspected)

```
Authenticated upload (app-ai-takeoff)
  POST /api/quote-files/upload-intent     → createQuoteFileUploadIntent
  PUT  signed Storage URL                 → browser → eliteos-quote-files
  POST /api/quote-files/confirm-upload    → confirmQuoteFileUpload
  POST /api/takeoff-jobs                  → createTakeoffWorkspace
        inserts quote_takeoff_jobs (quote_id null OK)
        links quote_files.takeoff_job_id
  POST /api/takeoff-jobs/:id/generate-ai-draft
        → startAiTakeoffGeneration
        → runAiTakeoffExtraction
            download file (service role)
            Pass 1: runPageInventory
            Pass 2: runDimensionEvidence
            Pass 3: extraction provider
            normalize → computeTakeoffMeasurements
            validateTakeoffResult / QA gate
            planTakeoffImport (planning only — not IE write)
            persist quote_takeoff_results + job status
  Client polls GET /api/takeoff-jobs/:id
  Review: corrections/results saves
  Approve: POST /api/takeoff-jobs/:id/approve
        → evaluateTakeoffApprovalGate
        → review_status = approved
        → does NOT write quote_headers
  OPTIONAL (separate route family):
  POST /api/internal-quotes/import-from-takeoff
        → assertBetaImportConfirmed
        → calculateQuote + persistQuoteSubmission
        → quote_headers + calculation_snapshot
```

---

## 2. Route & module inventory

### 2.1 Routes — `backend-core/src/takeoff/takeoffWorkspaceRoutes.js`

Mounted via `attachTakeoffWorkspaceRoutes` from `backend-core/src/server.js`.
Gate: `requireAuth()` + `requireHeadAccess("ai_takeoff")`.

| Method | Path |
|--------|------|
| GET | `/api/takeoff/config` |
| POST/GET | `/api/takeoff-jobs` |
| GET | `/api/takeoff-jobs/:id` |
| POST | `/api/takeoff-jobs/:id/process` |
| POST | `/api/takeoff-jobs/:id/generate-ai-draft` |
| POST | `/api/takeoff-jobs/:id/resume-exayard` |
| POST | `/api/takeoff-jobs/:id/results` |
| POST | `/api/takeoff-jobs/:id/corrections` |
| POST | `/api/takeoff-jobs/:id/approve` |
| GET | `/api/takeoff-jobs/:id/results/latest` |
| GET | `/api/takeoff-jobs/:id/results` |
| GET | `/api/takeoff-jobs/:id/results/:resultId` |
| POST | `…/review-started`, `…/import-cancelled`, `…/feedback`, `…/issue-report` |
| GET | `/api/takeoff-beta/qa-summary` |

### 2.2 IE import routes — `backend-core/src/quotes/internalQuotesApi.js`

| Method | Path | Module |
|--------|------|--------|
| POST | `/api/internal-quotes/import-from-takeoff` | `internalQuoteTakeoffImport.mjs` |
| POST | `/api/internal-quotes/:id/detach-takeoff-import` | `internalQuoteTakeoffDetach.mjs` |

### 2.3 Core services

| Module | Role |
|--------|------|
| `takeoffWorkspaceService.mjs` | create/list/get/save/correct/approve |
| `takeoffGenerationOrchestrator.mjs` | sync/async generation wrapper (`waitUntil`) |
| `takeoffExtractionService.mjs` | multi-pass AI orchestration |
| `takeoffProcessOrchestrator.mjs` | processing phases + stub worker |
| `quoteFileService.mjs` | upload intent / confirm / download URLs |
| `takeoffAiProvider.mjs` | provider factory + `TAKEOFF_AI_ENABLED` |
| `geminiTakeoffProvider.mjs` / `openAiTakeoffProvider.mjs` / `exayard*` | live providers |

### 2.4 Pure / reusable (safe to call)

`takeoffContract.mjs`, `takeoffMeasurementCalc.mjs`, `takeoffValidator.mjs`, `takeoffApprovalGate.mjs`, `takeoffQaGate.mjs`, `takeoffWorkflowState.mjs`, `takeoffFabricationRules.mjs`, `takeoffImportPlanner.mjs`, `takeoffImportPayload.mjs`, related measurement/review helpers.

### 2.5 Classification of modules for intake

| Class | Modules | Intake rule |
|-------|---------|-------------|
| Pure reusable | calc, validators, gates | May be imported freely |
| Safe via adapter | `createTakeoffWorkspace`, generation start helpers | Call from server adapter |
| Tightly coupled | Vercel `waitUntil` orchestrator | Use existing entry; don’t fork |
| Production-sensitive | providers, storage downloads, routes | Server-only; never browser |
| **Prohibited from intake automation** | `importInternalEstimateFromTakeoff`, `assertBetaImportConfirmed` as something to bypass, Quote Library APIs, `quoteDelivery` | Never call / never automate |

---

## 3. Status values (production Takeoff)

| Field | Values |
|-------|--------|
| `quote_takeoff_jobs.status` | `pending` \| `processing` \| `completed` \| `failed` \| `cancelled` |
| `review_status` | `needs_review` \| `in_review` \| `approved` \| `rejected` \| `superseded` |
| Processing phases | `queued` → `download` → `page_inventory` → `dimension_evidence` → `extraction` → `normalize` → `persist` → `done` |
| QA gate | `ready_for_review` \| `needs_review` \| `do_not_import` |

---

## 4. Ownership / org scoping

- `resolveOrganizationContext({ mode: "authenticated" })` — org **never** from client body
- All queries `.eq("organization_id", organizationId)`
- `storage_path` never returned to clients
- Cross-org → 403/404

---

## 5. Environment flags (existing)

| Env | Effect |
|-----|--------|
| `TAKEOFF_AI_ENABLED=1` | Master AI enable |
| `TAKEOFF_AI_PROVIDER` | `openai` \| `gemini` \| `exayard` |
| `TAKEOFF_GENERATE_SYNC` / `ASYNC` / `VERCEL` | Sync vs background |
| `TAKEOFF_ASYNC_STUB` | Non-prod stub only |
| `TAKEOFF_ASYNC_WORKER_ENABLED` | External worker (not implemented) |
| Provider API keys | Server-only |

---

## 6. Hard IE / pricing / Quote Library boundary

| Stage | Ends / begins | Writes |
|-------|---------------|--------|
| Takeoff processing | Completes with job/result rows | `quote_takeoff_*`, file events |
| Takeoff approval | `review_status=approved`; `canImport:true` **signal only** | Still **no** `quote_headers` |
| **`import-from-takeoff` begins** | Separate authenticated POST + `betaImportConfirmed:true` | `quote_headers`, `calculation_snapshot`, quote number allocation, back-fill FKs, audit |
| Pricing begins | Inside import via `calculateQuote` | pricing engine outputs into snapshot |
| Quote Library visibility | When quote enters library workflows | library APIs — **not** takeoff routes |

### Guard design for Quote Intake automation

Intake automation code **must**:

1. Never import `internalQuoteTakeoffImport.mjs` into the automatic path.
2. Never HTTP-call `/api/internal-quotes/import-from-takeoff`.
3. Never write `quote_headers` / Quote Library tables.
4. Never call `calculateQuote` / `persistQuoteSubmission` for intake.
5. Never invoke `quoteDelivery` / Resend customer send.
6. Carry a compile-time / lint allowlist of callable takeoff symbols (implementation slice).
7. Feature-flag `QUOTE_INTAKE_IE_PROMOTION_ENABLED=0` (pilot default) checked if any future bridge is added.

Pilot UI may hide the Import task panel for intake-originated jobs if distinguishable via metadata — but **server prohibition** is authoritative.

---

## 7. TakeoffAdapter seam comparison

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Internal service invocation** | Same functions as routes; no self-HTTP; injectable mocks; single process | Must carefully wrap flags and identity | **Recommended** |
| B. HTTP `/api/takeoff-jobs/*` | Reuses middleware as-is | Latency; token/service-user complexity; fragile self-calls on Vercel | Avoid for automation |
| C. Fork pipeline | Isolation illusion | Drift; duplicate prompts/providers; architecture violation | **Rejected** |

### Recommended seam: Option A — `ProductionTakeoffAdapter`

Server-only module (new under intake package) that calls:

1. Storage ingest for the validated attachment (same `quote_files` helpers or intake-specific upload that produces a `quoteFileId`)
2. `createTakeoffWorkspace({ supabase, organizationId, userId|systemActor, quoteFileId })`
3. `startAiTakeoffGeneration` / equivalent to kick `runAiTakeoffExtraction`
4. Persist `quote_intake_takeoff_links` with job id + SHA-256 + automation decision id
5. Poll/read via `getTakeoffWorkspace` / latest result services
6. **Never** call import helpers

Preserve existing HTTP route contracts for interactive users unchanged.

### Proposed adapter contract (intake-owned)

```ts
// Conceptual — not implemented in 6P.0
interface ProductionTakeoffAdapter {
  createFromIntake(req: {
    organizationId: string;
    intakeCaseId: string;
    intakeAttachmentId: string;
    quoteFileId: string;
    actor: { type: "system" | "user"; userId?: string; automationDecisionId: string };
    initiationMode: "automatic" | "manual";
    idempotencyKey: string; // e.g. intakeCaseId + sha256 + revision
  }): Promise<{ ok: true; takeoffJobId: string } | { ok: false; reason: string }>;

  getJobStatus(takeoffJobId: string, organizationId: string): Promise<JobStatusView>;
  getLatestResult(takeoffJobId: string, organizationId: string): Promise<ResultView | null>;
  listLinkedJobs(intakeCaseId: string): Promise<LinkRow[]>;
  // Explicit absence:
  // importToInternalEstimate — MUST NOT EXIST on this interface
}
```

Lab’s local interface (`run` / `getRun` / `listRuns` in `app-quote-intake-lab/src/takeoff/takeoffTypes.mjs`) remains for fixtures/tests. Production adapter is a **new** server interface that maps to live tables — not a browser import of providers.

**Credentials:** remain server-side only. Never import Gemini/OpenAI providers into `app-ai-takeoff` or browser bundles for intake.

---

## 8. Intake-to-takeoff linkage (proposed additive model)

Conceptual table: `quote_intake_takeoff_links`
*(Not final; no migration in 6P.0.)*

| Field | Purpose |
|-------|---------|
| `id` | PK |
| `organization_id` | Tenant scope |
| `intake_case_id` | FK → intake case |
| `takeoff_job_id` | FK → `quote_takeoff_jobs.id` |
| `source_message_id` | Graph immutable id / lab message id |
| `source_attachment_id` | Intake attachment row |
| `attachment_sha256` | Content identity |
| `relationship_status` | `requested` \| `queued` \| `processing` \| `ready` \| `manual_review` \| `failed` \| `superseded` |
| `initiation_mode` | `automatic` \| `manual` |
| `automation_decision_id` | FK → decision audit row |
| `idempotency_key` | Unique per org |
| `created_by` / `created_by_actor_type` | User vs system |
| `created_at` / `completed_at` | Timestamps |
| `latest_result_id` | Optional pointer |
| `reviewed_snapshot_id` | Later |
| `revision_parent_link_id` | Revision chain |
| `audit_metadata` | jsonb (no PII dump) |

**Rules:**

- One case may have retries and revisions; prior jobs remain visible.
- Unique constraint on active `(organization_id, intake_case_id, attachment_sha256, revision_key)` or equivalent idempotency key.
- Do **not** overload `quote_takeoff_jobs` with email-specific columns unless unavoidable; use linkage table + optional `metadata.intake` markers for UI filtering.
- Linkage **never** implies Internal Estimate import.

---

## 9. Frontend host map (`app-ai-takeoff`)

| Concern | Finding | 6P implication |
|---------|---------|----------------|
| Router | None — monolithic `TakeoffLabApp` | Add `activeView: workbench \| intake` (or query `view=`) |
| Default | Upload + `TakeoffRunInbox` | Unchanged |
| Deep link | `?takeoffJobId=` | Keep; queue links into it |
| Auth | Shared Supabase cookie + `/api/me` | Reuse |
| Head gate | Backend `ai_takeoff` | Queue APIs need additional pilot gate |
| Import UI | `TakeoffImportPreview` calls IE import | Hide/disable for intake-origin jobs; never auto-call |

### Queue UI promotion mapping (first live proof)

| Lab concept | Live home |
|-------------|-----------|
| Queue summary / filters / table | New Estimator Queue tab |
| Case detail + email + attachments | Queue detail panel |
| Classification + missing info + automation decision | Queue detail (read-heavy) |
| Takeoff status / history | Link rows + deep-link to existing job |
| Full correction UI | **Defer** — use existing Takeoff review |
| Audit timeline | Queue detail / later |

---

## 10. Async / runtime

- Production generation: Vercel `waitUntil`, `maxDuration` ~300s (`vercel.json`)
- External worker (`TAKEOFF_ASYNC_WORKER_ENABLED`) **not implemented**
- Intake should use the same generation entry the interactive path uses
- Monitor timeout for multi-page plans

---

## 11. What intake automation may and may not touch

| May | Must not |
|-----|----------|
| Create/link `quote_files` for validated PDF | Call IE import |
| Create `quote_takeoff_jobs` via service | Write `quote_headers` |
| Trigger generate-ai-draft path | Pricing / Quote Library / customer email |
| Read job/result for queue status | Mutate other orgs |
| Store `quote_intake_*` rows | Bypass approval gates |
| Record system actor audit | Expand Graph permissions beyond Mail.Read |

---

## 12. Authorized later bounded refactor surfaces

**Allowed in later 6P slices (with tests; no regression):**

- `app-ai-takeoff` — additive Queue tab/view, pilot gating, deep-link params
- New `backend-core/src/quoteIntake/**` (or similar) — routes, Graph, automation
- Thin wrappers around `createTakeoffWorkspace` + generation start
- Optional non-breaking `metadata.intake` on jobs for filtering
- Additive `quote_intake_*` migrations (6P.2+)

**Still prohibited without separate explicit phase:**

- Changing IE import semantics
- Auto-confirming `betaImportConfirmed`
- Merging intake rows into quote tables
- Customer outbound mail
- Weakening `requireHeadAccess` / org scoping
