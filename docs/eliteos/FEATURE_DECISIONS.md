# eliteOS Feature Decision Log

**Purpose:** Short, dated decisions so **non-technical stakeholders** and **future engineers** understand **why** the system behaves a certain way without reading the entire git history.

**How to add a row:** Append a new `### N. Title` block with Date, Decision, Why, Impacted files/docs, Revisit trigger.

### 1. Public Quote Tool pricing base

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | Public consumer material pricing uses **ESF Direct $/sqft** plus **25% public planning markup** (not legacy prototype partner $/sqft as the public base). |
| **Why** | Align public “planning” numbers with internal Direct economics + a single clear markup layer; avoids mislabeling prototype partner tiers as retail. |
| **Impacted files/docs** | `backend-core/src/quotes/quoteCalculator.js` (`ESF_DIRECT_PRICE_PER_SQFT`, `computePublicConsumerEstimatesByGroup`), `app-quote/src/lib/prototypeQuoteMath.ts` (`ESF_DIRECT_TIER_RATES`), `app-quote/src/lib/publicConsumerParity.ts`, `docs/quote-platform/pricing-seed-map.md`, `docs/quote-platform/quote-math-test-cases.md`, this blueprint §8. |
| **Revisit trigger** | Finance changes Direct sheet; new markup % policy; or public structure moves to per-org rules without code change path. |

---

### 2. Public display rounding

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | Public-facing **tier totals** (and related display fields) round **up** to the nearest **$10**; **no cents** in homeowner-facing totals. Exact values may remain in API for audit. |
| **Why** | Cleaner homeowner UX; avoids false precision; Monday and pipeline can align on the same rounded headline for Promo. |
| **Impacted files/docs** | `backend-core/src/quotes/quoteCalculator.js` (`roundPublicEstimateToNearestTen`, `enrichPublicConsumerEstimatesForDisplay`), `app-quote/src/lib/publicEstimateDisplay.ts`, `app-quote/src/ui/PublicQuoteWizard.tsx`, `docs/eliteos/SYSTEM_BLUEPRINT.md` §8. |
| **Revisit trigger** | Product asks for different rounding (e.g. nearest $50) or to show cents for legal/compliance. |

---

### 3. Monday Quote Amount source

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Monday Quote Amount** (and `quote_headers.grand_total` for public consumer) uses **Group Promo only**, using the **rounded public** Promo total — **not** max tier, not average across tiers. |
| **Why** | Single headline number for CRM and pipeline; Promo is the “starting at” tier; avoids double-counting multi-tier comparison. |
| **Impacted files/docs** | `backend-core/src/quotes/quoteRoutes.js` (`persistQuoteSubmission`, `buildPublicConsumerSnapshot`), `backend-core/src/integrations/mondayQuoteSync.js` (payload `quote_total`), this blueprint §8–9. |
| **Revisit trigger** | Sales asks for “selected tier” after customer picks a material; or CRM requires max-tier column separately. |

---

### 4. Public calculate legacy payload

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | Public **`estimates_by_group`** always comes from a **legacy aggregate payload** (`countertopSqft`, `backsplashSqft`, `addOns`, `engine: "legacy"`) even when the UI used guided layout or cabinet length — the **client collapses** measurements to those fields before API calls. |
| **Why** | Backend calculator supports room engine separately; public tier matrix API is stable on legacy aggregates. |
| **Impacted files/docs** | `app-quote/src/ui/PublicQuoteWizard.tsx` (`buildCalcPayload`), `backend-core/src/quotes/quoteRoutes.js`, `docs/eliteos/SYSTEM_BLUEPRINT.md` §7, `.cursor/rules/quote-platform.mdc`. |
| **Revisit trigger** | Backend adds first-class `estimates_by_group` for room engine with same response contract. |

---

### 5. Monday sync non-blocking

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | Monday sync **must not** fail the public HTTP submit; persistence succeeds first; Monday is best-effort with partial diagnostics. |
| **Why** | Never lose a lead because of CRM latency or column misconfiguration. |
| **Impacted files/docs** | `backend-core/src/integrations/mondayQuoteSync.js`, `backend-core/src/quotes/quoteRoutes.js`, `docs/quote-platform/monday-public-quotes-setup.md`. |
| **Revisit trigger** | Product requires hard failure when Monday is down (unlikely). |

---

### 6. Moraware Admin prerequisite for SaaS Moraware

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Moraware Admin / Integration Mapping Head** is **required** before Moraware-driven features are treated as **multi-tenant reusable** (mappings org-scoped). |
| **Why** | Raw Moraware IDs differ per shop; without admin mapping, code would hardcode Elite-only assumptions. |
| **Impacted files/docs** | `docs/eliteos/eliteOS-master-head-map.md`, this blueprint §10, future `docs/eliteos/` Moraware pages when created. |
| **Revisit trigger** | First external fabricator needs Moraware sync. |

---

### 7. User-facing product name

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **User-facing product name** is **eliteOS** (not “eOS”) in new copy, public sites, and customer-facing docs. Technical `eos` / `eOS` may remain in repo identifiers until a deliberate rename project. |
| **Why** | Brand clarity for homeowners and fabricators; reduce confusion with generic “EOS” acronyms. |
| **Impacted files/docs** | New/edited marketing and wizard copy; `docs/eliteos/*`; `.cursor/rules/eliteos-architecture.mdc`; root `README.md` may still mention eOS historically — update opportunistically. |
| **Revisit trigger** | Full rebrand ticket closes legacy naming. |

---

### 8. Internal Quote Tool v1 testing phase defaults and workflow

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Internal quotes** (`quote_source: internal_quote`) are **saved in the shared quote database** via authenticated **`/api/internal-quotes/*`** routes, **scoped by organization** where `quote_headers.organization_id` exists, and may **sync to a separate Monday board** using **`MONDAY_INTERNAL_QUOTES_BOARD_ID`** and **`MONDAY_INTERNAL_COL_*`** env vars. Internal material pricing supports **Direct vs Wholesale** basis using **fixed group $/sf tables only** (wholesale mirror vs ESF Direct): **no** public 25% homeowner markup, **no** partner retail markup percent, and **no** reliance on client-supplied `retailMarkupPercent` / `retailMethod` (calculator normalizes internal payloads to **0% / Pass Through** and applies **no** extra markup layer). The Internal Estimate UI shows **live preview totals** while typing; **Calculate** refreshes backend line items. Estimators choose **`customer_estimate_display_groups`** for which tier comparison rows appear on the **customer-facing print block** (internal worksheet still shows all tiers). **Public** consumer calculate/submit and **public Monday** behavior remain unchanged. |
| **Why** | Staff need a shared quote library, traceable saves, and CRM routing distinct from public retail leads; math guardrails keep public and internal economics separated. |
| **Impacted files/docs** | `backend-core/src/quotes/internalQuotesApi.js`, `backend-core/src/quotes/quotePersist.js`, `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/integrations/mondayQuoteSync.js`, `app-internal-estimate/`, `docs/quote-platform/internal-quote-test-plan.md`, `docs/quote-platform/monday-internal-quotes-setup.md`. |
| **Revisit trigger** | Quote statuses finalized; Moraware writeback; partner portal quote DB; RLS tightening; reps/branches move to admin tables. |

---

### Supplement — Internal mixed-material parity (live summary ↔ print ↔ Calculate)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-15 |
| **Decision** | **Scoped stone material dollars** for internal estimates use **`buildSelectedMaterialBreakdown` logic** (frontend **`measureRoomDraft`** priced portion). **Sticky estimator summary** exposes countertop vs backsplash vs room extras vs structured custom lines from this basis plus vanities and **`runLocalPrototypeQuote`**. **Backend Calculate** with **`engine: "rooms"`** and **`pieces`** already priced via **`enumerateRoomMaterialSfRows`**. **Customer print** already consumes **`buildSelectedMaterialBreakdown`**. Rule: **piece-level material overrides must not cause live totals and printed totals to diverge.** Optional tier comparison tables remain hypothetical (**full-scope SF × each tier rate**) and are labeled accordingly when mixing differs from scope totals. |
| **Why** | Customers and estimators saw different totals when one room contained counters priced under multiple tiers — collapsing room SF onto room.default tier understated/overstated live totals vs breakdown PDF. |
| **Impacted files/docs** | `app-quote/src/lib/prototypeQuoteMath.ts`, `app-internal-estimate/src/InternalEstimateApp.tsx`, `backend-core/src/scripts/verifyInternalEstimateMath.mjs`, `docs/quote-platform/internal-quote-test-plan.md`, `docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md`. |
| **Revisit trigger** | New measurement modes or slab remnants requiring separate valuation logic outside tier SF × rate. |

---

### Supplement — Internal Estimate beta hardening (2026-05)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | **Room drafts** persist in `internal_ui.estimate_room_drafts` (add-ons, tear, FHB, catalog color id, guided layout preset) with API `estimate_rooms` still used for Calculate. **Use tax** is optional per room (`useTaxMode`: inherit project / none / percent) on **countertop material only**, folded into that room’s material $ (not a separate PDF line); project `internal_ui.use_tax_percent` is the default for new/inherited rooms. **2026 Vanity Program** is an isolated module (`vanityProgram2026`) with kitchen ≥35 sf / &lt;35 sf tiers, sink upgrades, extra trips; customer vanity display rounds to **nearest $5** (stone rooms stay **$10**). **L/U guided shapes** subtract **corner overlap** (default 25.5″). **Internal-only custom lines** fold into customer material; names never print. **Color TBD** → `internal_ui.color_tbd`. **Customer room/area cost breakdown** snapshotted as `internal_ui.customer_room_area_breakdown`. |
| **Why** | Beta testers reported lost room add-ons/colors on reload, over-counted L/U sf, need Lisbon-style use tax, and internal fee lines leaking to customer PDFs. |
| **Impacted files/docs** | `app-quote/src/lib/measurementEngine.ts`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-internal-estimate/`, `backend-core/src/quotes/quoteCalculator.js`, `scripts/verify-internal-estimate-beta-fixes.ts`, `docs/quote-platform/internal-quote-test-plan.md`. |
| **Revisit trigger** | Per-branch use-tax rules in admin; itemized use-tax on customer PDF; backend room engine parity for all FHB edge cases. |

---

### 9. Public Quote Head vs Internal Estimate Head (separate deployables)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Public Quote Head** and **Internal Estimate Head** are **separate heads**. **Internal Estimate** requires **login** (Supabase session) and **Brain authorization** (`requireAuth` + `requireHeadAccess` on `/api/internal-quotes/*`). It **must not** be exposed through the **public** quote app (`app-quote` is **public-only**; internal estimate UI lives in **`app-internal-estimate/`**). |
| **Why** | eliteOS architecture uses distinct surfaces per audience; combining public and internal modes in one head risks accidental exposure of Direct/Wholesale economics and internal CRM routing. |
| **Impacted files/docs** | `app-quote/` (public wizard only), `app-internal-estimate/`, `docs/quote-platform/quote-heads-split-plan.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/eliteos/eliteOS-master-head-map.md`, `docs/quote-platform/internal-quote-test-plan.md`, root `package.json` (`eos:check:local`). |
| **Revisit trigger** | SSO / device policy for staff-only hosting; or consolidation into a monorepo shared package without merging heads. |

---

### 10. Pricing Admin as long-term pricing source of truth

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Pricing Admin** is the **long-term source of truth** for quote pricing configuration (material tiers, add-ons, policy rules, future partner tiers). **Hardcoded constants** in `quoteCalculator.js` remain **authoritative fallbacks** until resolver parity tests pass and a deliberate cutover is recorded. |
| **Why** | Authorized admins must change rates and rules without code deploys; quotes must keep **snapshots** of the pricing used at save time. |
| **Impacted files/docs** | `app-pricing-admin/`, `backend-core/src/quotes/pricingAdminHeadApi.js`, `backend-core/src/quotes/pricingConfigResolver.js`, `backend-core/supabase/eliteos_pricing_admin_foundation.sql`, `backend-core/src/auth/eosGovernanceConstants.js` (`pricing_admin` head), `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/quote-platform/pricing-seed-map.md`, root `package.json`. |
| **Revisit trigger** | After foundation SQL is applied in Supabase; when calculators read resolver first; partner tier launch; branch/account-specific pricing. |

---

### 11. eliteOS Home / Launcher on www.eliteosfab.com

| Field | Value |
|-------|-------|
| **Date** | 2026-05-11 |
| **Decision** | **`https://www.eliteosfab.com`** is **eliteOS Home** and the **eliteOS Launcher** (`app-home`). Users sign in with **Supabase Auth** (anon key only in the browser). **`GET /api/me/heads`** (backend-core) returns the **head catalog** with **deployment URLs** and **status** derived from env; **admin**, **executive**, and **super_admin** profiles receive **every catalog head** (URLs still env-driven); **non-admin** users receive **only** heads allowed by **`user_head_access`** (or role defaults when no rows exist). **Inactive** users receive **no heads**. An **eliteOS Public Quote Head** card may appear as a **convenience** link (`public_quote` slug — not an `EOS_HEAD_SLUGS` head). **Launcher visibility does not replace** per-route **`requireHeadAccess`** and role checks on the **eliteOS Brain**. **Production launcher safety:** when **`NODE_ENV=production`**, Brain **`sanitizeLauncherHeadUrl`** strips loopback / localhost / typical private-network URLs from **`HEAD_URL_*`** responses; **`app-home`** applies the same guard when **`import.meta.env.PROD`**. Unset or stripped URLs appear under **Coming Soon Tools** (SPA localhost defaults remain **dev-only**). **User-facing copy** uses **“tools”** instead of **“heads”** where practical; internal **`EOS_HEAD_SLUGS`**, **`user_head_access`**, and API contracts stay unchanged. UI separates **Available Tools** vs **Coming Soon Tools**, de-emphasizes raw URLs/slugs on cards, and exposes slug → URL reference under **Access details** for **admin / executive / super_admin**. |
| **Why** | eliteOS is a multi-head OS: operators need one branded entry point, admins need full visibility of shipped heads, and partners/internal staff must see only what governance allows—while the API remains authoritative. |
| **Impacted files/docs** | `app-home/` (incl. `src/lib/config.ts`, `src/ui/App.tsx`), `app-quote-library/`, `backend-core/src/me/launcherHeads.js`, `backend-core/src/me/headDeploymentUrls.js`, `backend-core/src/auth/authMiddleware.js`, `backend-core/src/auth/headAccessMiddleware.js`, `backend-core/src/server.js` (CORS defaults), `backend-core/supabase/eliteos_super_admin_role.sql` (optional `super_admin` role widen), `docs/eliteos/domain-routing-plan.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md` §4, `docs/eliteos/eliteOS-master-head-map.md`, `backend-core/.env.example`. |
| **Revisit trigger** | External partner/dealer launch programs; **`api.eliteosfab.com`** cutover; RLS / head-access tightening; Supabase Auth redirect or CORS changes for new preview domains. |

---

### 12. System Admin invite and recovery redirect URLs

| Field | Value |
|-------|-------|
| **Date** | 2026-05-11 |
| **Decision** | **`inviteUserByEmail`** and **password-recovery `generateLink`** use an explicit **`redirectTo`** built from **`SUPABASE_INVITE_REDIRECT_URL`** (preferred), then **`ELITEOS_HOME_URL`** / **`HEAD_URL_HOME`** / legacy envs, defaulting to **`https://www.eliteosfab.com/auth/callback`**. **`SITE_URL`** / similar values that resolve to **localhost** are **not** used for invite/recovery redirects so production emails never point at `http://localhost:3000`. **`app-home`** handles **`/auth/callback`** (SPA rewrite on Vercel), parses Supabase tokens, optional **`updateUser({ password })`** after session exists, then shows the launcher. |
| **Why** | Invited users must complete setup on **eliteOS Home**, not a missing route or localhost API port. |
| **Impacted files/docs** | `backend-core/src/admin/systemAdminUserManagement.js`, `app-home/src/ui/App.tsx`, `app-home/vercel.json`, `backend-core/.env.example`, `backend-core/src/server.js` (CORS for `system.eliteosfab.com`), `docs/eliteos/domain-routing-plan.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md` §4, `docs/eliteos/CURRENT_SYSTEM_MAP.md` §9. |
| **Revisit trigger** | Custom branded auth domain; PKCE-only policy changes; SSO replacing magic-link completion. |

---

### 13. System Admin ownership vs Quote Library vs Pricing Admin

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **System Admin** owns **users**, **application roles**, **`user_head_access`**, **organizations (UUID on profiles today)**, **invites**, **account lifecycle** (resend invite vs password reset, deactivate/reactivate, guarded hard delete for test users), **schema health**, and **admin diagnostics** embedded in the head. **Quote workflow** (search, filter, sort, account grouping, status workflow, sold-job handoff documentation) belongs to the **eliteOS Quote Library** head (`app-quote-library`, **`https://quotes.eliteosfab.com`**) — not System Admin as a primary surface. **Internal Estimate** creates and revises estimates; **Quote Library** manages library operations over the **same** `quote_headers` tables. **Pricing configuration** belongs to the **eliteOS Pricing Admin** head; legacy quote-structure UIs in System Admin remain **diagnostics only** until retired. |
| **Why** | Operators need a single trustworthy governance console without conflating CRM-style quote libraries or finance-owned pricing with identity administration. |
| **Lifecycle rules** | **Resend invite** when the Supabase user has **not** confirmed email (setup link; `redirectTo` from **`SUPABASE_INVITE_REDIRECT_URL`**). **Password reset** only after email is confirmed (recovery link to **`https://www.eliteosfab.com/auth/callback`** pattern via backend env resolution). **Deactivate** is preferred for real users who must lose access; **hard delete** is for **accidental/test** users only, **backend-blocked** if quote or audit history exists, **blocked** for self-delete and last **admin/super_admin**, with explicit **`DELETE`** or **email** confirmation in the API body. |
| **Impacted files/docs** | `app-system-admin/`, `app-quote-library/`, `backend-core/src/quotes/quoteLibraryApi.js`, `backend-core/src/admin/systemAdminUserManagement.js`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/eliteos/eliteOS-master-head-map.md`, `docs/quote-platform/quote-library-head-plan.md`. |
| **Revisit trigger** | Partner-scoped Quote Library RLS; when org directory replaces UUID-only org assignment; when legacy `/api/admin/quote-*` diagnostics are removed; when Moraware/QB automation ships behind integration admin. |

---

### 14. Internal Estimate room model + Elite Program catalog ownership

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | **Internal Estimate** uses a **room-based estimate model** with optional **quote → room → piece** material inheritance: **Pricing Admin / prototype seeds** own the **Elite Program color catalog** (`quote_pricing_rules.category = material_color`, exposed read-only as **`GET /api/internal-quotes/material-colors`** with DB fallback). **Job-specific custom line items** (categories, qty × unit price, discount/credit rules) are **validated and totaled in `quoteCalculator.js`**, stored on **`calculation_snapshot`** and in **`internal_ui`**, and surfaced in **Quote Library** + **Moraware/QB entry doc payloads** (no external writeback). Workflow follows a generic **room → pieces → add-ons → custom lines → material breakdown → totals → Quote Library → sold handoff** pattern without copying third-party UI. |
| **Why** | Real jobs mix materials by area; estimators need structured lines and catalog-backed colors without hardcoding catalogs only in the browser or breaking public quote math. |
| **Impacted files/docs** | `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/quotes/materialColorsCatalog.js`, `backend-core/src/quotes/internalQuotesApi.js`, `backend-core/src/quotes/quotePersist.js`, `backend-core/src/quotes/quoteLibraryHandoffPayloads.js`, `app-internal-estimate/`, `app-quote/src/ui/RoomScopeBuilder.tsx`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-quote-library/src/QuoteLibraryApp.tsx`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`, `docs/quote-platform/pricing-admin-head-plan.md`. |
| **Revisit trigger** | Move catalog to dedicated `quote_material_color_mappings` rows only; wire Pricing Admin UI for CRUD; add in-place **revision save** API for internal quotes; cut calculator over to `pricingConfigResolver` when parity-tested. |

---

### 15. Internal Estimate Product Spec as north-star

| Field | Value |
|-------|--------|
| **Date** | 2026-05-11 |
| **Decision** | The **Internal Estimate Product Spec** ([`docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md`](../quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md)) defines the **target best-in-class** estimating workflow: **hybrid guided** room/area builder, **per-room / per-piece** materials, **optional price-group comparisons**, **custom line items** with **hidden/internal** lines and **absorb** behavior, **branch-aware `ESF-{BRANCH}-{SEQ}`** quote numbers with **revision suffixes**, **explicit save choices** (update vs revision vs new quote), **customer vs internal output modes** with **customer rounding**, **sold-job handoff** previews (Moraware / QuickBooks) without automatic writeback, and **Pricing Admin ownership** of standard catalogs over time. Future Cursor and engineering work should treat this document as the **product source of truth** when scope conflicts with ad hoc notes. |
| **Why** | The foundation in code is useful but not yet the finished estimator experience; Chris and staff need a single plain-English contract before more build work. |
| **Impacted files/docs** | `docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md` (new), `docs/eliteos/CURRENT_SYSTEM_MAP.md`, this file. |
| **Revisit trigger** | Each major phase completion (see spec §23); any intentional change to boundaries between Internal Estimate, Quote Library, and Pricing Admin. |

---

### 16. Internal Estimate Visual Layout Canvas v1 (non-authoritative geometry)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-15 |
| **Decision** | **Visual Layout Canvas v1** in **`app-internal-estimate`** is a **communication / QA overlay only**. Piece positions (`x`, `y`) and **`rotation`** are stored in **browser-local React state** keyed by stable ids derived from **`RoomDraft` ids + `GuidedPiece` ids** (plus **`v:{roomId}`** vanities). **Drag / rotate must never feed pricing**: calculators continue to use **entered inches/sq ft** from **`measureRoomDraft` / rooms engine**; **`serializeRoomsForApi`**, **sticky totals**, **POST `/api/internal-quotes/calculate`**, **save payloads**, and **customer PDF** ignore canvas geometry entirely until (if ever) a future revision deliberately persists orthogonal authoring dimensions behind explicit UX guardrails. |
| **Why** | Estimators need fast sanity-check layouts without risking silent divergence between “what moved on screen” vs contract-grade quantities captured by Brain calculators (aligned with Internal Estimate Product Spec “Math wins”). |
| **Impacted files/docs** | `app-internal-estimate/src/VisualLayoutCanvas.tsx`, `app-internal-estimate/src/InternalEstimateApp.tsx`, `docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md`, `docs/quote-platform/internal-quote-test-plan.md`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`. |
| **Revisit trigger** | Plan/PDF underlay, persisted layouts under **`internal_ui`**, AI takeoff imports, or any proposal to derive quantities from canvas CAD primitives — each requires explicit architecture review + likely FEATURE_DECISIONS § rewrite + QA parity checklist updates. |

---

### 17. Cross-subdomain Supabase browser session (Home → staff heads)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-15 |
| **Decision** | eliteOS **Home** and **staff heads** that share `*.eliteosfab.com` use a **cookie-backed Supabase auth storage adapter** (`Domain=.eliteosfab.com`, `Secure`, `SameSite=Lax`, chunked payload cookies under `shared/eliteos-supabase/`) so one **sign-in on Home** reuses the **anon-session JWT** on Internal Estimate, Quote Library, Pricing Admin, and System Admin. **`app-quote` (Public Quote)** stays on **default per-origin storage** and remains **public**. |
| **Why** | Browsers isolate **`localStorage` per subdomain**, so each head saw an empty session after Home login; UX required redundant sign-in despite valid Brain authorization patterns. |
| **Impacted files/docs** | `shared/eliteos-supabase/chunkedCookieStorage.ts`, `shared/eliteos-supabase/eliteosSupabaseAuthOptions.ts`, `app-home/src/lib/supabase.ts`, `app-system-admin/src/lib/supabase.ts`, `app-internal-estimate/src/lib/supabase.ts`, `app-quote-library/src/lib/supabase.ts`, `app-pricing-admin/src/lib/supabase.ts`, related `vite.config.ts` / `tsconfig.json`, `docs/eliteos/SYSTEM_BLUEPRINT.md`. |
| **Revisit trigger** | Move to Supabase SSR `@supabase/ssr` cookie helpers; split Supabase projects per head; strict third-party cookie blocks on future browsers; staging hosts that cannot share `.eliteosfab.com` cookies (`VITE_ELITEOS_AUTH_COOKIE_DOMAIN`). |

---

### 18. Internal Estimate Phase 2 — ESF quote numbers, revisions, Quote Library metrics

| Field | Value |
|-------|--------|
| **Date** | 2026-05-15 |
| **Decision** | Internal estimates allocate **`ESF-{BRANCH}-{NNNNNN}`** bases via Supabase **`quote_allocate_esf_sequence`** (`eliteos_internal_quote_phase2.sql`); revisions **`quote_number`** add **`-R{n}`** while **`quote_number_base`** stays stable. Saves default **`update_existing`** when `quote_id` is posted without `save_mode`; **`save_revision`** inserts a new **`quote_headers`** row with frozen **`calculation_snapshot`**. Quote Library lists **latest revision + non-archived** by default; **`GET /api/quote-library/quotes/:id/revisions`** lists the family; **`POST /api/quote-library/quotes/:id/restore-as-revision`** copies a historical snapshot forward as a new latest revision (non-destructive). **`POST /api/quote-library/quotes/:id/archive`** soft-archives (`archived_at`). Monday internal sync adds optional **`MONDAY_INTERNAL_COL_REVISION`** / **`MONDAY_INTERNAL_COL_LAST_REVISED`** and updates existing pulses when **`monday_item_id`** exists and sync **`action`** is **`update`**. |
| **Why** | Replace pen-and-paper / QuickBooks estimating with durable, auditable families; avoid double-counting old revisions in totals; keep Monday token server-side; preserve historic pricing snapshots. |
| **Impacted files/docs** | `backend-core/supabase/eliteos_internal_quote_phase2.sql`, `backend-core/src/quotes/quoteEsfNumber.js`, `internalQuotePatchPolicy.js`, `internalQuoteSave.js`, `internalQuotesApi.js`, `quoteLibraryApi.js`, `quotePersist.js`, `mondayQuoteSync.js`, `verifyPhase2InternalQuotePolicies.mjs`, Internal Estimate + Quote Library heads, `docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md`, `backend-core/.env.example`. |
| **Revisit trigger** | Org-specific branch-prefix rules belong in **Pricing/System Admin** (TODO); YoY metrics refinement; Monday deep-link column mapping. |

---

### 19. Internal Estimate calculation_snapshot immutability (PATCH vs save pipeline)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-15 |
| **Decision** | **`PATCH /api/internal-quotes/:id` must not accept `calculation_snapshot`.** Pricing snapshots are **server-authored** through **`POST /api/internal-quotes/save`** (`calculateQuote` + merged `internal_ui`). **`update_existing`** recomputes and replaces the snapshot on the **current** revision only; **`save_revision`** inserts a new row and leaves prior revisions untouched. PATCH remains limited to **metadata** (e.g. status, prepared_by, customer/project fields). Archived quotes and **non-current** revision rows reject PATCH. |
| **Why** | Pen-and-paper replacement requires **years-long reproducibility**: arbitrary JSON PATCH would break audits, Monday payloads, and Quote Library handoffs without calculator parity. |
| **Impacted files/docs** | `backend-core/src/quotes/internalQuotePatchPolicy.js`, `internalQuotesApi.js`, `internalQuoteSave.js`, `quotePersist.js`, `quoteCalculator.js`, `docs/quote-platform/internal-quote-test-plan.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`. |
| **Revisit trigger** | Admin-only “snapshot correction” tooling with dual-control audit — would need explicit product sign-off and new route semantics (never silent PATCH). |

---

### 20. eliteOS Auth Events And Action Audit Foundation

| Field | Value |
|-------|--------|
| **Date** | 2026-05-17 |
| **Decision** | Reuse and extend **`eos_login_log`** for auth/session events and **`eos_action_log`** for meaningful action audit instead of introducing parallel audit tables. `backend-core` owns writes through non-fatal helpers (`recordAuthEvent`, `recordActionLog`); System Admin owns visibility through admin-only audit routes and UI filters. |
| **Why** | Beta onboarding needs trustworthy “who signed in / what changed” visibility without weakening permissions or logging secrets. Supabase password submission happens directly against Supabase Auth, so eliteOS records the first authenticated Brain request/session event as the durable sign-in/seen signal. |
| **Impacted files/docs** | `backend-core/src/auth/auditLog.js`, `backend-core/src/server.js`, `backend-core/src/admin/systemAdminUserManagement.js`, quote and pricing API hooks, `backend-core/supabase/eliteos_audit_foundation.sql`, `app-system-admin/src/ui/App.tsx`, `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`. |
| **Revisit trigger** | Need cross-tenant export/retention policy, SIEM forwarding, row-level audit access, or exact Supabase Auth webhook/event ingestion. |

---

### 21. Quote Library pagination and soft-delete batch operations

| Field | Value |
|-------|--------|
| **Date** | 2026-05-17 |
| **Decision** | Quote Library list APIs are paginated (`limit`/`offset`) with count metadata; UI copy must describe visible/matching quotes, never imply a storage ceiling. Bulk “delete-like” behavior is **Archive selected** only: authenticated Quote Library users can soft-archive visible, eligible quotes through a backend batch route with per-id results and audit logging. Hard delete remains out of the default Quote Library surface. |
| **Why** | eliteOS Quote Library is the durable replacement for years of estimating history. Operators need scalable navigation and safe bulk cleanup without risking loss of quote snapshots, ESF numbering, revisions, or auditability. |
| **Impacted files/docs** | `backend-core/src/quotes/quoteLibraryApi.js`, `app-quote-library/src/QuoteLibraryApp.tsx`, `app-quote-library/src/styles.css`, `backend-core/supabase/eliteos_quote_library_scalability_indexes.sql`, this file. |
| **Revisit trigger** | Need cross-page selection, batch status edits, hard-delete test/admin tooling, or indexed handoff-document filters over the full matching set. |

---

### 22. Moraware Sync Foundation v1 as Brain infrastructure

| Field | Value |
|-------|--------|
| **Date** | 2026-05-18 |
| **Decision** | Moraware Sync Foundation v1 is shared **eliteOS Brain** data infrastructure, not a Sales-only feature. V1 stores proven/readable Moraware accounts, jobs, activities, forms/custom fields, file metadata, and assignee/resource catalog in additive raw + normalized Supabase tables with sync runs, errors, and data quality findings. Cloud/Node HTTP sync may be used where sufficient, but SDK-only reads must run from a Windows worker and import through a protected Brain endpoint. |
| **Why** | Moraware records the work; eliteOS explains and moves the work. Multiple future heads need trustworthy, observable Moraware data, while credentials and service-role writes must stay out of browser apps and Vercel must not be assumed capable of loading `JobTrackerAPI5.dll`. |
| **Impacted files/docs** | `backend-core/src/moraware/morawareSyncApi.js`, `backend-core/src/scripts/moraware/importSnapshotToBrain.js`, `backend-core/supabase/eliteos_moraware_sync_foundation_v1.sql`, `backend-core/.env.example`, `.env.example`, `docs/eliteos/moraware-sync-foundation.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`, `docs/eliteos/CURRENT_SYSTEM_MAP.md`. |
| **Revisit trigger** | Moraware Admin mapping head ships; activity-to-resource assignment is trusted; Inventory/SlabSmith path is integrated; live Machines calendar rows are unlocked; any Moraware writeback is proposed. |

---

### 23. Moraware Admin / Operations Integration Switchboard v1 (System Admin)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | Moraware is the **first Operations Integration Switchboard adapter**. V1 adds **read-only** admin APIs and System Admin UI for sync health, mirror exploration (paginated summary fields), data quality, prepared-facts freshness, and mapping-queue visibility — without Moraware writeback, without exposing credentials, and without returning full raw payloads by default. Sales Head continues to read **prepared** tables (`sales_moraware_job_facts`, `sales_moraware_account_rollups`), not live Moraware or raw JSON on page load. **No new scheduled/live Moraware runner** in this pass — scheduled sync is **checklist + docs only**; reuse existing `POST /api/internal/sync/nightly` (cron secret) and chunked `POST /api/internal/moraware-sync/import`. All foundation v1 mirror tables have `organization_id`; admin routes filter by org and require `admin` + `system_admin` head (no new migration for org columns). |
| **Why** | Operators need visibility into import groups (e.g. 2026 baseline), chunk completion, stale prepared facts, and unmapped accounts before Production / Shop TV / Titans heads consume the mirror. The pattern must stay org-scoped and adapter-shaped so non-Moraware shops can plug in later. |
| **Impacted files/docs** | `backend-core/src/moraware/morawareSyncHealth.js`, `backend-core/src/admin/morawareAdmin.js`, `app-system-admin/src/ui/MorawareAdmin.tsx`, `docs/eliteos/moraware-sync-foundation.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`. |
| **Revisit trigger** | Dedicated Moraware Admin head slug; optional `run-scheduled` wrapper reusing existing cron/import patterns; cross-adapter mapping UI; Moraware writeback proposal; RLS on mirror tables if multi-tenant browser access expands beyond admin. |

---

### 24. Sales Dashboard Head vertical slice from ESF Command Center

| Field | Value |
|-------|--------|
| **Date** | 2026-05-18 |
| **Decision** | The uploaded ESF Sales Performance Command Center HTML is the product blueprint for the Sales Dashboard Head, but **it is UX/product reference only**. Its embedded hardcoded `RAW_DATA` is **not production truth** and must not be copied into `app-sales` or backend seeds. The first safe slice reads backend-owned aggregates from `GET /api/sales/dashboard-foundation`: Moraware actuals from `brain_moraware_*` / `moraware_raw_*`, sync health from `moraware_sync_runs`, and forward-pipeline availability from Quote Library tables. Full parity features (YoY sqft, Elite 100 mix, color/manufacturer breakdowns, account attention/coaching) remain backend-owned future work until mappings and normalized metrics are available. Account → branch/location/salesperson attribution is **admin-governed** through System Admin / Sales Account Mapping Admin (`sales_account_aliases`, `sales_account_assignments`, and history). Sales Head may show legacy fallback attribution only as **preview / needs approved mapping**; hardcoded branch attribution is not production truth. Known correction: the uploaded HTML incorrectly credited Dyersville with square footage from the account **Blackstone**. **Blackstone must not map to Dyersville** unless Chris explicitly approves that rule later through Brain/API-backed account attribution. |
| **Follow-up 2026-05-18** | Approved attribution coverage is now a first-class preview metric. Backend coverage compares accounts/jobs seen in the latest successful Moraware sync against approved `sales_account_aliases`; only approved mappings count toward trusted coverage. System Admin shows approved, needs-review/unmapped, and rejected/ignored counts plus top accounts needing approval. Sales Head shows approved account/job coverage cards and keeps branch revenue/sqft warnings visible until coverage is high. |
| **Follow-up 2026-05-18 actuals v1** | Sales Head may show **company-wide synced square-foot actuals** before attribution coverage is complete. Backend extracts valid numeric Sq.Ft. values from Brain-owned Moraware Job Worksheet form fields (`brain_moraware_jobs.raw_payload.forms[].fields[]`, labels like `Sq.Ft.` / normalized `sq ft`) and returns aggregate totals/trends only. Company-wide sqft totals include all synced jobs with valid extracted sqft; branch, salesperson, and account-owner sqft reporting remains gated by approved Sales Account Mapping rows. Raw account rollups are labeled raw/unattributed unless an approved mapping exists. |
| **Follow-up 2026-05-18 filters v1** | Sales Dashboard actuals default to **YTD** (`datePreset=ytd`, `timeGrain=month`, `sortBy=sqft`, `sortDirection=desc`). `GET /api/sales/dashboard-foundation` accepts filtered actuals params (`datePreset`, `startDate`, `endDate`, `timeGrain`, `account`, `branch`, `salesperson`, `status`, `process`, `attributionStatus`, `sortBy`, `sortDirection`) and returns active filters, filtered totals, grouped trend rows, sorted account rows, and filtered attribution coverage. Branch/salesperson filters are trusted only for approved mappings; company-wide totals may include all valid filtered Sq.Ft. rows. |
| **Follow-up 2026-05-18 baseline sync mode** | The Moraware live snapshot runner supports explicit `MORAWARE_SNAPSHOT_MODE=baseline_2026` for a manual 2026 date-bounded baseline. It requires `MORAWARE_BASELINE_START_DATE`, defaults `MORAWARE_BASELINE_END_DATE` to today when omitted, rejects invalid/inverted ranges and start dates before `2026-01-01`, sets Moraware discovery date filters before detail/form ingestion, writes only ignored `debug/moraware/baseline-2026/` artifacts, and preserves chunked import as a separate manual command. Caps are safety limits for import payload sizing and now emit warnings when reached. |
| **Why** | Sales needs familiar Command Center UX without reintroducing spreadsheet/CSV data copies or browser-side Moraware access. Starting with sync health and aggregate Moraware row counts validates the data path before richer sales calculations feed founder-facing decisions. |
| **Impacted files/docs** | `backend-core/src/sales/salesHead.js`, `backend-core/src/sales/salesAttribution.js`, `backend-core/src/sales/salesAttributionCoverage.js`, `backend-core/src/sales/morawareSqftActuals.js`, `backend-core/src/admin/salesAccountMappingAdmin.js`, `backend-core/src/scripts/moraware/generateLiveCappedSnapshot.js`, `backend-core/src/scripts/moraware/generateTinySnapshot.js`, `app-system-admin/src/ui/SalesAccountMappingAdmin.tsx`, `app-sales/src/ui/SalesCommandCenterView.tsx`, `app-sales/src/ui/App.tsx`, `app-sales/src/ui/sales-intelligence.css`, `docs/eliteos/moraware-sync-foundation.md`, this file. |
| **Revisit trigger** | Elite 100 color/group mapping tables ship; Moraware forms expose stable sqft/color/manufacturer actuals; account/salesperson attribution mapping is approved; Quote Library forecast events are populated enough for forward pipeline KPIs. |

---

### 25. Org Directory / Org Chart head v1 (standalone planning tool)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | **Org Directory** is a **standalone eliteOS head** (`org_directory` slug, `app-org-directory/`) for planning company structure — departments, seats, reporting lines (direct/dotted/advisory/partner), and **recommended** eliteOS head tags. Data lives in **`org_directory_charts.chart_data`** (JSON document per `organization_id`). **Does not** modify `user_head_access`, invites, or payroll/HR fields. **Edit access:** `admin` / `executive` / `super_admin`, or a row in **`org_directory_editors`** (by email). System Admin remains authoritative for real permissions. |
| **Why** | Leadership (e.g. Marshal) needs an org chart without System Admin access. Keeps governance separate from structure planning and preserves SaaS-shaped org scoping. |
| **Impacted files/docs** | `backend-core/supabase/eliteos_org_directory_v1.sql`, `backend-core/src/orgDirectory/orgDirectoryApi.js`, `app-org-directory/`, `backend-core/src/auth/eosGovernanceConstants.js`, `backend-core/src/me/launcherHeads.js`, `backend-core/src/me/headDeploymentUrls.js`, this file, `SYSTEM_BLUEPRINT.md`. |
| **Revisit trigger** | Normalized HR/workforce tables; invite workflow from chart seats; drag/drop canvas; multi-chart versions; RLS on org directory tables. |

---

### 26. Partner Quote Foundation v1 — readiness before `app-partner-quote`

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | **Partner Quote v1** builds on **`quote_partner_accounts`** + **`quote_partner_pricing_assignments`** + shared **`quoteCalculator`** / **`quote_headers`** (`quote_source = partner_quote`), scoped by **`organization_id`**. **Do not** treat legacy **`dealer_accounts`** / **`user_account_access`** as pricing authority until bridged to `quote_partner_accounts`. **Do not** enable external partner login until **`quote_partner_user_access`** (or equivalent) and partner APIs enforce **`partner_account_id`** server-side. Org-level branding (`organization_public_quote_settings`) is for **public** quotes, not partner co-branding. |
| **Why** | Chris’s scenario (Elite org #1, Skogman as partner under Elite) requires fabricator vs partner distinction and tenant isolation before a dealer-facing head ships. Inspection found strong quote-platform primitives but a **dual account model** and **no RLS**. |
| **Impacted files/docs** | `docs/quote-platform/partner-quote-foundation-readiness.md`, `backend-core/supabase/eos_quote_platform.sql`, `backend-core/supabase/eos_saas_foundation.sql`, `backend-core/supabase/user_management_schema.sql`, `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/quotes/quotePricingAdminApi.js`, `backend-core/src/organizations/organizationContext.js`, `backend-core/src/me/launcherHeads.js`, proposed `backend-core/supabase/partner_quote_foundation_v1_additive.sql`. |
| **Revisit trigger** | First partner pilot login; calculator cutover to Pricing Admin `partner_tier_*` rates; RLS milestone; Skogman (or any named partner) must be **data rows only**, never hardcoded. |

---

### 27. Partner Quote Foundation v1 — backend landed (2026-05-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | Shipped additive SQL (`partner_quote_foundation_v1_additive.sql`), **`resolvePartnerContext`**, and partner-safe routes: `GET /api/partner-quote/context`, `POST /api/partner-quote/calculate`, `POST /api/partner-quote/submit`, `GET /api/partner-quote/my-quotes`. Partner context requires **`quote_partner_user_access`** — internal admins **do not** bypass on these routes. **`user_kind = dealer_partner`** is blocked from internal quote, quote library, and generic `/api/quote/*` paths; they must use `/api/partner-quote/*`. Partner API payloads omit wholesale/profit/raw rules. Full **`calculation_snapshot`** (including internal economics) is stored server-side for operators only. |
| **Why** | Closes the readiness gap between shared quote brain and partner identity/security before `app-partner-quote` or external partner login. |
| **Impacted files/docs** | `backend-core/supabase/partner_quote_foundation_v1_additive.sql`, `backend-core/src/quotes/partnerContext.js`, `partnerQuotesApi.js`, `partnerQuoteSanitize.js`, `quoteRoutes.js`, `internalQuotesApi.js`, `quoteLibraryApi.js`, `backend-core/src/scripts/verifyPartnerQuoteFoundation.mjs`, `docs/quote-platform/partner-quote-foundation-readiness.md`. |
| **Revisit trigger** | Supabase SQL applied in all envs; seed `quote_partner_user_access` for pilot; RLS; external partner invites; `app-partner-quote` UI. |

---

### 28. Partner Quote leakage verification & RLS draft (not applied)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-19 |
| **Decision** | Add **`verifyPartnerQuoteLeakage.mjs`** (requires `PARTNER_LEAK_TEST_CONFIRM=yes` + explicit test user/partner UUIDs) to prove cross-partner denial on context, my-quotes, submit rows, and `dealer_partner` blocks on internal/library/generic quote APIs. Ship **`partner_quote_rls_draft.sql`** as **draft only** — do not enable RLS on `quote_headers` until composite policies exist for internal/public quote sources. External partner launch remains blocked until leakage passes in target env, RLS is applied with regression sign-off, invites are hardened, and partner PDF/output policy is set. |
| **Why** | `app-partner-quote` pilot proved happy-path flows; isolation must be demonstrated before real dealer credentials. |
| **Impacted files/docs** | `backend-core/src/scripts/verifyPartnerQuoteLeakage.mjs`, `backend-core/supabase/partner_quote_rls_draft.sql`, `docs/quote-platform/partner-quote-leakage-verification.md`, `backend-core/.env.example`. |
| **Revisit trigger** | Leakage green in staging+prod; RLS applied; admin impersonation policy; production invite flow. |

---

### 29. Two-level brand architecture: slabOS (platform) + eliteOS (workspace)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-24 |
| **Decision** | Introduce **`slabOS`** as the platform/master brand shown on pre-workspace surfaces (sign-in card, invite/recovery gate) and keep **`eliteOS`** as the Elite Stone Fabrication **workspace/tenant** experience for everything after sign-in. The signed-in Home Launcher hero adds a **workspace identity panel** (org logo + workspace name + quiet `"on slabOS · <short id>"`). Tenant name and logo resolve from optional `me.user.organization_name` / `organization_logo_url` (and the same on `headsPayload.user`) when the backend supplies them, falling back to the existing Elite Stone asset (`EOS_LOGO_URL`) and the literal `"Elite Stone Fabrication"` for the current tenant. Defaults are centralized as `DEFAULT_WORKSPACE_NAME` / `resolveWorkspaceLogoUrl` in `app-home/src/ui/App.tsx`. **No** backend, repo, env-var, head-slug, route, audit-log, or governance identifier was renamed — `eliteOS` and `eos_*` remain the technical brand. |
| **Why** | Prepares Home Launcher for multi-tenant SaaS where each fabricator sees its own workspace identity, while preserving Elite's current eliteOS experience and avoiding a destabilizing global rename of routes/slugs/envs. Two clean brand levels (`slabOS = platform`, `eliteOS = Elite's workspace`) keep messaging coherent at sign-in *and* inside the workspace. |
| **Impacted files/docs** | `app-home/src/ui/App.tsx` (slabOS auth panel, hero workspace panel, `resolveWorkspaceName` / `resolveWorkspaceLogoUrl`, optional org fields on user types), `app-home/src/ui/styles.css` (slabOS wordmark + hero workspace styles + 2-col hero grid + responsive stacking), `docs/eliteos/eliteos-ui-direction.md` (new §2.1 brand architecture, §6.2 / §6.2.1 patterns, §9 inheritance rules, anti-patterns), this entry. |
| **Revisit trigger** | First non-Elite tenant (backend supplies real `organization_name` / `organization_logo_url`); final platform naming decision (slabOS vs another name); a unified SaaS marketing site that needs to align with this brand split. |

---

### 30. Internal Estimate chargeable sqft: always ceil to next whole square foot

| Field | Value |
|-------|--------|
| **Date** | 2026-05-26 |
| **Decision** | For **Internal Estimate** (`quoteSource: "internal_quote"`), chargeable **countertop** and **backsplash/FHB** square footage must always round up to the next whole square foot before pricing. Examples: 8.3 sf countertop charges as 9 sf; 2.11 sf backsplash charges as 3 sf; 0 remains 0. Rounding happens at the **room-level aggregate per material-group bucket** (not per individual run), so mixed-material rooms round each group's splash independently. Exact measured sf is preserved in `counter`/`splash`/`fhb` on `MeasuredRoom` and in `exactCountertopSqft`/`exactBacksplashFhbSqft` in the backend calculation snapshot for audit and diagnostics. Applies uniformly across guided-shape, rapid-linear, and manual sq-ft input modes. |
| **Why** | Aligns with Elite estimating practice: fractional square footage should not result in undercharging. |
| **Impacted files/docs** | `app-quote/src/lib/measurementEngine.ts` (`chargeableSplashSqftFromExact`), `app-quote/src/lib/prototypeQuoteMath.ts` (`measureRoomDraft`, `buildSelectedMaterialBreakdownCore`, `applyChargeableSplashCeilToRoomRows`, `buildCustomerRoomAreaCostBreakdown`), `app-quote/src/lib/quoteTypes.ts` (`MeasuredRoom.chargeableSplash`, `.splashRoundingAdjustment`), `backend-core/src/quotes/roomGuidedMeasurement.js` (`chargeableSplashSqftFromExact`, `applyChargeableSplashCeilToGuidedRows`, `shouldApplyChargeableSplashCeil`), `backend-core/src/quotes/quoteCalculator.js` (`enumerateRoomMaterialSfRows`, `legacyWholesale`), `backend-core/src/scripts/verifyInternalEstimateMath.mjs` (tests 6–12). |
| **Revisit trigger** | Elite changes sqft billing policy (e.g. allows fractional billing); Pricing Admin adds configurable rounding per org; new input modes bypass this path. |

---

### 31. Customer-facing Internal Estimate print total = sum of rounded visible rows

| Field | Value |
|-------|--------|
| **Date** | 2026-05-26 |
| **Decision** | The **"Estimated project total"** on the customer-facing Internal Estimate PDF equals the arithmetic sum of each individually-rounded visible Estimate Summary row, not a second rounding of the exact internal grand total. Each row rounds to the nearest $10 first; total = sum of those rounded rows. |
| **Why** | Elite's sales process rounds each customer-facing line item before presenting it to the customer. The displayed total must reconcile with the visible rows: rounding the raw exact aggregate once can produce a total $10 lower than the sum of the already-rounded rows. Example: rows display $970 + $140 + $100 + $90 = $1,300; the pre-fix code showed $1,290. |
| **Impacted files** | `app-internal-estimate/src/CustomerEstimatePrint.tsx` — `finalRounded` now computed as `summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay + summaryVisibleLinesDisplay`. Room / Area Cost Breakdown continues to reconcile to this total via `allocateCustomerDisplayTens`. `props.estimateTotalExact` preserved for internal audit. |
| **Revisit trigger** | Elite changes customer-display rounding granularity (e.g. nearest $5, exact), or decides the PDF total should reflect the raw exact total rather than the sum of rounded rows. |

---

### 32. Sales Head joined the eliteOS protected-head shell + KPI History scaffold

| Field | Value |
|-------|--------|
| **Date** | 2026-05-26 |
| **Decision** | The **eliteOS Sales Head** (`app-sales`) now uses the shared protected-head shell pattern: sticky topbar with workspace identity + eliteOS wordmark + "Sales Dashboard · Elite Stone Fabrication" subtitle + user chip / dropdown menu (Open Home, Profile & preferences disabled, Sign out); a premium hero block ("Internal tool · Sales Dashboard · Sales performance command center"); and a new read-only **KPI History scaffold tab** that communicates the intended Moraware + Quote Library + future Partner Quote source model without rendering any fake or inferred metrics. The pre-existing Command Center / Quote Pipeline / Legacy Intelligence subviews and **every** backend API call (`/api/me`, `/api/sales/filters`, `/api/sales/dashboard-foundation`) are preserved unchanged. |
| **Why** | Sales Head still used a legacy app-shell while every other internal head had moved to the new pattern. KPI history was being treated as a single future build instead of a labeled, source-aware view — leadership needs to see *where every number came from* before composite KPIs are introduced. Restating the source-of-truth principle (Moraware owns production facts, Quote Library owns quote facts, Sales Head explains and compares — does not mutate) in a visible scaffold prevents accidental "invented metric" drift as the KPI engine is built out. |
| **Trust / guardrails preserved** | Branch / rep / account attribution stays gated by approved **Sales Account Mapping**. **Blackstone guardrail** is reaffirmed in the KPI scaffold copy and the planning doc: Blackstone does not default to Dyersville unless an explicit approved mapping changes that. No new public/partner markup, no service-role exposure in the browser, no browser-side Moraware calls. |
| **Impacted files/docs** | `app-sales/src/ui/App.tsx` (rewrite — new protected-head shell, hero, tab bar, user menu), `app-sales/src/ui/styles.css` (eliteOS tokens + shell classes prepended; legacy classes preserved for unmodified subviews), `app-sales/src/ui/KpiHistoryScaffold.tsx` (new), `docs/eliteos/sales-kpi-history-plan.md` (new), `docs/eliteos/eliteos-ui-direction.md` (Sales Head added to the protected-head roster). |
| **Out of scope (intentionally not built)** | KPI snapshot tables / migrations, KPI rollup engine, partner pipeline data fetch, Moraware sync rewrite, Sales attribution rewrite, Quote Library rewrite, KPI editing UI, backfill scripts. `sales_kpi_snapshots` / `sales_kpi_metric_definitions` / `sales_kpi_targets` / `sales_kpi_notes` / `weekly_quote_pipeline_rollups` / `moraware_production_kpi_rollups` remain **planning entries only** until explicitly approved. |
| **Revisit trigger** | Approval to land the additive KPI snapshot migration + read-only `GET /api/sales/kpi-history` endpoint; arrival of the Partner Quote head; consolidation/extraction of the shared protected-head topbar into a reusable component. |

---
## §33 — Quote Library primary quote value uses the customer-facing Estimated project total

| Field | Value |
|---|---|
| **Date** | 2026-05-26 |
| **Decision** | Quote Library's primary displayed Total / Quote Value (list row and detail drawer) uses `customer_display_total` — the customer-facing Estimated project total that matches the customer estimate PDF — instead of the raw backend exact total stored in `grand_total`. |
| **Why** | `grand_total` stores `round2(calc.totals.retail)`, the exact backend calculation result. The customer PDF shows a different number: each visible Estimate Summary row (countertop material, backsplash material, add-ons, customer-facing custom lines) rounds up independently to the nearest $10, and the displayed total is the sum of those rounded rows. Sales, billing, and future KPI quote pipeline reporting must reference the number the customer actually sees, not an internal precision artifact. |
| **Root cause of discrepancy** | (a) Sum of individually rounded rows ≠ the grand total rounded once. (b) Per-room add-ons may price differently in the backend (DB pricing rules can override or zero-out prototype add-on catalog prices) vs. the frontend prototype. The customer PDF always reflected the frontend-computed rounded total; `grand_total` reflected the backend exact total. |
| **Implementation** | `roundCustomerDisplay` moved from a local export in `CustomerEstimatePrint.tsx` to a shared export in `app-quote/src/lib/prototypeQuoteMath.ts`. `InternalEstimateApp` computes `customerDisplayTotal` (same formula as `CustomerEstimatePrint.finalRounded`) at save time and includes it in the save payload. `internalQuotesApi.js` stores it as `calculation_snapshot.internal_ui.customer_display_total` (additive JSON field, no schema migration). `quoteLibraryApi.js` reads it in `mapListRow` and the detail response via `pickSnapshotCustomerDisplayTotal`. `QuoteLibraryApp.tsx` uses `pickDisplayTotal(row)` = `customer_display_total ?? grand_total` in the list row and drawer stat card. The drawer label changes from "Total" to "Customer estimate total" when the new field is present. |
| **Backward compatibility** | `pickDisplayTotal` falls back to `grand_total` for older saved quotes that do not yet have `customer_display_total` in their snapshot. No old records are rewritten. Old quotes display unchanged until the estimator re-saves or saves a new revision. |
| **Internal exact math preserved** | `grand_total` and `calculation_snapshot.totals.retail` are unchanged and remain available for internal audit, pricing checks, and non-display uses. |
| **Scope limits** | Quote Library metrics/aggregates (`total_open_quote_value`, period buckets) still use `grand_total` for now — these are a separate KPI/reporting concern. Monday sync uses the same `grand_total` path it always has. No quote math rates, sq ft rounding, auth/permissions, status workflows, or public markup were changed. No SQL migrations were run. |
| **Impacted files** | `app-quote/src/lib/prototypeQuoteMath.ts` (add `roundCustomerDisplay` export), `app-internal-estimate/src/CustomerEstimatePrint.tsx` (import instead of local def), `app-internal-estimate/src/InternalEstimateApp.tsx` (add `customerDisplayTotal` useMemo + save payload), `backend-core/src/quotes/internalQuotesApi.js` (persist `customer_display_total` in snapshot), `backend-core/src/quotes/quoteLibraryApi.js` (expose in `mapListRow` and detail header), `app-quote-library/src/QuoteLibraryApp.tsx` (use `pickDisplayTotal`), `backend-core/src/scripts/verifyInternalEstimateMath.mjs` (new QA tests). |
| **Revisit trigger** | If Elite wants separate explicit reporting columns for internal exact total vs customer-facing quote value in the metrics aggregates and pipeline; or if Monday sync should also use the customer-facing total. |

---

## §35 — Sales KPI v1: read-only KPI rollup from existing Quote Library and Moraware data

| Field | Value |
|---|---|
| **Date** | 2026-05-27 |
| **Decision** | Add `GET /api/sales/kpi-v1` — a read-only, source-labeled, freshness-labeled, trust-labeled KPI rollup endpoint. Quote Library pipeline facts (count, customer-facing value, avg, period trend) come directly from `quote_headers`. Moraware production facts (worksheet sqft, job count, period trend) come from `sales_moraware_job_facts` via the same `fetchLatestPreparedSalesJobFacts` + `buildCompanyWideSqftActuals` functions already used by the Sales Dashboard foundation handler. The static `KpiHistoryScaffold` tab is replaced by the live `KpiV1Panel.tsx` component. No new SQL tables are created; no existing query patterns are changed. |
| **Quote value rule** | Quote value uses `calculation_snapshot.internal_ui.customer_display_total` (customer-facing estimated project total) when available; falls back to `grand_total` for older quotes without a CDT snapshot field. This matches the Quote Library display rule (§33). |
| **Moraware metrics** | Worksheet sqft and job count from `sales_moraware_job_facts`. Template count and installed sqft are not available in current prepared facts — returned as `null` with a `not_available_in_current_data` note, never faked. |
| **Partner Quote** | Shown as "Planned / Future" in the UI. No partner quote data is fetched or shown. |
| **Attribution guardrails** | `branch_rep_gated: true` and `protected_mapping_rules_enforced: true` are always set in the trust block. Company-wide totals are available; branch/rep splits remain gated by approved Sales Account Mapping. No hardcoded customer/account names appear in visible static Sales Dashboard copy. The Blackstone guardrail lives in backend attribution code and tests — not in visible dashboard copy. |
| **Historical workbook** | The Excel KPI workbook was inspected as reference only. No values were imported or hardcoded. A future controlled import pass is documented in `sales-kpi-history-plan.md §7`. |
| **No migrations run** | All data comes from existing tables. No SQL migrations were created or run. |
| **Security** | Same `requireAuth → requireRole(SALES_API_ROLES) → requireHeadAccess("sales")` chain as all Sales Head routes. No service role key in frontend. No browser-side Moraware calls. No secrets exposure. |
| **Impacted files** | `backend-core/src/sales/salesHead.js` (new handler + helpers + route), `app-sales/src/ui/KpiV1Panel.tsx` (new), `app-sales/src/ui/App.tsx` (render KpiV1Panel, remove Planning tab badge), `app-sales/src/ui/styles.css` (KPI v1 styles), `backend-core/src/scripts/verifySalesKpiV1.mjs` (34 tests), `docs/eliteos/sales-kpi-history-plan.md` (updated). |
| **Revisit trigger** | Landing `sales_kpi_snapshots` migration + writer; adding branch/rep split KPIs once mapping coverage is approved; Partner Quote head goes live; controlled historical workbook import pass. |

---

## §34 — Profile & Preferences v1: central user self-service surface in app-home

| Field | Value |
|---|---|
| **Date** | 2026-05-27 |
| **Decision** | Profile & Preferences v1 lives in app-home at `?view=profile`. Protected-head user menus link to this route. Safe user-owned UI preferences are persisted via `GET /api/me/preferences` + `PATCH /api/me/preferences` with a `user_preferences` table (additive, manual apply). Roles, head access, org assignment, and partner access remain exclusively in System Admin. |
| **Why** | Home is the central auth and launcher entry point. A single profile surface avoids duplicating preferences logic across every head. The self-service scope is strictly limited to UI preferences so no permission surface is opened. |
| **Routing** | No router in app-home. `view` React state initialized from `?view=profile` URL param. `history.pushState` keeps URL in sync. `popstate` handles browser back. |
| **Persistence** | Backend-first: `user_preferences` table (see `backend-core/supabase/eliteos_user_preferences_v1.sql`). Backend degrades gracefully if table not yet applied (returns defaults / no-op writes). Frontend falls back to `localStorage` key `eos_user_prefs_v1`. Once SQL is applied, DB becomes the source of truth transparently. |
| **Preferences v1** | `default_landing_head` (slug or null), `table_density` (comfortable/compact), `open_heads_in_new_tab` (boolean), `show_advanced_panels_default` (boolean). |
| **Profile fields** | All read-only in v1: full name, email, role, user type, workspace/org, account status, assigned tools. Display name editing requires a dedicated self-service PATCH on `user_profiles` — not yet built; documented here for the next pass. |
| **Security** | `requireAuth()` only on preference routes. User can only read/update their own row (enforced both by backend `user_id = req.user.id` and by RLS `auth.uid() = user_id`). Explicit allowlist of updatable keys. Role, org_id, head access, is_active, and any auth metadata are not writable through this API. |
| **What System Admin still owns** | Users, roles, org assignment, head access, invites, deactivate/reactivate, dealer/partner access, diagnostics. Profile & Preferences is not a replacement. |
| **Impacted files** | `app-home/src/ui/App.tsx`, `app-home/src/ui/ProfileView.tsx`, `app-home/src/ui/styles.css`, `backend-core/src/server.js`, `backend-core/supabase/eliteos_user_preferences_v1.sql`, `app-quote-library/src/QuoteLibraryApp.tsx`, `app-internal-estimate/src/InternalEstimateApp.tsx`, `app-pricing-admin/src/PricingAdminApp.tsx`, `app-system-admin/src/ui/App.tsx`, `app-sales/src/ui/App.tsx` |
| **SQL apply note** | `backend-core/supabase/eliteos_user_preferences_v1.sql` must be applied manually in Supabase before DB persistence is active. App degrades to localStorage-only until then. No data loss — localStorage values are written to DB on next save after table is applied. |
| **Revisit trigger** | Display name self-service edit (needs a safe `/api/me/profile` PATCH). Additional preference keys. Extracting shared `<UserMenu>` component across heads once convergence is planned. |

---

## §36 — 2026-05-27 eliteOS Stabilization Milestone

| Field | Value |
|---|---|
| **Date** | 2026-05-27 |
| **Decision** | The platform has reached a meaningful **internal-beta milestone** after a major build push (Home identity/org display, protected-head shell, Profile & Preferences v1, System Admin org/job title, Internal Estimate customer totals, Quote Library CDT, Sales Dashboard + KPI v1, Partner Quote hardening foundation, Moraware prepared facts). **Broad feature expansion pauses** temporarily in favor of a **Stabilization Phase** focused on smoke testing, bug fixing, deployment verification, SQL apply verification, and documentation cleanup. |
| **Milestone docs** | [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md) (formal checkpoint) · [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md) (operating rules and exit criteria). |
| **Active heads for smoke testing** | Home Launcher, System Admin, Internal Estimate, Quote Library, Pricing Admin, Sales Dashboard (plus Public Quote and internal Partner Quote pilot as applicable). |
| **Partner Quote** | Remains **internal / hardened pilot only**. Not external-production until RLS, leakage verification (`verifyPartnerQuoteLeakage.mjs`), and security review are green. |
| **Intentionally deferred until stabilization exit** | Quote Library detail dialog refactor; Sales KPI v1.1; historical KPI workbook import; Partner Quote external rollout; new production heads; SaaS/multi-tenant packaging; large monolith refactors. |
| **Allowed during stabilization** | Blocker/regression fixes and small one-file polish; Auto for tiny fixes; Sonnet/Opus for P0 or reset; smoke tests and docs; no new major heads. |
| **Revisit trigger** | Stabilization exit criteria met (see stabilization plan); team selects **one** next major build. |

---

### 37. Moraware Report Feeds as additive prepared-facts ingestion lane

| Field | Value |
|-------|--------|
| **Date** | 2026-05-27 |
| **Decision** | Moraware saved report CSV + rendered HTML identity extraction may be used as an **additive ingestion lane beside the existing Moraware API sync**. Report feeds are treated as versioned integration contracts, imported through raw runs, validated, enriched with IDs, and promoted to prepared facts **only after success**. Failed imports must **not** replace the latest successful prepared facts. |
| **Why** | The API/SDK sync gives structured operational data, but saved reports expose business-friendly report columns and HTML links expose stable job/account IDs. Combining both gives faster trustable facts for Sales Worksheet and future operational heads without forcing a fragile one-off scrape. |
| **Impacted files/docs** | `backend-core/supabase/eliteos_moraware_report_feeds.sql`, `backend-core/src/moraware/reportFeeds/*`, `backend-core/src/scripts/moraware/importReportFeedPoc.js`, `backend-core/test/fixtures/moraware-report-feeds/*`, `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/SYSTEM_BLUEPRINT.md`, `package.json` |
| **Revisit trigger** | Before live Moraware download automation, before dashboards read prepared report facts, before external tenant/SaaS Moraware reuse, or before enabling writes to Supabase from report-feed imports. |

---

### 38. Moraware report-feed SQL apply-readiness corrections

| Field | Value |
|-------|--------|
| **Date** | 2026-05-30 |
| **Decision** | Before manual Supabase apply, correct prepared-fact supersede semantics: replace the `(…, is_active)` table unique constraint with a **partial unique index** on active rows only; add **`superseded_by`** self-reference; use **`ON DELETE RESTRICT`** on prepared facts → report runs so promoted facts are not cascade-deleted with staging run cleanup. Document deferred RLS and manual apply steps. |
| **Why** | The original unique constraint allowed only one inactive row per `row_hash` (blocking promotion history) and cascade delete on runs could wipe promoted facts. These fixes align with “supersede, don’t blindly delete” promotion semantics. |
| **Impacted files/docs** | `backend-core/supabase/eliteos_moraware_report_feeds.sql`, `docs/eliteos/moraware-report-feeds.md` |
| **Revisit trigger** | After first manual SQL apply in Supabase; before promotion job or dashboard reads. |

---

### 39. Moraware report-feed governed download v1 contract

| Field | Value |
|-------|--------|
| **Date** | 2026-05-30 |
| **Decision** | Governed Moraware report download (when implemented) must return **`csvText` + `htmlText` + `metadata`** and feed the **existing** `processReportFeedLocal` → staging persistence → optional promotion path — **no** second parser, promotion path, or dashboard shortcut. Credentials must be **org-scoped and backend-only** (never frontend/repo/fixtures); report-feed credentials should stay **separate from API/SDK credentials** if session behavior differs. **v1 is manual CLI/script only** — no cron, API routes, or headless browser unless separately approved. Failures (`auth_failed`, `report_not_found`, `empty_export`, `timeout`, `schema_drift`, `identity_ambiguous`) must land in **`failed` / `needs_review`** runs and **must not** supersede active prepared facts. Raw CSV/HTML retention (ephemeral vs Supabase Storage) remains **open** until storage is explicitly approved. |
| **Why** | Local-file lane is validated; the next slice needs a safe fetch contract that reuses proven parse/enrich/promote logic without duplicating ingestion or risking silent prepared-fact corruption. |
| **Impacted files/docs** | `docs/eliteos/moraware-report-feeds.md` (§ Governed download design), `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md`, future `fetchReportFeedArtifacts` module + CLI script |
| **Revisit trigger** | After Moraware login-mechanics spike; before credential table design; before cron/API routes; before raw artifact storage in Supabase; before headless browser approach. |

---

### 40. Sales Worksheet Facts — Option B real Moraware export shape; Branch deferred

| Field | Value |
|-------|--------|
| **Date** | 2026-05-30 |
| **Decision** | eliteOS accepts the **real Moraware view 219 export shape** (initially scoped to 16 columns; confirmed at **76 columns** via live run `cb765461`, 2026-05-30) and normalizes it into prepared facts — **Option B**. The simplified 10-column fixture (`Color`, `Room`, `Branch`, …) is retired. **Branch/location is not required** in the Sales Worksheet Facts contract for v1: it is not present in the real export and `branch_or_process` will always be `null` until derived through Account Mapping / Identity Enrichment. `computeReportRowHash` now includes worksheet-line discriminators (`formName`, `room`, `color`, `totalWorksheetSqft`) so two worksheet lines for the same job produce distinct hashes. Expected column hash updated to `8e12bfb52b516ac30aa94e85d7bf92ee9c6d47741b2967586b743954136b9ade` (76-column full contract). Prior 16-column hash `71d40fbb…` is retired. |
| **Why** | Forcing Moraware to match simplified columns would require view reconfiguration and break the real export's natural worksheet-line granularity. Normalizing the real shape keeps the integration contract stable and enables worksheet-level analytics without a second parser. Excluding Branch avoids hardcoding a column that Moraware may not expose in every organization's report view. |
| **Impacted files/docs** | `backend-core/src/moraware/reportFeeds/constants.js`, `enrichReportRows.js`, `hashUtils.js`, `profileColumns.js`, `reportFeedParser.test.mjs`, `reportFeedPersistence.test.mjs`, `reportFeedPromotePersistence.test.mjs`, `promoteSalesWorksheetFacts.test.mjs`, `backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-facts.sample.csv`, `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before Account Mapping head derives `branch_or_process`; before adding Edge/Thickness/BackSplash as typed prepared-fact columns; before supporting additional worksheet-type feeds that share similar column structure. |

---

### 41. Sales Worksheet Facts — 76-column full contract, identity-link dedup, error serialization hardening

| Field | Value |
|-------|--------|
| **Date** | 2026-05-30 |
| **Decision** | After the first real Elite staging run (`cb765461`) failed with schema drift (16-col hash vs real 76-col export) and a `duplicate key value violates unique constraint "moraware_report_identity_links_report_run_id_match_key_key"` error, the following hardening decisions were made: (1) `SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS` expanded to all 76 real columns — columns 1–15 and column 76 map to prepared facts; columns 16–75 (activity/CS/install status) stored in `raw_row` only for v1. (2) `buildIdentityLinkInserts` deduplicates by `match_key` before insert: same key + same IDs → 1 row `is_ambiguous=false`; same key + different IDs → 1 row `is_ambiguous=true`. This prevents the unique-constraint violation caused by the HTML report repeating the same account+job link once per worksheet line. (3) Supabase/PostgREST error objects (plain objects with `message/code/details/hint` but no `.stack`) are now wrapped in a proper `Error` in `batchInsert` and direct-throw paths; `buildRunFinalUpdate` uses `formatSupabaseError`; `persistReportFeedLocal.js` CLI catch uses `formatCliError`. This prevents `FATAL: [object Object]` in CLI output. |
| **Why** | Real Moraware view 219 has 76 columns, not 16. The additional columns are operational activity/scheduling data that is useful for future analytics but does not belong in v1 prepared facts. Identity-link dedup is required because Moraware HTML reports list each account+job link once per worksheet row, not once per job. Error wrapping is required for operator debuggability during staging runs. |
| **Impacted files/docs** | `constants.js`, `reportFeedPersistence.js`, `persistReportFeedLocal.js`, `sales-worksheet-facts.sample.csv`, `reportFeedParser.test.mjs`, `reportFeedPersistence.test.mjs`, `moraware-report-feeds.md`, `CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before mapping any activity/CS/install columns to typed prepared-fact fields; before supporting a different org whose view 219 export has a different column count. |

---

### 42. HTML identity enrichment is best-effort; view 219 HTML report is paginated

| Field | Value |
|-------|--------|
| **Date** | 2026-05-30 |
| **Decision** | The saved Moraware view 219 HTML report (`/sys/report/?view=219`) is **paginated/limited** — it returns only 22 unique `/sys/job/` links and 4 unique `/sys/account/` links regardless of whether an `AllPages` variant is requested. The CSV export for the same view returns 6,986 rows. **HTML identity enrichment is therefore best-effort in v1**: most CSV rows will have `identity_status = needs_identity_review`. This is not an error condition. Unmatched rows are always persisted. Duplicate HTML match keys are deduplicated before insert (see entry 41). Full `account_id` + `job_id` coverage will come from a separately approved slice using one of: (A) true all-pages HTML discovery, (B) existing Moraware API/SDK mirror as identity lookup, or (C) Account Mapping / Identity Enrichment head. The current slice does **not** attempt to solve HTML pagination. |
| **Why** | Moraware's report renderer paginates HTML by default. Attempting to scrape all pages in the current slice would require browser automation or session-cookie work that is explicitly out of scope. The prepared-fact pipeline is still useful even with partial identity: raw rows persist, sqft data is captured, and identity can be backfilled later. |
| **Impacted files/docs** | `docs/eliteos/moraware-report-feeds.md` § Identity enrichment strategy, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | When choosing a full identity coverage path (true all-pages HTML, API mirror, or Account Mapping). |

---

### 43. API mirror identity enrichment — exact match, dry-run default, brain_moraware_jobs as source

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | A post-hoc identity enrichment pass (`enrichRunFromApiMirror`) uses `brain_moraware_jobs` as the primary full-coverage identity source after initial staging. Matching rules for v1: (1) exact normalized `account_name + job_name` match only via `makeIdentityMatchKey()` — which strips location prefixes (e.g. "North Branch - "), lowercases, and removes punctuation; (2) no fuzzy matching, no account-name-only matching, no guessing; (3) only rows with `identity_status = "needs_identity_review"` are eligible — existing `matched` and `ambiguous_identity` rows are never downgraded; (4) duplicate key in `brain_moraware_jobs` with same IDs → harmless; (5) duplicate key with different IDs → `ambiguous_identity` for all matching CSV rows. Default mode is **dry-run** (no writes) — operator must explicitly pass `--apply` with `SUPABASE_WRITE_ENABLED=1`. Promotion remains a separate step and is not triggered by enrichment. |
| **Why** | HTML-only identity coverage is too sparse (22 job links vs ~7,000 CSV rows) due to Moraware HTML pagination. `brain_moraware_jobs` is populated by the existing Moraware API sync and provides full job coverage for the organization. Exact match is safe and deterministic; fuzzy matching is deferred until there is a reviewed false-positive rate. Dry-run default prevents accidental mass-updates in production. |
| **Impacted files** | `buildApiMirrorIdentityMap.js`, `planApiMirrorEnrichment.js`, `enrichRunFromApiMirror.js`, `enrichReportRunFromApiMirror.js` (CLI), `apiMirrorEnrichment.test.mjs`, `package.json`, `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before adding fuzzy matching or account-name-only fallback; before supporting a different identity source for a different report type; if `brain_moraware_jobs` schema changes. |

---

### 44. Matched-only promotion — ambiguous rows excluded, unmatched blocks, dry-run default

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | A new persisted-run promotion path (`promotePersistedRunMatchedFacts`) reads from `moraware_report_raw_rows` (post-enrichment DB state) rather than from an in-memory `processResult`. Promotion policy for v1: (1) **schema drift blocks** — if `schema_drift.detected = true`, refuse; (2) **unmatched rows block** — if `unmatched_identity_count > 0`, refuse (unmatched rows have no `account_id`/`job_id`; null-ID facts corrupt analytics); (3) **ambiguous rows block unless `--matched-only`** — if `ambiguous_identity_count > 0` and the caller has not passed `--matched-only`, refuse; (4) **matched-only excludes ambiguous** — in matched-only mode, only `identity_status = "matched"` rows are promoted; `ambiguous_identity` rows are never promoted, never guessed, and not altered by this step; (5) **run status** — if matched-only and ambiguous rows remain, status stays at its current value (e.g. `needs_review`); if all rows matched cleanly, status is updated to `"promoted"`; (6) **run summary** — a `promotions[]` entry is appended to `moraware_report_runs.summary` recording `mode`, counts, and timestamp; (7) **default dry-run** — pass `--apply --matched-only` with `SUPABASE_WRITE_ENABLED=1` to write; (8) **promotion is never automatic** — no cron, no triggered promotion; operator decision only. Supersede semantics (deactivate → insert → backfill) and rollback-on-insert-failure are preserved from the existing `promoteReportFeedFacts` path. Batched deactivations and inserts (≤500 per query) are used for efficiency at real-run scale (~7,000 rows). |
| **Why** | After post-hoc API mirror enrichment, the prepared-fact promotion must read from the persisted DB state, not from in-memory enrichedRows. Blocking on unmatched rows prevents polluting prepared facts with null-ID rows. Allowing matched-only promotion while excluding ambiguous rows means the 6,957 clearly matched rows for the real Elite run can be safely promoted without waiting for manual resolution of 29 ambiguous rows. Dry-run default is consistent with the enrichment step. |
| **Impacted files** | `promotePersistedRunMatchedFacts.js`, `promoteReportRunMatchedFacts.js` (CLI), `promotePersistedRunMatchedFacts.test.mjs`, `package.json`, `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before adding a "resolve ambiguous" workflow; before supporting bulk re-promotion after manual identity correction; before dashboards begin reading `moraware_prepared_sales_worksheet_facts`. |

---

