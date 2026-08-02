# Quote Platform Head Architecture and Current Scaffold Inventory

**Date:** 2026-08-02
**Status:** Architecture decision and migration plan; documentation only
**Related:** [eliteOS Master Head Map](./eliteOS-master-head-map.md), [System Blueprint](./SYSTEM_BLUEPRINT.md), [Feature Decisions](./FEATURE_DECISIONS.md), [AI Takeoff Foundation](./ai-takeoff-foundation.md)

## 1. Executive summary

The quote platform should be nine focused eliteOS heads connected through governed backend contracts, not one tabbed application that accumulates unrelated responsibilities.

The target authority chain is:

1. **Intake Head** captures and triages demand.
2. **AI Takeoff Lab Head** produces reviewed measurement evidence.
3. **Estimate Queue Head** coordinates operational work.
4. **Studio V2 Head** authors, prices, revises, approves, and publishes estimates.
5. **Digital Estimates Head** operates published links and customer activity.
6. **Product Catalog Head** governs selectable product and material presentation.
7. **Sold Handoff Head** converts accepted estimates into an explicit downstream handoff.
8. **Quote Library / Estimate History Head** provides durable search and history.
9. **Account Directory / Pricing Rules Head** governs account identity and pricing policy inputs.

**Studio V2 is the estimate authority.** Backend services—not browsers—own pricing, publication, acceptance, and revision decisions. Approved estimate snapshots and active publication snapshots are immutable. Customer activity produces selection drafts, review requests, or acceptance records; it never silently mutates an estimate.

The repository already contains substantial scaffolding. The immediate architecture problem is ownership, not absence of code. The recommended next slice is a read-only **Digital Estimates Command Center** because staff currently lack a dedicated operational view of publications and customer activity, while reusable read models already exist.

## 2. Current problem: why tabs and mixed workspaces caused confusion

`app-elite100-estimate-studio/src/StudioApp.tsx` currently hosts Inbox, queue, AI takeoff, Studio V1/V2, Live Digital Estimates, account lookup, all-estimates, and sold-review concerns. The `estimateQueue/` directory similarly contains components belonging to several future heads. This made proximity look like ownership:

- Inbox tabs became the entry point and implicit owner of Studio V2.
- AI Takeoff controls appeared beside estimate authoring despite a different authority boundary.
- Live Digital Estimates appeared as a Studio page although publication operations are a distinct business job.
- Account and sold-review panels live inside the Studio tree.
- Legacy V1 and V2 share a shell, making safe retirement harder.

Tabs are navigation, not domain boundaries. A head may link to another head or embed a narrowly scoped read-only summary, but that does not transfer data or workflow authority.

Current proven context:

- Digital Estimate supports backend-priced live customer selections.
- Customers can save and send selections to Elite.
- Studio V2 displays saved selections, **Review requested**, and **Accepted** independently.
- Studio V2 is refresh-safe at `?studioV2=1&caseId=<caseId>`.
- A customer can accept an unchanged published estimate.
- Creating a revision from customer selections is **not built**.
- AI Takeoff Lab exists but still needs clean separation from Studio-hosted takeoff UI.
- Studio V2 still depends on the mixed Inbox/V1 shell.
- Staff need a Digital Estimates Head/Command Center for publications and customer activity.

## 3. Final target head architecture

| Head | Primary authority | Target surface |
|---|---|---|
| Intake | Intake case, source evidence, triage state | Dedicated protected Intake head |
| AI Takeoff Lab | Measurement evidence and reviewed takeoff package | Existing `app-ai-takeoff/` as independent head |
| Estimate Queue | Assignment and operational estimate lifecycle | Dedicated queue route/head |
| Studio V2 | Estimate draft, backend calculation, revision, approval, publication command | Independent Studio V2 workspace |
| Digital Estimates | Publication links and customer activity operations | New staff head; public viewer remains `app-digital-estimate/` |
| Product Catalog | Products, materials, eligibility, customer-safe display metadata | Dedicated admin/read-model boundary |
| Sold Handoff | Post-acceptance readiness and explicit conversion | Dedicated protected head |
| Quote Library / Estimate History | Search, immutable history, lineage, archive/read access | Evolve `app-quote-library/` |
| Account Directory / Pricing Rules | Account identity and governed pricing inputs | Existing Account Directory and Pricing Admin heads with explicit contracts |

Cross-head identifiers should be explicit: `organizationId`, `intakeCaseId`, `takeoffJobId`, `estimateId`, `revisionId`, `publicationId`, `reviewRequestId`, `acceptanceId`, and account/catalog identifiers. Every tenant-owned read and mutation must be organization-scoped and backend-authorized.

## 4. Current scaffold inventory by head

### 4.1 Intake Head

**Purpose:** Receive quote opportunities, preserve inbound files/messages, resolve identity, classify readiness, and route work into takeoff or estimating.

**Owns:** Intake cases and attachments; source/provenance metadata; queue/list/detail UI; mailbox sync and dedupe; triage, missing-information, and readiness statuses; assign/request-information/start-next-step actions; intake APIs and audit events.

**Does not own:** Measurement approval, estimate pricing, revisions, publication, customer activity, acceptance, or sold conversion.

**Existing scaffold/current files:**

- `backend-core/src/quoteIntake/` — mailbox, Graph, repository, routes, types, bootstrap.
- `backend-core/src/quoteIntakeLab/` — isolated lab boundary.
- `app-quote-intake-lab/src/` — queue, case detail, classification, inbound adapters, lab repositories.
- `app-elite100-estimate-studio/src/estimateQueue/SharedInboxPage.tsx`
- `app-elite100-estimate-studio/src/estimateQueue/MailboxSyncModal.tsx`
- `app-elite100-estimate-studio/src/lib/quoteIntakeApi.mjs`
- `app-elite100-estimate-studio/src/lib/sharedInboxApi.mjs`
- `backend-core/src/elite100EstimateStudio/studioSharedInboxService.mjs`
- `backend-core/src/elite100EstimateStudio/studioSharedInboxReadModel.mjs`

**Reusable assets:** Quote Intake repository/routes; mailbox and attachment handling; shared Inbox read model; intake formatting/sanitization helpers; secure plan viewer.

**Migration target:** Promote the production-safe parts of `app-quote-intake-lab/` and Shared Inbox into a protected top-level Intake head backed by `backend-core/src/quoteIntake/`.

**Delete/retire later:**

- Studio-hosted `SharedInboxPage.tsx` — **retire after V2 default** and Intake deep links are stable.
- Duplicate `quoteIntake*` frontend helpers across Studio and AI Takeoff — **unknown/needs audit** before consolidation.
- Browser-local lab repositories — **retire soon** for production paths; keep fixtures for tests.

**Integration points:** Produces an organization-scoped intake case; AI Takeoff consumes plan files; Estimate Queue consumes readiness and assignment; Studio V2 opens by `intakeCaseId`.

**Do not build here:** pricing calculators, approve/publish buttons, acceptance, revision creation, or sold handoff.

### 4.2 AI Takeoff Lab Head

**Purpose:** Generate, review, correct, validate, and approve measurement evidence from plan files.

**Owns:** Takeoff jobs/results; page and dimension evidence; room/piece geometry; provider runs and diagnostics; review/QA statuses; generate, correct, save, validate, and approve-measurements actions.

**Does not own:** Prices, estimate totals, estimate approval, publication, customer links, acceptance, or sold status.

**Existing scaffold/current files:**

- `app-ai-takeoff/src/TakeoffLabApp.tsx`
- `app-ai-takeoff/src/components/TakeoffRunInbox.tsx`
- `app-ai-takeoff/src/components/TakeoffReviewWorkbench.tsx`
- `app-ai-takeoff/src/components/TakeoffDimensionEvidencePanel.tsx`
- `app-ai-takeoff/src/components/TakeoffQaGatePanel.tsx`
- `app-ai-takeoff/src/components/TakeoffImportPreview.tsx`
- `backend-core/src/takeoff/` — providers, evidence, generation, QA, approval, workspace, import contracts.
- Studio duplicates/integrations: `AiEstimatorWorkspace.tsx`, `AiTakeoffFirstPanel.tsx`, `EstimateTakeoffWorkspace.tsx`, `StudioV2TakeoffImportPanel.tsx`.
- `backend-core/src/elite100EstimateStudio/studioV2TakeoffImport.mjs`

**Reusable assets:** Existing independent app shell; job inbox/detail/workbench; evidence and QA services; approval gate; authoritative result contract; Studio V2 import preview/apply boundary.

**Migration target:** Keep `app-ai-takeoff/` as the top-level head. Expose an approved, immutable takeoff package that Studio V2 imports by identifier through backend APIs.

**Delete/retire later:**

- Studio-hosted AI estimator/takeoff workbench components — **retire after V2 default** once deep links to AI Takeoff cover equivalent workflows.
- `app-quote-intake-lab/src/takeoff/` experimental implementation — **unknown/needs audit** against `backend-core/src/takeoff/`.
- Legacy automatic estimate-building paths in takeoff — **keep as fallback for now**; prohibit new dependencies.

**Integration points:** Intake supplies files; AI Takeoff returns approved measurement evidence; Studio V2 explicitly imports it; Estimate Queue reads status only.

**Do not build here:** rates, markups, totals, estimate revisions, publication, customer actions, or implicit estimate mutation on approval.

### 4.3 Estimate Queue Head

**Purpose:** Coordinate who works each estimate, what operational stage it is in, and what requires attention.

**Owns:** Queue read models; assignment/priority; operational status and aging; blockers; list/detail/navigation UI; assign, claim, pause, resume, and open-authoritative-workspace actions.

**Does not own:** Pricing math, estimate line edits, approval snapshots, publications, customer selection persistence, or sold conversion.

**Existing scaffold/current files:**

- `EstimateQueuePage.tsx`, `EstimateQueueCaseDetail.tsx`, `EstimateCommandCenterPage.tsx`, `EstimateWorkflowHeader.tsx`, `AllEstimatesPage.tsx`.
- `app-elite100-estimate-studio/src/lib/estimateQueueApi.mjs`
- `backend-core/src/elite100EstimateStudio/studioEstimateQueueService.mjs`
- `backend-core/src/elite100EstimateStudio/studioEstimateQueueWorkflow.mjs`
- `backend-core/src/elite100EstimateStudio/studioOperationalStatus.mjs`
- `backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.mjs`
- `backend-core/src/elite100EstimateStudio/studioAllEstimatesService.mjs`

**Reusable assets:** Current queue service/workflow/status helpers, command-center view model, all-estimates read model, Inbox navigation.

**Migration target:** A dedicated protected queue head or route namespace. It may open Studio V2, AI Takeoff, Intake, or Digital Estimates through deep links.

**Delete/retire later:** Queue tabs in `StudioApp.tsx` — **retire after V2 default**; overlapping Inbox/queue/all-estimates list variants — **unknown/needs audit**.

**Integration points:** Reads stage summaries from Intake, AI Takeoff, Studio V2, and Digital Estimates; sends identifiers to the owning head; never writes their domain records directly.

**Do not build here:** estimate calculator controls, publish/revise commands, product editing, or browser-derived financial statuses.

### 4.4 Studio V2 Head

**Purpose:** Be the staff authority for creating, pricing, revising, approving, and publishing estimates.

**Owns:** Working drafts and immutable approved revisions; scope/options/pricing inputs; backend-calculated totals; approval and publication commands; revision lineage; workspace UI; calculate, approve, publish, and create-revision actions; draft/approved/published/superseded statuses.

**Does not own:** Intake ingestion, takeoff evidence generation, publication operations/customer outreach, catalog administration, acceptance-to-sold conversion, or account master data.

**Existing scaffold/current files:**

- `StudioV2EstimatorShell.tsx`, `StudioV2ScopeEditor.tsx`, `StudioV2EstimateOptionsPanel.tsx`, `StudioV2PricingControlsPanel.tsx`, `StudioV2ApprovalPanel.tsx`, `StudioV2PublishPanel.tsx`.
- `StudioV2CustomerSelectionReviewPanel.tsx` — read-only customer activity context.
- `app-elite100-estimate-studio/src/lib/studioV2Url.mjs`
- `backend-core/src/elite100EstimateStudio/elite100StudioV2Routes.js`
- `studioV2Service.mjs`, `studioV2WorkingDraft.mjs`, `studioV2Pricing.mjs`, `studioV2Approval.mjs`, `studioV2Publish.mjs`, `studioV2Revision.mjs`, `studioV2TakeoffImport.mjs`.
- Pricing authority pieces: `elite100RoomPricingCalculator.mjs`, `studioEstimatePricing.mjs`.

**Reusable assets:** The complete Slice A–I service/route/test suite; backend calculator; repository and immutability guards; publication adapter; refresh-safe URL contract.

**Migration target:** Separate protected Studio V2 head route/app shell. Preserve `caseId` deep links and backend route contracts while removing Inbox/V1 shell ownership.

**Delete/retire later:**

- `ConfigurationWorkspace.tsx`, `ReviewWorkspace.tsx`, and V1 branches in `StudioApp.tsx` — **keep as fallback for now**, then **retire after V2 default**.
- V1 `simplified-publish`, `refresh-from-takeoff`, and `ensure-editable-draft` paths — **retire after V2 default** only after production parity evidence.
- Duplicate V1/V2 panels — **unknown/needs audit**.

**Integration points:** Imports approved takeoff evidence; resolves account/catalog/pricing inputs; publishes immutable Digital Estimates; reads customer activity; creates an explicit sibling revision when authorized.

**Do not build here:** Inbox as permanent shell, customer public-link operations, catalog CRUD, sold conversion, or client-side pricing authority.

### 4.5 Digital Estimates Head

**Purpose:** Operate published Digital Estimates and give staff one place to see link lifecycle and customer activity.

**Owns:** Publication/link records and safe snapshots; public session/link lifecycle; customer view/save/send/accept activity; staff Command Center read model; resend/copy/deactivate-link actions where backend-authorized; publication and customer-activity statuses.

**Does not own:** Estimate editing or recalculation authority, revision creation logic, catalog administration, or sold handoff. It cannot mutate approved estimates or active publication snapshots in response to customer activity.

**Existing scaffold/current files:**

- Public head: `app-digital-estimate/src/App.tsx`, `ConfigurationView.tsx`, `ReadOnlyEstimateView.tsx`, `CustomerConfigurationFoundationPanel.tsx`, `publicConfigApi.ts`.
- Staff scaffold: `LiveDigitalEstimatesPage.tsx`, `EstimateDigitalEstimatePanel.tsx`, `EstimatePublicationSummary.tsx`.
- `backend-core/src/digitalEstimate/` — access, repository, snapshots, token/link, publishing, events, public serializers.
- `backend-core/src/digitalEstimate/configuration/` — sessions, selections, calculations, review requests, amendments.
- `liveDigitalEstimatesService.mjs`, `liveDigitalEstimatesStatus.mjs`, `studioPublicationSummary.mjs`, `studioCustomerSelectionReview.mjs`.
- Acceptance: `studioFinalAcceptanceRoutes.js`, `studioFinalAcceptanceService.mjs`.

**Reusable assets:** Public link/token/session infrastructure; customer-safe serializers; publication summary; Live Digital Estimates service/status; customer selection review read model; acceptance and review-request source-of-truth records.

**Migration target:** Keep `app-digital-estimate/` as the public customer surface. Add a separate protected staff Digital Estimates head and organization-scoped Command Center API/read model.

**Delete/retire later:** `LiveDigitalEstimatesPage.tsx` as a Studio tab — **retire soon** after dedicated head reaches parity; duplicated publication summaries — **unknown/needs audit**.

**Integration points:** Receives immutable publication from Studio V2; records customer activity; exposes review/acceptance facts back to Studio V2, Queue, History, and Sold Handoff.

**Do not build here:** estimate line editing, silent revision creation, mutation of approved/publication snapshots, browser pricing formulas, or marking a job sold.

### 4.6 Product Catalog Head

**Purpose:** Govern products/materials customers and estimators may select and the safe metadata used to present them.

**Owns:** Product/material identity, images, customer-safe names/copy, eligibility, availability, option grouping, catalog version/status, and catalog administration workflows.

**Does not own:** Estimate totals, per-estimate calculation, pricing-rule evaluation, revisions, publication, or customer acceptance.

**Existing scaffold/current files:**

- `backend-core/src/digitalEstimate/catalog/`
- `digitalEstimateProductOptions.mjs`, `esfPlumbingCatalog.mjs`, `roomEligibility.mjs`, `customerFacingCopy.mjs`.
- `backend-core/src/digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs`
- `customerCatalogPermissions.mjs`, `selectionAuthority.mjs`
- `app-digital-estimate/src/productCatalogImages.ts`
- `app-digital-estimate/src/productCatalogImageMap.json`
- Legacy catalogs: `backend-core/src/quotes/materialColorsCatalog.js`, `internalEstimateMaterialProgram.js`.

**Reusable assets:** Current customer-safe product option builders, eligibility rules, catalog seeds/contracts, image resolver/map, catalog permission serializer.

**Migration target:** Dedicated backend catalog read model and later protected catalog-admin head. Estimate and Digital Estimate consumers use versioned IDs and safe DTOs.

**Delete/retire later:** Hardcoded/duplicated material catalogs in quote apps — **unknown/needs audit**; static frontend image map — **keep as fallback for now**, retire after durable catalog media exists.

**Integration points:** Supplies selectable identities and display metadata to Studio V2 and Digital Estimate; Pricing Rules resolves prices server-side using catalog IDs.

**Do not build here:** subtotal/grand-total calculations, per-customer negotiated pricing, publish, acceptance, or estimate mutation.

### 4.7 Sold Handoff Head

**Purpose:** Review an accepted estimate and explicitly convert it into downstream sold/job-ready work.

**Owns:** Handoff readiness/checklist; accepted-source reference; downstream entry payload/status; privileged mark-sold/ready actions; audit trail; retryable connector handoffs.

**Does not own:** Customer quote interaction, acceptance capture, estimate editing, publication, or interpreting unsent customer selections as accepted scope.

**Existing scaffold/current files:**

- `app-elite100-estimate-studio/src/estimateQueue/SoldReviewPanel.tsx`
- `backend-core/src/elite100EstimateStudio/studioSoldReviewService.mjs`
- `backend-core/src/elite100EstimateStudio/studioLifecycleTypes.mjs`
- `backend-core/src/elite100EstimateStudio/studioLifecycleRepository.mjs`
- Legacy handoff: `backend-core/src/quotes/quoteLibraryHandoffPayloads.js`
- Quote delivery entry docs: `backend-core/src/quoteDelivery/`

**Reusable assets:** Sold review checklist and authorization; lifecycle repository; accepted-as-published record; legacy Moraware/QuickBooks entry-document builders after contract audit.

**Migration target:** Dedicated protected Sold Handoff head with an accepted/ready queue and explicit audited conversion command.

**Delete/retire later:** `SoldReviewPanel.tsx` inside Studio — **retire after V2 default** and dedicated head parity; legacy Quote Library mark-sold/handoff actions — **unknown/needs audit**.

**Integration points:** Consumes a valid acceptance plus immutable estimate/publication references; emits a sold/handoff event and connector work. It never consumes customer draft selections.

**Do not build here:** public links, selection review, acceptance capture, pricing, revision, or automatic sold transition.

### 4.8 Quote Library / Estimate History Head

**Purpose:** Search and inspect the durable history of quote/estimate families without becoming a second authoring authority.

**Owns:** Search, filters, lineage/timeline, immutable revision/publication/acceptance references, archive/read workflow, and open-in-owning-head links.

**Does not own:** Studio estimate mutations, calculations, publishing, customer activity writes, account/pricing administration, or sold conversion.

**Existing scaffold/current files:**

- `app-quote-library/src/QuoteLibraryApp.tsx`, `QuoteDetailModal.tsx`, `QuoteFilesBlock.tsx`.
- `backend-core/src/quotes/quoteLibraryApi.js`, `quoteLibrarySearch.js`, `quoteLibraryArchive.js`.
- `backend-core/src/elite100EstimateStudio/studioQuoteLibraryBridge.mjs`
- `backend-core/src/elite100EstimateStudio/studioAllEstimatesService.mjs`
- `app-elite100-estimate-studio/src/estimateQueue/AllEstimatesPage.tsx`

**Reusable assets:** Existing head/auth shell, search and account grouping, files block, Studio read-only bridge, all-estimates row projection.

**Migration target:** Evolve `app-quote-library/` into a unified history head through read-only projections. Keep legacy and Studio mutations routed to their owning systems.

**Delete/retire later:** Studio `AllEstimatesPage.tsx` after unified history parity — **retire after V2 default**; legacy Quote Library mutation controls for bridged Studio IDs — **retire soon** or keep explicitly blocked.

**Integration points:** Reads histories from Studio V2 and Digital Estimates; deep-links to Studio/DE/Handoff; never fabricates or mutates Studio records.

**Do not build here:** editable estimate forms, pricing math, publish/revise buttons for Studio records, or connector execution disguised as history.

### 4.9 Account Directory / Pricing Rules Head

**Purpose:** Govern who the customer/account is and which backend pricing policies apply. These are related setup dependencies but remain separate authorities.

**Owns:** Account Directory owns account/prospect identity, contacts, addresses, mappings, and estimate-safe identity snapshots. Pricing Rules owns price groups, rates, add-ons, policy rules, assignments, audit, and effective configuration.

**Does not own:** Estimate scope, estimate totals in the browser, takeoff evidence, publication, customer activity, or sold conversion.

**Existing scaffold/current files:**

- `app-account-directory/src/`
- `backend-core/src/accountDirectory/`
- Studio adapter/UI: `StudioAccountDirectoryPanel.tsx`, `studioAccountDirectoryLookup.mjs`, `studioPartnerAccountSearch.mjs`.
- `app-pricing-admin/src/PricingAdminApp.tsx`, `PartnerSetupTab.tsx`
- `backend-core/src/quotes/pricingAdminHeadApi.js`, `quotePricingAdminApi.js`, `pricingConfigResolver.js`.
- Studio pricing inputs: `studioEstimateTrustedAccounts.mjs`, `studioV2Pricing.mjs`.

**Reusable assets:** Existing standalone heads, backend role/capability gates, account snapshot helpers, pricing audit log and resolver.

**Migration target:** Keep Account Directory and Pricing Admin as protected top-level heads. Define versioned, organization-scoped contracts consumed by Studio V2. Do not merge their UIs merely because both are setup dependencies.

**Delete/retire later:** `StudioAccountDirectoryPanel.tsx` CRUD-like behavior — **unknown/needs audit**; legacy partner/account lookup and legacy pricing structures — **keep as fallback for now** pending deliberate cutover.

**Integration points:** Intake and Studio resolve account identity; Studio asks backend pricing authority for effective rules; approved snapshots retain the resolved identity/pricing references used at calculation time.

**Do not build here:** estimate calculation in admin browsers, estimate workflow statuses, publication, customer selection, or sold handoff.

## 5. Reuse map

| Capability | Reuse from | Use in target |
|---|---|---|
| Intake mailbox/case persistence | `backend-core/src/quoteIntake/` | Intake Head |
| Takeoff evidence, QA, approval | `backend-core/src/takeoff/`, `app-ai-takeoff/` | AI Takeoff Lab |
| Queue lifecycle/read models | `studioEstimateQueueService.mjs`, `studioOperationalStatus.mjs` | Estimate Queue |
| Authoritative calculator and V2 services | `elite100RoomPricingCalculator.mjs`, `studioV2*.mjs` | Studio V2 |
| Public link/token/session | `backend-core/src/digitalEstimate/` | Digital Estimates |
| Customer activity projections | `studioCustomerSelectionReview.mjs`, `studioPublicationSummary.mjs` | Digital Estimates/Studio |
| Live publication operations | `liveDigitalEstimatesService.mjs` | Digital Estimates Command Center |
| Product options and safe display | `backend-core/src/digitalEstimate/catalog/` | Product Catalog |
| Sold checklist/lifecycle | `studioSoldReviewService.mjs`, lifecycle repository | Sold Handoff |
| Unified history bridge | `studioQuoteLibraryBridge.mjs` | Quote Library |
| Account identity | `backend-core/src/accountDirectory/` | Account Directory |
| Pricing governance | `app-pricing-admin/`, `pricingConfigResolver.js` | Pricing Rules |

Reuse means preserving tested contracts, not copying ownership into another head.

## 6. Move-later map

| Current location | Future owner | Timing/condition |
|---|---|---|
| `SharedInboxPage.tsx`, mailbox UI in Studio | Intake | After production Intake head and deep links |
| `AiEstimatorWorkspace.tsx`, `AiTakeoffFirstPanel.tsx` | AI Takeoff Lab | After independent job/detail/review parity |
| Queue/command-center pages under Studio | Estimate Queue | After route/head access and deep links |
| Studio V2 components under mixed `StudioApp.tsx` | Studio V2 | After independent shell preserves URL contract |
| `LiveDigitalEstimatesPage.tsx` | Digital Estimates | First recommended slice |
| Product catalog constants across DE/quotes | Product Catalog | After ID/version/media audit |
| `SoldReviewPanel.tsx` | Sold Handoff | After accepted-ready queue exists |
| `AllEstimatesPage.tsx` | Quote Library/History | After unified read-only projection |
| Studio account panel | Account Directory | After lookup/deep-link UX decision |

Move-later does not mean move files now. Prefer contract-first extraction, parallel routes, and one reversible slice per PR.

## 7. Delete/retire-later map

| Candidate | Classification | Reason/retirement gate |
|---|---|---|
| V1 Studio authoring branches | Keep as fallback for now | Retire after V2 default, parity, rollback rehearsal, and observation period |
| V1 `simplified-publish` flow | Retire after V2 default | V2 publication becomes sole production path |
| V1 `refresh-from-takeoff` / editable-draft acquisition | Retire after V2 default | Explicit approved takeoff import and sibling revisions proven |
| Studio-hosted AI workbench | Retire after V2 default | Independent AI Takeoff head owns evidence |
| Studio Live Digital Estimates tab | Retire soon | Dedicated Digital Estimates head reaches read/action parity |
| Studio All Estimates page | Retire after V2 default | Unified Quote Library history available |
| Studio Sold Review panel | Retire after V2 default | Dedicated Handoff head available |
| Browser-local Intake Lab repositories | Retire soon | Production API/repository path replaces them |
| Duplicate material/product catalogs | Unknown/needs audit | Must map IDs and snapshots before deletion |
| Legacy pricing structures/resolvers | Keep as fallback for now | Deliberate parity-tested pricing cutover |
| Legacy Quote Library mutations for Studio bridge IDs | Retire soon | Already forbidden; remove misleading controls |

No item in this table should be deleted as part of architecture or shell work.

## 8. V1 Studio retirement plan

1. **Freeze:** No new features in V1. Security/data-integrity fixes only.
2. **Inventory parity:** Map every production V1 action, API, status, and rollback path to V2 or mark it intentionally removed.
3. **Default V2:** Make V2 the default for a controlled staff cohort while preserving direct V1 fallback.
4. **Observe:** Track load failures, calculate/approve/publish outcomes, revision integrity, and support incidents.
5. **Read-only V1:** Disable V1 mutations after an announced observation period; retain historical access if needed.
6. **Remove routing:** Delete V1 entry points only after rollback rehearsal, data/export verification, and explicit decision record.
7. **Delete internals:** Remove V1-only helpers/tests in narrow PRs after route removal—not during head separation.

Retirement gates: V2 refresh/deep-link stability, calculation parity, immutable approval/publication tests, revision flow, staff training, authorization review, organization scoping, and documented rollback.

## 9. Recommended next five implementation slices

The proposed order is sound. Keep it, with Slice 2 explicitly contract-first and backend-owned.

### Slice 1 — Digital Estimates Head: Command Center read model/UI

- **Goal:** Dedicated staff list/detail of active and historical publications, customer views/saves, review requests, and acceptances.
- **Likely touched:** new protected app/head scaffold; `liveDigitalEstimatesService.mjs`; `liveDigitalEstimatesStatus.mjs`; `studioPublicationSummary.mjs`; launcher/head URL config; organization-scoped routes.
- **Do not touch:** pricing calculators, public selection calculation, publication snapshots, acceptance semantics, Studio approval/revision.
- **Risk:** Medium (cross-tenant/read-model and authorization risk).
- **Rollback:** Remove launcher exposure/new route; existing Studio page remains fallback.
- **Acceptance criteria:** Backend-enforced head access and `organization_id`; list/detail match current publication/activity facts; no secrets/internal economics; no writes in Slice 1; Studio/public behavior unchanged.

### Slice 2 — Create revision from customer selections

- **Goal:** An estimator explicitly reviews a submitted request and creates a new Studio V2 sibling revision seeded from approved scope plus selected, validated changes.
- **Likely touched:** `studioV2Revision.mjs`, `studioV2Service.mjs`, V2 routes/panel, customer selection review projection, dedicated tests.
- **Do not touch:** original approved revision, active publication snapshot, public browser pricing math, automatic approval/publication, sold handoff, V1.
- **Risk:** High.
- **Rollback:** Feature flag/hide explicit action; preserve review request and original publication; delete no records.
- **Acceptance criteria:** Idempotent/concurrency-safe explicit action; authorized and org-scoped; original snapshots unchanged; new revision remains draft; no auto-calculate/approve/publish; provenance links review request, source publication, and source revision.

### Slice 3 — AI Takeoff Lab: independent job list/detail/review shell

- **Goal:** Make the existing independent head the sole interactive owner of takeoff review, with Studio opening it by deep link and consuming only approved packages.
- **Likely touched:** `app-ai-takeoff/src/`, takeoff workspace routes/services, launcher config, Studio links/read-only summary.
- **Do not touch:** Studio pricing/approval/publication, Digital Estimate, provider math unless a separate audited fix.
- **Risk:** Medium.
- **Rollback:** Preserve current Studio-hosted takeoff panels behind existing navigation.
- **Acceptance criteria:** List/detail/review deep links are refresh-safe; auth/head/org scopes enforced; approved package identity is stable; approval does not mutate estimates.

### Slice 4 — Studio V2 Head separation

- **Goal:** Give Studio V2 its own protected shell/route so Inbox and V1 tabs no longer own workspace state.
- **Likely touched:** `StudioApp.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2Url.mjs`, entrypoint/routing/head deployment config.
- **Do not touch:** V2 calculator, approve/publish/revision service semantics, V1 behavior during fallback, Digital Estimate pricing.
- **Risk:** Medium-high (navigation/auth/deployment).
- **Rollback:** Route users to existing `?studioV2=1&caseId=...` shell.
- **Acceptance criteria:** Direct refresh/back/forward work; queue/intake deep links open the same case; shared `EliteosTopbar`; backend permissions unchanged; V1 fallback remains reachable.

### Slice 5 — Sold Handoff Head: accepted estimate review/ready-for-sold queue

- **Goal:** Dedicated queue for accepted estimates requiring explicit staff readiness review before sold conversion.
- **Likely touched:** new protected app/head; `studioSoldReviewService.mjs`; lifecycle repository/types; acceptance read model; audited route.
- **Do not touch:** customer acceptance endpoint/meaning, estimate/publication snapshots, pricing, customer selections, automatic Moraware/QB writes in Slice 1.
- **Risk:** High (irreversible business transition and integrations).
- **Rollback:** Read-only mode/disable conversion command; acceptance records remain intact.
- **Acceptance criteria:** Only accepted, organization-scoped records appear; checklist and privileged backend command required; duplicate command idempotent; audit row written; no automatic sold state or connector write.

## 10. “Do not build here” anti-drift table

| Head | Do not build here |
|---|---|
| Intake | Pricing, measurement approval, publication, acceptance, sold conversion |
| AI Takeoff Lab | Rates, totals, estimate approval/revision/publication |
| Estimate Queue | Pricing math, estimate line editing, customer activity writes |
| Studio V2 | Intake ingestion, takeoff generation, catalog admin, link operations, sold conversion |
| Digital Estimates | Estimate editing, silent revision, snapshot mutation, sold status |
| Product Catalog | Estimate totals, negotiated pricing, publication/acceptance |
| Sold Handoff | Customer interactions, acceptance capture, pricing/revision |
| Quote Library/History | Studio mutations, calculation, publish/revise, connector execution |
| Account Directory/Pricing Rules | Estimate workflow, browser calculation, publication/customer activity |

Global rules:

- A tab does not transfer domain ownership.
- Browser code may collect inputs and render backend results; it does not own pricing math.
- Backend owns pricing, publication, acceptance, and revision decisions.
- Approved snapshots and active publications are immutable.
- Customer selections create a review request or an acceptance record; they never silently mutate an estimate.
- All tenant data is organization-scoped; all sensitive actions are backend-authorized and audited.

## 11. Tomorrow-readiness notes

- Start Slice 1 with a read-model contract and threat model before UI.
- Reuse `liveDigitalEstimatesService.mjs` and status helpers rather than reading publication tables directly from a browser.
- Define staff head slug, deployment URL, roles, and organization filter before exposing the launcher card.
- Keep the first Digital Estimates slice read-only; defer resend/deactivate actions until auth, audit, and link-lifecycle semantics are reviewed.
- Preserve current Studio Live Digital Estimates page as rollback until parity is proven.
- Add fixture coverage for saved-only, review-requested, accepted-as-published, inactive/expired, and cross-org denial states.
- Do not combine tomorrow’s work with revision creation, head separation, or V1 cleanup.

## 12. Open questions / needs code audit

1. Which database tables are definitively tenant-owned for Studio estimates, publications, configurations, review requests, acceptances, and lifecycle events, and do all contain/enforce `organization_id`?
2. What is the canonical staff head slug and URL for Intake, Estimate Queue, Studio V2, Digital Estimates, Product Catalog, Sold Handoff, and History?
3. Which current `LiveDigitalEstimates` actions are read-only versus mutation-capable, and what audit records exist?
4. Are view/open events persisted today, or only session/configuration/review/acceptance facts?
5. What is the authoritative catalog ID/version model across plumbing, materials, edges, images, and legacy quote catalogs?
6. Which V1 production actions still lack V2 parity?
7. Does revision-from-customer-selections need per-line accept/reject, all-or-nothing application, or both?
8. How should a review request close when its revision is created, published, rejected, or superseded?
9. What exact acceptance state qualifies for Sold Handoff, including revised publications and revoked/replaced links?
10. Which Quote Library legacy rows and Studio estimates can share a common history projection without conflating authorities?
11. Can duplicate intake/takeoff frontend helpers be replaced by a shared package without coupling head release cycles?
12. Which irreversible actions require structured audit events beyond current lifecycle rows?

---

**Decision:** Use this document as the ownership map for new quote-platform work. If a proposed feature crosses heads, define the producing and consuming contracts first; do not place it in the nearest existing tab.

**Runtime impact:** None. This document does not move, delete, or modify application code, APIs, data, pricing, publishing, acceptance, revision, AI takeoff, or customer-selection behavior.