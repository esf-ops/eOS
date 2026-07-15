# Phase 6P.3 — Pilot-Gated Estimator Queue in AI Takeoff

**Date:** 2026-07-15  
**Status:** Implemented (queue UI only)  
**Host:** `app-ai-takeoff` (default Takeoff workbench unchanged)

---

## Purpose

Add a protected **Estimator Queue** tab/view inside the live AI Takeoff head that consumes the namespaced `/api/quote-intake/*` API. This phase is **queue UI only** — no Graph, mailbox sync, Gemini, automatic Takeoff, attachment bytes, migrations, pricing, IE import, Quote Library, or outbound email.

---

## Files changed

| Path | Role |
|------|------|
| `app-ai-takeoff/src/TakeoffLabApp.tsx` | Additive view switch + Queue tab (workbench hidden, not removed) |
| `app-ai-takeoff/src/components/intake/EstimatorQueueView.tsx` | Queue summary, filters, table, refresh |
| `app-ai-takeoff/src/components/intake/EstimatorQueueCaseDetail.tsx` | Safe case detail pane |
| `app-ai-takeoff/src/lib/quoteIntakeApi.mjs` | Narrow `/api/quote-intake/*` client |
| `app-ai-takeoff/src/lib/quoteIntakeView.mjs` | `view` / `intakeCaseId` / `takeoffJobId` query helpers |
| `app-ai-takeoff/src/lib/quoteIntakeUiConfig.mjs` | `VITE_QUOTE_INTAKE_UI_ENABLED` (visibility only) |
| `app-ai-takeoff/src/lib/quoteIntakeStatusLabels.mjs` | Readable `qil_*` labels |
| `app-ai-takeoff/src/lib/quoteIntakeFormat.mjs` | Safe Unknown fallbacks / text sanitization |
| `app-ai-takeoff/src/lib/quoteIntakeFilter.mjs` | Client search/filter/summary counts |
| `app-ai-takeoff/src/lib/quoteIntakeSanitize.mjs` | Audit metadata display redaction |
| `app-ai-takeoff/src/lib/quoteIntakeTypes.ts` | Client DTO types |
| `app-ai-takeoff/src/lib/phase6p3.test.mjs` | Phase 6P.3 regressions |
| `app-ai-takeoff/src/styles.css` | Queue styles |
| `app-ai-takeoff/.env.example` | Documents UI flag |
| `app-ai-takeoff/src/vite-env.d.ts` | Env typing |
| `docs/quote-intake-lab/PHASE_6P_3_NOTES.md` | This document |

---

## Route / query behavior

No React Router. Query-param views only:

| URL | Result |
|-----|--------|
| `/` (no `view`) | Existing Takeoff workbench (default) |
| `?takeoffJobId=<id>` | Existing workbench deep link (unchanged) |
| `?view=intake` | Estimator Queue (when UI flag on) |
| `?view=intake&intakeCaseId=<id>` | Queue with selected case |
| `?view=intake` while UI flag off | Fail closed → workbench (tab hidden) |

Browser **back/forward** restores `view` / `intakeCaseId` via `popstate`. Domain, launcher registration, and head slug are unchanged.

---

## Feature and pilot gating

| Layer | Control | Authority |
|-------|---------|-----------|
| UI chrome | `VITE_QUOTE_INTAKE_UI_ENABLED` (`1`/`true` to show tab) | Visibility only |
| API mount | `QUOTE_INTAKE_API_ENABLED=1` | Backend |
| Auth | Bearer session + `ai_takeoff` head | Backend |
| Pilot | optional `QUOTE_INTAKE_PILOT_EMAILS` | Backend |

- Queue tab is absent when the UI flag is off.
- Queue always calls the protected backend; **401/403 expose no case data**.
- API disabled / missing → queue shows API-disabled state; **workbench still works**.
- Config load failure fails closed for the queue only.
- No secrets in `VITE_*`. Client never trusts org/actor/pilot/mailbox fields.

---

## API client boundary

`createQuoteIntakeApiClient` may call only:

- `GET /api/quote-intake/config`
- `GET /api/quote-intake/cases`
- `GET /api/quote-intake/cases/:id`
- `GET /api/quote-intake/cases/:id/audit-events`
- `GET /api/quote-intake/cases/:id/takeoff-links`

Uses the same Bearer auth pattern as other Takeoff `labApi*` helpers. No generic fetch proxy, Graph client, Supabase browser writes, Takeoff provider client, IE import, or Quote Library calls.

---

## Queue functionality

- Summary count tiles (New / Processing / Manual review / Ready for Takeoff / In Takeoff / Failed)
- Search, status filter, priority filter
- Received/age, customer/project (Unknown fallbacks), sender, Elite 100/eligibility when present
- Case status with readable labels (raw `qil_*` preserved)
- Manual-review / missing-info reason snippets
- Loading, empty, permission-denied, API-disabled, recoverable error + **Retry**
- Explicit user **Refresh** only — no timers, polling, Graph subscriptions, or webhooks

---

## Case detail functionality

Authorized fields only (text rendering — **never HTML**):

- Case ID, status, source, received time, sender metadata
- Subject/body only if present on the API DTO (privacy mode usually omits them)
- Attachment metadata (no bytes / download)
- Safe audit timeline (sensitive metadata keys redacted)
- Structure-only Takeoff links (optional navigate to `?takeoffJobId=`)
- Gate / manual-review reasons

Future actions shown **disabled** with later-phase labels (Start Takeoff, IE import, customer email).

---

## Existing workbench regression verification

- Default view remains upload → generate → review → approve
- Workbench stays mounted (hidden) while Queue is open so state is preserved
- `?takeoffJobId=` deep links unchanged
- Existing AI Takeoff unit tests green
- Production `vite build` succeeded

---

## Tests / build results

```bash
node app-ai-takeoff/src/lib/phase6p3.test.mjs
node app-ai-takeoff/src/lib/reviewActionPath.test.mjs
node app-ai-takeoff/src/lib/takeoffGenerationProgress.test.mjs
node app-ai-takeoff/src/lib/takeoffGenerateErrors.test.mjs
cd app-ai-takeoff && npm run build
git diff --check
```

All passed (2026-07-15). `git diff --check` clean.

---

## Manual local viewing

1. Backend (memory repo is fine):  
   `QUOTE_INTAKE_API_ENABLED=1` (optional `QUOTE_INTAKE_PILOT_EMAILS=you@example.com`)
2. App: copy `.env.example` → `.env.local`, set Supabase + `VITE_BACKEND_URL`, and  
   `VITE_QUOTE_INTAKE_UI_ENABLED=true`
3. `cd app-ai-takeoff && npm run dev` → open with `?view=intake`
4. Without the UI flag, Queue tab must not appear; workbench must behave as before

Fake/injected API responses are used in unit tests — **no migration apply required** for UI tests.

---

## Confirmations

- No Phase 6P.2 migration applied
- No database / external network calls from tests
- No Graph / Gemini / automatic Takeoff invocation
- No commit / push / deploy
- Phase 6P.4 not started

---

## Closure verification (6P.3 complete — do not start 6P.4)

### 1. Phase 6P.2 commit preceding 6P.3

Yes. 6P.2 is committed on this branch; 6P.3 remains uncommitted working-tree changes only.

| Phase | Commit | Subject |
|-------|--------|---------|
| 6P.1 | `9e083866b93a74d4278a477a217ec6a5417fc904` | Add isolated quote intake API foundation |
| **6P.2** | **`16ce5b421486c9613fd56a0b5240de9ef576d2eb`** (`16ce5b4`) | **Add central quote intake persistence** |

### 2. Migration grants (committed in 6P.2)

Verified in `backend-core/supabase/eliteos_quote_intake_v1.sql` (unchanged after 6P.2 commit aside from unrelated README pointer):

- RLS helper: `REVOKE ALL … FROM public` + `FROM anon`; `GRANT EXECUTE … TO authenticated` (+ `service_role`); **no** grant to `PUBLIC`/`anon`
- Trigger-only functions: `REVOKE ALL FROM public` and `FROM anon, authenticated` — **no** `GRANT EXECUTE TO authenticated`
- Tables: cases `SELECT, INSERT, UPDATE`; children/audit/links `SELECT, INSERT` only
- Authenticated: explicit `REVOKE DELETE` on all intake tables; `REVOKE UPDATE` on non-case tables (including audit)

### 3. Every Phase 6P.3 file added or modified

**Modified**

- `app-ai-takeoff/.env.example`
- `app-ai-takeoff/src/TakeoffLabApp.tsx`
- `app-ai-takeoff/src/styles.css`
- `app-ai-takeoff/src/vite-env.d.ts`
- `backend-core/src/quoteIntake/README.md` (6P.3 pointer only)

**Added**

- `app-ai-takeoff/src/components/intake/EstimatorQueueView.tsx`
- `app-ai-takeoff/src/components/intake/EstimatorQueueCaseDetail.tsx`
- `app-ai-takeoff/src/lib/phase6p3.test.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeApi.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeFilter.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeFormat.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeSanitize.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeStatusLabels.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeTypes.ts`
- `app-ai-takeoff/src/lib/quoteIntakeUiConfig.mjs`
- `app-ai-takeoff/src/lib/quoteIntakeView.mjs`
- `docs/quote-intake-lab/PHASE_6P_3_NOTES.md`

### 4–10. Behavior checks

| # | Check | Result |
|---|--------|--------|
| 5 | Default workbench does not call `/api/quote-intake` when UI flag off | **Pass** — Queue mounts only when `quoteIntakeUiEnabled && appView === "intake"`; flag off forces workbench; `TakeoffLabApp` never references `/api/quote-intake` |
| 6 | `/config` failure cannot affect workbench load | **Pass** — config fetch lives only in `EstimatorQueueView`; workbench hydration uses takeoff APIs only |
| 7 | `?view=intake` after 401/403 cannot expose prior cases | **Pass** — queue fail-closed via `clearAuthorizedCaseData()` + empty `cases: []`; no fixtures/seeds in queue runtime |
| 8 | No caller-controlled HTML rendered | **Pass** — no `dangerouslySetInnerHTML`; subject/body/metadata go through text/`stripHtmlToText` |
| 9 | No enabled control starts Takeoff / IE import / email / case mutate | **Pass** — queue client is GET-only; Start Takeoff / IE / email buttons `disabled`; optional “Open linked Takeoff job” is view navigation only |
| 10 | Tests + build + `git diff --check` | Re-run on closure; all green |

### Closure fix applied during verification

- `EstimatorQueueView` now calls `clearAuthorizedCaseData()` on auth/config failures and before revalidation so a prior successful load cannot leave case/detail payloads after 401/403.

---

## Git status (closure)

See live `git status --short` in the worktree (6P.3 still uncommitted). Typical shape:

```
 M app-ai-takeoff/.env.example
 M app-ai-takeoff/src/TakeoffLabApp.tsx
 M app-ai-takeoff/src/styles.css
 M app-ai-takeoff/src/vite-env.d.ts
 M backend-core/src/quoteIntake/README.md
?? app-ai-takeoff/src/components/intake/
?? app-ai-takeoff/src/lib/phase6p3.test.mjs
?? app-ai-takeoff/src/lib/quoteIntake*.mjs
?? app-ai-takeoff/src/lib/quoteIntakeTypes.ts
?? docs/quote-intake-lab/PHASE_6P_3_NOTES.md
```

---

## Recommended Phase 6P.4 scope

Microsoft Graph **manual** preview/import (Mail.Read, fixed quotes mailbox), persist source messages/attachments through central intake APIs, re-sync idempotency — **still no automatic Takeoff**. See `PHASE_6P_0_MICROSOFT_GRAPH_PLAN.md` and `PHASE_6P_0_IMPLEMENTATION_PLAN.md`.

**Do not begin Phase 6P.4 until explicitly requested.**
