# eliteOS Head Architecture Map

**Date:** 2026-05-27  
**Phase:** Stabilization / refinement (analysis only)  
**Related:** [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md) · [MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md](./MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md) · [STABILIZATION_QA_LOG_2026-05-27.md](./STABILIZATION_QA_LOG_2026-05-27.md) · [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md) · [SHARED_UI_ARCHITECTURE.md](./SHARED_UI_ARCHITECTURE.md)

---

## Architectural principles (eliteOS)

| Layer | Role |
|-------|------|
| **Heads** | Product experiences (launcher, estimate, library, admin, sales, pricing). UI orchestration and display. |
| **Brain (`backend-core`)** | Authority: auth, head access, quote math, persistence, integrations, KPI aggregates. |
| **Supabase** | Durable memory: profiles, quotes, pricing tables, sync runs, preferences. |
| **System Admin** | Governs users, org assignment, head access, dealer/pricing access — not day-to-day quoting. |
| **Home / Profile & Preferences** | User-owned display preferences and identity surface; not permission source of truth. |

**Header/shell rule:** Workspace name, user chip, and menu links should **look and behave consistently** across protected heads, but **permission truth stays on the Brain**. Do not build a large shared component library until small extractions prove stable ([MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md](./MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md)).

### Shared UI architecture (Phase 0)

Component inventory, head ownership boundaries, admin-configurable settings map, Account Directory future model, go-live guardrails, and phased roadmap live in **[SHARED_UI_ARCHITECTURE.md](./SHARED_UI_ARCHITECTURE.md)**. Contribution rules: **[SHARED_UI_CONTRIBUTING.md](./SHARED_UI_CONTRIBUTING.md)**.

Phase 0 is **docs only** — no shared CSS imports into production heads and no Internal Estimate / Quote Library refactors before Elite 100 go-live.

---

## Brain route map (summary)

Mounted from `backend-core/src/server.js` and `attachQuoteRoutes`:

| Area | Module | Head slug / gate |
|------|--------|------------------|
| Identity | `auth/authMiddleware.js`, `auth/headAccessMiddleware.js` | `requireAuth()` on protected routes |
| Launcher | `GET /api/me`, `GET /api/me/heads`, `GET/PATCH /api/me/preferences` | Auth only (no head slug) |
| System Admin | `admin/systemAdminUserManagement.js` → `/api/system-admin/*`, `/api/admin/*` | `system_admin` + `admin` \| `super_admin` |
| Internal Estimate | `quotes/internalQuotesApi.js` | `quote` + `rejectPartnerOnlyUser` |
| Quote Library | `quotes/quoteLibraryApi.js` | `quote_library` + `rejectPartnerOnlyUser` |
| Pricing Admin | `quotes/pricingAdminHeadApi.js`, `quotes/partnerSetupAdminApi.js` | `pricing_admin` + role `admin` \| `finance` \| `executive` |
| Sales | `sales/salesHead.js`, `quotes/quotePipelineApi.js` | `sales` + `SALES_API_ROLES` |
| Moraware status | `moraware/morawareSyncApi.js` `GET /api/moraware-sync/status` | `system_admin` **or** `brain_health` |
| Moraware admin CRUD | `admin/morawareAdmin.js` `/api/admin/moraware/*` | Admin routes (separate stack) |
| Sales mapping | `admin/salesAccountMappingAdmin.js` | Admin + `system_admin` head |
| Public quote | `quotes/quoteRoutes.js` `POST /api/public-quote/calculate` | Unauthenticated calculate (sanitized response) |

**Admin bypass:** `requireHeadAccess` allows `admin` / `super_admin` through any known head slug for recovery ([headAccessMiddleware.js](../backend-core/src/auth/headAccessMiddleware.js)).

---

## 1. Home Launcher (`app-home`)

**Main file:** `app-home/src/ui/App.tsx` (~1,437 lines) · `ProfileView.tsx`

### 1. Purpose

- **eliteOS entry point:** Supabase sign-in, password/invite flows, head launcher grid.
- **Authoritative profile surface:** Profile & Preferences view (identity read-only, prefs read/write).
- **Workspace hero:** Organization name, job title, role metadata, access summary for the signed-in user.
- **Head discovery:** Calls `/api/me/heads` to show assigned vs roadmap tools with correct launch URLs.

### 2. What it should NOT own

- Head-specific business logic (quoting, library workflow, sales KPI math).
- Permission grants (only displays what Brain returns; does not assign head access).
- Pricing table edits or Moraware sync execution.
- Quote calculation or `calculation_snapshot` semantics.

### 3. Frontend responsibilities

| Area | Location |
|------|----------|
| Auth shell (sign-in, invite password gate) | `App.tsx` |
| Launcher grid (available / coming soon) | `App.tsx` |
| Topbar + user menu | `App.tsx` |
| Profile & Preferences | `ProfileView.tsx` |
| Preferences persistence (API + localStorage fallback) | `App.tsx` + `ProfileView.tsx` |
| Hero workspace / access details | `App.tsx` |

### 4. Backend/API dependencies

| Route | Use |
|-------|-----|
| `GET /api/me` | User identity, org name/slug, `job_title`, role |
| `GET /api/me/heads` | Launcher cards, enabled slugs, URLs |
| `GET /api/me/preferences` | Profile prefs (graceful if table missing) |
| `PATCH /api/me/preferences` | Save prefs (whitelisted keys only) |
| `POST /api/auth/log-login` | Login audit (via session bootstrap) |
| `POST /api/auth/log-event` | Sign-out / events |
| Supabase Auth | Session, password update |

No head-scoped quote or admin APIs from Home.

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | **None required** for `/api/me*` — any active authenticated user |
| Role | Display only; launcher may show roadmap heads user cannot open |
| Backend enforcement | Every launched head re-validates on its own APIs |
| Frontend | Must **not** hide security-sensitive actions based only on UI; launcher disables or labels tools per `/api/me/heads` |
| Preferences API | PATCH limited to UI prefs; cannot change role/org/head access ([server.js](../backend-core/src/server.js) ~1042–1062) |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | `eliteOS` wordmark + **workspace name** from `/api/me` + `/api/me/heads` (`organization_name`) |
| User chip | Name, subtitle = **job_title → department → role** |
| User menu | Profile (in-app `?view=profile`), Sign out |
| Open Home | N/A (already home) |
| Profile link | In-app navigation to `ProfileView` |
| Workspace/org | Hero panel + access details (`organization_id`, slug); org name on workspace card |
| Job title / role | Hero stat uses job title with label **"Your role"**; chip uses job title first |

**Note:** Home is the **richest** identity source (`/api/me` + heads). Other heads often use session-only chips.

### 7. Duplicated patterns

- Workspace resolvers duplicated in other heads (defaults vs `/api/me`).
- User menu outside-click / Escape handler (copy-pasted).
- `deriveDisplayNameFromEmail` / initials helpers duplicated.
- Preferences localStorage fallback unique to Home.

### 8. Recommended future extraction

| Item | When |
|------|------|
| `ProfileView.tsx` | **Safe now** — already separate file |
| Preferences helpers (`readLocalPrefs`, defaults) | **Later** — small `lib/preferences.ts` in app-home only |
| Launcher card grouping/sort | **Later** |
| Shared `WorkspaceIdentity` across heads | **Do not extract yet** — Home must stay source of truth for org-enriched `/api/me` |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | Medium (`App.tsx` ~1.4k lines) |
| Security | Low if prefs PATCH stays whitelisted |
| Data-truth | Medium — launcher must not imply access user lacks |
| UI consistency | Reference implementation for other heads |
| Backend dependency | `/api/me/heads` must stay stable for launch URLs |

### 10. Next best stabilization action

Complete QA log items: sign-in, launcher launch per assigned head, **Profile save round-trip**, job title visible on hero after System Admin edit.

---

## 2. System Admin (`app-system-admin`)

**Main file:** `app-system-admin/src/ui/App.tsx` (~3,141 lines)  
**Satellite UI:** `MorawareAdmin.tsx`, `SalesAccountMappingAdmin.tsx`, `IdentityResolutionReadiness.tsx`, `QuotePipelinePanel.tsx`, `QuotePricingAdminView.tsx`, diagnostics panels

### 1. Purpose

- **Govern access:** Users, organizations (reference), invites, head access, dealer access, pricing group assignment.
- **Operational diagnostics:** Schema health, quote pipeline overview, Moraware sync status card, legacy pricing views.
- **Sales governance:** Sales account mapping admin, identity resolution readiness.
- **Moraware ops surface:** Embedded Moraware admin tabs (via `MorawareAdmin.tsx`).

### 2. What it should NOT own

- Quote math or Internal Estimate save/calculate flows.
- Authoritative pricing numbers for live quotes (reads diagnostics; Pricing Admin owns tables).
- Moraware **sync execution** in the browser (Brain/sync jobs only).
- End-user Profile & Preferences editing for self (links to Home for that).

### 3. Frontend responsibilities

| Area | Component |
|------|-----------|
| People & access (roster, drawer, filters) | `App.tsx` |
| User snapshot / lifecycle | `UserSnapshot`, `UserLifecycleActions` |
| Profile / head / dealer / pricing forms | `ProfileForm`, `HeadSelector`, `DealerForm`, `PricingForm` |
| Organizations, invite, audit | `App.tsx` nav views |
| Moraware sync status (read-only card) | `MorawareSyncStatusCard` |
| Moraware deep admin | `MorawareAdmin.tsx` |
| Sales mapping | `SalesAccountMappingAdmin.tsx` |

### 4. Backend/API dependencies

**Prefix:** `/api/system-admin` (alias `/api/admin` for same router)

| Route | Use |
|-------|-----|
| `GET /api/me` | Operator identity, role gate in UI |
| `GET /api/system-admin/reference` | Orgs, departments, head catalog |
| `GET /api/system-admin/users` | Roster |
| `GET /api/system-admin/users/:id` | Detail drawer |
| `POST/PATCH /api/system-admin/users/*` | Profile, role, head/dealer/pricing, invite, lifecycle |
| `GET /api/system-admin/audit-events` | Audit viewer |
| `GET /api/moraware-sync/status` | Moraware card |
| `GET /api/admin/moraware/*` | MorawareAdmin tabs |
| `GET/POST /api/admin/sales-account-mapping/*` | Sales mapping |
| `GET /api/admin/identity-resolution/*` | Identity resolution |
| `POST /api/auth/log-event` | Sign-out audit |

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | `requireHeadAccess("system_admin")` on all system-admin routes |
| Role | `requireRole(["admin", "super_admin"])` on router |
| Frontend | `privilegedApplicationRole()` hides nav for non-admins — **must match backend** |
| Display only | Setup status pills, invite state — not authorization |
| Secrets | Never expose passwords; invite/reset via Brain only |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | Protected-head pattern: brand + **System Admin · {workspace}** |
| User chip | From `/api/me` (full name, email, role in subtitle) |
| User menu | Open Home, **Profile & preferences** → `{home}?view=profile`, Sign out |
| Workspace | Defaults + env (`resolveWorkspaceName`) — can use org from `/api/me` when loaded |
| Job title | Shown in **user drawer** via profile fields, not primary chip subtitle |
| Access details | User drawer / `UserSnapshot` shows org name, role, head list |

### 7. Duplicated patterns

- Full protected-head topbar + menu (near-copy of Quote Library / Internal Estimate).
- `fmt*` date/number helpers (candidate for local `adminFormat.ts`).
- Moraware status types overlap `MorawareAdmin` health responses.

### 8. Recommended future extraction

| Item | When |
|------|------|
| `adminFormat.ts`, `MorawareSyncStatusCard` | **Safe now** (see monolith inventory Pass 2) |
| `UserSnapshot` → `components/` | **Later** |
| `ProfileForm` etc. | **Later** |
| Shared shell package | **Do not extract yet** |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | **High** (`App.tsx` ~3.1k lines) |
| Security | **High** — cross-user mutations |
| Data-truth | High — org/head assignment must match DB |
| UI consistency | Good reference for admin-adjacent patterns |
| Backend dependency | Many routes; schema-health probes |

### 10. Next best stabilization action

Smoke **org dropdown + job title save/reload** on a non-admin test user; verify `GET /users` returns `job_title` after PATCH.

---

## 3. Internal Estimate (`app-internal-estimate`)

**Main file:** `InternalEstimateApp.tsx` (~3,970 lines)  
**Extracted:** `CustomerEstimatePrint.tsx`, `VisualLayoutCanvas.tsx`, `InternalGuidedShapePreview.tsx`

### 1. Purpose

- **Authoring surface** for `internal_quote`: rooms, guided measurement, addons, custom lines, calculate, save, revisions.
- **Customer-facing total (CDT)** aligned with print/PDF and persisted on save for Quote Library / Sales KPI.
- **Deep link** hydration via `?quoteId=`.
- **Non-authoritative** visual layout canvas (no pricing effect).

### 2. What it should NOT own

- Canonical quote math (Brain `quoteCalculator.js`).
- Permission to open Quote Library or System Admin (menu links only).
- Moraware/QB handoff document generation (Quote Library).
- Pricing Admin rate tables.
- `organization_id` enforcement logic (Brain on save).

### 3. Frontend responsibilities

| Area | Notes |
|------|--------|
| Workflow sections (Job → Rooms → Visual → Add-ons → Review → Output → Save) | Main JSX |
| Room drafts + guided shapes | State + `@quote-lib` serialization |
| Calculate / save / revision UX | `handleCalculate`, `handleSubmit`, modals |
| Sticky sidebar / comparisons | Memos (`customerDisplayTotal`, etc.) |
| Print | `CustomerEstimatePrint` |
| Auth gate | Supabase session |

### 4. Backend/API dependencies

| Route | Use |
|-------|-----|
| `POST /api/internal-quotes/calculate` | Live totals |
| `POST /api/internal-quotes/save` | Persist quote + snapshot |
| `GET /api/internal-quotes/:id` | Hydration |
| `GET /api/internal-quotes/:id/revisions` | Family revision UI |
| `POST /api/internal-quotes/:id/restore-as-revision` | Restore flow |
| `GET /api/internal-quotes/material-colors` | Elite program colors |
| Supabase Auth | Session only (no `/api/me` in this head today) |

**Head slug on API:** `quote` ([internalQuotesApi.js](../backend-core/src/quotes/internalQuotesApi.js)).

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | `requireHeadAccess("quote")` |
| Partner-only users | `rejectPartnerOnlyUser` on stack |
| Frontend | Preview mode when unsigned; no role chip (session email/name only) |
| CDT / totals | Brain calculates; UI displays — must not invent parallel math |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | Internal Estimate · workspace (env defaults) |
| User chip | **Session only** — no `/api/me`; email/name from Supabase metadata |
| User menu | Open Home, Open Quote Library (new tab), Start new quote, **Profile** → `{home}?view=profile`, Sign out |
| Workspace | `DEFAULT_WORKSPACE_*` constants + `VITE_*` env |
| Job title / role | **Not shown** (no `/api/me`) |
| Access details | None in shell |

**Gap vs Home/Sales:** Org name and job title not on chip until optional `/api/me` pass.

### 7. Duplicated patterns

- Workspace + user menu block (~duplicate of Quote Library).
- `homeLauncherUrl`, initials helpers.
- Local prototype run path vs Brain calculate (dev/preview).

### 8. Recommended future extraction

| Item | When |
|------|------|
| Workspace shell helpers | **Safe now** (local `lib/workspaceShell.ts` only) |
| Revision pure helpers | **Later** + `verifyInternalQuoteRevisions.mjs` |
| Room editor JSX | **Do not extract yet** |
| Save/calculate hooks | **Do not extract yet** |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | **Highest** (~4k lines) |
| Security | Medium (save payload tampering mitigated by Brain) |
| Data-truth | **Highest** (CDT, snapshot, revisions) |
| UI consistency | Shell without job title |
| Backend dependency | Save contract + calculator |

### 10. Next best stabilization action

Run `verifyInternalEstimateMath.mjs` + `verifyInternalQuoteSaveResponseContract.mjs`; smoke calculate → save → library CDT match (QA log).

---

## 4. Quote Library (`app-quote-library`)

**Main file:** `QuoteLibraryApp.tsx` (~1,939 lines)  
**Lib:** `lib/api.ts`, `lib/format.ts`, `lib/labels.ts`

### 1. Purpose

- **Operational hub** for saved quotes: search, tabs, metrics, batch archive.
- **Detail drawer:** status, sold, duplicate, revisions, handoff docs (Moraware/QB).
- **Display policy:** `pickDisplayTotal` — CDT preferred, `grand_total` fallback.

### 2. What it should NOT own

- Quote recalculation or editing room-level math (opens Internal Estimate for that).
- Handoff **execution** in Moraware/QB (generates doc records via API only).
- Sales KPI aggregation (Sales head / `salesHead.js`).
- Permission grants.

### 3. Frontend responsibilities

| Area | Notes |
|------|--------|
| Tabs / filters / metrics | List chrome |
| Table + batch actions | Archive selection |
| Detail drawer | Status, timeline, handoff, revision list |
| `HandoffDocBlock` | Presentational |
| Topbar / user menu | Protected-head shell |

### 4. Backend/API dependencies

| Route | Use |
|-------|-----|
| `GET /api/quote-library/quotes` | List |
| `GET /api/quote-library/metrics` | Banner counts |
| `GET /api/quote-library/accounts` | Account tab |
| `GET /api/quote-library/quotes/:id` | Drawer |
| `GET /api/quote-library/quotes/:id/revisions` | Revision panel |
| `PATCH .../status`, `POST .../mark-sold`, `POST .../archive`, `POST .../duplicate` | Workflow |
| `POST .../restore-as-revision` | Revision restore |
| `POST .../generate-moraware-entry-doc`, `.../quickbooks-entry-doc` | Handoff |
| `POST /api/quote-library/quotes/batch/archive` | Batch |
| Supabase Auth | Session (no `/api/me`) |

**Head slug:** `quote_library`.

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | `requireHeadAccess("quote_library")` |
| Partner-only users | Rejected on stack |
| Frontend | Row actions should respect backend errors (403/409) |
| CDT display | Display only; does not recompute totals |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | Quote Library · workspace (defaults) |
| User chip | Session email/name only |
| User menu | Open Home, Profile → `{home}?view=profile`, Sign out |
| Workspace | Env defaults |
| Job title / role | Not on chip |

### 7. Duplicated patterns

- `pickDisplayTotal` duplicates `salesHead.js` `pickKpiCdtValue` (drift risk).
- Pills: `statusPillClass`, `handoffPillClass` — extractable.
- `lib/format.ts` already shared **within** head only.

### 8. Recommended future extraction

| Item | When |
|------|------|
| `lib/quoteDisplay.ts` + `HandoffDocBlock` | **Safe now** (monolith inventory Pass 1) |
| Drawer layout split | **Later** |
| `pickDisplayTotal` shared module | **Later** + verify script |
| Drawer action handlers | **Do not extract yet** |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | Medium–high (~1.9k lines) |
| Security | Medium (status/archive mutations) |
| Data-truth | **High** (CDT column vs stored snapshot) |
| UI consistency | Shell parity |
| Backend dependency | Handoff + revision endpoints |

### 10. Next best stabilization action

Verify drawer **CDT** matches Internal Estimate save for a fresh quote; test batch archive on non-current revision rules.

---

## 5. Pricing Admin (`app-pricing-admin`)

**Main file:** `PricingAdminApp.tsx` (~900 lines) · `PartnerSetupTab.tsx`

### 1. Purpose

- **Pricing authority UI** for foundation tables: price groups, rates, addons, rules, audit log.
- **Partner setup** (orgs, partners, branding, assignments, user access) in tab.
- **Config preview** and install status for SQL foundation.

### 2. What it should NOT own

- Live quote line-item calculation during estimate (Brain resolver at calculate time).
- User/head access management (System Admin).
- Moraware sync.
- Public consumer UX (Public Quote head).

### 3. Frontend responsibilities

| Tab | Content |
|-----|---------|
| dashboard | Status, preview notes |
| groups / addons / rules | CRUD tables + modals |
| audit | Read log |
| partner_setup | `PartnerSetupTab.tsx` |
| planned | Placeholder |

### 4. Backend/API dependencies

| Route | Use |
|-------|-----|
| `GET /api/pricing-admin/status` | Foundation installed |
| `GET/PATCH /api/pricing-admin/price-groups`, `rates`, `addons`, `rules` | CRUD |
| `GET /api/pricing-admin/config-preview`, `audit-log` | Read |
| `GET/POST/PATCH /api/pricing-admin/partner-setup/*` | Partner tab |
| Supabase Auth | Session only |

**Gate:** `requireRole(["admin","finance","executive"])` + `requireHeadAccess("pricing_admin")`.

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | `pricing_admin` |
| Role | Finance/executive/admin on API |
| Frontend | No `/api/me` — must not show System Admin link |
| Audit | Brain writes `quote_pricing_audit_log` + `logAction` |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | Pricing Admin · Elite Stone Fabrication (hardcoded defaults) |
| User chip | Session only |
| User menu | Open Home, **Reload data** (unique), Profile → home, Sign out |
| Workspace | Static defaults (no org from API yet) |
| Job title / role | Not shown |

### 7. Duplicated patterns

- Same workspace/menu copy as other heads.
- `@quote-lib/api` for HTTP (shared package, not head shell).

### 8. Recommended future extraction

| Item | When |
|------|------|
| `workspaceShell.ts` local | **Safe now** |
| `PartnerSetupTab.tsx` | Already separate |
| Rate/rule editor components | **Later** |
| Optional `/api/me` for org logo | **Later** product pass |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | Medium (~900 lines main + partner tab) |
| Security | **High** (pricing tables affect all quotes) |
| Data-truth | **High** |
| UI consistency | Static workspace until `/api/me` |
| Backend dependency | Foundation SQL applied |

### 10. Next best stabilization action

Confirm `GET /api/pricing-admin/status` `installed: true` in target Supabase; smoke one rate PATCH + audit row.

---

## 6. Sales Dashboard (`app-sales`)

**Main file:** `app-sales/src/ui/App.tsx` (~767 lines)  
**Views:** `SalesCommandCenterView.tsx`, `KpiV1Panel.tsx`, `KpiHistoryScaffold.tsx`, `QuotePipelinePanel.tsx`, `SalesIntelligenceView.tsx`

### 1. Purpose

- **Sales intelligence:** Command center (dashboard foundation), KPI v1, quote pipeline tab, legacy performance views.
- **Filters** shared across views (salesperson, account, job attributes).
- **Read-heavy** with limited pipeline mutations (status, assign).

### 2. What it should NOT own

- Moraware sync or fact rebuild triggers from UI (ops/admin; POST rebuild exists but guarded).
- Quote authoring (Internal Estimate).
- Sales account mapping approval (System Admin).
- KPI math in frontend (`KpiV1Panel` displays API response only).

### 3. Frontend responsibilities

| Tab | Component |
|-----|-----------|
| command_center | `SalesCommandCenterView` + `KpiV1Panel` |
| quote_pipeline | `QuotePipelinePanel` (shared pattern with System Admin diagnostics) |
| kpi_history | `KpiHistoryScaffold` (planning scaffold) |
| intelligence | `SalesIntelligenceView` (legacy) |
| Shell | Filters, topbar, auth |

### 4. Backend/API dependencies

| Route | Use |
|-------|-----|
| `GET /api/me` | User chip (role shown) |
| `GET /api/sales/filters` | Filter metadata |
| `GET /api/sales/dashboard-foundation` | Command center |
| `GET /api/sales/kpi-v1` | KPI panel |
| `GET /api/sales/performance-intelligence` | Legacy tab |
| `GET /api/sales/jobs` | Job drill-down |
| `GET /api/quotes/pipeline/*` | Quote pipeline tab |
| `PATCH /api/quotes/pipeline/:id/status`, `assign` | Pipeline actions |

**Gate:** `requireHeadAccess("sales")` + `SALES_API_ROLES` (admin bypass on head access).

### 5. Auth/security expectations

| Expectation | Detail |
|-------------|--------|
| Head access | `sales` |
| Roles | admin, executive, sales, finance, marketing |
| Frontend | `accessForbidden` UI if `/api/me` or filters fail — backend still authoritative |
| Attribution | Branch/rep splits gated in API trust labels — UI must not invent attribution |

### 6. Shared shell/header behavior

| Element | Behavior |
|---------|----------|
| Topbar | `eos-*` CSS classes; Sales Dashboard · workspace |
| User chip | **`/api/me`** — shows **role** in subtitle (`role · {role}`) |
| User menu | Open Home, Profile → `{home}?view=profile`, Sign out |
| Workspace | Defaults; logo from constants |
| Job title | Not on chip (role shown instead) |
| Access details | Forbidden state panel when head/role fails |

**Best shell parity with Home** for `/api/me` usage among work heads.

### 7. Duplicated patterns

- User menu nearly identical to Quote Library (different CSS prefix `eos-`).
- `QuotePipelinePanel` duplicated conceptually with System Admin diagnostics panel.
- Filter state in `App.tsx` passed to children.

### 8. Recommended future extraction

| Item | When |
|------|------|
| `workspaceShell` / menu (sales-local) | **Safe now** |
| `KpiV1Panel` | Already separate |
| Shared `QuotePipelinePanel` with System Admin | **Do not extract yet** (divergent contexts) |
| `salesHead.js` date utils | **Later** + `verifySalesKpiV1.mjs` |

### 9. Risks

| Risk | Level |
|------|-------|
| Monolith | Medium (split across views; `salesHead.js` ~3.1k backend) |
| Security | Medium (read-mostly; pipeline PATCH) |
| Data-truth | **High** (KPI CDT, Moraware facts freshness) |
| UI consistency | Good `/api/me` chip; job title gap |
| Backend dependency | Stale server 404 on new routes; restart Brain |

### 10. Next best stabilization action

Post-deploy: confirm `GET /api/sales/kpi-v1` and `dashboard-foundation` not 404; run `verifySalesKpiV1.mjs`.

---

## Cross-head analysis

### A. Shared shell candidate map (future, not now)

| Candidate | Responsibility | Notes |
|-----------|----------------|-------|
| **ProtectedHeadShell** | Topbar layout, brand row, head subtitle | CSS class names differ (`eos-` vs default) — unify gradually |
| **UserMenu** | Open/close, outside click, Escape, menu items | Items vary (Pricing Admin has Reload) |
| **WorkspaceIdentity** | Name, logo, initials, short id | Home uses `/api/me`; others use defaults |
| **ProfileLink** | `{homeUrl}?view=profile` | Consistent href already |
| **SignOutButton** | Supabase signOut + optional audit | Home logs event; others vary |
| **AccessDetails** | Org id/slug, role, heads list | **Home-only** today — do not force on all heads yet |
| **useCurrentUserProfile** | Wrap `GET /api/me` | Optional adoption per head |
| **useHeadAccessSummary** | Wrap `/api/me/heads` or 403 probe | Launcher + forbidden states |
| **formatRoleLabel** | Display role string | Sales shows raw role; Home uses job title |
| **formatOrgDisplay** | Org name vs id | Home + System Admin drawer |

### B. What should NOT be shared yet

| Domain | Reason |
|--------|--------|
| Internal Estimate room/save UI | Highest coupling and math risk |
| Quote Library drawer workflow + actions | Status/handoff side effects |
| System Admin user mutation forms | Security and audit sensitivity |
| Sales KPI / Moraware metric rendering | Trust labels and freshness semantics |
| Pricing Admin rule/rate editors | Foundation schema coupling |
| Partner/public quote flows | Security boundary (out of scope heads) |
| `QuotePipelinePanel` System Admin vs Sales | Different filters and permissions |
| Global `@quote-lib` shell package touching all heads at once | Violates one-head-per-commit extraction |

### C. Recommended extraction order (exactly 5 passes)

| # | Pass | Files likely touched | Risk | Tests/checks | Why it helps | Why it is safe |
|---|------|-------------------|------|--------------|--------------|----------------|
| **1** | Quote Library display helpers + `HandoffDocBlock` | `QuoteLibraryApp.tsx` → `lib/quoteDisplay.ts`, `components/HandoffDocBlock.tsx` | Low | Build quote-library; smoke list + drawer pills | Cuts ~150 lines; no API | Pure presentation |
| **2** | System Admin formatters + Moraware status card | `App.tsx` → `adminFormat.ts`, `components/MorawareSyncStatusCard.tsx` | Low | Build system-admin; diagnostics Moraware card | Easier admin reviews | Read-only card |
| **3** | Per-head `workspaceShell.ts` (copy, not shared package) | Each app's `lib/workspaceShell.ts` + import in main App | Low | Smoke topbar on 3–4 heads | Documents single place per head for shell constants | No behavior change |
| **4** | `pickDisplayTotal` / `pickKpiCdtValue` → `backend-core` or `@quote-lib` + verify script | `quoteLibraryApp`, `salesHead.js`, new `displayTotal.js`, `verifyQuoteDisplayTotal.mjs` | Medium | `verifySalesKpiV1.mjs` + library CDT smoke | Stops KPI/library drift | Logic already specified in FEATURE_DECISIONS / KPI trust notes |
| **5** | System Admin `UserSnapshot` → `components/UserSnapshot.tsx` | `App.tsx`, new component file | Medium | System Admin people drawer smoke | Shrinks monolith | Read-only display block |

**Not in first five:** Internal Estimate save/calculate, Sales handler splits, shared npm shell library.

### D. Architecture rules going forward

1. **No backend authority in frontend** — permissions, totals, and workflow transitions must succeed or fail on Brain.
2. **No service role keys in browser** — Supabase anon + user JWT only in heads.
3. **No quote math changes** without `verifyInternalEstimateMath.mjs` / guided measurement / revision scripts as applicable.
4. **No permission changes** without backend route tests and System Admin smoke.
5. **No shared component extraction that touches every head at once** — one head or one helper domain per PR.
6. **One extraction per commit** — behavior-preserving moves only.
7. **Smoke the affected head** after each extraction (STABILIZATION_QA_LOG checklist).
8. **Profile & Preferences stays on Home** — other heads link out; do not duplicate prefs editors.
9. **System Admin governs access** — heads display assignments, never grant them locally.
10. **CDT consistency** — Internal Estimate save → Quote Library column → Sales KPI must share one semantic (documented in FEATURE_DECISIONS / KPI v1).

---

## Head comparison matrix (shell & API)

| Head | `/api/me` | Head slug | User chip source | Profile link | Job title on chip | Main monolith risk |
|------|-----------|-----------|------------------|--------------|-------------------|-------------------|
| Home | Yes | — | `/api/me` | In-app | Yes (preferred) | Medium |
| System Admin | Yes | `system_admin` | `/api/me` | Home `?view=profile` | Drawer, not chip | **High** |
| Internal Estimate | No | `quote` | Session | Home `?view=profile` | No | **Highest** |
| Quote Library | No | `quote_library` | Session | Home `?view=profile` | No | High |
| Pricing Admin | No | `pricing_admin` | Session | Home `?view=profile` | No | Medium |
| Sales | Yes | `sales` | `/api/me` (role) | Home `?view=profile` | No (role shown) | Medium (UI) / High (backend KPI) |

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-27 | Initial head-by-head map for six stabilization heads |
| 2026-06-29 | Added Shared UI architecture pointer (Phase 0 docs) |
