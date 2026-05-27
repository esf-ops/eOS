# eliteOS Monolith Extraction Inventory

**Date:** 2026-05-27  
**Phase:** Stabilization (strangler-fig planning only — no extractions in this pass)  
**Related:** [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md) · [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md)

---

## Purpose

Large single-file heads are a **velocity and review risk**, but a big-bang rewrite would be unsafe. This inventory supports a **strangler-fig** plan: document ownership and risk first, then **small, behavior-preserving extractions** in later PRs (one concern per commit, verification before/after).

**Scope of this document:** Four known monoliths plus existing `verify*.mjs` scripts. **Out of scope here:** implementing extractions, schema changes, or auth changes.

---

## Line counts (2026-05-27)

| File | Lines | Tier |
|------|------:|------|
| `app-internal-estimate/src/InternalEstimateApp.tsx` | **3,970** | Largest frontend monolith |
| `backend-core/src/sales/salesHead.js` | **3,175** | Largest backend head module |
| `app-system-admin/src/ui/App.tsx` | **3,141** | Largest admin UI monolith |
| `app-quote-library/src/QuoteLibraryApp.tsx` | **1,939** | Large; already partially split (`lib/`) |

**Total across four files:** ~12,225 lines.

**Already extracted from Internal Estimate (do not re-merge blindly):**

- `CustomerEstimatePrint.tsx` — customer PDF / print layout
- `VisualLayoutCanvas.tsx` — non-authoritative drag layout
- `InternalGuidedShapePreview.tsx` — guided shape preview UI

**Already extracted from Quote Library:**

- `lib/api.ts`, `lib/format.ts`, `lib/labels.ts`, `lib/supabase.ts`

---

## Verification scripts inventory

All under `backend-core/src/scripts/`. Run manually or via local check scripts; **none substitute for full UI smoke**.

| Script | Protects | DB required |
|--------|----------|-------------|
| `verifyInternalEstimateMath.mjs` | `quoteCalculator.js` — wholesale/direct, custom lines, internal_quote totals, no client markup leakage | No |
| `verifyInternalEstimateGuidedMeasurement.mjs` | Guided shape overlap, chargeable counter ceil, `roomGuidedMeasurement.js` parity with calculator | No |
| `verifyInternalQuoteRevisions.mjs` | Revision numbering, restore payload shape, `internalQuoteRestore.js`, `quoteEsfNumber.js` | No |
| `verifyInternalQuoteSaveResponseContract.mjs` | POST save JSON keys the Internal Estimate client expects | No |
| `verifyPhase2InternalQuotePolicies.mjs` | `internalQuotePatchPolicy.js` — snapshot immutability, archived/non-current guards | No |
| `verifyQuoteEsfNumber.mjs` | ESF quote number base/revision helpers | No |
| `verifySalesKpiV1.mjs` | KPI v1 **pure** logic (CDT vs `grand_total`, period buckets, status classes) — **duplicated inline**, not imported from `salesHead.js` | No |
| `verifyPartnerQuoteLeakage.mjs` | Cross-tenant / leakage guards for Partner Quote | Varies |
| `verifyPartnerQuoteFoundation.mjs` | Partner Quote foundation contracts | Varies |

**Gap:** No automated tests for Quote Library UI, System Admin UI, or Sales dashboard React. KPI script can **drift** from `salesHead.js` if helpers are edited in only one place.

---

## 1. `InternalEstimateApp.tsx` (~3,970 lines)

### Major sections (approximate)

| Lines (approx) | Section |
|----------------|---------|
| 1–54 | Imports, constants (`WORKFLOW_SECTIONS`, branches, reps, tax presets) |
| 55–279 | Types, pure helpers (`num`, revision pickers, `localRunToDemo`, workspace shell, user initials) |
| 281–540 | Component state (~50+ `useState`), auth/session, user menu |
| 541–900 | Calculate path: `buildCalcPayload`, local run, `handleCalculate`, scroll/nav helpers |
| 768–900 | Revision dirty/baseline signatures, save block reasons |
| 900–1,360 | Save path: `buildSubmitPayload`, `handleSubmit`, restore revision, post-save identity |
| 1,358–1,700 | Derived totals memos: `liveEstimate`, `customerDisplayTotal`, `stickyLiveRollup`, comparisons |
| 1,698–1,910 | Effects: material colors API, `?quoteId=` hydration from `/api/internal-quotes/:id` |
| 1,913–3,940 | JSX: topbar, workflow sections (Job → Rooms → Visual → Add-ons → Review → Output → Save), room editors, sticky sidebar, modals |
| 3,940–3,970 | `CustomerEstimatePrint` mount |

Workflow nav ids: `sec-job`, `sec-rooms`, `sec-visual`, `sec-addons`, `sec-review`, `sec-output`, `sec-save`.

### What this file owns

- End-to-end **Internal Estimate** UX: auth gate, room drafts, guided measurement UI wiring, add-ons/custom lines, calculate + save + revision UX, library deep-link hydration, customer-facing total (CDT) alignment with print, workflow scroll UX, visual layout (non-pricing).
- Orchestration of **`@quote-lib`** calculator types, serialization (`serializeRoomsForApi`, room drafts), and backend calls (`/api/internal-quotes/*`).

### Highest risk

- **`buildCalcPayload` / `buildSubmitPayload` / `handleSubmit`** — payload shape, `customer_display_total`, revision intent, snapshot `internal_ui` persistence.
- **`customerDisplayTotal` + `customerDisplayTotalRef`** — TDZ/hydration ordering; must match `CustomerEstimatePrint` rounding.
- **`?quoteId=` hydration** — rehydrating `estimate_room_drafts`, pricing mode, revision flags, family latest pointers.
- **Revision workflow** — `save_revision` vs `update_existing` vs `save_as_new_quote`, baseline signature dirty detection.

### Changes often / bug-prone

- Customer total vs backend `grand_total` / CDT persistence.
- Revision “latest” / `is_current_revision` UI guards.
- Room draft serialization and guided shape groups.
- Save panel labels and block reasons.
- Hydration gaps for older quotes missing `estimate_room_drafts`.

### Pure helpers — safe to extract later (after tests)

| Candidate | Notes |
|-----------|--------|
| `num`, `workflowLabel`, `newInternalRowId` | Trivial |
| `parseIsCurrentRevisionFlag`, `pickLatestFamilyRevision`, `isOpenedRevisionLatest` | Revision UI only; pair with `verifyInternalQuoteRevisions.mjs` |
| `resolveWorkspaceName`, `workspaceInitials`, `homeLauncherUrl`, `deriveDisplayNameFromEmail`, `userInitialsFor` | Duplicated across heads — extract per-head first, shared package later |
| `localRunToDemo` | Bridge to demo calc; keep near calculator imports |

### UI components — extract later (medium risk)

- Topbar + user menu block (~lines 1916–2100).
- Workflow section shell / sticky estimator sidebar (large JSX blocks).
- Save / revision panel and “start new quote” modals.
- Per-room cards (largest JSX chunk) — **high coupling** to `roomDrafts` setters.

### Do not touch yet (stabilization)

- `handleCalculate`, `buildSubmitPayload`, `handleSubmit`, hydration effect body.
- Anything that changes **`calculation_snapshot.internal_ui`** or calculator inputs.

### Verification coverage

| Script | Relevance |
|--------|-----------|
| `verifyInternalEstimateMath.mjs` | Core calculator totals |
| `verifyInternalEstimateGuidedMeasurement.mjs` | Guided measurement → calculator |
| `verifyInternalQuoteRevisions.mjs` | Revision restore/numbering |
| `verifyInternalQuoteSaveResponseContract.mjs` | Save response keys |
| `verifyPhase2InternalQuotePolicies.mjs` | Patch/immutability policy |
| `verifyQuoteEsfNumber.mjs` | Quote numbers on save |

### Missing tests before extraction

- Frontend unit tests for `customerDisplayTotal` memo vs `CustomerEstimatePrint.finalRounded`.
- Integration test: save → reload `?quoteId=` → CDT unchanged.
- Contract test importing **`buildSubmitPayload` output shape** (today only save *response* is verified).

### Extraction risk rank

**High** for save/calculate/hydration; **medium** for large JSX slices; **low** for top-level pure helpers and workspace shell duplicates.

---

## 2. `app-system-admin/src/ui/App.tsx` (~3,141 lines)

### Major sections (approximate)

| Lines (approx) | Section |
|----------------|---------|
| 1–41 | Imports (`MorawareAdmin`, `api`, schema health) |
| 42–330 | Workspace shell helpers, types, `fmt*` / `titleizeToken` / `setupStatus` / invite helpers |
| 342–522 | `UserSnapshot` component |
| 523–733 | `UserLifecycleActions` (invite reset, deactivate, delete) |
| 734–867 | `MorawareSyncStatusCard` |
| 868–1,650 | Main `App`: auth, `/api/me`, reference load, user list filters, hero shell |
| 1,652–2,800 | Nav views: people, organizations, invite, audit, diagnostics tabs |
| 2,805–3,141 | `ProfileForm`, `HeadSelector`, `DealerForm`, `PricingForm` (bottom of file) |

**Nav views:** `people`, `organizations`, `invite_users`, `audit`, `diagnostics`, `sales_mapping`, `moraware`, `identity_resolution`.

### What this file owns

- **System Admin** head UI: Supabase sign-in, admin role gate (`privilegedApplicationRole`), user roster + detail drawer, profile/head/dealer/pricing edits, invite flow, audit event viewer, diagnostics (schema health, quote pipeline, legacy pricing), Moraware admin embed, sales mapping / identity resolution entry points.

### Highest risk

- **User lifecycle API calls** — invite, deactivate, reactivate, password reset, profile PATCH (org + `job_title`).
- **Head access / dealer access / pricing group** writes.
- **Audit log queries** — filters and PII display.

### Changes often / bug-prone

- Profile form save + reload (`job_title`, `organization_id`).
- User list filters and detail drawer sync.
- Toast/error handling on PATCH flows.
- CSS interaction with primary buttons (recent regression).

### Pure helpers — safe to extract later

| Candidate | Notes |
|-----------|--------|
| `fmt`, `fmtNumber`, `fmtAge`, `sumCounts`, `fmtReadableDate` | Display-only |
| `titleizeToken`, `setupStatus`, `inviteStatusLabel`, `lastSignInText` | Display-only |
| `privilegedApplicationRole`, `headDisplayLabel` | Small; used for gating labels |
| Workspace shell: `resolveWorkspaceName`, `homeLauncherUrl`, `deriveDisplayNameFromEmail`, `userInitialsFor` | Same pattern as other heads |

### UI components — extract later

| Component | Risk |
|-----------|------|
| `MorawareSyncStatusCard` | **Low** — read-only status display |
| `UserSnapshot` | **Low–medium** — read-only summary |
| `UserLifecycleActions` | **Medium** — mutating actions |
| `ProfileForm`, `HeadSelector`, `DealerForm`, `PricingForm` | **Medium** — already isolated at bottom of file; move to `components/` |

### Do not touch yet

- `apiFetch` paths and payload shapes for `/api/system-admin/*`.
- Role checks (`canOperate`, `privilegedApplicationRole` behavior).

### Verification coverage

| Script | Relevance |
|--------|-----------|
| *(none dedicated)* | Admin behavior relies on manual smoke + backend route tests |

### Missing tests before extraction

- Contract tests for `GET /api/system-admin/reference` (orgs list) and profile PATCH body.
- Smoke script or Playwright for org dropdown + job title round-trip.

### Extraction risk rank

**Low** for formatters + read-only cards; **medium** for forms and lifecycle actions; **high** for auth gating and any change to who can call user-mgmt APIs.

---

## 3. `QuoteLibraryApp.tsx` (~1,939 lines)

### Major sections (approximate)

| Lines (approx) | Section |
|----------------|---------|
| 1–24 | Imports; `pickDisplayTotal` (CDT vs `grand_total`) |
| 25–228 | Workspace shell, tab types, `str`/`loc`, pill classes, timeline formatter, `HandoffDocBlock`, URL helpers |
| 230–747 | State, auth, tabs, list fetch, filters, batch selection, metrics |
| 748–900 | Drawer derivations (account, handoff docs, warnings) |
| 900–1,939 | JSX: topbar, tabs, table, filters, detail drawer, status/sold/archive/duplicate/revision/handoff actions |

### What this file owns

- **Quote Library** list + detail drawer: tabs (`all`, `by_account`, `my`, `internal`, `public`, `sold`, `handoff`), search/filters, metrics banner, batch archive, per-quote actions (status, mark sold, archive, duplicate, restore-as-revision, Moraware/QB handoff doc generation).
- Display total policy via **`pickDisplayTotal`** (aligned with Sales KPI CDT preference).

### Highest risk

- **Drawer action handlers** — PATCH status, mark sold, archive, duplicate, restore-as-revision (state transitions).
- **Batch archive** — multi-row `/api/quote-library/quotes/batch/archive`.
- **Handoff doc generation** — side effects on quote records.

### Changes often / bug-prone

- Tab/filter query params and list refresh after actions.
- Drawer revision list refresh.
- Display total column vs drawer total (`pickDisplayTotal` consistency).
- Handoff pill/status display.

### Pure helpers — safe to extract later

| Candidate | Notes |
|-----------|--------|
| `pickDisplayTotal` | **Important semantic** — extract to `lib/displayTotal.ts`; add unit tests mirroring `verifySalesKpiV1` rules |
| `statusPillClass`, `handoffPillClass`, `canBatchArchiveRow` | CSS mapping only |
| `formatTimelineEntry`, `latestHandoffDoc` | Display |
| `str`, `loc` | Row field accessors |
| Workspace shell duplicates | Same as other heads |
| `HandoffDocBlock` | Small presentational component → `components/HandoffDocBlock.tsx` |

### UI components — extract later

- Detail drawer shell (header + sections) — **medium** (large but mostly presentational).
- Quote table row — **low–medium**.
- Topbar / user menu — **low** (matches other heads).

### Do not touch yet

- API paths and request bodies for status/archive/duplicate/restore.
- `pickDisplayTotal` **semantics** during stabilization (Sales KPI and library list depend on it).

### Verification coverage

| Script | Relevance |
|--------|-----------|
| `verifySalesKpiV1.mjs` | Same CDT vs `grand_total` precedence (backend KPI, not UI file) |
| `verifyInternalEstimateMath.mjs` | Indirect — totals originate from Internal Estimate save |

### Missing tests before extraction

- Dedicated `verifyQuoteLibraryDisplayTotal.mjs` (or shared module tested by KPI + library).
- UI smoke checklist entries for CDT column vs drawer (already in stabilization QA log).

### Extraction risk rank

**Low** for pills/formatters/`HandoffDocBlock`; **medium** for drawer layout split; **high** for action handlers and batch archive.

---

## 4. `backend-core/src/sales/salesHead.js` (~3,175 lines)

### Major sections (approximate)

| Lines (approx) | Section |
|----------------|---------|
| 1–130 | Sales roles, org resolution, local date helpers (`parseLocalYmd`, `resolveSalesDateRange`, comparisons) |
| 130–530 | Performance period parsing, performance intelligence filters/aggregates |
| 536–900 | `salesPerformanceIntelligenceHandler` |
| 902–1,200 | Job fetch, batch maps, `applySalesFilters`, `aggregateCore`, trend builders |
| 1,204–1,550 | `salesSummaryHandler`, salesperson/account handlers, trend, jobs, filters |
| 1,558–1,670 | `salesDebugHandler` |
| 1,671–2,400 | Moraware import summaries, prepared facts loaders, attribution coverage |
| 2,377–2,450 | Production reconciliation, rebuild Moraware facts |
| 2,473–2,750 | `salesDashboardFoundationHandler` |
| 2,753–3,097 | KPI v1: `pickKpiCdtValue`, `fetchKpiQuotePipeline`, `salesKpiV1Handler` |
| 3,106–3,175 | `attachSalesHeadRoutes` — mounts `/api/sales/*` |

**Registered routes (representative):** `summary`, `salesperson-performance`, `account-performance`, `trend`, `jobs`, `filters`, `dashboard-foundation`, `production-reconciliation`, `performance-intelligence`, `debug`, `kpi-v1`, POST rebuild facts.

### What this file owns

- **Sales Head** read APIs: Moraware job aggregates, filters, dashboard foundation, KPI v1 quote + Moraware rollups, performance intelligence, debug counts.
- Org-scoped queries via `resolveSalesOrganizationId`.
- CDT-aware quote pipeline math for KPI v1.

### Highest risk

- **`salesKpiV1Handler` + `fetchKpiQuotePipeline`** — revenue recognition semantics, revision filter, period bucketing.
- **`buildSalesMorawareJobFactsForLatestGroup` / rebuild POST** — writes prepared facts.
- **Attribution filters** — branch/rep gating with approved mappings.
- **Date range helpers** — shared by many handlers; timezone/local calendar assumptions.

### Changes often / bug-prone

- KPI v1 response shape (Sales dashboard Command Center).
- `customer_display_total` vs `grand_total` fallback.
- Dashboard foundation freshness fields.
- Moraware sync health embedded in responses.

### Pure helpers — extract later (only with shared tests)

| Candidate | Notes |
|-----------|--------|
| `parseLocalYmd`, `fmtLocal`, `pad2`, week/month/quarter helpers | Duplicated in `verifySalesKpiV1.mjs` — **extract to `salesDateUtils.js` and import from both** |
| `pickKpiCdtValue` | **Must** be single source of truth with verify script |
| `pctDelta`, `pctYoY`, `safeNum` | Low risk |
| `validateYmd`, `periodBucketForKpi` | Medium — KPI-specific |

### Do not touch yet

- Handler SQL/Supabase queries, org resolution, role middleware wiring.
- Moraware fact rebuild pipeline.
- Any change to KPI totals without updating `verifySalesKpiV1.mjs` **and** running Sales smoke.

### Verification coverage

| Script | Relevance |
|--------|-----------|
| `verifySalesKpiV1.mjs` | KPI pure logic (partial; inline duplicate) |

### Missing tests before extraction

- Import-based tests from `salesHead.js` exports (eliminate duplicate inline helpers in verify script).
- Handler-level tests with fixture DB or mocked Supabase for `fetchKpiQuotePipeline` revision filter branch.

### Extraction risk rank

**High** for handlers and fact builders; **medium** for date/KPI helpers after deduplicating verify script; **low** for tiny math formatters.

---

## Cross-cutting duplication

The same **workspace topbar identity** helpers appear in Internal Estimate, Quote Library, and System Admin (~40 lines each):

- `resolveWorkspaceName`, `resolveWorkspaceShortId`, `resolveWorkspaceLogoUrl`, `workspaceInitials`, `homeLauncherUrl`, `deriveDisplayNameFromEmail`, `userInitialsFor`

**Recommendation:** Do **not** introduce a shared npm package during stabilization. Extract **within each head** first (Pass 1–2 below). A later `packages/head-shell/` or similar is a **medium-risk** consolidation pass after stabilization exit.

**CDT display total** appears in:

- `QuoteLibraryApp.tsx` — `pickDisplayTotal`
- `salesHead.js` — `pickKpiCdtValue`
- `verifySalesKpiV1.mjs` — inline copy

Consolidation belongs in **`@quote-lib` or `backend-core/src/quotes/displayTotal.js`** only after a dedicated verify module and stabilization exit.

---

## Ranked extraction candidates

### Low risk (start here after stabilization QA)

| Target | Extract to | Why |
|--------|------------|-----|
| Quote Library pill/timeline helpers | `app-quote-library/src/lib/quoteDisplay.ts` | No API, no math |
| `HandoffDocBlock` | `app-quote-library/src/components/HandoffDocBlock.tsx` | Presentational |
| System Admin `fmt*` / `titleizeToken` / status labels | `app-system-admin/src/ui/adminFormat.ts` | Display-only |
| `MorawareSyncStatusCard` | `app-system-admin/src/ui/components/MorawareSyncStatusCard.tsx` | Read-only |
| Workspace shell (per head) | `*/lib/workspaceShell.ts` | Copy-paste move, no behavior change |

### Medium risk (later passes; tests + smoke required)

| Target | Notes |
|--------|--------|
| `pickDisplayTotal` → shared module + unit test | Semantic coupling to Sales KPI |
| System Admin `UserSnapshot`, `ProfileForm` files | Form state + API coupling |
| Quote Library drawer **layout** (not actions) | Large JSX move |
| Internal Estimate revision **pure** helpers | Pair with revision verify scripts |
| `salesDateUtils.js` + wire `verifySalesKpiV1.mjs` to imports | Eliminates drift |

### High risk (defer past stabilization exit)

| Target | Notes |
|--------|--------|
| Internal Estimate `buildSubmitPayload` / `handleSubmit` | Core product path |
| Internal Estimate room editor JSX | Dense state coupling |
| Quote Library drawer **actions** | Workflow side effects |
| `salesHead.js` handler splits with query changes | Brain contract + org scope |
| Moraware fact rebuild extraction | Writes + sync health |
| Shared CDT package without full test matrix | Cross-head revenue display |

---

## Recommended first 3 safe extraction passes

Each pass = **one PR, one commit theme**, `eos:check:local` + targeted verify scripts + manual smoke for affected head.

### Pass 1 — Quote Library display helpers (lowest risk)

1. Create `app-quote-library/src/lib/quoteDisplay.ts`.
2. Move unchanged: `statusPillClass`, `handoffPillClass`, `canBatchArchiveRow`, `formatTimelineEntry`, `latestHandoffDoc`, `str`, `loc`.
3. Move `HandoffDocBlock` → `components/HandoffDocBlock.tsx`.
4. **Do not move** `pickDisplayTotal` yet (semantic; do in Pass 4 with tests).
5. Verify: Quote Library build + smoke list/filter/drawer pills.

### Pass 2 — System Admin formatters + Moraware card (low risk)

1. Create `app-system-admin/src/ui/adminFormat.ts` — move `fmt`, `fmtNumber`, `fmtAge`, `sumCounts`, `fmtReadableDate`, `titleizeToken`, `setupStatus`, `inviteStatusLabel`, `lastSignInText`.
2. Move `MorawareSyncStatusCard` to `components/MorawareSyncStatusCard.tsx`.
3. Verify: System Admin build + diagnostics Moraware status card + people list still loads.

### Pass 3 — Per-head workspace shell (low risk, no shared package)

1. Add `workspaceShell.ts` under each head’s `lib/` (Quote Library, System Admin, Internal Estimate).
2. Move workspace/name/initials/home URL helpers verbatim.
3. Verify: topbar on each head unchanged (visual + links).

**Explicitly not in first 3 passes:** Internal Estimate calculate/save/hydration; `pickDisplayTotal` / KPI math consolidation; Sales handler splits; Quote Library drawer action refactor.

### Pass 4+ (after Pass 1–3 and stabilization exit)

- `pickDisplayTotal` + `pickKpiCdtValue` → single tested module + `verifyQuoteDisplayTotal.mjs`.
- System Admin: `UserSnapshot` + `ProfileForm` to `components/`.
- Internal Estimate: revision pure helpers only.
- `salesHead.js`: `salesDateUtils.js` extraction with verify script imports.

---

## Safe extraction rules

Use for every extraction PR during and after stabilization:

1. **One extraction per commit** (one logical move: helpers *or* one component, not both).
2. **No behavior changes** — move code only; no “while we’re here” fixes.
3. **Tests/checks before and after** — run relevant `verify*.mjs` and `npm run eos:check:local`; smoke the affected head.
4. **No pricing/math changes** unless covered by `verifyInternalEstimateMath.mjs`, guided measurement script, and Internal Estimate smoke.
5. **No auth/permission changes** — no role matrix edits, no RLS, no `requireHeadAccess` changes.
6. **No SQL/migrations** in extraction PRs.
7. **Stop if diff grows too large** — target &lt;300 lines moved per PR; split if reviewable surface explodes.
8. **Preserve public/internal behavior** — API contracts, save response keys, CDT display rules, and deep links (`?quoteId=`) must remain identical.

---

## Do not touch during stabilization

Aligned with [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md):

| Area | Reason |
|------|--------|
| **Internal Estimate core save/calculate flow** | `buildCalcPayload`, `buildSubmitPayload`, `handleSubmit`, hydration |
| **Quote math semantics** | `quoteCalculator.js`, wholesale/direct, guided measurement |
| **Auth / permissions / head access** | `requireAuth`, `requireRole`, `requireHeadAccess`, System Admin gating |
| **Partner Quote external security** | Leakage script must pass before widen |
| **Sales KPI backend math** | `salesKpiV1Handler`, CDT fallback, revision filters |
| **Supabase schema / RLS** | Manual apply only; no migration drive-by |
| **Broad UI redesigns** | Quote Library drawer refactor, workflow redesign |
| **Monolith “shrink to 400 lines” goals** | Unsafe; strangler-fig only |

---

## Stabilization deferral note

The stabilization plan explicitly defers **large refactors** of Internal Estimate and System Admin monoliths. This inventory is **approved planning**; execution of Pass 1+ should wait until stabilization **exit criteria** are met (or a single Pass 1 is explicitly scheduled with QA sign-off).

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-27 | Initial inventory for four monoliths + verify scripts + first 3 passes |
