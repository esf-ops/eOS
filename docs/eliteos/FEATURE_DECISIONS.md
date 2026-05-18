# eliteOS Feature Decision Log

**Purpose:** Short, dated decisions so **non-technical stakeholders** and **future engineers** understand **why** the system behaves a certain way without reading the entire git history.

**How to add a row:** Append a new `### N. Title` block with Date, Decision, Why, Impacted files/docs, Revisit trigger.

---

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
| **Decision** | Internal estimates allocate **`ESF-{BRANCH}-{NNNNNN}`** bases via Supabase **`quote_allocate_esf_sequence`** (`eliteos_internal_quote_phase2.sql`); revisions **`quote_number`** add **`-R{n}`** while **`quote_number_base`** stays stable. Saves default **`update_existing`** when `quote_id` is posted without `save_mode`; **`save_revision`** inserts a new **`quote_headers`** row with frozen **`calculation_snapshot`**. Quote Library lists **latest revision + non-archived** by default; **`POST /api/quote-library/quotes/:id/archive`** soft-archives (`archived_at`). Monday internal sync adds optional **`MONDAY_INTERNAL_COL_REVISION`** / **`MONDAY_INTERNAL_COL_LAST_REVISED`** and updates existing pulses when **`monday_item_id`** exists and sync **`action`** is **`update`**. |
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
