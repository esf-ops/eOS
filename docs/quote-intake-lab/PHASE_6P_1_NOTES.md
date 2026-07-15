# Phase 6P.1 — Central Quote Intake Backend Contracts (In-Memory)

**Date:** 2026-07-15

**Status:** Implemented (foundation only)

**Does not:** Graph, Gemini, Takeoff jobs, Storage, migrations, frontend, IE import

---

## Purpose

Add namespaced Quote Intake API contracts in `backend-core` with an **in-memory** repository, mounted behind an **off-by-default** feature flag.

---

## Feature flag

| Env | Default | Effect |
|-----|---------|--------|
| `QUOTE_INTAKE_API_ENABLED` | unset / not `"1"` | `maybeAttachQuoteIntakeRoutes` registers **nothing**; no side effects |
| `QUOTE_INTAKE_API_ENABLED=1` | — | Registers `/api/quote-intake/*` behind auth + `ai_takeoff` head access |
| `QUOTE_INTAKE_PILOT_EMAILS` | unset | Optional comma-separated email allowlist; when set, non-listed users get 403 |

Handlers also re-check the flag and return **404** with **zero repository writes** if disabled after mount.

Safe config (`GET …/config`) never returns secrets and reports:

- `takeoffInvocationEnabled: false`
- `graphEnabled: false`
- `ieImportEnabled: false`
- `repositoryMode: "memory"`

---

## Files added/modified

| Path | Role |
|------|------|
| `backend-core/src/quoteIntake/quoteIntakeConfig.mjs` | Flag + safe config |
| `backend-core/src/quoteIntake/quoteIntakeTypes.mjs` | Statuses / path / reason codes |
| `backend-core/src/quoteIntake/quoteIntakeRepository.mjs` | `InMemoryQuoteIntakeRepository` |
| `backend-core/src/quoteIntake/productionTakeoffAdapter.mjs` | Contract + `FakeProductionTakeoffAdapter` |
| `backend-core/src/quoteIntake/quoteIntakeRoutes.js` | HTTP routes + `maybeAttachQuoteIntakeRoutes` |
| `backend-core/src/quoteIntake/*.test.mjs` | Tests |
| `backend-core/src/quoteIntake/README.md` | Package readme |
| `backend-core/src/server.js` | Minimal flag-gated mount only |
| `docs/quote-intake-lab/PHASE_6P_1_NOTES.md` | This document |

---

## Routes (`/api/quote-intake`)

All require: `requireAuth` → flag → `ai_takeoff` head access → optional pilot allowlist.

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/config` | Safe config |
| GET | `/health` | Phase + memory mode |
| POST | `/cases` | Create case (metadata only; org from auth) |
| GET | `/cases` | List org cases |
| GET | `/cases/:id` | Get case (404 cross-org) |
| POST | `/cases/:id/automation-decisions` | Record Path A/B decision; **does not** invoke Takeoff |
| GET | `/cases/:id/audit-events` | Audit timeline |
| GET | `/cases/:id/takeoff-links` | List structure-only links |

**Not registered:** Graph, mailbox, Takeoff job, Storage, Supabase proxy, or `import-from-takeoff` endpoints.

---

## Repository contracts

`InMemoryQuoteIntakeRepository`:

- Org-scoped create/list/get
- Dedupe by `internetMessageId` and `contentHash` (per org) → 409
- `recordAutomationDecision` (Path A → `qil_ready_for_takeoff`; Path B → `qil_manual_review`)
- `createTakeoffLink` / `listTakeoffLinks` (structure + idempotency key; `takeoffJobId` may be null)
- Append-only audit events (no subject/body/address payloads)

Injected into routes; default shared instance for the process. Tests inject fresh instances.

---

## ProductionTakeoffAdapter

`FakeProductionTakeoffAdapter.createFromIntake` always returns:

`{ ok: false, code: "takeoff_invocation_disabled" }`

`importToInternalEstimate` throws. Routes do **not** call the adapter in 6P.1.

---

## Auth / org

- Org ID from `resolveOrganizationContext` (production) or injected `resolveOrganizationId` (tests)
- Never from request body
- Head gate: same `ai_takeoff` middleware as live Takeoff

---

## Explicit non-goals (6P.1)

- Microsoft Graph / mailbox sync
- Gemini / classification
- Creating real `quote_takeoff_jobs`
- Storage uploads
- Supabase intake tables / migrations
- Estimator Queue UI
- Pricing / IE / Quote Library / customer email

---

## How to run tests

```bash
node backend-core/src/quoteIntake/quoteIntakeRepository.test.mjs
node backend-core/src/quoteIntake/quoteIntakeRoutes.test.mjs
node backend-core/src/quoteIntake/productionTakeoffAdapter.test.mjs
```

---

## Next

Phase **6P.2** — central namespaced persistence (migrations + RLS). Do not start until explicitly requested.
