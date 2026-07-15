# Phase 6P.0 — Implementation Plan

**Date:** 2026-07-15  
**Status:** Planning only — **do not start 6P.1 in this phase**  
**Principle:** Small, reversible slices. Automate preparation, not approval.

---

## 1. Decisions locked by 6P.0 analysis

| Decision | Choice |
|----------|--------|
| Queue host | **Option B** — Estimator Queue tab/view in `app-ai-takeoff`; default workbench unchanged; query-param deep links |
| Takeoff seam | **Option A** — Internal service invocation via `ProductionTakeoffAdapter` (no pipeline fork; avoid self-HTTP) |
| Persistence | Additive `quote_intake_*` in existing production Supabase + RLS/org checks |
| Graph sync | Manual Sync first; Mail.Read only; fixed mailbox |
| Auto Takeoff | Strict Path A gates; Path B otherwise |
| IE / pricing / customer email | Disabled throughout pilot |
| Real plans | Transmission flag off until explicit later approval |

---

## 2. Slice sequence

### 6P.1 — Central Quote Intake backend contracts (in-memory)

**Scope**

- Namespaced API design under `/api/quote-intake/*` (exact prefix finalized in slice)  
- Fake/in-memory repository  
- Mount behind **off-by-default** feature flag  
- Case / message / attachment / automation-decision / link DTOs  
- No database, no Graph, no live Takeoff invocation  

**Acceptance**

- Routes unreachable when flag off  
- In-memory CRUD + dedupe keys work in tests  
- No production table writes  
- `git` diff limited to backend intake package + flag wiring + tests + docs  

---

### 6P.2 — Central namespaced persistence

**Scope**

- Additive migrations for `quote_intake_*`  
- RLS / organization scoping  
- Audit + dedupe uniqueness  
- No Graph, no automatic Takeoff  

**Acceptance**

- Multi-org isolation tests  
- Duplicate message insert rejected  
- Rollback notes for table cleanup  

---

### 6P.3 — Protected Estimator Queue in live Takeoff head

**Scope**

- Queue tab/view gated for pilot users  
- Fixture / central test data  
- Existing default Takeoff behavior unchanged  
- Deep-link to `?takeoffJobId=` when links exist (may be stubbed)  

**Acceptance**

- Non-pilot cannot see/open queue  
- Default upload/review path regression green  
- Responsive enough for estimator use  

---

### 6P.4 — Microsoft Graph manual preview/import

**Scope**

- Server Graph client (Mail.Read)  
- Manual Sync  
- Synthetic forwarding contract  
- Persist source messages/attachments  
- **No automatic Takeoff yet**  

**Acceptance**

- Quotes mailbox only  
- Hunter inaccessible  
- No move/delete/mark-read  
- Re-sync idempotent  
- No secrets in browser/logs  

---

### 6P.5 — Classification + automation-decision engine

**Scope**

- Deployed classification/extraction (server)  
- Trusted-forward decision engine (Path A/B codes)  
- Still **no** Takeoff invocation  

**Acceptance**

- Gate matrix unit tests  
- Classification failure → Path B  
- No attachment bytes in classification prompts  

---

### 6P.6 — ProductionTakeoffAdapter + auto submit (synthetic)

**Scope**

- Adapter wrapping `createTakeoffWorkspace` + generation start  
- Automatic submission for qualifying **synthetic** messages  
- Intake-to-takeoff link/status  
- Queue deep-link to existing Takeoff review  
- **No IE import**  

**Acceptance**

- Path A creates exactly one job  
- Path B creates zero jobs  
- Import-from-takeoff never called (static + runtime guards)  
- Existing Takeoff interactive path unchanged  

---

### 6P.7 — Live synthetic end-to-end pilot

**Scope**

- Manual mailbox sync  
- Automatic Takeoff  
- Estimator review  
- Multiple pilot users  
- Idempotency verification  

**Acceptance**

- Full § Live MVP checklist from architecture doc (26 steps)  

---

### 6P.8 — Scheduled polling or webhook (controlled)

**Scope**

- Strict budgets + kill switches  
- Synthetic/pilot messages only  

**Acceptance**

- Budgets enforced  
- Emergency kill stops new ingestion/auto jobs  

---

### Later (explicit phases — out of 6P.0–6P.8)

- Controlled real-email / real-plan pilot (`real-plan transmission` flag)  
- Improved Takeoff correction UI  
- Elite 100 catalog validation  
- Pricing and quote drafts  
- Missing-information communication  
- Outbound customer communication  
- Quote Library promotion  

---

## 3. Rollback plan

1. Set Graph + sync + auto-Takeoff flags to off.  
2. Hide Estimator Queue UI flag.  
3. Preserve audit/history rows.  
4. Stop new intake jobs; do not cancel unrelated interactive Takeoff work.  
5. Rotate/remove Graph client secret; remove Exchange RBAC if abandoning.  
6. Drop `quote_intake_*` only via deliberate cleanup migration after retention review.  
7. Never mass-delete `quote_takeoff_jobs` / results as intake rollback.

---

## 4. Areas authorized for later bounded refactor

| Area | Bound |
|------|-------|
| `app-ai-takeoff` Queue tab/view | Additive; default unchanged |
| New `backend-core` quote-intake package | New files |
| Thin takeoff service wrappers for adapter | No IE import |
| Additive `quote_intake_*` migrations | After 6P.1 |
| Optional `metadata.intake` on jobs | Non-breaking |

## 5. Production areas still prohibited

- `app-internal-estimate/**`  
- `POST /api/internal-quotes/import-from-takeoff` automation  
- Quote Library / pricing / customer delivery automation  
- Monday / Moraware / QuickBooks  
- Weakening head auth or org scoping  
- Real plan transmission before flag approval  
- `Mail.Send` / mailbox mutations  

---

## 6. Risks carried into implementation

See architecture doc §12. Additionally:

- Vercel background continuation reliability for long Gemini runs  
- Distinguishing intake-origin jobs in UI without schema breakage  
- Pilot allowlist UX for ops  

---

## 7. Validation for each slice

Every slice before merge:

- Targeted tests green  
- Typecheck/build for touched packages  
- `git diff --check`  
- Confirm flags default off  
- Confirm no IE import path introduced  
- Confirm no Graph secret leakage  
- Confirm existing Takeoff smoke (as available) still green when Takeoff head touched  

---

## 8. Recommended complete Cursor prompt — Phase 6P.1 only

Copy exactly for the next implementation phase (do not run as part of 6P.0):

```text
Implement Phase 6P.1 — Central Quote Intake backend contracts (in-memory only).

Read and obey:
- docs/quote-intake-lab/PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md
- docs/quote-intake-lab/PHASE_6P_0_TAKEOFF_INTEGRATION_MAP.md
- docs/quote-intake-lab/PHASE_6P_0_DATA_AND_SECURITY_BOUNDARY.md
- docs/quote-intake-lab/PHASE_6P_0_IMPLEMENTATION_PLAN.md
- docs/quote-intake-lab/DO_NOT_TOUCH.md

Purpose:
Add namespaced Quote Intake API contracts in backend-core with an in-memory repository,
mounted behind an off-by-default feature flag. This is foundation only.

Hard constraints for 6P.1:
- Do NOT call Microsoft Graph or read any mailbox.
- Do NOT call Gemini or any AI provider.
- Do NOT create or invoke takeoff jobs.
- Do NOT call import-from-takeoff or touch quote_headers / Quote Library / pricing / email delivery.
- Do NOT create database migrations or SQL.
- Do NOT modify app-ai-takeoff UI yet.
- Do NOT modify app-quote-intake-lab unless sharing a pure type/status constant is explicitly necessary (prefer backend-local DTOs).
- Do NOT commit, push, or deploy unless I ask.
- Do NOT print or read real Microsoft secrets.

Scope:
1. Create a new backend package such as backend-core/src/quoteIntake/ (name may match existing quoteIntakeLab naming discussion; prefer production-oriented quoteIntake over lab if starting fresh live APIs).
2. Define DTOs/status enums for:
   - intake cases
   - source messages
   - attachments (metadata + sha256 only; no PDF bytes persistence required in-memory beyond optional Buffer in test fixtures)
   - automation decisions (path A/B + reason codes stubs)
   - takeoff links (structure only; no live job creation)
   - audit events
3. Implement an in-memory repository with organization scoping and basic dedupe by internetMessageId / content hash keys.
4. Implement HTTP routes under a namespaced prefix (e.g. /api/quote-intake/*) for:
   - health/config (safe, no secrets)
   - create/list/get case
   - record automation decision (stub)
   - list audit events
5. Mount routes from server.js ONLY behind an explicit off-by-default env flag (e.g. QUOTE_INTAKE_API_ENABLED=1). When flag is off, routes must not be registered OR must 404.
6. Auth: requireAuth(); org from resolveOrganizationContext; do not weaken head access globally. Pilot gate may be a simple env allowlist or requireHeadAccess("ai_takeoff") plus flag for 6P.1.
7. Logging: never log email subjects, bodies, addresses, attachment bytes, or secrets.
8. Tests: in-memory repository + route tests with flag on/off; prove flag-off does not expose API; prove org isolation in memory; prove no imports of internalQuoteTakeoffImport or takeoff providers.
9. Docs: docs/quote-intake-lab/PHASE_6P_1_NOTES.md summarizing files, flag name, route list, and explicit non-goals.

Allowed paths:
- backend-core/src/quoteIntake/** (new)
- backend-core/src/server.js (minimal flag-gated mount only)
- backend-core tests for the new package
- docs/quote-intake-lab/**

Do not modify:
- app-ai-takeoff/**
- app-internal-estimate/**
- app-quote-library/**
- backend-core/src/quotes/internalQuoteTakeoffImport.mjs
- backend-core/src/takeoff/providers or production takeoff behavior
- migrations
- environment files with real secrets

Validation:
- Run the new tests
- Run relevant backend type/test checks used by this repo for backend-core
- git diff --check
- git status --short

Final report: files changed, routes added, flag defaults, test results, confirmation no Graph/Gemini/Takeoff/IE calls, full git status.

Do not proceed to 6P.2.
```

---

## 9. Documentation set (6P.0)

| File | Role |
|------|------|
| `PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md` | Overview, diagrams, MVP, host choice |
| `PHASE_6P_0_TAKEOFF_INTEGRATION_MAP.md` | Pipeline, seam, IE boundary, linkage |
| `PHASE_6P_0_MICROSOFT_GRAPH_PLAN.md` | Graph deployment |
| `PHASE_6P_0_AUTOMATIC_TAKEOFF_POLICY.md` | Path A/B, statuses, failures |
| `PHASE_6P_0_DATA_AND_SECURITY_BOUNDARY.md` | Tables, auth, kill switches |
| `PHASE_6P_0_IMPLEMENTATION_PLAN.md` | Slices + 6P.1 prompt |
| `DO_NOT_TOUCH.md` | Updated careful-zone for Takeoff queue host |
