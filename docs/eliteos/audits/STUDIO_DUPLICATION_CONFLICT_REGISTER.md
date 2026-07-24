# Studio duplication and conflict register

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
IDs are stable: `STUDIO-AUDIT-NNN`.

---

### STUDIO-AUDIT-001 — Dual workflow vocabularies (Queue vs Studio workspace)

| Field | Value |
|-------|-------|
| Classification | Competing status inference |
| Severity | Medium |
| Current behavior | Command Center uses `deriveQueueWorkflowStatus` (e.g. Published, Scope in progress). Workspace uses `buildStudioWorkspaceWorkflow` stages (e.g. published, calculation_required). |
| Evidence | `studioEstimateQueueWorkflow.mjs`, `studioWorkspaceWorkflow.mjs` |
| Consumers | Command Center, EstimateWorkflowHeader |
| User impact | Next-action labels can differ in wording; mitigated for published reopen |
| Golden path broken? | No |
| Remediation | Map queue status ↔ workspace stage in one adapter; do not invent a third enum |
| Suggested branch | `fix/studio-workflow-status-adapter` |
| SQL | no |
| Safe before All Estimates | yes |
| Safe before Shared Inbox | yes |

---

### STUDIO-AUDIT-002 — Active revision ID race after createRevisionFrom

| Field | Value |
|-------|-------|
| Classification | Active-revision mismatch risk |
| Severity | High |
| Current behavior | Approved scope edits create a new `studio_estimates.id`. Panels sync via `onActiveEstimateChange`, but a stale panel could still call APIs with the superseded id briefly. |
| Evidence | `createRevisionFrom` in `supabaseStudioEstimateRepository.mjs`; `EstimateTakeoffWorkspace.tsx` sync; PR #81 |
| User impact | Wrong revision calc/approve if race wins |
| Delivery risk | Low (superseded row still org-scoped; not auto-publish) |
| Golden path broken? | No (mitigated) |
| Remediation | Server reject mutations on superseded with redirect to active id; harden abort/sequence on all panels |
| Suggested branch | `fix/studio-superseded-mutation-guard` |
| SQL | no |
| Safe before All Estimates | yes |

---

### STUDIO-AUDIT-003 — GET estimate Takeoff gate can mutate / revise

| Field | Value |
|-------|-------|
| Classification | Competing write authority / Observability gap |
| Severity | Medium |
| Current behavior | `GET …/intake-cases/:caseId/estimate` → `refreshTakeoffGate` may update status, seed scope, set staleReason, or revise after Takeoff change. Not a delivery mutation. |
| Evidence | `studioEstimateService.mjs` `refreshTakeoffGate` |
| User impact | Surprising revision bump on “open” |
| Golden path broken? | No |
| Remediation | Document as intentional; consider making revise require explicit refresh-from-takeoff confirm only |
| Suggested branch | `docs` or `fix/studio-takeoff-gate-explicit-revise` |
| SQL | no |

---

### STUDIO-AUDIT-004 — Automatic Takeoff after mailbox import

| Field | Value |
|-------|-------|
| Classification | Intentional separation / Navigation duplication |
| Severity | Medium (Informational if expected) |
| Current behavior | Import may call `bootstrapIntakeCaseTakeoff` when `QUOTE_INTAKE_AUTOMATIC_TAKEOFF` enabled — creates Takeoff job + studio estimate + queues AI. Soft-fails. |
| Evidence | `intakeAutoBootstrapService.mjs`, `server.js` wiring |
| User impact | Cases appear with Takeoff already running — not Shared Inbox “import only” |
| Delivery risk | None (no customer publish) |
| Golden path broken? | No |
| Remediation | Make Shared Inbox phase explicitly configure/opt auto Takeoff; surface bootstrap state in CC |
| Suggested branch | After Shared Inbox design — `fix/quote-intake-bootstrap-visibility` |
| SQL | no |
| Safe before Shared Inbox | yes (visibility only) |

---

### STUDIO-AUDIT-005 — Takeoff postMessage origin `*`

| Field | Value |
|-------|-------|
| Classification | Critical correctness problem (security advisory) |
| Severity | High |
| Current behavior | AI Takeoff approval signal may post with target origin `"*"`. Parent validates type; origin allowlist exists in Studio but must stay strict. |
| Evidence | AI Takeoff consolidated review postMessage; `EstimateTakeoffWorkspace` `isAllowedTakeoffMessageOrigin` |
| User impact | Spoofed approve message risk if origin check regresses |
| Golden path broken? | No if parent allowlist holds |
| Remediation | Restrict child postMessage to known Studio origins; tighten parent allowlist tests |
| Suggested branch | `fix/takeoff-postmessage-origin-lock` |
| SQL | no |
| Prerequisite | Golden path Takeoff approve E2E |
| Safe before All Estimates | yes |

---

### STUDIO-AUDIT-006 — Manual vs Takeoff physical authority coexistence

| Field | Value |
|-------|-------|
| Classification | Competing write authority |
| Severity | High (if misunderstood); mitigated by flags |
| Current behavior | `physicalScopeSource` is `manual_staff` or `takeoff`. Confirmed manual skips Takeoff gate. Takeoff refresh after approval can revise. |
| Evidence | `studioManualPhysicalScope.mjs`, `refreshTakeoffGate`, authority tests |
| Golden path broken? | No |
| Remediation | Keep server authority; add UI “switch authority” only as explicit future feature |
| Suggested branch | Not first cleanup — document only unless bug found |
| SQL | no |

---

### STUDIO-AUDIT-007 — Publication read models on three surfaces

| Field | Value |
|-------|-------|
| Classification | Duplicate read model |
| Severity | Medium |
| Current behavior | Publication summary on estimate GET; full readiness on DE panel; Live DE portfolio. Same recovery authority intended. |
| Evidence | `getWorkspacePublicationSummary`, `assessReadiness`, `liveDigitalEstimatesService` |
| User impact | Latency; disagreement if one path fails |
| Golden path broken? | No |
| Remediation | Single workspace-status DTO reused by panels; keep Live DE portfolio separate |
| Suggested branch | `fix/studio-workspace-status-dto` |
| SQL | no |

---

### STUDIO-AUDIT-008 — Live AD vs frozen publication identity

| Field | Value |
|-------|-------|
| Classification | **Intentional separation** |
| Severity | Informational |
| Current behavior | AD live for linking/grouping; publication freezes customer-facing identity |
| Evidence | Account Directory continuity / delivery safety tests |
| Remediation | Do not “dedupe” these — document in All Estimates / Sold Job design |
| SQL | no |

---

### STUDIO-AUDIT-009 — Active publication may outlive new revision until replace

| Field | Value |
|-------|-------|
| Classification | Intentional separation / Active-revision mismatch risk (UX) |
| Severity | Medium |
| Current behavior | Price edit creates new estimate revision; prior publication can remain active for customers until explicit replace/revoke. Workflow marks historical vs current. |
| Evidence | `studioPublicationSummary.mjs`, revision-after-publish path |
| User impact | Estimator must understand “old link still live” |
| Golden path broken? | No — protected behavior |
| Remediation | Stronger UX copy only (first cleanup candidate) |
| Suggested branch | `fix/studio-historical-publication-copy` |
| SQL | no |

---

### STUDIO-AUDIT-010 — Command Center vs Live Digital Estimates navigation overlap

| Field | Value |
|-------|-------|
| Classification | Navigation duplication |
| Severity | Low–Medium |
| Current behavior | Both can open Studio; Live DE focuses digital; CC uses nextActionRoute |
| Evidence | `StudioApp.tsx`, Live DE page, Command Center |
| Remediation | Terminology + entry copy cleanup |
| Suggested branch | `fix/studio-nav-terminology-cleanup` |
| SQL | no |
| **Recommended as first cleanup** | **Yes — lowest risk** |

---

### STUDIO-AUDIT-011 — Legacy quote_headers / Internal Estimate / Quote Library still active

| Field | Value |
|-------|-------|
| Classification | Legacy dependency |
| Severity | Medium |
| Current behavior | Parallel quote systems remain; not the Studio `studio_estimates` path |
| Evidence | Quote Library / Internal Estimate apps; handoff payloads |
| Remediation | Isolate in launcher; All Estimates before removal |
| Suggested branch | Phase 5 in cleanup plan |
| SQL | unknown (later) |
| Safe before All Estimates | **no** (do not remove) |

---

### STUDIO-AUDIT-012 — Sold / QB / Moraware not Studio delivery path

| Field | Value |
|-------|-------|
| Classification | Not yet implemented / Legacy state |
| Severity | Informational |
| Current behavior | Queue “Sold” placeholder; checklists; QB linkage labels; no auto writeback from Studio publish |
| Evidence | Queue workflow; Live DE QB tests; handoff modules |
| Remediation | Future Sold Job phase only |
| SQL | unknown |

---

### STUDIO-AUDIT-013 — Moraware checklist sold_date uses generation time

| Field | Value |
|-------|-------|
| Classification | Legacy dependency |
| Severity | Low |
| Current behavior | Handoff document may use `new Date()` rather than stored sold timestamp |
| Evidence | Quote Library handoff payloads (explore finding) |
| Remediation | Outside Studio golden path; fix in Quote Library when Sold Job designed |
| SQL | unknown |

---

### STUDIO-AUDIT-014 — Regression gap: browser E2E for published reopen + revision race

| Field | Value |
|-------|-------|
| Classification | Test coverage gap |
| Severity | Medium |
| Current behavior | Strong unit/UI-contract coverage; limited full browser E2E for revise-after-publish multi-panel sync |
| Evidence | `studioWorkspaceWorkflow.test.mjs`, `studioPublishedReopen.ui.test.mjs` vs missing E2E |
| Remediation | Phase 0 golden path gate adds targeted E2E/smoke |
| Suggested branch | `test/studio-golden-path-gate` |
| SQL | no |
| **Gate status (2026-07-24)** | **Deterministic regression coverage added** via `npm run eos:test:studio-golden-path-gate` (`studioGoldenPathGate.test.mjs` + UI contract). Proves multi-panel active-revision convergence after `createRevisionFrom`, historical publication precedence, and zero delivery on read/reopen paths. **True browser E2E remains deferred.** |

---

### STUDIO-AUDIT-015 — Estimate open loads publication summary (latency)

| Field | Value |
|-------|-------|
| Classification | Performance risk |
| Severity | Low |
| Current behavior | GET estimate attaches publication summary (extra reads) |
| Evidence | `elite100EstimateStudioRoutes.js` get estimate handler |
| Remediation | Cache/short-circuit when status ≠ approved |
| Suggested branch | After workspace-status DTO |
| SQL | no |

---

## Severity tally

| Severity | Count |
|----------|-------|
| Critical | 0 confirmed automatic-delivery defects |
| High | 2 (revision race; postMessage) |
| Medium | 7 |
| Low / Informational | 6 |

**No Critical automatic publication/email/sold path found on Studio load/refresh/copy.**
