# Studio endpoint and read-model map

**Audited main:** `6712ec9e36d379fa6419f8ee74dbd98d5dd6c2ad`  
Auth pattern for Studio routes: `requireAuth` + head access + pilot gate (see `elite100EstimateStudioRoutes.js`). Org-scoped via `orgIdFor(req)`.

Delivery mutation legend: **D** = can publish/replace/revoke/notify/sold. Gold path GETs should be **D=no**.

---

## Quote Intake / mailbox

| Method | Path | Service | Writes | D | Consumers | Notes |
|--------|------|---------|--------|---|-----------|-------|
| POST | `/api/quote-intake/mailbox/preview` | `previewQuoteIntakeMailbox` | none | no | Sync Inbox | Graph read |
| POST | `/api/quote-intake/mailbox/import` | `importQuoteIntakeMailboxMessages` | cases, attachments, audit | no* | Sync Inbox | *may trigger auto bootstrap |
| GET | `/api/quote-intake/cases` | list cases | no | no | Queue/CC | |
| POST | `/api/quote-intake/cases` | create case | case | no* | Manual/API | *bootstrap |
| GET | `/api/quote-intake/cases/:id` | get case | no | no | | |
| POST | `/api/quote-intake/cases/:id/open-estimate` | `openEstimateForIntakeCase` | files, takeoff link/job, maybe studio estimate | no | Open Estimate | PDF fetch |
| GET | `/api/quote-intake/cases/:id/takeoff-links` | list links | maybe status sync | no | | |

---

## Studio estimate core

| Method | Path | Service | Writes | Active revision | D | Notes |
|--------|------|---------|--------|-----------------|---|-------|
| POST | `/manual-estimates` | `createManualEstimate` | intake + estimate | creates rev 1 | no | Idempotency-Key |
| GET | `/intake-cases/:caseId/estimate` | `getOrCreateForCase` + **publication summary** | Takeoff gate may update/revise | `getActiveByIntakeCase` | no | Enrichment: partner account, publication |
| PATCH | `/estimates/:id` | `updateScope` | scope; maybe revise | by id | no | |
| PATCH | `/estimates/:id/project-details` | `updateProjectDetails` | metadata scope only | by id | no | |
| PATCH | `/estimates/:id/manual-scope` | `saveManualScopeDraft` | draft; maybe revise | by id → new id | no | |
| POST | `/estimates/:id/confirm-manual-scope` | `confirmManualScope` | confirm stamps | by id | no | |
| POST | `/estimates/:id/refresh-from-takeoff` | refresh | scope seed | by id | no | |
| POST | `/estimates/:id/calculate` | `calculate` | calc snapshot | by id | no | Logged |
| POST | `/estimates/:id/approve` | `approve` | approval | by id | no | Logged |

---

## Digital Estimate / publications

| Method | Path | Service | Writes | D | Notes |
|--------|------|---------|--------|---|-------|
| GET | `/estimates/:id/digital-estimate` | `assessReadiness` | no | no | Publications + summary + reviews |
| POST | `/estimates/:id/digital-estimate/publish` | `publish` | publication | **yes** | Explicit confirm |
| GET | `/estimates/:id/publications` | `listPublications` | no | no | |
| GET | `/publications/:id` | publication detail + URL recovery | no | no | |
| POST | `/publications/:id/revoke` | revoke | status | **yes** | Explicit |
| POST | `/publications/:id/replace-token` | replace | token | **yes** | Explicit |
| POST | `/publications/:id/events/link-copied` | analytics event | event | no delivery | Staff copy telemetry |
| GET | `/live-digital-estimates` | Live DE list | no | no | Portfolio |
| GET | `/live-digital-estimates/:publicationId` | Live DE detail | no | no | |

---

## Queue / Command Center

| Method | Path | Derives | D |
|--------|------|---------|---|
| GET | `/queue` | workflowStatus, attention, openTarget | no |
| GET | `/queue/:caseId/preview` | detail | no |
| POST | `/queue/:caseId/opened` | activity timestamps | no |
| POST | `/queue/:caseId/assign` | assignee | no |

---

## Review Requests / Account Directory

| Method | Path | D | Notes |
|--------|------|---|-------|
| GET/POST | `/review-requests/*` | resolve actions may drive republish flows — explicit | See Review Request routes |
| GET | `/account-directory` | no | Search |
| POST | `/account-directory/prospects` | creates AD prospect | no publish |
| POST | `/account-directory/:id/snapshot` | builds identity snapshot | no publish |

---

## AI Takeoff (representative)

Takeoff head uses Brain takeoff job/workspace/generation routes under `/api/takeoff-*` (and related). Studio open-estimate creates/reuses jobs. Approval gated by takeoff approval services. **No Digital Estimate publish from Takeoff approval alone.**

---

## Read-model duplication patterns

| Pattern | Locations | Risk |
|---------|-----------|------|
| Active estimate resolution | `getActiveByIntakeCase` vs panel-held `estimateId` | High if stale id after revise |
| Publication status | Estimate GET summary + DE panel readiness + Live DE | Medium — should agree via same recovery |
| Workflow status | Queue `deriveQueueWorkflowStatus` vs `buildStudioWorkspaceWorkflow` | Medium — different vocabularies |
| Identity | Live AD enrich vs `customerIdentitySnapshot` vs publication freeze | Intentional separation |
| Partner account | Scope id + loadStudioPartnerAccount on GET | Low |

---

## N+1 / performance notes

| Area | Observation |
|------|-------------|
| Estimate GET + publication summary | Extra publication list/events on open — bounded, acceptable; watch latency |
| Queue list | Aggregates multiple sources — monitor for unbounded joins |
| Review request list in readiness | `listReviewRequests` limit 80 then filter — bounded |

---

## Overlapping / legacy endpoints

| Endpoint family | Role |
|-----------------|------|
| Studio `/publications` | Current DE path |
| Legacy quote publish via `quote_headers` | Parallel product path — do not confuse with `studio_estimates` |
| Internal Estimate APIs | Separate head |

**Risk rating (overall):** Medium — golden path GETs are delivery-safe; revision id sync and dual workflow vocabularies are the main disagreement risks.
