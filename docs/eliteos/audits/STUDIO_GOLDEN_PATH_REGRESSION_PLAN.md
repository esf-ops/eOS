# Studio golden-path regression plan

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
**Purpose:** Lock protected Studio behavior before cleanup PRs merge.  
**Rule:** Do not use real customer data. Prefer fixtures / org-scoped test org.

---

## Baseline tests run during this audit

| Command / script | Result |
|------------------|--------|
| `npm run eos:test:studio-workspace-workflow` (backend-core) | Pass |
| `npm run eos:test:studio-manual-estimate` | Pass |
| `npm run eos:test:studio-project-details` | Pass |
| `npm run eos:test:studio-manual-physical-scope-authority` | Pass |
| `npm run eos:test:studio-manual-room-open-edge` | Pass |
| `npm run eos:test:takeoff-approval-gate` | Pass |
| `npm run eos:test:live-digital-estimates` | Pass |
| `npm run eos:test:studio-review-requests-list` | Pass |
| `app-elite100-estimate-studio` `npm run build` | Pass |

Failures found during audit: **none** (on the above). Do not treat this as full coverage.

---

## Scenario matrix (1–44)

| # | Scenario | Existing coverage (examples) | Level | Missing assertion | Recommended type | Priority | Blocks cleanup until |
|---|----------|------------------------------|-------|-------------------|------------------|----------|----------------------|
| 1 | Manual estimate draft creation | `studio-manual-estimate` | High | intake case + rev 1 + source type | service + API | P0 | Phase 1+ |
| 2 | Manual Project Details | `studio-project-details` | High | metadata-only no fingerprint clear | service | P0 | Phase 1+ |
| 3 | Manual rooms/pieces | physical-scope authority | High | piece dims persist | service | P0 | Phase 1+ |
| 4 | Backsplash authority | physical-scope authority | High | room/piece authority | service | P0 | Phase 1+ |
| 5 | Cutout authority | physical-scope authority | Med | cutout list round-trip | service | P0 | Phase 1+ |
| 6 | Room open-edge LF | `studio-manual-room-open-edge` | High | mode + LF confirm | service | P0 | Phase 1+ |
| 7 | Save Manual Scope | physical-scope / manual estimate | High | dirty → saved | service | P0 | Phase 1+ |
| 8 | Confirm Manual Scope | fingerprint tests in scope suite | High | confirmation fingerprint set | service | P0 | Phase 1+ |
| 9 | Pricing Setup save | workspace workflow / pricing tests | Med | pricing dirty cleared | service | P0 | Phase 1+ |
| 10 | Calculate gating | `studio-workspace-workflow` | High | blocked until confirm+pricing | unit | P0 | Phase 1+ |
| 11 | Current calculation fingerprint | workspace workflow + estimate service | High | fingerprint matches scope | service | P0 | Phase 1+ |
| 12 | Approve gating | workspace workflow | High | blocked until calc current | unit | P0 | Phase 1+ |
| 13 | Current approval fingerprint | estimate approve path | High | approval tied to calc | service | P0 | Phase 1+ |
| 14 | Explicit DE publish | DE publication / Live DE tests | High | no publish without action | API | P0 | Phase 1+ |
| 15 | Stable customer link | publication summary / reopen UI | High | same URL recovery | service + UI | P0 | Phase 1+ |
| 16 | Reopen current publication | `studioPublishedReopen.ui.test` / workflow | High | stage=published, management UI | UI contract | P0 | Phase 1+ |
| 17 | Copy existing customer link | reopen UI | Med | clipboard path non-mutating | UI | P1 | Phase 2+ |
| 18 | Open customer view | public DE routes tests | Med | staff vs public auth | API | P1 | Phase 3+ |
| 19 | Refresh published estimate | publication summary on GET | Med | GET does not publish/replace | API | P0 | Phase 1+ |
| 20 | Open customer review request | review-requests-list | Med | openTarget=review | API + UI | P1 | Phase 2+ |
| 21 | Price-affecting edit after publication | revision-from tests | High | new active revision | service | P0 | Phase 1+ |
| 22 | New active revision | unique active index + createRevisionFrom | High | only one non-superseded | service | P0 | Phase 1+ |
| 23 | Prior frozen publication | publication summary historical | High | snapshot unchanged | service | P0 | Phase 1+ |
| 24 | Explicit publication replacement | DE replace tests | High | old historical, new active | API | P0 | Phase 1+ |
| 25 | Metadata-only edit | project-details | High | no revision / no stale pricing | service | P0 | Phase 1+ |
| 26 | AI Takeoff link create/reuse | takeoff link / bootstrap | Med | reuse vs create | service | P1 | Phase 3+ |
| 27 | AI processing | takeoff job status tests | Med | status transitions | service | P1 | Phase 3+ |
| 28 | AI Takeoff approval | `takeoff-approval-gate` | High | approval authority | service | P0 | Phase 1+ |
| 29 | Estimate Scope seeding | refreshTakeoffGate / approval | High | seed into scope | service | P0 | Phase 1+ |
| 30 | AI failure / manual fallback | soft-fail bootstrap + manual path | Med | manual confirm without takeoff | service | P1 | Phase 3+ |
| 31 | 502/503/504 during save | workspace recovery tests (PR #81) | High | retry preserves draft | UI/service | P0 | Phase 1+ |
| 32 | 502/503/504 during calculate | same | High | no double calc ghost | UI/service | P0 | Phase 1+ |
| 33 | 502/503/504 during approve | same | High | no false approved UI | UI/service | P0 | Phase 1+ |
| 34 | 502/503/504 during publication status refresh | reopen / summary | Med | no mutate on fail | UI | P0 | Phase 1+ |
| 35 | Stale GET response protection | abort/sequence in workspace | Med | ignore older GET | UI | P1 | Phase 2+ |
| 36 | Organization isolation | route org scoping tests | High | cross-org 404/403 | API | P0 | **always** |
| 37 | Authorization failure | auth middleware tests | High | unauth rejected | API | P0 | **always** |
| 38 | No automatic email | delivery safety tests | High | publish ≠ email | API | P0 | Phase 1+ |
| 39 | No automatic publication | load/refresh/copy | High | GET never publishes | API | P0 | Phase 1+ |
| 40 | No automatic link replacement | replace requires POST | High | refresh ≠ replace | API | P0 | Phase 1+ |
| 41 | No automatic revocation | revoke requires POST | High | refresh ≠ revoke | API | P0 | Phase 1+ |
| 42 | No automatic sold-state | queue placeholder | Med | publish ≠ sold | API/service | P0 | Phase 1+ |
| 43 | No automatic QuickBooks | Live DE QB linkage | Med | no writeback on publish | API | P0 | Phase 1+ |
| 44 | No automatic Moraware | handoff modules | Med | no writeback on publish | API | P0 | Phase 1+ |

---

## Minimum golden-path gate (mandatory for cleanup PRs)

A cleanup PR that touches Studio estimating, publication, Takeoff import, or queue workflow **must** pass:

1. `eos:test:studio-workspace-workflow`
2. `eos:test:studio-manual-estimate`
3. `eos:test:studio-project-details`
4. `eos:test:studio-manual-physical-scope-authority`
5. `eos:test:studio-manual-room-open-edge`
6. `eos:test:takeoff-approval-gate`
7. Digital Estimate publication / readiness suite used by Live DE (`eos:test:live-digital-estimates` or successor)
8. `eos:test:studio-review-requests-list` if Review Request surfaces touched
9. `app-elite100-estimate-studio` production build

**Plus** assertions covering scenarios **14–16, 19, 21–25, 38–42** if the PR touches publication or revision-after-publish.

**Forbidden in gate runs:** real mailbox credentials against production customer mail, publishing to production orgs, creating real QB/Moraware records.

---

## Recommended Phase 0 branch

`test/studio-golden-path-gate`

Add a single npm script that runs the gate list above and documents the scenario IDs covered. Prefer consolidating existing tests over inventing new E2E first; add browser E2E only for scenarios 16, 21–24, and 35 if unit coverage remains insufficient.

---

## Implementation status (Phase 0 gate)

| Field | Value |
|-------|-------|
| Gate script | `npm run eos:test:studio-golden-path-gate` |
| Audited / base main | `f1d0a9d704c7581fa4b5b123c4cb700991f3a5db` (includes audit `93df10a`) |
| Implementation commit | local commit on `test/studio-golden-path-gate` — see `git log -1 --oneline` |
| Application behavior changed | **No** — tests, package script, and this status note only |

### New tests added

| File | Covers |
|------|--------|
| `backend-core/src/elite100EstimateStudio/studioGoldenPathGate.test.mjs` | Paths A–G: manual gating, Takeoff≠publish, revision-after-publish + multi-panel sync, metadata-only, transient contracts, zero delivery spies, org isolation |
| `app-elite100-estimate-studio/src/estimateQueue/studioGoldenPathGate.ui.test.mjs` | Panel `onActiveEstimateChange` wiring, published reopen non-mutation, transient recovery, identity helper presence |

### Existing suites included in the gate

- `eos:test:studio-workspace-workflow`
- `eos:test:studio-manual-estimate`
- `eos:test:studio-project-details`
- `eos:test:studio-manual-physical-scope-authority`
- `eos:test:studio-manual-room-open-edge`
- `eos:test:takeoff-approval-gate`
- `eos:test:live-digital-estimates`
- `eos:test:studio-review-requests-list`
- `eos:test:studio-account-directory-delivery-safety`
- `studioEstimateQueueWorkflow.test.mjs`
- `studioCommandCenterViewModel.test.mjs`
- `estimateCommandCenter.ui.test.mjs`
- `app-elite100-estimate-studio` production build

### Scenarios fully covered (deterministic, non-browser)

1–16, 19, 21–25, 28–29, 31–34 (contracts), 36–42 (and delivery-safety coverage for 38–41 / QB labels).

### Scenarios still requiring a future real-browser E2E

| # | Scenario | Notes |
|---|----------|-------|
| 17–18 | Copy link / open customer view in a real browser | UI contracts + delivery spies cover non-mutation; full clipboard/window not exercised |
| 20 | Open Review Request from Command Center click-path | List/API covered; full navigation click deferred |
| 26–27, 30 | Live Takeoff job create/AI processing/fallback | Approval gate + Studio seed contracts; no live AI provider |
| 35 | Stale GET race in running React tree | Source contracts + monotonic policy unit; true browser race deferred |
| 43–44 | Live QB/Moraware writeback absence | Covered by consistency/delivery-safety suites; no live partner APIs |

### AUDIT-014

Deterministic regression coverage added for revise-after-publish multi-panel synchronization (old contradictory Manual Scope vs Pricing IDs fail the invariant; synchronized reconcile passes). **True browser E2E remains deferred.**
