# Studio surface ownership matrix

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`

Hypothesis to evaluate (not predetermined): Shared Inbox = new requests; Command Center = needs action now; AI Takeoff = geometry from plans; Estimate Studio = active revision work; Live Digital Estimates = customer-facing publications; Review Requests = customer change requests; All Estimates = historical registry (not built); Sold Jobs = future handoff.

---

## Surface rows

### Shared Inbox / Sync Inbox modal

| Field | Current |
|-------|---------|
| Purpose | Preview/import Graph mailbox messages into intake cases |
| Source of truth | Microsoft Graph (live) + `quote_intake_cases` after import |
| Primary action | Preview → Confirm import |
| Must never | Mutate Outlook; publish; start customer delivery; store raw email body |
| Overlap | Command Center also lists imported cases |
| vs hypothesis | Aligns with “new quote requests” once import completes |
| Evidence | `MailboxSyncModal` (Studio), `quoteIntakeMailboxService.mjs`, Graph read-only client |

### Estimate Queue / Command Center

| Field | Current |
|-------|---------|
| Purpose | Operational list of intake cases with derived `workflowStatus`, needs-attention, next action |
| Source of truth | Derived from intake + Takeoff + studio estimate + publication + review signals |
| Status | `deriveQueueWorkflowStatus` / Command Center view-model |
| Primary action | Open estimate with `openTarget` from `nextActionRoute` |
| Overlap | Live DE also opens Studio; Queue and Command Center are related Studio nav modes |
| vs hypothesis | Closest to “what needs action now” |
| Evidence | `studioEstimateQueueWorkflow.mjs`, `studioCommandCenterViewModel.mjs`, `EstimateCommandCenterPage.tsx` |

### Queue preview drawer

| Field | Current |
|-------|---------|
| Purpose | Case summary before open |
| Source | Queue preview API |
| Must never | Publish or mutate delivery |

### AI Takeoff workspace

| Field | Current |
|-------|---------|
| Purpose | Create/edit/approve measured geometry from plan |
| Source | `quote_takeoff_jobs` / results; iframe head |
| Primary action | Approve Takeoff & build estimate |
| Overlap | Manual Scope is alternate physical authority |
| Must never | Publish Digital Estimate; silently overwrite confirmed manual without revision/stale rules |
| Evidence | `EstimateTakeoffWorkspace.tsx`, takeoff services, approval gate tests |

### Manual Physical Scope editor

| Field | Current |
|-------|---------|
| Purpose | Authoritative rooms/pieces/backsplash/cutouts/open-edge for manual estimates |
| Source | `studio_estimates.scope_json` with server confirmation stamps |
| Primary actions | Save Manual Scope; Confirm Manual Scope |
| Must never | Publish; accept client-forged confirmation |
| Evidence | `ManualPhysicalScopeEditor.tsx`, `studioManualPhysicalScope.mjs` |

### Project Details

| Field | Current |
|-------|---------|
| Purpose | Editable project name/address/notes |
| Source | Estimate scope metadata keys |
| Must never | Clear calc/approval; publish |
| Evidence | `ProjectDetailsPanel.tsx`, `updateProjectDetails` |

### Pricing Setup (Estimate Scope panel)

| Field | Current |
|-------|---------|
| Purpose | Commercial scope, calculate, approve |
| Source | Active studio estimate + calc/approval snapshots |
| Overlap | Workflow header also shows next action |
| Evidence | `EstimateScopePanel.tsx`, `studioEstimateService` |

### Estimate Workflow Header

| Field | Current |
|-------|---------|
| Purpose | One next action for active revision |
| Source | `buildStudioWorkspaceWorkflow` (+ publication summary) |
| Must never | Infer a second competing stage independently of server workflow |
| Evidence | `EstimateWorkflowHeader.tsx`, `studioWorkspaceWorkflow.mjs` |

### Publication summary

| Field | Current |
|-------|---------|
| Purpose | Top-of-workspace published state + customer link |
| Source | Safe publication summary on estimate GET / DE readiness |
| Primary actions | Open customer view; Copy link (no mutation) |
| Evidence | `EstimatePublicationSummary.tsx`, `studioPublicationSummary.mjs` |

### Digital Estimate configuration panel

| Field | Current |
|-------|---------|
| Purpose | Configure choices, publish, replace, revoke |
| Source | `/digital-estimate` readiness + publications |
| Must never | Auto-publish on load |
| Evidence | `EstimateDigitalEstimatePanel.tsx` |

### Live Digital Estimates

| Field | Current |
|-------|---------|
| Purpose | Portfolio of publications (active/history), customer links, QB linkage labels |
| Source | Publication index + staff link recovery |
| vs Command Center | Publications vs operational estimating work |
| vs hypothesis | Aligns with “manage customer-facing publications” |
| Evidence | `liveDigitalEstimatesService.mjs`, `LiveDigitalEstimatesPage.tsx` |

### Review Requests

| Field | Current |
|-------|---------|
| Purpose | Customer-submitted change requests |
| Source | Amendment/review request tables linked to publications |
| Open target | Studio `review` focus |
| Evidence | `studioReviewRequestService`, `ReviewWorkspace` |

### Account Directory selection/linking

| Field | Current |
|-------|---------|
| Purpose | Live account/contact/location linkage + identity snapshot for estimate |
| Separation | Live AD vs frozen publication identity (intentional) |
| Evidence | `studioAccountDirectoryLookup.mjs`, continuity tests |

### Digital Estimate customer page

| Field | Current |
|-------|---------|
| Purpose | Public customer configuration / review |
| Source | Frozen publication snapshot + token access |
| Must never | Expose staff tokens or internal markup |

### Old Internal Estimate / Quote Library

| Field | Current |
|-------|---------|
| Purpose | Legacy/parallel quote workflows still present in monorepo |
| Source | `quote_headers` and related |
| Overlap | Different product path from Studio `studio_estimates` |
| vs hypothesis | Secondary until All Estimates / Sold Job replace retrieval and handoff |
| Evidence | Quote Library heads; `quote_headers` references |

### Sold Job surface

| Field | Current |
|-------|---------|
| Purpose | **Not implemented** as Studio primary surface |
| Status | Placeholder vocabulary / legacy checklists only |

---

## Ownership conflicts (summary)

| Conflict | Surfaces | Severity |
|----------|----------|----------|
| Operational list vs publication portfolio | Command Center vs Live DE | Medium — intentional separation, navigation can confuse |
| Physical geometry | Manual Scope vs AI Takeoff | High if overwrite rules misunderstood — mitigated by authority flags |
| Next action | Workflow header vs DE panel vs queue next action | Medium — improved by publication-aware workflow |
| Historical search | Missing All Estimates; Quote Library still used | Medium — retrieval gap |

## Intended long-term responsibility (recommendation)

| Surface | Recommended owner role |
|---------|------------------------|
| Shared Inbox | New requests + attachments only |
| Command Center | Needs estimator action now |
| AI Takeoff | Plan geometry approval |
| Estimate Studio | Active revision work |
| Live Digital Estimates | Active/historical publications |
| Review Requests | Customer change requests |
| All Estimates (future) | Family/revision search |
| Sold Jobs (future) | Accepted operational handoff |
| Quote Library / Internal Estimate | Legacy until cutover |
