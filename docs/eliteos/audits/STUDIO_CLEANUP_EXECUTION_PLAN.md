# Studio cleanup execution plan

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
**Rule:** Small sequenced branches. Do not implement in the audit branch.  
**Protected:** Golden path behaviors in the audit brief remain unchanged unless a dedicated phase proves replacement.

---

## Final recommendation (answers)

1. **Golden path safe enough to use during cleanup?** Yes — architecturally sound enough; protect with Phase 0 gate. No Critical automatic-delivery defect found.
2. **Three highest-risk competing systems:** (a) Dual workflow status vocabularies (AUDIT-001); (b) Active-revision ID race after `createRevisionFrom` (AUDIT-002); (c) Takeoff postMessage origin risk (AUDIT-005).
3. **Three safest immediate cleanups:** (a) Phase 0 golden-path gate script; (b) Navigation/terminology + historical-publication copy (AUDIT-010/009); (c) Superseded mutation guard (AUDIT-002).
4. **First cleanup branch after audit:** `test/studio-golden-path-gate` (Phase 0), then `fix/studio-nav-terminology-cleanup` (Phase 1).
5. **Remain paused:** Shared Inbox rebuild, All Estimates registry, Sold Job, Vanity Program, Add Plans to Existing Estimate, Quote Library removal, Manual↔Takeoff authority switcher.
6. **Shared Inbox before or after first cleanup?** **After** Phase 0–1 (and preferably after superseded-mutation guard). Inbox work amplifies bootstrap visibility debt (AUDIT-004) if done first.
7. **All Estimates before Quote Library removal?** **Yes.** Never remove Quote Library/Internal Estimate until All Estimates can retrieve families, revisions, and historical publications.
8. **SQL for first three cleanup phases?** **No** (Phase 0 tests; Phase 1 UI/copy; Phase 2 adapter/guards — application + tests only).
9. **Mandatory tests before cleanup merges:** See golden-path gate in `STUDIO_GOLDEN_PATH_REGRESSION_PLAN.md`.
10. **Revised completion estimate for replacing current estimating tool:** Treat as a **multi-quarter program** after Phase 0–5 stabilize operations; Sold Job + All Estimates + Shared Inbox are sequential products, not a single refactor. Rough order-of-magnitude: **Phase 0–3 in 2–4 weeks**; Phase 4–6 **4–8 weeks**; Shared Inbox + All Estimates + Sold Job **additional quarters** depending on staffing — do not schedule Quote Library cutover until All Estimates + pilot.

---

## Phase 0 — Golden-path regression lock

| Field | Value |
|-------|-------|
| Objective | Mandatory gate for all Studio cleanup PRs |
| Findings | AUDIT-014 |
| Scope | npm script wrapping existing Studio/DE/Review/Takeoff gate tests; document scenario IDs |
| Protected | No behavior change |
| Files | `package.json` scripts, docs pointer, maybe thin test harness |
| Schema | none |
| Deploy order | CI only |
| Tests | Gate itself |
| Rollback | Revert script |
| Smoke | Run gate locally |
| Out of scope | New E2E unless gap blocks |
| Branch | `test/studio-golden-path-gate` |
| Depends on | Audit docs |
| Risk | Low |

---

## Phase 1 — Navigation and terminology cleanup

| Field | Value |
|-------|-------|
| Objective | Align labels/entry points so CC / Live DE / Studio / Review do not compete for meaning |
| Findings | AUDIT-010, AUDIT-009 (copy), AUDIT-001 (labels only) |
| Scope | Launcher labels, Studio nav copy, historical-vs-current publication wording; **no** API shape change |
| Protected | Routes, openTarget, publish/replace/revoke |
| Files | `app-elite100-estimate-studio` nav/copy; Home Launcher head map strings if needed |
| Schema | none |
| Branch | `fix/studio-nav-terminology-cleanup` |
| Depends on | Phase 0 |
| Risk | Low |

**This is the first product-facing cleanup after the gate.**

---

## Phase 2 — Canonical quote-family operational status

| Field | Value |
|-------|-------|
| Objective | One adapter mapping workspace stage ↔ queue status |
| Findings | AUDIT-001 |
| Scope | Shared status adapter; consumers update to read adapter; keep old fields as compatibility aliases temporarily |
| Protected | Calculation/approval/publication semantics |
| Files | `studioWorkspaceWorkflow.mjs`, `studioEstimateQueueWorkflow.mjs`, header/queue UI |
| Schema | none |
| Branch | `fix/studio-workflow-status-adapter` |
| Depends on | Phase 0–1 |
| Risk | Medium |

---

## Phase 3 — Active-revision / read-model consolidation

| Field | Value |
|-------|-------|
| Objective | Eliminate superseded mutation races; optional workspace-status DTO |
| Findings | AUDIT-002, AUDIT-007, AUDIT-015 |
| Scope | Server reject mutations on superseded with active-id redirect; harden panel sync; optionally unify publication summary DTO |
| Protected | Revision creation rules; publication freeze |
| Files | Studio routes, estimate service, Takeoff workspace panels |
| Schema | none |
| Branch | `fix/studio-superseded-mutation-guard` (+ optional `fix/studio-workspace-status-dto`) |
| Depends on | Phase 0, preferably Phase 2 |
| Risk | Medium–High (touches mutation paths — gate required) |

---

## Phase 4 — Identity fallback and snapshot cleanup

| Field | Value |
|-------|-------|
| Objective | Document and tighten AD live vs revision vs publication freeze; remove accidental live-over-frozen display bugs only |
| Findings | AUDIT-008 |
| Scope | Display helpers; tests proving frozen pub identity |
| Protected | AD write paths; publication snapshot builder |
| Schema | none expected |
| Branch | `fix/studio-identity-display-authority` |
| Depends on | Phase 0 |
| Risk | Medium |

---

## Phase 5 — Legacy Internal Estimate / Quote Library isolation

| Field | Value |
|-------|-------|
| Objective | Mark legacy heads secondary; prevent new feature work there; keep available |
| Findings | AUDIT-011, AUDIT-013 |
| Scope | Launcher labels, docs, feature flags — **no deletion** |
| Protected | Existing customers of Quote Library |
| Branch | `chore/legacy-quote-library-isolation` |
| Depends on | Phase 0; **All Estimates before removal** |
| Risk | Low (isolation) / High (if removal attempted early) |

---

## Phase 6 — Studio UI simplification

| Field | Value |
|-------|-------|
| Objective | Collapse completed sections when published; reduce panel confusion |
| Findings | AUDIT-010, published reopen UX |
| Scope | Presentational consolidation already partially done; further UX only |
| Protected | Workflow sequencing, publication management |
| Branch | `fix/studio-ui-simplify-published` |
| Depends on | Phase 1–3 |
| Risk | Medium |

---

## Phase 7 — Shared Inbox workspace

| Field | Value |
|-------|-------|
| Objective | Dedicated inbox for import/classify/assign; explicit policy for auto Takeoff |
| Findings | AUDIT-004 |
| Scope | New/expanded inbox head; Graph preview/import unchanged semantics preferred |
| Protected | No Outlook destructive actions; no auto publish |
| Branch | `feat/shared-inbox-workspace` |
| Depends on | Phase 0–2 recommended |
| Risk | Medium–High |
| **Status (2026-07-24)** | **Phase 1 implemented** on `feature/studio-shared-inbox` — estimator Shared Inbox workspace over existing mailbox preview/import; explicit idempotent import; Command Center retained. Secure plan viewer and All Estimates remain deferred. |

---

## Phase 8 — Secure plan viewer

| Field | Value |
|-------|-------|
| Objective | Replace risky iframe/postMessage patterns where possible |
| Findings | AUDIT-005 |
| Scope | Origin lock + viewer hardening |
| Branch | `fix/takeoff-postmessage-origin-lock` |
| Depends on | Phase 0; Takeoff approve tests |
| Risk | High (integration) — can run parallel after Phase 0 |

---

## Phase 9 — All Estimates backend registry

| Field | Value |
|-------|-------|
| Objective | Org-scoped read API for families, revisions, pubs, review requests |
| Findings | Gap vs target model |
| Scope | Read models / views; no write authority change |
| Schema | possibly views/indexes — design later |
| Branch | `feat/all-estimates-registry-api` |
| Depends on | Phase 2–3 |
| Risk | Medium |

---

## Phase 10 — All Estimates frontend workspace

| Field | Value |
|-------|-------|
| Objective | Search/retrieve historical work |
| Depends on | Phase 9 |
| Branch | `feat/all-estimates-workspace` |
| Risk | Medium |

---

## Phase 11 — Vanity Program

| Field | Value |
|-------|-------|
| Objective | Product program — pause until Phases 0–6 stable |
| Depends on | Business priority after operational cleanup |
| Risk | High product scope |

---

## Phase 12 — Add Plans to Existing Estimate

| Field | Value |
|-------|-------|
| Objective | Attach plans mid-lifecycle without corrupting confirmed scope |
| Findings | AUDIT-003, AUDIT-006 |
| Depends on | Phase 3, Phase 8 |
| Risk | High |

---

## Phase 13 — Sold Job and operational handoff

| Field | Value |
|-------|-------|
| Objective | Explicit sold snapshot; QB/Moraware only from Sold Job |
| Findings | AUDIT-012, AUDIT-013 |
| Depends on | Phase 9–10 recommended |
| Risk | High |
| Schema | likely yes (later) |

---

## Phase 14 — Archive, restore, pilot, cutover

| Field | Value |
|-------|-------|
| Objective | Pilot All Estimates; archive Quote Library usage; cutover |
| Depends on | Phase 5 isolation + Phase 10 + Sold Job policy |
| Risk | High |
| SQL | likely yes for archive flags |

---

## Suggested sequence (first six branches)

1. `test/studio-golden-path-gate`
2. `fix/studio-nav-terminology-cleanup`
3. `fix/studio-workflow-status-adapter`
4. `fix/studio-superseded-mutation-guard`
5. `fix/takeoff-postmessage-origin-lock` (can parallel after 1)
6. `fix/studio-identity-display-authority`

Then Shared Inbox / All Estimates / Sold Job as product phases — not as “cleanup of the golden path.”
