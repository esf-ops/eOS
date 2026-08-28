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
| **Decision** | **Room drafts** persist in `internal_ui.estimate_room_drafts` (add-ons, tear, FHB, catalog color id, guided layout preset) with API `estimate_rooms` still used for Calculate. **Material use tax** is a fixed **2%** Internal Estimate policy on **countertop and backsplash/FHB material** via `resolveInternalEstimateMaterialTaxPolicy()` — folded into customer material $ (not a separate PDF line); **add-ons, custom lines, labor, fees, and credits excluded**; **2026 Vanity Program fixed prices excluded**. Legacy per-room `useTaxMode` / project `use_tax_percent` (0/2/5/custom) are **retired from the UI**; saved snapshots hydrate safely and recalculate at 2%. **2026 Vanity Program** is an isolated module (`vanityProgram2026`) with kitchen ≥35 sf / &lt;35 sf tiers, sink upgrades, extra trips; customer vanity display rounds to **nearest $5** (stone rooms stay **$10**). **L/U guided shapes** subtract **corner overlap** (default 25.5″). **Internal-only custom lines** fold into customer material; names never print. **Color TBD** → `internal_ui.color_tbd`. **Customer room/area cost breakdown** snapshotted as `internal_ui.customer_room_area_breakdown`. |
| **Why** | Beta testers reported lost room add-ons/colors on reload, over-counted L/U sf, need Lisbon-style use tax, and internal fee lines leaking to customer PDFs. |
| **Impacted files/docs** | `app-quote/src/lib/measurementEngine.ts`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-internal-estimate/`, `backend-core/src/quotes/quoteCalculator.js`, `scripts/verify-internal-estimate-beta-fixes.ts`, `docs/quote-platform/internal-quote-test-plan.md`. |
| **Revisit trigger** | Per-branch use-tax rules in admin; itemized use-tax on customer PDF; backend room engine parity for all FHB edge cases. |

---

### Supplement — Internal Estimate material use tax normalization (2026-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-16 |
| **Decision** | Internal Estimate uses a **fixed 2% material use tax** on **countertop and backsplash/FHB material** via `resolveInternalEstimateMaterialTaxPolicy()` / `internalEstimateMaterialTaxPolicy`. **Excluded:** add-ons, cutouts, custom lines, labor, fees, credits, **2026 Vanity Program fixed prices**. Estimator **0 / 2 / 5 / custom % selector removed**; snapshot stores `material_use_tax` split amounts. Shared `prototypeQuoteMath` paths gate on `internalMaterialUseTax` / `InternalMeasureOptions` so **Public/Partner Quote are unchanged**. |
| **Why** | Product direction (Eric/Hunter): normalize tax before Out-of-Collection pricing; backsplash material must receive the same 2% as countertop. |
| **Impacted files/docs** | `app-quote/src/lib/internalEstimateMaterialTaxPolicy.ts`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-internal-estimate/`, `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/scripts/verifyInternalEstimateMath.mjs`, `scripts/verify-internal-estimate-beta-fixes.ts`. |
| **Follow-up backlog** | (1) ~~Vanity quote Group A–F display cleanup~~ **shipped 2026-06** — see supplement below. (2) ~~Side splash UI under backsplash (Qty 1 / Qty 2)~~ **shipped 2026-06** — see supplement below. (3) Customer PDF redesign (cleaner multi-top summary). (4) ~~Out-of-Collection material program premium~~ **shipped 2026-06** — see supplement below. (5) Pricing Admin ownership of material use tax policy and OOC premium rates. |
| **Revisit trigger** | Branch-specific tax rates; customer-facing tax line item; side splash as first-class scope. |

---

### Supplement — Internal Estimate Out-of-Collection material program (2026-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-16 |
| **Decision** | Internal Estimate supports **Out-of-Collection** as a **material program** (separate from Pricing Mode). **Quote default** `materialProgramDefault` (`elite_100` \| `out_of_collection`) plus **room override** `materialProgramOverride` (`inherit` \| `elite_100` \| `out_of_collection`). **Price group** remains `room.materialGroup` (Promo, A–F; Remnant rejected for OOC). **Premium** via `resolveOutOfCollectionPricingPolicy()`: **10% wholesale**, **15% direct/retail**, applied **after** fixed **2% material use tax** on **countertop + backsplash/FHB material** only. Excludes add-ons, cutouts, custom lines, labor, fees, credits, vanity program fixed pricing. Customer PDF folds premium into material $ — no +10%/+15%/markup/premium/formula language. Snapshot stores policy + per-room premium in `internal_estimate_math.out_of_collection`. Public/Partner/Custom Quote unchanged. |
| **Why** | Eric-approved simple OOC model: comparable Elite 100 group + fixed premium by pricing mode; estimators assign outside color to a comparable group. |
| **Impacted files/docs** | `app-quote/src/lib/internalEstimateMaterialProgram.ts`, `internalEstimateOutOfCollectionPolicy.ts`, `prototypeQuoteMath.ts`, `app-internal-estimate/`, `backend-core/src/quotes/quoteCalculator.js`, `scripts/verify-internal-estimate-beta-fixes.ts`, `backend-core/src/scripts/verifyInternalEstimateMath.mjs`. |
| **Revisit trigger** | Pricing Admin ownership of OOC premium rates; customer-facing OOC line item on PDF. |

---

### Supplement — Internal Estimate vanity program mode + side splash quantity (2026-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-23 |
| **Decision** | Vanity rooms explicitly choose **2026 Vanity Program** (fixed sheet pricing) vs **Standard countertop pricing** (normal material group / square-foot logic). In program mode, price group and color are **display/selection** fields — Group A–F $/sf does not drive the program total. **Side splash** uses quantity **None / Qty 1 / Qty 2** on `vanity.sideSplashQty`, priced as **4″ × vanity depth** backsplash material at the room group rate (chargeable sf + 2% material use tax on internal quotes). Legacy `sideSplash` / `hasSideSplash` / count fields normalize to `sideSplashQty` on hydrate without double counting. Customer PDF shows program fixed display total on the material line; side splash appears only as a named addon when selected. No customer-facing $/sf, markup, or tax formula language. |
| **Why** | Estimators confused Group A–F controls with vanity program fixed pricing; side splash entry was ambiguous. |
| **Impacted files/docs** | `app-quote/src/lib/vanitySideSplash.ts`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-quote/src/ui/RoomScopeBuilder.tsx`, `app-internal-estimate/` (display model unchanged path), `backend-core/src/quotes/vanitySideSplash.js`, `backend-core/src/quotes/quoteCalculator.js`, `scripts/verify-internal-estimate-beta-fixes.ts`. |
| **Revisit trigger** | Pricing Admin ownership of side splash dimensions/rates; itemized side splash on customer PDF scope table. |

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
| **Decision** | The **"Estimated project total"** on the customer-facing Internal Estimate PDF equals the arithmetic sum of each individually-rounded visible Estimate Summary row, not a second rounding of the exact internal grand total. Each row rounds to the nearest $5 first; total = sum of those rounded rows. |
| **Why** | Elite's sales process rounds each customer-facing line item before presenting it to the customer. The displayed total must reconcile with the visible rows: rounding the raw exact aggregate once can produce a total lower than the sum of the already-rounded rows. Example: rows display $970 + $140 + $100 + $90 = $1,300; the pre-fix code showed $1,290. |
| **Impacted files** | `app-internal-estimate/src/CustomerEstimatePrint.tsx` — `finalRounded` now computed as `summaryCounterDisplay + summaryBacksplashDisplay + summaryAddonsDisplay + summaryVisibleLinesDisplay`. Room / Area Cost Breakdown continues to reconcile to this total via `allocateCustomerDisplayFives`. `props.estimateTotalExact` preserved for internal audit. |
| **Revisit trigger** | Elite changes customer-display rounding granularity (e.g. nearest $1, exact dollars), or decides the PDF total should reflect the raw exact total rather than the sum of rounded rows. |

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
| **Why** | `grand_total` stores `round2(calc.totals.retail)`, the exact backend calculation result. The customer PDF shows a different number: each visible Estimate Summary row (countertop material, backsplash material, add-ons, customer-facing custom lines) rounds up independently to the nearest $5, and the displayed total is the sum of those rounded rows. Sales, billing, and future KPI quote pipeline reporting must reference the number the customer actually sees, not an internal precision artifact. |
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

### 47. View 220 row_hash collision fix — two-tier hash with full-row extra discriminators

| Field | Value |
|-------|-------|
| **Date** | 2026-05-31 |
| **Decision** | After staging real view 220 data (run `655eed33`, 22,899 rows), 12 hash collision groups were detected: rows with identical values in the 10 base hash fields (account, job, date, form, room, color, sqft) but differing in detail columns (Edge, Thickness, Sink Type, Faucet Type, etc.). The fix introduces a **two-tier hash** for `sales_worksheet_history_facts`: (1) **Base hash** — unchanged, computed from the same 10 fields used by view 219. (2) **Extra discriminators** — appended only for `sales_worksheet_history_facts` via `buildExtraDiscriminators(row, reportType)`, which returns all raw row column values sorted by column name. The final hash is `sha256(baseHash + "|||" + extraDiscriminators.join("||"))`. View 219 (`sales_worksheet_facts`) never provides `extraDiscriminators` → its hashes are **completely unchanged** (backward-compatible). The distinction is implemented in `hashUtils.js` (`computeReportRowHash` accepts optional `extraDiscriminators`) and `enrichReportRows.js` (`buildExtraDiscriminators` returns `null` for non-view-220 types). No DB migration needed; the fix applies at staging time — the old run `655eed33` must be re-staged from the same CSV to get corrected hashes before promotion. |
| **Why** | View 220 has 34 columns including many worksheet detail fields (Edge, Thickness, multiple Sink/Faucet/Stove fields, shop comments, etc.) that are absent from view 219's base hash. Two worksheet rows for the same job that differ only in edge profile or sink configuration share all 10 base fields and thus hash identically, which would violate the `(organization_id, report_feed_id, row_hash) WHERE is_active = true` partial unique index at promotion time. Using `row_number` as a tiebreaker was rejected as unstable across re-exports. Including all 34 column values (sorted by name for determinism) is robust and handles any future column additions automatically. |
| **Impacted files** | `backend-core/src/moraware/reportFeeds/hashUtils.js`, `backend-core/src/moraware/reportFeeds/enrichReportRows.js`, `backend-core/src/moraware/reportFeeds/processReportFeed.js` (re-export), `backend-core/src/scripts/moraware/promoteReportRunMatchedFacts.js` (CLI output improvement), `backend-core/src/moraware/reportFeeds/reportFeedParser.test.mjs` (4 new regression tests), `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | If Moraware ever exports a view-220-style report with legitimately duplicate rows (all 34 columns identical) — the hash would correctly deduplicate them, and the duplicate detection logic in `enrichReportRowsWithIdentity` would mark the second row `ambiguous_identity`. Revisit if a new report type requires the same full-row hash treatment. |

---

### 46. Name-only promotion — view 220 only, null IDs allowed, run status stays needs_review

| Field | Value |
|-------|-------|
| **Date** | 2026-05-31 |
| **Decision** | A new `--allow-name-only` flag is added to `promoteReportRunMatchedFacts` (CLI) and `promotePersistedRunMatchedFacts` (module). When set, it promotes both `identity_status = "matched"` rows (with `job_id`/`account_id`) AND `identity_status = "needs_identity_review"` rows (name-only, null `job_id`/`account_id`) to `moraware_prepared_sales_worksheet_facts`. Behavior: (1) **Permitted only for `report_type = sales_worksheet_history_facts`** — the orchestrator loads the feed row from `moraware_report_feeds` and validates `report_type`; passing `--allow-name-only` for a view 219 feed returns `name_only_not_allowed_for_report_type` and blocks. (2) **Ambiguous rows are always excluded** — `--allow-name-only` inherently bypasses both the unmatched gate and the ambiguous gate (ambiguous rows are excluded by design, not promoted). (3) **Schema drift still blocks** — no override. (4) **`identity_status` is preserved** in the prepared fact — name-only facts have `identity_status = "needs_identity_review"` and null IDs. (5) **Run status stays `needs_review`** whenever any name-only rows are promoted, because identity is partial. The run never reaches `"promoted"` while name-only facts exist. (6) **Run summary** appends `mode = "name_only"`, `nameOnlyRowCount`, a `warning` string, and `unmatchedExcluded = 0` (since unmatched rows are included, not excluded). (7) **Dry-run default** — `--apply` required; `SUPABASE_WRITE_ENABLED=1` required. The rationale for allowing name-only for view 220: the historical worksheet export is the source of truth for YoY analytics (account_name, job_name, sqft, stone, salesperson). Blocking promotion because the API mirror doesn't have IDs for historical jobs would prevent the YoY dashboard from receiving its primary data. The dashboard aggregates by `account_name`/`job_salesperson`/`stone`/`room`, not by `job_id`, so null IDs are acceptable. View 219 (current-year) is not affected — it retains the unmatched-blocks policy. |
| **Why** | The API mirror only contains current/recent jobs; historical worksheet rows (pre-dating the API sync) will never match. Blocking on unmatched rows for view 220 would permanently prevent YoY analytics from being populated. Name-only prepared facts are useful for YoY totals (sum by salesperson, stone, period). Dashboard queries already require `report_feed_id` scoping per Entry 45 — adding a null-ID handling note is a natural extension. |
| **Impacted files** | `backend-core/src/moraware/reportFeeds/promotePersistedRunMatchedFacts.js`, `backend-core/src/scripts/moraware/promoteReportRunMatchedFacts.js`, `backend-core/src/moraware/reportFeeds/promotePersistedRunMatchedFacts.test.mjs`, `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before wiring a YoY dashboard — ensure `WHERE report_feed_id = <v220-feed-id>` and `null` ID handling are documented in dashboard query specs; before adding fuzzy identity matching that could retroactively match historical name-only rows; before supporting name-only mode for any other report type. |

---

### 45. View 220 Sales Worksheet History Facts — separate feed, shared prepared table, report_feed_id scoping required

| Field | Value |
|-------|-------|
| **Date** | 2026-05-31 |
| **Decision** | Moraware view 220 ("Sales YoY report") is ingested as a **separate feed** with `report_type = "sales_worksheet_history_facts"` (not as a variant of view 219). Facts are stored in the **same `moraware_prepared_sales_worksheet_facts` table** as view 219, scoped by `report_feed_id`. No new prepared table is created. **Dashboard queries MUST always include a `report_feed_id` filter** — without it, view 219 and view 220 rows for the same underlying worksheet line are double-counted. Row hashes are naturally isolated: `reportType` is part of `computeReportRowHash`, so view 219 (`sales_worksheet_facts`) and view 220 (`sales_worksheet_history_facts`) rows for the same job+line produce **different** hashes. `Job Status` is absent from view 220; `job_status` will be `null` in promoted prepared facts from this feed. All existing pipeline modules (parsing, staging, API mirror enrichment, ambiguity review, matched-only promotion) reuse without modification. No DB migration required. |
| **Why** | A separate `report_type` + `report_feed_id` provides clear data lineage, prevents cross-feed supersede collisions, and allows view 220 to be ingested with a different date window (historical) than view 219 (current-year). A new prepared table would duplicate schema, complicate dashboard joins, and offer no isolation benefit beyond what `report_feed_id` already provides. Naming the type `sales_worksheet_history_facts` (not `sales_worksheet_yoy_facts`) keeps the contract at the ingestion-data level — YoY is a dashboard calculation, not an ingestion distinction. |
| **Impacted files** | `backend-core/src/moraware/reportFeeds/constants.js` (new constants), `processReportFeed.js` (new exports), `reportFeedParser.test.mjs` (new tests), `backend-core/test/fixtures/moraware-report-feeds/sales-worksheet-history-facts.sample.csv` (new fixture), `backend-core/supabase/eliteos_moraware_report_feeds.sql` (commented INSERT), `docs/eliteos/moraware-report-feeds.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before wiring any dashboard that reads both view 219 and view 220 facts (ensure `report_feed_id` filter is enforced); before adding typed prepared-fact columns for sink/faucet/stove/shop/worksite fields; before supporting a second organization's view 220 feed. |

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

### 48. AI Takeoff foundation — contract-first architecture, AI is not pricing authority

| Field | Value |
|-------|--------|
| **Date** | 2026-06-01 |
| **Decision** | AI Takeoff is implemented as a **pure contract layer** under `backend-core/src/takeoff/` before any UI, AI API calls, or Internal Estimate wiring. The contract defines a versioned JSON schema (`TakeoffResult`, schema v1.0) for AI- or manually-produced takeoff results. All square footage is **recomputed deterministically** from raw dimensions (`lengthIn`, `depthIn`) by `takeoffMeasurementCalc.mjs` — AI-provided totals are stored for audit and compared but **never used for pricing or chargeable sf**. A pure validator (`takeoffValidator.mjs`) returns structured diagnostics (error / warning / info) before any import is allowed. A pure import planner (`takeoffImportPlanner.mjs`) maps approved results to `RoomScopeBuilder`-compatible `GuidedShapeGroup` drafts without mutating quote state. AI Takeoff will be a **separate head** (`app-ai-takeoff/`) from Internal Estimate; it feeds into Internal Estimate via a future "Import from Takeoff" action but does not change Internal Estimate beta behavior today. |
| **Why** | AI must not become the final pricing authority — eliteOS owns measurement math. Contract-first ensures the schema is stable before AI extraction, UI, and import are wired. A separate head keeps AI Takeoff experimentally isolated from Internal Estimate beta. Pure functions (no I/O, no side effects) allow deterministic testing without Supabase or API dependencies. |
| **Impacted files** | `backend-core/src/takeoff/takeoffContract.mjs`, `takeoffMeasurementCalc.mjs`, `takeoffValidator.mjs`, `takeoffImportPlanner.mjs`, `takeoff.contract.test.mjs`, `fixtures/spec73.fixture.mjs`, `package.json` (new `eos:test:takeoff-contract` script), `docs/eliteos/ai-takeoff-foundation.md` |
| **Revisit trigger** | Before wiring a real AI call to produce `TakeoffResult` drafts; before adding the `app-ai-takeoff/` head; before adding "Import from Takeoff" to Internal Estimate; before supporting multi-room or multi-page plans; before adding Supabase persistence for takeoff jobs/results. |

---

### 49. Quote files storage architecture — object storage for quote-attached files, Postgres for metadata

| Field | Value |
|-------|--------|
| **Date** | 2026-06-01 |
| **Decision** | All quote-related file bytes (cabinet plans, measurement plans, photos, signed approvals, customer PDFs) live in **Supabase Storage** (private bucket `eliteos-quote-files`), never in Postgres rows. Postgres (`quote_files` table) tracks metadata, ownership, quote linkage, takeoff linkage, and lifecycle only. `quote_files` is a **general-purpose attachment table for Internal Estimate and all quote types** — AI Takeoff (`takeoff_jobs` / `takeoff_results`) is an **optional processing layer** on top; most files will never run through AI Takeoff. A file may exist without a quote (pre-quote upload) and without a takeoff job. `quote_id` references `quote_headers.id` for all quote source types; `quote_headers.quote_source` distinguishes `internal_quote` / `partner_quote` / `public_consumer`. The existing `quote_takeoff_jobs.quote_id` NOT NULL constraint is relaxed to nullable (additive, backward-safe) to allow pre-quote takeoff flows. All downloads are mediated by short-lived signed URLs (backend-generated); `storage_path` is never exposed to untrusted clients. A `storage_provider` field allows future migration to Cloudflare R2 or AWS S3 without schema change. |
| **Why** | Binary blobs in Postgres waste row storage and slow queries. Signed URLs allow fine-grained access control without complex RLS on bytes. General-purpose `quote_files` avoids duplicating attachment infrastructure for each feature. Separating quote linkage from takeoff linkage means most Internal Estimate usage (attach a cabinet plan, a photo, a signed approval) requires zero AI involvement. Pre-quote file uploads are required for the AI Takeoff Lab flow (upload plan before creating the quote). |
| **Impacted files** | `backend-core/supabase/eliteos_quote_files_takeoff_storage.sql` (SQL draft — not applied), `backend-core/src/files/quoteFileStoragePath.mjs`, `backend-core/src/files/quoteFileStoragePath.test.mjs`, `package.json` (`eos:test:quote-file-storage`), `docs/eliteos/quote-files-storage.md`, `docs/eliteos/ai-takeoff-foundation.md` |
| **Revisit trigger** | Before applying SQL to Supabase; before creating the storage bucket; before building any upload UI; before implementing signed URL generation; before wiring Moraware file handoff; before implementing RLS policies for `quote_files`. |

---

### 50. AI Takeoff Lab v5 — provider-neutral extraction layer, AI output never authoritative, raw PDFs not committed

| Field | Value |
|-------|--------|
| **Date** | 2026-06-01 |
| **Decision** | Three durable decisions introduced by AI Takeoff Lab v5 live extraction: **(1) Provider-neutral AI extraction layer.** AI extraction is isolated behind a provider interface (`takeoffAiProvider.mjs` / `openAiTakeoffProvider.mjs`). The interface is: `extractTakeoffFromFile({ fileBuffer, mimeType, originalFilename, promptVersion, modelName, apiKey }) → { rawText, parsed, parseError, modelUsed, usage }`. Switching from OpenAI to Gemini or Claude requires adding a single provider file and a new case in `getExtractionProvider()`. Controlled by env vars: `TAKEOFF_AI_PROVIDER`, `TAKEOFF_AI_MODEL`, `OPENAI_API_KEY`, `TAKEOFF_AI_ENABLED=1`. **(2) AI output is never authoritative for pricing.** `review_status` is always set to `"needs_review"` by the extraction endpoint — the server never auto-approves. Raw AI response is stored in `raw_ai_result_json` for audit; normalized result is recomputed by `computeTakeoffMeasurements()` server-side; `aiProvidedTotals` is preserved for reference/comparison only; validator (`validateTakeoffResult`) flags any AI total vs. computed total discrepancy > 0.05 sf. The Internal Estimate import button remains disabled — AI extraction does not enable import. **(3) Raw customer PDFs are not committed to the repo.** Real cabinet plan PDFs, measurement sketches, and customer documents are used only as private manual QA / benchmarking inputs and are never added as test fixtures. Tests use sanitized synthetic data (spec73 fixture, minimal in-memory blobs). Real files live in private Supabase Storage only. Prompt version (`PROMPT_VERSION = "v1"`) is stored in `quote_takeoff_jobs.result_summary.promptVersion` for audit — bump when rules or schema guidance changes. |
| **Why** | Provider-neutral: swap AI vendor without touching orchestration or prompt logic. AI-not-authoritative: the core eliteOS invariant — measurement math is always deterministic and server-owned; AI provides a first-pass draft that a human estimator must validate. No raw PDFs: customer documents may contain PII or confidential design IP; committing them to a public/shared repo is a data handling risk and a compliance issue. |
| **Impacted files** | `backend-core/src/takeoff/takeoffExtractionPrompt.mjs`, `takeoffAiProvider.mjs`, `openAiTakeoffProvider.mjs`, `takeoffExtractionService.mjs`, `takeoffExtractionService.test.mjs`, `takeoffWorkspaceRoutes.js`, `package.json`, `app-ai-takeoff/src/components/TakeoffPlanFileSection.tsx`, `app-ai-takeoff/src/TakeoffLabApp.tsx`, `app-ai-takeoff/src/styles.css`, `docs/eliteos/ai-takeoff-foundation.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | Before switching AI providers; before adding a Gemini or Claude provider; before enabling the Internal Estimate "Import from Takeoff" button; before allowing `review_status = "approved"` to be set from the API without human action; before wiring extraction from a dealer/partner portal (requires separate auth/org scoping analysis). |

---

### 51. AI Takeoff v5.7 — sanitized benchmark truth fixtures, deterministic recompute, evaluator, review gates — import blocked until gates pass

| Field | Value |
|-------|--------|
| **Date** | 2026-06-02 |
| **Decision** | AI Takeoff uses four architectural invariants before any quote import path is considered: **(1) Sanitized benchmark truth fixtures.** Expected values come from manually-reviewed real plan types but are stored only as sanitized expected numbers (no customer names, no real plan PDFs). Source PDFs are private and never committed. **(2) Deterministic recompute.** All measurements are computed by `takeoffMeasurementCalc.mjs` from raw dimensions — never from AI-provided totals. AI totals are audit-only. **(3) Written-total reconciliation and evidence coverage.** `validateTakeoffResult` checks AI output against visible estimator-written totals (`REFERENCE_TOTAL_*_MISMATCH`) and against high-confidence extracted dimensions (`EVIDENCE_DIMENSION_NOT_USED`) before any approval gate. **(4) Review gates.** `takeoffBenchmarkEvaluator.mjs` scores each AI run against a known fixture and returns `finalRecommendation: auto_pass | review_required | fail`. Fixtures with `expectedStatus: review_required` can never produce `auto_pass`. The import path (Internal Estimate "Import from Takeoff") remains blocked until benchmarks `ref-001`, `ref-003`, `ref-004`, and `clean-rect-001` consistently pass as `auto_pass` in live runs, AND the evaluator produces no `fail` recommendations for review-required fixtures. |
| **Why** | AI extractions have been inconsistent across real plan types. This architecture makes AI Takeoff measurable, classifies failure modes systematically, and prevents premature import of incorrect takeoff data into the quoting pipeline. |
| **Failure categories** | `none`, `cutout_deduction_violation`, `extraction_failure`, `backsplash_classification_failure`, `geometry_failure`, `reference_reconciliation_failure`, `mixed_area_scope_failure`, `evidence_coverage_failure`, `review_gate_failure` |
| **Impacted files** | `takeoffBenchmark.mjs` (10 fixtures A–J), `takeoffBenchmarkEvaluator.mjs` (new), `takeoffBenchmarkEvaluator.test.mjs` (new, 17 tests), `TakeoffBenchmarkPanel.tsx` (presets + evaluator UI), `TakeoffLabApp.tsx`, `styles.css`, `docs/eliteos/ai-takeoff-foundation.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | When at least 4 benchmark fixtures consistently produce `auto_pass` in live runs with private PDFs. At that point re-evaluate whether to enable the import path for passing benchmarks only. Also revisit when adding new plan types (add fixture first, evaluate, then modify extraction). |

---

### 52. AI Takeoff v5.8 — automatic QA gate must pass before any future import path; AI output cannot directly create/approve quote measurements

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | An automatic QA gate (`takeoffQaGate.mjs`) must be computed after every AI extraction and must return at minimum `needs_review` (yellow) before any future import path is enabled. The gate must return `ready_for_review` (green) — not a custom approval — as the best possible pre-import status. AI output can never directly create or approve quote measurements. The QA gate is a pure function (no I/O, no DB, no AI, no pricing) that interprets existing diagnostics into an estimator-facing summary: `ready_for_review / needs_review / do_not_import`. A critical issue (do_not_import) blocks import without exception. |
| **Why** | The v5.7 benchmark evaluator is powerful but requires manual benchmark selection. Estimators should not have to inspect JSON or choose presets to understand whether a takeoff is usable. The automatic QA gate provides a deterministic, immediate, estimator-facing answer after every AI draft. This makes the human-in-the-loop review step obvious and enforceable. |
| **Statuses** | `ready_for_review` (green) — no critical issues; estimator may review and approve. `needs_review` (yellow) — issues found; estimator attention required. `do_not_import` (red) — critical issues; must not be imported. |
| **Critical triggers** | Validation errors, CT = 0, cutout in exclusions, 2+ unused high-confidence dimensions, CT reference mismatch >10%, no-BS conflict, no measurement pages in inventory, benchmark `fail`. |
| **Impacted files** | `takeoffQaGate.mjs` (new), `takeoffQaGate.test.mjs` (new, 15 tests), `TakeoffQaGatePanel.tsx` (new), `TakeoffLabApp.tsx` (useMemo qaGate + Start New Takeoff), `takeoffExtractionService.mjs` (qaGate in `_meta` + response), `takeoffWorkspaceService.mjs` (recompute qaGate in getResultById), `styles.css`, `docs/eliteos/ai-takeoff-foundation.md`, `docs/eliteos/CURSOR_ACTIVE_HANDOFF.md` |
| **Revisit trigger** | When the benchmark evaluator consistently produces `auto_pass` for ≥4 benchmark types AND the QA gate produces `ready_for_review` reliably in live runs. At that point, consider building a formal human-approve step that allows an estimator to promote a `ready_for_review` takeoff into Internal Estimate. |

---

### 53. AI Takeoff v5.9 — AI provider can be swapped server-side for benchmarked model testing; every model output must still go through eliteOS recompute, validator, benchmark evaluator, and QA gate

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | The AI backend for takeoff extraction can be switched between providers (initially OpenAI and Gemini) by setting `TAKEOFF_AI_PROVIDER` in the server environment. All three AI passes (page inventory, dimension evidence, final TakeoffResult extraction) are provider-swappable. Adding a new provider requires only a new file and a new case in `takeoffAiProvider.mjs`. **No matter which provider is used**, the output must always pass through: (1) eliteOS server-side recompute, (2) validator reconciliation, (3) benchmark evaluator, and (4) automatic QA gate. The provider name is stored in `_meta.provider` of `raw_ai_result_json` for every run. |
| **Why** | Testing a single provider in isolation is insufficient to determine which AI model reads countertop plans best. The benchmark evaluator and QA gate create a consistent, objective scoring framework that applies equally to every provider. Swapping providers must be zero-friction (env var only) to encourage frequent comparison without code changes. |
| **Provider security** | `GEMINI_API_KEY` is set server-side only, never frontend-exposed. It appears in the Gemini REST API query string (Gemini's design) but is never logged. `OPENAI_API_KEY` is likewise server-side only. No AI key may appear in any Vite env var or client bundle. |
| **Current providers** | `openai` (default: `gpt-4o`), `gemini` (default: `gemini-2.5-pro`). Unknown providers are rejected with a clear error at startup. |
| **Import still blocked** | This decision does not change the import gate. No import path was enabled. `ready_for_review` from the QA gate, consistently passing the benchmark evaluator, and explicit operator approval are still all required before any import can be enabled. |
| **Impacted files** | `geminiTakeoffProvider.mjs` (new), `geminiTakeoffProvider.test.mjs` (new, 25 tests), `takeoffAiProvider.mjs` (updated), `takeoffExtractionService.mjs` (provider routing + `_meta.provider`), `takeoffWorkspaceService.mjs` (expose `provider`), `TakeoffRunHistoryPanel.tsx` (provider pill), `styles.css`, `backend-core/.env.example`, `package.json` |
| **Revisit trigger** | When Gemini and OpenAI have been compared on ≥10 private plan benchmarks and a clear winner emerges, consider removing the losing provider from the lab default and documenting the outcome. |

---

### 54. AI Takeoff Lab deployed as a protected internal head (ai_takeoff) at takeoff.eliteosfab.com

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | The AI Takeoff Lab is registered as a first-class eliteOS protected head with slug `ai_takeoff`, deployed at `https://takeoff.eliteosfab.com`. All API routes are gated by `requireHeadAccess("ai_takeoff", ...)` in addition to `requireAuth()`. Admin / super_admin users bypass the head access check by role. Non-admin users require explicit `user_head_access` assignment in System Admin. The head appears in Home Launcher for users with access. |
| **Why** | Testing on localhost was friction-heavy: repeated sign-ins, backend restarts, stuck workspace URLs. A permanent deployed head at a real domain removes this friction while preserving all auth/security guardrails. The deployment reuses all existing eliteOS head patterns: launcher catalog, head deployment URLs, CORS via `collectHeadEnvOriginsForCors`, and `requireHeadAccess` middleware. |
| **Access model** | `user_head_access.head_slug = 'ai_takeoff'` for non-admin users. Admin / super_admin: always passes. No dealer/partner access (not in `DEALER_SAFE_HEAD_SLUGS`). |
| **CORS** | `takeoff.eliteosfab.com` covered by `*.eliteosfab.com` subdomain trust + `HEAD_URL_AI_TAKEOFF` env var in backend-core. No wildcard CORS. |
| **Frontend safety** | Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, `VITE_HEAD_URL_HOME` in frontend. No AI API keys in browser bundle. |
| **Import still blocked** | Deploying as a protected head does not change the import gate. Import to Internal Estimate remains disabled. |
| **Impacted files** | `eosGovernanceConstants.js` (add `ai_takeoff`), `headDeploymentUrls.js` (add `HEAD_URL_AI_TAKEOFF`), `launcherHeads.js` (add catalog entry), `server.js` (create `headAccessAiTakeoff`), `takeoffWorkspaceRoutes.js` (apply `guardHead`), `app-ai-takeoff/.env.example` (new), `backend-core/.env.example` (add HEAD_URL_AI_TAKEOFF) |
| **Revisit trigger** | When AI import is enabled, revisit the head access model to determine whether the `ai_takeoff` slug should gate import or whether that should be a separate privilege. |

---

### 55. AI Takeoff Lab — eliteOS shell alignment + session hydration fix (v5.9.1)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | Aligned `app-ai-takeoff` visual shell and auth initialization pattern with the standard eliteOS protected-head convention (Pricing Admin / Quote Library / Internal Estimate). |
| **Shell changes** | Root `div.shell` + `header.topbar` + `brand-row brand-row-link` (logo → eliteOS wordmark → "AI Takeoff Lab · ESF"), avatar dropdown `topbar-account-wrap` with user-menu (Open Home, Sign out). `auth-panel-standalone` replaces the inline auth card. JSON workbench wrapped in `<details>` and moved to a collapsed secondary section. Standard `.main` wrapper. Footer bar added. |
| **Auth hydration** | Replaced `resolveAccessToken()` in the initial `useEffect` with `supabase.auth.getSession()` + `onAuthStateChange` `applySession` pattern (mirrors Pricing Admin). Extracts `user_metadata.full_name/name/display_name` for display name without a separate `getUser()` call. Session from Home Launcher is already shared via `.eliteosfab.com`-scoped cookie from `buildEliteosSupabaseAuthOptions`. No URL hash handoff needed — the shared cookie is the mechanism. |
| **Session sharing prerequisite** | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on Vercel `app-ai-takeoff` must point to the **same** Supabase project as Home. If they differ, the cookie key won't match and sign-in will be required. |
| **Home Launcher link** | `VITE_HEAD_URL_HOME` env var wires the brand link and "Open Home" user-menu item. Defaults to `https://www.eliteosfab.com`. |
| **Security unchanged** | All backend route guards (`requireAuth()` → `requireHeadAccess("ai_takeoff", ...)`) untouched. Frontend shell is not authorization. |
| **Impacted files** | `app-ai-takeoff/src/TakeoffLabApp.tsx`, `app-ai-takeoff/src/styles.css`, `app-ai-takeoff/src/vite-env.d.ts`, `app-ai-takeoff/.env.example` |

---

### 60. AI Takeoff — evidence-first integrity + no silent geometry changes (v6.0)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | AI Takeoff is now evidence-first. Model-generated final geometry is not trusted unless every run is traceable to extracted dimension evidence and passes reconciliation checks. |
| **Problem** | Gemini correctly identified evidence (109.5", 34.5", 54", 100", 40", 23", 90"×41") but the final TakeoffResult silently transformed this into runs using 24" (unsupported), 23" (depth assumption), and missed the 109.5"/34.5"/54" stove-wall dimensions entirely. |
| **Solution** | New `reconcileRunsWithEvidence` pure helper checks every final `counter` run against high-confidence `countertop_run`/`island` evidence dimensions (±1" exact match, ±10" "changed" zone). QA gate escalates issues found by reconciliation. |
| **New diagnostic codes** | `RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE` (no evidence within ±10"), `EVIDENCE_DIMENSION_CHANGED_IN_RUN` (differs from nearest by 1–10"), `CONFLICTING_DIMENSIONS_USED_SILENTLY` (multiple evidence dims nearby), `UNSUPPORTED_CORNER_DEDUCTION` (cornerDeductions without L/U-shape), `DRAFT_ASSEMBLY_REVIEW_REQUIRED` (run.requiresEstimatorReview=true), `RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE` (code defined, not yet triggered by default). |
| **Verdict tiers** | supported (≤1" from evidence), changed (1–10"), unsupported (>10" or no evidence). Standard depths (25.5" kitchen / 21.5" vanity) are exempt from depth checks. |
| **QA gate** | Unsupported runs → needs_review (1) or do_not_import (≥2). Changed dims → needs_review. Conflicting dims → needs_review. Unsupported corner deduction → critical → do_not_import. |
| **Prompt v6** | `PROMPT_VERSION` bumped to "v6". Every run must include `assemblyNotes` citing which evidence was used. `lengthEvidenceId`, `depthEvidenceId`, `assemblyConfidence`, `requiresEstimatorReview` optional fields added to run schema (backward-compatible). Model must set `requiresEstimatorReview=true` on conflicting/unclear runs. |
| **UI** | New "Evidence trace" section (between Dimension evidence and Debug panel) shows per-run verdict badges (✓ supported / ⚠ changed / ✗ unsupported), evidence match, and unused evidence dims. |
| **Hard boundaries** | No import enabled. No pricing. No quote mutation. No provider routing changes. |
| **Impacted files** | `takeoffContract.mjs`, `takeoffEvidenceRunReconciliation.mjs` (new), `takeoffValidator.mjs`, `takeoffQaGate.mjs`, `takeoffExtractionPrompt.mjs`, `takeoffEvidenceRunReconciliation.test.mjs` (new), `TakeoffEvidenceTracePanel.tsx` (new), `TakeoffLabApp.tsx`, `styles.css`, `package.json`, `takeoffExtractionService.test.mjs` |

---

### 62. AI Takeoff v6.2 — deterministic fabrication rules engine; reference totals are comparison evidence, not calculation authority (Kelley proof case)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-03 |
| **Decision** | AI Takeoff now evaluates every `TakeoffResult` through a deterministic fabrication rules engine before the QA gate. Written reference totals (e.g. "50 sq' no b/s") are treated as comparison evidence only — they must never be used to size or add geometry. The estimator-reviewed structured runs are the source of truth. eliteOS recompute is always authoritative. |
| **Problem** | The AI tried to reconcile toward a visible reference note ("50 sq' no b/s") by adding or resizing runs, producing ~48–50 sf instead of the correct ~39.91 sf. The correct reviewed draft excludes the questionable horizontal section and island ambiguity, arriving at ~39.91 sf / 0 backsplash — which is less than the written 50 sf reference. The rules engine must detect and flag this reconciliation pattern and prevent false positives on clean reviewed takeoffs. |
| **Solution** | New pure module `takeoffFabricationRules.mjs` implements 8 rule codes across 7 classifiers. Integrated into `takeoffValidator.mjs` and `takeoffQaGate.mjs`. Prompt bumped to v6.1 with an explicit FABRICATION RULES section. New `KELLEY_REVIEWED_RULE_FIXTURE` added to `takeoffBenchmark.mjs` as a regression fixture. |
| **Core principle** | Reference totals are evidence for comparison, not calculation authority. Estimator-reviewed structured runs are the source of truth. |
| **New rule codes** | `REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET` (warning), `NO_BACKSPLASH_CONFIRMED` (info), `BACKSPLASH_SCOPE_CONFLICT` (error/warning), `CUTOUT_DEDUCTED_FROM_MATERIAL` (error), `INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED` (warning), `CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG` (warning), `NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE` (info), `NONSTANDARD_DEPTH_UNSUPPORTED` (warning). |
| **QA gate** | Cutout deducted → do_not_import. Reference total as geometry target / inferred duplicate / backsplash scope conflict / nonstandard depth unsupported → needs_review. Verified depth / no-b/s confirmed → positive signal. |
| **Extraction prompt** | Bumped to v6.1. FABRICATION RULES section added with explicit: no geometry reconciliation to reference totals; no cutouts in exclusions; no duplicate pieces without visible geometry; no corner deductions without overlap; nonstandard depths need evidence. |
| **Kelley fixture** | `KELLEY_REVIEWED_RULE_FIXTURE` (expectedStatus: review_required, expectedCountertopSf: 39.91, expectedNoBacksplash: true, visibleReferenceTotals: ["50 sq' no b/s"]). Prevents system from targeting 50 sf. Island 36" depth verified from evidence. "2 STOVE" ambiguity flagged. |
| **Tests** | 33 new unit tests in `takeoffFabricationRules.test.mjs`. All 28 extraction service tests updated for v6.1 promptVersion. All 24/25/17 reconciliation/QA/benchmark tests passing. |
| **Hard boundaries** | No import enabled. No pricing. No quote mutation. No provider routing changes. No raw PDFs. No secrets exposed. |
| **Impacted files** | `takeoffFabricationRules.mjs` (new), `takeoffFabricationRules.test.mjs` (new), `takeoffContract.mjs`, `takeoffValidator.mjs`, `takeoffQaGate.mjs`, `takeoffExtractionPrompt.mjs`, `takeoffBenchmark.mjs`, `TakeoffQaGatePanel.tsx`, `TakeoffLabApp.tsx`, `styles.css`, `takeoffExtractionService.test.mjs`, `package.json` |

---

### 63. AI Takeoff v6.3 — Backsplash review controls in Review Workbench (2026-06-03)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-03 |
| **Decision** | Added estimator-facing backsplash review controls to the Review Workbench. Estimators can now select a backsplash scope, enter linear inches + height, enter a manual square footage override, and leave a reviewer note per area — before saving a reviewed takeoff. |
| **Motivation** | Hoskins plan: AI identified 4.00 sf backsplash in reference notes but computed 0 because no structured fields were populated. The workbench had no way to add backsplash without editing raw JSON. |
| **New TakeoffArea fields** | `backsplashManualSf?: number`, `backsplashScope?: "no_stone"\|"standard"\|"full_height"\|"tile_by_others"\|"needs_review"`, `backsplashReviewNote?: string` |
| **Computation priority** | (1) `no_stone`/`tile_by_others` scope → BS = 0 regardless; (2) `backsplashManualSf > 0` → BS = manualSf; (3) `backsplashLinearIn > 0` → linear×height; (4) splash runs. Manual sf is treated as estimator-reviewed input, not AI authority. |
| **"Use AI/ref total" button** | Appears when AI provided a backsplash total and no manual sf is set. Clicking it sets `backsplashManualSf` to the AI reference total and sets scope to "standard" with a reviewer note. QA warning clears naturally when `computed.backsplashExactSf > 0`. |
| **Validator changes** | `AI_BACKSPLASH_TOTAL_NOT_STRUCTURED` suppressed when `estimatorChoseNoBS` (no_stone/tile_by_others scope). `EMPTY_AREA` check updated to also pass when `backsplashManualSf > 0`. |
| **Tests** | 20 new tests in `takeoffMeasurementCalc.test.mjs` covering all backsplash scenarios. New `eos:test:takeoff-measurement-calc` script. |
| **Hard boundaries** | No import enabled. No pricing. No quote mutation. No provider routing changes. No raw PDFs. No secrets exposed. |
| **Impacted files** | `takeoffContract.mjs`, `takeoffMeasurementCalc.mjs`, `takeoffMeasurementCalc.test.mjs` (new), `takeoffValidator.mjs`, `TakeoffLabApp.tsx`, `TakeoffReviewWorkbench.tsx`, `styles.css`, `package.json` |

---

### 56. AI Takeoff Lab — upload-first empty state + nonstandard depth QA (v5.9.2)

| Field | Value |
|-------|--------|
| **Date** | 2026-05-31 |
| **Decision** | Corrected the deployed AI Takeoff head to be upload-first (no Spec 73/demo data shown by default when signed in) and added a `NONSTANDARD_DEPTH_ASSUMED` validator rule for island/peninsula/raised bar/desk/waterfall runs with depths over 26". |
| **Upload-first state** | `sourceMode` now initializes to `"none"` instead of `"spec73"`. All measurement sections (summary, QA gate, rooms, diagnostics, import preview, benchmark, debug) are gated on `hasActiveSource` (sourceMode !== "none"). The page shows the plan upload card as the primary action when no source is loaded. |
| **Start New Takeoff** | Resets to `sourceMode = "none"` (upload-first empty state), not Spec 73. Workspace data is preserved in the backend. |
| **Spec 73 / demo** | Spec 73 sample is only loadable via explicit click in the JSON workbench (collapsed by default). When loaded, a yellow `demo-notice` banner ("Demo sample — not a real workspace") appears with a "Clear demo data" link. |
| **NONSTANDARD_DEPTH_ASSUMED** | New `TAKEOFF_DIAGNOSTIC_CODE.NONSTANDARD_DEPTH_ASSUMED`. Fires in `takeoffValidator.mjs` on any `counter` run whose label matches island/peninsula/raised bar/desk/waterfall and whose depth exceeds 26". Standard 25.5" wall runs are NOT flagged. |
| **QA gate** | `evaluateTakeoffQaGate` escalates `NONSTANDARD_DEPTH_ASSUMED` to `needs_review` (warning severity). The AI Takeoff must require estimator verification for any nonstandard specialty piece depth. |
| **Spec 73 fixture** | Functional values (59.96 sf CT, 6.61 sf BS) unchanged. The peninsula run at 41" now correctly triggers `NONSTANDARD_DEPTH_ASSUMED` when the validator runs — this is intentional and expected for the test fixture. |
| **UI tokens** | Aligned with IE/QL: `--r-lg:18px`, `--r-md:12px`, richer `--eos-shadow-sm`, IE/QL aurora body background. Dark hero block removed; replaced with compact `takeoff-page-sub` white subheader. |
| **Security unchanged** | All backend route guards, auth patterns, and hard boundaries unchanged. |
| **Impacted files** | `backend-core/src/takeoff/takeoffContract.mjs`, `backend-core/src/takeoff/takeoffValidator.mjs`, `backend-core/src/takeoff/takeoffQaGate.mjs`, `backend-core/src/takeoff/takeoffQaGate.test.mjs`, `app-ai-takeoff/src/TakeoffLabApp.tsx`, `app-ai-takeoff/src/styles.css` |

---

### 64. Shared eliteOS topbar standardization (Home, Quote Library, Sales Dashboard migrated; durable rule for all future protected heads)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | All **protected internal eliteOS heads** must use the shared, presentational **`EliteosTopbar`** component (`shared/eliteos-ui/EliteosTopbar.tsx` + `shared/eliteos-ui/eliteosTopbar.css`) for their header shell. One-off local topbar markup is **not permitted** for new protected heads. The first migration wave covered **Home Launcher** (`app-home`), **Quote Library** (`app-quote-library`), and **Sales Dashboard** (`app-sales`). The shared component is purely presentational: it owns only the dropdown open/close state and accepts all user identity, org data, menu items, and sign-out callbacks through props. |
| **Why** | Three independent local topbar implementations had diverged in visual appearance, UX behavior (chip subtitle format, casing, menu structure), and accessibility patterns. A shared shell eliminates that drift, ensures visual and UX consistency across the OS, and codifies the correct presentational boundary (no auth, no Supabase, no env vars, no business logic in the topbar component). Each future head should include it in the initial scaffold rather than as a retrofit. |
| **Shared component contract** | **Must not** import Supabase, call backend APIs, read env vars, own auth/session state, or contain domain logic. Each head passes `userName`, `userEmail`, `initials`, `userSubtitle` (role/title from `/api/me`; fallback email), `organizationName`, `logoSrc`, `homeHref`, `menuItems`, and `onSignOut`. The `searchSlot` prop is reserved for **Home Launcher only** unless explicitly approved per head. |
| **Subtitle fallback order** | `job_title → department → role → email`. Role/title is upper-cased in JavaScript before passing as `userSubtitle`; email fallback uses natural casing with a per-head `text-transform: none` override in the head's own CSS if needed. |
| **Public/customer heads** | `app-quote` (Public Quote Head) and `app-partner-quote` are intentionally excluded — they are not staff heads and may use different chrome. |
| **CSS namespace** | Shared topbar classes use the `.eliteos-topbar-*` prefix to prevent conflicts with head-local `eos-*` styles. Heads requiring casing overrides add a scoped rule (`.eliteos-topbar .eliteos-topbar-chip-role { text-transform: none; }`) to their own stylesheet only. |
| **New-head checklist** | See `docs/eliteos/SYSTEM_BLUEPRINT.md §16`. All new protected heads must pass the checklist before production. |
| **Impacted files/docs** | `shared/eliteos-ui/EliteosTopbar.tsx` (created), `shared/eliteos-ui/eliteosTopbar.css` (created), `app-home/src/ui/App.tsx`, `app-home/src/ui/styles.css`, `app-home/tsconfig.json`, `app-quote-library/src/QuoteLibraryApp.tsx`, `app-quote-library/src/styles.css`, `app-quote-library/tsconfig.json`, `app-sales/src/ui/App.tsx`, `app-sales/src/ui/styles.css`, `app-sales/src/lib/types.ts`, `app-sales/tsconfig.json`, `docs/eliteos/SYSTEM_BLUEPRINT.md` (§15–16 added), `docs/eliteos/FEATURE_DECISIONS.md` (this entry), `.cursor/rules/eliteos-architecture.mdc` (shared topbar + new-head checklist rule added). |
| **Revisit trigger** | A new protected head is added; `EliteosTopbar` API is extended; design system overhaul replaces the shared CSS; or a head is explicitly approved to use alternative chrome. |

---

### 65. SlabCloud inventory integration — read-only dry-run POC only (no Supabase, no UI, no holds, no writeback)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | The first SlabCloud integration is a **read-only, dry-run proof of concept**. It pulls Elite Stone Fabrication slab inventory from the observed **SlabCloud JSON endpoints**, normalizes the records into a stable internal shape, and writes **local files only** under `debug/slabcloud/`. It performs **no Supabase writes, no database migrations, no holds/reservations, no writeback to SlabCloud/Slabsmith, no HTML scraping, and no cookie/session/auth automation**. The SlabCloud **company code** (observed `kbyd`) is treated as **configurable** (`SLABCLOUD_COMPANY_CODE`) and is intentionally **not** assumed to equal the public inventory slug `/inventory/esf/`. Image URLs are **guessed** from the observed pattern but **not downloaded** by default (`SLABCLOUD_VERIFY_IMAGES=1` does an optional best-effort HEAD probe). Slab dimensions (`Width_Actual`/`Length_Actual`, meters) are converted to inches for convenience but are **not** used for quote pricing in this POC; `UsableA`/`UsableD` are of uncertain meaning and are **preserved raw**, not interpreted. |
| **Why** | Prove the data path (SlabCloud JSON → normalized slab inventory) and review real output **before** committing to schema, cache tables, or a customer/internal UI. Keeping it read-only and local avoids tenant-data risk, avoids premature Supabase coupling, and keeps the door open to either a backend-owned cached Slab Inventory head or a future SlabRoom/showroom experience — without building any of that yet. |
| **Endpoints used** | `GET /api/materials/{companyCode}`, `GET /api/slabs/{companyCode}?type=Slab&edges=true`, and per-color detail `GET /api/slabs/{companyCode}?name={Name}&type=Slab&edges=true`. Observed publicly reachable for company `kbyd` without credentials during the POC. |
| **Future path** | A real Slab Inventory head must use **backend-owned cached data** (server fetch + Supabase cache, org-scoped by `organization_id`), **never** direct browser calls to SlabCloud. Confirm with SlabCloud whether these endpoints are approved for sustained internal/automated use before scheduling syncs. |
| **Explicitly NOT built** | Slab Inventory head, SlabRoom customer portal, showroom TV channel, QR display, quote/slab hold workflow, Slabsmith writeback, payments, scheduling, AI recommendations, Supabase cache tables, migrations. |
| **Impacted files/docs** | `backend-core/src/slabcloud/slabCloudClient.js` (created), `backend-core/src/slabcloud/normalizeSlabCloudInventory.js` (created), `backend-core/src/slabcloud/slabCloudInventoryPoc.test.mjs` (created), `backend-core/src/scripts/slabcloud/importSlabCloudInventoryPoc.js` (created), `package.json` (`eos:slabcloud:inventory-poc`, `eos:test:slabcloud-inventory`), `docs/eliteos/slabcloud-inventory-poc.md` (created), `docs/eliteos/FEATURE_DECISIONS.md` (this entry). Output (gitignored): `debug/slabcloud/slabcloud-inventory-dry-run.json`, `debug/slabcloud/slabcloud-inventory-summary.json`. |
| **Revisit trigger** | We decide to build a Slab Inventory head or SlabRoom; SlabCloud confirms (or denies) endpoint use; endpoints begin requiring auth/cookies (in which case the POC stops and the approach is re-scoped — no scraping or session automation); or pricing/area logic needs `UsableA`/`UsableD` semantics resolved. |

---

### 66. slabOS slab inventory — phased read-only-first build plan with profit engine guardrails

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | The slabOS slab inventory and profit engine will be built in **six ordered phases**, starting from the read-only POC (Phase 0, done) and gating every subsequent phase on SlabCloud endpoint approval, dry-run review, and previous phase stability. **Phase 1** (Supabase inventory cache) does not start until dry-run output is reviewed and SlabCloud confirms endpoint use is permitted. **No customer UI, no holds, no writeback, and no automated pricing changes will be built until their prerequisite phase is production-stable.** The profit engine (remnant suggestions, procurement forecast, margin alerts) starts as **staff-facing recommendations only** — never automatic allocation or auto-pricing. Capacity-aware quoting is deferred until Moraware/Titans production capacity data is trustworthy. |
| **Why** | SlabCloud/Slabsmith remains the inventory source of truth. slabOS adds the workflow, intelligence, and customer-experience layers on top — without replacing Slabsmith and without risking premature schema decisions based on incomplete field data. Phasing protects against over-building before the foundational data quality is confirmed. Starting profit engine features as suggestions (not automation) reduces risk of incorrect inventory allocation or margin-damaging auto-pricing. |
| **Phase gate order** | Phase 0 (dry-run POC) → **review output + SlabCloud confirmation** → Phase 1 (cache) → Phase 2 (internal head) → Phase 3 (showroom) → Phase 4 (holds/quote links) → Phase 5 (customer SlabRoom) → Phase 6 (profit engine recommendations). |
| **First recommended profit feature** | Remnant / in-stock slab match suggestions surfaced inside Internal Estimate — "possible stock match found" only, staff confirms manually. Requires Phases 1 and 2 to be stable first. |
| **Architecture guardrails** | Backend owns fetch + normalization. Frontend never calls SlabCloud directly. All cached rows carry `organization_id`. No cookies/session/auth headers ever. No Slabsmith writeback without a separate explicit decision. All protected heads use shared `EliteosTopbar`. |
| **Open questions (blocking Phase 1)** | Is `/api/slabs/kbyd` approved for ESF automated use? Is `kbyd` our company code? Are there rate limits or API terms? What are `UsableA`/`UsableD`? Does `count` represent group or individual count? |
| **Impacted files/docs** | `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md` (created), `docs/eliteos/SYSTEM_BLUEPRINT.md` (related docs table updated), `docs/eliteos/FEATURE_DECISIONS.md` (this entry). No app code changed. |
| **Revisit trigger** | SlabCloud responds to open questions; dry-run output review is complete; Phase 1 implementation is approved; any profit engine feature is approved for production; a non-ESF tenant needs slab inventory (multi-tenant scope decision required). |

---

### 67. SlabCloud inventory — full dry-run succeeded, verbal API approval received, SQL schema drafted (not yet applied)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | The full uncapped SlabCloud dry-run (all colors, no `SLABCLOUD_MAX_DETAILS` cap) succeeded: **44 materials · 384 slab records · 139 distinct colors · 23 distinct materials · 0 warnings**. No auth, no cookies, no Supabase writes. Andrey (SlabCloud) gave **verbal approval** for ESF/slabOS read-only internal use of the `/api/slabs/kbyd` and `/api/materials/kbyd` endpoints. Written confirmation is still preferred before scheduling recurring production syncs or building a public showroom that depends on this data path. The Supabase cache schema has been **drafted** in `backend-core/supabase/eliteos_slabcloud_inventory_cache.sql` but **not yet applied** to any Supabase project. The SQL draft covers five tables: `slabcloud_sync_runs`, `slab_inventory_raw_records`, `slab_inventory`, `slab_materials`, and `slab_images`. RLS is enabled on all five tables but no permissive policies are created — service role writes only for now. |
| **count_for_color semantics** | `count` from SlabCloud is a **color-group-level** value repeated identically on every detail row for the same color. It must **not** be summed across detail rows. Actual physical slab count = `COUNT(DISTINCT external_slab_id) WHERE color_name = X AND is_active = true`. This is documented in a `COMMENT ON COLUMN` in the SQL draft. |
| **Why draft only** | Schema correctness and field semantics (especially `UsableA`/`UsableD`, image URL stability, and `status`/sold fields) should be confirmed against real data and with SlabCloud before the migration is applied. A staging smoke run follows the draft review. |
| **Next steps** | (1) Review SQL draft. (2) Build `slabCloudPersistence.js` + tests (write-gated). (3) Apply SQL to staging Supabase + smoke run. (4) Obtain SlabCloud written confirmation. (5) Promote to production cache. |
| **Impacted files/docs** | `backend-core/supabase/eliteos_slabcloud_inventory_cache.sql` (created, not applied), `docs/eliteos/slabcloud-inventory-poc.md` (full dry-run results + approval note added), `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md` (Phase 0 results + Phase 1 SQL draft status updated), `docs/eliteos/FEATURE_DECISIONS.md` (this entry). No app code changed. |
| **Revisit trigger** | SQL is reviewed and approved for staging apply; written SlabCloud confirmation received; `UsableA`/`UsableD` field semantics confirmed; image URL pattern confirmed; Phase 1 persistence module is built. |

---

### 68. SlabCloud inventory cache — SQL applied; write-gated persistence layer built (no production write yet)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | The cache SQL has been **applied and verified in Supabase** (5 tables, RLS enabled on all). A backend persistence layer now writes normalized SlabCloud inventory into those tables, **gated behind `SLABCLOUD_CACHE_WRITE_ENABLED=1`**. With the gate off (default), the flow fetches + normalizes read-only and reports `would_write` counts while making **zero** Supabase insert/upsert/update calls. With the gate on it requires `SLABCLOUD_ORGANIZATION_ID` + service-role config and fails loudly if missing. SlabCloud (Andrey) confirmed ESF may proceed with read-only use of the JSON feed for internal slabOS integration. **No production write has been performed yet** — the first real write must be a manual, reviewed run. No scheduled automation, no UI, no holds, no inactive marking, no writeback. |
| **Why** | Separating the write gate from the data pipeline lets us validate the full fetch→normalize→persist path (including would-write counts and payload shapes) with no tenant-data risk, then flip a single env var for a controlled first write. The gate matches the repo's existing `SUPABASE_WRITE_ENABLED` convention. |
| **Write order** | INSERT `slabcloud_sync_runs` (running) → INSERT `slab_inventory_raw_records` (all records incl. missing slab id) → UPSERT `slab_inventory` (records with `external_slab_id` only) → UPSERT `slab_materials` → UPSERT `slab_images` (`image_status=unknown`) → UPDATE sync run (completed). On error the run is marked `failed`. Never deletes; `slab_deactivated_count` always 0 in Phase 1. |
| **Dry-run cache result** | Full run 2026-06-04: would write 1 sync run · 384 raw records · 384 inventory · 44 materials · 384 images · 0 warnings. No Supabase writes performed. |
| **Identity / count** | Inventory upsert conflict key: `organization_id,external_source,external_company_code,external_slab_id`. `count_for_color` is stored as-is and never summed (it is group-level). Records with a missing `external_slab_id` are preserved in raw records but skipped from `slab_inventory`/`slab_images`. |
| **Tests** | `slabCloudPersistence.test.mjs` (mock Supabase, no network): gate behavior, sync-run creation, raw insert, inventory/material/image upsert keys, missing-id skip, count-not-summed, org id on every payload, no deletes, failure→failed status, write requires db+org, no inactive marking. All passing alongside the Phase 0 suite. |
| **Impacted files/docs** | `backend-core/src/slabcloud/slabCloudPersistence.js` (created), `backend-core/src/slabcloud/slabCloudSync.js` (created), `backend-core/src/scripts/slabcloud/cacheSlabCloudInventory.js` (created), `backend-core/src/slabcloud/slabCloudPersistence.test.mjs` (created), `package.json` (`eos:slabcloud:cache`, `eos:test:slabcloud-cache`), `docs/eliteos/slabcloud-inventory-poc.md`, `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Revisit trigger** | First manual gated write is reviewed and approved; SlabCloud written confirmation received; scheduling is proposed; internal Slab Inventory head (Phase 2) begins; inactive-marking / first_seen preservation is implemented. |

---

### 69. SlabCloud image URL verification — backend-only & write-gated; first dry-run shows guessed URL pattern is wrong (404)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | Image URL verification is a **separate backend step** from the inventory sync, **gated behind `SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1`**. It reads `slab_images` rows for an org, checks each URL with **HEAD** (lightweight `Range: bytes=0-0` GET fallback only when HEAD is unsupported), and updates **only** `slab_images.image_status` + `last_checked_at` + `updated_at`. It **never downloads/stores image bytes**, never touches `slab_inventory`, never creates/deletes rows, never marks slabs inactive, and never writes back to SlabCloud/Slabsmith. Bounded concurrency (default 3), per-request timeout, no cookies/auth. Reading Supabase requires org id + service-role config even in dry-run. |
| **First dry-run finding** | 2026-06-04: verified 50 `unknown` rows (thumbnail-first) → **0 ok · 50 missing · 0 error** (clean `HEAD 404`); a follow-up image-first check of 10 rows → **10 missing (404)**. The **guessed** URL pattern (`/slabs/{companyCode}/{SlabID}.jpg` and `..._thumb.jpg`) is **not** SlabCloud's real image scheme. The verification tooling works correctly; only the URL pattern is unconfirmed. |
| **Consequence** | Slab-photo display (Phase 2 gallery / Phase 3 showroom) is **blocked** until the real image/thumbnail URL format is confirmed with SlabCloud. The `slab_images` schema already supports multiple `image_url_pattern` values per slab, so the real pattern can be added alongside the guessed one and re-verified without migration. No production write of statuses was performed. |
| **Tests** | `slabCloudImageVerification.test.mjs` (mock Supabase + mock fetch, no network): write gate, no-writes-when-off, writes-when-on, ok/missing/error verdicts, HEAD 405→GET fallback, org-scoped query only, no deletes, slab_inventory never updated, concurrency cap, skipped on missing URL, requires db+org. All passing. |
| **Impacted files/docs** | `backend-core/src/slabcloud/slabCloudImageVerification.js` (created), `backend-core/src/scripts/slabcloud/verifySlabCloudImages.js` (created), `backend-core/src/slabcloud/slabCloudImageVerification.test.mjs` (created), `package.json` (`eos:slabcloud:verify-images`, `eos:test:slabcloud-images`), `docs/eliteos/slabcloud-inventory-poc.md`, `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Revisit trigger** | SlabCloud confirms the real image URL pattern; a write-enabled verification run is reviewed/approved; image caching (Supabase Storage) is proposed; Slab Inventory head/gallery begins. |

---

### 70. SlabCloud image URL generation fixed — lowercase SlabID in URL path (resolves #69 404s)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | The real SlabCloud image scheme reuses the **same SlabID UUID but lowercased** in the URL path (confirmed via manual browser/network inspection). `buildImageUrlGuesses()` now lowercases **only** the URL path segment — `/slabs/{companyCode}/{lowercase-slabid}.jpg` and `…_thumb.jpg`. The slab's identity (`external_slab_id`) is **preserved unchanged**. The `image_url_pattern` key is kept stable (`slabcloud_slab_jpg`) on purpose so a re-sync **upserts existing `slab_images` rows in place** on the unique key (correcting the stored URL casing + resetting `image_status` to `unknown`) instead of orphaning them under a new pattern key. No image rows were marked ok/missing by this change — verification remains a separate explicit script. |
| **Validation** | Live read-only HEAD probe: uppercase `…/slabs/kbyd/437D9CA4-…C5A.jpg` → **404**; lowercase `…/slabs/kbyd/437d9ca4-…c5a.jpg` → **200**. Unit tests assert uppercase input → lowercase URL output with `external_slab_id` preserved. A post-fix no-write re-verify of 20 rows still showed **20 missing** because it reads the *already-persisted* uppercase URLs (stale rows), not freshly-generated ones. |
| **Consequence — rows need refresh** | The `slab_images` rows currently in Supabase still hold pre-fix uppercase URLs. A **write-enabled cache sync (`SLABCLOUD_CACHE_WRITE_ENABLED=1`) must be re-run** to refresh those rows with lowercase URLs **before** running write-enabled image verification. Until then, image verification (which reads stored URLs) will keep reporting `missing`. |
| **Tests** | `node --check` on the normalizer; `eos:test:slabcloud-inventory` (lowercase URL + identity-preservation assertions), `eos:test:slabcloud-cache` (image rows lowercase URL + stable pattern key), `eos:test:slabcloud-images`, `eos:check:local` — all passing. |
| **Impacted files/docs** | `backend-core/src/slabcloud/normalizeSlabCloudInventory.js` (lowercase URL path), `backend-core/src/slabcloud/slabCloudPersistence.js` (stable `IMAGE_URL_PATTERN` doc note), `backend-core/src/slabcloud/slabCloudInventoryPoc.test.mjs`, `backend-core/src/slabcloud/slabCloudPersistence.test.mjs`, `docs/eliteos/slabcloud-inventory-poc.md`, `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Revisit trigger** | Write-enabled cache re-sync is run to refresh `slab_images`; write-enabled image verification is reviewed/approved; image caching (Supabase Storage) is proposed; Slab Inventory head/gallery begins. |

---

### 71. Slab Inventory Head v1 — protected, read-only internal slab browser

| Field | Value |
|-------|--------|
| **Date** | 2026-06-04 |
| **Decision** | Shipped the first protected internal **Slab Inventory** head (`app-slab-inventory`, slug `slab_inventory`) as a **read-only** browser over the normalized SlabCloud cache. New backend routes `GET /api/slab-inventory/summary`, `/filters`, `/slabs`, `/slabs/:id` are gated by `requireAuth()` + `requireHeadAccess("slab_inventory")`, organization-scoped, and served via the **service-role** server client (frontend never reads Supabase directly for slab data). The frontend uses the shared `EliteosTopbar` (identity "eliteOS" / "Inventory · Elite Stone Fabrication", no `searchSlot`), the shared light eliteOS design language (no dark gallery), a summary stat strip, backend-owned filters/search/pagination/sort, a slab card grid + list toggle, a slab detail lightbox, and a sync-status panel. |
| **Source / authority** | SlabCloud/Slabsmith remains the external source of truth; slabOS reads from its cache. The head performs **no mutations** and **no writeback**. Verified structurally by a test asserting only GET routes are registered (no POST/PUT/PATCH/DELETE). |
| **Price group rule** | `slab_inventory.price_group` is surfaced as **`source_price_group`** (label "Source price group", "imported") — explicitly NOT slabOS pricing authority. No override UI in v1; future price-group assignment must be a separate overlay table, never a mutation of source cache rows. |
| **Count semantics** | Actual slab counts are row counts / distinct `external_slab_id`. SlabCloud's `count_for_color` is **never summed** and is not even in the staff-safe projection. A regression test proves the summary count equals the number of rows, not the sum of `count_for_color`. |
| **Staff-safe fields** | Internal-only projection (color, material, distributor, source price group, thickness, rack, lot, dimensions in inches, inventory/external IDs, image url/thumb/status, sync metadata). Raw JSON, meter source columns, and `usable_*` fields are excluded. No customer-safe public API was added. |
| **Registration** | Added `slab_inventory` to `EOS_HEAD_SLUGS`, a launcher catalog row (category Inventory), and `HEAD_URL_SLAB_INVENTORY` in `headDeploymentUrls.js` (auto-wires `/api/me/heads` URL + CORS origin). **Not** added to any role default — non-admins see it only via explicit `user_head_access` assignment (admins/executives see it in the full catalog). Routes mounted from `server.js`. |
| **RLS** | The cache tables keep RLS enabled with no permissive policies; the head reads them via the service-role server client only. No new SELECT policy was added for v1 (no direct browser reads). |
| **Tests** | `eos:test:slab-inventory-api` (pure helpers: clamp, sort whitelist, param parsing, source-price-group labeling, image-map preference, count semantics, and GET-only route shape). `node --check` on new backend files; `app-slab-inventory` builds; `eos:check:local`, head-access, and slabcloud suites all pass. Added to `eos:build:all-heads` + `eos:check:local`. |
| **Intentionally NOT built (v1)** | Public showroom, customer SlabRoom, holds/reservations, quote-linked allocation, drag/drop allocation, price-group overrides, scheduled sync automation, payment/scheduling/customer approval, image byte download/proxy/caching, Cmd+K palette, color swatches, AI recommendations. No changes to Internal Estimate pricing/math, Quote Library, Sales Dashboard, Moraware, AI Takeoff, or the shared topbar. |
| **Impacted files/docs** | `app-slab-inventory/*` (new Vite React head), `backend-core/src/slabInventory/slabInventoryApi.js` (+ `.test.mjs`), `backend-core/src/server.js`, `backend-core/src/auth/eosGovernanceConstants.js`, `backend-core/src/me/launcherHeads.js`, `backend-core/src/me/headDeploymentUrls.js`, `package.json` (`eos:build:slab-inventory`, `eos:test:slab-inventory-api`, all-heads + check wiring), `docs/eliteos/eliteOS-master-head-map.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Manual step required** | Grant access by inserting a `user_head_access` row per user: `insert into public.user_head_access (user_id, head_slug) values ('<auth_user_id>', 'slab_inventory');` (admins/executives already see it). Set `HEAD_URL_SLAB_INVENTORY` (and `VITE_BACKEND_URL` / `VITE_SUPABASE_*` for the app) when deploying. No DB migration is required (cache tables already applied). |
| **Revisit trigger** | Org-scoped RLS SELECT policy is needed for direct reads; holds/allocation or price-group overlay begins; showroom/SlabRoom is proposed; image caching to Supabase Storage is proposed. |

---

### 72. SlabCloud manager-scope diagnostic — company code confirmed kbyd, missing inventory under investigation

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Added a **read-only diagnostic script** (`backend-core/src/scripts/slabcloud/compareSlabCloudManagerScopes.js`) to determine why slabOS has fewer slabs than the public ESF manager page. No sync change, no config change, no schema change. Read results before deciding. |
| **Manager URL discovery** | The public ESF manager URL is `https://slabcloud.com/inventory/esf/manager.php`. The browser console on that page logs `company kbyd` — confirming the **API company code is `kbyd`**, NOT `esf`. The `/inventory/esf/` path is a display slug only. |
| **Do NOT change company code** | `SLABCLOUD_API_COMPANY_CODE` must stay `kbyd`. `SLABCLOUD_ASSET_COMPANY_CODE` must stay `kbyd`. Do NOT change either to `esf` — this would break image URL construction and the API requests. |
| **Missing inventory hypothesis** | The current sync fetches `type=Slab&edges=true` only. The manager UI supports: Any Type, Full Slabs, Remnants, Min Length, Min Width. Missing inventory likely comes from `type=Remnant` or `type=Full Slab` variants returning distinct SlabIDs not in the current `type=Slab` scope. This is the most probable cause — pending diagnostic review. |
| **Manager console evidence** | `company=kbyd`, `edges=true`, `showZoom=true`, `filterOpen=true`, `measure=true`. Evidence manually documented; not auth-scraped, not from session automation. |
| **Magnify / measure UX** | `measure=true` / `showZoom=true` indicate the manager page has a zoom/measurement UI. This is **UX inspiration only** — do NOT copy or reverse-engineer `manager.js`. Any slabOS measurement UI must be original eliteOS design. |
| **What diagnostic probes** | 8 endpoint variants: `/api/materials/kbyd`, `/api/slabs/kbyd?type=Slab&edges=true`, `?type=Remnant`, `?type=Full%20Slab`, `?type=Full%20Slabs`, `?type=All`, `?edges=true`, and bare `/api/slabs/kbyd`. Optional: HAR UUID comparison, Supabase read-only comparison. |
| **No sync changes yet** | No changes to `SLABCLOUD_TYPE`, `cacheSlabCloudInventory.js`, `slabCloudSync.js`, or any production default. Do NOT add a second sync lane (Remnants, Full Slabs, etc.) until diagnostic output is reviewed and operator sign-off given. |
| **Tests** | `eos:test:slabcloud-manager-scope` (pure unit tests: endpoint variant list, HAR UUID extraction, case-insensitive UUID comparison, row analysis, failed endpoint warning handling, no-write contract assertions). `node --check` on all new files. `eos:check:local` passing. |
| **Impacted files** | `backend-core/src/slabcloud/slabCloudManagerScopeDiagnostic.js` (pure helpers), `backend-core/src/scripts/slabcloud/compareSlabCloudManagerScopes.js` (diagnostic script), `backend-core/src/slabcloud/slabCloudManagerScopeDiagnostic.test.mjs` (tests), `package.json` (`eos:slabcloud:manager-scope-diagnostic`, `eos:test:slabcloud-manager-scope`), `docs/eliteos/slabcloud-inventory-poc.md`, `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Revisit trigger** | Diagnostic output reviewed; operator decides whether Remnant/Full Slab sync lane is warranted; SlabCloud confirms approved type variants; type-specific count is added to slabOS summary metrics. |

---

### 73. SlabCloud full inventory cache support — Slabs + Remnants, write-gated scope upgrade

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Upgraded the SlabCloud cache pipeline to support ingesting the full public ESF inventory scope (Slabs + Remnants) via the bare `?edges=true` endpoint (742 rows). Separated `publicSlug`, `apiCompanyCode`, and `assetCompanyCode` into distinct configurable concepts. Added new source provenance fields to every normalized record and payload. Schema draft only — no SQL applied, no writes to Supabase. |
| **Diagnostic basis** | Confirmed by manager-scope diagnostic (Decision #72): `type=Slab` returns 145 rows, `type=Remnant` returns 689 rows, bare `?edges=true` returns 742. Missing inventory is a type/scope filter gap. Company code `kbyd` is confirmed correct for both API and assets. |
| **Correct config model** | `SLABCLOUD_PUBLIC_SLUG=esf` (URL slug, traceability only) · `SLABCLOUD_API_COMPANY_CODE=kbyd` (API requests) · `SLABCLOUD_ASSET_COMPANY_CODE=kbyd` (image URL paths) · `SLABCLOUD_INVENTORY_SCOPE=all` for full catalog. Default remains `slab` to avoid surprising writes on existing production scripts. |
| **Backward compatibility** | `SLABCLOUD_COMPANY_CODE` still maps to `apiCompanyCode`. All existing scripts that pass `companyCode: "kbyd"` continue to work unchanged. New source fields are `null` when not provided — safe for existing syncs. |
| **Schema draft** | `backend-core/supabase/eliteos_slabcloud_inventory_scope_upgrade.sql`. Adds: `source_inventory_type`, `is_remnant` (GENERATED ALWAYS), `source_inventory_scope`, `source_public_slug`, `source_api_company_code`, `source_asset_company_code` to `slab_inventory`; `source_inventory_type`, `source_inventory_scope` to `slab_inventory_raw_records`; `source_asset_company_code` to `slab_images`; scope metadata + row counts to `slabcloud_sync_runs`. 4 new indexes. No DML, no deletes, no RLS changes. |
| **Prerequisites for write-enabled all-scope sync** | SQL migration MUST be applied in Supabase before running write-enabled all-scope sync. Persistence payloads now include new columns; PostgREST will reject them if columns do not exist. Dry-run always safe (no Supabase calls). |
| **is_remnant semantics** | `GENERATED ALWAYS AS (COALESCE(source_inventory_type = 'Remnant', false)) STORED`. Old rows (pre-upgrade) get `false`, not `null`. The upsert payload must NEVER include `is_remnant` — the DB computes it. |
| **Source price group** | `price_group` remains imported-only from SlabCloud. No edit/override controls were added. This field is authoritative from the SlabCloud source. |
| **What is NOT built** | UI changes to `app-slab-inventory`, Elite 100 carousel, Non-Stock tab, public showroom, holds/reservations, quote allocation, price group overrides, scheduled automation, writeback to SlabCloud, inactive/delete marking. No changes to Internal Estimate, Quote Library, Sales Dashboard, Pricing Admin, Moraware, AI Takeoff, Home Launcher, shared EliteosTopbar. |
| **Tests** | Added tests for `scopeToInventoryType`, `buildClientConfig` scope/multi-code, all-scope URL (no `type=` param), `normalizeSlabRecord` source provenance fields, `buildInventoryRows`/`buildRawRecordRows`/`buildImageRows`/`buildSyncRunInsert` new fields, `is_remnant` exclusion from upsert payloads, no-delete/no-deactivate assertions. All suites pass. |
| **Dry-run all-scope confirmed** | `SLABCLOUD_INVENTORY_SCOPE=all SLABCLOUD_API_COMPANY_CODE=kbyd SLABCLOUD_ASSET_COMPANY_CODE=kbyd SLABCLOUD_PUBLIC_SLUG=esf npm run eos:slabcloud:cache` completes successfully with ~742 normalized records. |
| **Impacted files** | `backend-core/supabase/eliteos_slabcloud_inventory_scope_upgrade.sql` (new), `backend-core/src/slabcloud/slabCloudClient.js` (scope constants, `scopeToInventoryType`, `buildClientConfig` extended), `normalizeSlabCloudInventory.js` (source fields), `slabCloudSync.js` (normalizer opts, type breakdown), `slabCloudPersistence.js` (payload builders extended), `backend-core/src/scripts/slabcloud/cacheSlabCloudInventory.js` (new env vars, output), `slabCloudInventoryPoc.test.mjs` (new tests), `slabCloudPersistence.test.mjs` (new tests), `docs/eliteos/slabcloud-inventory-poc.md`, `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md`, `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Manual step required** | Apply `backend-core/supabase/eliteos_slabcloud_inventory_scope_upgrade.sql` in Supabase SQL editor. Then run all-scope dry-run, then capped write-enabled smoke (see SQL file comments for exact command). |
| **Revisit trigger** | SQL migration applied; all-scope write-enabled smoke reviewed and approved; `app-slab-inventory` UI updated to show Remnant filter; scheduled automation proposed. |

---

### 74. SlabCloud typed full-inventory sync — Slab + Remnant lanes, write-gated

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Added `SLABCLOUD_INVENTORY_SCOPE=typed` — a two-lane sync mode that fetches Slab and Remnant lanes separately and merges them with explicit `source_inventory_type` tagging. This is the preferred mode for production sync because it gives every inventory row a known type (Slab or Remnant), enabling the future color modal tab (All / Full slabs / Remnants). The bare `all` scope remains available but produces `source_inventory_type = null` since the bare endpoint does not include a Type field. |
| **Typed dry-run result** | 401 Slab records + 1,278 Remnant records = 1,679 total · 1,679 distinct SlabIDs · **zero overlap** across lanes · 740 distinct colors · 44 materials · 0 warnings. |
| **Overlap finding** | Confirmed: Slab and Remnant lanes have **no overlapping physical SlabIDs** for ESF / kbyd. The same slab UUID does not appear in both `type=Slab` and `type=Remnant` responses. Typed write is safe. |
| **Overlap safety rule** | Write-enabled typed sync **aborts before any DB write** if duplicate SlabIDs are detected across lanes. Error carries the overlapResult for diagnosis. Dry-run warns but proceeds with the report. |
| **Why typed over all** | `all` scope (742 rows from bare `?edges=true`) gives completeness but type is unknown. `typed` scope (1,679 rows via two fetches) gives full type classification. The higher row count in typed reflects detail fetches resolving more individual slabs per color. |
| **INVENTORY_SCOPE_TYPED constant** | `"typed"` — exported from `slabCloudClient.js`. `scopeToInventoryType("typed")` returns `"Slab"` as a safe URL fallback (typed mode never calls this for the combined config). |
| **Per-lane detail fetches** | In typed mode, detail fetches use lane-specific configs: `?name=X&type=Slab&edges=true` for Slab lane, `?name=X&type=Remnant&edges=true` for Remnant lane. This ensures detail records are correctly typed. |
| **source_inventory_scope** | All records in a typed sync get `source_inventory_scope = "typed"` (not "slab" or "remnant"). The lane is identified by `source_inventory_type`. |
| **No hourly automation yet** | No scheduling. Manual typed write smoke is the next step (after capped run proves clean). |
| **No inactive marking** | No rows are ever deactivated or deleted. |
| **What is NOT built** | UI changes to `app-slab-inventory`, Elite 100 carousel, Non-Stock tab, color modal, price group overrides, scheduled automation, writeback, inactive marking. No changes to Internal Estimate, Quote Library, Sales Dashboard, Pricing Admin, Moraware, AI Takeoff, Home Launcher, shared EliteosTopbar. |
| **Tests** | `detectSlabIdOverlap` pure function (6 cases: overlap, no overlap, case-insensitive, empty, null, sample cap). Typed sync dry-run (no overlap, with overlap warning). Typed write-enabled (no overlap → succeeds, with inventory rows showing Slab/Remnant types). Typed write-enabled (overlap → throws before any DB write, zero Supabase calls). All 22 cache + 19 inventory POC tests pass. |
| **Impacted files** | `slabCloudClient.js` (`INVENTORY_SCOPE_TYPED`, updated `scopeToInventoryType`), `slabCloudSync.js` (`detectSlabIdOverlap` export, `runTypedInventorySync` internal, typed branch in `runSlabCloudInventorySync`), `cacheSlabCloudInventory.js` (typed output, overlap display), `slabCloudInventoryPoc.test.mjs` (typed tests), `slabCloudPersistence.test.mjs` (typed write tests), docs. |
| **Manual step required** | Run capped write-enabled typed smoke after reviewing the dry-run output. No new SQL migration needed (columns exist from Decision #73). |
| **Revisit trigger** | Typed write smoke succeeds cleanly; `app-slab-inventory` API + UI updated to expose Remnant filter; Elite 100 / Non-Stock tab scoped; scheduled automation proposed. |

---

### 75. Slab Inventory color-program read API — typed aggregation by color/material/price-group

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Added two read-only backend API endpoints for the next Slab Inventory product model (color-level cards + physical inventory modal). No UI changes. No mutations to `slab_inventory`. No new SQL migration. |
| **New endpoints** | `GET /api/slab-inventory/color-programs` — aggregated color cards (typed rows only, one card per `color_name / material_name / source_price_group`). `GET /api/slab-inventory/colors/:colorKey/inventory` — physical slab + remnant rows for a single color group; supports `?type=all\|slab\|remnant`, `?image_status`, `?active_only`. |
| **Aggregation** | Groups `is_active = true, source_inventory_scope = 'typed', source_inventory_type IN ('Slab','Remnant')` rows by `(color_name, material_name, price_group)`. Counts physical rows — `count_for_color` is **never read or summed**. 10 legacy/null-scope rows are ignored (not deleted, not mutated). |
| **Slab vs Remnant** | `slab_count` and `remnant_count` come from `source_inventory_type` per row. The typed sync (Decision #74) gives every row a known type. |
| **color_key** | Stable, deterministic slug computed by `makeColorKey(color_name, material_name, price_group)`: `slugify(c)+"--"+slugify(m)+"--"+slugify(pg)`. Not a DB ID. Not reversible. Same inputs always produce the same key. Handles null/empty via `"unknown"` fallback. The color inventory endpoint matches rows in JS (full typed row scan at ~1,679 rows — fast and avoids slug-reversal complexity). |
| **Price group order** | Promo, A, B, C, D, E, F — then unknown/other. **Group G is not included** in the current sort order; data is preserved but sorts to the "other" bucket after F. Active ESF groups: Promo/A/B/C/D/E/F only. |
| **Elite 100 / program_status** | All cards return `program_status = "unclassified"`. Elite 100 classification requires a future catalog/override layer (a separate slabOS overlay table mapping color_key → tier). No Elite 100 logic was built in this slice. |
| **Source price group** | `source_price_group` on every card and row is the imported SlabCloud price group (label: "Source price group"). It is NOT slabOS pricing authority. No override UI was added. |
| **verified_photo_count** | Count of `slab_images` rows with `image_status = 'ok'` for slabs in the group. Representative image is the first `ok`-status image found in the group's slab IDs. |
| **Image fetch strategy** | `color-programs` fetches all org-scoped `slab_images` without filtering by slab ID (avoids PostgREST URL-length overflow with large inventories). `colors/:colorKey/inventory` uses `.in(external_slab_id, …)` scoped to the subset — safe because a color group is small. |
| **Auth** | Both endpoints: `requireAuth()` + `requireHeadAccess("slab_inventory")` + `organization_id` scope. Service-role Supabase client only. GET-only. |
| **Staff-safe fields** | `COLOR_INVENTORY_SELECT_COLUMNS` never includes `count_for_color`, `raw_json`, `usable_*`, or meter columns. |
| **Tests** | 8 new pure-unit test blocks in `eos:test:slab-inventory-api`: `COLOR_PROGRAM_PRICE_GROUP_ORDER` (no Group G, frozen), `priceGroupSortIndex` (Promo=0…F=6, G/unknown=7), `makeColorKey` (stable, slug shape, null safety, separator uniqueness), `groupColorPrograms` (aggregation, slab/remnant counts, Group G to other, count_for_color never summed, representative image), `groupColorPrograms` representative image + verified count, `parseColorInventoryParams`, `COLOR_INVENTORY_SELECT_COLUMNS` (includes all fields, no banned fields), route shape (6 GET routes, no mutations). All 16 suites pass. `node --check` + `eos:check:local` green. |
| **What is NOT built** | UI changes to `app-slab-inventory`. Elite 100 tab, carousels, Non-Stock tab, color modal UI. Price group override UI. Scheduled automation. SlabCloud writeback. Inactive/delete marking. Internal Estimate, Quote Library, Sales Dashboard, Pricing Admin, Moraware, AI Takeoff, Home Launcher, shared EliteosTopbar — all untouched. |
| **Impacted files** | `backend-core/src/slabInventory/slabInventoryApi.js` (new helpers + 2 routes), `backend-core/src/slabInventory/slabInventoryApi.test.mjs` (8 new test blocks, import update, route count 4→6), `docs/eliteos/slabcloud-inventory-poc.md` (§12 added), `docs/eliteos/slabos-slab-inventory-profit-engine-roadmap.md` (§12 added), `docs/eliteos/FEATURE_DECISIONS.md` (this entry). |
| **Revisit trigger** | `app-slab-inventory` UI consumes color-program API; Elite 100 catalog/override layer scoped; Non-Stock tab spec written; color modal tab (All/Slabs/Remnants) UI built. |

---

### 76. Elite 100 editable color catalog + fuzzy matching foundation

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Built the backend/data foundation for classifying SlabCloud color groups into Elite 100 vs. Non-Stock vs. needs-review. No UI. No mutations to `slab_inventory`. SQL draft written but NOT yet applied (pending fixture verification by Chris). |
| **New SQL tables (draft)** | `slab_color_collections` (versioned collection records, `is_active=false` until activated), `slab_color_catalog_items` (individual color entries, price_group constrained to Promo/A/B/C/D/E/F, Group G blocked by CHECK), `slab_color_aliases` (alternate spellings for alias-exact matching), `slab_color_program_match_reviews` (per-color match results, `match_method` in [exact, alias, fuzzy, manual, none], `review_status` in [approved, needs_review, rejected]). All 4 tables: RLS enabled, no permissive policies, service-role only. |
| **Elite 100 fixture** | `backend-core/src/slabInventory/fixtures/elite100-2026.json` — 100 colors transcribed from "The 100 Color Collection" screenshot (Promo=15, A=18, B=18, C=17, D=16, E=5, F=11). 9 items flagged with `_review` notes for Chris to verify before write-enabled import. |
| **Fixture transcription uncertainties (9)** | Wiscon White (A/Granite) — may be "Wisconsin White"; Belezza (B/Stratus) — may be "Bellezza"; Regal D'Oro (B/Stratus) — apostrophe encoding; Aurataj (C/Q Quartz) — unusual spelling; Macavella (C/ASMI) — unusual spelling; Larvic (D/ESF) — may be "Larvik"; Solitaj (D/Q Quartz) — unusual spelling; St. Soubirous (D/Aggranite) — unusual name; Calacatta Viol (F/Aggranite) — may be "Calacatta Viola". |
| **Screenshot parsing rule** | Each "The 100 Color Collection" line is `"Color Name - Manufacturer/Brand"`. The left of the final `" - "` delimiter is `color_name`; the right is `material_name`. **Do NOT reverse.** Example: "Alabaster - ESF" → color_name=Alabaster, material_name=ESF. |
| **Matching order** | 1. Exact (normalized color + exact material) → approved. 2. Alias (exact color + compatible material via alias group) → approved. 3. Fuzzy (Levenshtein similarity ≥ 0.75 + compatible material) → needs_review. 4. None → Non-Stock candidate. |
| **Fuzzy safety rule** | Low-confidence fuzzy matches MUST NOT silently classify as Elite 100. ALL fuzzy matches return `review_status=needs_review` regardless of confidence. Operators must review `slab_color_program_match_reviews` before activating Elite 100 classification. |
| **Material aliases** | `ESF` ≡ `ESF Quartz` (same brand, bidirectional alias). `Aggranite` ≡ `Agranite` (alternate spelling variant). Used in alias-exact and fuzzy matching steps. |
| **Group G** | NOT an active ESF price group. The SQL `CHECK` constraint blocks it. The import script rejects fixture files containing Group G. `ACTIVE_PRICE_GROUPS` constant exports only Promo/A/B/C/D/E/F. |
| **Elite 100 is versioned** | The list changes annually. Future versions: add a new `collection_key` (e.g. `elite100-2027`), run import, verify, then set `is_active=true` on the new collection. The frontend must read from Supabase catalog tables, not hardcoded logic. |
| **Source price group rule** | `source_price_group` in the inventory API remains the imported SlabCloud value — NOT slabOS pricing authority. The catalog's `price_group` is the slabOS program tier, which may differ. |
| **Import script** | `importElite100Catalog.js` — dry-run by default; write-enabled with `ELITE100_CATALOG_WRITE_ENABLED=1`. Validates groups, rejects Group G, normalizes, builds `color_key`, prints review flags. Upserts to `slab_color_collections` + `slab_color_catalog_items`. Does NOT touch `slab_inventory`, pricing tables, or SlabCloud. |
| **Preview script** | `previewElite100Matches.js` — no writes. Loads catalog from fixture. Loads source from Supabase typed inventory (when credentials + org-id provided) or runs fixture self-test. Prints exact/alias/fuzzy/none counts + needs-review samples + Non-Stock samples. |
| **Tests** | 18 pure-unit test suites in `eos:test:slab-color-program-matching`: ACTIVE_PRICE_GROUPS (no G, frozen), MATERIAL_ALIAS_GROUPS, normalizeColorName (& → and, apostrophe, idempotent), normalizeMaterialName, materialsCompatible (aliases bidirectional), buildColorKey (stable, separator-safe), levenshtein, similarityScore, compareCatalogToSourceColor (exact/alias/fuzzy/blocked-material), matchSourceColorToCatalog (ranking, review_status), low-confidence fuzzy never auto-approves, matchAllSourceColors (batch, Non-Stock=none), screenshot parsing convention, fixture group counts=100 no G, fixture display_name convention. All 18 pass. `eos:check:local` green. |
| **What is NOT built** | Elite 100 carousel UI. Non-Stock tab UI. Color modal UI. Price group override UI. Scheduled automation. Supabase writes on match (match_reviews table is defined but not populated by automation). Changes to `slab_inventory`, `app-slab-inventory`, pricing tables, or any SlabCloud writeback. |
| **Impacted files** | `backend-core/supabase/eliteos_slab_inventory_color_catalog.sql` (new), `backend-core/src/slabInventory/fixtures/elite100-2026.json` (new), `backend-core/src/slabInventory/colorProgramMatching.js` (new), `backend-core/src/slabInventory/colorProgramMatching.test.mjs` (new), `backend-core/src/scripts/slabInventory/importElite100Catalog.js` (new), `backend-core/src/scripts/slabInventory/previewElite100Matches.js` (new), `package.json` (`eos:elite100:import-catalog`, `eos:elite100:preview-matches`, `eos:test:slab-color-program-matching`; `eos:check:local` updated), docs (this entry). |
| **Manual steps required** | 1. Chris verifies 9 flagged items in `elite100-2026.json` against original document. 2. Apply `backend-core/supabase/eliteos_slab_inventory_color_catalog.sql` in Supabase SQL editor. 3. `npm run eos:elite100:import-catalog` (dry-run, review output). 4. After approval: `ELITE100_CATALOG_WRITE_ENABLED=1 SLABOS_ORGANIZATION_ID=<org> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run eos:elite100:import-catalog`. 5. `npm run eos:elite100:preview-matches` with live credentials. 6. Review match results; set `is_active=true` on collection after verifying. |
| **Revisit trigger** | SQL applied; fixture verified and imported; match preview reviewed against live typed inventory; Elite 100 carousel UI spec written; Non-Stock tab spec written. |

---

### 77. Elite 100 alias/review decisions — Chris batch #1 applied

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Applied Chris's first fuzzy-match review batch. 8 fuzzy candidates were promoted to approved aliases; 2 were explicitly rejected. Aliases are stored as `slab_color_aliases` rows. Rejections are stored as `slab_color_program_match_reviews` rows with `review_status=rejected`. Collection `is_active` remains `false`—activation is a manual step after previewing updated match counts. |
| **8 approved aliases (source → catalog)** | `Winter Fresh/ESF Quartz → Winterfresh/ESF [C]` (word split + material alias), `Belfast Grey/Aggranite → Belfast Gray/Aggranite [C]` (Grey vs Gray), `Classic Gray/ESF Quartz → Classic Grey/ESF [Promo]` (Gray vs Grey + material alias), `Costal Tide/ESF Quartz → Coastal Tide/ESF [B]` (missing 'a' + material alias), `Regal D Oro/Stratus → Regal D'Oro/Stratus [B]` (missing apostrophe), `Skys The Limit/ESF Quartz → Sky's the Limit/ESF [A]` (missing apostrophe + material alias), `Larvik/ESF Quartz → Larvic/ESF [D]` (k→c + material alias; also confirms catalog spelling is 'Larvic'), `Whitendale/Cambria → Whitenedale/Cambria [A]` (missing 'e'). |
| **2 rejected fuzzy candidates** | `Calacatta Athena/Stratus` → rejected against `Calacatta Lucent/Stratus [A]` (different colors, shared prefix only). `Armitage/Cambria` → rejected against `Hermitage/Cambria [D]` (different colors, fuzzy similarity was spurious). Both explicitly blocked to prevent mis-classification as Elite 100. |
| **Matching order (updated)** | 1. Exact (normalized color + exact material) → approved. 2. Material-alias (exact color + MATERIAL_ALIAS_GROUPS compatible) → approved. 3. **DB alias** (Chris-approved `slab_color_aliases` exact match) → alias/approved. 4. Fuzzy (Levenshtein similarity ≥ 0.75 + compatible material) → needs_review. 5. None → Non-Stock. |
| **Fuzzy safety rule (unchanged)** | Fuzzy matches are NEVER auto-approved as Elite 100. They remain `needs_review`. Only an explicit DB alias or exact/material-alias match can approve without human review. Rejected fuzzy records block mis-classification. |
| **Seed fixture** | `backend-core/src/slabInventory/fixtures/elite100-2026-alias-review-seed.json` — all 8 approved + 2 rejected in one JSON file with `reviewed_by: "Chris"` and `review_status` on every entry. This is the human-auditable record of the review batch. |
| **Import script** | `importElite100AliasReviews.js` — dry-run by default; write-enabled with `ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1`. Upserts `slab_color_aliases` rows for approved candidates; upserts `slab_color_program_match_reviews` rows for rejected candidates. Never touches `slab_inventory`. Never activates the collection. |
| **Preview script (updated)** | `previewElite100Matches.js` now uses `matchAllSourceColorsWithAliases()`. When Supabase creds are provided, it loads `slab_color_aliases` (joined with catalog items) and `slab_color_program_match_reviews` (rejected rows). DB aliases are applied before fuzzy fallback. Rejected entries are moved from fuzzy to a blocklist bucket. Summary now prints rejected-fuzzy count separately. |
| **New exports in colorProgramMatching.js** | `matchSourceColorWithAliases(source, catalogItems, resolvedAliases, opts)`, `matchAllSourceColorsWithAliases(…)`, `buildAliasPayload(candidate, orgId, catalogItemId)`, `buildRejectReviewPayload(candidate, orgId, catalogItemId)`. All pure, no Supabase calls. |
| **Tests added** | 11 new test cases in `eos:test:slab-color-program-matching`: alias-review seed fixture shape (8 approved / 2 rejected / required fields), `buildAliasPayload` (correct payload, no inventory fields, no collection activation), `buildRejectReviewPayload` (correct payload, review_status=rejected, null catalogItemId safe), `matchSourceColorWithAliases` (DB alias overrides fuzzy / exact takes priority over DB alias / no alias falls back to fuzzy), `matchAllSourceColorsWithAliases` (approved aliases reduce fuzzy count, Non-Stock unchanged), rejected fuzzy not classified as Elite 100, payload builders never activate collection, no slab_inventory references. All 30 test suites pass. `eos:check:local` green. |
| **What is NOT built** | Collection activation (still manual). Elite 100 carousel UI. Non-Stock tab UI. Scheduled automation. Any mutation to `slab_inventory`. Any SlabCloud writeback. |
| **Impacted files** | `backend-core/src/slabInventory/fixtures/elite100-2026-alias-review-seed.json` (new), `backend-core/src/slabInventory/colorProgramMatching.js` (4 new exports), `backend-core/src/slabInventory/colorProgramMatching.test.mjs` (11 new test suites), `backend-core/src/scripts/slabInventory/importElite100AliasReviews.js` (new), `backend-core/src/scripts/slabInventory/previewElite100Matches.js` (alias-aware matching, rejection blocklist, updated summary), `package.json` (`eos:elite100:import-alias-reviews` added; `eos:check:local` updated), docs (this entry). |
| **Manual next steps for Chris** | 1. Verify SQL tables are applied in Supabase (Decision #76 prerequisite). 2. Import catalog: `ELITE100_CATALOG_WRITE_ENABLED=1 ... npm run eos:elite100:import-catalog` (if not already done). 3. Import aliases + rejections: `ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1 SLABOS_ORGANIZATION_ID=<org> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run eos:elite100:import-alias-reviews`. 4. Preview updated match counts: `SLABOS_ORGANIZATION_ID=<org> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run eos:elite100:preview-matches`. 5. Confirm alias matches reduce fuzzy count to 0 (or near-zero). 6. Manually activate collection when confident: `UPDATE slab_color_collections SET is_active=true WHERE collection_key='elite100-2026' AND organization_id='<org>'`. |
| **Revisit trigger** | Aliases + rejections imported to Supabase; preview shows expected exact+alias counts; carousel UI scoped; Non-Stock tab spec written. |

---

### 78. Slab Inventory Elite 100 / Non-Stock UI v1 — color browser shipped

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Shipped the Slab Inventory color-program browser UI. The head is restructured with three tabs: Elite 100 (premium showroom), Non-Stock (utility gallery), All Inventory (operational fallback). Three new read-only API endpoints added. All inventory behavior remains read-only. No mutations to `slab_inventory`. No SlabCloud writeback. |
| **Tab layout** | Default: Elite 100. Tabs: Elite 100 · Non-Stock · All Inventory. Existing raw slab browser preserved under All Inventory tab. |
| **Elite 100 carousels** | One horizontal carousel per price group (Promo, A, B, C, D, E, F). One card per catalog color. Cards: white mat, contained image (4:3 inside 12px padding), color name label, subtle count meta. Zero-inventory colors show "No inventory" badge — still render in carousel. No Group G. |
| **Color Inventory Modal** | Opened from Elite 100 and Non-Stock cards. Header: Elite 100 badge, group, color name, material, counts. Body: Full Slabs section first, Remnants section second. Each physical item: thumbnail, dims, thickness, rack/lot, inventory ID, source PG badge. Keyboard: Escape closes. |
| **Non-Stock tab** | Searchable responsive grid (auto-fill minmax 180px). Cards show color name, material, source PG badge, availability count. Uses existing `GET /api/slab-inventory/colors/:colorKey/inventory` for modal. |
| **New backend endpoints (all GET, read-only)** | `GET /api/slab-inventory/elite100-programs` — active catalog by Promo/A–F, enriched with live typed inventory counts + representative images, returns all 100 items including zero-inventory. `GET /api/slab-inventory/elite100-programs/:catalogItemId/inventory` — physical slabs and remnants for one catalog item, matched by exact + alias only (no fuzzy). `GET /api/slab-inventory/non-stock-programs` — one card per typed color/material not matched to Elite 100. All behind `requireAuth()` + `requireHeadAccess("slab_inventory")`, `organization_id` scoped, never reads `count_for_color`. |
| **Matching (backend)** | Elite 100 endpoint uses `buildElite100InventoryMap()` (exported, testable pure helper). Matching order: 1. Exact normalized color+material. 2. Material alias (MATERIAL_ALIAS_GROUPS). 3. DB alias (approved `slab_color_aliases`). Fuzzy + unmatched → Non-Stock. No fuzzy can reach Elite 100 without an explicit alias record. |
| **program_status values** | `"elite_100"` on all Elite 100 catalog cards. `"non_stock"` on all non-stock cards. |
| **Tests** | 22 passing test cases in `slabInventoryApi.test.mjs` (was 15): new tests for `buildElite100InventoryMap` (exact+alias only counted, fuzzy excluded, empty catalog, zero-inventory preserved), non-stock `program_status` override, Group G absence, slab/remnant separation. All 30 matching tests in `colorProgramMatching.test.mjs` still pass. `eos:check:local` green. All head builds pass. |
| **Design** | Light eliteOS design. No dark mode. Apple/Stripe-level cleanliness. White mat around contained stone image. Color name is the only primary label on Elite 100 cards. No heavy dashboard chrome. No dense stats above cards. Smooth horizontal carousel scroll. |
| **What is NOT built** | Holds / reservations. Quote allocation. Price group override UI. Automation. Scheduled sync. Customer-facing SlabRoom. Supabase writes from frontend. Any SlabCloud/Slabsmith writeback. |
| **Impacted files** | `backend-core/src/slabInventory/slabInventoryApi.js` (3 new routes + `buildElite100InventoryMap` export + colorProgramMatching.js import), `backend-core/src/slabInventory/slabInventoryApi.test.mjs` (7 new test cases), `app-slab-inventory/src/SlabInventoryApp.tsx` (full restructure — tabs, Elite 100 carousels, Non-Stock grid, Color Inventory Modal, preserved All Inventory), `app-slab-inventory/src/styles.css` (tab bar, Elite 100 section + carousel, cp-card, cim-overlay + cim modal, pi-card, ns-grid + ns-card), docs (this entry + `slabcloud-inventory-poc.md` Phase 4 + roadmap Phase 14). |
| **Manual QA checklist** | 1. Sign in → Elite 100 tab loads carousels (Promo through F, no G). 2. At least one card shows a stone image (kbyd image_status=ok=1679). 3. Zero-inventory card shows "No inventory" badge. 4. Click a card → Color Inventory Modal opens; slabs appear before remnants. 5. Click Non-Stock → grid loads, colors not in Elite 100 appear. 6. Non-Stock search filters cards. 7. Click Non-Stock card → modal opens. 8. Click All Inventory → existing raw browser works, health panel, sort/filter, lightbox. 9. Escape key closes modal. 10. No `count_for_color` in any API response (confirm in network tab). |
| **Revisit trigger** | After QA; for Non-Stock v2 (add price-group grouped sections); for Elite 100 v2 (curated card art, mobile scroll indicators). |


---

## 79. SlabCloud v2 Texture Endpoint Diagnostic (2026-06-05)

| Field | Value |
|---|---|
| **Date** | 2026-06-05 |
| **Decision** | Build a read-only diagnostic layer to investigate SlabCloud public v2 product/color endpoints and their texture image assets, as a prerequisite for enriching Elite 100 cards with product-level stone imagery. |
| **Endpoints investigated** | `GET /api/v2/inventory/{companyCode}?cq_type=&cq_material=` (product color rows); `GET /api/v2/product/{companyCode}?slug={slug}&mat={material}` (product detail); texture images at `/scdata/textures/600/{hash}.jpg` and `/1024/{hash}.jpg` |
| **Texture enrichment status** | Diagnostic tooling only. No texture URLs stored in Supabase yet. No UI changes yet. |
| **Future image priority** | 1. v2 texture image (`/scdata/textures/600` or `/1024`); 2. Representative verified slab thumbnail from typed `slab_inventory`; 3. Initials / placeholder. |
| **Inventory authority** | `slab_inventory` typed rows remain the **sole source of truth** for counts, physical slabs, and remnants. SlabCloud v2 `count` field is labeled as display-only and never used for inventory authority. |
| **Safety** | No Supabase writes. No SlabCloud writes. `slab_inventory` is untouched. Supabase comparison (if enabled) is read-only. Product endpoint sampling defaults to `SLABCLOUD_V2_PRODUCT_SAMPLE_LIMIT=0`. |
| **Files added** | `backend-core/src/slabcloud/slabCloudV2TextureDiagnostic.js` (pure helpers); `backend-core/src/scripts/slabcloud/inspectSlabCloudV2Textures.js` (diagnostic script); `backend-core/src/slabcloud/slabCloudV2TextureDiagnostic.test.mjs` (46 tests) |
| **Tests** | 46 unit tests — all passing. No network required for tests. |
| **What is NOT built** | Texture hash storage in Supabase. Elite 100 API texture enrichment. UI changes. Any image verification or download. |
| **Next step** | Run `npm run eos:slabcloud:v2-texture-diagnostic` with live credentials to assess texture coverage. If coverage > 60%, proceed to SQL/cache layer (new column or join table on `slab_color_catalog_items`) and enrich `GET /api/slab-inventory/elite100-programs` response with texture URLs. |
| **Revisit trigger** | After live diagnostic run reveals texture coverage numbers; before Elite 100 card imagery upgrade. |

---

### 80. Elite 100 Alias/Review Import — Idempotency Fix (2026-06-05)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Fixed the Elite 100 alias/review import script to be fully idempotent without relying on Supabase `upsert` / `ON CONFLICT` constraints. Production was manually unblocked; the script and SQL schema are now both durable for future annual alias batches. |
| **Root cause** | `importElite100AliasReviews.js` called `.upsert(payload, { onConflict: "..." })` but `slab_color_aliases` and `slab_color_program_match_reviews` had no unique indexes matching the ON CONFLICT spec. Supabase rejected with "there is no unique or exclusion constraint matching the ON CONFLICT specification." |
| **Production unblock (manual)** | Chris manually inserted the 8 approved alias rows and 2 rejected review rows via direct SQL to unblock production. The 10 rows are live. |
| **Import script fix** | Replaced `upsert` / `onConflict` with a **SELECT-then-INSERT** pattern. For each alias/review candidate: (1) query for an existing row using the logical uniqueness key; (2) if found, log "SKIP (already exists)" and move on; (3) if not found, `.insert(payload)`. This approach works on any DB schema version, even without the new unique indexes. Nullable fields (`normalized_alias_material_name`, `matched_catalog_item_id`) use `.is("col", null)` instead of `.eq("col", null)` to avoid the PostgreSQL `col = NULL` vs `col IS NULL` pitfall. |
| **New exported helpers** | `findExistingAlias(supabase, orgId, catalogItemId, normColor, normMaterial, sourceSystem)` and `findExistingReview(supabase, orgId, normColor, normMaterial, matchMethod, reviewStatus, matchedCatalogItemId)` — both async, both exported, both injectable for testing without mocking the entire Supabase module. |
| **SQL schema additions** | `eliteos_slab_inventory_color_catalog.sql` now includes two idempotent unique indexes: `uq_slab_color_aliases_import_key` (org + catalog_item + norm color + norm material + source_system, NULLS NOT DISTINCT) and `uq_slab_color_program_match_reviews_import_key` (org + norm source color + norm source material + match_method + review_status + matched_catalog_item_id, NULLS NOT DISTINCT). These are safety guards — the script no longer requires them. |
| **Unique index design** | `NULLS NOT DISTINCT` (PostgreSQL 15+) ensures two rows with the same NULL-bearing key are treated as duplicates, which is correct behavior for import deduplication. |
| **Tests added** | 13 new test cases in `colorProgramMatching.test.mjs`: `findExistingAlias` returns row when found; returns null when not found; uses `.is()` for null material; uses `.eq()` for non-null material; propagates Supabase errors. `findExistingReview` returns row when found; returns null when not found; uses `.is()` for null material and null catalog item. Source code scan: no `.upsert(` or `onConflict` in import script; import script uses `.insert(payload)`; `createClient()` guarded by `!isDryRun`; `slab_inventory` not referenced; `is_active=true` never set. All 42 test suites pass (was 29). `eos:check:local` green. |
| **Future annual imports** | Use the script, not manual SQL. Run: `ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1 SLABOS_ORGANIZATION_ID=<org> SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run eos:elite100:import-alias-reviews`. The script is safe to re-run — existing rows are detected and skipped. |
| **What is NOT changed** | App UI. Elite 100 carousel behavior. Non-Stock tab. Texture diagnostic logic. Collection `is_active`. `slab_inventory` table. Group G. |
| **Impacted files** | `backend-core/src/scripts/slabInventory/importElite100AliasReviews.js` (SELECT-then-INSERT, exported helpers, main() guard), `backend-core/supabase/eliteos_slab_inventory_color_catalog.sql` (2 unique indexes + updated apply steps), `backend-core/src/slabInventory/colorProgramMatching.test.mjs` (13 new test suites), docs (this entry). |
| **Revisit trigger** | Annual Elite 100 refresh when Chris reviews a new alias batch. |

---

### 81. Elite 100 Representative Image — Scored Selection (2026-06-05)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-05 |
| **Decision** | Replace "first verified image" heuristic with a deterministic scoring system that always picks the best available physical slab photo per Elite 100 catalog color. |
| **Motivation** | v2 texture diagnostic showed only 27/100 Elite 100 colors have SlabCloud v2 texture images. Building a texture cache is deferred. Instead, improve representative image quality from the existing `slab_inventory` + `slab_images` data by scoring rows rather than accepting the first ok image. |
| **v2 texture status** | Total v2 rows: 741. Rows with texture: 291 (39.3%). Elite 100 with texture: 27/100. v2 texture cache deferred; will be revisited when coverage improves or as optional enrichment. |
| **Scoring rules** | 1. Row must have `image_status = 'ok'` AND at least one URL. Non-ok rows score 0. 2. `source_inventory_type = 'Slab'` (tier 2) >> `'Remnant'` (tier 1) >> other (tier 0). Type tier × 100 000 ensures Slab always beats any Remnant regardless of area. 3. Physical area (`width_actual_in × length_actual_in`) is the tiebreaker within the same type tier. Missing dimensions receive area = 0. |
| **New exports** | `scoreRepresentativeInventoryImage(invRow, image)` → number (0 = not usable). `chooseRepresentativeInventoryImage(invRows, imageMap)` → `{ representative_image_url, representative_thumbnail_url, representative_image_source_inventory_type, representative_image_inventory_id }`. Both pure, no Supabase, deterministic. |
| **buildElite100InventoryMap update** | Accumulator now tracks `rows: []` (full inventory rows) in addition to `slabIds`. This feeds `chooseRepresentativeInventoryImage` without a second pass. Backward-compatible: `slabIds`, `slabCount`, `remnantCount` unchanged. |
| **API response additions** | `GET /api/slab-inventory/elite100-programs` cards now include `representative_image_source_inventory_type` (e.g. "Slab" or "Remnant") and `representative_image_inventory_id`. Existing `representative_image_url` and `representative_thumbnail_url` fields unchanged. |
| **Frontend** | `Elite100Item` TypeScript type updated with two new optional fields. No UI layout changes. No card redesign. |
| **Safety** | `slab_inventory` not mutated. `count_for_color` not read. No SlabCloud/Slabsmith writeback. No collection activation. No Group G. |
| **Tests** | 9 new test suites in `slabInventoryApi.test.mjs` (was 22 → 31): `scoreRepresentativeInventoryImage` (Slab>Remnant, ok>missing, area tiebreaker, deterministic, count_for_color not involved); `chooseRepresentativeInventoryImage` (all 6 scenarios); `buildElite100InventoryMap` rows tracked; zero-inventory null image; rejected/fuzzy rows check; alias resolution. `eos:check:local` green. All builds clean. |
| **What is NOT changed** | Non-Stock tab logic. `groupColorPrograms` representative image logic (unchanged — Non-Stock still uses first-ok). Texture diagnostic. Import scripts. Alias/review logic. `slab_inventory` table. |
| **Revisit trigger** | When SlabCloud v2 texture coverage for Elite 100 exceeds 60% — then layer in texture URLs as an optional enrichment on top of the scored slab images. |

---

### 82. Slab Inventory Visual Asset Cache — SlabCloud v2 Texture Layer, Write-Gated (2026-06-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-06 |
| **Decision** | Build a write-gated `slab_color_visual_assets` cache table to store SlabCloud v2 texture URLs for presentation enrichment. Visual assets are ENRICHMENT ONLY. Typed `slab_inventory` remains the sole source of truth for physical slabs, counts, rack, lot, dimensions, and availability. Never use SlabCloud v2 display counts or `count_for_color` as inventory authority. |
| **Context** | Texture diagnostic results: 741 total v2 rows, 291 with texture (39.3%). 100 active Elite 100 items, 27 with v2 texture (27%), 73 without. 264 Non-Stock rows with texture. Coverage too low to fully solve Elite 100 visuals, but valuable as enrichment layer. |
| **Image priority (full chain)** | 1. `approved + is_primary` visual asset for catalog item → 2. `imported` visual asset from slabcloud_v2 → 3. Best representative verified slab photo (scored: Slab >> Remnant, area tiebreaker) → 4. Initials placeholder. |
| **SQL schema** | `backend-core/supabase/eliteos_slab_color_visual_assets.sql` — draft, do not auto-apply. New table `slab_color_visual_assets`: id, organization_id, catalog_item_id (nullable FK to catalog items), source_system, company codes, source/normalized color+material, product_slug, texture_hash, texture URLs (600/1024), asset URLs, asset_kind (texture/slab_photo/manufacturer/manual_upload/generated), review_status (imported/approved/needs_review/rejected), is_primary, is_active, confidence_score, match_method, raw, timestamps. Indexes: active, catalog item, norm color, source+hash, primary. Unique index for idempotent import on (org, source_system, company_code, product_slug, texture_hash) with NULLS NOT DISTINCT. RLS enabled, no permissive policies — service-role only. |
| **Pure helpers** | `backend-core/src/slabcloud/slabCloudVisualAssetCache.js`: `buildVisualAssetRow(v2Row, orgId, catalogItemId, matchMethod, opts)` → row payload or null (null if no texture_hash). `findExistingVisualAsset(supabase, orgId, companyCode, productSlug)` → async lookup for SELECT-then-INSERT idempotency. Constants: `VISUAL_ASSET_KIND_VALUES`, `VISUAL_ASSET_REVIEW_STATUS_VALUES`, `VISUAL_ASSET_MATCH_METHOD_VALUES`. |
| **Cache script** | `backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js`: fetch v2 inventory → normalize rows → load Elite 100 catalog + aliases → match rows (exact/alias) → build asset payloads → dry-run summary by default. Write mode: `SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1` required. SELECT-then-INSERT/UPDATE per row. Skips rows without texture_hash. Never touches slab_inventory. Never uses count_for_color. Exports `loadCatalogForCache`, `buildVisualAssetPayloads`, `computeDryRunSummary`, `writeVisualAssetRow` for testing. main() guarded by `process.argv[1] === __filename`. |
| **API enrichment helpers** | New exports in `slabInventoryApi.js`: `chooseVisualAssetForDisplay(assets)` — picks best asset (approved/primary > approved > imported/texture > imported; rejected/needs_review skipped). `buildVisualAssetEnrichmentFields(asset)` — returns `{visual_asset_url, visual_asset_url_600, visual_asset_url_1024, visual_asset_source, visual_asset_kind, visual_asset_review_status}`. `buildVisualAssetMap(assetRows)` — Map<catalog_item_id, best_asset>. `buildNonStockVisualAssetMap(assetRows)` — Map<normColor\|\|normMaterial, best_asset>. |
| **Route enrichment** | `GET /api/slab-inventory/elite100-programs`: loads visual assets by catalog_item_id IN list, builds visual asset map, merges enrichment fields into each card. Gracefully skips if table not installed (isMissingRelationError). Existing fields unchanged. New fields added: `visual_asset_url`, `visual_asset_url_600`, `visual_asset_url_1024`, `visual_asset_source`, `visual_asset_kind`, `visual_asset_review_status`. `GET /api/slab-inventory/non-stock-programs`: loads non-stock visual assets (catalog_item_id IS NULL), matches by normalized color+material key, adds enrichment fields. |
| **Frontend** | `Elite100Item` type: added 6 new optional visual asset fields. `Elite100Card`: image src priority: `visual_asset_url_600 \|\| visual_asset_url_1024 \|\| representative_thumbnail_url \|\| representative_image_url`. Modal hero image: same priority via `representativeImageUrl` prop (set from visual asset first). No layout or card redesign. |
| **Safety guardrails** | No slab_inventory mutations. No catalog activation changes. No SlabCloud writebacks. No Group G. No count_for_color. No v2 display count as inventory authority. No broad RLS policies. Write requires explicit env var. Texture rows without hash are skipped. |
| **73 missing Elite 100 textures** | Still need Slabsmith / manufacturer image upload / manual upload strategy. The visual asset table supports `asset_kind = 'manufacturer'` and `asset_kind = 'manual_upload'` for future phases. |
| **Tests added** | `slabCloudVisualAssetCache.test.mjs`: 29 test cases covering constants, buildVisualAssetRow (basic, opts, match_method validation, authority safety), findExistingVisualAsset (mock Supabase, idempotency, null slug), safety source scans. `slabInventoryApi.test.mjs`: 15 new test cases for chooseVisualAssetForDisplay (5), buildVisualAssetEnrichmentFields (3), buildVisualAssetMap (3), buildNonStockVisualAssetMap (1), image priority (2), count guardrails (1). |
| **Scripts added** | `npm run eos:slabcloud:v2-texture-cache` (dry-run), `npm run eos:test:slabcloud-visual-asset-cache`. Both added to `eos:check:local`. |
| **What is NOT changed** | slab_inventory table. slab_color_catalog_items.is_active. groupColorPrograms image logic for Non-Stock (unchanged — Non-Stock still uses existing scored selection + now enriched with visual assets if available). Import scripts. Alias/review logic. Internal Estimate, Quote Library, Sales Dashboard, Pricing Admin, Moraware, AI Takeoff, Home Launcher, shared EliteosTopbar. Group G. |
| **Impacted files** | `backend-core/supabase/eliteos_slab_color_visual_assets.sql` (new SQL draft), `backend-core/src/slabcloud/slabCloudVisualAssetCache.js` (new), `backend-core/src/slabcloud/slabCloudVisualAssetCache.test.mjs` (new, 29 tests), `backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js` (new), `backend-core/src/slabInventory/slabInventoryApi.js` (4 new exports + visual asset helpers + both routes enriched), `backend-core/src/slabInventory/slabInventoryApi.test.mjs` (15 new tests), `app-slab-inventory/src/SlabInventoryApp.tsx` (Elite100Item type + image priority), `package.json` (2 new scripts + check:local updated), docs (this entry). |
| **Revisit trigger** | After SQL is applied and write-mode cache runs, verify `visual_asset_url_600` appears on Elite 100 cards via API. Future: operator `approved + is_primary` promotion workflow (review_status → approved, is_primary = true). |

### 83. Deep SlabCloud v2 Product Texture Sweep — Optional Per-Product Endpoint Fetch (2026-06-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-06 |
| **Decision** | Extend the visual asset cache script with an optional deep sweep mode (`SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1`) that calls `GET /api/v2/product/kbyd?slug=...&mat=...` for each color lacking a bulk texture hash. Product endpoint results are presentation enrichment only. `slab_inventory` remains the sole inventory authority. Product endpoint slab counts and display counts are never read, stored, or used. |
| **Context** | Bulk v2 inventory found only 34/100 Elite 100 textures (34%). Manual inspection showed product endpoints can expose texture hashes missing from the bulk response. A bounded, write-gated automated sweep avoids manual clicking through every SlabCloud color. |
| **Pre-sweep state** | 291 visual assets imported, 34 Elite 100 catalog items with texture. |
| **New pure helpers** | Added to `slabCloudVisualAssetCache.js`: `extractTextureHashFromProductResponse(raw)` — handles texture as string/array/object/config.texture; never reads count fields. `buildProductEndpointCandidates(normalizedRows, opts)` — deduplicates by `product_slug+normalized_material_name`; `onlyMissing=true` default; `limit` cap. `mergeProductTextureIntoRow(row, hash, url, sweepResult, baseUrl)` — pure merge with discovery metadata in `raw`; never includes count fields. `applyDeepSweepTextures(normalizedRows, deepSweepMap, baseUrl)` — annotates all rows with `texture_discovery_source`; does NOT overwrite existing bulk textures. |
| **New async helpers** | Added to `cacheSlabCloudV2Textures.js`: `runDeepSweep(candidates, fetchImpl, baseUrl, companyCode, opts)` — bounded concurrency (default 3), 15 s timeout per request, continues on error, collects warnings, exported with injectable `fetchImpl` for testing. `fetchJsonWithTimeout(url, timeoutMs, fetchImpl)` — AbortController-based; public endpoints only, no cookies/auth. |
| **New env vars** | `SLABCLOUD_V2_TEXTURE_DEEP_SWEEP=1` (enable), `SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_LIMIT` (0=no cap), `SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_CONCURRENCY` (default 3), `SLABCLOUD_V2_TEXTURE_DEEP_SWEEP_ONLY_MISSING` (default 1). |
| **Discovery metadata** | Every visual asset `raw` now includes `texture_discovery_source` = `"bulk_inventory"` or `"product_endpoint"`. Product-discovered rows also include `product_endpoint_url`, `product_response_keys`, `product_texture_value`. No cookies, auth headers, or private session data stored. |
| **Dry-run summary fields added** | `bulk_rows_with_texture`, `deep_sweep_enabled`, `deep_sweep_only_missing`, `product_endpoint_candidates`, `product_endpoint_calls_attempted`, `product_endpoint_calls_succeeded`, `product_endpoint_calls_failed`, `product_endpoint_textures_found`, `product_endpoint_textures_new_to_bulk`, `total_assets_before/after_deep_sweep`, `matched_elite100_assets_before/after_deep_sweep`, `elite100_ids_with_texture_before/after_deep_sweep`, `elite100_still_missing_texture`, `sample_newly_discovered_product_textures`, `sample_failed_product_calls`. |
| **Idempotency** | Preserves existing SELECT-then-INSERT/UPDATE pattern. Dedup key: `(organization_id, source_system, source_api_company_code, product_slug, texture_hash)`. If product endpoint rediscovers an existing bulk-imported texture, `last_seen_at`/`raw` is updated. No upsert/onConflict. |
| **Safety guardrails** | Public endpoints only. No cookies. No auth headers. No image downloads. No HTML scraping. Writes require `SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1`. Bounded concurrency. Timeout per request. Continue on failure. Warnings collected, run never crashes for HTTP errors. Existing bulk textures never overwritten. slab_inventory never touched. count_for_color never used. SlabCloud display counts never used as inventory authority. |
| **Tests added** | 39 new test cases in `slabCloudVisualAssetCache.test.mjs` covering: `extractTextureHashFromProductResponse` (11), `buildProductEndpointCandidates` (8), `mergeProductTextureIntoRow` (5), `applyDeepSweepTextures` (6), `runDeepSweep` async with mock fetch (5), `computeDryRunSummary` deep sweep fields (2), `buildVisualAssetPayloads` discovery source (2), safety source scans (4 new). Total: 68 tests passing. |
| **What is NOT changed** | SQL schema. slab_inventory. slab_color_catalog_items.is_active. API routes. Frontend image priority logic. slabInventoryApi.js. colorProgramMatching.js. All other heads and shared components. Group G. |
| **Impacted files** | `backend-core/src/slabcloud/slabCloudVisualAssetCache.js` (4 new exports), `backend-core/src/slabcloud/slabCloudVisualAssetCache.test.mjs` (+39 tests, 68 total), `backend-core/src/scripts/slabcloud/cacheSlabCloudV2Textures.js` (deep sweep + updated summary + `runDeepSweep`/`fetchJsonWithTimeout` exports), docs (this entry + Phase 9 in PoC + Phase 19 in roadmap). |
| **Open gap** | Product endpoint sweep may still miss textures that don't exist in SlabCloud. Those need Slabsmith originals, manufacturer images, or operator manual upload (`asset_kind = 'manufacturer'`/`'manual_upload'` already in schema). |
| **Revisit trigger** | After write-mode deep sweep: check `slab_color_visual_assets` Elite 100 coverage. If still <60%, evaluate manufacturer image bulk import or manual upload flow. |

---

### 84. Hourly SlabCloud Typed Inventory Sync — Protected Backend Automation Foundation (2026-06-06)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-06 |
| **Decision** | Add a protected backend-only sync endpoint (`POST /api/internal/slabcloud/hourly-sync`) that a scheduler can call hourly to keep the typed SlabCloud inventory cache fresh. The endpoint does NOT expose sync controls to the browser, does not shell out to npm, and does not put service-role keys in any frontend app. |
| **Motivation** | Typed inventory (1,679 records: ~401 Slab + ~1,278 Remnant) is accurate but only as fresh as the last manual sync. Customers and sales staff need accurate availability. Hourly automation is the minimum cadence to stay current with physical slab changes. |
| **Endpoint** | `POST /api/internal/slabcloud/hourly-sync` — registered via `attachSlabCloudHourlySyncRoutes` imported into `backend-core/src/server.js`. |
| **Security** | Requires `x-eos-cron-secret: <EOS_CRON_SECRET>` header (primary: Cloudflare Worker / external callers) OR `Authorization: Bearer <EOS_CRON_SECRET>` (secondary: Vercel Cron native). Rejects with 401 if header missing/wrong. Returns 500 if `EOS_CRON_SECRET` is not configured on the backend. |
| **Org ID** | Read from `SLABOS_ORGANIZATION_ID` (preferred) or `SLABCLOUD_ORGANIZATION_ID` (fallback). Returns 500 if neither is set. |
| **Write gate** | Writes only when `SLABCLOUD_CACHE_WRITE_ENABLED=1` is set on the backend. Without it, the endpoint runs in dry-run mode (same as existing script behavior). |
| **Sync path** | Calls `runSlabCloudInventorySync` from `slabCloudSync.js` directly — no subprocess spawn, no npm shell-out. Always uses `inventoryScope: "typed"` (Slab + Remnant lanes), never `all` or single-lane. |
| **Anti-overlap guard** | Queries `slabcloud_sync_runs` for `status='running'` rows newer than 60 min for the same `organization_id + external_source`. Returns 409 with `{ skipped: true, reason: "sync_already_running" }` if found. A stuck/crashed run older than 60 min is never blocking. Non-fatal: if the guard DB query itself fails, a warning is logged and the sync proceeds. |
| **Performance** | Defaults to `fetchDetails: false` (summary-only) so the sync completes in ~10–15 s — within Vercel Pro serverless timeout. Set `SLABCLOUD_HOURLY_FETCH_DETAILS=1` to enable per-color detail enrichment (30–60 s; only advisable on a long-lived worker or Vercel Enterprise). |
| **Response shape** | `{ ok, mode, organization_id, sync_run_id, inventory_scope, normalized_records, slab_count, remnant_count, raw_written, inventory_upserted, materials_upserted, images_upserted, warnings, started_at, finished_at }` |
| **Texture cache** | NOT run hourly. SlabCloud v2 texture cache (`cacheSlabCloudV2Textures.js`) runs daily or manually — product/texture assets change far less frequently than physical slab availability. |
| **Image verification** | NOT run hourly. Verify only new/unknown images (`image_status = 'unknown'`). Preserve `ok` statuses for unchanged URLs. Run full image verification daily, not hourly. |
| **No inactive marking** | The sync never marks slabs inactive. `is_active` is always `true` in Phase 1. |
| **Scheduler options** | Option 1: **Vercel Cron** — `vercel.json` is pre-configured with `"path": "/api/internal/slabcloud/hourly-sync", "schedule": "0 * * * *"`. Vercel Cron sends `Authorization: Bearer <EOS_CRON_SECRET>` which the endpoint now accepts. Set `EOS_CRON_SECRET` in Vercel project env vars. Option 2: **Cloudflare Worker Cron Trigger** — sends `x-eos-cron-secret: <EOS_CRON_SECRET>` header. See `backend-core/SCHEDULING.md` for example worker handler. |
| **Manual test command** | `curl -X POST https://<BACKEND_URL>/api/internal/slabcloud/hourly-sync -H "x-eos-cron-secret: <YOUR_EOS_CRON_SECRET>"` — first test without write gate; add `SLABCLOUD_CACHE_WRITE_ENABLED=1` to environment before enabling writes. |
| **Required env vars** | `EOS_CRON_SECRET`, `SLABOS_ORGANIZATION_ID` (or `SLABCLOUD_ORGANIZATION_ID`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SLABCLOUD_CACHE_WRITE_ENABLED=1`, `SLABCLOUD_API_COMPANY_CODE=kbyd`, `SLABCLOUD_ASSET_COMPANY_CODE=kbyd`, `SLABCLOUD_PUBLIC_SLUG=esf`. Optional: `SLABCLOUD_CONCURRENCY` (default 2), `SLABCLOUD_HOURLY_FETCH_DETAILS` (default off). |
| **Tests** | 28 unit tests in `slabCloudHourlySyncApi.test.mjs` covering: missing/invalid/empty secret → 401; unconfigured secret → 500; valid custom header → ok; valid Bearer header → ok; wrong Bearer → 401; `resolveOrgId` preference and fallback; `findActiveRunningSync` — null when clear, row when found, throws on DB error; stale threshold constant is 60 min; config always typed; no count_for_color in config; response shape (write + dry-run); inventory_scope always typed; safety invariants. All 28 pass. |
| **Files changed** | `backend-core/src/slabcloud/slabCloudHourlySyncApi.js` (new), `backend-core/src/slabcloud/slabCloudHourlySyncApi.test.mjs` (new, 28 tests), `backend-core/src/server.js` (import + attach + console.log + CORS header), `backend-core/vercel.json` (cron added), `backend-core/SCHEDULING.md` (SlabCloud section added), docs (this entry + PoC Phase 10 + roadmap Phase 20). |
| **What is NOT changed** | `slab_inventory` table. Texture cache. Elite 100 UI. Non-Stock tab. `count_for_color`. Quote Library. Internal Estimate. Sales Dashboard. Pricing Admin. Moraware. AI Takeoff. Home Launcher. Shared EliteosTopbar. Group G. No row deletions or inactive marking. |
| **Next manual steps** | 1. Set `EOS_CRON_SECRET` in Vercel project env vars. 2. Set `SLABOS_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8`. 3. Set `SLABCLOUD_CACHE_WRITE_ENABLED=1`. 4. Test endpoint manually with curl (dry-run first, then write-enabled). 5. Verify `slabcloud_sync_runs` row is created. 6. Enable Vercel Cron (vercel.json already configured). 7. Monitor first scheduled run. |
| **Revisit trigger** | When per-color detail fetches are needed hourly (e.g. fine-grained slab dimension changes). Then evaluate long-lived worker vs. Vercel Enterprise `maxDuration: 300`. |

---

### Slabsmith Windows image upload v1

| Field | Value |
|-------|--------|
| **Date** | 2026-06-09 |
| **Decision** | Slabsmith slab photos upload from the Windows connector to **backend-core only** (`POST /api/integrations/slabsmith/inventory/images`). Backend stores JPEG bytes in Supabase Storage bucket **`eliteos-slab-images`** and upserts existing **`slab_images`** rows with `external_source=slabsmith`, `image_url_pattern=slabsmith_local_upload`, `image_status=ok`. Windows host keeps **no** Supabase service role or storage credentials. |
| **Why** | SlabCloud URL-guess rows do not cover Slabsmith-local JPGs (`C:\slabcloud\<SlabID>.jpg`). Reusing `slab_images` keeps Slab Inventory read API unchanged; separate pattern avoids colliding with `slabcloud_slab_jpg` rows. Incremental upload with local `image-upload-state.json` avoids re-sending ~1,600 pairs every run. |
| **Matching** | Images are keyed by XML **SlabID** on disk; inventory match uses **`inventory_id` → slab_inventory.external_slab_id`** (Slabsmith normalizer uses InventoryID as external_slab_id). Missing inventory match returns non-fatal `skipped_no_inventory_match`. |
| **Safety** | Explicit `--upload` required; `--plan-upload` dry-run; `--limit` / `--slab-id` for staged testing. No orphan/unmatched uploads. Max 10 MB full / 2 MB thumb JPEG. No image upload scheduled yet. `SLAB_INVENTORY_ACTIVE_SOURCE=slabcloud` unchanged. SlabCloud export/file sync untouched. |
| **Impacted files/docs** | `backend-core/src/slabsmith/slabsmithImageUploadApi.js`, `slabsmithImageStorage.mjs`, `multipartParse.mjs`, `tools/slabsmith-connector/sync-images.mjs`, `image-upload.mjs`, `docs/slabos/slabsmith-local-sync-v1.md`, `backend-core/supabase/eliteos_slab_images_storage.sql`. |
| **Revisit trigger** | When Slab Inventory default source switches to `slabsmith`; when bucket should be private with signed read URLs; when batch/multi-slab upload is needed for performance. |

---

### Quote Delivery Phase 1 (dry-run email foundation)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-10 |
| **Decision** | Add a backend-owned **Quote Delivery** layer at `/api/quote-delivery/quotes/:quoteId/preview` and `/send`. Phase 1 is **dry-run only**: preview builds customer-safe HTML/text from **saved `calculation_snapshot`** data; send returns `blocked: true` unless `QUOTE_EMAIL_SEND_ENABLED=1`. No frontend email logic; no provider secrets in heads. Internal Estimate and Quote Library will call the same API in later phases without cross-importing each other. |
| **Why** | Staff need to email customer-facing estimates without making Internal Estimate or Quote Library monolithic. Outbound content must not depend on live screen state or current Pricing Admin catalogs. |
| **Routes** | `POST /api/quote-delivery/quotes/:quoteId/preview`, `POST /api/quote-delivery/quotes/:quoteId/send` — auth + partner block + head grant (`quote` **or** `quote_library`). |
| **Content** | `estimateDisplayFromSnapshot.js` + `estimateContentSanitizer.js` — excludes `internal_ui`, internal-only custom lines, $/sf rates, worksheet diagnostics. Uses `customer_display_total` when present. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_quote_delivery_foundation.sql` — `quote_delivery_logs`, `quote_share_links` scaffold. Backend service role writes only. |
| **Env** | `QUOTE_EMAIL_SEND_ENABLED=0` (default), `QUOTE_EMAIL_PROVIDER=none`, `QUOTE_EMAIL_FROM`, optional `QUOTE_EMAIL_ALLOWED_DOMAINS`, `QUOTE_EMAIL_FORCE_RECIPIENT`. |
| **Audit** | `quote_delivery_logs` per attempt; `eos_action_log` action types `quote_estimate_email_preview`, `quote_estimate_email_send_blocked` (audit failure non-blocking). |
| **Out of scope** | Real email provider (Phase 5), QuickBooks, public/partner quote delivery, PDF attachment, secure link consumption, UI modals. |
| **Impacted files/docs** | `backend-core/src/quoteDelivery/*`, `backend-core/src/email/emailClient.js`, `backend-core/src/quotes/quoteRoutes.js`, `backend-core/supabase/eliteos_quote_delivery_foundation.sql`, `backend-core/.env.example`, `docs/quote-platform/quote-library-head-plan.md`, this entry. |
| **Revisit trigger** | When enabling real send in production; when full CustomerEstimatePrint parity from snapshot is required (vs conservative summary); when public/partner quotes need delivery. |

---

### 85. Custom Quote Tool foundation (off-program material quotes)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-11 |
| **Decision** | **All quotes land in Quote Library** regardless of creation head. **Custom Quote Tool** is a **separate ESF-only internal head** (`app-custom-quote`, slug `custom_quote`) — **not** a third tab inside Internal Estimate. Saves use **`quote_source = custom_quote`** on shared **`quote_headers`** via **`POST /api/custom-quotes/save`** and **`persistQuoteSubmission`** (not `processInternalQuoteSave`). Pricing is **backend-owned** markup/uplift over total cost basis: **Retail = cost × 1.25**, **Wholesale = cost × 1.15** — **not** true gross-margin inversion (`cost / (1 − margin)`). **Dealer Tool** (AI-takeoff-first) is **documented only** in this pass. |
| **Why** | Staff need off-program / non-Elite-100 quotes without polluting Internal Estimate Direct/Wholesale math or exposing dealer/partner/public surfaces. Unified Quote Library remains the operational hub for every source. |
| **Impacted files/docs** | `backend-core/src/quotes/customQuoteCalculator.js`, `customQuotePricingResolver.js`, `customQuotesApi.js`, `customQuoteSave.js`, `app-custom-quote/`, `app-quote-library/` (source label/filter/detail), `backend-core/src/auth/eosGovernanceConstants.js`, `backend-core/src/me/launcherHeads.js`, `backend-core/src/me/headDeploymentUrls.js`, `backend-core/src/quotes/quoteSourceConfig.js`, `docs/quote-platform/custom-quote-tool-plan.md`, this entry. |
| **Revisit trigger** | Pricing Admin owns custom-quote fabrication/uplift/thresholds; Monday board for custom quotes; Custom Quote revision/edit workflow; Dealer Tool AI takeoff implementation. |

---

### 86. Slabsmith inventory soft-retirement (full-snapshot reconciliation)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-12 |
| **Decision** | The **Slabsmith Windows connector / XML ingest path** now soft-retires slabs/remnants that are missing from the **latest successful full sync**. Every connector POST is treated as the **complete current snapshot**. Missing previously-active rows are set **`is_active=false`** (soft-retire); they are **never deleted**, and images/history/raw records/quote references are retained. Reappearing rows are **reactivated** on the next sync. Retirement is **scoped** to the same `organization_id` + `external_source=slabsmith` + `external_company_code`, so SlabCloud rows and other orgs are never affected. **SlabCloud hourly typed sync and the manual SlabCloud cache script are explicitly NOT wired** for retirement in this pass (they may be partial/category-scoped); that remains a separately-audited follow-up. |
| **Gates** | Retirement writes occur only when ALL hold: `SLAB_INVENTORY_RETIRE_MISSING_ENABLED=1`; the sync was a real write (not dry-run/failed); the source identity is unambiguous (org + source + company present); and the snapshot clears the low-count guard. Low-count guard: skip retirement when `latest_seen_count < previous_active_count × SLAB_INVENTORY_RETIRE_MIN_RATIO` (default `0.8`), unless `SLAB_INVENTORY_RETIRE_OVERRIDE_LOW_COUNT=1`. On a failed upsert the sync is marked `failed` and retirement never runs. Dry-run returns a `retirement_plan` preview (`would_retire_count`, `sample_retired_ids`) and writes nothing. |
| **Status model** | Active: `is_active=true`, `inventory_status='active'`, `last_seen_at`/`last_seen_sync_run_id` updated, `retired_*` null. Retired: `is_active=false`, `inventory_status='retired_missing_from_source'`, `retired_at=now()`, `retired_by_sync_run_id=<run>`, `retired_reason='missing_from_latest_successful_full_sync'`. Identity key is the existing upsert key `external_slab_id` (Slabsmith `InventoryID`). |
| **Schema** | Additive audit columns in **`backend-core/supabase/eliteos_slab_inventory_retirement_audit.sql`** (`inventory_status`, `last_seen_at`, `retired_at`, `retired_by_sync_run_id`, `retired_reason` + partial index). **Manual apply required before enabling the flag in production.** Core behaviour (active views excluding retired) needs only the pre-existing `is_active` column. |
| **Frontend/API** | Active inventory views already default to `is_active=true`; retired rows are excluded by default. No new retired-inventory tab in this pass (`?is_active=false|all` already supported by the list API). Slab Inventory health panel copy clarified. |
| **Tests** | `slabInventoryRetirement.test.mjs` (planner, low-count guard, override, payload builders, update-only DB helper, scoped fetch). Extended `slabsmithPersistence.test.mjs` (retire missing, no-retire on failed/dry-run/low-count, override, reactivation, org/source/company scoping, no deletes, sync-run counts). Extended `slabsmithIngestApi.test.mjs` (retirement metrics in response). |
| **Impacted files/docs** | `backend-core/src/slabInventory/slabInventoryRetirement.js` (+ test), `backend-core/src/slabsmith/slabsmithPersistence.js` (+ test), `backend-core/src/slabsmith/slabsmithIngestApi.js` (+ test), `backend-core/supabase/eliteos_slab_inventory_retirement_audit.sql`, `app-slab-inventory/src/SlabInventoryApp.tsx` (copy), `package.json` (`eos:test:slab-inventory-retirement`), `docs/slabos/slabsmith-local-sync-v1.md`, this entry. |
| **Revisit trigger** | When SlabCloud full-snapshot syncs (manual or hourly) are ready for the same reconciliation under a separate audit; when a staff-facing retired-inventory view is needed; when blocked low-count syncs should set a `needs_review` status. |

### 87. AI Takeoff Lab — Phase B/C review workflow + validation fix panel (2026-06-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-16 |
| **Decision** | **AI Takeoff Lab** (`app-ai-takeoff`, slug `ai_takeoff`) is a **live internal head** for plan upload, AI draft extraction, and **estimator review/approve** — not quote creation. Supabase Phase 1 foundation is **verified live**: `quote_files`, `quote_takeoff_jobs`, `quote_takeoff_results`, `quote_file_events`, private `eliteos-quote-files` bucket. |
| **Phase B (run inbox)** | `GET /api/takeoff-jobs` org-scoped run list/inbox; richer `GET /api/takeoff-jobs/:id` (approval metadata, result counts, processing placeholders). UI: `TakeoffRunInbox`. |
| **Phase C (review/approve)** | `POST /api/takeoff-jobs/:id/corrections` appends `_corrections[]` audit in `raw_ai_result_json` and resets approval to `needs_review`. `POST /api/takeoff-jobs/:id/approve` server-recomputes, runs validation + QA gate (`do_not_import` blocks), sets job/result `review_status=approved` — **does not create or mutate quotes**. UI separates **Save reviewed draft** vs **Approve takeoff** (status is automatic; no manual dropdown). |
| **Validation fix panel** | UI + `takeoffValidationFixes.mjs` for cutout-like labels misplaced in `area.exclusions[]` (`move_to_cutouts`, `move_to_notes`, `remove`) so approval is not blocked on `CUTOUT_DEDUCTED_FROM_MATERIAL` / `CUTOUT_IN_EXCLUSIONS_WARNING` with no fix path. |
| **Import boundary** | **Internal Estimate import remains disabled.** `planTakeoffImport` is preview-only. Approved takeoff is documented as a **future handoff point**, not a live import. AI output stays **review-only** after extraction. |
| **Auth / RLS** | RLS **enabled** on takeoff/file tables with **zero policies**. Current architecture: backend **service role** + Express `requireAuth()` + `requireHeadAccess("ai_takeoff")` — not browser-direct Supabase reads. |
| **Future phases** | Page/PDF preview, async/page progress artifacts, provider/model pipeline hardening, eventual **gated** Internal Estimate import from approved takeoff. |
| **Impacted files/docs** | `backend-core/src/takeoff/takeoffWorkspaceService.mjs`, `takeoffWorkspaceRoutes.js`, `takeoffValidationFixes.mjs` (+ tests), `app-ai-takeoff/` (inbox, review UI, validation fix panel), `docs/eliteos/ai-takeoff-foundation.md`, this entry. |
| **Revisit trigger** | When Internal Estimate import slice is approved; when RLS policies replace service-role-only access; when async AI processing or page artifacts ship. |

### 88. Install Dashboard v1 — read-only Installer Day View (2026-06-11)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-11 |
| **Decision** | Ship a protected **Install Dashboard** head (`app-install-dashboard`, slug **`install_dashboard`**) as a **read-only**, mobile-first **Installer Day View** before any scheduling optimizer or Moraware writeback. Brain routes **`GET /api/install-dashboard/today`**, **`/day`**, and **`/crews`** normalize install-day job cards with conservative field mapping and explicit **warnings** for missing data. **Read order (v1.1):** (1) promoted **`moraware_calendar_schedule_rows`** when a `calendar_schedule_rows` report feed is configured and rows exist for the org/date; (2) else fallback to legacy Brain cache (`brain_job_activities`, addresses, jobs, operational summary); (3) else labeled **fixture** payloads in non-production (`INSTALL_DASHBOARD_USE_FIXTURES` / `INSTALL_DASHBOARD_FIXTURE_FALLBACK`). |
| **Why** | Gives field crews immediate daily-route value, validates Moraware install-day data quality, and creates the foundation for future scheduling intelligence without pretending mapping is final. **Production validation (2026-06-19):** Moraware calendar showed many truck-assigned install/service jobs (Truck A/B/D/E/H, Kyle); `brain_job_activities` for the same date returned only operational rows (Template, Saw Program, Pictures, Titan Program) — **Brain activity cache does not mirror Moraware calendar schedule today.** |
| **Scope (v1)** | Read-only list/cards: schedule order, crew/truck label (from calendar feed `truck_or_crew_name` or best-effort activity `raw_json`), address, map/call links, scope summary placeholders, notes, warning/risk chips. **Manager preview** (admin / super_admin / executive): pick date + crew; debug meta shows data source, row counts, missing-field counts. **Not in v1:** schedule editing, drag/drop dispatch, route optimization, AI scheduling, installer status updates, photo uploads, Moraware writeback. |
| **Calendar schedule feed (additive)** | New table **`moraware_calendar_schedule_rows`** + report type **`calendar_schedule_rows`** (default Moraware view **146**, confirm via export). Ingest via existing report-feed staging (`moraware_report_runs` → `moraware_report_raw_rows` → `promoteCalendarScheduleRowsFromRun`). SQL: `backend-core/supabase/eliteos_moraware_calendar_schedule.sql`. **Required export fields (minimum):** calendar date, sched time, assigned resource/truck, job name, account/customer, address (line1/city/state/zip), activity type/status; **strongly desired:** sqft, material, color, install type, notes, Moraware job id. Do **not** fake truck assignment — missing resource stays **Unassigned** with warnings. Frontend never calls Moraware. |
| **Auth** | `requireAuth()` + `requireHeadAccess("install_dashboard")` on every route. Launcher visibility is not authorization. Frontend uses Supabase anon key + user JWT only — **no** Moraware credentials or service role in the browser. |
| **Registration** | Added `install_dashboard` to `EOS_HEAD_SLUGS`, launcher catalog (**title: Install Dashboard**), `HEAD_URL_INSTALL_DASHBOARD`, installer role default grant, Home dev URL fallback (`localhost:5189`). Legacy slug `install` remains reserved for future scheduling head work. |
| **Impacted files/docs** | `app-install-dashboard/*`, `backend-core/src/install/*`, `backend-core/src/moraware/reportFeeds/calendarScheduleConstants.js`, `mapCalendarScheduleRow.js`, `promoteCalendarScheduleRows.js`, `backend-core/supabase/eliteos_moraware_calendar_schedule.sql`, `server.js`, `eosGovernanceConstants.js`, `launcherHeads.js`, `headDeploymentUrls.js`, `testHeadAccess.js`, `app-home/src/lib/config.ts`, `app-home/src/ui/App.tsx`, root `package.json`, `SYSTEM_BLUEPRINT.md`, `eliteOS-master-head-map.md`, this entry. |
| **Revisit trigger** | After first successful calendar feed promotion for Elite; field status updates, photo uploads, route optimization, Moraware writeback, dedicated crew/truck mapping tables, or when `install` scheduling head ships. |

### 89. Calendar schedule feed — daily worker sync (view 222, Install Dashboard)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-11 |
| **Decision** | Automate Moraware **view 222** (`calendar_schedule_rows`) on the DigitalOcean worker: **web form login → fetch → stage → promote** via `syncCalendarScheduleFeed.js`, scheduled daily **4:30 AM America/Chicago** (`eliteos-calendar-schedule-sync.timer`). Report CSV/HTML exports require **Moraware web session cookies** (`morawareWebSession.js`); XML API `sessionId` alone does **not** authorize `/sys/report/` URLs. Optional XML `sessionId` query param is appended when available. Credentials and Supabase service role live in **`/etc/eliteos/moraware-worker.env`** only. Failed fetch/stage/promotion **must not** deactivate existing **`moraware_calendar_schedule_rows`** active rows. Install Dashboard remains **read-only** (no UI or writeback changes in this pass). |
| **Why** | Manual CSV staging validated the promotion path (~12k rows); automation removes operator dependency on local debug CSV files while preserving idempotent replace-before-insert promotion. |
| **Impacted files/docs** | `morawareWebSession.js`, `fetchReportFeedArtifacts.js`, `syncCalendarScheduleFeed.js`, `deploy/moraware-worker/run-calendar-schedule-sync.sh`, `deploy/moraware-worker/systemd/eliteos-calendar-schedule-sync.{service,timer}`, `moraware-worker.env.example`, `docs/eliteos/moraware-calendar-schedule-sync-runbook.md`, `package.json`, tests. |
| **Revisit trigger** | Before automating other report feeds (sales worksheet); before changing Moraware view 222 column contract; before headless browser download. |

### 90. Internal Estimate stabilization — OOC removal, outlet consolidation, comparison itemization (2026-06-23)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-23 |
| **Decision** | Surgical Internal Estimate stabilization pass: remove Out-of-Collection (OOC) from the Internal Estimate user experience; consolidate electrical outlet cutouts under catalog add-on `qty-outlet`; itemize backsplash vs full-height backsplash in optional material comparisons on customer PDF output. |
| **OOC** | OOC selector/card and room-level overrides removed from Internal Estimate UI. New and recalculated estimates use **Elite 100 only** (`material_program_default: elite_100` on save/calculate). Stale OOC fields on legacy quotes are normalized/ignored on hydrate/recalculate — no OOC premium applies. OOC helper modules and DB fields remain for a future dedicated head; historical snapshots may still contain OOC metadata as read-only history. |
| **Electrical outlets** | FHB electrical cutout input removed/hidden wherever `RoomScopeBuilder` would show it. **Electrical Outlet Cutouts** (`qty-outlet`) under room add-ons is the single source of truth for pricing and customer output. Legacy `fhbOutlets` hydrates for backward compatibility: if `fhbOutlets > 0` and `qty-outlet` is empty/zero, migrate to `qty-outlet`; if both exist, use the **larger** quantity (not the sum). Separate `fhbOutlets` pricing and post-pricing merge into global add-ons removed. |
| **Backsplash / FHB display** | Total math unchanged. Display itemization allocates combined chargeable backsplash/FHB material dollars proportionally when needed; uses separate values only when totals reconcile exactly. |
| **Optional comparison (customer PDF)** | Per room/material option, customer-safe rows when applicable: countertop material, 4-inch backsplash material, full-height backsplash material, add-ons/fixtures, room total. No $/sf rates, markup, premium, OOC, material-use-tax formulas, or internal diagnostics. Selected quote total, live summary, PDF summary, room breakdown, and optional comparison totals must reconcile. |
| **Impacted files** | `app-internal-estimate/*`, `app-quote/src/lib/prototypeQuoteMath.ts`, `app-quote/src/ui/RoomScopeBuilder.tsx`, `backend-core/src/quotes/quoteCalculator.js`, `backend-core/src/quotes/internalQuotesApi.js`, regression scripts under `scripts/` and `backend-core/src/scripts/`. |
| **Revisit trigger** | Dedicated OOC head; further Internal Estimate UX pass; customer PDF template redesign. |

### 91. Quote Delivery — Resend email provider (backend-only, env-gated)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-23 |
| **Decision** | Wire **Resend** as the backend quote delivery email provider when `QUOTE_EMAIL_PROVIDER=resend`. API key lives in **`RESEND_API_KEY`** (server env only). Sender uses **`QUOTE_EMAIL_FROM`** (verified `eliteosfab.com` domain). Real outbound email remains gated by **`QUOTE_EMAIL_SEND_ENABLED=1`**; preview never sends. **`QUOTE_EMAIL_FORCE_RECIPIENT`** redirects all real sends to a single test inbox while preserving intended recipients in `quote_delivery_logs.metadata`. |
| **Deferred** | Microsoft Graph / Outlook send; account picker / recipient autofill UI. |
| **Impacted files** | `backend-core/src/email/emailClient.js`, `backend-core/.env.example`, `backend-core/src/quoteDelivery/quoteDelivery.test.mjs`, this entry. |
| **Revisit trigger** | Production send rollout; Outlook integration. |

### 92. Quote Delivery — customer PDF email attachment (frozen print snapshot, env-gated)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-23 |
| **Decision** | Quote delivery may attach a **customer-facing estimate PDF** on real Resend sends when **`QUOTE_EMAIL_PDF_ENABLED=1`** (default off), **`QUOTE_EMAIL_SEND_ENABLED=1`**, and the quote has a frozen **`internal_ui.customer_estimate_print_snapshot`** from Internal Estimate save. The snapshot is a customer-safe serializable subset of **`CustomerEstimateDisplayModel`** plus print header fields; **`finalRounded` must equal `customer_display_total`** at save. PDF is generated server-side from print HTML (Chromium via `puppeteer-core`); **no live `calculateQuote`** in delivery. Legacy quotes without a print snapshot send email **without attachment** and log a warning. Preview returns PDF metadata only (no base64). Browser **`window.print()`** on `CustomerEstimatePrint` is unchanged. Generated PDFs are **not** auto-uploaded to `quote_files` in this pass. |
| **Env** | `QUOTE_EMAIL_PDF_ENABLED`, optional `PUPPETEER_EXECUTABLE_PATH` for local Chromium. |
| **Reconciliation** | Email/PDF attachment reflects the **last saved revision** snapshot, not unsaved IE edits. |
| **Impacted files** | `app-internal-estimate/src/lib/customerEstimatePrintSnapshot.ts`, `InternalEstimateApp.tsx`, `backend-core/src/quotes/internalQuotesApi.js`, `backend-core/src/quoteDelivery/customerEstimatePrintSnapshot.js`, `customerEstimatePrintHtml.js`, `customerEstimatePdfBuilder.js`, `quoteDeliveryService.js`, `emailClient.js`, `quoteDeliveryEnv.js`, email modals, this entry. |
| **Revisit trigger** | Auto-upload to `quote_files`; PDF template redesign; serverless Chromium hosting constraints. |

### 93. AI Takeoff — reviewed takeoff import to Internal Estimate draft (v5.8–v6.0, 2026-06-26)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-26 |
| **Decision** | AI Takeoff import uses **reviewed/approved takeoff snapshots only** (`takeoff_import_v1` via `takeoffImportPayload.mjs`). Raw AI output cannot mutate quotes. Estimator approval gate (`takeoffApprovalGate.mjs`) blocks approval when dimensions, backsplash scope, room completeness, evidence reconciliation, or QA flags remain unresolved. **`POST /api/internal-quotes/import-from-takeoff`** creates an Internal Estimate **draft** (`quote_status=draft`) with `estimate_room_drafts` preloaded from the approved snapshot; account/project/branch/salesperson/pricing/material/color fields remain TBD until estimator completion before quote save. Cutouts are **suggested add-ons**, not material sf deductions. Waterfall/full-height panels import only with explicit reviewed dimensions. |
| **Workflow statuses** | UI/API layer: `ai_draft` → `needs_review` → `review_complete` → `approved_for_import` → `imported`. DB `review_status` remains `needs_review` / `approved`; import completion tracked in job `metadata.importStatus`. |
| **Impacted files** | `takeoffReviewStatus.mjs`, `takeoffApprovalGate.mjs`, `takeoffImportPayload.mjs`, `internalQuoteTakeoffImport.mjs`, `takeoffWorkspaceService.mjs`, `internalQuotesApi.js`, `app-ai-takeoff/`, `app-internal-estimate/`, tests, this entry. |
| **Revisit trigger** | Auto-fill material/color from takeoff notes; bidirectional takeoff↔quote sync; RLS policies on takeoff tables. |

### 94. AI Takeoff import hardening — receipt, detach, checklist (v6.1, 2026-06-26)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-26 |
| **Decision** | Internal Estimate takeoff imports expose a **receipt panel** (plan, approver, snapshot version, CT/BS/FHBS totals, read-only snapshot drawer), **source badges** on imported rooms/pieces, a **completion checklist** (account, project, branch/sales, pricing mode, material per room, add-ons/notes ack, measurements), and **draft-only detach** via `POST /api/internal-quotes/:id/detach-takeoff-import` that removes imported rooms while preserving `takeoff_import.auditEvents` and **not** deleting the source takeoff job. Save/calculate persist `internal_ui.takeoff_import` and emit audit events: `takeoff_import_started/succeeded/failed`, `takeoff_import_detached`, `quote_calculated_from_takeoff_import`, `quote_saved_from_takeoff_import`. No pricing math changes; no auto material/color selection. |
| **Impacted files** | `internalQuoteTakeoffDetach.mjs`, `internalQuoteTakeoffImportChecklist.mjs`, `internalQuoteTakeoffAudit.mjs`, `internalQuotesApi.js`, `TakeoffImportReceiptPanel.tsx`, `TakeoffImportCompletionChecklist.tsx`, `RoomScopeBuilder.tsx`, `InternalEstimateApp.tsx`, tests, this entry. |
| **Revisit trigger** | Server-side enforcement of checklist before save; takeoff re-import after detach; cross-head deep links without `VITE_AI_TAKEOFF_HEAD_URL`. |

### 95. AI Takeoff import — editable measurements with source traceability (v6.2, 2026-06-26)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-26 |
| **Decision** | Imported AI Takeoff measurements remain **fully editable** as normal Internal Estimate guided shapes. **`takeoffImportSource`** on rooms/pieces preserves job/snapshot/page metadata, **`originalDimensions`**, and **`importState`** (`imported_unmodified`, `imported_edited`, `imported_excluded`, `manually_added_after_import`). Estimators get imported-vs-current SF deltas, per-room verification toggles, piece actions (duplicate/split/exclude/restore/convert-to-manual), and traceability UI — **without** changing pricing math or auto-assigning material/color/pricing. |
| **Impacted files** | `takeoffImportMeasurements.mjs/ts`, `takeoffImportPayload.mjs`, `RoomScopeBuilder.tsx`, `TakeoffMeasurementComparisonPanel.tsx`, `prototypeQuoteMath.ts`, checklist modules, tests, this entry. |
| **Revisit trigger** | Server-side block when delta exceeds threshold; bi-directional sync of edited dims back to takeoff job. |

### 96. AI Takeoff import — estimator review speed polish (v6.3, 2026-06-26)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-26 |
| **Decision** | Imported AI Takeoff measurements are optimized for **estimator review speed** while material/pricing authority remains inside Internal Estimate. v6.3 adds compact measurement table mode, live room subtotals, mark-room / mark-all verified (blocked when >2 sf deltas), quote readiness summary, source plan side drawer, per-room material warnings, and per-suggested-add-on review states (`accepted` / `ignored` / `needs_follow_up`) persisted in `takeoff_import_checklist`. No pricing math or auto material/color selection. |
| **Impacted files** | `takeoffImportWorkflow.mjs/ts`, `RoomScopeBuilder.tsx`, `TakeoffQuoteReadinessSummary.tsx`, `TakeoffSuggestedAddOnsReviewPanel.tsx`, `TakeoffSourcePlanDrawer.tsx`, `InternalEstimateApp.tsx`, tests, this entry. |
| **Revisit trigger** | Auto-apply accepted add-ons to room `addons` map; embedded plan PDF preview in IE drawer. |

### 97. AI Takeoff import — controlled internal beta with verification, feedback, and metrics (v6.4, 2026-06-26)

| Field | Value |
|-------|--------|
| **Date** | 2026-06-26 |
| **Decision** | AI Takeoff → Internal Estimate import enters **controlled internal beta**. UI shows “AI-assisted takeoff beta — estimator verification required.” Import still requires approved snapshots only; **`betaImportConfirmed: true`** is required on `POST /api/internal-quotes/import-from-takeoff`. Estimators can submit lightweight feedback and categorized issue reports (stored on `quote_takeoff_jobs.metadata.takeoff_beta` with `quote_id` / `source_takeoff_job_id`). Durable workflow metrics (`ai_takeoff_*` events) log to `eos_action_log` with stage durations when timestamps exist. Staff QA summary (`GET /api/takeoff-beta/qa-summary`, ai_takeoff head) lists recent imported quotes with imported vs current CT/BS deltas. No pricing math, auto material/color, unapproved import, or source job deletion changes. |
| **Impacted files** | `takeoffBetaService.mjs`, `takeoffWorkspaceRoutes.js`, `internalQuotesApi.js`, `TakeoffImportPreview.tsx`, `TakeoffImportReceiptPanel.tsx`, `TakeoffLabApp.tsx`, `InternalEstimateApp.tsx`, tests, this entry. |
| **Revisit trigger** | Dedicated analytics head; cross-org beta dashboard; bi-directional takeoff job sync from IE edits. |

### 98. HR Head v1 — workforce quality grading (2026-07-01)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-01 |
| **Decision** | Ship **`app-hr`** as the first slice of the **eliteOS HR Head** (`hr` slug). Supervisors/managers (`admin`, `executive`, `hr`, `super_admin`) log mistakes via `POST /api/hr/workforce/mistakes`. All users with `hr` head access see the grading dashboard (employees filtered server-side to self). Letter grades are computed live for the **current ISO week (Monday start, America/Chicago default)** and **reset weekly** to grade A / zero mistakes; raw mistake rows and **`workforce_grade_week_snapshots`** are retained for performance reviews. Categories are org-scoped and add-as-you-go. Uses shared `EliteosTopbar`, `EosSectionCard`, `EosMetricCard`, and `primitives.css`. |
| **Why** | Leadership needs a simple, auditable way to track employee mistakes with weekly accountability without losing historical data for reviews. Supervisor logging keeps v1 honest and avoids premature auto-detection from incomplete takeoff/ops signals. |
| **Security / tenancy** | All routes: `requireAuth()` + `requireHeadAccess("hr")`. Writes scoped by `organization_id` from `resolveOrganizationContext`. Mistake logs write to `eos_action_log` via `logAction`. No service role or secrets in the browser bundle. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_workforce_quality_v1.sql` |
| **Deploy** | Set `HEAD_URL_HR` on backend-core (e.g. `https://hr.eliteosfab.com`). Grant `hr` head access to managers and employees who should see grades. |
| **Impacted files/docs** | `app-hr/`, `backend-core/src/hr/`, `backend-core/src/server.js`, `backend-core/src/me/launcherHeads.js`, root `package.json`, this entry. |
| **Revisit trigger** | Auto-detected mistakes from takeoff/QC; severity-weighted grading in UI; employee acknowledgment workflow; configurable grade thresholds admin UI. |

### 99. QuickBooks Intelligence Head — standalone (Phase 4D refactor, 2026-07-10)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-10 |
| **Decision** | Phase 4D QuickBooks Intelligence is a **standalone protected head** (`app-quickbooks-intelligence`, slug **`quickbooks_intelligence`**), not a System Admin nav tab. System Admin remains identity/access/governance only. The head calls existing `GET /api/admin/quickbooks/intelligence/executive` (no schema/connector/import changes, no AI). |
| **Auth** | `requireAuth()` + `requireRole(["admin","super_admin","executive","finance","accounting"])` + `requireHeadAccess("quickbooks_intelligence")`. Admins/super_admins still bypass head-access checks per existing middleware. Finance/accounting get the slug via launcher role hints; others need explicit `user_head_access` when not in full-catalog roles. |
| **Security** | Backend-only reads of `brain_quickbooks_*`. UI never renders `raw_payload`, addresses, memos, or customer/vendor PII. No service-role keys in the browser. |
| **Registration** | `EOS_HEAD_SLUGS`, launcher catalog (Finance & supply), `HEAD_URL_QUICKBOOKS_INTELLIGENCE` in `headDeploymentUrls.js`, root `eos:build:quickbooks-intelligence`. |
| **Manual setup** | Set `HEAD_URL_QUICKBOOKS_INTELLIGENCE` on Brain; deploy app with `VITE_*` env; grant `user_head_access` where role defaults do not apply. **Do not** apply DB migrations for this head. |
| **Impacted files/docs** | `app-quickbooks-intelligence/`, `app-system-admin/` (QB tab removed), `quickBooksIntelligenceApi.js`, `eosGovernanceConstants.js`, `launcherHeads.js`, `headDeploymentUrls.js`, `QUICKBOOKS_INGESTION_PLAN.md`, `eliteOS-master-head-map.md`, `SYSTEM_BLUEPRINT.md`, this entry. |
| **Revisit trigger** | Dedicated sync-health Admin surface; AI narrative layer; rename API path off `/api/admin/quickbooks/*` if product wants non-admin URL branding. |

### 100. Elite 100 Studio estimates — durable persistence + pricing authority lock (2026-07-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-16 |
| **Decision** | Studio estimates persist in **`studio_estimates`** (Supabase default; memory for tests only). Scope edits after approval **supersede** the approved row (preserving calculation/approval snapshot) and open a new active revision. **Wholesale Remnant = $45/SF** (matches Group Promo wholesale $/SF; Remnant remains a distinct group label; Direct/Retail Remnant stays **$50/SF**). **W edge** = wholesale **$15/LF** / direct **$25/LF** (quoteCalculator v2 upgraded edge — not a universal $15). Internal Estimate **2% material use tax** is applied **once** into `totals.wholesale` for `internal_quote` (contract test 714 = 700 × 1.02). |
| **Why** | Approved Studio estimates must survive Brain restarts before Digital Estimate publish. Pricing ambiguity must be explicit so future DE publication has a single authority. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_studio_estimates_v1.sql` (does not touch Digital Estimate tables). |
| **Impacted files/docs** | `backend-core/src/elite100EstimateStudio/*`, `quoteCalculator.js` (exported edge rates + Remnant comment), `pricingAuthority.contract.test.mjs`, `app-elite100-estimate-studio` Estimate Scope panel, this entry. |
| **Revisit trigger** | Finance formally sets Remnant wholesale ≠ $45; Pricing Admin wires Remnant/edge catalog into `calculateQuote`; Digital Estimate publish consumes approved Studio estimate snapshots. |

### 101. Quote Intake mailbox PDF → Open Estimate handoff — persist attachment records, defer byte retrieval (2026-07-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-16 |
| **Decision** | Mailbox import now persists a **metadata-only record for every classified attachment** (`quote_intake_attachments`) instead of only writing a row when a PDF's bytes were fetched and validated at import time. `sha256` is **nullable at import** and computed later. Byte retrieval, PDF magic validation, and SHA-256 happen **once at Open Estimate** using server-stored provider identifiers (`provider_message_id` + `source_attachment_id`). Supported-PDF detection is **classification-based** (`support_classification = direct_pdf`, `is_inline`, `attachment_kind`), not sha-gated. Open Estimate builds a fixed-mailbox Graph client from Brain env when none is injected (server.js previously injected none, so real re-fetch always failed with `attachment_bytes_unavailable`). |
| **Why (root cause)** | The real forwarded-PDF case produced `no_supported_pdf` because import's single silent `try/catch` dropped the attachment entirely whenever classification found zero direct candidates (inline/itemAttachment/referenceAttachment) or the byte fetch/decode threw — leaving `attachments: []`. Detection then had no record to reason about. A second latent bug: no Graph client wired into Open Estimate byte retrieval. |
| **Supported-PDF rules** | `@odata.type = fileAttachment`, not inline, not item/reference, filename `.pdf` and/or `application/pdf`; final downloaded bytes must pass `%PDF` magic; SHA-256 computed server-side; size within existing Graph limits. Inline signatures/logos ignored. Client may submit only a Quote Intake attachment **record UUID** (`attachmentId`) for multi-PDF selection — never a Graph id/URL/mailbox/token. |
| **Multiple / none behavior** | Multiple supported PDFs → `409 multi_pdf_ambiguous` with `selectionRequired` + safe `options` (record id + filename + size); server re-authorizes the chosen record. Zero supported → `422 no_supported_pdf` with a precise `reason` (`no_attachments`, `only_inline_images`, `pdf_nested_in_forwarded_item`, `unsupported_attachment_type`). |
| **Persistence** | Quote Intake Supabase repository already exists. **Migration required (manual apply):** `backend-core/supabase/eliteos_quote_intake_attachment_retrieval_v1.sql` (additive: nullable `sha256`, `is_inline`, `attachment_kind`, `support_classification`, `retrieval_state`, `provider_message_id`, dedupe index on `(intake_case_id, source_attachment_id)`). Fails closed when Supabase mode selected but table/columns unavailable. Does not touch Digital Estimate migrations. |
| **Impacted files/docs** | `quoteIntakeAttachmentMeta.mjs` (new shared classifier), `quoteIntakeMailboxService.mjs`, `quoteIntakeGraphClient.mjs`, `quoteIntakeRepository.mjs`, `supabaseQuoteIntakeRepository.mjs`, `intakeOpenEstimateService.mjs`, `quoteIntakeRoutes.js`, `app-elite100-estimate-studio` case detail (safe attachment rows), `phase6p4.test.mjs` (updated to metadata-only), `openEstimatePart1.test.mjs` (new), this entry. |
| **Revisit trigger** | Retrieve PDFs nested inside forwarded `itemAttachment` without broad Graph scope expansion; estimator attachment picker UI for multi-PDF; automatic mailbox polling. |

### 102. Quote Intake preview attachment discovery — invalid `$select=contentId` (2026-07-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-16 |
| **Decision** | Attachment metadata `$select` uses **only base** `microsoft.graph.attachment` fields: `id,name,contentType,size,isInline`. Never include `contentId` (fileAttachment-only) without an OData type cast. Preview **must not** catch attachment-list failures into an empty list; surface `attachmentDiscovery` (`ok` / `failed` / `empty_mismatch`) instead. |
| **Why** | Live Sync inbox showed `Attachments: none` for real direct PDFs because `$select` included `contentId`, Graph returned HTTP 400 (`Could not find a property named 'contentId' on type 'microsoft.graph.attachment'`), and preview swallowed the error into `attachments: []`. |
| **Graph request shape** | Prefer `IdType="ImmutableId"` on message list and `/messages/{id}/attachments`. Message `$select` includes `hasAttachments`. Attachment list uses ImmutableId from Prefer-consistent message `id`. |
| **Impacted files** | `quoteIntakeGraphClient.mjs`, `quoteIntakeMailboxService.mjs`, `MailboxSyncModal.tsx`, `previewAttachmentDiscovery.test.mjs`, live smoke script. |
| **Revisit trigger** | Need `contentId` for CID inline matching — use `microsoft.graph.fileAttachment/contentId` cast. |

### 103. Quote Intake PDF size limit — envInt empty→1024 bug (2026-07-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-16 |
| **Decision** | Authoritative single-PDF ceiling is **`QUOTE_INTAKE_MAX_PDF_BYTES`** (default **50 MiB**, hard max **100 MiB**). Legacy `QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES` is a fallback alias only. `envInt` must treat empty/missing env as **fallback**, never as `0` clamped to `min`. |
| **Why** | Live Open Estimate failed with `attachment_too_large` for a ~0.1 MB cabinet PDF because unset `QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES` was parsed as `0` and clamped to **1024 bytes**. |
| **Throwing layer** | `decodeAndValidatePdfBytes` / Open Estimate byte validation using `limits.maxAttachmentBytes` (= 1024). |
| **Old limit** | Effective **1024 bytes** (bug). Intended default was 50 MiB. |
| **New limit** | **52,428,800 bytes (50 MiB)** default via `QUOTE_INTAKE_MAX_PDF_BYTES`. |
| **Enforcement** | Metadata pre-check before Graph download; downloaded byte length re-checked; PDF magic + SHA-256 unchanged; human-readable error: `This PDF is X MB. The current limit is Y MB.` |
| **Impacted** | `quoteIntakeGraphConfig.mjs`, `quoteIntakeGraphNormalize.mjs`, `intakeOpenEstimateService.mjs`, `quoteIntakeMailboxService.mjs`, `quoteIntakeRoutes.js`, `ingestQuoteFileFromBytes.mjs`, Studio mailbox UI, `pdfSizeLimit.test.mjs`. |

### 104. Studio estimate → Digital Estimate publication (Part 2) (2026-07-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-16 |
| **Decision** | An **approved, durable Studio estimate** is the source of truth for Elite 100 Digital Estimate publication from Estimate Queue. Publish adapts the estimate into the existing `quote_headers`-shaped freeze path (`assessElite100PublicationEligibility` + `buildPublicationFreezePayloads` + `publishAtomic`) — **no second publication, token, pricing, session, or review-request system**. Family root = **intake case id** so a newly approved estimate revision supersedes the prior active publication. Memory-only Studio estimates cannot publish (except `ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH=1` for tests). |
| **Why** | Estimators complete Takeoff → Studio approve → publish customer Digital Estimate without Internal Estimate quote_headers; customer config + review requests stay on existing DE.2* surfaces. |
| **Frozen** | Studio estimate id/revision, intake case id, takeoff job id, approved calculation fingerprint, customer/project fields, room/scope summary, baseline customer display total, material/options envelope, pricing engine/version, pricing-valid-through. |
| **Excluded from customer snapshot** | Internal markup, estimator-only notes, wholesale/rates, trusted-account rule IDs, actor IDs, raw Takeoff evidence, Graph/attachment hashes, storage paths. Public serializer + forbidden-content checks remain final authority. |
| **SQL** | None new. Requires prior `eliteos_studio_estimates_v1.sql` + existing Digital Estimate / configuration migrations. |
| **Impacted** | `studioEstimatePublicationAdapter.mjs`, `studioEstimateDigitalEstimateService.mjs`, `elite100EstimateStudioRoutes.js`, `digitalEstimatePublishService.mjs` (optional `pricingValidThrough` + `publishMetadata`), `EstimateDigitalEstimatePanel.tsx`, Part 2 tests. |
| **Out of scope** | Acceptance, mark sold, Moraware, QuickBooks, payments, automatic republish. |

### 105. Studio review-request resolve / revise / republish (Part 3) (2026-07-17)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-17 |
| **Decision** | Estimator review of customer Digital Estimate requests reuses existing **`REVIEW_STATUS`** authority with operator-facing labels (`new`, `in_review`, `revision_required`, `resolved_no_change`, `resolved_republished`, `rejected`). **Revise** opens a new Studio estimate revision via `createRevisionFrom` (prior approval snapshot preserved). **Republish** uses Studio Digital Estimate publish (idempotent + supersession). Request is marked `updated_estimate_published` **only after** successful republish. No-change / reject require an estimator note and create no publication. |
| **Why** | Close the customer→estimator loop without a second review/revision/publication system and without auto-acceptance or downstream integrations. |
| **SQL** | None new. Resolution kind/note stored in mutable `closed_reason`; Studio linkage in amendment `internal_evidence_json.studioReview`. |
| **Impacted** | `studioReviewRequestService.mjs`, Studio review routes, `ReviewWorkspace.tsx`, `EstimateDigitalEstimatePanel.tsx`, Part 3 tests. |
| **Out of scope** | Acceptance, mark sold, Moraware, QuickBooks, payments, automatic email/republish. |

### 106. Estimate Queue lifecycle dashboard (2026-07-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-18 |
| **Decision** | Estimate Queue is the estimator’s operational dashboard for Elite 100 quote lifecycle (intake → Takeoff → Studio estimate → Digital Estimate → customer review). **One derived `workflowStatus`** is computed server-side from existing intake / Takeoff / Studio estimate / publication / review-request rows — **no competing workflow-status table**. List API returns summaries only; preview loads detail on demand. Additive open/activity columns on `quote_intake_cases` (`first_opened_at`, `last_opened_at`, `last_activity_at`, `last_estimator_action`) plus assignee via existing `assigned_to`. `Accepted` / `Sold` are display-compatible placeholders only until those product slices exist. |
| **Why** | Estimators need Quote Library–style visibility without duplicating systems or loading full Takeoff/publication payloads per row. |
| **SQL** | `eliteos_studio_estimate_queue_v1.sql` (manual apply). |
| **APIs** | `GET /api/elite100-estimate-studio/queue`, `GET .../queue/:caseId/preview`, `POST .../opened`, `POST .../assign`. |
| **Impacted** | `studioEstimateQueueWorkflow.mjs`, `studioEstimateQueueService.mjs`, Studio `EstimateQueuePage`, open-target routing into Takeoff / Scope / Digital / Review. |
| **Out of scope** | Acceptance, sold confirmation, Moraware, QuickBooks, payments, new AI behavior. |

### 110. Slice 1 hosted fix — editable manual Takeoff during AI + durable generation worker (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | While AI Takeoff is queued/processing/failed/disabled, the consolidated Takeoff worksheet remains **editable** with Add Room / Add Piece / **Remove room** / **Remove piece** / Save draft. Empty rooms render immediately. **Remove** is distinct from Include/exclude: removals hard-delete from the working draft and persist `reviewState.deletedRoomIds` / `deletedRunIds` tombstones so AI merge/polling cannot resurrect them. The workspace separates **authoritative estimator draft** from **pending AI draft**: `GET …/results/latest` returns estimator-confirmed geometry for editing plus optional `pendingAiAvailable` / `pendingAiDraft` / preview when a newer raw AI result exists that is not yet `lastMergedAiResultId` / dismisseds. UI shows “AI findings pending review” with Save & merge, Preview (inline read-only AI room/piece list), and Discard AI findings. **Save & merge** keeps the local estimator draft, merges AI-only findings via `saveMergeTakeoffDrafts` / `mergeAiDraftPreservingConfirmed` (precedence: deletion → estimator-owned → AI append), and records `lastMergedAiResultId`. Polling continues after draft-ready so pending AI still surfaces. Server **`selectAuthoritativeTakeoffResult`** never lets raw AI displace the estimator draft. Status/queue: **Takeoff draft ready · AI findings pending review** when pending. Hosted AI completion uses durable cron **`GET\|POST /api/internal/takeoff/process-queued`**. |
| **Why** | Saving a manual draft made it authoritative and hid later AI results; estimators needed durable removal and a visible pending-AI review path without overwriting manual geometry. |
| **SQL** | None (link rows updated in place by sync helper). |
| **Out of scope** | Slice 2, Estimate Scope geometry editing, pricing unlock without takeoff approval; manual backfill of pre-existing stuck link rows (open-estimate / next worker tick / deploy sync heals on read). |

### 109. Elite 100 Slice 1 — automatic AI Takeoff after intake; confirmed estimator work wins (2026-07-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-18 |
| **Decision** | **Supported intake PDFs automatically start AI Takeoff.** When Quote Intake creates/imports a case with exactly one supported PDF, the Brain idempotently runs Open Estimate (Studio estimate + takeoff job) and queues the existing async AI generation flow. **AI Takeoff is asynchronous and never blocks estimator work** — import/open returns before extraction completes; estimators may open the case while queued/processing and build rooms/pieces manually. **AI Takeoff creates draft geometry only.** **Confirmed estimator changes always win over later AI output** (approved snapshot and `raw_ai_result_json._meta.estimatorConfirmed` / saved corrections / manual room ids); AI reruns may append unconfirmed findings but must not delete or silently overwrite confirmed geometry. **AI failures do not block manual estimating** (case + Studio estimate preserved; staff-safe retry message). **The Estimate Queue uses one operational status vocabulary** via `deriveQueueWorkflowStatus` (New → Takeoff queued/processing/draft ready → Needs estimator review → Scope in progress → Ready for approval → Published → Customer reviewing/submitted → Sold/Closed → Takeoff failed). **The Studio lifecycle is canonical for Elite 100 estimating** (intake → takeoff draft → studio_estimates → DE publication). |
| **Why** | Estimators should never wait on AI; automatic bootstrap removes a manual Open Estimate step for the common single-PDF path without a second AI pipeline. |
| **Trigger** | Mailbox import (`bootstrapIntakeCasesAfterImport`) and `POST /cases` when `openEstimate` is wired; gated by `QUOTE_INTAKE_AUTOMATIC_TAKEOFF` (default ON when API enabled) + existing `TAKEOFF_AI_*` flags. |
| **Idempotency** | Reuse existing intake→takeoff link / takeoff job; `startAiTakeoffGeneration` returns in-flight run on `already_processing`; approved jobs reject AI (`takeoff_already_approved`). |
| **Authoritative geometry** | `selectAuthoritativeTakeoffResult` + `mergeAiDraftPreservingConfirmed` in `takeoffAuthoritativeResult.mjs`. |
| **SQL** | None. Confirmed marker is additive metadata on existing `raw_ai_result_json._meta`. |
| **Out of scope** | Sold-job behavior, Digital Estimate publication changes, pricing changes, Slice 2 catalog/Scope Builder simplification. |

### 108. Digital Estimate customer links are stable and reusable (2026-07-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-18 |
| **Decision** | **Digital Estimate customer links are stable, reusable links for the active publication. They remain available to authorized estimators until replaced, revoked, expired by policy, or superseded. The system does not use one-time links for normal customer estimate access.** URL shape is `https://digital.eliteosfab.com/e/<opaque-token>`. Public app loads via **`GET /api/public-digital-estimate/v1/:token`** (hash lookup; token not consumed; repeated reads allowed). Token possession authorizes the frozen customer snapshot on this v1 path. DE.2G.0 synthetic allowlist continues to gate **v2 configuration/session** exchange only. Studio recovers `customerUrl` via AES-GCM `token_wrapped` (Brain-only). Pricing expiry returns the estimate with `access.status: pricing_expired`; it does not hide the link. |
| **Why** | One-time / non-recoverable Studio links created operational friction (lost after refresh; Preview/Copy unreliable). Backend tokens were already reusable — only staff recovery was missing. |
| **Migration** | `eliteos_digital_estimate_reusable_links_v1.sql` adds nullable `quote_publication_access_tokens.token_wrapped`. **`eliteos_digital_estimate_reusable_links_v2_atomic_wrap.sql`** replaces `digital_estimate_replace_token_atomic` so **`p_token_wrapped` is required and written in the same transaction** as the new token hash (prior token only invalidated on successful commit). **Required** because SHA-256 hashes cannot rebuild the customer URL after refresh; event metadata explicitly forbids storing raw tokens. |
| **Env** | `DIGITAL_ESTIMATE_LINK_WRAP_KEY` (**required in production**). Whitespace/newlines/quotes are normalized. Dev/test may use `DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP=1`. |
| **Fail-closed replace** | Replace asserts wrap key + column writability, generates wrap, verifies local unwrap, then atomic replace with `token_wrapped`. Success only after readback decrypt rebuilds path `customerUrl` (`/e/<token>`). Atomic failure keeps the prior working token. Decrypt/key failures return `linkStatus: recovery_error` with safe diagnostics — never silent `needs_replace`. Studio readiness `activePublication` always includes `customerUrl` + `linkStatus`. |
| **Impacted** | `digitalEstimateTokenWrap.mjs`, publish/replace services, DE repository, Studio readiness/publish panel, Digital Estimate app path bootstrap, FEATURE_DECISIONS. |
| **Out of scope** | Acceptance, sold, Moraware, QuickBooks, payments. |

### 107. Studio Digital Estimate publish — quote_headers bridge + consistent readiness (2026-07-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-18 |
| **Decision** | Hosted Studio → Digital Estimate publish must **upsert a minimal `quote_headers` bridge row** (`quote_source = elite100_studio_bridge`, archived) with `id = studio_estimates.id` before `digital_estimate_publish_atomic`, because `quote_publications.source_quote_id` FK references `quote_headers`. Eligibility / freeze still use the **in-memory synthetic** `internal_quote` header (not the archived bridge). Readiness GET and publish POST share **one** validation function (customer/project fields, catalog option keys, pricing-valid-through range, fingerprint, takeoff, Elite 100 eligibility). Studio surfaces structured `{ status, code, message, field, allowedRange, blockers }` and a temporary pilot diagnostic panel — generic “Unable to publish Digital Estimate” only for unstructured failures. |
| **Why** | Readiness reported eligible while publish failed with Postgres FK `23503` / route 500 collapse; configuration fields were not re-validated on readiness GET. |
| **Throwing layer (hosted)** | `digital_estimate_publish_atomic` insert into `quote_publications` → `quote_publications_source_quote_id_fkey`. |
| **SQL** | None new (uses existing `quote_headers`). |
| **Impacted** | `studioEstimatePublicationSource.mjs`, `studioEstimatePublicationAdapter.mjs`, `studioEstimateDigitalEstimateService.mjs`, `elite100EstimateStudioRoutes.js`, `EstimateDigitalEstimatePanel.tsx`. |
| **Out of scope** | Acceptance, sold, Moraware, QuickBooks, payments; dropping the FK; redesign of Digital Estimate customer UI. |



### 111. Elite 100 Slice 2 foundation — estimator experience (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | Slice 2 foundation (estimator side): (1) Takeoff Review worksheet is measurement-first (full room/piece names, clear dimension columns, room grouping, collapsible plan). (2) Pending AI findings **auto-append** non-destructively (deletion tombstones + estimator-owned geometry win); Save & merge UI removed. (3) **New Studio estimates default to Wholesale**; saved Direct/Retail scopes are never silently rewritten. (4) Custom line items on Estimate Scope use `quoteCalculator.normalizeCustomLineItems` + Studio calculation snapshot (internal-only lines excluded from customer display total). (5) Digital Estimate publish replaces raw catalog-key text with friendly “Customer may choose” controls that generate allowed option keys; legacy unknown keys preserved. (6) Room backsplash is explicit include/height/length/SF with source indicator; 4″ defaults only when splash is included and no height exists. |
| **Why** | Pilot pipeline works end-to-end; estimators need legible geometry review and commercial clarity before the full Digital Estimate customer UX pass. |
| **SQL** | None (scope JSON additive fields on existing `studio_estimates`). |
| **Out of scope** | Full Lovable DE customer UX, Elite 100 color modal polish, customer info/submit polish, sold-job, Moraware, QuickBooks. |


### 112. Digital Estimate customer experience foundation — info, rooms, Elite 100 color modal (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | First customer-experience PR for Digital Estimate configures the existing `/e/<token>` + v2 session stack toward the Lovable direction: (1) polished customer/project information with **proposed corrections** stored as session selection meta (`__customerInfoDraft`, `__roomLabelDrafts`) — never CRM/source mutation; (2) room cards with locked countertop/backsplash SF + material selection; (3) Elite 100 color modal with **pricing group tabs** using customer-safe `pricingGroupLabel` (e.g. Group Promo) — never `pricingGroupCode`, Wholesale, or Direct; (4) material pick saves via existing `PUT /v2/selections` and updates totals from server calculation only. Texture assets remain same-origin `/materials/elite100/{thumb,full}`. Studio readiness review list surfaces customer info drafts, room label drafts, selected materials, and submitted total. |
| **Why** | Functional public configuration existed; customers needed a clearer room/material journey and estimator needed correction visibility without new pricing engines or sold-job behavior. |
| **SQL** | None (meta keys in existing `selection_payload_json`). |
| **Out of scope** | Sink/cooktop/edge/backsplash customer controls polish, final submit freeze UX overhaul beyond existing review-request path, Moraware/QB, sold. |


### 113. Digital Estimate configure-mode routing on stable `/e/<token>` (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | Public Digital Estimate bootstrap **always** exchanges `POST /api/public-digital-estimate/v2/session` after a successful v1 token read. `ConfigurationView` opens when the session returns `lifecycle=active` **and** a configuration envelope. `VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED` is a **kill-switch only** (exact `false` forces legacy read-only); unset/`true` allows configure. Dev builds surface an explicit `configuration fallback:` reason. Studio publish with `customerChoiceGroups` including `materialColor` seeds all customer-visible Elite 100 colors in the estimate’s pricing group onto the activated envelope (not merely the single createDraft default). |
| **Why** | Production was stuck on the legacy frozen summary because (1) configure exchange was gated behind exact Vite `true` and (2) silent exchange failure kept read-only baseline. New publishes already create envelopes; the UI never entered configure mode. |
| **SQL** | None. |
| **Ops** | Ensure Brain `DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED=1` (+ configuration/API/public-read runtime). On `app-digital-estimate`, set `VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED=true` or remove a baked `false`. Republish (or replace+republish) estimates that were published before materialColor group seeding if the color modal shows only one finish. |
| **Out of scope** | Hidden query params, second customer URL, sold-job, sink/cooktop/edge/backsplash customer polish. |


### 114. Live Digital Estimate configure requires SYNTHETIC_PILOT_ONLY=0 (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | Production `POST /api/public-digital-estimate/v2/session` **is mounted** at that exact path via `quoteRoutes` → `maybeAttachDigitalEstimatePublicConfigurationRoutes` → Vercel `api/index.js` → `server.js`. Live browser 404 on that call for newly published Studio estimates was **not** a missing route: `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY` remains on with a 1-ID allowlist, so v2 exchange fails closed (`DE-EXCHANGE-404`) while **v1 public read does not apply the synthetic allowlist** and still renders the frozen summary. For live customer ConfigurationView: set **`DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=0`** on Brain Production (and redeploy/restart so env is live). Keep `DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED=1`. Staff publish responses surface an explicit notice when synthetic-only would block customer configure. Mount logs warn when synthetic-only is on. |
| **Why** | Customer-experience and configure-mode routing shipped while the DE.2G synthetic rail still blocked all but one publication on v2. |
| **SQL** | None. |
| **Out of scope** | Auto-allowlisting every new publication; changing v1 to also enforce the synthetic allowlist. |


### 115. Digital Estimate complete customer options + section billable SF (2026-07-19)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-19 |
| **Decision** | Complete customer-safe Digital Estimate configuration on the existing envelope/session/Brain stack: (1) shared `ceilBillableSquareFeet` — each independently priced SF section ceilings before rate×SF (pieces, counter, splash, waterfall); (2) public DTOs/UI never expose numeric SF; (3) multi-group Elite 100 colors when `materialColor` is allowed; (4) room-scoped backsplash/sink/edge choice keys; (5) room notes + project note as selection meta; (6) DE.2C material pricing uses billable counter + splash SF. No second catalog/engine; unresolved Blanco/waterfall/popup remain blocked. |
| **Why** | Configurable page was live but limited to baseline group + SF leakage + incomplete sink/backsplash/edge controls. |
| **SQL** | None. |
| **Ops** | Republish estimates to refresh envelopes with multi-group materials and room choices. Keep `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=0` for live customer configure. |
| **Out of scope** | Sold-job, Moraware/QB, full Product Catalog DB bridge beyond approved option fixtures, free-form waterfall/miter dimensions. |

### 116. Digital Estimate v2 selections save — session vs lifecycle errors (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Canonical save remains **`PUT /api/public-digital-estimate/v2/selections`** (POST alias same handler). Missing session cookie returns **401 `session_required` / DE-COOKIE**, not a generic estimate-unavailable 404. Customer UI treats save/network/validation/conflict failures as **inline retryable errors** and only uses the unavailable page for true lifecycle fatals (`lifecycleFatal`). Studio publish defaults now include **backsplash** in `customerChoiceGroups`. |
| **Why** | Live configure loaded (POST session OK) but material save 404s were mapped to full unavailable; Promo-only / missing backsplash on new pubs were frozen-envelope + Studio default gaps. |
| **SQL** | None. |
| **Ops** | Deploy Brain + digital-estimate head together. Republish after deploy for multi-group + backsplash envelope. |
| **Out of scope** | Weakening SameSite cookie policy; second pricing engine. |

### 117. Digital Estimate selection save — explicit session vs lifecycle codes (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Selection save failures use explicit codes: recoverable `session_required` / `session_not_found` / `session_invalid` (401) vs fatal `publication_revoked` / `publication_expired` / `publication_unavailable` / `publication_superseded`. Customer UI fatals **only** on explicit lifecycle codes — never on bare 404 or message text containing “unavailable”. Sessions remain Supabase-durable (no production memory repo). `GET …/review-requests/current` returns **200 + reviewRequest:null** when none. `/api/health` exposes safe `buildId`. |
| **Why** | Live PUT with cookie returned `code:unavailable` / `Estimate unavailable`; prior classifier treated that as fatal. |
| **SQL** | None. |
| **Ops** | Deploy Brain + digital-estimate together; confirm `buildId` matches merge SHA. Existing `/e/<token>` links re-exchange on recoverable session errors. |
| **Out of scope** | Cookie SameSite=None; sold-job. |

### 118. Digital Estimate session cookie SameSite=None + Path=/ (2026-07-20)

| Field | Value |
|-------|--------|
| **Decision** | Canonical `de_cfg_session` is host-only on the Brain API host with **`Path=/`**, **`Secure`**, **`HttpOnly`**, **`SameSite=None`**. Legacy `Path=/api/public-digital-estimate/v2` + prior SameSite variants are expired on every set/clear. Session create hashes the same normalized secret used at lookup; exchange verifies the row is readable before 201. Fresh serverless request contexts must resolve the Set-Cookie value for PUT selections. |
| **Why** | Live POST /v2/session 201 wrote durable Supabase rows, but PUT selections immediately failed session lookup (`session_not_found` / observed 404) because the cross-origin SPA→API cookie was not reliably stored/returned under SameSite=Strict + narrow Path — selections never persisted (row_version stayed 1). |
| **SQL** | None. |
| **Ops** | Deploy Brain + digital-estimate together. Existing links re-exchange to receive the new cookie. Confirm `/api/health` `buildId`. |
| **Out of scope** | Domain=`.eliteosfab.com` cookie sharing; sold-job. |

### 119. Digital Estimate selection persistence — fingerprint scope + invalid_selection (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Public `PUT /v2/selections` persists even when calculation input fingerprints collide across sessions (same material **group** / economic inputs). Engine fingerprints include `selectionFingerprint` (canonical selection hash / envelope option IDs). RPC + repository scope fingerprints with `#sel:…` on unique conflict. Supabase configuration repository implements `getLatestSelectionForSession` so resume restores saved envelope option IDs. Unauthorized option IDs return **422 `invalid_selection`** (with safe `selectionKey`), not generic 404. Persistence failures map to **500 `persistence_failed`** / **409 `stale_configuration`**, never bare lifecycle 404. `GET …/review-requests/current` always returns **200 + `reviewRequest: null`** when none / on repo gaps (missing amendment tables). UI keeps unsaved visual choice on `invalid_selection`. |
| **Why** | Live PUT with valid session + canonical `material:{roomUuid}:e100-india-black-pearl` returned `{code:unavailable, diagnosticCode:DE-EXCHANGE-404}` because org-wide `uq_de_config_calc_input_fingerprint` rejected duplicate fingerprints (same-group color changes share group-level pricing inputs). Even when rows did persist, resume omitted `currentSelections` because Supabase repo lacked `getLatestSelectionForSession` (refresh showed Carrara Classic). Review current 404’d when the review table was missing. |
| **SQL** | `backend-core/supabase/eliteos_digital_estimate_selection_fingerprint_scope_v1.sql` (apply on Brain deploy / ops). |
| **Ops** | Deploy Brain + digital-estimate; apply SQL if RPC not yet updated (JS retry still scopes fingerprint). Retest India Black Pearl save → 200, `row_version` increments, refresh restores selection. |
| **Out of scope** | Dropping the unique index entirely; sold-job; cookie SameSite revisit. |

### 120. Digital Estimate draft restore across new sessions (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Customer configuration drafts are durable for the **active publication + envelope**, not only the transient browser session. `buildPublicState` loads `getLatestSelectionForSession` first, then falls back to `getLatestSelectionForPublicationEnvelope` (newest successful selection with a calculation, scoped by org/publication/envelope). Exchange DTO already includes restored `currentSelections`, notes, customer info, and `latestCalculation`. Frontend hydrates persisted draft over baseline Carrara (`effectiveQty` / session-keyed `ConfigurationView`). |
| **Why** | After 91f1f83, PUT selections returned 200 and totals updated, but hard refresh POST’d a new session; session-only lookup returned no row so UI re-baselined to Carrara Classic / $8,361. |
| **SQL** | None (read path only). |
| **Ops** | Deploy Brain + digital-estimate. Retest: save India Black Pearl → refresh → exchange 201 → GET/configure shows India + updated total without re-selecting. |
| **Out of scope** | Merging draft into the new session row at exchange time; cross-device identity beyond shared stable link. |

### 121. Digital Estimate full catalog options — Elite 100 + plumbing/specialty (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Customer Digital Estimate options expand to (1) the full **Elite 100** customer-visible material catalog (`elite100-customer-materials-v2`, 100 colors from `elite100-2026.json`; Remnant only when explicitly permitted); (2) Brain-normalized **ESF plumbing/specialty** workbook products (`esf-plumbing-specialty-catalog-v1`) with server sell/installed prices — Kansas sinks, Blanco family+finish variants, faucets/add-ons, specialty (priced vs review-only). Envelope seeds family-level ESF products (not every Blanco color SKU as a top-level card). Selection keys: `sink|faucet|accessory|specialty|backsplash|sidesplash:…`. Customer-provided sink/faucet omit product price (sink still charges cutout); missing models create structured `missingInformationRequirements` without blocking save/review. Backsplash includes **4-inch** / full-height / custom-height (custom → review, no invented SF). Side splashes are piece-scoped (left/right/both); length from piece depth × 4″ with independent billable SF ceiling when geometry exists. Public DTOs never expose cost, margin, Wholesale/Direct, SF, or internal rates. Quote Library projection contract is prepared on save (`Customer configuring`); sold-job task automation is deferred. |
| **Why** | Autosave/restore works; customers need the full Elite 100 color set and estimator-approved plumbing/specialty choices with Brain-authoritative pricing. |
| **SQL** | None for this phase (catalog seed is code/module; no new tables). |
| **Ops** | Deploy Brain + digital-estimate + Estimate Studio. Rebuild plumbing seed via `node scripts/build-digital-estimate-plumbing-catalog.mjs` when the workbook changes. Workbook source: `_local/catalog-source/esf-plumbing-specialty-program-2026-07-10.xlsx`. |
| **Out of scope** | Sold-job task automation; vendor image scraping; inventing prices for Glowback/InvisaCook; golden-math audit of all commercial rules; Quote Library dashboard redesign. |

### 122. Digital Estimate configure-enabled publish must open ConfigurationView (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Studio publications that request customer configuration (`customerChoiceGroups` / `allowedOptionKeys` / material allow-lists) **must** activate a configuration envelope before the customer URL is considered successful. `putOptions` strips caller-supplied `sellPrice` and resolves prices server-side — seeded catalog options must never fail activation with `forbidden_caller_authority`. If envelope activation fails, the publication is revoked and publish returns an error (no static-only customer link for configure-enabled publishes). **Replace Link** rotates only the access token and preserves the active envelope. Empty `configuration: {}` remains document-only (static read-only). Frontend continues to select ConfigurationView only when exchange returns `lifecycle=active` **and** a configuration object — never by inferring from saved selections. |
| **Why** | After the full-catalog options phase, Studio seeded room product options with `sellPrice` into `putOptions`, which rejected them as caller authority. Publish still returned `/e/<token>`; exchange found no active envelope (`lifecycle=blocked`); the app fell back to the legacy static document. Replace Link rotated the token on the same envelope-less publication, so the new URL stayed static. |
| **SQL** | None. |
| **Ops** | Deploy Brain (+ Estimate Studio if UI notices change). Republish or Replace Link on affected estimates after deploy so the envelope activates. Confirm customer `/e/<token>` opens ConfigurationView with room options. |
| **Out of scope** | Changing SYNTHETIC_PILOT_ONLY; document-mode redesign; sold-job. |

### 123. Studio Digital Estimate publish hang + polling leak (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Configure-enabled Studio publish seeds envelope options via **batched** Supabase upserts and **does not double-seed** in `createDraft` (`seedCatalogOptions: false` on the publish path). Publish records phase timings + correlation id; fails closed with `DE-ENVELOPE-ACTIVATION-FAILED` / `DE-PUBLISH-TIMEOUT` and **restores prior active publications + tokens** when envelope activation fails after atomic publish. Studio UI uses explicit Idle/Publishing/Published/Failed, client timeout, AbortController cleanup, and does not show revoked links as current. Takeoff parent poll is 20s (paused when hidden); Takeoff iframe is unmounted when opening Scope/Digital/Review; iframe `/results/latest` poll is 20s. Estimate Queue aborts in-flight loads on unmount and ignores AbortError. |
| **Why** | Hosted publish hung for tens of seconds because ~200 options were upserted one-by-one (often twice). Meanwhile Takeoff workspace polled job + `/results/latest` every ~2–2.5s; that traffic survived while working Digital Estimate and competed with Queue loads after navigation. |
| **SQL** | None (uses existing `uq_de_config_options_envelope_key`). |
| **Ops** | Deploy Brain + Estimate Studio + AI Takeoff (iframe poll change). Retest: Publish completes promptly; Network shows no 1s loop; Back to Queue stops detail traffic; Queue loads once. |
| **Out of scope** | Changing `digital_estimate_publish_atomic` to defer supersede (restore-on-failure covers fail-closed); sold-job. |

### 124. Digital Estimate option runtime + customer polish (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Public ConfigurationView must not crash on notes (`productNote` typo → `projectNote`). Side-splash labels use piece display names (never UUIDs; fallback `Countertop piece N`). Room eligibility treats Reception/office as `non_plumbing` (none + customer-provided only). Accessory family headings expand to variant SKUs; sink accessories hide when No sink / customer-provided; plumbing add-ons stay separate. Product copy strips Wholesale/Partner/Direct and shortens Glowback/InvisaCook/FreePower. Public options expose `priceEffectLabel`. Autosave status replaces permanent Save CTA. Configurator error boundary hides raw exceptions. Idempotent Studio publish copy simplified. |
| **Why** | Hosted configurator threw `productNote is not defined`, showed raw piece IDs, mixed accessory family headings with add-ons, and leaked channel/workbook prose. |
| **SQL** | None. |
| **Ops** | Deploy Brain + digital-estimate (+ Estimate Studio for publish copy). Republish (or Replace Link after republish with new envelope) for rooms that need corrected sink eligibility / accessory expansion. |
| **Out of scope** | Full material image sourcing; golden-math pricing audit; Studio per-room category override UI; non-expiring link lifecycle; Quote Library projection; sold-job automation. |

### 125. HR Weekly Operations Scorecard — Thu–Wed weeks + department entry (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Scorecard operational weeks are **Thursday through Wednesday** (`SCORECARD_WEEK_START_DAY = 4`; `week_start` = Thursday, `week_end` = Wednesday). Shared backend week helpers are the source of truth. Department heads receive scoped **Department Quality Entry** views for assigned groups (`service_quality`, `outside_partners`, `plumbing`, `shop_operations`, `quoting`, `machinery`) via org-scoped `workforce_department_user_access`. CEO/admin/executive/hr/`super_admin` retain the full dashboard, executive summary, mistakes log, and report freeze. All users write the same section/mistake/metric/snapshot tables — no department silos. Backend enforces section access on every read/write; frontend hiding is not sufficient. Card trend labels are compact (`A ↑ last week B`) without repeating the section name. |
| **Why** | Department leads need focused entry without fragmenting CEO visibility; prior Monday-start weeks did not match ESF operational weeks. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_workforce_department_access_v1.sql` |
| **Ops** | Apply SQL, redeploy **backend-core** + **app-hr**. Assign department groups under HR Head → Department Access. Historical week rows are not auto-rewritten. |
| **Out of scope** | Auto-migration of historical Monday-bucketed rows; new head/app; AI narrative. |

### 126. Digital Estimate breakdowns, controls, assets & layout (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Customer Digital Estimate uses a full-width responsive shell (~95vw, max ~1650px) with sticky Original/Updated/Changes estimate workspace. Edge profile is a compact dropdown (estimator-approved options only). Backsplash/edge/material price-effect labels use **Original selection / No change / +$ / −$ / Requires estimator review** (not bare “Included”). Customer information and other draft fields share one debounced dirty→autosave pipeline. Sink first-level choices are **No sink / Customer-provided / ESF Stock Sinks / Special-Order Sinks**; stock lists discrete Kansas stock products; special-order covers Blanco family→finish. Product Catalog heroes are copied into `app-digital-estimate/public/product-catalog` with exact SKU/id image maps. Elite 100 imagery remains 11 ready / 89 missing after repo-wide audit. Published snapshot line items + Brain calculation options/custom lines power original/updated breakdowns; Changes shows selection deltas only. Persistence, publish, and server-authoritative pricing unchanged. |
| **Why** | Hosted DE felt like a narrow form; edge was a modal; totals lacked Internal Estimate-style breakdowns; customer info did not autosave without a material change; sinks collapsed stock under a single ESF path; images lived only on slab-inventory origin. |
| **SQL** | None. |
| **Ops** | Deploy **Brain** + **app-digital-estimate** (static asset bundle larger by ~19MB product thumbs). Republish not required for layout/copy; new stock/special-order UI uses existing envelope options. |
| **Out of scope** | Sourcing the remaining 89 Elite 100 photos; CDN migration; Studio per-room option override UI; inventing ungovered backsplash credits; sold-job. |

### 127. Digital Estimate Elite 100 images use Supabase showroom pipeline (2026-07-20)

| Field | Value |
|---|---|
| **Date** | 2026-07-20 |
| **Decision** | Digital Estimate material imagery uses the **same Supabase-backed Elite 100 visual-asset pipeline** as the kiosk showroom iframe, Slab Inventory Elite 100 cards, and public carousel. |
| **Why** | Hosted kiosk/inventory already display all program colors; Digital Estimate must not invent photography work or duplicate masters into the Vite bundle. |
| **SQL** | None new. Existing `eliteos_slab_images_storage.sql`, `eliteos_slab_color_visual_assets.sql`, and color catalog resources remain authoritative. |
| **Ops** | Deploy Brain and `app-digital-estimate`. Ensure `SLABOS_ORGANIZATION_ID`, `PUBLIC_VISUALIZER_ORGANIZATION_ID`, or `SLABCLOUD_ORGANIZATION_ID` is set so the public Digital Estimate can resolve visual assets. |
| **Out of scope** | Re-uploading photos, CDN migration, signed-URL rotation, and changing kiosk navigation or `/stone` pilots. |

### 128. HR scorecard week calendar restart + history reset (2026-07-20)

| Field | Value |
|---|---|
| **Decision** | Scorecard week selector enumerates every valid Thursday-to-Wednesday week from `SCORECARD_EARLIEST_WEEK_START = 2026-06-25` through the current week. |
| **Why** | Prior incorrect week buckets polluted history; ESF will re-enter from the June 25 start. |
| **SQL** | Manual one-time reset using `backend-core/supabase/eliteos_workforce_scorecard_history_reset_v1.sql`, scoped to `elite_stone_fabrication`. This does not delete sections, department access, or configuration. |
| **Ops** | Merge/deploy `backend-core` and `app-hr`, manually run the reset SQL in Supabase, then re-enter weekly data. |
| **Out of scope** | Automatic rewriting of old `week_start` values, multi-tenant wipe, and AI narrative changes. |

### 129. Digital Estimate envelope permissions, material All-tab, Studio edge authority (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | (1) Studio configuration fingerprint **includes `customerChoiceGroups`** (and related allow-lists). Permission edits on an already-published revision **re-apply / activate a new envelope** and record `configuration_updated` — they must not reuse as “unchanged.” Readiness returns `publishedConfiguration` so Studio checkboxes hydrate after refresh; draft vs published permissions are visible with Unsaved / Saving / Saved / Failed — Retry. (2) Material modal **All** tab is always valid (not reset to the first group); pricing-group labels normalize to Promo / A–F; image load failures show fallback and never remove or disable cards. (3) Customer edge options come from **Studio Estimate Scope authority** (`included` / `w_edge` / `d_edge` with Scope labels); original priced edge is baseline; remove the legacy hard-coded “Eased edge” seed path. |
| **Why** | Hosted Studio checkboxes reverted after refresh; All (100) was not clickable; DE showed a generic eased/W/D seed that ignored the priced original edge. |
| **SQL** | None. |
| **Ops** | Deploy **Brain**, **app-elite100-estimate-studio**, and **app-digital-estimate**. Re-open Studio Digital Estimate and **Save / Update Configuration** once per live estimate so envelopes pick up corrected permissions and edge options. |
| **Out of scope** | Per-room Internal Estimate profile catalogs on Studio estimates; inventing ungovered edge pricing; SQL migrations. |

### 130. Digital Estimate save contract, Internal Estimate edge profiles, Supabase imagery (2026-07-20)
| Field | Value |
|-------|--------|
| **Decision** | (1) Hosted `23514` on Studio Save/Update came from inserting `configuration_updated` into `quote_publication_events` outside the event_type check; public autosave failed the same way on `quote_library_customer_config` in `digital_estimate_configuration_events`. Migration **`eliteos_digital_estimate_configuration_updated_event_v1.sql`** widens both checks. Known contract violations map to **422 `DE-CONFIGURATION-CONTRACT-INVALID`** without rotating the customer link. (2) Canonical permission keys are snake_case (`material_color`, `cooktop_cutout`, `side_splash`, …); camelCase aliases normalize before fingerprint/persist. (3) Customer edge dropdown uses Internal Estimate free/premium profiles (Eased…Bevel / Small Ogee…Knife); Brain applies $15 wholesale or $25 direct per LF — never browser-authored rates; no W/D/included scope labels. (4) Elite 100 imagery prefers **`SLABOS_ORGANIZATION_ID`**, then public visualizer / slabcloud org ids; enrichment receives `organizationId` and fails soft when unset. |
| **Why** | Hosted Studio configuration save and customer autosave both hit Postgres check constraints; edge choices were scope classifications; imagery had no reliable org id in the public DE path. |
| **SQL** | **Required (manual apply):** `backend-core/supabase/eliteos_digital_estimate_configuration_updated_event_v1.sql` |
| **Ops** | Apply SQL, deploy Brain + Studio + Digital Estimate. Set `SLABOS_ORGANIZATION_ID` on Brain if missing. Re-Save Configuration once so envelopes reseed edge profiles. |
| **Out of scope** | Sink/faucet/add-on product-model cleanup (deferred); inventing edge LF when missing (review required). |
### 130. HR Department Access — eligible users + Executive Dashboard (2026-07-20)

| Field | Value |
|-------|--------|
| **Decision** | Department Access user picker loads **active org `user_profiles`** (plus `user_head_access` for HR Head status), not workforce roster / prior assignments alone. Prefer users with HR Head access; managers can still manage existing assignments if HR Head was later removed. Assignable access includes **`executive_dashboard`** (stored in `workforce_department_user_access.department_slug`, excluded from department→section mapping). That assignment grants full scorecard / mistakes / executive summary / report generation on the backend, but **does not** grant Department Access management, System Admin, or org settings. Role managers (`admin` / `executive` / `hr` / `super_admin`) retain full access + manage rights. |
| **Why** | Newly invited eliteOS users with HR Head access were missing from the picker (roster merge was the wrong source); operators also need a single full-dashboard assignment without listing every department. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_workforce_executive_dashboard_access_v1.sql` (widens CHECK to include `executive_dashboard`). |
| **Ops** | Apply SQL, redeploy **backend-core** + **app-hr**. Refresh users in Department Access after invites / HR Head grants. |
| **Out of scope** | Browser queries to `auth.users`; granting System Admin / org settings via Executive Dashboard; auto-apply migration. |

### 131. Digital Estimate CSP images, selection concurrency, save UI (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | (1) Customer HTML CSP `img-src` allows **`'self' data: blob:`** plus the origin from **`VITE_SUPABASE_URL`** (Elite 100 Storage thumbs/previews). No `https:` / `*` image wildcards; `script-src` / `connect-src` unchanged aside from existing Brain origin. CSP is injected at **app-digital-estimate build** (`vite.config.ts` → `htmlCsp.mjs`), not by API JSON headers. (2) Hosted sink **409** was **optimistic concurrency** (`row_version_conflict`): selection handlers fired immediate PUT **and** debounced autosave with the same `expectedRowVersion`. Saves are now **single-flight + queued draft**; **409 / DE-CONFIGURATION-STALE** triggers one refetch + retry. Missing options return **422 `option_not_allowed` / DE-OPTION-NOT-ALLOWED**; envelope mismatch returns **409 `stale_configuration` / DE-CONFIGURATION-STALE**. (3) Product cards render only when a **server envelope option key** exists. (4) Authoritative configured total updates only after successful save (`savedCalc`); pending labeled while unsaved; failure reverts to last saved total. (5) Legacy mobile bottom **Save** bar removed — one autosave status system (+ Retry on error). |
| **Why** | Hosted materials blocked by CSP `img-src 'self' data:`; sink select raced to 409; totals looked finalized while a conflicting PUT failed; duplicate Save UI confused customers. |
| **SQL** | None for this slice. Prior required migration may still apply: `eliteos_digital_estimate_configuration_updated_event_v1.sql`. |
| **Ops** | Set **`VITE_SUPABASE_URL`** on the Digital Estimate Vercel project (public project URL only). Deploy **app-digital-estimate** + **backend-core**. |
| **Out of scope** | Relaxing connect-src / script-src. |

### 132. Digital Estimate approved product catalog & pricing cleanup (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | (1) Customer sink hierarchy is **No sink / Customer-provided / ESF Sinks** (one catalog). Faucet hierarchy is **No faucet / Customer-provided / ESF Faucets**. Do **not** expose Stock vs Special Order as commercial programs; internal availability remains metadata only (`customerAvailabilityText` → null). (2) Approved workbook (`esf-plumbing-specialty-program-2026-07-10.xlsx` → `esfPlumbingCatalogSeed.mjs`) remains authoritative — 116 products; 53 excluded helper/blank/empty-family rows. Exact finish → SKU → sell price via Brain; multi-finish families require `variantSku` (`missing_variant_sku`). (3) **Project add-ons** replace Approved add-ons; hide derived `qty-sink` / `qty-bar` / sink-product qty controls. Sink accessories vs **Faucet and plumbing add-ons** stay separated; model-specific accessories only after ESF sink. (4) Updated breakdown uses customer-friendly cutout/product labels. Quote Library projection adds sink/faucet/material summaries + review flags (prepare-only). |
| **Why** | Customers were choosing Stock vs Special-Order catalogs and editing duplicate cutout qty controls that overlap room selections. |
| **SQL** | None. |
| **Ops** | Deploy **backend-core** + **app-digital-estimate**. Republish / Save Configuration so envelopes reseed product options if needed. |
| **Out of scope** | Full Product Catalog image backfill for all 116 SKUs; Quote Library UI redesign; inventing faucet-hole drilling prices. |

### 133. Digital Estimate sink eligibility, faucet images, accessory compatibility (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | (1) Hosted Kitchen “0 approved sinks” was **stale envelope options** (only `none` / `customer_provided`), not a missing catalog — catalog has 45 sinks. Room eligibility is canonical (`kitchen` / `bar_prep` / `vanity` / `laundry_utility` / `non_plumbing`) via `roomEligibility.mjs`; display names never authorize eligibility. (2) Envelope fingerprint includes **product catalog fingerprint** so Studio **Save / Update Configuration** reseeds ESF sink/faucet/accessory keys when the approved workbook seed changes; customer link stays stable. (3) Faucet images resolve with exact productId (colon↔hyphen), SKU, normalized compact SKU, then manufacturer+model+finish keys — no broad substring matching. Public options may expose `thumbnailUrl` / `previewUrl` / `imageStatus` / `imageMatchType` (no filesystem paths). (4) Sink-specific accessories are cleared under No sink / Customer-provided (not charged); incompatible ESF accessory+sink returns **422 `incompatible_accessory`**. UI clears incompatibles on sink change with a customer notice. (5) Updated breakdown uses room-specific cutout labels (`Kitchen — Sink cutout`, etc.) and `ESF Sink — {name}` / `Customer-provided sink` lines. |
| **Why** | Catalog phase shipped products, but live envelopes never reseeding after catalog growth left Kitchen empty; faucet cards used placeholder because image-map keys used hyphens vs catalog colons; accessories and generic cutout labels confused customers. |
| **SQL** | None. |
| **Ops** | Deploy **backend-core** + **app-digital-estimate** (+ Estimate Studio). For each live estimate: **Save / Update Configuration** once so the fingerprint change reseeds sink options. Do **not** rotate the customer link. |
| **Out of scope** | Adding Product Catalog assets for Moen 5965 / 7804 BZG / 9126 BL (unmatched); inventing laundry sinks beyond workbook-tagged `Liven Laundry`; Quote Library UI redesign. |

### 134. Digital Estimate Blanco Inteos variant save (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | Multi-finish Blanco sink families (e.g. Inteos 33" Workstation) require an exact finish → SKU before Brain pricing. Hosted 500 was an uncaught `missing_variant_sku` during `resolveCatalogProductSelection` when the UI saved the family option with `source: esf` but without a finish (envelope `customerSafe.variants` were not plumbed into product cards, so the card offered Select instead of Choose finish). Fix: (1) public options → view-model → product cards carry variants; (2) auto-resolve single-finish families; (3) multi-finish without SKU returns **422 `product_variant_required` / `DE-PRODUCT-VARIANT-REQUIRED`** (never 500); (4) `resolveBlancoVariant` accepts canonical `…:sku:NNNN` tokens; (5) envelope seed price lookup may use family sellPrice when finish is omitted. |
| **Why** | Customers could see Inteos and attempt save; Brain threw an unhandled Error → generic 500 + “Unable to save right now.” |
| **SQL** | None. |
| **Ops** | Deploy **backend-core** + **app-digital-estimate**. Existing links do not need token rotation; Save/Update Configuration optional if variants already on envelope options. |
| **Out of scope** | Per-finish image assets for every Blanco SKU; changing family option keys to per-SKU keys. |

### 135. Elite 100 Estimate Studio / Digital Estimate production polish — Phase 1 (2026-07-20)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-20 |
| **Decision** | The requested "production polish" scope (Estimate Queue redesign, Workspace guided-workflow redesign, Studio publication panel A/B/C/D regrouping, customer header/room-card visual redesign, full accessibility + 5-breakpoint responsive audit, ~80 enumerated tests) is materially larger than one safe, reviewable branch — it spans a full-app UI overhaul across two frontends. This branch ships **Phase 1**, the highest-value, lowest-risk, guardrail-safe slice: (1) **Customer breakdown room grouping** — Original/Updated/Changes lines now render grouped under a room heading (`groupBreakdownLinesByRoom`) instead of a flat repeating list, using only existing authoritative `BreakdownLine` data (no new pricing, no fabricated room totals). (2) **Studio diagnostic cleanup** — the "Link recovery diagnostic" block in the Digital Estimate panel (`tokenWrappedPresent`, `activeTokenRows`, `decryptSucceeded`, etc.) is now gated behind a collapsed `<details>` "Troubleshooting details" disclosure, with a plain-language status line shown by default. (3) Two **pre-existing, unrelated test failures** were found and isolated (not fixed as "logic" changes): `phaseOptionRuntime.ui.test.mjs` had a stale case-sensitive `"Plumbing add-ons"` assertion that never matched the shipped `"Faucet and plumbing add-ons"` header — corrected to a case-insensitive check. `phaseDe2b.test.mjs` and `phaseDe2f.ui.test.mjs` (backend-core) fail identically on `main` with no changes from this branch — left untouched and documented for a follow-up bugfix branch. |
| **Why** | Deliver real, tested polish now without rewriting core pricing/session/publication logic under a "polish" label, and without shipping an unreviewable mega-diff across Queue, Workspace, Studio, and Customer surfaces in a single pass. |
| **Deferred to later phases (not started)** | Estimate Queue value-projection/status-model rework; Workspace guided-stage navigation; Studio A/B/C/D panel regrouping; customer page header redesign; room card redesign; absolute per-room Countertop/Backsplash dollar decomposition (see "Real gap found" below); product modal/finish-image polish; accessibility pass; responsive breakpoint pass; performance/bundle report. |
| **Real gap found (not fixed — requires a calc-engine change, not polish)** | The spec's room breakdown wants an *absolute* dollar "Countertop" and "Backsplash" line per room (e.g. "Countertop — $4,800"). The current calculation DTO (`elite100ConfigDeltaEngine`/`customerConfigurationSummary`) exposes only upgrade **deltas** and a project-level total — there is no authoritative per-room absolute countertop/backsplash allocation to read. Fabricating one on the frontend would violate "must reconcile exactly to the authoritative calculation" and "do not invent new pricing." This needs a dedicated backend DTO addition in a future phase, not a UI polish change. |
| **SQL** | None. |
| **Ops** | Deploy **backend-core** + **app-digital-estimate** + **app-elite100-estimate-studio**. No envelope reseed, no token rotation required. |
| **Out of scope** | Everything listed under "Deferred to later phases" above; sold-job/QuickBooks/Moraware/permanent-link behavior (per original instructions). |

### 136. Elite 100 Estimate Studio / Digital Estimate production polish — Phase 2: authoritative room-level customer pricing projection (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Decision** | Added one new, pure, read-only backend module — `backend-core/src/digitalEstimate/configuration/customerRoomPricingProjection.mjs` — that decomposes the existing authoritative totals (elite100-config-delta-v2's `internal` result for **Updated**, and the frozen `customer_estimate_print_snapshot` for **Original**) into a room-scannable Countertop / Backsplash / Add-ons / Room-total shape, plus a **Changes** (Original→Updated) diff and a customer-safe public DTO. Wired additively into both existing response paths: `buildPublicDigitalEstimateDto` (`digitalEstimatePublicSerializer.mjs`) now returns `estimate.roomPricing` (Original) for every caller (session bootstrap, token exchange, amendment studio, access service); `publicConfigurationService.mjs`'s save/calculate path now returns `customerResultJson.roomPricing` (Updated) and persists a fuller `internalEvidenceJson.roomPricingProjection` + `roomPricingInternalSummary` for later Queue/Workspace reuse. Both integration points are wrapped in their own try/catch and degrade to `roomPricing: null` on any internal error — a bug in the new module can never block a save or break the existing (unrelated) estimate/calculation response. **No existing pricing formula, total, snapshot, envelope, option key, or persisted field was changed.** |
| **Why** | The customer Digital Estimate needs a per-room price breakdown, but the current calc DTO only ever exposed a project total and option deltas — building this on the frontend would mean guessing at numbers the frontend cannot verify. |
| **Traced pricing sources (task 1)** | *Room-owned, exactly attributable today*: sink / sink cutout (`qty-sink`, `qty-bar`, `qty-ss`) / faucet / accessories / edge upgrade / side splash / specialty — all absolute `per_each` option lines whose `optionKey` already encodes the owning `roomKey` (`parseProductOptionKey`), summed 1:1 into `optionsCents`. *Room-owned but never separately decomposed anywhere upstream*: Countertop. `baselineExactTotalCents` (the frozen total elite100-config-delta-v2 anchors to) is a single project-level number — no code path has ever asked "how much of this is Kitchen vs. Powder Bath." *Confirmed real pricing gap, not fixed*: Backsplash. `chargeableBacksplashSf` is computed in `publicConfigurationService.mjs` (none / standard_4in / full_height / custom_height) but **elite100-config-delta-v2 never reads it** — backsplash contributes **$0** to every configured total today; only full-height/custom-height selections raise an estimator-review flag. *Not currently attributable at all*: the Original (pre-Digital-Estimate) absolute per-room countertop/backsplash dollar split. `customer_estimate_print_snapshot` (`digitalEstimateSnapshot.mjs`) only ever stores per-room **square footage text** (`"Countertop 45 sf"`) and a flat, non-room-scoped `lineItems`/`summaryRows` list — there is no persisted per-room dollar figure anywhere in the pipeline to read back (confirmed by tracing `estimate_rooms` end to end: Studio publish → `digitalEstimateSnapshot.mjs` → `quoteLibraryHandoffPayloads.js` — every hop carries SF, never $, per room). |
| **Room ownership rule (task 6)** | Room-owned: countertop, room backsplash, room side splash, room sink + cutout, room faucet, room accessories, room edge upgrade, room specialty item, any legacy line **unambiguously** naming exactly one room. Project-level: custom lines, credits, the Spahn & Rose adjustment (an entire-estimate %, not room-scoped), and any option key that does not resolve to a `roomKey` at all. No charge is ever counted in both places — every cent in the room-attributed set is a strict subset of `optionsCents`/`materialDeltaCents`; everything else falls to `governedAdjustmentsCents`/`projectAddOns`. |
| **Countertop attribution method (honest, not invented)** | *Updated, frozen-baseline-anchor mode*: the one authoritative `baselineExactTotalCents` is split across rooms by chargeable-SF **weight only** (never exposed in any output), using a largest-remainder integer-cent allocator (`allocateProportionally`) so the shares always sum back to the exact total — then each room's already-computed, exact `materialGroupDeltas[...].exactMaterialDeltaCents` is added on top. Tagged `attributionStatus: "proportional_allocation_of_baseline"` so no caller mistakes this for a value read back out of the original invoice. *Updated, standalone (non-anchor) mode*: the engine's own absolute per-room reprice is already the authoritative figure — used directly (`attributionStatus: "absolute_reprice"`). *Original*: `countertopAmount`/`backsplashAmount` are `null` with `attributionStatus: "not_currently_attributable"` — never guessed. |
| **Reconciliation** | `roomTotal = countertopAmount + (backsplashAmount ?? 0) + addOnsAmount`, and `sum(room.roomTotal) + projectAddOnsTotal + governedAdjustments = configuredExactTotal`, proven to hold **by algebraic construction** (not by chance) in both anchor and standalone engine modes — see `customerRoomPricingProjection.test.mjs` items 3–4, 16–18. `reconciliationStatus` is `"reconciled"` / `"review_required"` (totals match, but a component like full-height backsplash needs estimator review — no price is fabricated for it) / `"failed"` (explicit, with a safe internal diagnostic; the public DTO never receives a fabricated number when this happens) / `"not_attributable"` (Original view, by design, since no per-room baseline dollar split exists). |
| **Ambiguous legacy lines (task 8)** | Flat `lineItems` such as `"Kitchen Sink Cutouts"` are mapped to a room **only** when the room's exact display name appears as an unambiguous whole-word match in the label (`mapLegacyLineToRoom`); a label matched by more than one room name is left project-level and reported via `unresolvedLegacyLines`. Lines like `"Vanity/Bar Sink Cutouts"` (no literal room name present) always stay project-level — never guessed. |
| **Public DTO** | `toPublicRoomPricingDto` / `toPublicChangesPricingDto` expose exactly `roomName`, `countertopAmount`, `backsplashAmount`, `addOnsAmount`, `roomTotal`, selected customer-facing labels, and `reviewRequired`/`reviewRequiredCategories` — verified by test to contain no option keys, no SF/LF tokens, and to pass both existing forbidden-content guards (`assertPublicConfigurationHasNoForbiddenContent`, `assertPublicDtoHasNoForbiddenContent`). Added `roomPricing` to the exact-match `PUBLIC_ESTIMATE_DTO_KEYS` allowlist in `digitalEstimatePublicSerializer.mjs`. |
| **Internal Queue/Workspace summary** | `toInternalQueueWorkspaceSummary` returns exactly `originalTotal, configuredTotal, delta, roomCount, changedRoomCount, lastSavedAt, reviewRequiredCount, missingInformationCount, reconciliationStatus` — no per-room or option-key detail. Persisted as `internalEvidenceJson.roomPricingInternalSummary` for a later Queue/Workspace UI phase; **no Queue/Workspace UI was changed in this branch.** |
| **Tests** | New `backend-core/src/digitalEstimate/configuration/customerRoomPricingProjection.test.mjs` — 17 test blocks covering all 32 requested checks (stable room IDs, original/updated/changes derivation, one-appearance-per-category for sink/cutout/faucet/accessories/edge/side-splash/specialty, customer-provided-sink-has-no-product-charge, exact reconciliation in both anchor and standalone engine modes, explicit reconciliation failure with no silent adjustment, integer-cent math, public-DTO content safety, deterministic/ambiguity-rejecting legacy-line mapping, project-level-option isolation). Full existing `backend-core/src/digitalEstimate/**` (27/29 — same 2 pre-existing §135 failures, untouched) and `backend-core/src/elite100EstimateStudio/*digitalEstimate*` suites re-run clean. Live smoke test of the real `saveSelections` → `roomPricing` path confirmed exact reconciliation end to end. |
| **SQL** | **None required for this phase.** (If a future phase wants a *stored* per-room absolute countertop/backsplash dollar figure — as opposed to this phase's SF-weighted allocation of the one authoritative total — that would require a publish-time schema addition to `customer_estimate_print_snapshot.rooms[]`, a business decision, not something this branch should invent.) |
| **Environment variables** | None added. |
| **Deployment surfaces** | **backend-core** only. No frontend changes in this phase — the projection is additive/backend-only groundwork for a future UI phase. No envelope reseed or token rotation required (purely additive response fields). |
| **Pricing gap requiring a business decision (carried over from §135, now precisely scoped)** | Backsplash is priced nowhere in the system today (confirmed, not assumed). Whether/how to price full-height or custom-height backsplash — and whether a governed, stored per-room countertop $ should eventually replace the SF-weighted allocation used here — are business/pricing-policy decisions, not implementation details this branch may resolve unilaterally. |
| **Out of scope** | Everything listed under §135 "Deferred to later phases"; any Queue/Workspace/Studio-activity UI consuming the new `roomPricingInternalSummary`; per-finish sink/faucet images. |

### 137. Digital Estimate pricing-authority phase 3: governed backsplash pricing + immutable publish-time room pricing snapshots (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Decision** | Closed both gaps §136 identified: (1) `chargeableBacksplashSf` is now consumed by `elite100-config-delta-v2` and priced at the room's governed material rate; (2) a frozen, room-level `roomPricing` snapshot (Countertop/Backsplash/Add-ons/Room-total, integer cents) is now captured inside the existing immutable `customer_snapshot_json` at publication time and used as the authoritative source for the **Original** view, replacing the SF-weighted-of-a-flat-total guess from §136 wherever a snapshot exists. |
| **1. Exact stage backsplash pricing was dropped** | `publicConfigurationService.mjs` already computed `chargeableBacksplashSf` per room (none/standard_4in/full_height/custom_height) but passed nothing backsplash-shaped into `elite100ConfigDeltaEngineV2.mjs` — the engine had no backsplash fields in its room-input schema at all, so the SF was computed and then silently discarded before it ever reached a price. Confirmed by tracing the full pipeline: Studio room scope → `studioEstimatePublicationAdapter.mjs` (geometry frozen into `pricing_evidence_json`, but `backsplashHeightMode`/`backsplashHeightIn`/`backsplashMeasuredLengthIn` were **not yet included** — first gap fixed here) → `configurationTrustedContext.mjs` (locked-room extraction) → `publicConfigurationService.mjs` (`chargeableBacksplashSf` computed) → **dropped here** → `elite100ConfigDeltaEngineV2.mjs` (no backsplash consumption) → `customerRoomPricingProjection.mjs` (`backsplashAmountCents` always `null`/unattributed, per §136). |
| **2. Geometry authority sources** | No segment/edge-level wall-adjacency model exists anywhere in the codebase (Studio, Internal Estimate, Takeoff, or Digital Estimate) — confirmed by exhaustive trace, not assumed. The only real authority is room-level: `backsplashMeasuredLengthIn` (estimator/Takeoff-approved linear feet of wall-backed run) and `backsplashHeightMode`/`backsplashHeightIn` (original approved style + optional authoritative wall height), both now frozen into `pricing_evidence_json` at publish time (`studioEstimatePublicationAdapter.mjs`). |
| **3. Eligible-segment model** | New module `backsplashPricingAuthority.mjs` treats the existing `backsplashMeasuredLengthIn > 0` (or `backsplashSf > 0` fallback) as the authoritative proxy for "estimator-approved wall-backed eligible length exists," because Takeoff's own linear-footage instructions already exclude islands and open/exposed edges when that figure is produced upstream — there is no separate per-edge classification to consume. This is a deliberate, documented scope choice (see "Business decisions still required" below), not a hidden assumption. |
| **4. Excluded segment rules** | A room with no measured backsplash length and no backsplash SF (`roomHasEligibleBacksplashLocations` → `false`) never gets an eligible/priced backsplash option seeded at all (`digitalEstimateProductOptions.mjs`) — island-only rooms show no fake priced choice, matching golden E and test-matrix item 11. |
| **5. 4-inch pricing behavior** | Fixed height, billed SF = `ceilBillableSquareFeet(measuredLengthIn/12 × 4/12)`, independently rounded, priced at the room's own resolved material $/SF + tax (golden A/B/D/K). Unchanged baseline + unchanged material → zero delta (golden A); material upgrade alone reprices it at the new rate (golden B). |
| **6. No-backsplash credit behavior** | Credits exactly the governed **original** billed-SF amount (reusing the *original* mode's billed SF, never the newly-selected mode's) — golden C. Never exceeds the original amount (test-matrix 18) and never invents a credit when the original amount can't be determined (`REMOVAL_CREDIT_UNRESOLVED` review code, task 4). |
| **7. Custom-height behavior** | Governed default range `GOVERNED_CUSTOM_HEIGHT_MIN_IN`–`GOVERNED_CUSTOM_HEIGHT_MAX_IN` (12"–18", chosen as the smallest safe range distinctly above 4" standard and below full-height, documented as a business decision to confirm — see below). Within range + a requested height + existing run geometry → priced automatically (golden H). Outside range, or no requested height, or no run geometry → `CUSTOM_HEIGHT_REVIEW` / `BACKSPLASH_HEIGHT_OUT_OF_RANGE` / `GEOMETRY_MISSING`, zero delta, no invented total (golden I). |
| **8. Full-height behavior** | Requires an authoritative vertical height (`room.backsplashHeightIn`, now frozen at publish, or an already-known original full-height billed SF) to price automatically (golden G); absent that, saves the selection with `FULL_HEIGHT_MEASUREMENT_REQUIRED`, zero delta, no invented price (golden F) — the estimator is never asked to redraw eligible runs merely because the customer picked Full height. |
| **9. Side-splash ownership and pricing** | Confirmed unchanged and independent: side splash is its own `sidesplash:<room>:<piece>:<side>` option line, owned by **Add-ons** (not Backsplash) end-to-end — engine, room projection, Original, Updated, Changes, and customer breakdown all agree on this — priced exactly once, never duplicated against or folded into the primary backsplash amount, and never removed by a "No backsplash" selection (golden J, test-matrix 25–26). |
| **10. Independent rounding** | Each room's backsplash billed SF is ceiled independently of that room's countertop SF and of every other room's backsplash SF (`ceilBillableSquareFeet`, never combined before ceiling) — proven by golden K (10.1→11 SF, 23.2→24 SF, two rooms, never summed first) and the existing side-splash ceiling tests in `digitalEstimateProductOptions.test.mjs`. |
| **11. Updated calculation contract** | `elite100ConfigDeltaEngineV2.mjs` room input gained `backsplashMode`, `baselineBacksplashMode`, `backsplashReviewCodes`, `backsplashOriginalBilledSf`, `backsplashConfiguredBilledSf` (billed-SF values, never raw geometry). The engine independently prices `backsplashConfiguredSellCents`/`backsplashConfiguredUseTaxCents` at the room's resolved material rate, computes `backsplashDeltaCents` (configured − baseline), and folds that delta into `selectionDeltaSubtotalCents` (anchor mode) or `preAdjustmentSubtotalCents` (standalone mode) — exactly once, alongside the pre-existing option/material logic, with zero changes to unrelated pricing paths. Fingerprinted (`backsplashMode`, `backsplashConfiguredBilledSf` in the input fingerprint; `backsplashDeltaCents` in the calculation fingerprint) so cache/idempotency behavior stays correct. |
| **12. Review-required codes** | `BACKSPLASH_REVIEW_CODES`: `FULL_HEIGHT_MEASUREMENT_REQUIRED`, `CUSTOM_HEIGHT_REVIEW`, `GEOMETRY_MISSING`, `PRICE_UNRESOLVED`, `REMOVAL_CREDIT_UNRESOLVED`, `HEIGHT_OUT_OF_RANGE` — all non-blocking (save always succeeds), surfaced to the customer as plain-language `reviewRequiredMessages` strings (`publicConfigurationService.mjs`) and retained internally as structured codes on `room.backsplashReviewCodes` / the room projection's `reviewRequiredItems`, persisted in `internalEvidenceJson` so they survive refresh and session changes (test-matrix 30). |
| **13. Snapshot storage design** | **Smallest safe design chosen: no new table, no SQL migration.** The new `roomPricing` object is nested as an additional field inside the existing `customer_snapshot_json` JSONB column on `public.quote_publication_snapshots` (`digitalEstimateSnapshot.mjs`) — a column that is already versioned, immutable-per-revision, and hashed by the existing publish pipeline. This reuses 100% of the existing immutability/versioning/history guarantees instead of duplicating them in a new table. |
| **14. Snapshot version** | `ROOM_PRICING_SNAPSHOT_VERSION = "v1"` (`roomPricingPublishSnapshot.mjs`), stored on the snapshot itself (`snapshotVersion`) and surfaced in the internal summary DTO, so a future v2 allocation method can be introduced without breaking older frozen snapshots. |
| **15. Exact vs. allocated countertop source** | **No exact per-room countertop/backsplash dollar line exists anywhere upstream of publish** (confirmed again in this phase, not re-guessed) — the Studio→Digital Estimate publish pipeline only ever carries per-room *material/color* selections and aggregate SF, never a stored per-room $ figure. Source is therefore `published_allocation_v1` for every room, every time — `exact_room_pricing` is defined in the code as a documented future source but is never actually reached today. This is stored as an explicit internal tag (`countertopBacklashPricingSource`) on the snapshot, never described to the customer as a "live estimate" or approximation. |
| **16. Publish-time snapshot behavior** | `buildRoomPricingPublishSnapshot` (new module) runs once, synchronously, inside `digitalEstimateSnapshot.mjs` at the moment a revision is published — never recomputed on read. Two-stage largest-remainder integer-cent allocation: (a) each room's total share of the frozen customer display total is allocated by that room's combined countertop+backsplash SF weight; (b) within a room's share, countertop vs. backsplash is split by their own SF weights. Every cent of the frozen total is accounted for by construction (no remainder loss); add-ons are explicitly `0`/`not_currently_attributable` because no room-owned add-on dollar figure is carried through the Studio publish pipeline today (confirmed, same gap as §136) — never invented. Wrapped in try/catch in `digitalEstimateSnapshot.mjs`; a failure yields `roomPricing: null` (safe legacy fallback), never a broken publish. |
| **17. Original behavior** | `buildOriginalRoomPricingProjection` is now a dispatcher: if `customerSnapshot.roomPricing` exists (new publications), it builds Original directly and exactly from that frozen snapshot (`buildOriginalRoomPricingProjectionFromSnapshot`) — real per-room Countertop/Backsplash/Add-ons dollars, not `null`, replacing the §136 all-`null` placeholder. If absent (old publications), it falls back unchanged to the §136 legacy flat-summary behavior (`buildLegacyOriginalRoomPricingProjection`, `snapshotAvailability: "legacy_room_pricing_snapshot_unavailable"`). Original never reads latest selections, the live calculation, or current catalog prices — by construction, its only inputs are the frozen snapshot or the frozen legacy `customerSnapshot`. |
| **18. Updated behavior** | Unchanged contract from §136 (immutable Original + latest saved selections + latest authoritative engine calculation), now additionally consuming the engine's real backsplash amount/review codes instead of always-null. Fixed a genuine double-count bug found while wiring this up: the opaque legacy `baselineExactTotalCents` implicitly already included backsplash dollars, so allocating 100% of it to Countertop while *also* adding the newly-priced Backsplash amount double-counted backsplash. Fix: `knownBaselineBacksplashCents` (sum of each room's resolved baseline backsplash $) is subtracted from `baselineExactTotalCents` before the SF-weighted Countertop allocation runs, so every backsplash dollar is counted exactly once. When a room's configured backsplash is review-required (`null`), its `backsplashAmountCents` falls back to the known baseline backsplash $ (never `$0`) so the room/total still reconciles while the review flag communicates the unresolved state. |
| **19. Changes behavior** | Extended `buildChangesRoomPricingProjection` with an explicit `backsplash` change row (`BACKSPLASH_MODE_LABEL` customer-facing mode names, e.g. "4-inch backsplash" → "No backsplash") whenever `backsplashMode` or `backsplashAmountCents` differs between Original and Updated, flagged `review_required` when backsplash review items exist — deduplicated against the generic per-item review-flag loop so no line appears twice. |
| **20. Reconciliation method** | Unchanged invariants from §136 (`roomTotal = countertop + (backsplash ?? 0) + addOns`; `sum(roomTotal) + projectAddOns + governedAdjustments = configuredTotal`), now proven to hold with real (non-null, non-zero) backsplash dollars in the mix, including the review-required-fallback case above. `reconciliationStatus` semantics unchanged: `reconciled` / `review_required` / `failed` (explicit, safe fallback DTO, internal diagnostics only) / `not_attributable` (legacy Original). Two new regression tests (`customerRoomPricingProjection.test.mjs` #19–20) prove the double-count fix and the review-required-fallback case both reconcile exactly. |
| **21. Legacy publication behavior** | Old links continue to open with no republish required, no token rotation, and no fabricated exact room dollars — `buildOriginalRoomPricingProjection` falls back to the same §136 flat-summary legacy behavior, now explicitly tagged `snapshotAvailability: "legacy_room_pricing_snapshot_unavailable"` / `reconciliationStatus: "not_attributable"` (golden L, test-matrix 46–48). |
| **22. Unresolved pricing cases** | Full-height without authoritative height, custom-height outside the governed range or without a requested height, and no-backsplash credit when the original amount can't be resolved all: save successfully, never invent a total, surface a structured internal review code + plain-language customer message, and are counted in the internal summary's `unresolvedPricingCount` / `backsplashPricingStatus: "review_required"`. |
| **23. Files changed** | New: `backsplashPricingAuthority.mjs` (+ `.test.mjs`), `roomPricingPublishSnapshot.mjs` (+ `.test.mjs`), `elite100ConfigDeltaEngineV2.backsplash.test.mjs`. Modified: `elite100ConfigDeltaEngineV2.mjs`, `publicConfigurationService.mjs`, `customerRoomPricingProjection.mjs` (+ `.test.mjs`), `digitalEstimateSnapshot.mjs`, `digitalEstimatePublicSerializer.mjs`, `studioEstimatePublicationAdapter.mjs`, `configurationTrustedContext.mjs`, `digitalEstimateProductOptions.mjs` (+ `.test.mjs`), `studioEstimateDigitalEstimateService.mjs`. No frontend files changed in this phase. |
| **24. Tests run** | New: `backsplashPricingAuthority.test.mjs`, `roomPricingPublishSnapshot.test.mjs`, `elite100ConfigDeltaEngineV2.backsplash.test.mjs` (13 tests incl. goldens A–K + J) — all pass. Updated and re-passing: `customerRoomPricingProjection.test.mjs` (20 blocks, incl. 2 new double-count/review-fallback regressions), `digitalEstimateProductOptions.test.mjs` (backsplash-eligibility gating). Full `backend-core/src/digitalEstimate/**` + `backend-core/src/elite100EstimateStudio/**` suites re-run: **71/73 passing**, the same 2 pre-existing, unrelated failures from §135/§136 (`phaseDe2b.test.mjs`, `phaseDe2f.ui.test.mjs`) — untouched, documented, not caused by this phase. |
| **25. SQL migration required** | **None.** Snapshot is stored inside the existing `customer_snapshot_json` JSONB column — no schema change. |
| **26. Exact SQL migration filename** | **N/A — no migration file created or required for this phase.** |
| **27. Environment variables** | None added. |
| **28. Deployment surfaces** | **backend-core only.** No frontend changes, no envelope reseed, no token rotation required — all changes are additive backend fields/behavior consumed only by existing try/catch-wrapped integration points that degrade safely (`roomPricing: null`) on any error. |
| **29. Hosted acceptance checklist** | See task list section 32 in the originating request (Publish-time snapshot; Original view; 4-inch backsplash incl. island exclusion + material-change repricing; No-backsplash credit; Full-height with/without authority; Custom-height; snapshot immutability across selection changes + Replace Link; legacy publication fallback) — not yet run against a hosted environment in this session; recommended before merge. |
| **30. Business decisions still required** | (a) Confirm the governed custom-height range (12"–18" chosen here as a placeholder-but-functional default — needs pricing/ops sign-off). (b) Confirm that room-level `backsplashMeasuredLengthIn`/`backsplashSf` (estimator/Takeoff-approved, islands already excluded upstream) is an acceptable proxy for "eligible backsplash locations," or whether a true segment/edge-level eligibility model is required in a future phase (would need new Studio/Takeoff data capture + UI, out of scope here). (c) Confirm add-ons remaining `$0`/`not_currently_attributable` in the publish-time snapshot is acceptable until a future phase adds room-owned add-on $ to the Studio→Digital Estimate publish payload. (d) Confirm `published_allocation_v1` (SF-weighted, not an exact stored figure) is an acceptable customer-facing Original Countertop/Backsplash source, or whether a future phase should add an exact per-room $ capture at Studio approval time. |

### 138. AI Takeoff Review — piece-row identity fix (editing one Piece field updated every row) (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Bug** | In the consolidated Takeoff Review worksheet (Studio embed), typing into one row's Piece field changed the Piece field of every row in that room; include/exclude, remove-piece, and room-reassignment were similarly collective. |
| **Root cause** | The AI extraction service persisted `parsed.rooms` **as-is** with no room/area/run id uniqueness enforcement (`takeoffExtractionService.mjs` normalize step). The prompt asks the model for per-run `"id": "<uuid>"`, but models can emit the literal placeholder or repeat an id across runs. Every editor surface assumes run ids are draft-wide unique: `patchRun` matched `run.id === runId` across **all areas of the room** (fanning one edit out to every duplicate), React row keys were `${roomId}:${runId}` (duplicated), `excludedRunIds`/`deletedRunIds` sets and `removePieceFromTakeoff` were id-keyed (collective exclude/delete), and `reassignRun` filtered every matching id while moving only one. |
| **Fix — identity strategy** | New pure helper `ensureUniqueTakeoffIdentity(takeoff)` in `takeoffAuthoritativeResult.mjs` (shared backend + frontend via the existing `@takeoff-core` alias): walks rooms → (`room.runs`, `room.pieces`, `room.areas[].runs`), treats blank/placeholder ids (`<uuid>`, `uuid`, `id`, `null`, …) as missing, keeps the **first** occurrence of an id, and assigns a freshly generated `run-<uuid>`-style id to any later duplicate or missing id. Never mutates input; returns the original object when no change is needed (`changed: false`), so re-hydration of an already-healed draft is a no-op. Identity preference order honored: persisted id → generated id stored in the draft at normalization (persists across save/reload). Room name, array index, piece name, and dimensions are never used as identity. |
| **Where applied** | (1) **Source**: `takeoffExtractionService.mjs` normalize step — every newly persisted `normalized_takeoff_json` now has unique ids. (2) **Self-healing hydration**: `ConsolidatedTakeoffReview.tsx` `loadWorkspace` (both server-draft paths) and the auto AI-append merge path heal loaded/merged drafts in memory; healed ids persist on the next autosave. (3) **Defense-in-depth**: worksheet row helpers extracted to a new pure lib `app-ai-takeoff/src/lib/consolidatedWorksheetRows.mjs`; `patchRun` now locates by `{ roomId, areaId, runId }` (area-scoped), row keys are `${roomId}:${areaId}:${runId}`, and `reassignRun` moves only the first id match. Room-header rename (`renameRoom`) intentionally remains room-wide — renaming a room is distinct from piece editing. |
| **Existing drafts** | **No SQL migration.** Previously saved drafts with duplicate/missing run ids self-heal at next load (in memory) and persist healed ids on the next autosave. Tombstone/exclusion sets referencing a formerly duplicated id keep affecting the first (id-retaining) occurrence — deterministic, matching prior collective behavior's only unambiguous member. |
| **Tests** | New `app-ai-takeoff/src/lib/takeoffPieceRowIdentity.test.mjs` — 12 regression tests (four distinct names; single-row piece/length/depth/quantity edits; single-piece room move; unique id on add; no value-shift on delete; save/reload id stability; unique ids in the approve payload via `listIncludedPieces`; all distinct pieces in the Estimate Scope import plan via `planTakeoffImport`; unique row keys after healing, with the pre-fix collision explicitly reproduced) + wiring assertions. Existing suites re-run green: `backend-core/src/takeoff` (89/89), `consolidatedTakeoffReview.ui.test.mjs`, `emptyManualTakeoffDraft.test.mjs`, `app-ai-takeoff` vite build. The 4 pre-existing `tsc --noEmit` errors in this component exist identically on `main` (verified by stash-compare) — none added. |
| **Deployment surfaces** | `app-ai-takeoff` (worksheet component + new lib) and `backend-core` (extraction normalization + shared helper). No env vars, no schema change, no API contract change. |

### 139. AI Takeoff Review — per-run backsplash eligibility (replace shared height field) (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Bug** | After the piece-row identity fix (§138), editing **Backsplash height** on one Takeoff Review row still updated sibling pieces. Separately, forcing estimators to enter height per row was the wrong product model. |
| **Root cause** | The consolidated worksheet's backsplash control wrote `area.backsplashHeightIn` (area-scoped), then `flattenPieces` read that same area field onto every child run — so every sibling row shared one value even with unique run ids. |
| **Product model** | Estimator marks **per-run** `backsplashEligible: boolean` ("Include backsplash for this run"). Customer later chooses No / 4-inch / custom / full-height in Digital Estimate. Brain prices from **sum of approved eligible run lengths × customer height/style**. Estimators never enter ordinary 4" height at takeoff. |
| **Contract** | Persist on each run: `backsplashEligible`, optional `backsplashEligibilitySource` (`ai_suggested` / `estimator_confirmed` / `manual` / `legacy_height` / …). Approved import payload includes per-piece `backsplashEligible` plus room aggregates `eligibleBacksplashLengthIn`, `eligibleRunCount`, `excludedRunCount`. Geometry authority for eligible length = approved run `lengthIn` where eligible. |
| **Legacy normalization** | `normalizeTakeoffBacksplashEligibility` (new `takeoffBacksplashEligibility.mjs`): positive legacy area/run height → initial `backsplashEligible = true` (source `legacy_height`); zero/blank + area excluded → false; already-boolean values kept. Applied at AI extraction normalize and at consolidated worksheet hydration/AI-append. No SQL migration. Historical published estimates untouched. |
| **UI** | Column renamed **Backsplash**; checkbox control with Include / No backsplash labels; helper copy: "Mark the countertop runs that meet a wall or cabinet…". Height number input removed. Summary SF is a provisional eligible@4″ preview only. |
| **Extraction** | Prompt `PROMPT_VERSION` → `v6.2`: require per-run `backsplashEligible`; do not ask for ordinary 4" height. Normalization persists the boolean. |
| **Downstream** | `buildTakeoffImportPayload`, `planTakeoffImport`, `deriveRoomBacksplashFromImportRoom`, and Studio seed fallback consume eligibility / eligible length — not room-name heuristics or hard-coded 4" as eligibility. Digital Estimate customer height path still uses `backsplashMeasuredLengthIn` (now seeded from eligible runs). |
| **Tests** | New `app-ai-takeoff/src/lib/takeoffBacksplashEligibility.test.mjs` (15 regressions + wiring). UI wiring test updated for the new column/control. |
| **SQL / env** | None. |
| **Deployment surfaces** | `app-ai-takeoff`, `backend-core` (takeoff + studioRoomBacksplash + extraction prompt). |

### 140. AI Takeoff Review — Backsplash checkbox / Cutouts input unclickable (CSS hit-target regression) (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Bug** | After §139, hosted Takeoff Review showed per-run Backsplash checkboxes and Cutouts inputs, but clicks/typing did nothing. Length / Depth / Quantity remained editable. |
| **Root cause** | **CSS / hit-testing overlay (not disabled-state).** `.ctr-table input { width: 100% }` applied to checkboxes, stretching Backsplash/Included hit boxes. Combined with `overflow: visible` on table cells, `min-width: 100%` on text inputs, and a nowrap Backsplash label ("No backsplash"), overflowing controls from mid-row columns intercepted pointer events on Cutouts. A resized sticky plan panel could also paint over the worksheet (`resize: both` without stacking isolation). Autosave was **not** disabling the controls. |
| **Fix** | (1) Scope `width: 100%` to non-checkbox inputs only; give checkboxes fixed 1rem size + `pointer-events: auto`. (2) Default cell `overflow: hidden` with `td:focus-within` elevation (`z-index: 3`) so focused controls win hit-testing without permanently clipping. (3) Stack `.ctr-main` / table above `.ctr-plan` (`isolation: isolate`, z-index). (4) Unique `id` + `htmlFor` labels per `roomId-areaId-runId` for Backsplash, Included, Cutouts. (5) Disable row controls only when `approveStatus === "approved"` — never on save/AI phase. (6) Include `cutouts` on approved import payload pieces. |
| **Tests** | New `takeoffRowControlsInteraction.test.mjs` (15 regressions). Existing identity + eligibility suites re-run. |
| **SQL / env** | None. |
| **Deployment surfaces** | `app-ai-takeoff` (CSS + worksheet), `backend-core` (import payload cutouts passthrough). |
| **Hosted acceptance** | Toggle Backsplash on rows 1 and 3 independently; edit Cutouts on row 2; autosave + refresh; Tab/Space; approve payload carries both. |

### 141. Takeoff → Pricing Setup simplification: final-row fix, structured cutouts, derived fabrication quantities (2026-07-21)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-21 |
| **Branch** | `feature/takeoff-to-pricing-setup-simplification` |
| **Final-row bug root cause** | The sticky bottom action bar (`.ctr-actions { position: sticky; bottom: 0 }` with full-width padding/flex gaps and an opaque background) painted over the last visible worksheet row; its strip intercepted clicks meant for row 4's Backsplash checkbox while rows 1–3 (above the bar) worked. Not a duplicate-id, disabled-state, or React reconciliation issue. |
| **Final-row fix** | `.ctr-actions` is now `pointer-events: none` + `background: transparent` with `pointer-events: auto` restored on children (buttons/messages keep their own backgrounds); `.ctr-table { margin-bottom: 56px }` gives the last row scroll clearance inside the table wrap. Regression suite `takeoffFinalRowInteraction.test.mjs` (10 cases) targets the last row explicitly. |
| **Structured cutout contract** | `run.cutouts = [{ type, quantity, source, note? }]` with types `kitchen_sink \| vanity_bar_sink \| cooktop \| electrical_outlet \| pop_up_outlet \| other` (new `backend-core/src/takeoff/takeoffCutoutScope.mjs`, contract documented on `TakeoffRun`). Freeform `sink:1` input replaced by a per-run popover (checkbox per type, quantity stepper, required note for Other, side-splash left/right eligibility). Extraction prompt bumped to v6.3 (AI suggests structured cutouts, `source: "ai_suggested"`; estimator confirms). |
| **Legacy normalization** | `normalizeRunCutouts` accepts structured arrays, legacy object maps (`{sink:1}`), and legacy strings (`"sink:1, cooktop:2"`); unknown keys become reviewable `other` entries with the key preserved as note; duplicates merge by type+note so quantities never double. `normalizeTakeoffCutoutScope` heals whole drafts at AI normalization and worksheet hydration — no downstream consumer string-parses cutouts. |
| **Takeoff authority model** | Approved payload now carries `fabricationQuantities` (per add-on key) and `scopeSummary` (pieces, cutout counts by type, backsplash-eligible runs/length, derived eligible edge LF). `seedScopeFromTakeoffPayload` marks `scope.physicalScopeSource = "takeoff"`, attaches `takeoffScopeSummary`, and overwrites the four governed cutout add-on keys (`qty-sink/qty-bar/qty-cook/qty-outlet`) — including back to 0 — so Takeoff and manual entry can never both charge an opening. `pop_up_outlet`/`other` never auto-price; they surface in a review list. |
| **Pricing Setup redesign** | `B. Estimate Scope` → `B. Pricing Setup` with sections: Customer and project / Pricing basis / Material / Approved physical scope (read-only summary + Review Takeoff re-sync) / Products and services / Custom lines / Commercial adjustments. With Takeoff authority: cutout quantity inputs hidden (derived note instead), room countertop SF and backsplash editors replaced by read-only summaries, Edge LF read-only and auto-filled from derived eligible LF when an upgraded edge profile is chosen. Without Takeoff: clearly-labeled "Manual physical scope" fallback keeps all editors. |
| **Edge / backsplash / side-splash** | Edge: profile choice stays estimator-editable; LF derived from included counter run lengths (proxy until per-run exposed-edge capture); no W/D-edge concept changes; rates untouched. Backsplash: Pricing Setup only summarizes eligible runs/length; customer still chooses No/4"/custom/full-height later; pricing authority untouched. Side-splash: per-run `sideSplashLeftEligible`/`sideSplashRightEligible` captured in the cutouts popover and passed through the approved payload (pricing unchanged in this branch). |
| **Tests** | 37 new regressions: `takeoffFinalRowInteraction.test.mjs` (1–10), `takeoffStructuredCutouts.test.mjs` (11–23), `takeoffToPricingSetup.test.mjs` (24–37). Updated: `takeoffRowControlsInteraction.test.mjs`, `consolidatedTakeoffReview.ui.test.mjs`, `takeoffBacksplashEligibility.test.mjs` (prompt v6.2+), `takeoffExtractionService.test.mjs` (v6.3). All 61 takeoff/studio/worksheet suites pass; both heads build clean. |
| **SQL / env** | None. Scope extensions live inside existing `scope_json` JSONB; import payload fields are additive. |
| **Deployment surfaces** | `app-ai-takeoff` (worksheet + CSS), `app-elite100-estimate-studio` (Pricing Setup panel), `backend-core` (takeoffCutoutScope, import payload, extraction prompt/service, consolidated approval summary, studio seed/queue). |
| **Hosted acceptance** | A: toggle row-4 Backsplash on a four-run takeoff, refresh, persists. B: add Kitchen sink / Cooktop / Electrical outlet on runs 1–3 via popover, refresh, persists. C: Approve Takeoff → Pricing Setup shows approved-scope summary, no manual cutout zeros, derived quantities price once. D: estimate without Takeoff shows Manual physical scope only. |

### 142. AI Takeoff backsplash eligibility round-trip + bounded status polling (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/takeoff-backsplash-eligibility-roundtrip` |
| **Exact reset stage** | The row-4 click and correction POST were working. The reset happened during **frontend hydration normalization**: `resolveRunBacksplashEligible` checked the parent area's legacy `backsplashIncluded:false` before the run's saved `backsplashEligible:true`. Row 4 lived in the island/excluded area; rows 1–3 lived in the included main area. `normalizeTakeoffBacksplashEligibility` therefore rewrote only row 4 to false after a poll/refresh. |
| **Precedence fix** | Per-run `estimator_confirmed` / manual booleans now outrank area exclusion, AI suggestion, legacy height, and default. Explicit false is authoritative and is never treated as missing. A confirmed eligible run also aligns stale `area.backsplashIncluded` and `backsplashLinearIn` aggregates so legacy readers cannot reinterpret it. |
| **Save round trip** | Checkbox patch preserves `roomId + areaId + runId`, `backsplashEligible`, `backsplashEligibilitySource:"estimator_confirmed"`, and `backsplashEligibilityUpdatedAt`. `updateDraft` synchronously updates `draftRef` before React render/autosave. Correction responses now return `resultId`, `clientMutationRevision`, and the persisted `normalizedTakeoffJson`; latest responses expose the revision. |
| **Save races** | Autosaves are serialized through one promise chain; each local mutation has a monotonically increasing `clientMutationRevision`. An older response never changes save state or editable draft. Backend rejects revisions at/below the latest saved revision or a mismatched `baseResultId` with `409 stale_takeoff_correction`, preventing late/stale writes (including another tab) from becoming authoritative. Successful saves update known result version and do not immediately GET `latest`. |
| **Editable hydration** | Full-draft requests capture local mutation revision + request sequence. Responses older than the current mutation, an already-applied request, or the latest local save timestamp are ignored. AI append still preserves existing runs by stable room/area/run identity; AI suggestions cannot replace confirmed true or false. IDs are healed once and then persisted, not regenerated on read. |
| **Consolidated polling before** | Every 20s while the worksheet remained open, `loadWorkspace` fetched both the full job and full `results/latest` (6 API requests/min combined) even after completion; Studio fallback could add 3 job requests/min, and active generation added 30/min for its first 30s. The full latest response could replace the editable draft after save status returned idle. |
| **Consolidated polling after** | Polls **job status only** every 10s (≤6 requests/min) and only while queued/pending/processing. Completed/failed/cancelled/approved stops immediately. Full `latest` is fetched once only when the result version changes. Terminal/hidden steady state is 0 requests/min. No correction GET loop exists; correction traffic is debounced POST autosave only. |
| **Other polling audit/fix** | (1) `TakeoffPlanFileSection`: 2s first 30s then ~4.5s while processing; already non-overlapping/terminal, now visibility-paused, abortable, error-backoff, cancelled-aware. (2) `TakeoffRunInbox`: 10s only while any job is processing; changed from overlapping interval to one in-flight timeout, hidden pause, abort, backoff. (3) `EstimateTakeoffWorkspace`: 20s fallback job-status poll only; changed from interval to non-overlapping timeout, terminal stop incl. failed/cancelled, hidden pause, abort, backoff. (4) `TakeoffLabApp` latest load is one-shot per selected job, not a poll. (5) 2s generation elapsed timer is display-only and makes no request. |
| **Tests** | New `takeoffBacksplashRoundtrip.test.mjs` (15 save/read/merge/identity/approval cases) and `takeoffPollingRehydration.test.mjs` (terminal, visibility, overlap, corrections, stale hydration, no reread, abort, backoff/frequency). Backend mock DB test proves true + false storage/response/latest and stale revision rejection. Existing interaction, eligibility, generation, workspace, and UI suites retained. |
| **SQL / env** | None. Revision metadata is additive inside existing result JSON / `result_summary`; no new environment variables. |
| **Deployment surfaces** | `app-ai-takeoff`, `backend-core`, and `app-elite100-estimate-studio` (Estimate workspace fallback poll). No manual deployment performed. |

### 143. Pricing Setup scope + commercial simplification: measured-vs-billed scope, governed adjustments, canonical edges, deterministic custom-line allocation (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `feature/pricing-setup-scope-and-commercial-simplification` |
| **Responsibility split** | AI Takeoff = approved physical-scope authority. Pricing Setup = measured vs billed display + governed estimator adjustments + pricing basis/material/commercial exceptions. Digital Estimate = customer product/finish/edge/backsplash choices. Pricing Setup no longer carries competing geometry or product-quantity editors. |
| **Authority detection fix** | Pricing Setup authority now follows `scope.physicalScopeSource === "takeoff"` alone (the summary payload is display data and can no longer flip an estimate back to "Manual physical scope"). `refreshTakeoffGate` heals older/fallback-seeded estimates: an approved takeoff with rooms but missing `physicalScopeSource`/`takeoffScopeSummary` gets authority metadata reconstructed (`healScopeTakeoffAuthority`, from the approved payload when rebuildable, else from existing scope rooms) without touching room data. |
| **Measured vs billed scope** | New shared pure module `studioScopeBilling.mjs` (`studio_scope_billing_v1`), consumed by backend pricing (authoritative) and the panel (display only). Every included counter piece is an independent pricing section ceiled on its own (`billableSquareFeet.mjs`); billed SF = Σ ceiled sections; the aggregate measured total is never ceiled once (51.06 measured / 18.25+23.42+4.52+4.87 → 19+24+5+5 = 53 billed, 4 sections). Panel shows Measured / Billed / Independent pricing sections; never exposed publicly. |
| **Estimator SF adjustment** | `scope.countertopScopeAdjustments[]`: `{ id, adjustmentScope: room\|project, roomId, adjustmentSf (±), adjustmentReason (required when ≠0, else 400 adjustment_reason_required), adjustedBy, adjustedAt }`. Each non-zero adjustment is its own governed section that ceils independently (+1.2→+2; −1.2→−1, conservative for credits) and can reduce but never produce negative billed scope (room- and project-level clamps). `adjustedBy/adjustedAt` are stamped server-side in `updateScope` (browser never asserts identity). Adjustments enter the pricing fingerprint and the calculation snapshot (`calc.scopeBilling` incl. audit). Room-level adjustments drop on Takeoff re-sync (geometry may have changed); project-level adjustments survive. |
| **Backsplash in Pricing Setup** | Read-only under authority: eligible runs / eligible length / "Source: Approved Takeoff" (project summary + per room). No editable include/height-mode/height/length/SF fields; the customer chooses No / 4-inch / custom / full height later; length authority stays with the Takeoff (`Review Takeoff` re-sync for changes). The optional backsplash length adjustment (§5 of the brief) was **intentionally deferred** — eligibility corrections go through Takeoff review; no freeform backsplash entry was reintroduced. Manual fallback estimates keep the previous editors. |
| **Cutouts / generic products** | Manual cutout quantity grid remains fallback-only (authority arm shows the derived read-only summary — pieces, openings by type, review-only cutouts — unchanged double-charge protection from §141). Generic sink quantity fields (`qty-ss`, `qty-v-rect`, `qty-v-oval` — `RETIRED_GENERIC_PRODUCT_ADDON_KEYS`) are removed from the UI; backend pricing still honors saved legacy quantities so older estimates keep totals, and the panel surfaces any non-zero legacy value as a warning with a one-click clear. Products resolve only via governed catalogs (exact model/finish/SKU/price/room/compatibility). |
| **Products & services section** | New `scope.customerCatalogPermissions` (sink/faucet/accessories/specialty/edge/backsplash; missing = allowed) replaces the zero-filled product row; persisted in scope JSON and frozen into publication `internal_ui.customer_catalog_permissions`. **Enforcement inside the Digital Estimate catalog flow is not wired in this branch** (open decision below). Services: tear-out stays a service preset; extra trips / other services are customer-facing custom lines. |
| **Canonical edge profiles** | Included: Eased, Large Eased, Full Bullnose, Large Ogee, Bevel. Premium: Small Ogee, Crescent, Knife (`studioEdgeAuthority.mjs` tokens). Legacy `edgeMode` W/D options removed from the UI; selecting a canonical profile writes `edgeProfileToken` and clears `edgeMode`. Pricing is dual-path: explicit token → free $0 / premium at `resolvePremiumEdgeRatePerLf(pricingBasis)`; scopes without a token keep the historical W/D pricing branch byte-for-byte (no silent re-rate of saved estimates). `pricingVersion` bumped to 2. |
| **Derived edge scope** | `buildApprovedScopeSummary` now derives `derivedOpenEdgeLengthIn/Lf` = Σ included counter-run lengths − backsplash-eligible length (splash pieces and excluded pieces never count), clamped ≥0, marked `derived_open_edge_v1`. Estimator edge adjustment `scope.edgeScopeAdjustment` (± LF, reason required, audited, server-stamped, snapshotted) → `estimator_adjusted_open_edge_v1`; final priced edge = max(0, derived + adjustment). Manual fallback keeps `edgeLinearFeet` (`manual` source). Documented future model: per-run edge exposure (front/left/right/wall-backed/seam/waterfall/unfinished) — not built here. **Superseded for new approvals by §152 (`finished_edge_v2`).** |
| **Miter / build-up** | Under authority the Takeoff carries no miter/build-up authority yet, so the panel shows "Not identified in approved scope" with an explicit `Add specialty fabrication` action that opens the existing governed fields; manual fallback keeps them directly. Pricing rules unchanged. |
| **Custom lines — customer-facing** | Lines carry description, category (now incl. Countertop/Backsplash/Service in `CUSTOM_LINE_ITEM_CATEGORIES`), qty/unit/unit price, ownership (room or project via new `roomId`/`roomName`), and `customerFacing`. At publish they freeze explicitly: room-owned → `room.customerFacingLines[]`; project-owned → `projectAddOnLines[]`; they also appear in the print snapshot summary rows. Never hidden inside stone totals. |
| **Custom lines — internal-only** | `customerDisplayTotal` now **includes** internal-only line dollars (previously subtracted); they are absorbed by `internal_custom_line_allocation_v1` (`internalCustomLineAllocation.mjs`) into room Countertop/Backsplash amounts: (1) room+category → that room's category; (2) room, no category → proportional across that room's stone amounts; (3) project+category → proportional across eligible rooms in category; (4) project, no category → proportional across all stone cells; (5) no backsplash anywhere → Countertop absorbs; (6) no eligible stone category → explicit `unresolved` internal pricing (`review_required` snapshot status, no fabricated breakdown, no balancing plug). Integer cents, shared largest-remainder allocator, fully deterministic. |
| **Allocation snapshot** | `roomPricingPublishSnapshot` bumped to **v2**: freezes `customLineAllocations` (original line, amount, rule, targets, policy version, author, timestamp), `projectAddOnLines`, `internalAbsorbedCents`, `unresolvedInternalLines/Cents`. Reconciliation: rooms + project add-ons + unresolved internal ≡ frozen total. v1 snapshots read unchanged. Public DTOs expose only category amounts + customer-visible lines (allowlist serializers unchanged; forbidden-content asserts still pass). |
| **Original / Updated / Changes** | Original: `buildOriginalRoomPricingProjectionFromSnapshot` surfaces frozen customer-facing lines + project add-ons; absorbed internal allocations stay inside frozen stone amounts; internal names never exposed; historical allocations never recomputed. Updated: `buildUpdatedRoomPricingProjection` accepts `publishedRoomPricing` — frozen custom-line dollars (explicit + absorbed + project) are carved out of the proportional stone pool and re-attached under the frozen policy, so category totals still reconcile exactly against the Brain total. Changes: customer-facing labels only; absorbed shifts appear as changed Countertop/Backsplash amounts; audit stays server-side. |
| **Tests** | New: `studioScopeBilling.test.mjs` (15 — measured/billed/sections/adjustments/audit/pricing), `internalCustomLineAllocation.test.mjs` (16 — policy rules 1–6, determinism, snapshot v2 freeze/absorption/redaction/immutability), `studioEdgeScope.test.mjs` (11 — canonical roster, legacy mapping, derived formula/clamp, premium pricing, adjustment reason, legacy W/D preservation, publication redaction), `phasePricingSetupSimplification.ui.test.mjs` (13 — authority exclusivity, measured/billed display, adjustment inputs, cutout/product removal, catalog permissions, read-only backsplash, canonical edges, derived-edge wiring, specialty gating, custom-line ownership, backend-authoritative pricing). Updated: `studioSlice2Foundation.test.mjs` (internal-only now charged+absorbed), `takeoffToPricingSetup.test.mjs` (canonical edge / catalog-permission markers), `milestone3.estimateScope.ui.test.mjs`. 92 backend takeoff/studio/digital-estimate/quotes test files pass (2 pre-existing failures unrelated to this branch: `phaseDe2b`, `phaseDe2f.ui` — fail identically on main); both heads build. |
| **SQL / env** | None. All new fields are additive inside existing `scope_json` / calculation-snapshot / `customer_snapshot_json` JSONB. No new environment variables. |
| **Deployment surfaces** | `backend-core` (studio pricing/service/types/publication adapter, takeoff cutout scope, room-pricing snapshot/projection, public config service, quote calculator categories), `app-elite100-estimate-studio` (Pricing Setup panel). `app-digital-estimate` unchanged but rebuilt/retested. |
| **Open business decisions** | (1) Enforcing `customerCatalogPermissions` in the customer Digital Estimate config flow (permissions are captured + frozen but not yet gating catalogs). (2) Backsplash length adjustment in Pricing Setup — deferred per §5 preferred first version. (3) True per-run edge exposure authority — **delivered in §152** (replaces `derived_open_edge_v1` for new approvals). (4) Legacy generic sink quantities: currently honored + warned; decide on a hard migration/cutoff. |

### 144. Digital Estimate backsplash delta sign + customer room hierarchy (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-backsplash-delta-and-room-breakdown` |
| **Hosted +$2 root cause** | Two compounding paths: (1) Frozen publication $3,208 with unresolved removal credit kept exact delta $0, but `elite100ConfigDeltaEngineV2` re-applied whole-total `ceil_to_10_dollars` → displayed $3,210. (2) Separately, `stoneTargetForCategory` matched bare `"splash"`, freezing internal `side_splash` dollars into Backsplash; Updated re-attachment then treated `backsplashAmountCents === 0` as eligible (`0 != null`) and re-added those cents onto "No backsplash", inventing a positive Backsplash line while totals still reconciled. |
| **Delta correction** | Frozen-baseline mode now preserves the already-published display anchor and adds the exact governed cent delta; only standalone estimates retain whole-total ceil-to-$10. Explicit sign assertions reject negative→positive or positive→negative display reversals. Known removal credits the exact frozen backsplash carve-out; unresolved removal remains $0 delta + estimator review and can never increase the total. |
| **Category ownership** | The immutable `roomPricing` snapshot is trusted as the original Countertop/Backsplash/Add-ons decomposition. Internal-only custom-line targets are first removed from the frozen backsplash carve-out, then reattached under their frozen allocation policy — except when `backsplashMode === "none"`, where frozen Backsplash targets fall onto Countertop so removal stays $0. `side_splash` / `sidesplash` are no longer stone-Backsplash targets. Unchanged mode/material preserves frozen carve-outs byte-for-byte. |
| **Configured-state allocation eligibility** | Frozen hidden allocations reattach in Updated only to categories still eligible in the configured state: Backsplash is ineligible when configured mode is `none` (or the amount is unresolved), so those integer cents redistribute deterministically to the room's remaining eligible stone target under `internal_custom_line_allocation_v1` rule 5 (Countertop absorbs; largest-remainder trivially exact with one target). This includes Backsplash-only hidden lines — rule 5 explicitly permits Countertop absorption, so no unresolved/review state is fabricated. Project-owned frozen targets keep per-room ownership; a No-backsplash room never receives hidden Backsplash cents. Each redirect is recorded on the internal projection as an `internalReattachments` audit row (roomId, from/to category, cents, reason) — never in public DTOs. Original and the frozen `customLineAllocations` audit are never rewritten; restoring 4-inch restores frozen eligibility exactly. `CONFIGURATION_PUBLIC_FORBIDDEN_SUBSTRINGS` now also rejects `customLineAllocations`, `allocatedCents`, `internalReattachments`, and `allocationRule` at the public boundary. |
| **Rounding / remainder** | Pricing and projection remain integer cents. Largest-remainder allocation is fallback-only when complete frozen room/category ownership is unavailable; it cannot receive a removed backsplash amount or fabricate a balancing line. Configured room/project totals reconcile to the authoritative exact total. |
| **Side-splash labels** | Label priority is estimator piece label → estimator area label → `Countertop run N`. UUID-like piece keys are never labels. Modal choices are concise (`None`, `Left`, `Right`, `Both`). Room cards show `None selected`, one selected location (`Right side — Sink Run`), or `N locations selected`; unchanged internal rows are not concatenated. |
| **Room breakdown / redaction** | Public room-pricing DTOs now include customer-safe room `addOnLines`, project add-ons, and project total. Original and Updated use one shared `Countertop / Backsplash / Add-ons / Room total` formatter; Changes uses the same room grouping with original→updated labels and category/room/project deltas. UUIDs and raw option/room/run IDs, geometry, rates, allocation internals, and hidden custom-line names remain absent. |
| **Tests** | Added deterministic $3,208→$3,210 regression, frozen carve-out/removal/no-op sign tests, room ownership/reconciliation/UUID redaction tests, and `phaseBacksplashDeltaRoomBreakdown.test.ts` for side-splash summaries plus Original/Updated/Changes hierarchy. Full Digital Estimate UI suite and relevant backend pricing/catalog/snapshot suites pass. |
| **SQL / env** | None. Existing JSON snapshots/envelopes are read additively; no new environment variables. |
| **Deployment surfaces** | `backend-core` and `app-digital-estimate`. No manual deployment. |

### 145. Digital Estimate pricing breakdown + option authority (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-pricing-breakdown-and-option-authority` |
| **Original completeness gap** | Publish-time `roomPricing` frozen Countertop/Backsplash via SF allocation but left Add-ons at `$0` / `not_currently_attributable`, and Studio `estimate_rooms` dropped pieces + priced edge LF + fabrication add-ons at the freeze boundary. Original therefore could not show sink product, sink cutout, or trip-charge hierarchy for new Studio publications. |
| **Shared room-pricing contract** | Public Original/Updated DTOs now expose both the prior flat fields and a nested normalized shape (`countertop` / `backsplash{mode,label}` / `addOns{lines}` / `roomTotalDetail` with `amountCents` + `displayAmount`). Frontend continues to render through one shared hierarchy formatter. |
| **No-backsplash invariant** | Configured mode `none` forces Backsplash to exactly `0` cents before serialization; `assertConfiguredBacksplashNoneIsZero` fails loudly on non-zero. Hidden frozen allocations still cannot reattach to ineligible Backsplash (prior §144 rule retained). |
| **Material-group authority** | Engine already prices configured Countertop and Backsplash from the same resolved room material rate; this phase adds Direct + Wholesale Promo→Group F proof tests and Changes rows for Countertop amount deltas alongside material/backsplash. |
| **Side-splash labels** | Studio publication now freezes estimator piece `displayLabel`s (Takeoff run labels) plus optional side-splash eligibility. Trusted context and option seeding prefer those labels; ineligible runs are omitted when flags are present; public options forward `pieceDisplayName`. |
| **Edge option authority** | `resolveEdgeOptionPriceEffect` returns public-safe Original selection / Included / `+$N` effects from approved final priced edge LF × Direct ($25) or Wholesale ($15) rates. Public option serialization enriches seeded `sellPrice: 0` edge options with those effects so the UI never invents pricing. Premium selection still charges once via save-time calc options under room Add-ons as `Edge — {profile}`. |
| **Fabrication freeze** | `fabrication_add_ons` (qty-sink, ESF sinks, cooktop, tear-out, …) are carved out of the stone pool and frozen as named room Add-ons; customer-provided sink `$0` placeholder is added when a cutout exists without an ESF sink product. Trip charge remains a project custom line. |
| **Pricing basis** | Frozen Studio `pricing_basis` / `pricingBasis` now flows into trusted configuration context (was hard-defaulting to Direct). |
| **Public redaction** | Forbidden tokens extended with `policyVersion`, `pricingBasis`, `ratePerLf`, `eligibleLf`, `billedSf`, `measuredSf`, `runId`, `areaId`. |
| **SQL / env** | None. Additive JSON freeze fields only; legacy publications without pieces/add-ons keep prior fallbacks. |
| **Deployment surfaces** | `backend-core` (Studio publication adapter, trusted context, room-pricing snapshot, public config options, projection) and `app-digital-estimate` (types + breakdown tests). No manual deployment. |
| **Open business decisions** | (1) Project-level priced edge LF is assigned to the first countertop room (Studio edge is project-scoped; DE edge selection is room-scoped). (2) Legacy publications frozen before pieces/fabrication freeze cannot backfill Original Add-ons. (3) Side-splash eligibility omitted on older Studio seeds still lists all counter pieces (null = unknown). |

### 146. Digital Estimate live pricing: no-backsplash zero, side-splash pricing, billed-scope invariant (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-backsplash-and-side-splash-live-pricing` |
| **Hosted stale-$248 root cause** | The room card read the persisted `backsplashDrafts[room].mode` while the pricing calculation only honored positive `backsplash:*` selection quantities. A save carrying draft `mode: "none"` with a stale/omitted selection map priced the original 4-inch mode, so Updated kept the frozen backsplash amount and the configured total never dropped. Fix: `applyBacksplashDraftAuthority` canonicalizes the persisted draft mode into the selection map before fingerprinting, and the room mapping now prefers the merged draft mode; `assertConfiguredBacksplashNoneIsZero` (§145) still enforces the zero at serialization. Explicit `none` never falls back to Original, and a later save that omits backsplash inherits the persisted draft (proven by regression). |
| **Side-splash pricing formula** | Backend-only, per selected side: `rawSf = runDepthIn × configuredHeightIn ÷ 144`, `billedSf = ceil(rawSf)` per side independently, `amount = billedSf × sideCount × configuredRoomMaterialRate` (integer cents). Height authority: 4-inch mode → 4 in; custom → governed configured height; full height → authoritative frozen height; primary mode `none` → side splash stays selectable at standard 4 in (business decision recorded here). `resolveSideSplashPriceEffect` also drives per-option public effects (`None — Original selection`, `Left/Right/Both — +$N`); unpriceable geometry/rate degrades to estimator review, never $0-charged. |
| **Category ownership** | Side splash prices as a room Add-ons line `Side splash — {Side}, {Run label}`; primary Backsplash amount is never touched by side-splash dollars and nothing charges twice (regression-locked). |
| **Material propagation** | Side splash resolves the same configured room material rate (`resolveMaterialRateCents`, Watt's/wholesale overrides included) as Countertop and primary Backsplash; a material-group change reprices all three under their own independent billed sections. |
| **Studio material-subtotal defect (53 vs 59 SF)** | `calculateStudioEstimate` folded room backsplash billed SF (provisional 4-inch seed from eligible Takeoff runs: 6 SF) into one unattributed "Material subtotal" (59 SF × $45 = $2,655) while Pricing Setup displayed the countertop-only 53 SF billed summary. No duplicate Takeoff/manual authority and no hidden adjustment existed. Fix: material subtotal is now split into `materialCountertopSubtotal` (billed countertop sections × rate + governed adjustments only) and `materialBacksplashSubtotal`; the Pricing Setup summary shows both rows. Legacy/manual room SF still never contributes when pieces exist; hidden internal custom lines are recorded as dollars with zero SF. |
| **Billed-scope invariant** | `assertBilledCountertopScopeReconciles(displayedBilledCountertopSf, pricedBilledCountertopSf)` — any mismatch (e.g. duplicate room-id scope authority) fails the calculation with `billed_scope_mismatch` (422, `STUDIO-BILLED-SCOPE-MISMATCH`), blocking approval instead of returning a misleading customer total. Tax (2%) applies to the governed material subtotal (53 SF × $45 fixture: $2,385 + $47.70 = $2,432.70). |
| **Internal evidence** | `calc.material.sections` freezes every contributing section (sourceType, room, sourceId, raw SF, billed SF, adjustment SF, rate, amount cents, category: countertop / backsplash / hidden_allocation). Internal only — the publication adapter's customer-safe copy is an allowlist and never forwards it. |
| **Legacy Original acceptance** | The currently hosted publication predates the §145 Original Add-ons freeze fields and is intentionally NOT backfilled. Hosted Original Add-ons acceptance requires a newly approved and newly published Studio revision after this branch deploys. |
| **Tests** | `phaseBacksplashSideSplashLivePricing.test.mjs` (20-item service-level matrix: none→$0 through save/serializer/reload, stale-save immunity, Left/Right/Both independent sections, depth/height/material authority, Add-ons ownership, Changes rows, redaction, new-Original sink+cutout freeze), `studioMaterialSubtotalScope.test.mjs` (15-item billed-scope contract incl. invariant + approval block), `phaseBacksplashSideSplashLive.ui.test.ts` (frontend renders authoritative $0 and side-splash lines). Full DE configuration/catalog and Studio suites pass; `phaseDe2b` + `phaseDe2f.ui` failures pre-exist on main. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core`, `app-digital-estimate`, `app-elite100-estimate-studio`. No manual deployment. |

### 147. Digital Estimate customer-experience polish (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `feature/digital-estimate-customer-experience-polish` |
| **Purpose** | Presentation and flow polish only. Pricing formulas, Takeoff, Pricing Setup scope, Original immutability, session/concurrency, and public redaction are unchanged. All money and option effects remain backend DTO authority. |
| **UX problems addressed** | Dense header before rooms; full customer-info form blocking the flow; repetitive "Items for later" list; weak option selected states; room cards without authoritative room totals; catalog permissions frozen in Studio but not enforced on public saves; mobile lacked a usable sticky total; review CTA was secondary. |
| **Page hierarchy** | Branding → compact project header (name, customer, quote, pricing-valid, Original/Current/Difference, save status, primary instruction) → grouped Items for later disclosure → Project details disclosure → room cards → project note / add-ons → Request review CTA; desktop sticky summary remains; mobile sticky total bar opens summary. |
| **Items for later** | `groupMissingInformationRequirements` collapses identical needs and lists affected rooms; timing labels distinguish review / fabrication / optional. |
| **Room card contract** | Material → Backsplash → Side splash → Sink → Faucet → Accessories → Edge → Specialty → Notes → Room price summary (Countertop / Backsplash / Add-ons + sublines / Room total) from authoritative `roomPricing`. Disabled catalog categories render read-only ("As published") with no Change control. |
| **Selected states** | Strong border + ring + `Selected` badge + checkmark on material cards and ChoiceRadio options; Done closes modals; Escape retained. |
| **Catalog permissions** | Frozen `customerCatalogPermissions` flow from Studio publication → trusted context → public configuration DTO. Save rejects non-baseline selections in disabled categories with `catalog_permission_denied` (403). Studio Pricing Setup now also exposes material and side-splash permission toggles (additive). Missing key remains allowed. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core`, `app-digital-estimate`, `app-elite100-estimate-studio`. No manual deployment. |
| **Open UX decisions** | (1) Material "price effect" on the room row still says "Price updates when saved" until a dedicated material option effect label is returned on the material option DTO. (2) Legacy publications without `customerCatalogPermissions` keep all catalogs allowed. (3) Focus return to the triggering control after modal close is best-effort via natural browser focus; a dedicated focus trap library was not added. |

### 148. Digital Estimate customer summary, edge pricing, and print (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-customer-summary-edge-and-print` |
| **Purpose** | Simplify the customer Digital Estimate summary, price canonical premium edges immediately when governed inputs exist, remove obsolete public quantity/Included controls, and add a customer browser print document that reuses shared ESF estimate-document branding. |
| **Summary tabs** | Customer tabs are **Estimate \| Changes** only. The customer-facing Original tab is removed. Immutable published/original calculation data remains available internally for audit, Differences, Changes, estimator review, and publication history — no backfill of incomplete legacy Original snapshots. |
| **Terminology** | Customer labels use **Published estimate**, **Your estimate**, and **Difference** (including “from published estimate”). “Updated” / “Current configured total” are not customer-facing tab or total labels. Internal variable names (`updated`, `changeFromOriginal`, etc.) may remain. |
| **Estimate authority** | The Estimate tab and print document use only the latest successfully saved calculation (`savedCalc` / `roomPricing`). Pending browser drafts do not print as a completed estimate; Print is disabled while saving or after a failed save. |
| **Canonical edge effects** | When governed edge LF, pricing basis, and profile rate exist, premium profiles (Small Ogee / Crescent / Knife) return authoritative `+$N` via `resolveEdgeOptionPriceEffect`. Original → “Original selection”; other included profiles → “Included”. Review copy is “Elite will confirm this option and price.” only when a required governed input is missing — not merely because a profile is premium. Trusted context exposes `edgeLinearFeetTotal` so room-row LF gaps still resolve. Frontend displays backend `priceEffectLabel` only (no LF × rate in React). |
| **Removed public controls** | Generic Project add-ons quantity block (e.g. Cooktop Cutouts) and standalone Included card are removed. Trip charge and other customer-visible project lines appear once under the Estimate project breakdown / print Project charges. |
| **Scope quantity protection** | Public save rejects crafted items altering governed fabrication quantities (`governed_scope_quantity_forbidden`). Working selection maps strip those keys so leftover baseline qty does not break ordinary saves. |
| **Print architecture** | `buildDigitalEstimatePrintModel` + `DigitalEstimatePrintDocument` adapt the saved public Estimate DTO into a customer-safe document using shared `@quote-lib/customerEstimate` logo, CSS, terms, and branch constants. Future customer PDF/email can reuse the same adapter; this branch does not change email delivery. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core`, `app-digital-estimate` (shared document assets via `@quote-lib` alias). No manual deployment. |
| **Open decisions** | (1) Material row still says “Price updates when saved” until a dedicated material option effect lands on the DTO. (2) Legacy publications with incomplete Original line detail still show aggregate Published totals / supported Changes only. (3) Customer email PDF attachment remains a follow-on using the shared adapter. |

### 149. Digital Estimate edge groups + Request review submit (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-edge-groups-and-review-submit` |
| **Edge UI** | Native flat `<select>` replaced with grouped **Included edges** / **Upgraded edges** selector. Labels use backend `priceEffectLabel` only (Original selection / Included / `+$N`). |
| **Missing edge-pricing input** | Hosted premium “review-required” when governed open-edge LF never reached option resolution (room freeze lacked readable LF / aggregate). Trusted context now reads `edgeLinearFeet` **or** `edgeFinalLf`, recovers project `edge_linear_feet_total` / fabrication `finalLf` when room LF is zero, and new publications freeze `internal_ui.edge_linear_feet_total`. Premium cents remain `finalPricedEdgeLf × governedPremiumRate` in `resolveEdgeOptionPriceEffect` (no React math). |
| **Request review root cause** | Supabase amendment repository implemented `getReviewRequest` / list / publish RPC but **omitted `createReviewRequest` and `getCurrentReviewRequestForSession`**, so hosted POST threw and `publicError` mapped it to generic **Estimate unavailable** even for a valid active configure session. |
| **Review readiness** | Aligned with save: envelope mismatch → `stale_configuration` 409; revoked/expired/superseded publications → lifecycle messages; pending save blocked in UI with “Please wait for your changes to finish saving.” Success confirmation: “Your selections were sent to Elite for review.” Responses include `code` for frontend mapping. Incomplete legacy Original detail does not block review. |
| **SQL / env** | No new migration. Requires existing applied `eliteos_digital_estimate_amendment_v1.sql` tables (already present). Flags unchanged: `DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED`, `VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED`. |
| **Deployment surfaces** | `backend-core`, `app-digital-estimate`. No manual deployment. |

### 150. Digital Estimate publish calculated edge option effects (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-publish-calculated-edge-effects` |
| **Problem** | Hosted Digital Estimate showed Included / Upgraded groups correctly, but upgraded profiles still rendered “Elite will confirm this option and price.” Studio already knew final priced edge LF, pricing basis, premium rate, and per-profile charges; publication dropped the final customer-safe effect and the public runtime re-resolved LF (often `0` → `missing_edge_lf`). |
| **Studio authority** | Final priced edge LF: `calculationSnapshot.fabrication.edge.finalLf` (from `resolveScopeEdgeLinearFeet` in `studioEstimatePricing.mjs`). Premium charge: `resolvePremiumEdgeRatePerLf` × final LF via `resolveEdgeOptionPriceEffect` (`studioEdgeAuthority.mjs`). |
| **Publication drop point (fixed)** | `studioEstimatePublicationAdapter.mjs` `buildCustomerSafeCalculationSnapshotCopy` previously froze rooms / `edge_linear_feet_total` but never froze per-profile option effects. Now freezes customer-safe `internal_ui.edge_option_effects` (profile, classification, originalSelection, available, reviewRequired, priceEffectCents, priceEffectLabel, roomKey/roomName). Never includes LF, rate, pricing basis, cost, margin, or internal IDs in those rows. |
| **Runtime priority** | (1) frozen `edge_option_effects` → (2) trusted-context LF × rate for unpublished/preview / legacy pubs → (3) review-required only when no authoritative effect exists. Published Digital Estimates must not silently replace a frozen effect with a runtime recomputation. |
| **Save** | Premium selection uses frozen `priceEffectCents` as one room Add-ons line (`Edge — {profile}`, qty 1, fixed absolute). No LF × rate in the frontend. Legacy pubs without freeze keep the prior LF × rate path. |
| **Room ownership** | **Superseded by §165.** Historical temporary policy assigned project-level priced open-edge LF to the first countertop room. New publications freeze per-room approved eligible LF instead. |
| **Legacy** | Publications without `edge_option_effects` may still fall back to trusted-context calculation / “Elite will confirm…” when evidence is absent. Newly published revisions that contain calculated effects must not show review-required for those premium profiles. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core` (publication adapter, trusted context, public configuration). No manual deployment. |

### 165. Digital Estimate room-scoped edge upgrade pricing (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/digital-estimate-room-edge-pricing` |
| **Problem** | Customer upgraded edge on one room was priced using **project-wide** approved open-edge LF (`fabrication.edge.finalLf`), because `buildStudioEstimateRoomsForPublication` assigned that aggregate to the first countertop room (§150 temporary ownership). Kitchen 8 LF + Bath 12 LF → Kitchen Small Ogee charged 20 × rate. |
| **Root cause** | `studioEstimatePublicationAdapter.mjs` `buildStudioEstimateRoomsForPublication` (`edgeAssigned` / `edgeLinearFeet = finalEdgeLf`) + `buildCustomerSafeEdgeOptionEffects(finalPricedEdgeLf=project)` + runtime fallbacks to `edgeLinearFeetTotal`. |
| **Fix** | `resolveRoomApprovedEligibleEdgeLf` (approved piece finished-edge sum, else room-level persisted LF). Freeze per-room `edgeLinearFeet` + per-room `edge_option_effects`. Never substitute project `finalLf` for a room. Missing room LF → premium `review_required` (estimator confirm), not project total. |
| **Legacy** | Existing publications remain frozen historically. Trusted context no longer seeds project aggregate onto rooms. Legacy frozen effects stay room-bound via `findFrozenEdgeOptionEffect(..., roomKey)`. |
| **UI** | Edge control already room-scoped in Digital Estimate; pricing/labels corrected without project-global control. |
| **SQL / env** | None. |
| **Tests** | `eos:test:room-scoped-edge-pricing`, updated `publishCalculatedEdgeEffects` / `studioEdgeScope`. |
| **Impacted** | `studioEstimatePublicationAdapter.mjs`, `studioRoomEdgeQuantity.mjs`, `studioEdgeAuthority.mjs`, `publicConfigurationService.mjs`, `configurationTrustedContext.mjs`, this entry. |
| **Delivery safety** | No automatic publish, email, or notification. |

### 151. Digital Estimate atomic save + Studio publication readiness (2026-07-21)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-21 · `fix/digital-estimate-save-and-publication-readiness` |
| **Problem** | Hosted DE mixed pending candidate selections with saved totals (header ≠ breakdown), failed Backsplash saves left “Pending changes” / unavailable errors, Changes could surface review copy as a selection, and Studio showed Approved + “Approve before publishing” simultaneously when only publication settings were dirty. |
| **Rejected save path** | Full-map save validated every qty>0 option against live envelope `availability_state`. An unchanged frozen/prior selection marked `review_required` (often premium edge) threw `unresolved_product` / `option_not_allowed` and blocked unrelated Backsplash changes. `normalizeSelectionPayload` also hard-failed `review_required` qty>0 and unknown keys. |
| **Selection classification** | `selectionAuthority.mjs`: `unchanged_frozen_baseline` \| `existing_saved_configured` \| `newly_requested`. Only newly requested must be active in the frozen envelope. Canonical backsplash modes (`none` / `standard_4in` / …) may apply even if the option row is briefly missing. |
| **Atomic save / rollback** | Failed save restores `savedQty` / `savedBacksplashDrafts` / `savedProductDrafts` / `savedCalc`, clears Pending, shows restore copy, does not auto-retry the rejected payload. Success replaces saved configuration + calculation together. Changes tab uses `savedCalc.roomPricingChanges` only. |
| **Studio readiness DTO** | `buildStudioPublicationReadinessDto`: `pricing.calculationStatus` / `pricing.approvalStatus` / `publicationConfiguration.status` / `publication.status` + `primaryMessage`. Permission-only fields (`customerCatalogPermissions`, `pricingValidThrough`, room locks, choice groups) do not stale approval; price-bearing scope fields do. UI filters contradictory Approve blockers when `approved_current`. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core`, `app-digital-estimate`, `app-elite100-estimate-studio`. No manual deployment. |

### 152. Takeoff backsplash + finished-edge geometry authority (2026-07-22)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-22 · `fix/takeoff-backsplash-and-finished-edge-geometry-authority` |
| **Hosted evidence** | Six-piece kitchen (310 in total run). Studio showed backsplash eligible **272 in** and derived open edge **3.17 LF** (= 38 in = 310 − 272). Eligible run count could read **0** while length was non-zero. |
| **Retired formula** | `derived_open_edge_v1` in `buildApprovedScopeSummary` / healing twin `buildApprovedScopeSummaryFromScopeRooms`: `derivedOpenEdgeLengthIn = max(0, totalRunLengthIn − eligibleBacksplashLengthIn)`. That treated backsplash wall length as a proxy for finished edge and incorrectly removed front-edge LF when backsplash was eligible. |
| **Source of 3.17 LF** | `(310 − 272) / 12` via the retired subtraction, exposed as `derivedOpenEdgeLf`. |
| **Source of 272 in** | Sum of per-run / room-carried eligible backsplash lengths (hosted shape with Coffee Top also eligible: 150+39+24+25+34). Healing previously could also apply `room.backsplashMeasuredLengthIn` when `includeBacksplash` without counting eligible runs. |
| **Zero eligible runs** | Length and run-count were summed on independent paths (room-level length without per-piece eligibility records). New invariant `assertBacksplashEligibilityConsistency` rejects length>0 with count=0 (and vice versa). |
| **New contracts** | Independent JSON on each piece/run (`takeoffPieceGeometryAuthority.mjs`): (A) backsplash — `backsplashEligible`, `backsplashEligibleLengthIn`, `backsplashEdge`, label, approval source; (B) finished edge — front / left / right / other lengths, total, estimator adjustment+reason, approval source. Never derive one from the other. |
| **Draft defaults** | Wall: front = run length, back finished = 0, ends from exposure flags; island: no backsplash, multi-edge exposure suggested; peninsula: no backsplash on open sides, front + outer end. Names may inform draft only — never production pricing. |
| **Estimator approval** | Worksheet: Backsplash at wall? Yes/No (+ length override with reason); finished-edge editor (front/left/right + Confirm). Takeoff Approve blocks until every included piece has confirmed finished edges. Corrections via `saveTakeoffCorrection` reset job to `needs_review`. |
| **Pricing Setup** | Shows approved backsplash run count + length, finished edge by piece, approved total LF, estimator ± LF adjustment, final priced LF. Source `finished_edge_v2`. Confirmation-required drafts show suggestions. **Publication blocking after estimate approval superseded by §153.** |
| **Publication** | Freezes governed priced edge LF / customer-safe edge + backsplash option effects as before. Public DE DTO still has no LF/SF/rates/dimensions. Post-approval geometry gate removed in §153. |
| **Legacy** | Historical publications that froze `derived_open_edge_v1` LF remain unchanged. Existing drafts without per-piece finished-edge approval get `finished_edge_geometry_required` (priced LF = 0 until confirmed or Pricing Setup override) — no silent reinterpretation. |
| **Invariants** | Eligible length ↔ run count; finished-edge LF independent of backsplash mode / edge profile; sections owned by one piece; final priced edge = approved sections + explicit adjustment; public DTO redaction unchanged. |
| **SQL / env** | None. Additive JSON on existing Takeoff / scope payloads. |
| **Deployment surfaces** | `backend-core`, `app-ai-takeoff`, `app-elite100-estimate-studio`. No manual deployment. |
| **Open business decisions** | (1) Optional richer “other/back” length editor beyond exposure flags. (2) Whether island/peninsula draft heuristics should be further constrained by areaType only (labels already draft-only). |

### 157. Mailbox sync run finalization → preview/import Sync inbox (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `fix/quote-intake-mailbox-sync-run-finalization` |
| **Hosted failure (a185b03)** | Background Sync inbox stayed `running` forever with empty counters. |
| **Finalization (a185b03)** | Added timeout/`finally`/orphan reclaim for a process-local background runner. |
| **Product correction** | Estimator-facing Command Center **Sync inbox** opens the existing proven `MailboxSyncModal` (preview → select → confirm → import), not a hidden background importer. |
| **Decision** | Removed unused `/mailbox/sync` + `/mailbox/sync-status` orchestrator and `quoteIntakeMailboxSyncService` (no remaining callers). Command Center and Legacy queue both reuse `MailboxSyncModal` + existing preview/import endpoints. Refresh stays queue-only. Filters/search/sort persist via existing session prefs. |
| **SQL / env** | None. |
| **Deployment surfaces** | `app-elite100-estimate-studio`, `backend-core` (quote-intake routes only). No manual deployment. |

### 156. Studio Home shell parity + Command Center email sync (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `fix/studio-home-shell-and-email-sync-command-center` |
| **Shell** | Studio already imported `shared/eliteos-ui/EliteosTopbar` (same as Home). Gaps fixed: remove `statusSlot` “Private pilot”; wrap `.shell`; resolve org/logo/name/subtitle from `GET /api/me` like Home/Sales; Home-like account menu (Open Home, Profile & preferences); align `:root` tokens (`--eos-accent: #a3132f`, ink, Inter, `--r-md`, `--sh-1`) so the shared topbar matches Home. |
| **Email sync** | Superseded by §157: Command Center Sync inbox now opens existing `MailboxSyncModal` (preview/confirm/import). Background `/mailbox/sync*` runner removed. |
| **Counters** | `checked` / `created` / `duplicates` / `failed` / `manualReview` from preview+import; `ignored` only from preview non-importable rows (never fabricated mailbox totals). |
| **Gaps** | No durable sync-run history table; no distributed multi-instance lock; no scheduled background sync exists today (manual-only). Documented for a later branch. |
| **SQL / env** | None new. Reuses existing `QUOTE_INTAKE_*` / Graph flags. |
| **Deployment surfaces** | `app-elite100-estimate-studio`, `backend-core` (quote-intake). No manual deployment. |

### 155. Estimate Command Center shared UI integration (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `fix/estimate-command-center-shared-ui-integration` |
| **Hosted failure** | Command Center rendered with unreadable nav/chips/cards (white-on-white), blank stage pills, green publication banner on the landing page, truncated UUID assignee stubs, duplicate Legacy queue controls, and a generic drawer that did not match Studio panels. |
| **Root cause** | Global `button { color:#fff; background: accent }` in Studio `styles.css` painted every `<button>` — including `.studio-nav`, `.eq-chip`, and `.ecc-card` — so inactive labels and chip text became invisible on white surfaces. |
| **Decision** | Visual integration only. Preserve Command Center workflow, stage adapter, next-action routes, and queue API. Scope primary-button styles to `.btn` / explicit action selectors; reuse Studio shell (`EliteosTopbar`, `studio-shell--wide`), `.eq-chip`, `.eq-btn-*`, `.eq-drawer*`, and `:root` tokens. |
| **Navigation** | Primary: Command Center / Publications / Review Requests. Legacy queue once under **More → Open legacy queue**. Removed in-page duplicate “Open legacy queue”. |
| **Banner** | Publication pilot banner only on Publications. Command Center uses page subtitle: “Manage estimate requests from intake through customer approval.” |
| **Assignee display** | No safe display-name join without new requests/SQL in this branch. Neutralize `User {uuid…}` stubs to **Assigned estimator** / **Unassigned** in `toCommandCenterItem` presentation only. |
| **Default landing** | Temporarily restored to Publications during the fix window; restored to `"command-center"` once shared-UI acceptance checks pass on this branch. |
| **SQL / env** | None. |
| **Deployment surfaces** | `app-elite100-estimate-studio`, `backend-core` (view-model presentation only). No manual deployment. |

### 154. Elite 100 Estimate Studio Command Center (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/estimate-command-center-polish` |
| **Goal** | Default Studio landing is a read-only Command Center that answers what needs attention, stage, why, owner, age, and next action — without rewriting the workflow engine. |
| **Architecture** | Existing queue API rows + `studioEstimateQueueWorkflow` → `studioCommandCenterViewModel` → operational stage / attention / next action → existing workspace `openTarget` (`takeoff` \| `scope` \| `digital` \| `review`). |
| **Default landing** | `StudioApp` `mainNav` defaults to `"command-center"`. Legacy queue remains at `"estimate-queue"` (nav: Legacy queue + in-page “Open legacy queue”). Publications and Customer review tabs unchanged. |
| **Stage precedence** | `takeoff_failed` → `review_requested` → `pricing_stale` → `takeoff` → `pricing` → `ready_to_publish` → `customer` → `new` → `closed` → `unclassified`. Needs attention is an overlay filter, not a separate primary stage. |
| **Attention** | Uses existing `needsAttention` / `attentionReasons` codes with plain-language titles (never show codes as primary copy). |
| **Next actions** | Derived from existing `openTarget` + workflow; labels like Review Takeoff / Complete Pricing / Publish Estimate / Review customer changes. |
| **No workflow writes** | List/filter/sort/search/select are read-only. Primary action may call existing `recordEstimateQueueOpened` then navigate into the existing workspace. No new status persistence. |
| **Accepted / Sold** | Not exposed as live stages (backend still hardcodes `accepted:false` / `sold:false`). |
| **Rollback** | Change StudioApp default `mainNav` back to `"publications"` or `"estimate-queue"`. No SQL / data migration. |
| **SQL / env** | None. |
| **Deployment surfaces** | `app-elite100-estimate-studio`, `backend-core` (view-model module only). No manual deployment. |

### 153. Studio finished-edge override + publication readiness (2026-07-22)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-22 · `fix/studio-finished-edge-override-and-publish-readiness` |
| **Hosted failure** | Estimate approved + “Ready to publish” while Publish stayed blocked by `finished_edge_geometry_required` (“Confirm finished-edge geometry…”). |
| **Lost / stale field** | `finishedEdge.approved` / `finishedEdgeConfirmed` was confirmed on Takeoff runs and present on the import payload, but `seedScopeFromTakeoffPayload` dropped `finishedEdge` (and backsplash geometry) when building Studio scope pieces. Separately, `assessStudioEstimatePublicationReadiness` re-checked `takeoffScopeSummary.edgeGeometryConfirmationRequired` / `edgeScopeSource === finished_edge_geometry_required` **after** estimate approval — a duplicate gate independent of the approved calculation snapshot. |
| **Persistence path** | Worksheet `patchRunFinishedEdge` → run.finishedEdge (`finishedEdgeConfirmed`, lengths, approvedAt) → correction save → approval import payload → `scopeSummary` + pieces → **now** Studio seed copies `finishedEdge` onto scope pieces → pricing reads `takeoffScopeSummary` / override → approval freezes `fabrication.edge.finalLf` → publication uses approved snapshot (warnings only for stale piece metadata). |
| **Approved geometry contract** | Per piece: `finishedEdgeConfirmed`, front/left/right/other lengths, `totalFinishedEdgeLengthIn`, estimator adjustment+reason, `approvalSource`, `approvedAt`. Canonical boolean is `finishedEdgeConfirmed` (aliased with `approved`). |
| **Manual override** | `scope.finishedEdgeOverride: { finalLf, reason, overriddenBy, overriddenAt }`. Blank = use Takeoff approved total (± legacy `edgeScopeAdjustment`). Absolute override replaces Takeoff total (`finished_edge_override_v1`). Reason required; negative rejected; change is price-bearing (stales approval). |
| **Final LF precedence** | (1) active finishedEdgeOverride.finalLf → (2) Takeoff approved finished-edge LF + legacy ± adjustment → (3) manual edgeLinearFeet. |
| **Publication readiness** | After estimate approval with non-negative `calculationSnapshot.fabrication.edge.finalLf`, geometry confirmation is **warning-only** (never a blocker). Approved 0 LF publishes with warning. Advisory Takeoff / legacy metadata do not block. |
| **Messages** | Never show “Ready to publish” and “Confirm geometry before publishing” together. UI also filters post-approval geometry blockers. |
| **SQL / env** | None. |
| **Deployment surfaces** | `backend-core`, `app-ai-takeoff`, `app-elite100-estimate-studio`. No manual deployment. |


### 158. Account Directory foundation + QB workbook dry-run (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/account-directory-foundation` |
| **Decision** | Ship a **standalone Account Directory** domain + head for eliteOS account identity (accounts, contacts, locations, aliases, QuickBooks Desktop root List ID links). **Do not** wire into Estimate Studio, estimates, mailbox, Takeoff, or live QuickBooks write/import in this branch. Existing estimate snapshots remain authoritative. |
| **Why** | Estimating, Command Center, Digital Estimate, and QB linkage need a governed account identity owner without coupling to Estimate Studio workflow or reinterpreting historical estimates. |
| **Domain** | New tables `account_directory_*` (additive migration `backend-core/supabase/eliteos_account_directory_v1.sql` — **not applied**). Stable eliteOS UUID PKs; QB List ID is an external link only. Soft archive/restore; no hard delete in UI/API. Row-version concurrency on updates. |
| **Permissions** | Head slug `account_directory` + role-mapped capabilities: `account_directory_view/edit/admin/external_link`. Server-enforced. Estimate Studio access does not grant Account Directory access. |
| **Workbook** | Local dry-run only via `npm run account-directory:seed:dry-run`. Workbook under `local-imports/` (gitignored). Zero DB writes. Fake fixtures in tests only. |
| **Store** | Foundation API defaults to in-memory store (`ACCOUNT_DIRECTORY_STORE=memory`) until migration is applied and a reviewed seed-import branch switches to Supabase. |
| **Impacted files/docs** | `app-account-directory/**`, `backend-core/src/accountDirectory/**`, `backend-core/supabase/eliteos_account_directory_v1.sql`, launcher/governance/Home config, `package.json`, this entry. |
| **Rollback** | Hide launcher card / unset `HEAD_URL_ACCOUNT_DIRECTORY`; revert app/API; leave unapplied migration alone. No estimates or QB production data affected. |
| **Revisit trigger** | Controlled seed import branch; Estimate Studio account picker; Supabase repository cutover after migration apply. |


### 159. Account Directory create form contract (displayName + JSON body) (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `fix/account-directory-create-form-contract` |
| **Hosted failure** | New account Save POSTed `{ name: "…" }` and returned `display_name_required` even when the modal showed a filled Account name. |
| **Root cause** | (1) Mutating Account Directory routes had **no `express.json()`** (Brain has no global JSON parser), so `req.body` was empty. (2) Frontend form/API used `name` while the domain column/API contract is `displayName` / `display_name`. |
| **Decision** | Canonical write field is **`displayName`**. API boundary may map deprecated `name` → `displayName` (prefer `displayName` when both present). Frontend form + client serialize `displayName` only. Mutating routes use `express.json`. `ACCOUNT_DIRECTORY_STORE=supabase` uses a real Supabase store (no silent memory fallback). Account `notes` are not persisted in v1 (removed from create UI/payload). |
| **SQL** | None. |
| **Impacted** | `app-account-directory/**`, `backend-core/src/accountDirectory/**`, `package.json`, this entry. |
| **Revisit** | Optional nested primaryContact/primaryLocation payload shape; account notes column. |


### 160. Account Directory controlled seed import (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/account-directory-controlled-seed-import` |
| **Decision** | One-time **admin CLI** imports only the clean `account-directory-seed.json` (expected 362). Review CSV, workbook XLSX, and child QB jobs are refused. Dry-run is default-safe; apply requires `--apply`, matching `--confirm-count`, `--environment production`, and `--confirm-production`. Idempotent on org + `quickbooks_desktop` + root List ID; never overwrites manually edited accounts. |
| **Why** | Hosted Account Directory is empty and ready; foundation dry-run already produced a reviewed seed. Need a governed production load without a permanent employee-facing bulk-import UI. |
| **Commands** | `npm run account-directory:seed:import` (dry-run/apply), `npm run account-directory:seed:verify`. |
| **Env** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCOUNT_DIRECTORY_STORE=supabase`, `ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID`, `ACCOUNT_DIRECTORY_SEED_ACTOR_USER_ID`. |
| **SQL** | None. |
| **Real apply** | Not run in development. Chris runs apply after merge/review. |
| **Impacted** | `backend-core/src/accountDirectory/accountDirectoryControlledSeed*.mjs`, scripts, store lookup helpers, `package.json`, this entry. |

### 161. Account Directory master-list reconciliation (no SQL yet) (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/account-directory-master-list-reconciliation` |
| **Decision** | Broader sales master-list XLSX is reconciled against Account Directory via admin CLI (extract → classify → dry-run artifacts → gated apply). Never duplicates QB-linked accounts, never writes QuickBooks, never imports forbidden CRM/financial columns. |
| **Classification schema gap** | Workbook fields `Sales Executive`, `Branch`, `Market`, `Account Type`, and source section have **no safe column** on `account_directory_accounts` (and must not be stuffed into notes). **No SQL in this branch.** Proposed future table: `account_directory_classifications` with org-scoped rows: `account_id`, `sales_executive`, `branch`, `market`, `account_type`, `source_section`, `relationship_class`, `source_system`, `row_version`, audit via existing events. Until approved, classifications live **only** in ignored dry-run/review artifacts (`classificationFieldsHeld`). |
| **Idempotency** | New master-list creates use `external_system = account_master_list` + SHA-256 fingerprint (name/section/status/email/phone) — **not** a QuickBooks List ID. |
| **Commands** | `npm run account-directory:master-list:profile`, `npm run account-directory:master-list:reconcile` (`--dry-run` / gated `--apply`). |
| **SQL** | None (stop-and-document). |
| **Real apply** | Not run in development. |
| **Impacted** | `backend-core/src/accountDirectory/accountDirectoryMasterList*.mjs`, scripts, `package.json`, this entry. |

### 162. Estimate Studio ↔ Account Directory Phase 1 (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/estimate-studio-account-directory-integration` |
| **Decision** | Internal Estimate links to Account Directory with **live IDs** (`account_directory_*_id`) plus a **frozen** `customer_identity_snapshot` on `quote_headers`. Print/PDF/email prefer the frozen snapshot. Quote Library shows linked/unlinked from saved columns/snapshot — no N+1 AD fetches. |
| **Auth** | Account lookup routes sit on Internal Estimate (`quote`) head access — **not** Account Directory head access. Prospect create still requires AD **EDIT** capability on the role. |
| **Save modes** | Create / save-as-new stamp a new snapshot. Update Existing and Save Revision retain account + snapshot unless `explicit_account_relink` or `refresh_customer_identity`. |
| **Legacy** | Null linkage remains valid. Manual link only — no auto fuzzy backfill. |
| **Out of scope** | Digital Estimate timeline, salesperson ownership, QuickBooks writes, pricing math, public/partner quotes. |
| **SQL** | `backend-core/supabase/eliteos_estimate_account_directory_v1.sql` — **committed, not applied** in this branch. |
| **Env** | None new (optional existing `VITE_HEAD_URL_ACCOUNT_DIRECTORY` for Open Directory links). |
| **Impacted** | `app-internal-estimate`, `app-quote-library`, `backend-core` internal quote + quote delivery + quote library search, this entry. |
| **Clarification (2026-07-23)** | This Internal Estimate / Quote Library work is **secondary**. The primary automated estimating workflow is **Elite 100 Estimate Studio** — see §164. |

### 164. Elite 100 Studio ↔ Account Directory continuity (2026-07-23)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-23 · `feature/elite100-studio-account-directory-continuity` |
| **Primary workflow** | Estimate Queue → Elite 100 Estimate Studio → approved Studio estimate → Digital Estimate publication → customer review → sold-job handoff. |
| **Decision** | Account Directory owns **canonical customer/company identity** on `studio_estimates` (`account_directory_*_id` + frozen `customer_identity_snapshot`). **`partnerAccountId` remains separate trusted-partner pricing authority** (Watts/Spahn) and must never receive an Account Directory UUID. |
| **Digital Estimate** | Manual publish freezes the Studio `customerIdentitySnapshot` into the publication / bridge envelope. Public DE never queries live Account Directory. Existing publications stay historically unchanged. |
| **Delivery safety (2026-07-24)** | AD search/select, prospect create, scope save, calculate, approve, revision, takeoff refresh, DE panel load, and readiness **never** publish or email. Only explicit estimator `POST …/digital-estimate/publish` with `confirm:true` (and existing explicit republish / quote-delivery send) may deliver. Proven by `eos:test:studio-account-directory-delivery-safety`. |
| **APIs** | Studio-scoped routes under `/api/elite100-estimate-studio/account-directory*` (reuse AD service helpers; do **not** call `/api/internal-quotes/account-lookup` from Studio). |
| **SQL** | `backend-core/supabase/eliteos_studio_estimate_account_directory_v1.sql` — **committed, not applied**. No communication/publication triggers. |
| **Secondary** | Internal Estimate + Quote Library AD integration (§162) remains; does not replace Studio. |
| **Impacted** | `app-elite100-estimate-studio`, `backend-core/src/elite100EstimateStudio/*`, Digital Estimate publication bridge, this entry. |

### 166. Live Digital Estimates portfolio (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `feature/live-digital-estimates-portfolio` |
| **Command Center** | Internal action queue — “what work should I do next?” |
| **Live Digital Estimates** | Active customer-facing publication visibility — “what is out with customers, and what is happening?” Replaces search-only Publications as the primary nav label (internal key `publications` retained). |
| **Review Requests** | Customer-submitted configuration change resolution workspace (unchanged). |
| **Analytics** | Future performance reporting — not in this branch. |
| **API** | `GET /api/elite100-estimate-studio/live-digital-estimates` (+ `/:publicationId` detail). Org-scoped, paginated, side-effect-free. Server derives status, nextAction, metrics, AD grouping. |
| **Grouping** | By `account_directory_account_id` when present; otherwise stable unlinked key. Never fuzzy name match. Batched AD lookup. Frozen publication identity preserved (`Published as …` when live AD name differs). |
| **Mutations** | Publish / replace / revoke / copy link / email remain explicit estimator actions with existing confirmations. List/detail GET never publish, email, or record link-copied/viewed. |
| **SQL** | None required (existing publication / event / review / studio_estimates / AD tables). |
| **Tests** | `eos:test:live-digital-estimates`, `liveDigitalEstimates.ui.test.mjs`, `liveDigitalEstimatesQuickbooksConsistency.test.mjs`. |
| **Impacted** | `app-elite100-estimate-studio`, `backend-core/src/elite100EstimateStudio/liveDigitalEstimates*`, DE repository portfolio list helpers, this entry. |

### 167. Live Digital Estimates operations polish (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/live-digital-estimates-operations-polish` |
| **Role** | Operational portfolio for estimators — not Analytics, not a publish console. |
| **Grouping** | Canonical Account Directory `account_directory_account_id` controls linked groups. Unlinked rows keep stable identity keys (`unlinked:family|quote|pub:…`); group titles use frozen publication identity (never fuzzy name match; never repeat generic “Unlinked customers” per row). |
| **QuickBooks Linked** | Canonical Account Directory active `quickbooks_desktop` external links only (shared helper with Studio AD panel / AD service). Never inferred from display name, frozen snapshot, partnerAccountId, or ad-hoc account columns. Portfolio exposes Linked / Not Linked labels only — never List IDs. |
| **Detail** | Right-side drawer; GET detail is read-only (no copy, view, publish, revoke, replace, email, or review mutations on open). |
| **Actions** | Neutral hierarchy for normal row actions; warning outline for linkage/expiration; destructive styling reserved for Revoke (confirmed). Publish / replace / revoke / copy remain explicit. |
| **SQL** | None (UI + enrichment polish only). |
| **Tests** | Existing Live DE suite + QB consistency regression + UI hierarchy/drawer contracts. |
| **Impacted** | `LiveDigitalEstimatesPage`, `liveDigitalEstimatesService`, `accountDirectoryQuickbooksLinkage`, AD store batch link APIs, this entry. |

### 168. Studio Review Requests list failure (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-review-requests-list-error` |
| **Symptom** | Review Requests tab showed `Unable to list review requests` (HTTP 500) with an empty table despite existing org-scoped rows. |
| **Root cause** | `createSupabaseAmendmentRepository` omitted Studio enrichment methods (`listAmendmentsForRequest`, etc.). With ≥1 review request, `studioReviewRequestService.list` threw `TypeError` during enrichment. Zero rows would have returned 200. |
| **Fix** | Complete the Supabase amendment repository surface to match the memory repository methods used by Studio review list/detail/actions. Harden list null/status handling. Frontend empty state only when `200 + []` (not on error). |
| **SQL** | Not required — tables already exist in production. |
| **Tests** | `eos:test:studio-review-requests-list`, Part 3 + Milestone 5 UI. |
| **Impacted** | `amendmentRepository.mjs`, `studioReviewRequestService.mjs`, `ReviewWorkspace.tsx`, this entry. |

### 169. Studio Review Requests operations polish (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-review-requests-operations-polish` |
| **Role** | Estimator action workspace for customer-submitted configuration changes (not Analytics, not publish console). |
| **Layout** | Full-width scannable request table + accessible right-side detail drawer (Escape/Close/focus restore). Detail never overlays table headings. |
| **Safety** | List/detail GET remain read-only. Raw option keys, UUIDs, and catalog tokens are never staff-facing; blockers use plain-language remediation + next action. |
| **Publication state** | Active / revoked / superseded / expired guide valid actions. Revoked or superseded links are never silently reactivated; republish stays explicit and confirmed only when eligible. |
| **Actions** | Neutral hierarchy: Start Review / Revise primary; Reject destructive; Republish only when valid. |
| **SQL** | None. |
| **Tests** | `reviewRequestStaffSafePresentation.test.mjs`, Milestone 5 UI, existing Part 3 / list suites. |
| **Impacted** | `ReviewWorkspace.tsx`, `reviewRequestStaffSafePresentation.mjs`, `studioReviewRequestService.mjs`, this entry. |

### 170. Studio operations — Review open details + Live DE customer links (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-operations-open-details-and-customer-links` |
| **Review Requests** | Every row exposes **customer/project** and **Open details** as accessible buttons (mouse, Tab, Enter, Space). Both call the same read-only detail opener. Opening detail preserves filters, restores focus, and never starts/resolves review, revises, publishes, or emails. |
| **Live DE customer URL** | Staff-recoverable `customerUrl` comes only from authorized detail recovery (`recoverStaffPublicationLinkMeta`) — the same authority as Publications workspace / Studio DE readiness. List endpoints never return customer URLs. Detail GET never mints or replaces a token. |
| **Copy / Open / Replace** | Each requires an explicit click (Replace still confirmed). Missing recoverable wrap metadata disables Copy/Open and shows: “No recoverable customer link is stored… Replace link creates a new URL…”. Never show “link unavailable” and “link ready/available” together. |
| **Legacy data** | Publications without persisted `token_wrapped` remain unrecovered until an explicit Replace link — no silent backfill/migration. |
| **SQL** | None. |
| **Impacted** | `ReviewWorkspace`, Live DE page/service, `staffPublicationLinkRecovery.mjs`, Publications + Studio DE link recovery call sites, this entry. |

### 171. Manual Studio estimate creation — Start without plans (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `feature/studio-manual-estimate-creation` |
| **Intake envelope** | Every Studio estimate still requires a real `quote_intake_cases` row. Manual estimates use `source_type=manual` — never a fake mailbox message, attachment, or Takeoff job. `studio_estimates.intake_case_id` remains NOT NULL. |
| **Origin** | Durable `scope_json.estimateOrigin` / `physicalScopeSource` = `manual_staff` (server-authored). Browser cannot set `manualScopeConfirmed` or origin flags. |
| **Physical scope** | Estimator-built rooms/pieces normalize into the same pricing scope shape as Takeoff-seeded rooms. Explicit **Confirm Manual Scope** stamps fingerprint + confirmation (including backsplash + openings); then Pricing / Calculate / Approve / DE publish reuse existing services. See §172 for single-authority rules. |
| **Pricing** | Origin does not change price. No frontend pricing constants. Fixed 2026 Vanity Program is **not** claimed — vanity tops use standard countertop pricing until a separate integration. |
| **Delivery invariants** | Create/Save/Confirm/Calculate/Approve never publish, replace links, email, create reviews, mark sold, or write QB/Moraware. |
| **Idempotency** | Client `Idempotency-Key` → org-scoped `content_hash = sha256(manual_staff:orgId:key)`. Same key + same create payload returns the same case/estimate; same key + conflicting payload → `409 idempotency_payload_conflict`; different keys with identical payload create distinct estimates. Not a permanent business-payload dedupe. |
| **AD / partner** | Account Directory identity and trusted partner pricing remain separate (existing rules). AD link is not required for draft create, calculate, or approve; publication freezes snapshot when present (§164). Null linkage remains valid. |
| **SQL** | None — reused existing `source_type` check constraint value `manual`. |
| **Impacted** | Manual estimate service/routes, scope gates, Command Center New Estimate, Manual Scope editor, queue/CC badges, this entry. |

### 172. Manual physical-scope authority — single geometry source (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/manual-estimate-physical-scope-authority` |
| **Decision** | Confirmed Manual Scope is the **single physical geometry authority** for manual estimates: rooms, pieces, dimensions/SF, finished-edge LF, backsplash geometry, and cutout opening counts. |
| **Pricing Setup** | Consumes confirmed physical scope read-only (with **Edit Manual Scope**). Does not maintain a second editable Edge LF / backsplash / cutout measurement set when `physicalScopeSource=manual_staff`. |
| **Backsplash** | Measured length × height (existing `/144` conversion) lives on rooms in Manual Scope; customer-selectable backsplash *style* remains a pricing/publication option and does not alter frozen measured geometry. |
| **Cutouts** | Opening counts (`qty-sink` / `qty-bar` / `qty-cook` / `qty-outlet`) are physical scope; product model selection remains catalog/DE authority. Estimator UI uses plain labels, not raw keys. |
| **Finished-edge LF** | Independent of base edge profile (Eased, etc.). Confirmed room/piece LF drives project pricing and room-level customer premium-edge options. Pricing Setup “Edge LF (manual)” is not a competing editable authority for manual estimates. |
| **Project address** | Estimate `projectAddress` (jobsite) is independent of Account Directory account location. Linking/changing AD location does **not** overwrite a nonblank project address. Explicit **Use this as project address** is required. |
| **Edits** | Saving Manual Scope after confirmation clears confirmation (and follows existing draft/stale/revision rules). Historical publications remain frozen. |
| **Legacy** | Prefer confirmed room/piece geometry; fall back to legacy Pricing Setup fields only when no room/piece edge exists. GET does not rewrite. |
| **SQL** | None. |
| **Impacted** | `studioManualPhysicalScope.mjs`, Manual Scope editor, Estimate Scope panel, `studioScopeBilling` edge resolution, AD identity apply + panel, this entry. |

### 173. Manual room open-edge LF — canonical room quantity (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/manual-estimate-room-open-edge-authority` |
| **Decision** | Every eligible manual room has **one** canonical confirmed open-edge LF (`confirmedOpenEdgeLf`), independent of base edge-profile selection. Customer premium-edge options price that room quantity only. |
| **Measurement modes** | `piece_sum` (sum of included eligible piece Open edge LF) or `room_total` (one room-level Total open edge LF). Exactly one mode is authoritative — never both, never double-count. |
| **Confirm** | Server validates mode + inputs, calculates room LF and derived project total, stamps fingerprint / confirming estimator / timestamp. Client cannot forge `confirmedOpenEdgeLf` or confirmation flags. |
| **UI** | Manual Scope shows measurement mode and a prominent room total (“Open edge LF” / “Total open edge”). Pricing Setup shows confirmed room totals read-only; no competing editable Edge LF for confirmed manual rooms. |
| **Publication** | Adapter freezes per-room confirmed LF by stable room key. Project LF is derived summary only and is never assigned to one room or allocated by SF/count/name. |
| **Legacy** | Prefer confirmed room LF → piece sum → room-level fields → project LF only when exactly one eligible room has no room/piece value. Multi-room project-only LF → `review_required` (never guess). GET does not rewrite. |
| **Takeoff** | Upstream authority unchanged (`approved` piece finished-edge / Takeoff summary). Shared downstream contract may read the same resolved room LF field; sources remain separate. |
| **SQL** | None — scope JSON fields only. |
| **Impacted** | `studioManualPhysicalScope.mjs`, `studioRoomEdgeQuantity.mjs`, `studioScopeBilling.mjs`, publication adapter, Manual Scope editor, Pricing Setup panel, this entry. |

### 174. Editable Studio project details (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-editable-project-details` |
| **Decision** | Project name may be omitted on draft create. Project details (name, jobsite address, internal notes) remain editable after creation via dedicated Project Details UI + `PATCH …/project-details`. |
| **Publication** | Meaningful trimmed project name is required before Digital Estimate publish (`project_name_required` + `edit_project_details` action). Placeholders (Unknown, Untitled project, Test, Project, customer-name-alone, UUID) are rejected for customer-facing publication. |
| **Staff display** | Blank names show **Project not named** (never Unknown / Untitled project). |
| **Pricing** | Project metadata changes do not alter measured geometry, rates, or clear calculation solely because the name/address changed. |
| **History** | Existing publications keep frozen project identity; live estimate updates apply to the next explicit publish/republish only. |
| **AD** | Account Directory location remains separate from project/jobsite address (existing nonblank overwrite rule). |
| **Delivery** | Save project details never publishes, emails, creates reviews, marks sold, or writes QB/Moraware. |
| **SQL** | None. |
| **Impacted** | `studioProjectDetails.mjs`, estimate service/routes, publication readiness, Command Center labels, Project Details panel, Digital Estimate blockers, this entry. |

### 175. Studio estimate action sequencing and recovery (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-estimate-action-sequencing-and-recovery` |
| **Canonical sequence** | Manual estimates follow one ordered path: **Save Manual Scope → Confirm Manual Scope → Save Pricing Setup → Calculate → Approve → Publish** (Configure Digital Estimate remains explicit before Publish). |
| **Workflow state** | Each active revision exposes **one server-derived workflow** object (`buildStudioWorkspaceWorkflow`) — `nextRequiredAction`, `allowedActions`, blockers, completed/later steps. UI must not invent parallel next-step logic. |
| **Invalid actions** | Buttons and primary workflow actions are **disabled or blocked** when not in `allowedActions` or when a blocker applies (e.g. unconfirmed scope, unsaved pricing, superseded revision). |
| **Metadata edits** | Project name / address / internal notes changes **do not stale pricing** or clear calculation solely because metadata changed (see §174). |
| **Coherent refresh** | Successful mutations (save scope, confirm, save pricing, calculate, approve, project details) **refresh all panels** from the same estimate DTO + workflow — no orphan panel state. |
| **Transient failures** | HTTP **502 / 503 / 504** are treated as transient: show recovery UI, **never optimistically advance** workflow step, approval, calculation, or publication state. |
| **Historical approval** | A prior revision’s approval appears as **historical only** (`historicalApproval` / previous-revision summary) — not as current approval on the active revision. |
| **Recovery safety** | Retry / refresh / superseded recovery paths **never perform delivery actions** (no publish, replace link, email, review create, sold, QB/Moraware). |
| **SQL** | None. |
| **Tests** | `studioWorkspaceWorkflow.test.mjs`, `studioWorkspaceSequencing.ui.test.mjs`. |
| **Impacted** | `studioWorkspaceWorkflow.mjs`, estimate service workflow attachment, Estimate Workflow header, Takeoff workspace, Scope panel, Project Details panel, `api.ts` transient helpers, this entry. |

### 176. Published Studio estimates reopen in publication management (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-published-estimate-reopen-flow` |
| **Decision** | When the **active revision** already has a **current active Digital Estimate publication** (and calculation/approval remain current), Studio reopens in **publication-management** state — not the estimate-creation wizard. |
| **Customer link** | Existing recovered staff customer URL is available immediately (Open customer view / Copy customer link) **without** recalculation, reapproval, or republish. |
| **Read-only reopen** | Opening, loading, and refreshing are **read-only** for publication: they never publish, replace, revoke, notify, create reviews, mark sold, or write QB/Moraware. |
| **Completed stages** | Project details, Manual Scope/Takeoff, Pricing, Calculation, and Approval remain **complete** and may be collapsed when focusing publication management. |
| **Edits after publish** | Price-affecting edits create/activate a **new revision** and keep the prior publication as **frozen historical** output. Explicit replace remains required for a new customer link. |
| **Metadata** | Metadata-only edits do **not** stale pricing (see §174) and do not mutate the frozen publication. |
| **Explicit delivery** | Replace publication and Revoke publication remain **explicit** secondary actions. |
| **SQL** | None. |
| **Tests** | `studioPublicationSummary.test.mjs`, extended `studioWorkspaceWorkflow.test.mjs`, `studioPublishedReopen.ui.test.mjs`. |
| **Impacted** | `studioPublicationSummary.mjs`, workspace workflow, digital-estimate readiness/summary read, estimate GET attach, EstimatePublicationSummary UI, Takeoff workspace focus/collapse, Review openTarget, this entry. |

### 177. Studio core cleanup — operational adapter, revision guard, postMessage origins (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `fix/studio-core-cleanup-and-guardrails` |
| **Operational status** | Command Center / Estimate Queue derive **one backend operational read-model** (`buildStudioOperationalState`) for label, needs-attention, openTarget, and primary action. No persisted workflow enum / estimate-family table. |
| **Studio workflow retained** | Estimate Studio continues to use the richer `buildStudioWorkspaceWorkflow` for per-revision action gating. |
| **Queue actions** | Primary queue/Command Center actions **navigate only** (openTarget / focus). They do **not** calculate, approve, publish, replace, revoke, email, or notify. |
| **Superseded mutations** | Active-workflow mutations targeting a **superseded** `studio_estimates` id return structured **409** `estimate_revision_superseded` with safe `activeEstimateId` / `requestedEstimateId`. No silent replay onto the active revision. |
| **Publication / Review** | Publication replace/revoke and Review Request actions remain on their existing authorities — not blunt-blocked solely because a publication belongs to a prior revision. |
| **Takeoff postMessage** | AI Takeoff ↔ Studio messaging uses **exact configured origins** only. `targetOrigin "*"` and blanket `*.vercel.app` / `*.eliteosfab.com` receiver rules are removed. Preview origins require explicit allowlist config. |
| **Identity display** | Queue/Command Center customer/project/estimator labels use **display-only fallbacks** (`Customer not identified`, `Project not named`, `Unassigned`). Fallbacks never rewrite Account Directory, estimate snapshots, or publication snapshots. |
| **Delivery** | Load, refresh, retry, queue open, link copy/open, and revision reconciliation never publish, replace, revoke, email, mark sold, or write QuickBooks/Moraware. |
| **SQL** | None. |
| **Tests** | `studioOperationalStatus.test.mjs`, `studioEstimateActiveRevisionGuard.test.mjs`, `studioIdentityDisplay.test.mjs`, `takeoffPostMessageOrigins.test.mjs`, plus `eos:test:studio-golden-path-gate`. |
| **Impacted** | Queue service, Command Center view-model, estimate/manual mutation services + routes, Takeoff/Studio postMessage helpers, identity display helper, Studio UI 409 recovery, this entry. |
| **Audit findings** | AUDIT-001 (implemented), AUDIT-002 (implemented), AUDIT-005 (implemented), AUDIT-009/010 (partial — terminology/nav via adapter), identity Unknown (implemented display), AUDIT-014 (gate remains; browser E2E deferred). |

### 178. Studio Shared Inbox Phase 1 — explicit quote-request intake (2026-07-24)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-24 · `feature/studio-shared-inbox` |
| **Decision** | **Shared Inbox** is the estimator-facing mailbox request workspace inside Elite 100 Estimate Studio. It answers “what new quote requests arrived, and what happened to each?” |
| **Command Center retained** | **Command Center** remains the active-work queue (“what estimating work needs attention now?”). Shared Inbox does not replace Command Center or All Estimates. |
| **Preview** | Mailbox preview / refresh / open-details are **read-only**. They never import, create estimates, start Takeoff, calculate, approve, publish, notify, or mutate Outlook. |
| **Import** | Import is an **explicit** estimator action, org-scoped, and **idempotent** via existing mailbox dedupe (`graph_immutable_message_id` / `internet_message_id` / content hash). Retries and double-submit return the existing intake case. |
| **Pipeline** | Reuses `previewQuoteIntakeMailbox` + `importQuoteIntakeMailboxMessages` — no second import pipeline. |
| **Outlook** | No reply, forward, delete, move, mark read/unread, categorize, or folder changes. Graph access remains backend-only and read-oriented (existing Graph read-only guards). |
| **Attachments** | Phase 1 showed **attachment metadata only**. Secure plan viewing is implemented in §179 (authenticated backend content routes; no Graph/storage URLs in the browser). |
| **Takeoff** | Shared Inbox does not broaden Takeoff initiation. Existing production import may still auto-bootstrap Takeoff when `QUOTE_INTAKE_AUTOMATIC_TAKEOFF` is enabled — documented, not expanded here. |
| **Manual path** | Unsupported / no-PDF rows offer **Create manual estimate**, which still uses mailbox import to preserve message↔intake linkage (not a separate unlinked manual-create path). |
| **Delivery safety** | Shared Inbox never publishes, calculates, approves, emails/notifies customers, marks sold, or creates QuickBooks/Moraware records. |
| **SQL** | None. |
| **Tests** | `eos:test:studio-shared-inbox` (+ golden-path gate unchanged). |
| **Impacted** | `studioSharedInboxReadModel.mjs`, `studioSharedInboxService.mjs`, Studio routes, `SharedInboxPage.tsx`, Studio nav, this entry. |
| **Deferred** | All Estimates registry; Outlook compose; automatic email classification. Add Plans / piece-to-page evidence remain separate. |

### 179. Secure Studio plan viewer Phase 1 (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/studio-secure-plan-viewer` |
| **Decision** | Quote-request **plan files** are viewed through **authenticated, organization-scoped backend content routes**. The browser receives bytes only (Blob URL). **Graph and storage credentials remain backend-only.** No permanent Graph or storage URL is exposed to the client. |
| **Identity** | Shared Inbox uses `messageKey` + `attachmentKey` (Graph ImmutableIds already on the read model). Linked estimates use intake `caseId` + intake `attachmentId`. Server validates org ownership and attachment membership before returning bytes. |
| **Byte source** | Prefer stored `quote_files` bytes when sha256 is present after Open Estimate ingest; otherwise backend-only Graph attachment GET. Viewing never redirects the browser to Graph or Storage. |
| **Reuse** | Shared Inbox, Estimate Studio Source & Plan, and AI Takeoff “View source plan” share the same secure viewer. No parallel attachment ownership system. |
| **Read-only** | Viewing does **not** import, create intake/estimate/revision, start or approve Takeoff, mutate Manual Scope, calculate, approve, publish, replace/revoke publication, create Review Requests, mark Outlook read/unread, move/delete/reply, send email/notifications, mark sold, or create QuickBooks/Moraware records. No automatic “viewed” mutation. |
| **Types** | Phase 1: **PDF** plus validated **PNG / JPEG / WebP**. Unsupported attachments remain metadata-only (“Preview not supported”). Magic bytes + declared type/extension checks; SVG/HTML/Office not rendered. |
| **Authority** | Source plan belongs to the **intake case** (and mailbox message linkage), not each price-only revision. Viewer is **not** the pricing or Takeoff source of truth. |
| **Range** | Not implemented in Phase 1 — frontend fetches a bounded file and renders from a Blob URL (revoked on close/replace/401/403). |
| **SQL** | None. |
| **Tests** | `eos:test:studio-secure-plan-viewer` (+ Shared Inbox + golden-path gate). |
| **Deferred** | Piece-to-page evidence navigation; Add Plans to Existing Estimate; malware scanning; permanent download UX; mailbox webhook/delta. |

### 180. AI Takeoff exposed-edge geometry + correction conflicts (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `fix/ai-takeoff-exposed-edge-corrections` |
| **Decision** | AI Takeoff owns **physical exposed-side evidence** (front/back/left/right) and physical LF. Pricing Setup remains the sole authority for commercial edge profile and price. |
| **Four sides** | Rectangular pieces store `exposedSides` plus legacy length fields (`otherExposedEdgeLengthIn` = back). |
| **Topology** | Helpers: wall_run, island (all four), peninsula (requires attached side → other three), vanity (front default; ends estimator-confirmed), custom (manual). Suggestions are not approved until Confirm. |
| **LF** | `(sum of selected side inches × quantity) / 12`. Quantity applied exactly once. |
| **Corrections** | Exposed-side checkbox toggles are **local only**. **Confirm exposed edges** sends one correction with current `baseResultId` / `clientMutationRevision`. Saves are serialized per job. Optimistic concurrency (`stale_takeoff_correction`) remains enabled; 409 returns latest result id/revision metadata for recovery without auto-replay. |
| **Approval** | Approved Takeoff snapshots stay frozen; a later draft edit returns the job to needs_review and UI distinguishes previous approved vs current draft review. |
| **Studio** | Room physical LF continues via existing `confirmedOpenEdgeLf` / approved piece finished-edge sum authority. Profile selection independent; Eased does not zero physical LF. |
| **SQL** | None. |
| **Tests** | `eos:test:takeoff-exposed-edges` (+ secure plan viewer, Shared Inbox, golden-path regressions). |

### 181. Takeoff correction queue + worksheet layout hotfix (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `fix/takeoff-correction-queue-and-workspace-layout` |
| **Decision** | All Takeoff worksheet corrections for a job use **one serialized coordinator**. Concurrency keys (`baseResultId`, `clientMutationRevision`) are resolved at **send time**. Local edits coalesce to the newest full draft. Successful responses update server keys **before** any follow-up send (fixes self-generated 201/409 alternation). Real cross-tab stale writes still return `409 stale_takeoff_correction` and require **Review latest draft** — no auto-replay; local draft preserved. |
| **Backsplash vs edges** | Backsplash eligibility/height is independent of countertop exposed edges. Backsplash edits do **not** invalidate confirmed exposed sides or change edge LF. Confirmation invalidates on length/depth/quantity/topology/attached side/side selection/scope type — not on notes, cutouts, or backsplash. Backsplash-only pieces (`pieceType: splash`) do not require countertop edge confirmation and contribute 0 countertop edge LF. When no splash piece exists, backsplash remains a property of the countertop run (documented). |
| **Exposed-edge editor** | Confirm stays open while saving; closes and returns focus to the trigger only after backend success. 409/errors keep the editor open with selections preserved. Cancel/Escape discard local editor edits without POST. |
| **Layout** | Header/body share one CSS custom-property column definition. Action controls sit after the scrollable worksheet (not sticky over rows). Open edge/cutout popovers lift worksheet overflow so menus are not clipped. Bounded notes/edge column widths. |
| **Status copy** | Estimator-facing labels replace raw enums such as `needs_takeoff_approval` in primary UI (storage enums unchanged). |
| **CSS build warning** | Orphaned `grid-column: 1 / -1;` after `.eq-subsection-title` in Studio `styles.css` removed (malformed leftover brace block). |
| **SQL** | None. |
| **Tests** | `eos:test:takeoff-correction-workspace` (+ exposed-edges, secure plan viewer, Shared Inbox, golden-path). |
| **Deferred** | Customer Final Acceptance; portal-based popover framework; mobile-first Takeoff redesign. |

### 182. Takeoff explicit Save draft + centered edge dialog (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `fix/takeoff-explicit-save-and-centered-edge-dialog` |
| **Decision** | Takeoff worksheet editing is **local until explicit Save draft**. Field-level autosave and the correction coordinator drain/queue are removed. **Save draft** is the sole normal correction writer (exactly one POST per click; double-click coalesced). Optimistic concurrency remains on Save draft; real 409s preserve local draft and require **Review latest draft** (never auto-replayed). |
| **Approve** | Requires a successfully saved clean draft (no unsaved/conflict). Approve does not call Save or the corrections endpoint. |
| **Confirm exposed edges** | Updates local draft only (zero correction requests), closes the dialog immediately, shows `LF · unsaved` until Save draft succeeds. |
| **Dialog** | In-cell/table popover removed. Exposed-edge editor is a **viewport-level modal** via `createPortal(..., document.body)` with `position: fixed; inset: 0` overlay — independent of worksheet horizontal scroll, plan visibility, and page scroll. |
| **Layout** | Worksheet horizontal scroll is isolated to `.ctr-table-wrap` (initial `scrollLeft = 0`). Shared `--ctr-col-*` / `--ctr-worksheet-min-width` for 12 columns. Plan/worksheet stack at `max-width: 1200px`. Actions sit after the table. |
| **Backsplash** | Independent of countertop exposed edges; local dirty only; does not invalidate confirmation or change edge LF. |
| **Background results** | Newer server results while dirty show “A newer Takeoff result is available” + Review latest draft — no silent local overwrite. |
| **SQL** | None. |
| **Tests** | `eos:test:takeoff-explicit-save-dialog` (+ correction-workspace, exposed-edges, Secure Plan Viewer, Shared Inbox, golden-path). |

### 183. Takeoff Save draft persistence + canonical result reload (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `fix/takeoff-save-persistence-and-canonical-reload` |
| **Decision** | **Save draft** persists one complete canonical Takeoff result and promotes it as the **canonical current editable result** via `job.result_summary` (`resultRowId`, `clientMutationRevision`, `normalizedTakeoffJson`, `lastCorrectionId`). Success returns that envelope (`resultId`, `clientMutationRevision`, full `normalizedTakeoffJson` / `takeoffResult`). Frontend reconciliation adopts draft, result ID, server mutation revision, and dirty baseline **atomically**. Page reload (`getLatestTakeoffResult` / `selectAuthoritativeTakeoffResult`) uses the same authority — never silently falling back to the original AI result after a correction is current. |
| **Root cause fixed** | When a correction insert was blocked (`quote_id` NOT NULL) or `result_summary` was newer than an older estimator table row, `selectAuthoritativeTakeoffResult` preferred the older table row. Reload dropped backsplash/edits; the client kept a stale `baseResultId` / revision skew → later **409** `stale_takeoff_correction`. |
| **Unchanged Save** | Clean worksheet: Save disabled / client no-op (zero POST). Backend: current base + semantically equal draft → `{ ok: true, unchanged: true }` without a new result row or revision bump. Content returning to an earlier configuration (A→B→A-like→C) is valid; staleness is lineage/version, not content resemblance. |
| **Concurrency** | Optimistic concurrency preserved. Real two-tab stale saves still **409**; local draft retained; no automatic replay. |
| **Mutation revision** | Client sends expected next revision; server validates and returns confirmed revision; frontend adopts **server** value only after success. |
| **SQL** | None — uses existing `quote_takeoff_jobs.result_summary` promotion pointer. **Superseded by §184:** synthetic `resultRowId` UUIDs are forbidden; physical rows required. |
| **Tests** | `eos:test:takeoff-save-persistence` (+ explicit-save-dialog, correction-workspace, exposed-edges, Secure Plan Viewer, Shared Inbox, golden-path). |
| **Deferred** | Customer Final Acceptance; Sold Review. See §184 for nullable `quote_id` migration. |

### 184. Physical Takeoff result rows required — synthetic IDs forbidden (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `fix/takeoff-save-persistence-and-canonical-reload` |
| **Decision** | Every canonical editable or approved Takeoff `resultId` **must** be a physical `quote_takeoff_results.id`. `job.result_summary` is a **pointer/cache** (`resultRowId`, revision, draft snapshot) — never a substitute for a table row. |
| **Synthetic IDs removed** | Generating/promoting a UUID after a failed result insert is forbidden. Insert failure returns `takeoff_result_persistence_failed` (503), leaves the local draft dirty, does not bump revision, does not move the current pointer, and blocks approval. |
| **Path B — nullable `quote_id`** | Studio / AI Takeoff / Shared Inbox jobs legitimately lack `quote_headers`. Migration `eliteos_quote_takeoff_results_quote_id_nullable_v1.sql` drops NOT NULL on `quote_takeoff_results.quote_id` while retaining the FK for non-null legacy values. **Do not create fake quote_headers rows.** (Production already shows nullable + null `quote_id` on results; migration is for envs still enforcing NOT NULL.) |
| **Approval** | Requires a verified physical current row; `UPDATE … RETURNING` / select must affect ≥1 row or approval fails with `takeoff_result_not_persisted`. Job is not marked approved on zero-row update. `result_summary` merge **preserves** `resultRowId`, `clientMutationRevision`, and correction lineage markers. |
| **Scope seeding** | Uses the exact approved physical result ID / draft — never an older AI row after a silent summary overwrite. |
| **SQL applied** | No — user applies the migration manually before deploying the backend that requires physical inserts. |
| **Tests** | `eos:test:takeoff-physical-result-persistence` (+ save-persistence, synthetic safety audit). |

### 185. Studio commercial estimating parity — materials + commercial lines (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/studio-estimating-parity` |
| **Decision** | Elite 100 Estimate Studio uses one **canonical commercial line model** (`studio_commercial_lines_v1`) and **explicit material inheritance** for general estimating parity before Final Acceptance / Sold Job. |
| **Material inheritance** | Precedence: **piece override** (`materialOverride` + `materialGroup`) → **room override** (`materialGroupOverride`) → **estimate default** (`scope.materialGroup`). Override intent is explicit; matching the parent group still counts as an override when the field/flag is set. Clearing the override restores inheritance. Multi-material SF is priced per resolved group; historical approved snapshots remain frozen. |
| **Commercial roles** | `customer_charge`, `customer_charge_hidden_detail`, `discount`, `credit`, `internal_only`, `absorbed`, plus `legacy_hidden_customer_charge` for pre-parity `customerFacing:false` lines. |
| **Customer total** | Includes customer charges, discounts, credits, and **legacy** hidden-name charges. **Excludes** new `internal_only` and `absorbed` roles. Material use tax remains **2% on material only**; percent discounts apply to material+tax+fabrication (pre-commercial) base. |
| **Legacy absorption** | Pre-parity `customerFacing:false` lines still charge the customer without naming the line and continue to use `internal_custom_line_allocation_v1` stone absorption at publish. New internal/absorbed roles are **not** stone-absorbed. |
| **Public filtering** | Digital Estimate / public commercial lines / customer print exclude internal notes, internal unit costs, internal-only and absorbed lines by **payload omission** (not CSS). Print snapshots use `version`/`header`/`display` for shared PDF parser compatibility. |
| **Authority** | Server `calculateStudioEstimate` remains authoritative; Pricing Admin / calculator rate tables via existing `resolveStudioMaterialRatePerSf` + hardcoded edge/add-on fallbacks unchanged. **Vanity Program out of scope.** |
| **Revision** | `createRevisionFrom` copies full `scope` (rooms, overrides, commercial lines). Recalc + reapprove required. |
| **SQL** | None — additive JSON fields on `studio_estimates.scope_json`. |
| **Tests** | `eos:test:studio-estimating-parity`. |
| **Deferred** | Vanity Program. Final Acceptance / Sold / All Estimates → see §186. |

### 186. Studio estimate lifecycle closeout — Final Acceptance → Sold (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/estimate-lifecycle-closeout` |
| **Decision** | Complete the Studio operational lifecycle with **explicit Final Acceptance** (customer) and **explicit Mark Sold** (privileged staff), plus All Estimates registry and Quote Library discovery bridge. Every step remains manual-only; no automatic email, publish, sold, QuickBooks, or Moraware. |
| **Lifecycle states** | Overlay on commercial `studio_estimates.status` + publication status: `draft`, `scope_confirmed`, `calculated`, `commercially_approved`, `published`, `changes_requested`, `accepted_awaiting_sold_review`, `sold`, `archived`. Publication status stays separate (`never_published` / active / replaced / revoked / expired). **Sold is never derived from acceptance alone.** |
| **Final Acceptance** | Customer confirms current active Digital Estimate revision, selected configuration, shown customer total, and terms. Bound to valid public session + active publication. Rejects revoked/replaced/stale/invalid session. Idempotent per `(organization_id, publication_id)`. Creates immutable `studio_estimate_acceptances` customer-safe snapshot (no internal-only, absorbed, notes, margin). |
| **Review Request ≠ Acceptance** | Review Request remains non-binding amendment intake. Acceptance is a distinct route/UI (`Approve Final Estimate`) with deliberate confirmation. |
| **Post-acceptance lock** | Customer configuration becomes read-only; view/print allowed; Review Request blocked or redirected to staff contact. Publication is **not** auto-revoked. Staff changes require new revision → calculate → approve → publish → new acceptance. Old acceptance remains history. |
| **Sold review** | Staff workspace + required checklist (account, project, scope, materials/options, total, terms, internal notes, no open Review Request, ready for handoff). Checklist persisted/auditable on `studio_estimate_sold_reviews`. |
| **Mark Sold** | Privileged (`admin` / `super_admin` or `ELITE100_STUDIO_MARK_SOLD_ALLOWLIST`). Requires active acceptance + complete checklist + current revision. Idempotent immutable `studio_estimate_sold_snapshots`. Does **not** email, publish, create QB/Moraware, or fabricate `quote_headers`. |
| **All Estimates** | Studio-backed registry (`GET /api/elite100-estimate-studio/all-estimates`). Command Center remains the action queue. |
| **Quote Library bridge** | Opt-in read-model merge (`include_studio=1`) labels `Studio Estimate` vs `Legacy Quote`; Studio opens in Estimate Studio. Default list remains legacy-only (unchanged shapes). Does not make Quote Library the Studio calculation authority. Studio bridge ids (`studio:…`) are rejected by legacy mutations. No fake `quote_headers` for Studio sold/acceptance. |
| **Events** | Append-only `studio_estimate_lifecycle_events` (acceptance, sold review, marked sold, etc.). No public tokens/secrets in logs. |
| **Persistence** | Production/hosted require Supabase tables from `eliteos_studio_estimate_lifecycle_closeout_v1.sql`. Missing tables → HTTP 503 `studio_lifecycle_persistence_unavailable` (no Accepted / no Mark Sold success / no memory fallback). Memory repository is tests-only via explicit injection/`allowMemory`. DB unique constraints are the idempotency authority. |
| **Internal Estimate** | Unchanged. Legacy Quote Library remains authority for legacy quotes. |
| **SQL** | `backend-core/supabase/eliteos_studio_estimate_lifecycle_closeout_v1.sql` — **do not apply automatically**. |
| **Tests** | `eos:test:estimate-lifecycle-closeout`. |
| **Deferred** | Vanity Program; automatic QB/Moraware handoff; automatic customer email. |

### 187. Elite 100 simplified estimating & publishing workflow (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/elite100-simplified-estimating-workflow` |
| **Decision** | Estimator product path is reduced to **Inbox → Start Estimate → Scope → Customer Choices → Review & Publish**. Top-level Studio navigation is **Inbox** and **Estimates** (Command Center / Live DE / Review Requests remain under More as compatibility). The individual estimate workspace uses three primary section tabs with the same labels. |
| **AI Takeoff** | Prefills the same Scope workspace as a starting draft. Not a separate required business approval gate in the simplified path. Scope readiness is validation-derived (`Scope ready` / `Scope needs attention`). |
| **Backsplash** | Physical **backsplash-eligible length** is Scope authority (room). Customer Choices only offer allowed backsplash types against that length. |
| **Advanced Pricing** | Commercial lines (`studio_commercial_lines_v1`: charges, discounts, credits, internal-only, absorbed) live under **Customer Choices → Advanced Pricing** (collapsed). Not under Scope. Internal/absorbed never enter the public Digital Estimate. |
| **Autosave** | Debounced draft autosave across Scope, Customer Choices, and Advanced Pricing. One write in flight; edit order preserved; stale responses rejected; conflict visible; Retry; flush before section navigation and before Publish; `beforeunload` when dirty. Save now / Save Draft only under Advanced troubleshooting. Status vocabulary: Saving… / Saved / Save failed — Retry / Another user changed this estimate. |
| **Calculation** | Server-authoritative auto-calc after a clean draft save. Manual Calculate is not required on the normal path (compatibility under Advanced). Stale calculation tokens are ignored; last good price retained while updating. |
| **Publish** | **Publish Digital Estimate** is the estimator’s commercial approval. Client flushes pending autosave first (rejects unresolved conflict). `POST …/simplified-publish` validates Scope, auto-confirms manual scope when needed, calculates, approves (`confirm:true`), then publishes. Failure → no customer link / no partial commercial commit beyond a non-published priced snapshot. No email, auto-sold, QB, or Moraware. |
| **Frozen option package** | Publication carries a customer-safe frozen option package summary (materials/edges/backsplash/products/defaults/price effects). Internal cost/margin/formulas omitted. |
| **Commitments** | Only Publish, customer Accept, and Mark Sold require deliberate confirmation. |
| **Legacy** | Internal Estimate and legacy Quote Library unchanged. No Studio → `quote_headers` authority writes. Compatibility Import / Calculate / Approve / Confirm Scope / workflow header remain under Advanced / Legacy Compatibility. |
| **SQL** | None. |
| **Tests** | `eos:test:elite100-simplified-workflow`. |

---

### 188. Elite 100 authoritative room-pricing calculator — `pricingVersion` 4 (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/elite100-authoritative-calculator` |
| **Decision** | One canonical server-side calculator, `calculateElite100Estimate({ scope, configuration, pricingContext })` in `elite100RoomPricingCalculator.mjs`, is the sole formula authority for new Elite 100 Studio pricing: `pricingEngine: "elite100-room-pricing-v1"`, `pricingVersion: 4`. It is **additive only** — nothing in this branch calls it from any route, job, or UI; `calculateStudioEstimate` (v3) and all older versions are untouched and remain live. |
| **Scope vs Configuration** | Canonical input finally separates estimator-owned physical **Scope** (`rooms[].pieces[]` geometry, `edgeFinishedLf`/`finishedEdgeLf`, `customLines[]`) from customer-owned mutable **Configuration** (`materialGroup`, `edgeProfile`, backsplash/side-splash/waterfall selections, sinks/cutouts/products, Vanity Program election), keyed by room id. A customer may change Configuration without touching approved Scope. |
| **Material** | Exact v4 Direct/Retail and Wholesale tables per group (Promo/A–F/Remnant) as specified — no Public Quote 25% markup. **Wholesale Remnant is $45/SF** (aligned with Internal Estimate `quoteCalculator.js` / `PROTOTYPE_TIER_PRICE_PER_SQFT`). 2% material use tax on stone only (countertop/backsplash/side-splash/waterfall-leg material) — never sinks, faucets, products, or any labor. Measured vs. billed SF returned separately. |
| **Rate source** | `resolveElite100MaterialRatePerSf` accepts an optional pre-resolved `pricingContext.materialRateOverrides.{direct_retail\|wholesale}` map (a Pricing-Admin injection seam) and otherwise uses this module's exact fallback table; an unresolved group falls back to Group Promo's rate rather than 0. `pricingConfigResolver.js` is **not** wired directly — its own header states it is unused until parity passes, and its fallback tables mirror the legacy (pre-v4) tiers, which conflict with the v4 Remnant Wholesale value above. Every room and the snapshot record a `rateSource` (`elite100_v4_fallback_table` / `pricing_admin_override` / `watts_trusted_promo` / `elite100_v4_fallback_default_promo`) for audit. |
| **Edges** | Exactly 5 included profiles (Eased, Large Eased, Full Bullnose, Large Ogee, Bevel) at $0/LF and 3 upgraded profiles (Small Ogee, Crescent, Knife) at a flat **$15/LF regardless of pricing basis**. New customer-safe output never emits W/D edge tokens; legacy W/D remains loadable for historical estimates only via existing `studioEdgeAuthority.mjs` (not used by v4 pricing). |
| **Miters** | Unchanged existing rates by configuration key: 2–3in $65/LF, 4in $70/LF, 5in $75/LF, 6in $80/LF — independent of decorative edge profile. |
| **Waterfalls** | Fully implemented — derived width (piece depth for ends, piece length for front/back) × leg height ÷ 144 measured SF, priced at the room's material rate with the same 2% material tax, $600 labor per leg, $225 optional backside polish, miter LF = width ÷ 12 at the room's approved miter rate. Multiple waterfalls per piece (opposite ends, independent leg heights) and across multiple pieces are supported. The old 15/LF waterfall shortcut is not used, and no waterfall path in v4 is left "unresolved" — a waterfall referencing an unknown piece is reported as a structured `unresolved` entry instead. |
| **Vanity Program** | Full 14-row 2026 bundle table (both kitchen-SF tiers), gated on table width/single-double, 22.5in depth, and Promo/qualifying-remnant material; kitchen SF ≥ 35 selects the lower column (exactly 35 included), else the higher column. Non-qualifying vanities price as an ordinary countertop room (top + backsplash + side splashes, per-sink cutouts/products, upgraded edge) — never a special "Kansas" or "purchased-material" path. Additional trip is a flat $150 add. |
| **Custom lines** | Reuses `studioCommercialLines.mjs`'s existing role vocabulary — `normalizeElite100CustomLine` accepts an explicit `commercialRole` or infers one from `kind`/`customerFacing` (matching legacy inference). Customer-facing lines appear as separate line items; a hidden customer-impacting charge increases the customer total but is folded into the room's (or estimate-level) Countertop Material presentation line and is never taxed as stone; internal-only and absorbed roles never affect the customer total. |
| **Accounts** | Trusted-ID-only rules (never inferred from customer name): Watt's forces Promo to $40/SF (other groups unaffected); Spahn & Rose adds 3% to the fully-taxed, fully-priced customer total as a separate internal-only adjustment line, never exposed to the customer payload. |
| **Rounding** | Exact cents preserved throughout (room totals, estimate totals, snapshot). Only the single top-level customer **display** total rounds up once to the next $10; room lines and individual material/tax lines are never independently rounded. |
| **Snapshot** | Every calculation returns an immutable snapshot recording calculator identity/version, calculation time, price-book basis, per-room rate sources, the full rate/edge/miter/waterfall/cutout/Vanity Program tables actually used, account-rule result, exact + display totals, warnings, and unresolved items — sufficient to reproduce the calculation after future catalog changes. `result.customerFacing` is a second, stripped projection with no wholesale rates, internal markup, internal-only/absorbed costs, or account-rule identifiers. |
| **Studio adapter** | `elite100RoomPricingStudioAdapter.mjs` translates an existing Studio scope (the same object `calculateStudioEstimate` v3 consumes) into the new canonical contract and is the only place that splits Studio's blended scope/configuration blob. It is exercised only by its own tests in this branch — no route, job, or UI calls it. Known legacy approximations (one estimate-wide edge LF/profile, one estimate-wide add-on map, no explicit Vanity Program election) are resolved via documented defaults and adapter warnings, never silent guesses; vanity rooms default to ordinary pricing (`useStandardPricing: true`) unless explicitly opted into the bundle. |
| **Legacy** | `quoteCalculator.js`, `studioEstimatePricing.mjs` (v3), and all saved/published historical snapshots (pricing versions 1–3) are unmodified and unreinterpreted — confirmed by rerunning their existing test suites unchanged. |
| **SQL** | None. |
| **Tests** | `eos:test:elite100-authoritative-calculator` (new — material, edges, miters, waterfalls, backsplash/side-splash, cutouts/products, Vanity Program, custom lines, account rules, rounding, versioning, Studio adapter). Also reran `eos:test:studio-estimating-parity`, `eos:test:pricing-authority`, `studioEstimatePricing.test.mjs`, `eos:test:room-scoped-edge-pricing`, and the Digital Estimate pricing/configuration suites touching shared modules — all pass unchanged. |
| **Deferred** | Estimator UI wiring; Digital Estimate wiring; a real Studio Vanity Program election field; Pricing Admin parity verification for the v4 material table (the injection seam exists, but nothing calls `pricingConfigResolver.js` for v4 yet). |

---

### 189. Elite 100 Estimate Studio wired to the authoritative calculator — `pricingVersion` 4 active (2026-07-27)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-27 · `feature/elite100-studio-calculator-wiring` |
| **Decision** | Studio's default calculation path is switched from the legacy v3 calculator (`studioEstimatePricing.mjs`) to the §188 authoritative calculator via a new bridge, `calculateStudioEstimateV4` (`elite100RoomPricingStudioAdapter.mjs`), now `studioEstimateService`'s default `calculateImpl`. Every new Studio calculate/approve/publish reports `pricingEngine: "elite100-room-pricing-v1"`, `pricingVersion: 4`. Manual start and AI-assisted (Shared Inbox → Takeoff) start both normalize into the same canonical Scope before pricing — no second estimator UI, no second calculator. `studioEstimatePricing.mjs` (v3) is untouched and remains loadable for historical snapshots only. |
| **Canonical Scope quantity** | Added `quantity` (default 1, min 1) to the manual piece contract (`studioManualPhysicalScope.mjs` `normalizeManualPiece` + fingerprint) and the Manual Scope editor UI. The adapter derives dimensions-mode measured SF as `lengthIn × depthIn ÷ 144 × quantity`; a stored/legacy `sqft` is never trusted over valid dimensions. `direct_area` mode remains an explicit, unmultiplied absolute override. AI Takeoff-seeded pieces carry no quantity field of their own — the adapter defaults them to 1, exactly like manual entry, until the estimator sets one. |
| **v4 bridge shape** | `calculateStudioEstimateV4` calls `calculateElite100StudioEstimate` and wraps the v4 result into the existing v3-shaped `calculationSnapshot` (`totals.exactInternalTotal`/`customerDisplayTotal`, `fabrication.*`, `warnings`, `unresolvedItems`) so `studioEstimateService`, the read model, and Publish needed no shape changes; a new `elite100` key carries the full v4 room/snapshot/customer-safe evidence for diagnostics only. |
| **Two pre-existing Publish bugs found and fixed** | (1) `studioEstimateService` had no `getById`, so one-step Publish's `prepareEstimateForPublish` always threw `estimate_not_found` before ever calculating. Added `getById(organizationId, estimateId)` (active-revision-guarded, same pattern as `refreshScopeFromTakeoff`). (2) `prepareEstimateForPublish`'s manual-scope auto-confirm step called `confirmManualScope` without `confirm:true` (always threw `confirm_required`) and assigned its `{ estimate: safeManualView(...) }` wrapper directly to the local `estimate` variable instead of unwrapping it. Fixed to pass `confirm:true` and reload the full read model via the new `getById`. Both were already present on `main` before this branch (not introduced by this work) and were silently blocking one-step Publish for every manual estimate; caught by the new integration suite below, not by inspection. |
| **Diagnostics, not redesign** | `EstimateScopePanel.tsx` gained a collapsed "Advanced — pricing engine diagnostics" block (engine/version/fingerprint) and a visible `unresolvedItems` list. No gate buttons restored, no wholesale/formula exposure, Scope/Customer Choices/Review & Publish sections unchanged. |
| **Legacy / revision safety** | Editing an **approved** estimate's Scope opens a new revision (`createRevisionFrom`), preserving the prior frozen `calculationSnapshot`/`approval` unchanged on the now-superseded row. Editing a **priced-but-unapproved** estimate clears that same row's snapshot in place instead. Historical pricingVersion 1–3 snapshots load unchanged — not recomputed, not relabeled. |
| **SQL** | None — reuses existing `studio_estimates.scope_json` / `calculation_snapshot` JSON columns. |
| **Tests** | `eos:test:elite100-studio-calculator-wiring` (new, 27 assertions: manual + AI-assisted paths, parity between equivalent starts, calculation lifecycle incl. stale/approve/revision-on-approved-edit, Configuration mapping — material override/edge/cutouts/custom lines/trusted account, publish incl. unresolved-items blocking, legacy v3 compatibility). Reran unchanged: `eos:test:elite100-authoritative-calculator`, `eos:test:elite100-simplified-workflow`, `eos:test:studio-manual-estimate`, `eos:test:studio-manual-physical-scope-authority`, `eos:test:studio-manual-room-open-edge`, Takeoff import/approval-gate suites, `eos:test:studio-estimating-parity`, `eos:test:live-digital-estimates`, all Studio↔Digital-Estimate publish suites, `eos:test:estimate-lifecycle-closeout`, `eos:test:studio-active-revision-guard`, `eos:test:studio-golden-path-gate` (includes the Studio frontend build), and `npm run eos:check:local`. |
| **Deferred** | Digital Estimate customer-choice UI expansion (waterfall/sink/faucet/side-splash/Vanity Program controls); Pricing Admin rate-table parity for v4 (injection seam only, per §188). |

---

### 190. Presentation-ready Studio estimating flow — standalone manual create + legacy-gate cleanup (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/studio-presentation-flow` (base includes merged PR #95 §188 and PR #96 §189) |
| **Decision** | The normal estimator path is now demonstrable end-to-end without touching the legacy workflow state machine: **+ New Estimate → Scope → Customer Choices → Review & Publish**, all on `pricingEngine: "elite100-room-pricing-v1"` / `pricingVersion: 4`. No pricing formula, AI extraction, Outlook/Graph, QuickBooks, Moraware, email, acceptance, or sold-lifecycle code changed. |
| **Top-level nav** | `StudioApp.tsx` primary nav is unconditionally `Inbox`, `Estimates`, **`+ New Estimate`** — the button is a sibling of Inbox/Estimates (not gated by `mainNav`, not inside the `More` dropdown), so it is visible from both pages. |
| **Standalone manual create** | Reused `createStudioManualEstimateService.createManualEstimate` (existing route, `POST /api/elite100-estimate-studio/manual-estimates`, `requireAuth` + `requireHeadAccess` + org-scoped, Idempotency-Key required) — no new API surface. `buildInitialManualScope` now seeds one included **Kitchen** room with one included **Countertop** piece (`quantity: 1`, dimensions mode) instead of an empty room array, and normalizes/persists the requested `pricingBasis` (`direct` / `wholesale`, default `wholesale`) onto `scope.pricingBasis`. Response already carried `openTarget: "manual-scope"`; the case is created with `sourceType: "manual"`, no attachment, no mailbox identity, `takeoffJobId: null` — AI Takeoff is never created or enqueued. |
| **New Estimate UI** | `ManualEstimateWizard.tsx` gained a `skipChooser` prop that opens straight into the manual-create form (bypassing the plans/no-plans chooser) plus Email, Phone, and a Pricing basis select. Header action renamed Close → **Cancel**; submit renamed Create draft → **Create Estimate**. `StudioApp.tsx` renders one instance with `skipChooser`, wired to its own `+ New Estimate` state; `onCreated` sets `workspaceFocus("scope")` and opens the estimate workspace directly — never Inbox or a legacy queue. Existing busy-guard (`if (busy) return`) and inline error banner (`data-testid="new-estimate-error"`) prevent double-submit and surface failures. |
| **Scope / AI-assisted parity** | No changes to `EstimateTakeoffWorkspace.tsx`'s single shared `EstimateScopePanel` — manual and AI-assisted estimates already edit dimensions through the identical `updateScope()` contract, autosave, and v4 recalculation with no separate Takeoff-approval button on the normal path (confirmed by the new suite, not newly built). |
| **Customer Choices** | Per-category customer catalog permission checkboxes (`eq-catalog-permissions`) moved inside a collapsed `<details data-testid="eq-compat-catalog-permissions">Advanced — … (compatibility)</details>`. The normal view now shows a fixed summary (`data-testid="eq-customer-selections-summary"`): *"Customer selections. The customer can choose active Elite 100 materials and currently supported catalog options. Pricing is calculated from the approved Scope."* No estimator-approval language. Underlying `customerCatalogPermissions` storage and legacy generic-product warning are unchanged for existing publish code. |
| **Review & Publish / legacy gates** | `Calculate Estimate` / `Approve Estimate` were already collapsed under `eq-compat-calc-approve` (§187); this hotfix only added the regression suite proving they never render outside that wrapper and that the primary copy states no separate Calculate/Approve click is required. Publish (`publishDigitalEstimate` / `prepareEstimateForPublish`, unchanged) still auto-confirms manual Scope, calculates, approves, and publishes as one click. |
| **Legacy safety** | No historical-row code path touched. Pricing-version 2/3 `calculationSnapshot`s continue to load via `safeEstimateView` with their original `pricingEngine`/`fingerprint`/totals verbatim (re-verified by the new suite, not re-implemented). |
| **SQL** | None — reused existing `studio_estimates.scope_json` / `quote_intake_cases` JSON persistence. |
| **Tests** | `eos:test:elite100-studio-presentation-flow` (new, 15-point suite combining `.tsx` source assertions with in-memory-repository service calls). Reran unchanged: `eos:test:elite100-authoritative-calculator`, `eos:test:elite100-studio-calculator-wiring`, `eos:test:elite100-simplified-workflow`, `eos:test:studio-manual-estimate`, `eos:test:studio-manual-physical-scope-authority`, `eos:test:studio-manual-room-open-edge`, `eos:test:studio-manual-estimate-cors`, `eos:test:live-digital-estimates`, `studioEstimateDigitalEstimate.configurePublish.test.mjs`, `studioFinishedEdgeOverridePublish.test.mjs`, `studioEstimateDigitalEstimate.publishFix.test.mjs`, the Studio frontend build, and `npm run eos:check:local`. |
| **Deferred** | Everything already deferred in §187–§189 (Digital Estimate customer-choice catalog expansion, Pricing Admin v4 rate parity, Vanity Program election UI). |

---

### 191. Studio consolidated into one active estimating flow — legacy workflow fully removed from active rendering (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/studio-single-active-flow` (base: merged PR #97, includes §187–§190) |
| **Decision** | §190 collapsed most legacy *controls* but the production Scope/Customer Choices/Review & Publish screen still **simultaneously rendered** a second legacy read model (duplicate zero-value Scope summaries, a legacy Takeoff/Estimate-status/Calculation/Approval metadata strip, and a v3-shaped Review panel) alongside the new simplified flow. This is a **deletion-from-active-rendering** pass, not a new workflow: for every active manual/AI-assisted estimate exactly one estimator workflow renders — **Scope → Customer Choices → Review & Publish** — with all legacy read models either deleted or moved into collapsed `<details>` compatibility blocks that a normal estimator never has to open. |
| **Competing Scope read path (the 46.25 SF bug)** | `EstimateScopePanel.tsx` independently loaded/rendered "Confirmed physical scope", "Approved physical scope", and a duplicate "Rooms / measured scope" editor, each reading a **stale** `countertopSqft`/edge/backsplash snapshot instead of the canonical `ManualPhysicalScopeEditor` state — so the editor could show `46.25 SF` while an adjacent summary showed `0`. All of these were deleted (not CSS-hidden). The canonical `ManualPhysicalScopeEditor` (generalized with a `scopeMode: "manual" \| "ai_assisted"` prop) is now the **only** Scope editor/summary for both manual and AI-assisted estimates; its saved values are what reload, the Scope summary, readiness, calculator mapping, Review & Publish, and the frozen publish snapshot all read. Verified end-to-end with the exact bug-report scope (sink run 120×25.5 + island 60×60 + open edges 10+20 LF + backsplash 120×4 + one kitchen sink opening) → canonical `buildStudioScopeBilling`/`resolveScopeEdgeLinearFeet` report **46.25 SF countertop, 30 LF open edge, 3.33 SF backsplash, 1 sink opening**, with no second reader disagreeing. |
| **Second wiring bug found and fixed (backsplash always priced $0)** | `elite100RoomPricingStudioAdapter.mapStudioScopeToElite100Configuration` already derived `backsplash.selected: true` from `room.includeBacksplash`, but `mapStudioScopeToElite100Scope` never passed the matching `backsplashEligibleRunLengthIn` physical fact the calculator needs to price it — so `elite100RoomPricingCalculator` always fell through to `backsplash_run_length_unresolved` and a $0 backsplash line for **every** Studio v4 estimate, manual or AI-assisted, regardless of this branch's UI work. Fixed by wiring `room.backsplashMeasuredLengthIn` into `backsplashEligibleRunLengthIn` in the Scope mapper, using the exact same `roomHasBacksplashSelected()` predicate the Configuration mapper uses, so the two mappers can never disagree about which rooms price backsplash. No calculator formula changed. |
| **Active-vs-historical detection** | Unchanged/reconfirmed, not reinvented: a row is historical when it carries a frozen `calculationSnapshot.pricingVersion` of 2 or 3 (or an `approval` snapshot referencing one) — never inferred from "a calculation exists yet" (a brand-new active estimate has none). `safeEstimateView` continues to surface historical `pricingEngine`/fingerprint/totals verbatim; no historical row's snapshot is touched by this branch. |
| **AI-assisted Scope** | `refreshTakeoffGate` (already relaxed pre-branch) only forces `needs_takeoff_approval` when there is genuinely no usable Takeoff result yet (`hasUsableTakeoffResult` false) — never once rooms/pieces exist, and never for manual estimates. `ManualPhysicalScopeEditor` mounts in `scopeMode="ai_assisted"` for takeoff-authority estimates: same editable Scope contract as manual, "Confirm Manual Scope" hidden (AI-assisted has no separate confirm step), saves route through the same `updateScope()` the manual path's `saveManualScopeDraft` delegates to. Derived AI state is exactly the three the spec calls for (`AI Takeoff processing` / `AI-assisted Scope ready for estimator review` / `Scope saved`) — no debug block, raw HTTP status, approval-request payload, or "Approved" button gating readiness. |
| **Autosave/calculation** | `studioEstimateService.calculate()` auto-confirms a valid manual Scope inline and seeds/advances AI-assisted Scope — no Scope-confirmation, Takeoff-approval, "Calculate Estimate", or "Approve Estimate" click is required for a normal calculation; unresolvable Scope returns specific `unresolvedItems` (material group required, no included measured pieces, unresolved product price) instead of a legacy workflow-state error. Verified by calling `calculate()` directly with zero prior confirm/approve calls in the new regression suite. |
| **Customer Choices** | Unchanged from §187 (Advanced Pricing already collapsed) plus this branch's own consolidation: Account Directory linking, trusted-partner selection, tear-out/estimator-controlled services, customer charges/discounts/credits, internal-only/absorbed costs, miter/buildup, estimator notes, and the troubleshooting Save controls all live in one collapsed `data-testid="eq-advanced-estimator-pricing"` **Advanced estimator pricing** section. The per-category catalog-permission whitelist (§190) remains separately collapsed. Normal view keeps exactly customer/company, contact, email, phone, project, address, pricing basis, material group, exact color, room overrides, canonical edge profile, and the concise "Customer selections" summary. |
| **Review & Publish** | New `reviewSummary` aggregate on `calculateStudioEstimateV4`'s return (`elite100RoomPricingStudioAdapter.buildActiveReviewSummary`) rolls up already-computed customer-facing line items (countertop material, backsplash, material-use tax, fabrication/add-ons) — a display rollup only, never a second pricing path. `EstimateScopePanel`'s Review & Publish panel binds to it directly instead of showing v3-shaped `$0.00`s. New `studioActiveReviewReadiness.deriveActiveReviewPublishReadiness` (pure, client-evaluated) replaces legacy workflow-state blockers with real actionable ones (`Customer email required`, `Project name required`, `Material group required`, `No included countertop pieces`, `Product price unavailable`) fed into `EstimateDigitalEstimatePanel` via a new `activeReadinessOverride` prop. The `E. Digital Estimate` heading is removed and its "Configuration envelope" section (Rooms locked for customer / Pricing valid through / Customer may choose) is collapsed into an Advanced/compatibility `<details>` — Publish itself still runs the same `publishDigitalEstimate` orchestration (flush → validate → calculate v4 → verify fingerprint → internal approve → freeze exact + customer-safe snapshots → publish) unchanged. |
| **Top workspace status** | `studioSimplifiedWorkflow.deriveActiveWorkspaceStatus` now drives a plain four-status bar in `EstimateTakeoffWorkspace` — **Source** (Manual / AI-assisted), **Scope** (Needs measurements / Ready / Saved), **Pricing** (Waiting for required choices / Updating / Updated / Needs attention), **Publication** (Not published / Published / Customer viewed / Changes requested / Accepted / Sold) — replacing "Takeoff queued", "Manual scope needs confirmation", "Commercial estimate not calculated", "Approval not approved". Display-only; no new persistence state machine. |
| **Legacy status strip found and collapsed** | `EstimateScopePanel`'s Scope tab additionally rendered its own older status block ("Takeoff" / "Estimate status": *Takeoff worksheet needs review* / *Commercial estimate not approved* / *Commercial estimate not calculated*; plus Calculation/Approval/Persistence) directly beside the new four-status bar and the canonical Scope hint — the exact "legacy workflow mixed into the tab" pattern this hotfix targets. Moved into a collapsed `data-testid="eq-compat-estimate-status-meta"` **Advanced — legacy estimate status (compatibility)** block (kept for troubleshooting/tests); the one AI/manual state line ("AI Takeoff is still preparing…" / "Scope draft ready…") stays visible outside it. Relabeled the remaining compatibility-only strings off the forbidden vocabulary (e.g. "Not yet calculated" / "Priced — legacy approval pending" / "Legacy approval recorded" / "Awaiting Takeoff data"). |
| **Historical compatibility** | Unchanged and re-verified: pricingVersion 2/3 snapshots load with original engine/fingerprint/totals/publication history, never recalculated or relabeled `v1`/`4`. |
| **SQL** | None — no schema or migration changes. |
| **Tests** | Extended `eos:test:elite100-studio-presentation-flow` (18 sections; added #16 the exact 46.25 SF/30 LF/3.33 SF/1-opening regression scope autosave→reload→calculate→publish with zero prior Confirm/Calculate/Approve calls, #17 AI-assisted single-dimension edit changes the v4 total with Takeoff review still `pending`, #18 all 12 forbidden legacy strings absent from `EstimateScopePanel`/`EstimateTakeoffWorkspace`/`EstimateDigitalEstimatePanel`). Reran unchanged and passing: all 45 `backend-core/src/elite100EstimateStudio/*.test.mjs` files, `eos:test:elite100-authoritative-calculator`, `eos:test:elite100-studio-calculator-wiring`, `eos:test:elite100-simplified-workflow`, the Studio frontend build, and `npm run eos:check:local`. 19/21 frontend `*.ui.test.mjs` files pass; the remaining 2 (`milestone2.openEstimate.ui.test.mjs` `eliteos-takeoff-approved`, `studioShellAndEmailSync.ui.test.mjs` `command-center` useState) were confirmed failing identically against the clean §190 merge commit (`0da6e1b`), i.e. pre-existing and unrelated to this branch. |
| **Deferred** | Everything already deferred in §187–§190. Backsplash pricing now reaches a real dollar amount (previously silently $0 for all Studio v4 estimates) but still uses the existing Direct/Retail/Wholesale material rate table — no new pricing policy. |

### 192. Review & Publish correction pass — server-side publish gating, dedicated active-v4 panel (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/studio-single-active-flow` (same branch as §191, second commit) |
| **Decision** | §191 built `studioActiveReviewReadiness.deriveActiveReviewPublishReadiness` but only wired it in **client-side**, as an `activeReadinessOverride` prop the legacy `EstimateDigitalEstimatePanel` used to *decide* Publish eligibility — meaning a stale or tampered browser state could, in principle, control whether Publish was offered. This pass makes the same function the **server** authority instead: the frontend now only ever *displays* a server-returned verdict, and a distinct `ActiveReviewPublishPanel` (not the legacy panel) is the only Review & Publish surface mounted for an active-v4 estimate. |
| **Server-side readiness authority** | `deriveActiveReviewPublishReadiness` (unchanged logic) is now called from exactly two backend sites, both importing it from `studioActiveReviewReadiness.mjs`: (1) `studioEstimateService.safeEstimateView()` attaches the verdict as `estimate.activeReview` (and `estimate.isActiveSimplifiedEstimate`) to every estimate read — GET estimate, GET `.../digital-estimate`, and the return value of `updateScope`/`calculate`/`approve`; (2) `studioSimplifiedWorkflow.prepareEstimateForPublish()` calls it again after its own fresh reload + recalculation and hard-rejects (`422`, exact blocker code/message) before the internal `approve()`/`digitalEstimateService.publish()` steps run. The publish request body is never read for Scope/Configuration/calculation/readiness state — only `{ confirm, idempotencyKey }` — so nothing a browser sends can influence the outcome. `activeReadinessOverride` is deleted from `EstimateDigitalEstimatePanel`'s props entirely. |
| **New `ActiveReviewPublishPanel`** | `app-elite100-estimate-studio/src/estimateQueue/ActiveReviewPublishPanel.tsx` is a new, dedicated component mounted only when `estimate.isActiveSimplifiedEstimate !== false`. It renders exactly: the server-supplied eligible/blockers verdict, active-publication status, the customer link (copy/open), and the Publish Digital Estimate button — nothing else. `EstimateScopePanel`'s Review & Publish mount point is now a hard, mutually-exclusive branch — `isActiveSimplified ? <ActiveReviewPublishPanel/> : <EstimateDigitalEstimatePanel/>` — never both, never one containing the other's markup even collapsed. Pricing status / v4 pricing summary / real warnings / real unresolved items / collapsed v4 pricing-engine diagnostics continue to live in the shared Review & Publish header above this branch (unchanged from §191). |
| **Legacy controls confirmed never mounted for active-v4** | The legacy Configuration envelope (Rooms locked for customer, Pricing valid through, per-category "Customer may choose" whitelist, Save configuration) exists only inside `EstimateDigitalEstimatePanel` — structurally unreachable from the active branch, not merely hidden. The legacy per-field Takeoff/Estimate-status/Calculation/Approval/Persistence status strip (`eq-compat-estimate-status-meta`) and legacy manual Calculate/Approve controls (`eq-compat-calc-approve`) live in `EstimateScopePanel.tsx` itself (shared file) and are gated by a runtime `{!isActiveSimplified ? (...) : null}` guard so they never mount — not even collapsed — for an active estimate; both compatibility blocks are preserved unconditionally for historical pricingVersion 2/3 rows, which still depend on them. |
| **Publish orchestration** | Unchanged from §191: flush pending autosaves → load authoritative server Scope/Configuration → calculate v4 → (new) verify server-side active-v4 readiness → run the existing internal compatibility `approve()` transition → freeze exact + customer-safe snapshots → publish → return the customer link. The estimator never sees or operates the internal compatibility transition. |
| **Historical compatibility** | Unchanged: `isActiveSimplifiedEstimate()` returns `false` only for a frozen `pricingVersion` of 2 or 3 (never for "no calculation yet"), so historical rows always get `activeReview: null` from `safeEstimateView()` and always resolve to the legacy `EstimateDigitalEstimatePanel` branch — verified directly, not just inferred. |
| **SQL** | None — no schema or migration changes. |
| **Tests** | Extended `eos:test:elite100-studio-presentation-flow` from 18 to 21 sections: #19 a forged/tampered publish request body (fake `activeReview: { eligible: true }`, forged `scope`/`calculation`) cannot make a genuinely ineligible estimate publishable, and produces byte-identical blockers to an untampered attempt; #20 the Review & Publish read endpoint and the publish orchestration both import `deriveActiveReviewPublishReadiness` from the same module and report identical blockers for the same estimate; #21 the legacy status/approval blocks in `EstimateScopePanel.tsx` are guarded by `!isActiveSimplified`, `ActiveReviewPublishPanel.tsx` contains none of the legacy-only markers at all, and those markers remain present in the historical panel. Section 15 extended with the `isActiveSimplifiedEstimate()` predicate contract (2/3 → historical; 4/null/unknown → active) plus asserting `activeReview: null` on loaded historical rows. Fixed three pre-existing test fixtures (`elite100SimplifiedWorkflow.test.mjs`, `studioCalculatorWiring.test.mjs` ×2) whose hand-rolled mock/seed estimates lacked a `customerEmail`, which the new server-side publish gate now correctly requires — these were testing unrelated orchestration behavior and needed a realistic customer email, not a gate change. Reran and confirmed still green: all 45 `backend-core/src/elite100EstimateStudio/*.test.mjs` files, the Studio frontend build, `node --check` on every modified file, and `npm run eos:check:local`. Same 2 pre-existing frontend `*.ui.test.mjs` failures as §191 (`milestone2.openEstimate.ui.test.mjs`, `studioShellAndEmailSync.ui.test.mjs`), reconfirmed unrelated to this change. |
| **Deferred** | Same as §191. |

### 193. Restore Takeoff-first AI estimating workflow (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/restore-takeoff-first-estimating` (base: merged PR #99 / `30cd27e`) |
| **Decision** | Emergency workflow correction: for **AI-assisted** estimates only, restore the production **Takeoff Review** iframe as the sole editable geometry workspace. Estimators Save draft → Approve Takeoff & Build Estimate in Takeoff Review; Studio then builds the verified estimate (refresh-from-takeoff + calculate v4) and shows a compact Measurements approved card with Publish Digital Estimate. Customer material/edge/sink/faucet/backsplash/accessory choices remain in the customer-facing Digital Estimate — not estimator tabs. |
| **AI surface** | `AiTakeoffFirstPanel` mounts `eq-takeoff-iframe` (`consolidated=1`). Does **not** mount `ManualPhysicalScopeEditor`, `EstimateScopePanel`, Scope / Customer Choices / Review & Publish tabs, `EstimateWorkflowHeader`, or legacy Calculate/Approve for AI cases. Manual estimates keep the existing three-tab workflow unchanged. |
| **Data-loss fix** | Studio AI-status poll updates **displayStatus labels only** — never bumps `scopeRefreshKey`, never remounts the iframe, never replaces rooms/pieces. Takeoff Review already refuses poll-driven `loadWorkspace` when dirty; adds `beforeunload` when dirty. `ManualPhysicalScopeEditor` also skips poll-driven reloads while dirty (manual path belt-and-suspenders). |
| **Approval handoff** | `eliteos-takeoff-approved` postMessage → get/create estimate → `refresh-from-takeoff` (`force`/`confirm`) → `calculate` (pricingVersion 4) → compact summary. Publish uses existing `simplified-publish` + server readiness. |
| **Shared Inbox** | Unchanged: `startSharedInboxEstimate` still sends `{ confirm: true, forceManual, idempotencyKey }`. |
| **SQL / formulas** | None. No calculator, rate, tax, Graph, or AI extraction changes. |
| **Tests** | `takeoffFirstWorkflow.ui.test.mjs`; updated presentation-flow / milestone2 / milestone7 / takeoffPostMessageOrigins / simplified-workflow source contracts for Takeoff-first AI. |


### 194. Fix automatic Takeoff approval handoff (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/takeoff-approval-handoff` (base: merged PR #100 / `ad7b8b8`) |
| **Decision** | Narrow production defect: after **Approve Takeoff & Build Estimate**, Studio must automatically build the verified estimate without a browser refresh, and must never show a zero-value “Measurements approved” card when `refresh-from-takeoff` fails. |
| **Backend 500 cause** | `refreshScopeFromTakeoff` rebuilt the import payload via `buildTakeoffImportPayload` **without** `ignoreApprovalGateBlockers: true`. Consolidated approval already passed hard blockers with that flag; re-running `evaluateTakeoffApprovalGate` then threw bare `VALIDATION_ERRORS` / QA blockers (no `statusCode`) → route mapped to **HTTP 500**. |
| **Backend fix** | Load Takeoff workspace **once**; prefer frozen `latest.importPayload` from approval; otherwise rebuild with `ignoreApprovalGateBlockers: true` when already approved; map missing/lagging latest result to structured **409** `takeoff_result_not_ready` (`retryable: true`), never a generic 500. Approval requirement (`assertTakeoffApproved`) unchanged. |
| **Frontend fix** | `AiTakeoffFirstPanel`: keep Takeoff iframe mounted during handoff with overlay “Measurements approved. Building verified estimate…”; set `measurementsApproved=true` only after refresh + calculate return a measured Scope; auto-retry retryable 409s; bounded status-poll fallback for missed postMessage; Retry button on permanent failure; never render zero-value approved summary on failure. |
| **SQL / formulas** | None. |

### 195. Digital Estimate identity is optional for publish (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/make-digital-estimate-identity-optional` |
| **Decision** | Publishing a secure Digital Estimate link must **not** require customer name, customer email, project name, or project address. Those fields are optional metadata. A recipient email is required only for an explicit future “Send by email” action — not for Publish, Copy Customer Link, Open Customer Preview, or republish. |
| **Authoritative blockers** | Approved physical Scope, valid calculation, and unresolved pricing remain authoritative. Legitimate blockers include: no measured geometry / no included pieces, unresolved pricing items, required material-group / pricing-basis facts, and missing valid calculation. |
| **Server** | `deriveActiveReviewPublishReadiness` no longer emits `customer_email_required` or `project_name_required`. Studio publication adapter no longer emits `customer_name_required` and does not call `validateProjectNameForPublication` as a blocking requirement for active Studio Digital Estimate publication. Blank `customerName` / `customerEmail` / `projectName` are accepted; no fake identity is invented. |
| **Customer-facing title fallback** | `resolveCustomerFacingEstimateTitle`: real project name → plan filename → Studio quote number (`SE-…`) → `"Digital Estimate"`. Never exposes an internal UUID. Historical frozen v2/v3 publications continue loading unchanged. |
| **Frontend** | `AiTakeoffFirstPanel` removes the “Required to publish” project/email form; does not call `/project-details` before publish; Publish enables from server `activeReview.eligible` only. Compact approved card: verified measurements, starting total, Edit measurements, Publish Digital Estimate (+ Copy/Open after publish). |
| **SQL / formulas** | None. |
| **Tests** | `studioIdentityOptionalPublish.test.mjs`, `aiTakeoffIdentityOptional.ui.test.mjs`; updated presentation-flow, publish-fix, project-details, workspace-workflow, and AI panel contracts. |

### 196. Activate Studio Digital Estimate customer experience (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `hotfix/activate-studio-digital-estimate` |
| **Defect** | Studio simplified-publish returned a customer URL whose v1 baseline rendered, but v2 session exchange returned `lifecycle=blocked` with no active configuration envelope (document-only). `App.tsx` then showed **“This estimate is unavailable.”** together with the frozen read-only estimate (totals disclosure: frozen at publication). |
| **Root cause** | `AiTakeoffFirstPanel` / `ActiveReviewPublishPanel` call simplified-publish with `{ confirm }` only. Empty `configuration` made `configurationIntendsCustomerConfigure` false → publish skipped envelope activation (`document_only`). |
| **Fix** | `resolveSimplifiedPublishConfiguration` defaults active Studio simplified-publish to interactive permitted choice groups (material/color, edge, sink, faucet, backsplash, accessories, specialty, cooktop, side splash) unless explicitly document-only. Public loader never pairs the generic unavailable banner with a loaded estimate; blocked/no-envelope baseline uses a retryable configuration message. |
| **SQL** | None. |
| **Tests** | `studioSimplifiedPublishActivatesDigitalEstimate.test.mjs` (+ existing configure-publish / availability contracts). |

### 197. Consolidate active AI estimator workflow (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `fix/consolidate-ai-estimator-workflow` |
| **Decision** | Active AI-assisted estimates mount one `AiEstimatorWorkspace` driven by `deriveAiEstimatorStage`. Processing/draft/revision_draft use the existing Takeoff Review iframe; approved/published use compact cards. No Scope/Customer Choices/Review tabs, ManualPhysicalScopeEditor, or EstimateDigitalEstimatePanel on the AI path. Edit Measurements opens `open-measurement-revision` (createRevisionFrom) so R1 is preserved and R2 preloads prior geometry. |
| **Protected path** | Shared Inbox → Takeoff → approval handoff → v4 calculate → simplified-publish (interactive envelope) → public configure — contracts locked in `aiEstimatorGoldenPath.contract.test.mjs`. |
| **SQL** | None. |
| **Tests** | Golden-path lock, stage derivation, openMeasurementRevision, workspace tree, acceptance e2e (initial + revision). |

### 198. AI estimator operational depth (derived summary + verification surfaces) (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `fix/consolidate-ai-estimator-workflow` |
| **Decision** | Keep the single-stage AI workspace. Add a derived `estimate.aiEstimatorSummary` read model (no SQL / no duplicate persistence) and display-only verification components: room-by-room scope, typed openings, customer-safe starting price groups, publication activity from existing safe publication summary, and R1↔R2 measurement comparison. Draft/revision continue to mount the real Takeoff Review iframe (`consolidated=1`). Cutout regression proves one kitchen sink → one $200 charge and one vanity/bar → one $100 charge in the customer-impact total; duplicate labels on the public Digital Estimate (if any) are treated as display grouping until a calculator double-charge is proven. |
| **Why** | Consolidation removed competing tabs but left approved/published cards too shallow for real estimating work. Depth belongs inside the existing stages, not new workflow branches. |
| **SQL** | None. |
| **Impacted** | `studioAiEstimatorSummary.mjs`, `studioEstimateService.safeEstimateView`, `AiEstimatorWorkspace.tsx`, `AiEstimatorReadViews.tsx`. |
| **Revisit trigger** | Public DE shows both a configuration sink-cutout option line and a fabrication Cutouts line that double the customer total; then fix calculator or publish snapshot grouping with a proven defect. |

### 199. Measurement revision publish lifecycle + cutout display aliases (2026-07-28)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-28 · `fix/consolidate-ai-estimator-workflow` |
| **Decision** | Opening a measurement revision creates a sibling draft (R2) **without** superseding the prior approved/published estimate row (R1). R1 remains the active customer publication target through R2 draft and R2 approval. Only a **successful** R2 Digital Estimate publish supersedes older family estimate rows. Failed R2 publish leaves R1 + its customer link intact. Customer-visible cutout labels are canonical (`Kitchen sink cutout`, `Vanity/bar sink cutout`, `Cooktop cutout`, `Electrical outlet cutout`); alias pairs are collapsed in customer-safe projections without changing calculator amounts. |
| **Why** | Premature supersede at Edit Measurements broke the “R1 stays live until R2 publish” product contract. Duplicate cutout labels were display aliases, not double charges. |
| **SQL** | None. |
| **Impacted** | `createSiblingRevisionFrom` / `supersedeOlderRevisionsInFamily`, `openMeasurementRevision`, simplified-publish post-success supersede, `customerSafeCutoutPresentation.mjs`, customer-safe room lineItems, DE projection dedupe. |

### 200. Persistent AI Takeoff Review + countertop SF semantics (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `hotfix/persistent-ai-takeoff-review` |
| **Decision** | AI Takeoff Review stays mounted for every normal estimator stage (`editable` vs `readonly` mode). Approved/published stages show verified/publication cards **below** Takeoff — never replace it. `countertopSf` display totals exclude splash/fhb pieces; `backsplashSf` is splash-only; combined quantity is `totalBillableStoneSf` only when needed. Calculator adapter diagnostics (`opts.*`, internal room IDs, `qty-*` keys) are `internalDiagnostics` and must not appear in normal estimator UI warnings. Approved Takeoff cannot be mutated via save until Edit Measurements reopens the job (`reopenTakeoffJobForMeasurementRevision`). |
| **Why** | Production after PR #102 unmounted Takeoff after approval, inflated “countertop SF” by including backsplash, and surfaced adapter plumbing as estimator warnings. |
| **SQL** | None. |
| **Impacted** | `AiEstimatorWorkspace.tsx`, `ConsolidatedTakeoffReview.tsx`, `studioAiEstimatorSummary.mjs`, `estimatorWarningSafety.mjs`, `takeoffWorkspaceService.saveTakeoffCorrection` / `reopenTakeoffJobForMeasurementRevision`, `openMeasurementRevision`. |
| **Protected** | pricingVersion 4 formulas, material/tax/edge/waterfall/cutout rates, Vanity Program, trusted-account pricing, simplified-publish, public DE layout, historical v2/v3, SQL. |

### 201. Persistent Estimate Record + commercial controls (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `feature/estimate-record-commercial-controls` |
| **Decision** | The active AI estimator page is one **Estimate Record** with six always-mounted sections: Header, AI Takeoff Review, Verified Estimate, Commercial Configuration, Digital Estimate, Revision History. Stage changes editability and content — it does not remove sections. Custom lines are restored via existing `studioCommercialLines` / scope `customLineItems`. Estimate-wide percentage adjustment is server-authoritative and **distributed** across eligible customer-impact lines (same factor, not equal dollars); customers never see a separate surcharge line. Spahn trusted-account 3% consolidates into this single adjustment path (no stack with an identical manual 3%). Vanity Program remains estimator-qualified with Takeoff physical facts; waterfalls require approved geometry and use unchanged v4 rates ($600/leg, $225 polish, miter 65/70/75/80). Publish is inline (`type="button"`, no navigation); Takeoff `beforeunload` is suppressed in readonly mode. |
| **Why** | Post-consolidation UX still felt like a wizard; commercial tools (custom lines, %, Vanity, waterfall) and Digital Estimate status were missing from the persistent record; publish could trip Leave site? via Takeoff dirty beforeunload. |
| **SQL** | None. |
| **Impacted** | `AiEstimatorWorkspace.tsx`, `estimateRecord/*`, `studioEstimateWideAdjustment.mjs`, `studioCommercialConfiguration.mjs`, `elite100RoomPricingCalculator.mjs` adjustment path, `ConsolidatedTakeoffReview` beforeunload. |
| **Protected** | Takeoff persistence, approval rules, v4 formulas/rates, simplified-publish authority, public DE layout, historical v2/v3, manual estimates, SQL. |
| **Visual proof** | Static HTML fixtures retired. Local-only review harnesses mount production components (`review-estimate-record.html`, Takeoff `?localReview=1`, DE `review-digital-estimate.html`) under `.local/review/estimate-record-commercial-controls-v4/`. One coherent estimate family feeds all surfaces (Takeoff → Scope → calculation → commercial → publication → customer DE → revisions). Takeoff posts `TAKEOFF_REVIEW_READY` (revision, mode, room/piece counts, saved state); Playwright asserts iframe content and composites iframe pixels into full-page PNGs (cross-origin full-page captures are otherwise blank). Screenshot generation fails closed on blank iframes. Not production routes. |
| **Cross-surface authority** | Verified Estimate must include every included Takeoff counter piece (incl. Kitchen Island). Named totals: `baseExactTotal`, `commercialAdjustmentExact`, `adjustedExactTotal`, `customerDisplayTotal`, `customerConfiguredExactTotal`, `customerConfiguredDisplayTotal`. Customer preview shows base + after-% columns; public DE uses adjusted amounts with no surcharge line. Package codes like `37_S` are displayed as human labels. When R1 is published and R2 is draft, Digital Estimate keeps the R1 link and states that R1 remains active. Print document uses `.de-print-only` / `.de-print-root` hidden on screen. |
| **Waterfall ownership** | Takeoff revision owns physical waterfall geometry (room, related piece, side, panel width/height, quantity, included/excluded). Commercial Configuration references the approved waterfall id and owns only required-vs-optional, miter, backside polish, estimator note, and server price presentation — not editable width/height. Pre-approval messaging is lifecycle-aware (detected but unapproved ≠ absent). |

### 202. Unified estimate revision editing (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `hotfix/unify-estimate-revision-editing` |
| **Decision** | One estimator revision contains measurements + adjustments. Visible action is **Edit Estimate** (calls existing `open-measurement-revision`). Commercial save uses **PATCH** `/api/elite100-estimate-studio/estimates/:id` (`updateScope`) + calculate — never obsolete `POST …/scope`. Parent aggregates save status; section stays dirty and shows “Your estimate adjustments were not saved. Try again.” on failure. Section renamed **Estimate Adjustments** with Additional charges/credits, Account adjustment, Vanity Program, Waterfalls. No Crane $350 preset. Vanity bowl count derives from openings; package is a governed select. Island Takeoff offers Add left/right waterfall. **Approved/published/superseded/historical revisions are immutable** — Estimate Adjustments render read-only (no Save Draft / add/remove/reorder / editable % or Vanity/waterfall controls); `updateScope` returns **409 `estimate_revision_not_editable`** unless the target is the current editable draft. Account Adjustment presents server-derived reconciliation (`verifiedBaseExact`, eligible additional charges, basis, exact adjustment, non-% credits, updated exact, customer display) — never “Current customer total” for the verified base. Estimator-visible copy uses Edit Estimate / Editing Revision Rn / Approve\|Publish Revised Estimate (not “measurement revision”). |
| **Why** | Production 404 on commercial save; competing measurement/commercial revision UX; false Saved+Failed; implementation-oriented commercial UI; approved R1 still looked commercially editable in review; Account Adjustment labels made correct math look wrong ($156.66 vs $4,122). |
| **SQL** | None. |
| **Protected** | v4 rates/formulas, public DE design (except unified revision payload), trusted-account consolidation, historical v2/v3, manual estimates. |

### 203. Persistent live Estimate Workspace (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `hotfix/persistent-live-estimate-workspace` |
| **Decision** | The AI estimator is one persistent, live-calculating workspace. Takeoff iframe mount/src stays stable across draft save, calculate, approve, publish, and status polling (`data-stable-mount`). Editing an approved/published revision calls idempotent **`ensureEditableEstimateDraft`** (route `POST …/ensure-editable-draft`); `updateScope` transparently auto-forks to that sibling draft (`forbidAutoFork` keeps hard 409 for tests). Takeoff reopen is soft-fail — draft creation must not lock the estimator into an empty Takeoff. Approval is not required to calculate. One unified autosave/calculate state (Unsaved / Saving / Calculation updating / Saved / Save failed) with mutation-sequence stale-response ignore. **Live Estimate** always shows draft or frozen totals. **Estimate Options** (formerly Additional Lines / Estimate Adjustments) guides Additional charges and credits, Account adjustment, Bathroom Vanity Program, and Island waterfalls. Additional lines use Add line / Add Tear Out (crane is an ordinary line). R1 remains customer-active until R2 publish succeeds. |
| **Why** | Production revision-open failures remounted Takeoff into empty/processing, locked estimators between R1 and R2, and kept pricing/adjustments fragmented behind stage gates. |
| **SQL** | None. |
| **Protected** | v4 rates/formulas, tax, rounding, trusted-account semantics, public calculation/selection authority, historical v2/v3, manual estimates. |

### 204. Estimate Options guided estimator workflow (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `hotfix/persistent-live-estimate-workspace` |
| **Decision** | Commercial configuration UI is **Estimate Options** with four compact cards. Save status shows Saved / Saving… / Updating price… / Unsaved changes / Save failed; **Save now** is hidden when Saved. Additional lines use a compact empty state and table with advanced fields under **More options**; customer preview only when visible lines exist. Account adjustment is one horizontal control row plus server reconciliation when active (Spahn badge; no raw “manual”). Vanity is task-oriented: confirmed same-trip Takeoff facts do not re-ask; inferred trip needs Same trip / Separate trip; single package renders as text; Apply / Remove buttons; customer choices only after apply; current program price from server. Island waterfalls offer Add left/right that post `STUDIO_REQUEST_ADD_ISLAND_WATERFALL` into Takeoff; commercial options stay in Estimate Options; dimensions remain Takeoff-owned. Footer draft/display totals and card impacts use server/props values only. |
| **Why** | Persistent workspace + live calculation were in place, but the estimator-facing Additional Lines / Account Adjustment / Vanity / Waterfall UI exposed raw state, empty canvas, and contradictory save/trip controls. |
| **SQL** | None. |
| **Protected** | Calculator v4, taxes/rounding, trusted-account behavior, draft acquisition, revision lifecycle, autosave architecture, Takeoff persistence, Digital Estimate authority. |

### 205. Simplified Internal-Estimate live workspace (2026-07-29)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-29 · `hotfix/finish-studio-live-estimate-workspace` |
| **Decision** | Elite 100 Studio uses a **persistent simplified-Internal-Estimate workspace**: Takeoff stays mounted for the whole visit; draft pricing calculates before approval; estimator fields remain open after calculate; server totals update separately from the one local edit buffer; revisions are an invisible safety mechanism via idempotent coalesced `ensureEditableEstimateDraft`; Additional Lines use the Internal Estimate-style custom-line pattern with next-state payloads and a single alias boundary; Account Adjustment percentage typing is stable across save/calculate; **Vanity Program is one-click Add/Remove** with governed eligibility/price/customer selections from Takeoff facts + v4 calculation (no trip/confirmation/package/upgrade questionnaire); waterfall physical scope belongs to island pieces in Takeoff and projects through the canonical Takeoff-to-Scope mapper (`waterfallPanels` → piece + `roomConfigurations.waterfalls`); approval freezes snapshots; publication remains immutable and R1 stays customer-active until R2 publish succeeds. One coalescing workspace save queue owns persist→calculate (~600 ms debounce). Handoff overlay that obscured Takeoff is removed (inline status only). |
| **Why** | Production still remounted/obscured Takeoff, rehydrated commercial inputs from every calculate response, looped ensure-editable-draft/PATCH/calculate/refresh-from-takeoff, and overcomplicated Vanity/waterfall editing — preventing continuous estimating like Internal Estimate. |
| **Removed competing paths (must not return)** | Stage-gated Takeoff remount (`mode: takeoffMode` in iframe src); full-page `eq-takeoff-handoff-overlay`; `useEffect([props.commercial])` rehydrate of Estimate Options on every calculate; per-field ensure-editable-draft; commercial edits calling `refresh-from-takeoff`; Vanity trip/confirmation/package-picker/upgrade-category questionnaire; second waterfall geometry editor in Estimate Options; browser-trusted rates for Vanity/waterfall/account %; parallel commercial save systems. |
| **SQL** | None. |
| **Impacted** | `AiEstimatorWorkspace.tsx`, `CommercialConfigurationSection.tsx`, `EstimateRecordSections.tsx`, `workspaceSaveQueue.mjs`, `additionalLinesBoundary.mjs`, `workspaceHydration.mjs`, `estimateWorkspaceHeader.mjs`, `ConsolidatedTakeoffReview.tsx` (`TAKEOFF_REVIEW_DRAFT_SAVED`), `studioEstimateService.mjs` (draft coalesce, roomConfig merge, waterfall sync), `studioVanityProgramGovernance.mjs`, `studioCommercialConfiguration.mjs`, `elite100RoomPricingStudioAdapter.mjs`, `takeoffImportPayload.mjs`. |
| **Protected** | v4 rates/tax/rounding/edges/cutouts/miters/waterfalls/Vanity rates, trusted Spahn policy, public Digital Estimate authority, historical v2/v3, manual Internal Estimate, Quote Library, Shared Inbox, SQL, Moraware, QuickBooks. |
| **Visual proof** | Real-component review evidence under `.local/review/final-live-estimate-workspace/` (not committed). Harness may use production components + route/service calls when live auth cannot be automated; labeled limitation — not claimed as a production browser pass. |

### 206. Elite 100 Studio V2 Slice A — additive read-only command shell (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-slice-a` |
| **Decision** | Studio V2 Slice A is a **sibling** read-only estimator command shell beside V1. V1 `estimate-workspace` (`EstimateTakeoffWorkspace` → `AiEstimatorWorkspace`) remains the **default**. V2 mounts only when `VITE_ELITE100_STUDIO_V2_ENABLED=true` **and** `?studioV2=1`. Additive Brain routes under `/api/elite100-studio-v2/*` reuse existing v4 calculator, DE strict publish, and publication/activity read models. V2 calculate calls `calculateStudioEstimateV4` directly — **no** `ensure-editable-draft`, **no** `refresh-from-takeoff`, **no** scope mutation, **no** auto-fork. V2 publish is strict approved-only via `studioDigitalEstimateService.publish` — **never** `simplified-publish`. No schema migrations; no live Takeoff editing; no approval/scope editing in Slice A. |
| **Why** | Replace broken V1 estimator workspace orchestration with a clean shell while preserving proven pricing, publication, and identity systems. |
| **SQL** | None. |
| **Impacted** | `elite100StudioV2Routes.js`, `studioV2Service.mjs`, `studioV2WorkingDraft.mjs`, `studioV2Errors.mjs`, `studioV2SliceA.test.mjs`, `StudioV2EstimatorShell.tsx`, `StudioApp.tsx` (flagged mount), `quoteRoutes.js` (mount), `package.json` test script. |
| **Protected** | V1 Studio routes/behavior, `elite100RoomPricingCalculator`, `calculateStudioEstimateV4` math, Digital Estimate public routes, Takeoff geometry, Quote Library / sold APIs, historical v2/v3. |
| **Revisit trigger** | Slice B+ adds scope editing, approval, or Takeoff embed — must keep V1 default until cutover is explicit. |


### 207. Elite 100 Studio V2 Slice B — Working Draft scope editor (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-scope-editor` |
| **Decision** | Studio V2 Slice B adds estimator editing of **physical Working Draft scope** via `PATCH /api/elite100-studio-v2/cases/:caseId/working-draft/scope`. Persistence uses **repository.update directly** — not V1 `updateScope` — because V1 auto-forks approved/published revisions via `ensureEditableEstimateDraft`. V2 refuses frozen/approved/published/non-editable statuses with `approved_snapshot_readonly` / `draft_required`. Explicit **Save Scope** (no autosave). Calculate requires a clean saved scope. AI Takeoff remains the first-draft source; V2 owns estimator-approved Working Draft scope; customer DE never edits physical scope. |
| **Why** | Estimators must correct AI Takeoff measurements in Studio without the broken V1 orchestration path. |
| **SQL** | None. |
| **Impacted** | `studioV2ScopeEditor.mjs`, `studioV2Service.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `StudioV2ScopeEditor.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceB.test.mjs`. |
| **Protected** | V1 Studio behavior, calculator math, DE public routes, Takeoff geometry, Quote Library / sold APIs, Slice A publish/calculate contracts. |
| **Revisit trigger** | Slice C Takeoff import/re-import; autosave; approval in V2. |


### 208. Elite 100 Studio V2 Slice C — controlled AI Takeoff import (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-takeoff-import` |
| **Decision** | Studio V2 adds explicit **Preview / Apply Takeoff Import** (`GET/POST /api/elite100-studio-v2/cases/:caseId/takeoff-import-*`). Uses existing `buildTakeoffImportPayload` + `seedScopeFromTakeoffPayload` mappers. **Never** calls V1 `refresh-from-takeoff` or `ensure-editable-draft`. Empty AI Working Drafts are no longer permanently `unsupported_origin` — estimators import via confirmed `replace_empty` / `replace_all`. Non-empty drafts require `replace_all` + `confirmed: true`. Dirty local scope blocks import in the UI until Save/Discard. |
| **Why** | AI Takeoff must seed Studio V2 Working Draft without resurrecting automatic refresh-from-takeoff side effects. |
| **SQL** | None. |
| **Impacted** | `studioV2TakeoffImport.mjs`, `studioV2Service.mjs`, `studioV2WorkingDraft.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `StudioV2TakeoffImportPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceC.test.mjs`. |
| **Protected** | Calculator math, DE public routes, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, Slice A/B contracts. |
| **Revisit trigger** | Merge-mode import (additive rooms); live Takeoff embed; approval in V2. |

### 209. Elite 100 Studio V2 Slice D — estimate options / commercial foundation (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-estimate-options` |
| **Decision** | Studio V2 adds estimator-owned **Estimate Options** via `PATCH /api/elite100-studio-v2/cases/:caseId/working-draft/options`. Persists to canonical `scope.customLineItems` using `studioCommercialLines` roles (`customer_charge`, `credit`/`discount`, `internal_only`, `legacy_hidden_customer_charge`). Persistence uses **repository.update** only — never V1 `updateScope`, `ensure-editable-draft`, refresh-from-takeoff, approve, or publish. Account adjustment is **read-only** display. Waterfall / Vanity Program editors are placeholders (“Not yet available in V2”) rather than inventing unsafe controls. Explicit **Save Options**; dirty options block Calculate; calc must not overwrite unsaved option edits. |
| **Why** | Physical scope (Working Draft), customer configuration (Digital Estimate), and estimator commercial decisions must stay separated without reusing broken V1 commercial orchestration (`CommercialConfigurationSection`). |
| **SQL** | None. |
| **Impacted** | `studioV2EstimateOptions.mjs`, `studioV2Service.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `StudioV2EstimateOptionsPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceD.test.mjs`. |
| **Protected** | Calculator math, DE public routes, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace / `CommercialConfigurationSection`, Slice A–C contracts. |
| **Revisit trigger** | Safe waterfall/vanity editors; percent-discount UX; account-adjustment write path; approval in V2. |

### 210. Elite 100 Studio V2 Slice E — approval snapshot (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-approval-snapshot` |
| **Decision** | Studio V2 adds **Working Draft → Approved Snapshot** via `POST /api/elite100-studio-v2/cases/:caseId/working-draft/approve`. Approval requires `confirmed: true`, editable draft, current priced calculation (`status=priced`, no `staleReason`), and no unresolved/scope blockers. Persistence uses **repository.update** with the same approval payload shape as V1 (`approval` + `status=approved`). **Does not** call V1 `studioEstimateService.approve` because that path runs `refreshTakeoffGate` / auto-confirm mutations. Approval never publishes, never auto-forks, never calls ensure-editable-draft / open-measurement-revision / refresh-from-takeoff / simplified-publish. Post-approval scope/options are read-only; revision/edit flow is a later-slice placeholder. |
| **Why** | Estimators need a clean approve gate before Digital Estimate publish without resurrecting V1 orchestration side effects. |
| **SQL** | None. |
| **Impacted** | `studioV2Approval.mjs`, `studioV2Service.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `StudioV2ApprovalPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceE.test.mjs`. |
| **Protected** | Calculator math, DE public routes, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, Slice A–D contracts, publish-after-approve orchestration (Slice A publish remains separate). |
| **Revisit trigger** | Create-revision / edit-after-approval flow; richer approval readiness from DE readiness service. |

### 211. Elite 100 Studio V2 Slice F — strict Digital Estimate publish (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-strict-publish` |
| **Decision** | Studio V2 hardens **Approved Snapshot → Published Digital Estimate** via existing `POST /api/elite100-studio-v2/approved/:estimateId/publish`. Requires `confirmed: true` (also accepts legacy `confirm: true`), approved status, calculation fingerprint, and non-stale approval. Calls only `studioDigitalEstimateService.publish` with a sanitized **link-only** body — strips autoApprove/autoCalculate/simplified/email hooks. Never calls simplified-publish, ensure-editable-draft, open-measurement-revision, refresh-from-takeoff, auto-approve, or auto-calculate. Approval and publish remain separate UI panels (`StudioV2ApprovalPanel` + `StudioV2PublishPanel`). |
| **Why** | Publish must attach only to an approved immutable snapshot without resurrecting V1 one-click approve+publish orchestration. |
| **SQL** | None. |
| **Impacted** | `studioV2Publish.mjs`, `studioV2Service.mjs`, `StudioV2PublishPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceF.test.mjs`. |
| **Protected** | Calculator math, DE public routes, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, Slice A–E contracts, customer acceptance/sold handoff. |
| **Revisit trigger** | Email/notification delivery slice; replace-link UX; acceptance/sold handoff. |

### 212. Elite 100 Studio V2 production QA hardening (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/elite100-studio-v2-production-qa-hardening` |
| **Decision** | After first production smoke, V2 strict publish attaches the same **interactive customer configuration defaults** used by simplified-publish (`resolveSimplifiedPublishConfiguration`) so public Digital Estimate does not fall into `configuration_absent` / “Customer options could not be loaded.” Publish remains **link-only** and still calls only `studioDigitalEstimateService.publish` — never simplified-publish. UX hardening only: header “Studio V2 · Test Mode”, workflow status strip, calculation pricing-breakdown display (read-only from existing calc/scope fields), pricing-basis edit placeholder, dollar amount inputs, collapsed internal-only lines, clearer hidden-adjustment and approval-disabled copy. No calculator math, schema, catalog, vanity, waterfall, revision, or sold handoff. |
| **Why** | Production V2 publish omitted the configuration envelope, producing a document-only DE that failed customer options load while totals still matched. |
| **SQL** | None. |
| **Impacted** | `studioV2Publish.mjs`, `studioV2WorkingDraft.mjs`, `StudioV2EstimatorShell.tsx`, `StudioV2EstimateOptionsPanel.tsx`, `StudioV2ApprovalPanel.tsx`, `styles.css`, `studioV2SliceF.test.mjs`, `studioV2SliceD.test.mjs`. |
| **Protected** | Calculator math, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, DE public route contracts (payload population only), Slice A–F gates. |
| **Revisit trigger** | Pricing basis / price group editor; email delivery; already-published V2 links that lack configuration (may need republish). |

### 213. Elite 100 Studio V2 interactive Digital Estimate publish path (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-digital-estimate-interactive-path` |
| **Decision** | V2 strict publish must produce the **same interactive customer Digital Estimate path** as the fixed simplified-publish workflow: attach interactive `configuration` defaults, activate a configuration envelope on the publication, and **fail closed** if the envelope is missing or the configuration service is unavailable. Reuse/republish of a prior document-only publication must repair/activate the envelope on the active link (same `/e/<token>` URL shape). V2 still calls only `studioDigitalEstimateService.publish` (never simplified-publish / auto-approve / auto-calculate). Public DE bootstrap must reach `configure` mode (`fallbackReason !== configuration_absent`). |
| **Why** | Production V2 links opened the frozen estimate total but showed “Customer options could not be loaded” because publications could succeed as document-only (especially on reuse) without an active configuration envelope. |
| **SQL** | None. |
| **Impacted** | `studioEstimateDigitalEstimateService.mjs`, `studioV2Publish.mjs`, `studioV2Service.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `studioV2PublishActivatesDigitalEstimate.test.mjs`, `studioV2SliceF.test.mjs`. |
| **Protected** | Calculator math, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, DE public route contracts, link-only delivery. |
| **Revisit trigger** | Email delivery; replace-link UX; shared V1/V2 DE service singleton. |

### 214. Elite 100 Studio V2 republish / repair Digital Estimate action (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-republish-digital-estimate-action` |
| **Decision** | When an active Digital Estimate publication already exists, Studio V2 Publish panel shows **Republish / Repair Digital Estimate**. It calls the same strict `POST /api/elite100-studio-v2/approved/:estimateId/publish` with `confirmed: true` + `deliveryMode: link_only` (no email, no approve/calculate/scope mutation). Customer-viewed status does not hide the action. Clear copy: “Refreshes the customer link configuration. Does not email the customer.” `configuration_envelope_required` surfaces as an estimator-facing error. |
| **Why** | PR #116 repaired the backend envelope path, but production estimators had no UI control to invoke republish on already-published links showing “Customer options could not be loaded.” |
| **SQL** | None. |
| **Impacted** | `StudioV2PublishPanel.tsx`, `StudioV2EstimatorShell.tsx`, `styles.css`, `studioV2SliceF.test.mjs`. |
| **Protected** | Calculator math, V1 workflow, simplified-publish, email/sold/acceptance, DE public contracts. |
| **Revisit trigger** | Replace-link UX; email delivery. |

### 215. Elite 100 Studio V2 Slice H — pricing basis / price group controls (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-pricing-controls` |
| **Decision** | Studio V2 adds **Pricing Controls** via `PATCH /api/elite100-studio-v2/cases/:caseId/working-draft/pricing`. Persists `scope.pricingBasis` (`wholesale` / `direct` / `retail`), `scope.materialGroup` (Promo/A–F/Remnant → canonical `Group *` / `Remnant`), optional manual `estimateWideAdjustment`, and authorized `internalMarkupPercent`. Account-derived adjustments remain read-only. Persistence uses **repository.update** only; priced drafts demote to `ready_to_price` and clear `calculationSnapshot` with `staleReason: "Pricing settings changed — recalculate"`. UI panel sits after Project Header; dirty pricing blocks Calculate / Approve. Does not change calculator math or Digital Estimate repricing. |
| **Why** | Estimators need explicit pricing context control before calculate/approve/publish without resurrecting V1 orchestration. |
| **SQL** | None. |
| **Impacted** | `studioV2Pricing.mjs`, `studioV2Service.mjs`, `elite100StudioV2Routes.js`, `StudioV2PricingControlsPanel.tsx`, `StudioV2EstimatorShell.tsx`, `StudioV2ApprovalPanel.tsx`, `studioV2SliceH.test.mjs`. |
| **Protected** | Calculator math, Takeoff geometry, Quote Library / sold APIs, V1 estimate-workspace, DE public/repricing, catalog/vanity/waterfall/revision/sold. |
| **Revisit trigger** | Per-room material overrides; broader markup UX; customer DE repricing. |

### 216. Elite 100 Studio V2 Slice H QA — pricing status + SF persistence (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-pricing-controls-qa-hardening` |
| **Decision** | Working Draft `lastCalculation.pricingBreakdown` prefers **`calculationSnapshot`** (full calc including `elite100`) over the staff-safe stripped `calculation` view. Manual estimate-wide adjustments are labeled separately from account pricing rules; `$0.00` is not shown when dollar impact is unknown. UI status: Pricing Unsaved → Clean+Calculation Stale after save → Current after Calculate. Selected basis/group remain visible when calc is stale; rates/SF show “not calculated yet” until backend fields exist. Calculate loading always clears. No calculator/V4 math or DE repricing changes. |
| **Why** | Production QA: SF/rate flickered to “not available” after Calculate because GET working-draft preferred a stripped calc without `elite100`; Options panel mislabeled manual EWA as Account adjustment with `$0.00`. |
| **SQL** | None. |
| **Impacted** | `studioV2WorkingDraft.mjs`, `studioV2EstimateOptions.mjs`, `studioV2Pricing.mjs`, `StudioV2EstimatorShell.tsx`, `StudioV2EstimateOptionsPanel.tsx`, `StudioV2PricingControlsPanel.tsx`, `studioV2SliceH.test.mjs`. |
| **Protected** | Calculator math, V1 workflow, DE repricing, schema, ensure-editable-draft / refresh-from-takeoff / simplified-publish. |
| **Revisit trigger** | Include `elite100` summary fields in staff-safe calculation view; richer adjustment dollar display. |

### 217. Elite 100 Studio V2 — estimate-wide adjustment calculator wiring (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-estimate-wide-adjustment-wiring` |
| **Decision** | `mapStudioScopeToElite100Scope` now forwards `scope.estimateWideAdjustment` (normalized) into the Elite 100 calculator input. The calculator already applied estimate-wide % via `resolveEffectiveEstimateWideAdjustment`; the Studio→V4 adapter had been dropping the field, so saved V2 adjustments never changed totals. `calculateStudioEstimateV4` also passes through `totals.estimateWideAdjustment` for estimator-safe display. No calculator math changes. |
| **Why** | Production: Retail/Promo ~$10,860 and Wholesale/Promo ~$6,980 unchanged at 0%/3%/10% EWA — adjustment saved/displayed but not honored on Calculate. |
| **SQL** | None. |
| **Impacted** | `elite100RoomPricingStudioAdapter.mjs`, `studioV2WorkingDraft.mjs`, `studioV2EstimateOptions.mjs`, `StudioV2EstimatorShell.tsx`, `studioV2SliceH.test.mjs`. |
| **Protected** | `elite100RoomPricingCalculator` math, V1 workflow UX, DE repricing, schema, forbidden orchestration calls. |
| **Revisit trigger** | Per-line distributed adjustment preview in V2; customer-facing DE adjustment labels. |

### 218. Elite 100 Studio V2 Slice I — piece-level scope detail controls (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-scope-detail-controls` |
| **Decision** | Studio V2 scope editor stores openings/cutouts, finished edge LF, and edge profile on each piece. On save, piece cutouts aggregate into `scope.addOns` (`qty-sink` / `qty-bar` / `qty-cook` / `qty-outlet`); piece edge LF syncs into `edgeEligibleLinearFeet` + takeoff summary `approvedFinishedEdgeLf`; dominant piece edge profile sets `scope.edgeProfileToken`. Adapter assigns piece openings to the owning room when present, else legacy estimate-wide addOns. Side splash L/R saved as scope detail only (not priced). No calculator math changes; no schema migration. |
| **Why** | Estimators need piece-attached openings/edges instead of project-wide totals, without importing AI Takeoff Review orchestration. |
| **SQL** | None. |
| **Impacted** | `studioV2ScopeEditor.mjs`, `elite100RoomPricingStudioAdapter.mjs`, `StudioV2ScopeEditor.tsx`, `styles.css`, `studioV2SliceI.test.mjs`. |
| **Protected** | Calculator math, V1 workflow, DE repricing, Takeoff Review imports, catalog/vanity/waterfall/sold/email. |
| **Revisit trigger** | True per-piece priced edge profiles; mitered/waterfall pricing; side splash pricing. |

### 219. Elite 100 Studio V2 Slice I.1 — scope review UX hardening (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/elite100-studio-v2-scope-review-ux` |
| **Decision** | Rework Studio V2 scope editor into a compact room/piece review table with V2-native **Set exposed sides** modal and **Cutouts** popup. Exposed sides store `piece.exposedSides` + `pieceTopology` and sync `finishedEdgeLf` / `finishedEdge` from dimensions (geometry only). Cutout popup maps to existing Slice I piece fields; pop-up outlet + side splash remain scope-only / not priced. Plan preview shows a placeholder until V2 has a safe attachment URL. Reuses `takeoffExposedEdges` geometry helpers only — does **not** import AI Takeoff Review / V1 workspace components. |
| **Why** | Slice I data was correct but form-heavy; estimators need the guided review interaction from V1 without resurrecting V1 orchestration. |
| **SQL** | None. |
| **Impacted** | `StudioV2ScopeEditor.tsx`, `studioV2ScopeReviewHelpers.ts`, `studioV2ScopeEditor.mjs`, `styles.css`, `studioV2SliceI.test.mjs`. |
| **Protected** | Calculator math, V1 workflow, DE repricing, Takeoff Review component imports, schema. |
| **Revisit trigger** | Wire secure plan preview URL into Working Draft; peninsula attached-side UX; priced pop-up outlets. |

### 220. Elite 100 Studio V2 — Scope Review UI Polish (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-scope-review-ui-polish` |
| **Decision** | Frontend-only clarity pass on Studio V2 Working Draft scope review: piece review cards with geometry SF (L×D×qty÷144 display), countertop SF mode from existing fields (`included` / `approvedDirectSqft` / dimensions), clearer include/exclude, inline backsplash missing-run-length warning + **Use piece length** helper, plain-language edge/cutout summaries, upgraded edge badge, softer plan-preview placeholder, approved read-only copy. **No** separate “No countertop SF while included” mode — exclude from quote remains the only way to drop material SF; a true included-but-no-SF mode would need a new piece field + calculator wiring and is deferred. |
| **Why** | Slice I.1 controls worked but still felt technical/cramped for estimator review questions. |
| **SQL** | None. |
| **Impacted** | `StudioV2ScopeEditor.tsx`, `studioV2ScopeReviewHelpers.ts`, `styles.css`, `studioV2SliceI.test.mjs`, this doc. |
| **Protected** | Pricing math / calculators, V1 workflow, DE, save/approve/publish, V1 workspace imports, schema. |
| **Revisit trigger** | Product asks for included pieces that never count toward countertop SF; wire plan preview attachments. |

### 221. Elite 100 Studio V2 — Scope Review Layout Refinement (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-scope-layout-refinement` |
| **Decision** | Frontend-only workbench layout for Studio V2 Scope Review: dense piece rows with L/D/Qty visible by default; sticky right panel for selected-piece details / scope checklist / warnings / plan-preview placeholder; legacy openings collapsed under “Legacy openings”; exposed-sides modal shows actual length/depth inches on labels plus a simple text diagram. No pricing, schema, or V1 workflow changes. |
| **Why** | Prior polish answered estimator questions but used too much vertical space and left the right rail empty. |
| **SQL** | None. |
| **Impacted** | `StudioV2ScopeEditor.tsx`, `studioV2ScopeReviewHelpers.ts`, `styles.css`, `studioV2SliceI.test.mjs`, this doc. |
| **Protected** | Pricing math / calculators, V1 workflow, DE, save/approve/publish, V1 workspace imports, schema. |
| **Revisit trigger** | Wire secure plan preview; optional room-level edge LF control if estimators still need it in the compact header. |

### 222. Elite 100 Studio V2 — Scope Review Layout CSS Hardening (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-scope-css-hardening` |
| **Decision** | Frontend/CSS-only widen of Studio V2 shell (`studio-shell--v2` → max-width 1720px) and Scope Review workbench grid retune so dense piece controls stop clipping. Right detail panel stays sticky at a fixed ~250–280px from 1280px+; stacks below on narrower viewports. V1 shell widths unchanged. |
| **Why** | 1280px shell + ~320px side rail left the piece grid below its min width, forcing squeeze/clip even on desktop. |
| **SQL** | None. |
| **Impacted** | `styles.css`, `StudioApp.tsx` (V2 shell class), `studioV2SliceI.test.mjs`, this doc. |
| **Protected** | Pricing math, V1 workflow/shell max-width, DE, schema, business controls. |
| **Revisit trigger** | Ultrawide (>1800px) feedback; further column prioritization if needed. |

### 223. Digital Estimate — Customer Configuration Foundation (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/digital-estimate-customer-configuration-foundation` |
| **Decision** | Add a customer-safe **configuration foundation** layer on Digital Estimate interactive sessions: `selection_payload_json.__customerConfigurationFoundation` stores selections (material/edge/backsplash preference) vs scope change requests (openings, waterfall placeholders, notes). Public read model exposes summaries + `requiresEstimatorReview`. Saves extend existing `PUT /api/public-digital-estimate/v2/selections`. Rejects internal fields. Never mutates approved Studio/publication snapshots. No browser pricing, no sold conversion, no final acceptance changes, no schema migration. |
| **Why** | Studio V2 can publish interactive DE links; customers need a durable selection/request layer before catalog/waterfall/sold slices. |
| **SQL** | None (JSON meta-key on existing selections). |
| **Impacted** | `customerConfigurationFoundation.mjs`, `customerConfigurationDraft.mjs`, `publicConfigurationService.mjs`, `publicConfigApi.ts`, `CustomerConfigurationFoundationPanel.tsx`, `ConfigurationView.tsx`, foundation test, this doc. |
| **Protected** | Approved snapshot, Studio V2 workflow, calculator math, Product Catalog, Vanity Program, Waterfall pricing, sold handoff, V1. |
| **Revisit trigger** | Wire Product Catalog / priced waterfall; enable `canSubmitForFinalReview`; dedicated activity event type if telemetry needs it. |

### 224. Studio V2 publish — ignore legacy Takeoff approval gate (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-publish-ignore-takeoff-approval-gate` |
| **Decision** | Studio V2 strict publish passes server-only `publishContext` (`source: "studio_v2_approved_snapshot"`, `skipLegacyTakeoffApprovalGate: true`) into `studioDigitalEstimateService.publish`. `assessStudioEstimatePublicationReadiness` skips `takeoff_not_approved` only in that context (same spirit as confirmed-manual skip). V1/shared DE publish without publishContext still requires Takeoff approval. V2 still requires approved + current calculation + interactive envelope. **Authority boundary:** after import, AI Takeoff is historical evidence only — never a publish blocker, never silent override of estimator Working Draft scope. |
| **Why** | In Studio V2, AI Takeoff is a measurement source; the approved Working Draft snapshot is publish authority. Blocking on original Takeoff approval incorrectly blocked priced/approved V2 estimates. |
| **SQL** | None. |
| **Impacted** | `studioEstimatePublicationAdapter.mjs`, `studioEstimateDigitalEstimateService.mjs`, `studioV2Service.mjs`, `studioV2PublishActivatesDigitalEstimate.test.mjs`, this doc. |
| **Protected** | V1 takeoff gate, approve/stale gates, interactive envelope, no simplified-publish / auto-approve / auto-calculate, no silent takeoff re-apply over estimator scope. |
| **Revisit trigger** | Takeoff History UI (read-only import/reference/comparison); if a future unified publish path needs the same authority flag outside V2. |

### 225. Studio V2 — approved-estimate revision / edit flow (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `feature/studio-v2-approved-estimate-revision-flow` |
| **Decision** | After approval, Studio V2 estimates stay frozen. Estimators open changes via `POST /api/elite100-studio-v2/cases/:caseId/approved/:estimateId/create-revision` (`confirmed: true`, optional reason). Implementation is **V2-native**: `repository.createSiblingRevisionFrom` copies scope/pricing/options into R+1 `ready_to_price`, clears approval + calculation snapshot, does **not** supersede R1, does **not** call `ensureEditableEstimateDraft` / `openMeasurementRevision` / Takeoff reopen / refresh-from-takeoff / publish / auto-approve / auto-calculate. Active Working Draft becomes the new sibling (highest non-superseded revision). Customer Digital Estimate link stays on the last published revision until R2 is approved and republished. UI replaces the Slice E placeholder with confirmed **Create editable revision**. |
| **Why** | Approved snapshots must remain immutable history; estimators still need a real post-approval edit path without V1 auto-fork/takeoff side effects. |
| **SQL** | `backend-core/supabase/eliteos_studio_estimates_sibling_revisions_v1.sql` — **required before production use**: drops `uq_studio_estimates_one_active_per_case` (blocked sibling inserts) and adds non-unique `idx_studio_estimates_active_by_case`. Same sibling contract as FEATURE_DECISIONS §199; in-memory tests never enforced the unique index. |
| **Impacted** | `studioV2Revision.mjs`, `studioV2Service.mjs`, `studioV2Approval.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `StudioV2ApprovalPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2RevisionFlow.test.mjs`, sibling-revisions SQL, this doc. |
| **Protected** | Pricing math / calculators, V1 workflow, DE customer repricing, Product Catalog / Waterfall / Vanity / sold / intake / acceptance, auto-publish / auto-approve / auto-calculate, approved snapshot mutation. |
| **Revisit trigger** | Apply sibling-revisions SQL to production; optional explicit `parent_estimate_id` column; revision history UI list. |

### 226. Digital Estimate — Baseline Parity + Customer UI Guardrails (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-baseline-parity-guardrails` |
| **Decision** | Until Slice K authoritative customer repricing ships, public Digital Estimate **freezes customer-visible pricing to the published baseline**. Material/color/edge/backsplash selections may still save as pending configuration / review-required requests, but must not replace “Your estimate” with incomplete engine deltas or invent $0 countertop room lines. Guardrails: (1) `baselineParityGuardrails.mjs` clamps public calc totals to baseline + marks `pending_estimator_review`; (2) engine input uses baseline material group / backsplash mode while selections persist separately; (3) public breakdown uses published room pricing snapshot; (4) UI hides **Approve final estimate** while `canSubmitForFinalReview === false` and keeps **Request review** primary; (5) suppress $0 countertop breakdown lines. Edge **option display** amounts are clarified in §228 (backend-calculated, not live reprice). Does not mutate approved Studio estimates or `quote_publication_snapshots`. Does not move pricing math to the browser. |
| **Why** | Production showed baseline $8,230 correctly on open, then material change dropped “Your estimate” to ~$6,013 with $0 countertop lines and misleading edge +$45 deltas; final approve was visible despite `canSubmitForFinalReview: false`. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs`, `publicConfigurationService.mjs`, `ConfigurationView.tsx`, `customerEstimateBreakdown.ts`, tests, this doc. |
| **Protected** | Studio V2 pricing math / calculators, Product Catalog, Waterfall, Vanity, sold conversion, final acceptance implementation, V1 workflow, approved snapshot immutability. |
| **Revisit trigger** | Slice K proves backend reprice from approved snapshot (material + LF edge + all frozen charges) matches Studio V2; then set `isCustomerRepricingAuthoritative()` true under proven gates. |

### 227. Studio V2 — revision Calculate uses active Working Draft authority (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/studio-v2-revision-edge-profile-authority` |
| **Decision** | After creating editable R2 from approved R1, **Calculate must price the saved active Working Draft**, not stale R1 / legacy estimate-wide fields that contradict piece edits. Adapter maps piece `finishedEdgeLf` + `edgeProfileToken` → calculator `pieceEdgeProfiles` (room `edgeProfile` = estimate-wide “Estimate default” only). Scope save no longer lets a later premium piece overwrite an earlier included/eased selection onto estimate-wide `edgeProfileToken`. Explicit incoming estimate-wide token (including clear→eased) wins over soft-sync. UI Save Scope preserves `edgeProfileToken`; “Estimate default” displays the resolved label (e.g. `Estimate default: Knife`). |
| **Why** | Production R2 Save + Calculate still showed Edge — Knife after changing a piece to Eased — adapter used first-piece / room-aggregate edge path and ignored per-piece profiles; premium-wins soft-sync could restore Knife on the estimate-wide token. |
| **SQL** | None. |
| **Impacted** | `elite100RoomPricingStudioAdapter.mjs`, `studioV2ScopeEditor.mjs`, `StudioV2ScopeEditor.tsx`, `studioV2ScopeReviewHelpers.ts`, `StudioV2EstimatorShell.tsx`, revision-flow + Slice I tests, this doc. |
| **Protected** | Calculator rates/formulas, V1 workflow, DE customer repricing, approved snapshot mutation, auto-approve / auto-calculate / auto-publish, simplified-publish / refresh-from-takeoff / ensure-editable-draft. |
| **Revisit trigger** | If estimate-wide edge picker is added, keep pieceEdgeProfiles as authority for mixed profiles; revisit legacy scopes that only have estimate-wide edge LF with no piece finishedEdgeLf. |

### 228. Digital Estimate — edge option display prices + customer copy (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-customer-ux-simplification` |
| **Decision** | Public Digital Estimate shows **backend-calculated edge option display impacts** while the published baseline total remains authoritative. Included profiles show `+$0`; upgraded profiles show `+$N` from frozen publication `edge_option_effects` (or trusted LF×rate resolve). Published/selected edge shows **Selected** / **Included in your estimate** — never “Original selection”. Customer edge changes remain pending estimator review and do **not** change Your estimate. One section note: “Edge changes may affect your final estimate and will be reviewed by Elite.” Sidebar shows **Changes need review** (+ optional Pending edge change `+$N`) instead of a contradictory Difference `$0`. |
| **Why** | Baseline-parity hotfix had stripped all edge dollar labels to vague “Original selection” / “Elite will confirm…” copy; customers need transparent option impacts without re-enabling live repricing. |
| **SQL** | None. |
| **Impacted** | `studioEdgeAuthority.mjs`, `customerFacingCopy.mjs`, `baselineParityGuardrails.mjs`, `publicConfigurationService.mjs`, `ConfigurationView.tsx`, `lovableViewModel.ts`, tests, this doc. |
| **Protected** | Live customer reprice (`isCustomerRepricingAuthoritative` stays false), calculator formulas/rates, Studio V2 pricing math, approved snapshots, `quote_publication_snapshots` mutation from customer saves, Product Catalog / waterfall / vanity / sold / final acceptance, V1 workflow, browser pricing math. |
| **Revisit trigger** | Slice K authoritative reprice; then option display amounts can drive configured totals under proven gates. |

### 229. Digital Estimate — live-price permitted selections; scope-only review (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | Public Digital Estimate **live-prices permitted customer selections** via backend `calculateElite100ConfigDelta` (Pricing Engine config-delta / V4 path). Material/color/group, edge profile, eligible backsplash, and priced product options update `pricedSelectionTotal` / Your estimate / Difference immediately. **Estimator review is required only for physical scope requests** (openings, waterfalls, geometry change requests, etc.). Baseline-parity freeze remains as a **fail-closed safety** when the public calc is incomplete/unsafe (e.g. $0 countertop vs published material). `isCustomerRepricingAuthoritative()` returns true. Final acceptance stays gated (`canSubmitForFinalReview: false`) until a safe final workflow ships. |
| **Why** | Prior baseline freeze treated material/edge as “pending review” and kept totals on Promo/published even when V4 could price them — incorrect product contract. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs`, `publicConfigurationService.mjs`, `ConfigurationView.tsx`, tests, this doc (§226/§228 superseded for selection freeze behavior). |
| **Protected** | Browser pricing math, calculator formulas/rates, Studio V2 math, approved Studio estimates, `quote_publication_snapshots` mutation from customer saves, sold conversion, V1 workflow, silent scope mutation. |
| **Revisit trigger** | Switch public engine to config-delta V2 when production-proven; enable final acceptance only with safe gates. |

### 230. Digital Estimate live-pricing — deploy-blocking safety edits from review (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | Four required fixes to §229 before deploy, no pricing-formula or Studio/V1 changes: (1) the sidebar now shows a customer-safe notice whenever the calc is fail-closed frozen, not only for scope-review requests (`showPricingNotice = changesNeedReview \|\| pricingFrozen`). (2) `missing_material_rate` thrown by the config-delta engine for a countertop material (not just side-splash) is caught in `publicConfigurationService.mjs`, degrades the affected room(s) back to the published baseline material group, retries the calc, flags `material_rate_missing_review`, and forces `forceFreeze` — it never surfaces as a customer-facing save failure. (3) the sidebar only claims "Changes saved" once `customerConfiguration.lastSavedAt` is set; a fresh, never-saved session shows "As published" instead. (4) `applyBaselineParityToCustomerCalculation` is now sticky: re-guarding an already-`published_baseline_frozen` calc (e.g. on page reload) stays frozen instead of reclassifying as safe, because freezing itself resets totals/rooms to match the baseline and would otherwise erase its own signal on the next pass. The old fail-closed copy ("Price updates for this change require estimator review.") is replaced with "This selection needs Elite review before the estimate can update." |
| **Why** | Opus review of §229 found the fail-closed state was invisible to the customer, a legacy/off-schedule material group could throw a hard save error, "Changes saved" appeared before any save existed, and the frozen signal did not survive a second guard pass. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs`, `baselineParityGuardrails.test.mjs`, `publicConfigurationService.mjs`, `ConfigurationView.tsx`, `phaseCustomerExperience.foundation.test.mjs`, this doc. |
| **Protected** | Pricing formulas/rates, Studio V2, V1 workflow, browser pricing math, approved Studio estimates, `quote_publication_snapshots` mutation from customer saves. |
| **Revisit trigger** | If `unknown_material_group` (a related but distinct engine error for a group code that doesn't normalize at all) is ever observed reaching a customer save, extend the same catch/degrade treatment to it. |

### 231. Digital Estimate edge option rows — simplified customer copy, no history language (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | Every public edge option row (`ConfigurationView.tsx`) always shows the option name and its price (`+$0` / `+$N`); selection is indicated only by a visual highlight plus a small `Selected` badge, never by replacing the price with status text. A new exported `edgeRowPriceLabel()` (`edgeGroups.ts`) ignores any legacy/history label the backend may still send on `priceEffectLabel` ("Included in published estimate", "Included in your estimate", "Original selection", "Included") and derives the number directly from `visibleDelta` / `priceEffectCents` instead, so that text never reaches the customer. The Material row's `colorEffect` string was also changed from "Included in published estimate" to "Included in your estimate" for the same reason. Backend `applyEdgeOptionPriceGuardrail` output (which still sets that label internally alongside the correct cents) is intentionally unchanged — the fix is purely at the customer-facing render boundary. |
| **Why** | Production customer UX showed "Included in published estimate" on the selected baseline edge row (e.g. Knife) — internal/history language, and worse, the old code replaced a selected row's price with the bare word "Selected" instead of showing +$627. |
| **SQL** | None. |
| **Impacted** | `ConfigurationView.tsx`, `edgeGroups.ts`, `phaseEdgeOptionCustomerCopy.test.ts` (new), this doc. |
| **Protected** | Pricing formulas/rates, Studio V2, V1 workflow, browser pricing math (`edgeRowPriceLabel` only formats backend-provided numbers). |
| **Revisit trigger** | None known; if a new legacy label variant appears, add it to the regex/ignore list in `edgeRowPriceLabel`. |

### 232. Digital Estimate baseline-parity guardrail — room-matching bug let incomplete material reprice become authoritative (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | `isUnsafeCustomerFacingCalc()` (`baselineParityGuardrails.mjs`) had two related bugs that let an incomplete room-level reprice (Countertop $0 after a material change) reach the customer as authoritative even though the *project* total was still positive: (1) its room-matching fallback compared `roomKey` on both sides with no guard, and the real public room DTO (`customerRoomPricingProjection.mjs` `toPublicRoom`) never carries a `roomKey` at all — so `"" === ""` was trivially true and pinned **every** published room onto whichever calc room happened to be first in the array, silently skipping any room not at index 0; (2) legacy publications with no per-room dollar snapshot report `countertopAmount: null` on the published side (`buildLegacyOriginalRoomPricingProjection`), which the guardrail treated as "nothing to protect" and skipped entirely. Fix: room matching now only trusts a `roomKey`/`roomId` match when at least one side actually has a non-empty value, otherwise matches by normalized `roomName`; a published room counts as having countertop scope to protect if it has a positive `countertopAmount` **or** a recorded `selectedMaterial` (legacy case); an unmatched room that had scope, or a matched room whose countertop/material collapsed to zero/missing, freezes to baseline; and a project-wide countertop-total fallback catches any residual matching drift. Legitimate material upgrades (different material, real countertop dollars) are unaffected. |
| **Why** | Production screenshot: published Kitchen $7,120 (real countertop value) vs. customer estimate $5,264 with Kitchen showing Countertop $0 / Backsplash $459 / Room total $459 — an incomplete reprice became the customer-visible total instead of freezing to baseline. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs`, `baselineParityGuardrails.test.mjs` (test 19, reproduces the exact screenshot shape plus the legacy-null-countertop variant), this doc. |
| **Protected** | Pricing formulas/rates, Studio V2, V1 workflow, browser pricing math, approved Studio estimates, `quote_publication_snapshots` mutation, sticky/idempotent frozen state (§230.4), customer-safe notice visibility (§230.1), edge option display (§231). |
| **Revisit trigger** | If the public room pricing DTO is ever changed to carry a real `roomKey`, the name-based fallback can be simplified, but should stay as defense-in-depth. |

### 233. Digital Estimate fail-closed parity — frozen total must freeze the room breakdown too (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | When `applyBaselineParityToCustomerCalculation` freezes to the published baseline, it now replaces **all** customer-visible room pricing, not just the top-level total: published baseline room pricing is substituted when available, and when it is not, `roomPricing` is set to `null` and `roomPricingChanges` is emptied rather than passing the unsafe calc through; `customerConfigurationSummary.totals` is realigned to the baseline as well. `customerRoomPricingProjection.mjs` also stops defaulting a missing `originalBacksplashMode` to `"none"` when the frozen snapshot carries positive Backsplash dollars — that false mode tripped `assertConfiguredBacksplashNoneIsZero`, which was why published baseline room pricing was unavailable to substitute in the first place. Client side, `failClosedRoomPricing()` (`customerEstimateBreakdown.ts`) feeds the same baseline pricing to the room cards, the sidebar breakdown and the print estimate, and `buildUpdatedBreakdown` renders no line detail at all for a frozen calc with no baseline rooms. Fail-closed copy changed from "This selection needs Elite review before the estimate can update." to "This selection could not be priced automatically yet. Your current quoted total is still shown." (`BASELINE_PARITY_NOTICES.PRICE_UPDATE_UNAVAILABLE`) — automatic pricing is the norm for material/edge/backsplash selections, so a pricing miss must not read as the estimator review that only true scope changes require. |
| **Why** | Production: the total was correctly frozen at the published $7,120, but the room breakdown, room cards and print still showed the partial calc behind the freeze — Countertop $0 with backsplash-only room totals ($459, $816, …). Root cause: the freeze substituted room pricing only inside `if (opts.publishedRoomPricingPublic)`, and that DTO was `null` because building it threw `configured_backsplash_none_nonzero` for publications that froze Backsplash dollars without recording the mode. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs`, `customerRoomPricingProjection.mjs`, `customerEstimateBreakdown.ts`, `ConfigurationView.tsx`, `baselineParityGuardrails.test.mjs` (test 20), `customerRoomPricingProjection.test.mjs` (11-G), `phaseFrozenBaselineBreakdownParity.test.ts` (new), this doc. |
| **Protected** | Pricing formulas/rates, Studio V2, V1 workflow, browser pricing math (the client only selects between two backend DTOs), approved Studio estimates, `quote_publication_snapshots` mutation, sticky frozen state (§230.4), guardrail detection (§232). |
| **Revisit trigger** | If publications ever guarantee a recorded backsplash mode, the inferred-`null` branch in the Original projection can be dropped. |

### 234. Digital Estimate edge option rows — gross option price, not delta from the current selection (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | The customer-safe edge option DTO now carries `grossPriceEffectCents` — the option's own price (`0` for included profiles, the frozen LF × rate premium for upgraded profiles) — alongside the existing selection-relative `priceEffectCents` / `visibleDelta` that pricing consumes. `resolveEdgeOptionPriceEffect`, `buildCustomerSafeEdgeOptionEffects` and `edgeEffectFromFrozenPublication` (`studioEdgeAuthority.mjs`) all populate it; `applyEdgeOptionPriceGuardrail` labels the selected row from it; `edgeRowPriceLabel` (`edgeGroups.ts`) displays it. Publications frozen before the field existed recover the selected premium row's price from a sibling premium row in the same room via `frozenPremiumEdgeGrossCents()` — every upgraded profile in a room shares one frozen price, so no number is re-derived in the browser. The guardrail also no longer stamps "Included in published estimate" on the selected row. |
| **Why** | An upgraded edge showed `+$627` until the customer selected it, then dropped to `+$0`: the selected profile's delta from itself is zero by definition, and both the engine's `isOriginal` branch and the guardrail's `centsRaw > 0` check discarded the premium it had just computed. Selection is a visual state and must never replace or zero a row's price. |
| **SQL** | None. |
| **Impacted** | `studioEdgeAuthority.mjs`, `publicConfigurationService.mjs`, `baselineParityGuardrails.mjs`, `edgeGroups.ts`, `lovableViewModel.ts`, `publicConfigApi.ts`, `baselineParityGuardrails.test.mjs` (test 21), `phaseEdgeOptionCustomerCopy.test.ts`, this doc. |
| **Protected** | Pricing formulas/rates (`UPGRADED_EDGE_RATE_*_V2` untouched; the delta the engine consumes is unchanged), Studio V2, V1 workflow, browser pricing math, no LF/rate/pricing-basis exposure in public DTOs. |
| **Revisit trigger** | Once all live publications carry `grossPriceEffectCents`, the sibling-row fallback can be removed. |
### 235. Digital Estimate priced option rows — one selection rule for every option kind (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-option-state-contract` |
| **Decision** | The rule established for edge rows in §234 now applies to every customer-selectable priced option row: name, backend-provided price, and a visual selected state. `ChoiceRadio` (`ConfigurationView.tsx`) no longer replaces a selected row's price with the word "Selected" — the price renders unconditionally and selection remains the row highlight plus the existing short `Selected` badge. Sink/faucet product cards and the accessory, plumbing add-on and specialty rows already rendered price independently of selection; they gained a shared `data-testid="de-choice-option-price"` price slot so the invariant is assertable across row kinds. No backend change was needed: these options are priced `absolute` (`visibleSellPrice`), and `customerPriceEffectLabel()` / `formatPriceEffect()` take no selection input, so unlike the edge delta fields nothing upstream can zero a selected row. |
| **Why** | A selected sink or faucet showed "Selected" where its price had been, hiding the amount the customer had just chosen and making selected rows inconsistent with the edge rows fixed in §234. |
| **SQL** | None. |
| **Impacted** | `ConfigurationView.tsx`, `phaseGenericOptionRowPriceParity.test.ts` (new), `phaseCustomerExperiencePolish.test.ts` (assertion 40 relaxed to allow the fail-closed calc variable names from §233), this doc. |
| **Protected** | Pricing formulas/rates, backend pricing DTOs, Studio V2, V1 workflow, browser pricing math (rows only render backend labels), approved Studio estimates, `quote_publication_snapshots` mutation, edge row behavior (§234). |
| **Revisit trigger** | If a new option row kind is added, give it the same price slot testid so the parity test covers it. |

### 236. Digital Estimate print/PDF — Countertop $0 / backsplash-only collapse must never print (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-print-frozen-breakdown` |
| **Decision** | `isUnsafeCustomerFacingCalc` now detects the intrinsic Countertop $0 / backsplash-only collapse even when published room pricing is unavailable (`hasBacksplashOnlyCountertopCollapse`). Previously `!publishedRooms.length` short-circuited to "safe", so an incomplete reprice whose room totals still summed to the published project total ($7,120) became `authoritative_backend_reprice` and the print/PDF rendered Countertop $0 with backsplash-only room totals. Client defense: `isUnsafeCustomerRoomPricing` + hardened `failClosedRoomPricing` treat that collapse as fail-closed regardless of authority; `forSafeDisplay` stamps frozen authority/baseline total for room cards, sidebar and print; `buildDigitalEstimatePrintModel` drops unsafe roomPricing as a last line of defense and never emits Countertop $0; the print document omits empty amount tables / room totals; room-card summary hides the backsplash-only collapse. Fail-closed copy stays "This selection could not be priced automatically yet…"; estimator-review language remains gated on true scope-change requests only. |
| **Why** | Production uploaded PDF showed Your estimate $7,120 with every room Countertop $0 / backsplash-only (Kitchen $2,315, Master Bath $816, …). The total looked protected because the incomplete rooms summed to the baseline, but print read the unsafe customer `roomPricing` because the guardrail could not freeze without published rooms. |
| **SQL** | None. |
| **Impacted** | `baselineParityGuardrails.mjs` (+ test 22), `customerEstimateBreakdown.ts`, `customerPrintAdapter.ts`, `DigitalEstimatePrintDocument.tsx`, `ConfigurationView.tsx`, `phaseFrozenBaselineBreakdownParity.test.ts` (4b PDF shape), this doc. |
| **Protected** | Pricing formulas/rates, Studio V2, V1, browser pricing math, approved Studio estimates, `quote_publication_snapshots`, internal pricing evidence. |
| **Revisit trigger** | None known; once all publications carry buildable published room pricing, the intrinsic collapse check remains defense-in-depth. |

### 237. Digital Estimate live pricing — frozen publication dropped piece SF, so every countertop priced at $0 (2026-07-30)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-30 · `hotfix/digital-estimate-print-frozen-breakdown` |
| **Root cause** | `freezePiecesForPublication` (studioEstimatePublicationAdapter) froze each countertop piece without its `sqft`. `extractLockedRoomsFromEvidence` then called `billableCountertopFromRoom({ countertopSqft, pieces })`, which prefers pieces as the independently ceiled billing sections whenever pieces exist — so every section billed 0 SF and `chargeableCounterSf` became 0 while the room-level `countertopSqft` sat unused beside it. Zero is finite and non-negative, so no `missing_locked_measurement` blocker fired. Config-delta then priced material at rate × 0 SF (Countertop $0) with backsplash still priced from `backsplashSqft`, producing the backsplash-only room shape that `hasBacksplashOnlyCountertopCollapse` correctly froze to the published baseline. The guardrail was right; its input was starved. |
| **Decision** | Publication now freezes each piece's measured `sqft` so the DE re-price uses the same section ceiling Studio priced with. The trusted context treats pieces as billing sections only when they actually carry SF (excluding backsplash-typed pieces) and otherwise falls back to room-level `countertopSqft`, so publications frozen before this change live-price instead of billing 0 SF. No formula, rate, engine or guardrail change. |
| **Why** | Production: customer saved material Aurataj / Group C and edge Eased; sidebar stayed Published $7,120 / Your estimate $7,120 / No change with the fail-closed notice. Permitted selections must live-price. |
| **SQL** | None. Existing publications are read with the legacy fallback (room-level SF); republished estimates get exact section parity. |
| **Impacted** | `studioEstimatePublicationAdapter.mjs`, `configurationTrustedContext.mjs`, new `phaseFrozenPieceSquareFeetLivePricing.test.mjs`, `studioEdgeScope.test.mjs` (stale §231 edge label expectation), this doc. |
| **Protected** | Pricing formulas/rates, Studio V2 calculator, V1, browser pricing math, approved Studio estimates, `quote_publication_snapshots`, internal pricing evidence (piece SF stays in internal evidence; public room DTOs still carry no numeric SF). |
| **Revisit trigger** | If legacy publications show a 1–2 SF drift vs their published countertop dollars, republish the estimate to restore exact section-ceiling parity. |

### 238. Studio V2 Customer Selection Review — read real saved DE selections (2026-07-31)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-31 · `feature/studio-v2-customer-selection-review` |
| **Root cause** | `getCustomerActivity` set `savedSelections` by regex-matching `customerActivityState` (`/saved\|configured\|selection/i`). Publication activity states are only `waiting` / `viewed` / `review_requested` / … — never “saved” — so estimators always saw **Saved selections: No** even after customers saved live-priced material/edge/product selections. |
| **Decision** | Customer activity now loads the latest Digital Estimate configuration selection for the active publication+envelope (`getLatestSelectionForPublicationEnvelope` + calculation). `savedSelections` / `lastSavedAt` come from that row. A staff-safe `selectionReview` DTO separates **priced customer selections** (material/edge/backsplash/products) from **scope requests** (openings/waterfalls/notes). Studio V2 shows a read-only Customer Selection Review panel under Digital Estimate / Customer Activity. No apply/approve/publish/sold-job behavior. |
| **Why** | Estimators could not see what the customer changed after DE live-pricing started working. |
| **SQL** | None. |
| **Impacted** | `studioCustomerSelectionReview.mjs` (+ test), `studioV2Service.mjs`, `elite100StudioV2Routes.js`, `StudioV2CustomerSelectionReviewPanel.tsx`, `StudioV2EstimatorShell.tsx`, `studioV2SliceF.test.mjs`, this doc. |
| **Protected** | Pricing formulas, customer pricing math, approved estimates, auto-approve/publish/sold, V1, raw payload / internal evidence / service-role exposure. |
| **Revisit trigger** | When “apply customer selections into Studio draft” is productized; until then panel stays read-only. |

### 239. Digital Estimate Changes tab — Material must not double-count Countertop (2026-07-31)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-07-31 · `fix/de-changes-breakdown-reconciliation` |
| **Root cause** | `buildChangesRoomPricingProjection` emitted both a **Material** row (`materialDeltaCents`, countertop stone-rate delta) and a **Countertop → Countertop** row (`updatedCountertop − originalCountertop`). In proportional-allocation mode those are the same cents (`countertopAmountCents += materialDeltaCents`). The Changes UI summed both into room totals, so visible room changes (~$1,852) exceeded the authoritative project difference (~$1,619) by exactly the duplicated material deltas. |
| **Decision** | When a Material change row already owns the countertop stone-rate dollars, do not also emit a Countertop change row. Material / backsplash / add-on rows remain additive. Project difference continues to come from backend `totalDelta` (`configured − published`). Frontend Changes room totals sum displayed additive rows; if a residual remains vs project delta, show a **Project-level adjustments** line (display-only). Calculator formulas/rates unchanged. |
| **Why** | Customer Changes tab looked wrong/conflicting while Your estimate ($8,739) was correct. |
| **SQL** | None. |
| **Impacted** | `customerRoomPricingProjection.mjs` (+ regression), `customerEstimateBreakdown.ts`, `phaseChangesBreakdownReconciliation.test.ts`, this doc. |
| **Protected** | Pricing formulas/rates, browser pricing math, approved estimates, publication snapshots, Studio V2 workflow. |
| **Revisit trigger** | If a non-material countertop-only customer selection path is introduced, re-evaluate whether a dedicated Countertop change row is needed (with distinct labels). |

### 240. Digital Estimate review copy cleanup — no false estimator-review warning (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `hotfix/digital-estimate-review-copy-and-labels` |
| **Root cause** | `CustomerConfigurationFoundationPanel` always rendered a yellow “Requests that need estimator review” banner, even when `scopeChangeRequests` was empty (“No review-required requests yet.”). That made normal priced selections feel like blockers. Studio V2 selection review also fell back to raw `e100-*` material tokens when `colorName` was missing. |
| **Decision** | Yellow review warning shows only when true scope requests exist (openings / waterfalls / notes / backsplash change request). Customer copy reframed to “Your selections” + “Send your selections to Elite” (not final acceptance). Studio V2 maps material ids through `getElite100CustomerMaterial` to friendly catalog names (Bayshore Sand, Bear Hug, …) and omits raw `e100-*` ids from the staff DTO. Review-request sync already worked (`reviewRequested` from open amendments); tests now lock it in. |
| **Why** | Production customer page showed contradictory review language after live pricing started working. |
| **SQL** | None. |
| **Impacted** | `CustomerConfigurationFoundationPanel.tsx`, `ConfigurationView.tsx`, `studioCustomerSelectionReview.mjs` (+ test), `customerConfigurationSummary.mjs`, `customerConfigurationFoundation.mjs`, `phaseCustomerReviewCopyCleanup.test.ts`, this doc. |
| **Protected** | Pricing formulas/rates, browser pricing math, approved estimates, publication snapshots, Studio V2 approve/publish/revision workflow, final acceptance gate. |
| **Revisit trigger** | When final acceptance is productized, revisit submission CTA copy. |

### 241. Studio V2 Customer Selection Review — Review requested must match DE “Send selections” (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `fix/studio-v2-review-requested-status` |
| **Root cause** | Public “Send selections” creates a DE.2F amendment review request with status `review_requested`. Studio publication summary + V2 customer-activity only treated legacy statuses (`open` / `new` / `pending` / `submitted`) as open, so `reviewRequestOpen` stayed false and the Customer Selection Review panel showed **Review requested: No** while the customer page correctly showed “Selections already sent” / “Sent for review”. |
| **Decision** | Shared helper `isOpenDigitalEstimateReviewRequestStatus` / `OPEN_REVIEW_REQUEST_STATUSES` in `amendmentConfig.mjs` is the source of truth for open/in-flight review requests (`review_requested`, `estimator_reviewing`, `clarification_required`, `amendment_prepared`, plus legacy aliases). `buildSafeStudioPublicationSummary`, Studio V2 `getCustomerActivity`, and Live DE open-status checks use that helper. Saved selections remain separate from review-requested; accepted stays false; priced selections are not physical scope requests. Read-model only — no approve/publish/calculate/revision. |
| **Why** | Estimators must see the same submitted-for-review state the customer already sees. |
| **SQL** | None. |
| **Impacted** | `amendmentConfig.mjs`, `studioPublicationSummary.mjs` (+ test), `studioV2Service.mjs`, `studioCustomerSelectionReview.test.mjs`, `liveDigitalEstimatesStatus.mjs`, `liveDigitalEstimatesService.mjs`, this doc. |
| **Protected** | Pricing formulas/rates, Digital Estimate totals, approve/publish/revision, acceptance, approved snapshots. |
| **Revisit trigger** | If DE.2F adds a new in-flight review status, add it to `OPEN_REVIEW_REQUEST_STATUSES`. |

### 242. Digital Estimate — Accept original published estimate (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/de-accept-original-estimate` |
| **Decision** | Customers may **Accept estimate** when the published Digital Estimate is unchanged (no priced selection deltas, no physical scope requests, no open review request). Uses the existing public `POST /api/public-digital-estimate/v2/final-acceptance` lifecycle acceptance record (`acceptedAsPublished: true`, accepted total = published estimate total). Changed selections keep **Send selections**; after send, accepting the stale original is blocked. Studio V2 Customer selection review shows Accepted: Yes with accepted total / publication / timestamp; Review requested stays independent. |
| **Why** | Not every estimate needs a revision — customers who want the published estimate as-is need a safe closeout that is not sold handoff. |
| **SQL** | None (reuses studio lifecycle acceptance tables). |
| **Impacted** | `customerConfigurationFoundation.mjs`, `baselineParityGuardrails.mjs`, `publicConfigurationService.mjs`, `studioFinalAcceptanceService.mjs` (+ routes), `ConfigurationView.tsx`, `StudioV2CustomerSelectionReviewPanel.tsx`, `studioAcceptPublishedEstimate.test.mjs`, this doc. |
| **Protected** | Pricing math, approve/publish/calculate, revision creation, sold handoff, approved/publication snapshots (acceptance metadata/event only), V1, AI Takeoff. |
| **Revisit trigger** | When post-review final acceptance of a revised republication is productized, keep accept-as-published as the unchanged-only path. |
  
### 243. Studio V2 workspace deep-link / refresh-safe URL (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `fix/studio-v2-workspace-deeplink` |
| **Root cause** | Opened Studio V2 workspace lived only in React state (`mainNav` + `estimateWorkspaceCaseId`). Refresh rebooted to default Inbox with no case id, so estimators had to wait for Inbox reload and reopen. |
| **Decision** | Prefer query params `/?studioV2=1&caseId=<intakeCaseId>` (`estimateId` accepted as alias for the same intake case id). Opening a case in V2 `pushState`s `caseId`; init parses the URL and mounts Studio V2 workspace directly when `studioV2=1` + valid `caseId` are present; Back / Inbox nav clears `caseId` while preserving `studioV2=1`; `popstate` restores or clears selection. Invalid deep-links and failed workspace loads show a recoverable error with Back to Inbox. Navigation/state restoration only — no auto approve/calculate/publish/create. V1 remains default when `studioV2=1` is absent. |
| **Why** | Estimators refresh mid-workspace constantly; Inbox bounce was avoidable operational friction. |
| **SQL** | None. |
| **Impacted** | `studioV2Url.mjs` (+ test), `StudioApp.tsx`, `StudioV2EstimatorShell.tsx` (load-error Back), this doc. |
| **Protected** | Pricing formulas/rates, Digital Estimate pricing, Studio V2 approve/publish/revision logic, V1 default Inbox behavior without `caseId`. |
| **Revisit trigger** | If Studio gains a real client router, migrate these helpers onto route params without changing the public `studioV2` + `caseId` contract. |

### 244. Quote Platform head architecture and scaffold inventory (2026-08-02)

The ownership boundaries, current repository scaffold, migration/retirement maps, V1 retirement gates, and ordered implementation slices for Intake, AI Takeoff Lab, Estimate Queue, Studio V2, Digital Estimates, Product Catalog, Sold Handoff, Quote Library/Estimate History, and Account Directory/Pricing Rules are documented in [`QUOTE_PLATFORM_HEAD_ARCHITECTURE.md`](./QUOTE_PLATFORM_HEAD_ARCHITECTURE.md). This is a documentation-only decision; it changes no runtime behavior.

### 245. Digital Estimates Head Slice 1 — read-only Command Center (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/digital-estimates-command-center` |
| **Decision** | Extend the existing organization-scoped Live Digital Estimates portfolio service into the Digital Estimates Head read model. The list returns independent `viewed`, `savedSelections`, `reviewRequested`, and `accepted` facts, backend-persisted published/current/difference totals, source `intakeCaseId`, expiration, and latest activity. Display status priority is Accepted → Needs Elite review → Selections saved → Expired → Viewed → Published. Customer URLs remain excluded from list DTOs and are recovered only through authenticated staff detail reads. |
| **UI boundary** | `digitalEstimates/DigitalEstimatesPage.tsx` is the first head module, temporarily mounted in the Elite 100 shell. It exposes read visibility, Open Studio V2, Open customer link, Copy customer link, and detail only. Legacy publish remains a separate shell entry; revoke/replace and other publication mutations are hidden in this head slice. |
| **Source of truth** | Publications/events from the Digital Estimate repository; latest saved backend calculation from the configuration repository; open review state from the amendment repository; acceptance from the Studio lifecycle repository. |
| **Security** | Existing staff auth/head/pilot stack and backend organization context remain mandatory. Repository reads include `organization_id`; list/detail DTOs omit tokens, wrapped tokens, raw selection payloads, formulas, rates, pricing evidence, and internal economics. |
| **Protected** | Pricing math, customer selection saves, acceptance, approval, publication, revision, sold handoff, AI Takeoff, approved/publication snapshots, and V1 behavior. |

### 246. Elite 100 shell exposes quote-platform heads explicitly (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/elite100-head-shell-cleanup` |
| **Decision** | The Elite 100 primary shell now exposes **Inbox**, **Estimates**, **Digital Estimates**, and **Studio V2** as explicit first-class navigation. Digital Estimates continues to mount the read-only Command Center head module temporarily inside this shell. Direct Studio V2 navigation without a selected case shows a landing state that points staff to Inbox, Estimates, or Digital Estimates. Legacy Publish, Review Requests compatibility, Command Center compatibility, and the Legacy Queue remain under **More**, grouped as legacy/compatibility or support tools. |
| **Why** | Mixing current heads with V1 and compatibility surfaces made tabs appear to own unrelated domains and hid the Digital Estimates Head. The cleanup clarifies ownership without splitting apps or changing workflows. |
| **SQL** | None. |
| **Impacted** | `StudioApp.tsx`, `StudioV2EstimatorShell.tsx` labels, `styles.css`, shell/navigation tests, this doc. |
| **Protected** | Pricing, publishing, approval, revision, customer selection, final acceptance, sold handoff, AI Takeoff, Digital Estimates read models, customer-facing Digital Estimate behavior, approved/publication snapshots, and V1 fallback behavior. |
| **Revisit trigger** | When Studio V2 or another quote-platform head receives an independent protected route/app shell, replace the temporary Elite 100 mount without changing the documented head ownership or Studio V2 deep-link contract. |

### 247. Standalone AI Takeoff Lab team-ready UI refactor (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/ai-takeoff-lab-team-ready` |
| **Decision** | Standalone AI Takeoff Lab refactor keeps AI Takeoff as measurement evidence/review head. Studio V2 remains estimate authority; no Studio V2 takeoff import behavior changed. The `app-ai-takeoff` head now presents a team-facing landing: title "AI Takeoff Lab", helper text ("Review AI-generated measurements before they are used in estimates. AI Takeoff owns measurement evidence only; Studio V2 owns pricing and publishing."), explicit sections (Takeoff Jobs, Upload / Start Takeoff, Review Workbench, Approved / History), plain-English job statuses (Not started / Running / Failed / Needs review / Approved), clear empty states, and safety language stating pricing and publishing are not owned here. |
| **Boundary** | Frontend-only, inside `app-ai-takeoff`. Sections map to existing surfaces/endpoints (`GET /api/takeoff-jobs`, existing upload/generate/review/approve flows); Approved/History reuses the existing `review_status=approved` list query. Status labels are frontend display mappings — no new persisted statuses, no invented project/customer/linked-estimate columns (not in the list DTO), and no fake demo rows. |
| **SQL** | None. No Supabase migrations. |
| **Impacted** | `app-ai-takeoff/src/TakeoffLabApp.tsx`, `components/TakeoffRunInbox.tsx`, `lib/takeoffJobStatusLabels.mjs` (new), `lib/takeoffJobStatusLabels.test.mjs` (new), `lib/teamReadyLanding.ui.test.mjs` (new), `styles.css`, this doc. |
| **Protected / unchanged** | AI measurement engine and extraction algorithms; Studio V2 takeoff import (`studioV2TakeoffImport.mjs`) and Studio V2 shell/panels; Elite 100 pricing calculators, publishing, approval, revision, Digital Estimate, customer acceptance, and sold handoff; approved estimate and publication snapshots. Safety grep confirms `app-ai-takeoff` production code contains no `autoApprove`/`autoCalculate`/`simplified-publish`/`refresh-from-takeoff`/`ensure-editable-draft` coupling. |
| **Revisit trigger** | When AI Takeoff Lab needs project/customer/linked-estimate columns or an "Imported / linked" status, add an organization-scoped read-model enrichment to the takeoff job list DTO before surfacing it in the UI. |

### 248. Studio V2 creates an editable revision from submitted customer selections (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/create-revision-from-customer-selections` |
| **Decision** | Studio V2 can create an editable revision from submitted Digital Estimate customer selections. The staff browser sends only confirmation plus optional publication/review-request identifiers and a `clientMutationId`; the server resolves the organization-scoped active publication, immutable review request, submitted selection row, and approved Studio source. The revision uses the V2 sibling path, so the approved estimate and active publication remain unchanged until a later explicit approve + republish. |
| **Mapping boundary** | A conservative server mapper applies only choices that have existing Studio V2 draft authority: catalog-backed material pricing group/color when it maps safely, and supported edge profiles on existing rooms/pieces. Allowed Digital Estimate product selections (sink/faucet/accessory/specialty) remain customer configuration summaries. Physical-scope requests (openings, waterfalls, splash change requests, dimensions implied by notes, extra rooms/pieces) are persisted as **not automatically applied** estimator-review metadata. Customer-supplied totals, formulas, rates, dimensions, approval, publication, acceptance, and lifecycle fields are never mapped. |
| **Revision state** | The new row is `ready_to_price`, editable, calculation-empty, approval-empty, unpublished, and marked `createdFromCustomerSelections`. Metadata records source publication/review request/selection/approved estimate IDs, applied summaries, not-applied requests, warnings, actor, and timestamp in existing `scope_json`; no migration is required. The review request advances to `amendment_prepared` and an org-scoped audit event records the bridge. |
| **Idempotency** | The submitted review-request/selection/source identity is stored on the sibling revision and deterministically derives its estimate UUID. The `studio_estimates` primary key is therefore the cross-process duplicate-click barrier: one concurrent insert wins and the other returns that same revision. A different editable revision returns a conflict rather than creating another draft. Accepted unchanged estimates are blocked, and missing acceptance authority fails closed. |
| **Review lifecycle** | Creation advances the submitted request to `amendment_prepared`. A later successful explicit republish advances that same request to `updated_estimate_published`, so it no longer remains an open acceptance blocker. Later customer submissions can create another revision cycle because idempotency is matched to the active review-request identity, not merely the presence of historical revision metadata. |
| **Impacted** | `studioV2CustomerSelectionRevision.mjs` (+ test), `studioV2Service.mjs`, `studioV2Errors.mjs`, `elite100StudioV2Routes.js`, `configurationRepository.mjs`, `amendmentRepository.mjs`, `StudioV2CustomerSelectionReviewPanel.tsx`, `StudioV2EstimatorShell.tsx`, UI contract test, styles, this doc. |
| **Protected / unchanged** | Pricing formulas/rates, approved estimate rows, published Digital Estimate snapshots and active customer links, customer-facing pricing behavior, manual revision/V1 behavior, calculate/approve/publish rules, acceptance, sold handoff, AI Takeoff, Internal Estimate. No auto-calculate, auto-approve, auto-publish, auto-accept, or sold mutation. |
| **Revisit trigger** | When Studio V2 gains first-class editable product and backsplash configuration fields, extend the mapper through those governed fields; do not encode product prices or physical scope into generic metadata/add-ons. |

### 249. Selection-only Digital Estimate submissions are not Studio V2 revision requests (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `fix/selection-only-vs-scope-review` |
| **Decision** | Digital Estimate selection-only submissions are no longer treated as Studio V2 revision requests. Allowed customer choices remain customer configuration; only physical scope/manual-review requests require Elite review and Studio V2 revision. |
| **Why** | Customers changing material, edge, sink, faucet, backsplash option, or specialty products were incorrectly marked Needs Elite review and offered Create revision even though Digital Estimate already owns those priced choices. Estimators saw stale revisions with product “not applied” warnings and no real physical-scope work. |
| **Classification** | `classifyCustomerConfigurationForReview(...)` separates selection-only changes from physical scope/manual-review requests. `requiresEliteReview` is true only for physical scope / unsupported manual-review signals. Allowed priced products are never treated as physical scope merely because Studio V2 lacks first-class editable product fields. |
| **Status labels** | Digital Estimates Command Center keeps **Needs Elite review** only for physical-scope submissions. Selection-only send/submit reads as **Selections submitted**. Saved-but-not-sent remains **Selections saved**. |
| **Studio V2 panel** | Selection-only shows Customer final selections + configured total and hides Create revision. Physical-scope shows Needs Elite review and keeps the create-revision bridge. |
| **Create-revision gate** | The existing endpoint remains, but selection-only submissions return `customer_selection_revision_not_required` / “No Studio V2 revision is required for selection-only customer choices.” |
| **Impacted** | `customerConfigurationFoundation.mjs`, `reviewRequestService.mjs`, `liveDigitalEstimatesStatus.mjs`, `liveDigitalEstimatesService.mjs`, `studioCustomerSelectionReview.mjs`, `studioV2CustomerSelectionRevision.mjs`, `studioV2Service.mjs`, `studioV2Errors.mjs`, `StudioV2CustomerSelectionReviewPanel.tsx`, tests, this doc. |
| **Protected / unchanged** | Pricing formulas, customer live-pricing math, approved estimate immutability, published snapshots, publish/approve/acceptance/sold rules, AI Takeoff, Internal Estimate. No auto-approve, auto-publish, or sold mutation. |
| **Revisit trigger** | If staff later need a lightweight “acknowledge selection-only submission” workflow that is not a Studio revision, add a separate non-revision acknowledgment path. |

### 250. Customers can accept selection-only Digital Estimate configurations (2026-08-02)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-02 · `feature/accept-configured-digital-estimate-selections` |
| **Decision** | Customers may accept a Digital Estimate with allowed **selection-only** changes (`acceptedAsConfigured`) using the latest saved configuration. “Send selections” is optional for this path. Unchanged estimates keep existing `acceptedAsPublished` behavior. Physical scope / manual-review requests still block acceptance and require Elite review. |
| **Why** | Selection-only choices (material, edge, products, allowed backsplash prefs) are already priced on Digital Estimate and are not Studio V2 revision work. Blocking acceptance forced an unnecessary send/review cycle. |
| **Acceptance rules** | Browser sends only `{ confirm: true }`. Server classifies via `classifyCustomerConfigurationForReview` / `classifyReviewRequestForEliteReview`, chooses published vs configured mode, and stores a server-derived configured total only. Missing, stale, fail-closed, or non-authoritative configured totals block with a clear error — never client-sent totals. |
| **Open review requests** | Configured accept may close/supersede **selection-only** open review requests. Physical-scope / manual-review open requests are never closed by acceptance and continue to block. |
| **Staff visibility** | Digital Estimates Command Center already prioritizes Accepted. Studio V2 customer selection panel shows Accepted + configured vs published mode and the accepted total. |
| **Impacted** | `studioFinalAcceptanceService.mjs` (+ tests), `publicConfigurationService.mjs`, `reviewRequestService.mjs`, `studioV2Service.mjs`, public Digital Estimate CTA/modal, Studio V2 selection panel, this doc. |
| **Protected / unchanged** | Pricing formulas, live-pricing math, publish/approve rules, Studio revision, sold handoff, AI Takeoff, Internal Estimate, Supabase migrations, approved snapshots, published snapshots. No auto-approve, auto-publish, or sold mutation. |
| **Revisit trigger** | If configured accept should also acknowledge staff-side selection-only submissions without closing the review row, add a dedicated non-acceptance acknowledgment path. |

### 251. Digital Estimate selection exchange — canonical identity + customer-safe summaries (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-selection-exchange-identity` |
| **Decision** | Digital Estimate selection exchange uses **canonical published envelope option keys** for all customer-selectable roles (material, edge, backsplash, sink, faucet, accessory/specialty). Mutually exclusive baseline choices are **not resurrected** after a customer selects another option in the same role/room. Customer-facing saved-selection summaries use **customer-safe labels**, never raw option keys (`aura_taj`, `edge_eased`, product IDs). |
| **Why** | Production saves failed with `selection_unavailable` / mislabeled `DE-EXCHANGE-404` when UI/display keys, stale backsplash drafts, finish-suffixed ESF keys, or baseline rehydration disagreed with the frozen envelope. Room card, sidebar, modal, and “Your selections” could disagree and leak internal tokens. |
| **Rules** | (1) Frontend submits envelope keys (ESF finish keys collapse to family envelope rows). (2) Backend may remap known safe aliases onto envelope rows but still rejects truly off-envelope keys. (3) Exclusive room roles skip baseline `defaultQty` re-add when another positive selection exists. (4) Explicit backsplash selection quantity wins over a stale draft mode. (5) Selection identity errors map to `DE-OPTION-NOT-ALLOWED`, not lifecycle `DE-EXCHANGE-404`. |
| **Impacted** | `configurationValidation.mjs`, `publicConfigurationService.mjs`, `customerConfigurationFoundation.mjs`, `ConfigurationView.tsx`, `lovableViewModel.ts`, `publicConfigApi.ts`, `sinkSelectionDisplay.ts`, selection identity / foundation tests, this doc. |
| **Protected / unchanged** | Pricing formulas, sink/cutout prices, Studio V2 approve/publish/revision, Digital Estimate acceptance rules (except display/read-model labels), sold handoff, AI Takeoff, Internal Estimate, Supabase migrations. Backend remains selection authority. |
| **Revisit trigger** | If a new exclusive role is added to the envelope, extend `EXCLUSIVE_ROOM_ROLES` and label resolvers; do not loosen off-envelope rejection. |

---

### 252. Digital Estimate — sanitize contaminated exclusive saved selections (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-contaminated-selection-sanitize` |
| **Decision** | Persisted Digital Estimate selection quantities are **sanitized for exclusive room roles** before public read-model, save validation, and pricing. When a room has multiple positive qty values for the same role (e.g. ESF sink + customer_provided), the server keeps the clear envelope-backed winner and strips losers. |
| **Why** | Pre-identity-fix saves could persist both ESF and customer_provided sink (and similar exclusive conflicts). The page reloaded contaminated; later unrelated saves (e.g. backsplash none) re-submitted the bad sink pair and failed with `selection_unavailable`. |
| **Rules** | (1) ESF sink/faucet beats customer_provided / none. (2) Explicit non-baseline material/edge/backsplash beats published baseline in the same role. (3) Finish-suffixed ESF keys remap to envelope family keys when present. (4) Ambiguous dual non-baseline winners fail closed. (5) Truly off-envelope keys still reject. Physical cutout baseline scope is unchanged. |
| **Where** | `sanitizeExclusiveRoomSelections.mjs` → exchange/read meta, save selectionMap (before availability), and `normalizeSelectionPayload`. |
| **Impacted** | `sanitizeExclusiveRoomSelections.mjs` (+ test), `configurationValidation.mjs`, `publicConfigurationService.mjs`, this doc. |
| **Protected / unchanged** | Pricing formulas, sink/cutout prices, Studio V2 approve/publish/revision, acceptance rules, sold, AI Takeoff, Internal Estimate, migrations. Backend remains selection authority. |
| **Revisit trigger** | If new exclusive roles are published, extend the sanitizer priority table; do not auto-pick between two different customer non-baseline options. |

---

### 253. Digital Estimate — sanitized selections drive all read models (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-contaminated-selection-sanitize` |
| **Decision** | After exclusive-role sanitation, **every** Digital Estimate read model (public room cards, sidebar/current estimate breakdown, print, “Your selections”, Studio V2 customer final selections, configuration summaries) must use the same effective sanitized quantities/drafts. Persisted `roomPricing` add-on lines from contaminated calcs are filtered so customer-provided sink losers cannot reappear beside ESF. |
| **Why** | Qty/meta were sanitized on exchange, but sidebar/print still rendered stale `latestCalculation.roomPricing` lines that still listed both ESF and customer-provided sinks. Studio summary and public cards could therefore disagree. |
| **Where** | Exchange + save wrap calc DTOs with `sanitizeCustomerCalculationForExclusiveSelections`; `buildCustomerConfigurationSummary` and Studio review sanitize quantities; public UI collapses exclusive qty and dedupes sink add-on lines in breakdown/print. |
| **Impacted** | `sanitizeExclusiveRoomSelections.mjs`, `publicConfigurationService.mjs`, `customerConfigurationSummary.mjs`, `studioCustomerSelectionReview.mjs`, `sinkSelectionDisplay.ts`, `lovableViewModel.ts`, `customerEstimateBreakdown.ts`, `customerPrintAdapter.ts`, tests, this doc. |
| **Protected / unchanged** | Pricing formulas, sink/cutout prices, Studio V2 approve/publish/revision, acceptance, sold, AI Takeoff, Internal Estimate, migrations. |
| **Revisit trigger** | If calculation rows are rewritten on read, prefer reprojecting roomPricing from sanitized selections instead of display-only filtering. |

### 254. Studio V2 Repair Digital Estimate rebuilds customer configuration envelope (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-repair-rebuild-envelope` |
| **Decision** | Studio V2 **Repair Digital Estimate** rebuilds the active customer configuration envelope and sanitizes existing saved customer selections while keeping the customer link stable. Repair does not email, approve, accept, sell, or change pricing formulas. When an already-published revision is repaired (idempotent reuse), Studio always re-seeds and activates a new envelope from the current approved snapshot, migrates the latest publication selection onto that envelope with exclusive-role sanitation (ESF sink wins, none backsplash wins over baseline, aliases remapped, off-envelope keys dropped), and returns repair metadata (`publicationId`, envelope rebuilt, option counts, sanitized/dropped counts, active publication unchanged). |
| **Why** | Production “Republish / Repair” returned 200 with “customer link is unchanged” but skipped envelope rebuild whenever any active envelope already existed — leaving public `/selections` on stale keys and contaminated saved state (`selection_unavailable` / `DE-EXCHANGE-404` for sink/backsplash). |
| **Where** | `studioEstimateDigitalEstimateService.mjs` always calls repair rebuild on interactive reuse; `repairPublicationSelections.mjs` + configuration repository migrate/sanitize; V2 publish DTO surfaces repair metadata; staff notice distinguishes actual repair. |
| **Impacted** | `studioEstimateDigitalEstimateService.mjs`, `studioV2Publish.mjs`, `studioV2Service.mjs`, `configurationRepository.mjs`, `configurationStudioService.mjs`, `repairPublicationSelections.mjs`, `studioV2RepairRebuildsEnvelope.test.mjs`, this doc. |
| **Protected / unchanged** | Pricing formulas, material rates, sink/cutout prices, Studio V2 approval, acceptance, sold, AI Takeoff, Internal Estimate, email, migrations, first-time publish semantics. |
| **Revisit trigger** | If envelope activate cannot keep the same public token; if a full reprice on repair is required beyond sanitized display calc. |

### 255. Digital Estimate public saves after repair — governed qty echo + prior fallback (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-selection-envelope-diagnostics` |
| **Decision** | After Repair rebuilds the envelope, public `/selections` must succeed for UI-displayed sink/backsplash/material choices. **Exact rejected key (pre-fix):** `qty-sink` via `governed_scope_quantity_forbidden` — the UI re-submitted the full restored selection map including governed fabrication qty. **Fix:** (1) public `currentSelections` omit governed scope keys; (2) UI `buildSelectionItems` never submits them; (3) repair migration drops them; (4) save rejects only *changed* governed qty (echo of prior/baseline allowed) and attaches `selectionKey` diagnostics; (5) save prior falls back to publication+active-envelope selection when the new post-repair session has none. Customer errors stay friendly; staff/tests see rejected key + envelope id. Off-envelope keys still fail. |
| **Why** | Repair correctly rebuilt the envelope and cleaned display, but hard-refresh restored `qty-sink` into the customer qty map; every role save then failed before option validation. |
| **Impacted** | `publicConfigurationService.mjs`, `lovableViewModel.ts`, `repairPublicationSelections.mjs`, `selectionSaveAfterRepair.test.mjs`, governed-scope tests, this doc. |
| **Protected / unchanged** | Pricing formulas, material rates, sink/cutout prices, Studio V2 approval/publish/revision, acceptance, sold, AI Takeoff, Internal Estimate, migrations. |
| **Revisit trigger** | If room-scoped `qty-sink:<room>` must be customer-editable for a future product; if governed keys need a dedicated UI surface. |

### 256. Digital Estimate edge summary follows selection qty, not stale foundation (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/digital-estimate-edge-selection-summary-consistency` |
| **Decision** | Customer-selected edge is authoritative from sanitized effective selection quantities (`edge:{room}:{profile}`). Public “Saved selections”, Studio V2 customer final selections, and persisted foundation `selectedEdgeProfile` must follow that qty winner — not a stale baseline foundation label (e.g. Eased) when pricing/sidebar already show Crescent. Enrichment overrides stale foundation material/edge from qty; save persists the synced foundation; Studio room/edge labels prefer qty-derived summary. Do not infer edge from pricing lines when qty exists. |
| **Why** | After edge upgrade saves, sidebar/breakdown correctly showed Crescent +$608 while Saved selections and Studio still showed Eased because `enrichFoundationFromSelectionQuantities` only filled edge when foundation was empty. |
| **Impacted** | `customerConfigurationFoundation.mjs`, `publicConfigurationService.mjs`, `studioCustomerSelectionReview.mjs`, foundation + Studio review tests, this doc. |
| **Protected / unchanged** | Edge pricing formulas, material rates, sink/cutout prices, approval/publish/revision, acceptance, sold, AI Takeoff, Internal Estimate, migrations. |
| **Revisit trigger** | Multi-room distinct edge profiles needing per-room foundation fields beyond the first positive qty. |

---
### 257. Elite 100 Estimate Studio command-center UI polish (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/elite100-production-command-center-layout` |
| **Decision** | Elite 100 Estimate Studio receives a **presentation-only** command-center layout pass aligned with Quote Library polish: hero shell (workflow subtitle + Elite Stone Fabrication workspace identity), clearer primary nav chrome, production Estimates table/cards with status pills, scannable Digital Estimates rows (activity flags + next action), Inbox labeled as Step 1 of the workflow, polished Studio V2 empty landing, and lightly grouped New Estimate form fields. Primary nav order and More → legacy/compatibility tools are unchanged. |
| **Why** | Staff landed on a raw Inbox/debug feel and developer-style lists; operational hierarchy (what needs attention → next action) was hard to scan even though workflows already worked. |
| **Impacted** | `app-elite100-estimate-studio/src/shell/*`, `StudioApp.tsx`, `AllEstimatesPage.tsx`, `LiveDigitalEstimatesPage.tsx`, `SharedInboxPage.tsx`, `ManualEstimateWizard.tsx`, `styles.css`, layout/nav UI tests, this doc. |
| **Protected / unchanged** | Pricing formulas, material rates, sink/cutout prices, selection save, acceptance rules, publish/repair, Studio V2 approval/revision, sold, AI Takeoff, Internal Estimate, migrations, public Digital Estimate behavior, backend APIs. |
| **Revisit trigger** | Hero metrics from live portfolio aggregates without new APIs; deeper Studio V2 workspace chrome alignment; replacing More compatibility surfaces with retirement plan. |

---
### 258. Digital Estimates command-center readability pass (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/elite100-production-command-center-layout` |
| **Decision** | Digital Estimates command center received a presentation-only readability pass. Main rows now show status, values, activity, next action, and safe actions; secondary publication/activity details remain in the drawer. No pricing, publish, approval, revision, acceptance, sold, or customer configuration behavior changed. |
| **Why** | Working Digital Estimate rows were operationally dense (boolean flags, UUIDs, stacked values) and hard to scan compared with Quote Library / Estimates. |
| **Impacted** | `LiveDigitalEstimatesPage.tsx`, `styles.css`, Digital Estimates UI tests, this doc. |
| **Protected / unchanged** | Pricing formulas, selection save, acceptance rules, publish/repair, approval, revision, sold, AI Takeoff, Internal Estimate, migrations, Live DE list/detail API contracts. |
| **Revisit trigger** | Staff display names for estimators become available; command-center status set expands beyond current pills. |

---
### 259. Public Digital Estimate premium customer UI pass (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/public-digital-estimate-premium-ui` |
| **Decision** | Public Digital Estimate received a premium customer-facing presentation pass. The customer page, room selections, estimate summary, option modals, status states, and mobile layout were polished without changing pricing, customer configuration authority, acceptance, publish, repair, revision, sold, AI Takeoff, Internal Estimate, or migrations. |
| **Why** | The customer estimate link is a primary slabOS surface; the prior Tailwind-neutral UI worked but lacked Elite brand confidence, hierarchy, and mobile polish expected of a premium fabrication experience. |
| **Impacted** | `app-digital-estimate/src/lovable-theme.css`, `ConfigurationView.tsx` (presentation/copy only), customer experience polish test, this doc. |
| **Protected / unchanged** | Pricing formulas, material/sink/cutout/edge rates, selection save payloads, acceptance rules, print model authority, publish/repair, Studio V2, sold, AI Takeoff, Internal Estimate, migrations, public token lifecycle. |
| **Revisit trigger** | Dedicated design system package for customer heads; print document shared `cep-*` visual refresh. |

---

### 260. Public Digital Estimate initial-load breakdown hydration (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/public-digital-estimate-premium-ui` |
| **Decision** | Public Digital Estimate initial load now hydrates the customer-safe estimate breakdown from the published/as-configured calculation source, so customers do not need to save a selection before seeing the breakdown. No pricing, save, acceptance, publish, repair, revision, or sold behavior changed. |
| **Why** | Fresh published links often expose baseline totals without a selection `latestCalculation.roomPricing` DTO; the sidebar treated missing rooms as “Save a selection…” even when `estimate.roomPricing` already held the published snapshot. |
| **Impacted** | `customerEstimateBreakdown.ts` (`resolveCustomerSafeRoomPricing`), `ConfigurationView.tsx` display/print hydration, initial-load breakdown test, this doc. |
| **Protected / unchanged** | Pricing formulas, selection save payloads, acceptance rules, publish/repair, Studio V2, sold, AI Takeoff, Internal Estimate, migrations, token lifecycle. |
| **Revisit trigger** | Backend exchange always seeds a baseline calculation DTO with published roomPricing for brand-new sessions. |

---

### 261. Public Digital Estimate backsplash baseline display + selected chrome (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/public-digital-estimate-premium-ui` |
| **Decision** | Public Digital Estimate backsplash display now derives the selected baseline from effective selection authority instead of backsplash eligibility/default metadata. Selected option styling was softened for premium customer-facing presentation. No pricing, save, acceptance, publish, repair, revision, sold, AI Takeoff, Internal Estimate, or migration behavior changed. |
| **Why** | Rooms with eligible wall runs were seeded/displayed as “4-inch backsplash / Included” even when the published pricing baseline was No backsplash, so the card disagreed with the total until the customer changed options. |
| **Impacted** | `digitalEstimateProductOptions.mjs` seeding + align helper, `publicConfigurationService.mjs` public option alignment, `lovableViewModel.ts` published-mode selection, selected option CSS, backsplash baseline display tests, this doc. |
| **Protected / unchanged** | Backsplash pricing formulas/rates, selection save authority, acceptance, publish/repair, Studio V2, sold, AI Takeoff, Internal Estimate, migrations. |
| **Revisit trigger** | Envelope republish migrates historical wrong includedInBaseline flags at rest (read-time alignment already corrects public DTO). |

---

### 262. Public Digital Estimate selected-state chrome hotfix (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/public-de-selected-style-light` |
| **Decision** | Public Digital Estimate selected option rows use dedicated light burgundy selected tokens (`.de-option-selected` / `.de-option-selected-badge`) and must not render as dark green/gray fills. Legacy document CSS variables in `styles.css` are namespaced (`--de-doc-*`) so they no longer overwrite theme `--accent` / `--border` / `--radius` after import. |
| **Why** | `main.tsx` imports `lovable-theme.css` then `styles.css`. Legacy `:root --accent: #24513f` overwrote the premium light accent, so `.de-option-selected { background: color-mix(..., var(--accent), ...) }` still painted dark green selected bars (especially edge rows). |
| **Impacted** | `lovable-theme.css` selected tokens, `styles.css` legacy token names, `ConfigurationView.tsx` option selected classes (edge, ChoiceRadio, material, sink/faucet cards/finishes, accessories, specialty, plumbing source), selected-style tests, this doc. |
| **Protected / unchanged** | Pricing, backsplash logic, custom-height logic, selection save, acceptance, publish/repair, Studio V2, sold, AI Takeoff, Internal Estimate, migrations. |
| **Revisit trigger** | Split legacy document CSS into a separate entry that never shares `:root` with the Tailwind configuration theme. |

---

### 263. Shared Inbox plan attachments + AI Takeoff handoff (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `feature/inbox-plan-attachments-ai-takeoff` |
| **Decision** | Shared Inbox treats plan-like PDF **and** JPEG/PNG/WEBP attachments as AI Takeoff candidates (conservative filename/MIME signals; uncertain images need staff “Mark as plan”). Staff can **Send to AI Takeoff** from Inbox detail; the backend imports if needed, then creates/reuses a takeoff job via the existing open-estimate handoff. No migration. |
| **Why** | Customers often send phone photos/screenshots of plans; Inbox previewed images but only `direct_pdf` counted as supported, so rows incorrectly said “No supported plan.” |
| **Impacted** | `quoteIntakePlanAttachmentSupport.mjs`, attachment classifier/mailbox eligibility, Shared Inbox read model + UI, `send-to-takeoff` route/service, plan byte ingest/open-estimate selection (PDF+images), tests, this doc. |
| **Protected / unchanged** | Start/Resume Estimate, pricing, calculate/approve/publish, Digital Estimate, acceptance, sold, Studio V2 revision creation, Internal Estimate, AI measurement algorithms, migrations. |
| **Revisit trigger** | Persist permanent staff plan-mark overrides on attachment rows; richer multi-attachment takeoff job selection UI. |

### 264. Shared Inbox manual image plan override for AI Takeoff (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/inbox-image-plan-manual-override` |
| **Decision** | “Mark as plan for AI Takeoff” sends explicit `manualPlanOverride: true` (alias `markAsPlan`). Backend honors override only for safe JPEG/PNG/WEBP (MIME/ext), never for inline/non-images. Open-estimate selection matches intake UUID **or** Graph `sourceAttachmentId`, and accepts extension-based images (e.g. octet-stream + `.jpg`). |
| **Why** | Production returned 400 when staff marked `image_needs_review` JPGs as plans: override intent was too easy to miss downstream, and selection required intake UUID + `image/*` MIME only. |
| **Impacted** | Shared Inbox UI/API, `send-to-takeoff` route/service, `selectSupportedPdfAttachment`, plan-support helpers/tests, this doc. |
| **Protected / unchanged** | Pricing, Digital Estimate, acceptance, publish, approval, revision, sold, AI algorithms, Internal Estimate, migrations. Auto-send still requires `direct_pdf` / `direct_image_plan`. |
| **Revisit trigger** | Persist override on the attachment row so re-preview does not require re-marking. |

### 265. Graph opaque attachment key + scoped filename for manual JPG takeoff (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/inbox-graph-jpg-manual-takeoff` |
| **Decision** | Manual image override resolves the selected attachment with Graph/intake identity keys **and**, when needed, a **message/case-scoped filename** fallback. `send-to-takeoff` passes `attachmentFilename` into open-estimate. `direct_pdf` selection remains markAsPlan-free. |
| **Why** | Production Dave Untiedt JPGs sent `attachmentKey: "AAMk..."` from live Graph preview, but persisted intake case rows often lacked matching `sourceAttachmentId`, so open-estimate threw `no_supported_pdf` → 400 `attachment_not_supported` despite a valid `.jpg` override. |
| **Impacted** | `findScopedAttachment`, Shared Inbox send-to-takeoff, `selectSupportedPdfAttachment` / open-estimate resolution, tests, this doc. |
| **Protected / unchanged** | PDF auto takeoff, Digital Estimate, pricing, acceptance, publish, approval, revision, sold, AI algorithms, migrations. `image_needs_review` still does not auto-send. |
| **Revisit trigger** | Persist full Graph attachment immutable ids without truncation; optional permanent plan-mark on the attachment row. |

### 266. Hydrate Graph attachment id for manual JPG Takeoff byte fetch (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/inbox-graph-jpg-production-shape` |
| **Decision** | After selecting a manually overridden image plan, open-estimate **hydrates** missing/truncated `sourceAttachmentId` from the live request Graph `attachmentKey` (and `providerMessageId` from the case message id) so Graph byte fetch can proceed. Staff-only `diagnostic` object is returned on `attachment_not_supported` (prefix/booleans/filenames only). |
| **Why** | After §265, selection succeeded via scoped filename, but production still returned `attachment_not_supported` because `resolveValidatedPlanBytes` requires `sourceAttachmentId` and persisted Dave Untiedt rows had it null → `attachment_bytes_unavailable` remapped to the same 400. |
| **Impacted** | `hydrateAttachmentGraphIdentity`, Shared Inbox send-to-takeoff diagnostics/route, open-estimate, tests, this doc. |
| **Protected / unchanged** | PDF auto takeoff (existing `sourceAttachmentId` not overwritten), Digital Estimate, pricing, acceptance, publish, approval, revision, sold, AI algorithms, migrations. |
| **Revisit trigger** | Remove staff diagnostics once production shape is confirmed stable; persist Graph attachment ids durably at import. |

### 267. Live Graph image candidate when intake case has zero attachments (2026-08-03)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-03 · `hotfix/inbox-graph-jpg-no-case-attachment` |
| **Decision** | For staff `manualPlanOverride` only: when the live Inbox/Graph attachment is a safe JPG/PNG/WEBP but the persisted intake case has **no matching attachment rows**, Shared Inbox builds a **server-side in-memory** attachment candidate (`sourceAttachmentId` + `providerMessageId` + filename/MIME) and passes it to open-estimate as `deps.liveManualAttachment` (never from the browser body). Bytes still come from Graph fetch + existing ingest. |
| **Why** | Production diagnostic showed `intakeCaseAttachmentCount: 0` / `rejectedReason: open_estimate:no_supported_pdf` for Dave Untiedt `1000005197.jpg` — prior fixes assumed a persisted attachment row existed. |
| **Impacted** | `buildLiveManualPlanAttachmentCandidate`, Shared Inbox send-to-takeoff, `selectSupportedPdfAttachment` / open-estimate, tests, this doc. |
| **Protected / unchanged** | PDF auto takeoff, Digital Estimate, pricing, acceptance, publish, approval, revision, sold, AI algorithms, migrations. `image_needs_review` still does not auto-send. |
| **Revisit trigger** | Persist Graph attachment metadata on import so live candidates are rarely needed; remove staff diagnostics after stable production. |

### 268. Live Graph image takeoff link must not write opaque ids into UUID FK (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/inbox-takeoff-unavailable-after-image-handoff` |
| **Decision** | After live Graph image handoff reaches ingest/workspace create, `createTakeoffLink` receives `intake_attachment_id` **only when it is a real UUID**. Live manual candidates (`live:…` / Graph AAMk keys) pass `null`. Staff-only `takeoff_unavailable` diagnostics report stage (`graph_fetch` / `ingest` / `workspace_create` / `link_create`). |
| **Why** | Production returned `takeoff_unavailable` after attachment support was fixed: open-estimate passed Graph/synthetic ids into `quote_intake_takeoff_links.intake_attachment_id` (UUID FK), link insert failed, and the catch mapped any non-support error to `takeoff_unavailable`. |
| **Impacted** | `intakeAttachmentIdForTakeoffLink`, open-estimate link/ingest metadata, Shared Inbox send-to-takeoff diagnostics/route, Supabase link insert guard, tests, this doc. |
| **Protected / unchanged** | PDF takeoff (real attachment UUIDs still linked), Digital Estimate, pricing, acceptance, publish, approval, revision, sold, AI algorithms, migrations. |
| **Revisit trigger** | Persist Graph attachment rows at import so links can reference a real intake attachment UUID. |

### 269. Inbox Choose plan + import_failed clarity (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/inbox-takeoff-handoff-clarity` |
| **Decision** | Multi-plan Inbox rows use primary action **Choose plan** (opens details + attachment focus) instead of silent Start Estimate. Details copy: “Choose the plan file to send to AI Takeoff.” Send-to-takeoff maps **ingest** failures to `import_failed` with staff diagnostic `inbox-takeoff-import-failed-v1` (not `attachment_not_supported`). Live Graph PDF candidates work when intake case attachment rows are missing (same pattern as image override). |
| **Why** | Production multi-PDF rows showed Start Estimate but `simplifyInboxPrimaryAction` mapped `review_request` → `resume_estimate` with no `intakeCaseId`, causing a silent no-op. PDF send-to-takeoff could hit import/ingest failure with opaque `import_failed` and no stage. |
| **Impacted** | Shared Inbox read model / simplify action, SharedInboxPage, send-to-takeoff service/route diagnostics, live plan candidate (PDF+image), tests, this doc. |
| **Protected / unchanged** | PDF AI Takeoff, manual image override, Digital Estimate, pricing, acceptance, publish, approval, revision, sold, AI algorithms, migrations. `image_needs_review` still requires Mark as plan. |
| **Revisit trigger** | Persist Graph attachments on import; retire Choose plan once single-plan selection is automatic. |

### 270. Elite 100 Home Launcher visibility follows head access (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/home-launcher-elite100-visibility` |
| **Decision** | Home Launcher (`GET /api/me/heads`) shows **Elite 100 Estimate Studio** (`elite100_estimate_studio`) when Brain has `ELITE100_ESTIMATE_STUDIO_ENABLED=1` **and** the user has System Admin head access (or a full-catalog role). Env pilot ID/email lists are **no longer** an access gate for launcher tiles or Studio staff middleware. Staff APIs still require auth + internal operator + `requireHeadAccess(elite100_estimate_studio)` + Studio enabled. |
| **Why** | Granting Elite 100 in System Admin did not show the Home tile because launcher/API still required a separate hard-coded Brain pilot allowlist — operators could not grant access without redeploying env. |
| **Impacted** | `launcherHeads.js`, `elite100EstimateStudioAccess.mjs`, Phase DE.1.1 / launcher visibility tests, this doc. |
| **Protected / unchanged** | Pricing, Digital Estimate customer flows, AI Takeoff algorithm, publish/approval/acceptance/sold business logic, migrations, quote formulas. |
| **Revisit trigger** | Optional soft “pilot badge” UI using advisory env lists; move feature enablement into org config UI. |


### 271. Studio V2 create draft from Inbox case (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/studio-v2-create-draft-from-inbox-case` |
| **Decision** | When Studio V2 opens for an Inbox/takeoff case with no `studio_estimates` row, show a production empty state (no V1 requirement) with primary **Create Studio V2 Draft**. `POST /api/elite100-studio-v2/cases/:caseId/working-draft` (`confirm: true`) idempotently creates or reuses an editable Working Draft shell via `repository.create` — links intake case + takeoff job when known, seeds safe customer/project basics when present, defaults pricing basis like new estimates. Does **not** auto-create on handoff, does **not** call `refreshTakeoffGate`, calculate, approve, publish, revise, accept, or mark sold. Open Takeoff Review remains available as a supporting tool. |
| **Why** | Inbox → Studio V2 routing worked (`?studioV2=1&caseId=…`) but staff were told to create/open in V1 first because GET working-draft never creates and no V2 create-draft path existed. |
| **Impacted** | `studioV2Service.ensureWorkingDraft`, Studio V2 routes, `StudioV2EstimatorShell` empty state, Slice A / ensure-draft tests, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, publish/approval/revision/acceptance/sold, Internal Estimate, migrations, AI Takeoff algorithm, auto-calculate/auto-approve. |
| **Revisit trigger** | Optional auto-create draft after successful Inbox handoff once production confidence is high. |

### 272. Studio V2 embedded Takeoff Review + Use these measurements (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/studio-v2-takeoff-review-finish` |
| **Decision** | Studio V2 embeds the production AI Takeoff consolidated review (iframe `?consolidated=1&studioV2Finish=1`) as **AI Takeoff Review** — PDF/plan + editable measurements stay in the working Takeoff head. Primary finish CTA is **Use these measurements** (`POST …/takeoff-finish`): approve-and-build (idempotent) → ensure Working Draft → import approved scope. Scope sidebar plan preview uses authenticated intake source-plans blob URLs. Copy no longer references V1 / “Approve Estimate” in the takeoff context. Does **not** calculate, approve estimate revision, publish, accept, or mark sold. |
| **Why** | Production V2 showed a plan-preview placeholder and red “must be approved before importing” friction while staff still needed the working PDF review UI. |
| **Impacted** | `StudioV2TakeoffReviewPanel`, `StudioV2TakeoffImportPanel`, `StudioV2EstimatorShell`, `StudioV2ScopeEditor`, `studioV2Service.finishTakeoffIntoWorkingDraft`, takeoff-finish route, consolidated approve button label, tests, this doc. |
| **Protected / unchanged** | AI Takeoff algorithm, pricing formulas, estimate approval/publish/DE/acceptance/sold, Internal Estimate, migrations. |
| **Revisit trigger** | In-process React extract of ConsolidatedTakeoffReview into a shared package (instead of iframe). |

### 273. Elite 100 Quote Flow head — Slice 1A shell (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/elite100-quote-flow-slice-1a-shell` |
| **Decision** | Add isolated staff head **Elite 100 Quote Flow** (`app-elite100-quote-flow`, slug `elite100_quote_flow`, Brain `/api/elite100-quote-flow/*`, flag `ELITE100_QUOTE_FLOW_ENABLED` exact `"1"`). Slice 1A is shell only: three tabs Inbox / Estimate Queue / Estimates with placeholder copy, health/config stub routes, launcher tile only when flag + head access (or full-catalog role). No attachment selection, start-takeoff, Set Scope, pricing, publish, acceptance, or sold. No V1/V2 language in the new UI. |
| **Why** | Stop patching the tangled Studio V1/V2 hybrid; give estimators a clean product path for tomorrow’s MVP slices. |
| **Impacted** | New app + `elite100QuoteFlow` Brain module, `EOS_HEAD_SLUGS`, launcher/CORS URL keys, `quoteRoutes` mount, head map, this doc. |
| **Protected / unchanged** | AI Takeoff algorithm, Studio V2 behavior, Digital Estimate (`app-digital-estimate` / `backend-core/src/digitalEstimate`), pricing formulas, approval/publish/sold, migrations. |
| **Revisit trigger** | Slice 1B Inbox + start-takeoff; then Queue Set Scope; then Estimates scope detail. |

### 274. Elite 100 Quote Flow Slice 1B — Inbox + start AI Takeoff (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/elite100-quote-flow-slice-1b-inbox-takeoff` |
| **Decision** | Quote Flow Inbox lists real Shared Inbox rows (adapter), shows attachments, and starts/reuses AI Takeoff via existing `sendToAiTakeoff` / `openEstimateForIntakeCase`. Routes: `GET/POST /api/elite100-quote-flow/inbox…`. Statuses: Needs attachment selection / queued / processing / failed / returned. Already-scoped `studio_estimates` block takeoff rerun (`already_scoped`). Idempotent duplicate start. No Set Scope, pricing, calculate, approve, publish, acceptance, or sold. |
| **Why** | Deliver Inbox → select plan → AI Takeoff background start without using the Studio V1/V2 hybrid UI. |
| **Impacted** | `quoteFlowService`, Quote Flow routes, `InboxPage`, presenter/tests, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, Studio V2 behavior, Internal Estimate, AI Takeoff algorithm, migrations. |
| **Revisit trigger** | Slice 1C Estimate Queue + Set Scope. |

### 275. Elite 100 Quote Flow Slice 1C — Estimate Queue + Set Scope (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/elite100-quote-flow-slice-1c-set-scope` |
| **Decision** | Estimate Queue lists returned takeoffs (via Studio queue read model). Review embeds ConsolidatedTakeoffReview (`quoteFlowSetScope=1` → **Use these measurements**). `POST …/queue/:takeoffJobId/set-scope` freezes takeoff via `approveAndBuildEstimate`, ensures `studio_estimates`, seeds `scope_json` via `refreshScopeFromTakeoff({ force: true })`. Idempotent already-scoped returns existing estimateId. No calculate / estimate approve / publish / accept / sold. |
| **Why** | Completes Inbox → verify dimensions → Set Scope without Studio V1/V2 hybrid. |
| **Impacted** | `quoteFlowSetScope`, queue presenter/routes, EstimateQueuePage, consolidated approve label, tests, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, Studio V2 product path, Internal Estimate, AI Takeoff algorithm, migrations. |
| **Revisit trigger** | Slice 1D Estimates list/detail official scope editor. |

### 276. Elite 100 Quote Flow Slice 1D — Estimates + official scope editor (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/elite100-quote-flow-slice-1d-estimates-scope` |
| **Decision** | Estimates tab lists only `studio_estimates` with official scope set (`isOfficialScopeSet`). Detail workspace edits `scope_json` rooms/pieces (manual) via `PATCH …/estimates/:estimateId/scope` → `studioEstimateService.updateScope`. No AI Takeoff iframe, no takeoff rerun, no calculate / estimate approve / publish / accept / sold. Later groups shown as “coming later.” |
| **Why** | Estimators own official scope after Set Scope without reopening AI Takeoff or Studio hybrid chrome. |
| **Impacted** | `quoteFlowEstimates`, estimates presenter/routes, EstimatesListPage + OfficialScopeEditor, tests, head map, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, Studio V2 product path, Internal Estimate, AI Takeoff algorithm, migrations. |
| **Revisit trigger** | Slice for pricing controls / calculation / approval. |

### 277. Elite 100 Quote Flow Inbox polish / operations (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-inbox-polish-progress` |
| **Decision** | Polish Quote Flow Inbox only: group New / needs action → Active AI Takeoffs → Completed; stats cards; safe request labels; attachment selection + detection reason; bulk “Start selected AI Takeoffs” via existing start-takeoff endpoint (per-item success/failure, reuse, already-scoped blocked); coarse takeoff progress stage bars; View in Estimate Queue / Estimates links. No Set Scope, pricing, publish, accept, or sold. |
| **Why** | Estimators need an operational Inbox to start and track multiple takeoffs without Studio chrome. |
| **Impacted** | `quoteFlowInboxPresenter`, `quoteFlowService.listInbox` groups/stats, InboxPage, inboxGrouping helper, tests, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, Estimate Queue Set Scope, Estimates editor, Studio V2, Internal Estimate, AI Takeoff algorithm. |
| **Revisit trigger** | Richer takeoff progress events if/when Brain exposes them. |

### 278. Elite 100 Quote Flow Inbox command center + dismiss (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-inbox-command-center-ui` |
| **Decision** | Quote Flow Inbox is a full-width triage command center (list + detail). **Remove from Quote Flow** dismisses a request from this Inbox only — never deletes Outlook/Graph mail. Persistence: `organization_integration_configs` row `integration_key=quote_flow_inbox` stores `dismissedMessageKeys` + `openedMessageKeys` (no migration). Routes: `POST …/inbox/:messageKey/dismiss|restore|opened`. Opened/unopened is Quote Flow local viewed state (not mailbox unread). Dismissed rows hidden by default; Show removed / Restore. Batch start + background polling preserved. Active takeoffs may be hidden without cancelling the job. |
| **Why** | Estimators need screen-wide triage and a safe way to clear irrelevant requests without touching the shared mailbox. |
| **Impacted** | `quoteFlowInboxStateStore`, presenter/service/routes, InboxPage + styles/shell width, tests, this doc. |
| **Protected / unchanged** | External mailbox delete, Estimate Queue Set Scope, Estimates editor, pricing, Digital Estimate, Studio V2, Internal Estimate, AI Takeoff algorithm. |
| **Revisit trigger** | Dedicated triage table if key volume exceeds JSON config; optional cancel-on-dismiss for active takeoffs. |

### 279. Elite 100 Quote Flow — Estimate Queue as Scope Creation Queue (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-scope-creation-queue` |
| **Decision** | Estimate Queue is the **Scope Creation Queue**, not takeoff history. Default list (`filter=active`) includes only **unscoped** items (ready for AI review, processing, failed, manual). Already-scoped rows are excluded and belong in Estimates. AI path: Review Takeoff → Set Scope / Use these measurements. Manual path: Create Manual Scope builder → `POST …/set-manual-scope` (`getOrCreateForCase` + `updateScope`, no takeoff refresh). After Set Scope (or already_scoped), show temporary success with **Open in Estimates**; item disappears on refresh. Failed takeoffs offer Choose another plan (Inbox) + Create Manual Scope. No pricing/calculate/approve/publish/accept/sold. |
| **Why** | Estimators were seeing scoped/history clutter in the queue; product intent is “create official scope here, then work the estimate in Estimates.” |
| **Impacted** | `quoteFlowSetScope`, `quoteFlowQueuePresenter`, queue routes, `EstimateQueuePage`, queue helpers/API/tests, shell Inbox deep-link, this doc. |
| **Protected / unchanged** | Digital Estimate, pricing formulas, Studio V2, Internal Estimate, AI Takeoff algorithm, Inbox fresh-start rules, Estimates editor beyond navigation. |
| **Revisit trigger** | Unscoped cases with no takeoffJobId in the queue; cancel-on-dismiss for active takeoffs. |

### 280. Elite 100 Quote Flow — Estimate Queue command-center UI (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-queue-command-center-ui` |
| **Decision** | Polish Estimate Queue presentation only to match Inbox command-center: full-width shell, command header, stats, client filter/search chips, wider list + scope workspace, larger Takeoff review iframe, clearer manual scope builder. Label fallbacks prefer sender/subject/plan/attachment filename before “Unknown contact.” Product filtering (unscoped-only active queue), Set Scope, and manual Set Scope backends unchanged. |
| **Why** | Scope creation worked but felt narrow/prototype vs polished Inbox; estimators need a larger operational workspace. |
| **Impacted** | `EstimateQueuePage`, `queueGrouping`, queue presenter labels, shell width for queue, styles, UI tests, this doc. |
| **Protected / unchanged** | Queue filter=active exclusion of scoped rows, AI Takeoff algorithm, set-scope / set-manual-scope behavior, pricing, Digital Estimate, Studio V2, Estimates editor logic. |
| **Revisit trigger** | Three-pane activity timeline if estimators need takeoff history alongside creation. |

### 281. Elite 100 Quote Flow — Estimate Queue estimate name + row-action cleanup (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-queue-command-center-ui` |
| **Decision** | Ready AI rows show **Review Takeoff** only (no repeated Create Manual Scope). Manual scope is a selected-workspace mode alongside Review AI Takeoff. Failed rows show **Needs decision**. Editable **Estimate name** defaults from subject → plan basename → sender → short id → “Untitled quote request”, and is persisted on Set Scope as `scope.projectName` + `scope.quoteFlowEstimateName` via existing `updateScope` (no migration). Labels avoid “Unknown contact — Unknown contact.” Queue filter/set-scope product rules unchanged. |
| **Why** | Duplicate Manual Scope on every ready row felt wrong; estimators need a clear job name before scope lands in Estimates. |
| **Impacted** | Queue presenter/setScope/set-manual-scope routes, EstimateQueuePage, queueGrouping, UI/slice tests, this doc. |
| **Protected / unchanged** | Unscoped-only queue filter, pricing, Digital Estimate, Studio V2, AI Takeoff algorithm, migrations. |
| **Revisit trigger** | Dedicated estimate title column if scope.projectName is overloaded elsewhere. |

### 282. Elite 100 Quote Flow — one primary Set Scope action (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-single-set-scope-action` |
| **Decision** | Estimate Queue has one primary **Set Scope** action. Clicking it collects current reviewed measurements from the embedded Takeoff iframe (dirty or clean), then `POST …/set-scope` saves edits (reopening approved takeoffs via `reopenIfApproved` / `reopenTakeoffJobForMeasurementRevision` when needed), freezes measurements, and creates official estimate scope in one request. Save Draft remains optional secondary in the iframe. Competing “Use these measurements” is hidden when `quoteFlowSetScope=1`. Already-approved but unscoped takeoffs Set Scope without surfacing the Studio “Edit Measurements” hard blocker. Manual Set Scope stays one action. |
| **Why** | Requiring Save Draft then Use these measurements broke Quote Flow’s purpose (create official scope) and exposed locked-approved takeoff errors. |
| **Impacted** | `quoteFlowSetScope`, Quote Flow set-scope route (4mb body), EstimateQueuePage + postMessage bridge, ConsolidatedTakeoffReview (payload reply + hide primary approve), `saveTakeoffCorrection`/`approveAndBuildEstimate` `reopenIfApproved`, slice/UI tests, this doc. |
| **Protected / unchanged** | Inbox, unscoped-only queue filter, pricing, calculate, estimate approval, Digital Estimate, acceptance, sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Native non-iframe Quote Flow measurement editor if postMessage bridge proves fragile. |

### 283. Elite 100 Quote Flow — footer Set Scope in review table (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-footer-set-scope` |
| **Decision** | In `quoteFlowSetScope=1` review, hide **Save Draft** from the iframe footer and show a primary **Set Scope** button after Add room / Add piece. Footer Set Scope posts `eliteos-quote-flow-trigger-set-scope` so the Quote Flow parent runs the same Set Scope flow as the top-right sticky button (collect edits → save → official scope → success). No “Use these measurements” in Quote Flow mode. |
| **Why** | Estimators finish at the bottom of the measurement table; a disabled Save Draft + helper text there was confusing when Set Scope is the real finish action. |
| **Impacted** | ConsolidatedTakeoffReview footer, takeoff↔Quote Flow postMessage contract, EstimateQueuePage listener, UI/slice tests, this doc. |
| **Protected / unchanged** | Set Scope backend orchestration, queue filter, pricing, Digital Estimate, Studio V2, acceptance, sold. |
| **Revisit trigger** | Sticky footer bar inside the iframe if long tables still bury the button. |

### 284. Elite 100 Quote Flow — Estimates Official Workspace (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-estimates-official-workspace` |
| **Decision** | Estimates becomes a full-width command-center library/detail workspace for **scoped estimates only**. Selected estimate has internal sections Scope / Pricing / Review / Digital Estimate / Activity / Handoff — only **Scope** is functional. Official Scope editor supports estimate name, rooms/pieces/dimensions, add/remove with confirm, SF summary, and **Save Scope** (PATCH). Presenter exposes estimate display name, AI/Manual source, and SF summary from existing scope fields (no migration). Other sections are placeholders only. No pricing, calculate, approval, publish, acceptance, or sold. |
| **Why** | After Queue Set Scope, estimators need a polished permanent official estimate record — not a narrow prototype list. |
| **Impacted** | EstimatesListPage, OfficialScopeEditor, estimateGrouping, estimates presenter/PATCH (name + edited flags), QuoteFlowApp shell width, styles, UI/slice 1d tests, this doc. |
| **Protected / unchanged** | Inbox, Estimate Queue filter/Set Scope, AI Takeoff algorithm, pricing, Digital Estimate modules, Studio V2, acceptance, sold. |
| **Revisit trigger** | Activate Pricing section when Quote Flow pricing slice lands. |

### 285. Elite 100 Quote Flow — Estimates Library + Modal Workspace + Open Edge LF (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-estimates-library-modal-polish` |
| **Decision** | Estimates main page is **library-first** (stats, filters, estimate cards) like Quote Library — no permanent right-side editor. Clicking an estimate opens a **near-fullscreen modal** with the official estimate workspace (name, summary cards, section tabs; only Scope active). **Open edge LF** is official scope data at piece level (canonical `piece.openEdgeLf`, with read aliases and write sync to `finishedEdgeLf` / `exposedEdgeLf` / `finishedEdge.totalFinishedEdgeLengthIn`). Library rows and modal summary include open-edge rollup. Queue → Open in Estimates still opens Estimates and the modal for that id. Save Scope keeps the modal open and refreshes the library row. |
| **Why** | The left/right workbench felt unlike Quote Library; open/exposed edge LF is needed as scope before pricing. |
| **Impacted** | EstimatesListPage (library + modal), OfficialScopeEditor (Open edge LF), estimateGrouping / presenter / PATCH normalize, styles, UI/slice 1d tests, this doc. |
| **Protected / unchanged** | Inbox, Estimate Queue Set Scope (except modal handoff already wired), AI Takeoff, pricing/approve/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Activate Pricing (and later sections) inside the same modal when those slices land. |

### 286. Elite 100 Quote Flow — Estimates Quote Library table layout (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-estimates-quote-library-layout` |
| **Decision** | Estimates main page matches **Quote Library command-center structure** (visual only): hero (“Estimate command center”), metric cards (scoped / recent / AI / manual / total countertop SF / total open edge LF), view tabs, Search & filters card (search, source, status, sort), and a **table** of scoped estimates (not a card grid). Row click / Edit official scope opens the existing near-fullscreen modal. Modal workspace, Open edge LF, Save Scope, and Queue handoff are unchanged. No Quote Library backend coupling. |
| **Why** | Card grid did not match Chris’s expectation of the existing Quote Library list/table command center. |
| **Impacted** | EstimatesListPage, estimateGrouping (filter/sort/stats), styles (`qf-el-*`), UI/slice 1d tests, this doc. |
| **Protected / unchanged** | Modal + official scope editor, Open edge LF PATCH semantics, Inbox, Queue Set Scope, pricing/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`, Quote Library app itself. |
| **Revisit trigger** | Add server-side pagination when estimate volume requires it. |

### 287. Elite 100 Quote Flow — Open edge LF carry-forward on Set Scope (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-open-edge-carry-forward` |
| **Decision** | AI Set Scope must write canonical **`piece.openEdgeLf`** onto official scope. Drop was: takeoff→scope seed preserved `finishedEdge` but omitted `openEdgeLf`/`finishedEdgeLf`, and Set Scope did not re-stamp after `refreshScopeFromTakeoff`. Fix: (1) seed stamps `openEdgeLf` from finishedEdge inches/aliases; (2) Set Scope applies reviewed takeoffResult edge LF then normalizes/persists; (3) AI Takeoff Set Scope postMessage stamps `openEdgeLf` on each run. Manual scope normalize already preserves `openEdgeLf`. No historical backfill of zeroed estimates without source edge data. |
| **Why** | Estimates showed 0.0 Open edge LF after Set Scope even when AI Takeoff review had exposed/open edge values — blocking correct pre-pricing scope. |
| **Impacted** | `quoteFlowOpenEdge.mjs`, `quoteFlowSetScope.mjs`, `seedScopeFromTakeoffPayload`, `takeoffReviewReadyContract.mjs`, `ConsolidatedTakeoffReview.tsx`, slice 1c/1d tests, this doc. |
| **Protected / unchanged** | Pricing/calculate/approve/publish/accept/sold, Studio V2 product behavior, `app-digital-estimate`, `backend-core/src/digitalEstimate`, Estimates library/table/modal layout. |
| **Revisit trigger** | None unless edge field naming is unified repo-wide. |

### 288. Elite 100 Quote Flow — header Set Scope only; Save Draft restored (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-set-scope-reliable-header` |
| **Decision** | In `quoteFlowSetScope=1` review, footer actions are **Add room \| Add piece \| Save draft** only. Footer **Set Scope** and the `eliteos-quote-flow-trigger-set-scope` path are removed. Quote Flow header **Set Scope** is the only finish action: collect current iframe review state (including dirty edits + `openEdgeLf`), then create official scope. If iframe review state cannot be collected, show **Save draft first, then Set Scope.** — never silent fail / low-level postMessage errors. “Use these measurements” stays hidden. Hint copy: “Review measurements. Save draft if needed, then Set Scope from the Quote Flow header.” |
| **Why** | Footer Set Scope was unreliable and hid Save Draft; estimators need a clear optional draft save plus one reliable header finish action. |
| **Impacted** | ConsolidatedTakeoffReview footer, takeoff↔Quote Flow postMessage (request/payload only), EstimateQueuePage `runSetScope`, UI/slice tests, this doc. |
| **Protected / unchanged** | Open edge LF carry-forward (§287), pricing/calculate/approve/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Native non-iframe measurement editor if postMessage collection remains fragile. |

### 289. Elite 100 Quote Flow — Set Scope saved-draft fallback (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-set-scope-saved-draft-fallback` |
| **Decision** | Header Set Scope tries live iframe review state first, then always calls `POST …/set-scope`. When the client omits `takeoffResult`, backend freeze uses latest saved reviewed takeoff (`approveAndBuildEstimate` / storage) or already-approved measurements; openEdgeLf is stamped from live payload or `getLatestTakeoffResult`. UI shows **Save draft first, then Set Scope** only when that backend path confirms no usable saved/approved measurements — never solely because postMessage timed out. Footer remains Add room / Add piece / Save draft (no footer Set Scope). |
| **Why** | After Save Draft, iframe live collection can still fail; requiring a live payload blocked the real finish action. |
| **Impacted** | `EstimateQueuePage.runSetScope`, `quoteFlowSetScope` open-edge saved-draft resolve, slice 1c / queue UI tests, this doc. |
| **Protected / unchanged** | Pricing/calculate/approve/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`, footer Set Scope removal (§288). |
| **Revisit trigger** | Optional `TAKEOFF_REVIEW_DRAFT_SAVED` parent badge if estimators need stronger post-save feedback. |

### 290. Vercel — disable automatic non-main preview deploys (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `chore/vercel-disable-non-main-previews` |
| **Decision** | Each Vercel-deployed head keeps its own `vercel.json` (no monorepo-root config). Add `git.deploymentEnabled`: `{ "main": true, "*": false }` so Git auto-deploys **only** `main`. Official docs: unspecified branches default to **true**; only listing `main: true` does **not** disable others. `main` matches both rules and still deploys because any matching `true` wins. Explicit preview remains via Vercel CLI/dashboard Deploy. Prefer this over Ignored Build Step (canceled builds can still consume quota). |
| **Why** | Feature/hotfix/cursor pushes were creating preview builds across many monorepo projects and growing the Vercel bill; local tests remain the normal validation path. |
| **Impacted** | `backend-core/vercel.json`, existing SPA `vercel.json` files (except Digital Estimate), new git-only `vercel.json` for Quote Flow / AI Takeoff / Quote Library / Public Quote, this doc. |
| **Protected / unchanged** | Production deploy from `main`, backend-core crons/functions, product code, `app-digital-estimate` file (dashboard-only for that project), `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Need a named staging branch → add that branch as `true` alongside `main` (do not set a blanket `*` to true). |

### 291. Elite 100 Quote Flow — open edge LF real Set Scope path (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `hotfix/quote-flow-open-edge-set-scope-real-path` |
| **Decision** | Review UI exposes edge as **`run.finishedEdge.totalFinishedEdgeLengthIn`** (inches → “X.XX LF”), not `openEdgeLf`. Production Set Scope drop: (1) `getOrCreateForCase` seeds usable rooms → **`afterEnsure` early-return skipped open-edge stamp**; (2) `openEdgeLf: 0` blocked fallthrough to finishedEdge inches in resolvers/normalizer; (3) unapproved review inches were replaced by `attachDraftPieceGeometry` draft_suggestion. Fix: always `persistOpenEdgeLfOnEstimate` on afterEnsure + refresh paths; resolve positive LF then finishedEdge inches; preserve review inches on import; seed prefers positive LF/inches. |
| **Why** | New Estimates still showed Open edge LF = 0.0 after Set Scope despite review showing exposed edge values — prior carry-forward tests mocked empty seed rooms so the real early-return path never ran. |
| **Impacted** | `quoteFlowSetScope.mjs`, `quoteFlowOpenEdge.mjs`, `quoteFlowEstimates` normalizer, import payload, seed, presenter/grouping resolvers, slice 1c realistic fixture, this doc. |
| **Protected / unchanged** | Pricing/calculate/approve/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`, Estimates layout. |
| **Revisit trigger** | Backfill historical zeroed openEdgeLf from takeoff finishedEdge when operators need it. |

### 292. Elite 100 Quote Flow — Official Scope editor worksheet polish (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-official-scope-editor-polish` |
| **Decision** | Estimates modal Scope tab / `OfficialScopeEditor` becomes a compact estimating worksheet: room section cards, piece **table** (name / length / depth / qty / SF / Open edge LF / Included / Actions), compact Include toggles (no large Exclude piece button), metric summary row, and sticky modal footer **Unsaved scope changes → Save Scope**. Data shape, PATCH Save Scope, Open edge LF persistence, library/modal shell unchanged. |
| **Why** | Scope editor was functional but read as loose form blocks — estimators need a production worksheet feel inside the near-fullscreen modal. |
| **Impacted** | `OfficialScopeEditor.tsx`, `EstimatesListPage.tsx` sticky save, `styles.css`, Estimates UI / slice 1d tests, this doc. |
| **Protected / unchanged** | Inbox, Estimate Queue Set Scope, pricing/calculate/approve/publish/accept/sold, Studio V2, `app-digital-estimate`, `backend-core/src/digitalEstimate`, open-edge carry-forward (§291). |
| **Revisit trigger** | Activate Pricing tab inside the same modal when that slice lands. |

### 293. Elite 100 Quote Flow — Estimates Pricing tab (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-estimates-pricing` |
| **Decision** | Activate Pricing inside the Estimates modal only. Persist pricing draft on existing `scope` fields (`pricingBasis`, `materialGroup`, `estimateWideAdjustment`, `quoteFlowPricingEdited`) and calculation on `calculation_snapshot_json` / status `priced` — **no migration**. Calculate via trusted `calculateStudioEstimateV4` + Studio V2 pricing normalize/present helpers. Official scope (incl. open edge LF → `finishedEdgeLf`) is quantity truth. Stale via existing `staleReason` after scope/pricing edits. |
| **Why** | Estimators need internal pricing after Set Scope without leaving Quote Flow or copying Studio V2 layout / inventing formulas. |
| **Impacted** | `quoteFlowPricing.mjs` + routes/tests, Estimates `OfficialPricingPanel`, estimates API helpers, styles, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Inbox, Estimate Queue Set Scope, Scope editor behavior (except reading summary), approval, Digital Estimate publish, customer acceptance, sold/handoff, Studio V2 page layout, `app-digital-estimate`, `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Estimate Review / approve, Digital Estimate publish, customer-facing totals, or material/color catalog UX beyond price group. |

### 294. Elite 100 Quote Flow — Pricing custom line items (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-pricing-line-items` |
| **Decision** | Pricing tab supports structured custom line items under `scope.quoteFlowPricing.customLineItems` (type charge/credit/note × visibility customer/internal). Billable charge/credit lines sync into Studio `scope.customLineItems` via `studioCommercialLines` so `calculateStudioEstimateV4` applies them; notes stay QF-only and do not change totals. Edge UI shows Pending when openEdgeLf > 0 and no edge profile selected (no false “0.0 LF priced”). No migration. |
| **Why** | Estimators need customer-facing vs internal-only extras before Review/Publish without inventing a parallel pricing engine. |
| **Impacted** | `quoteFlowCustomLineItems.mjs`, `quoteFlowPricing.mjs` + tests, `OfficialPricingPanel`, estimates API/styles, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Inbox, Queue/Set Scope, Scope editor, approval, Digital Estimate publish, acceptance, sold/handoff, Studio V2 layout, `app-digital-estimate`, `backend-core/src/digitalEstimate`. |
| **Revisit trigger** | Review/Publish consuming customer-facing lines; edge profile picker in Quote Flow Pricing. |

### 295. Elite 100 Quote Flow — Estimates Review / internal approval (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-estimates-review-approval` |
| **Decision** | Activate Review tab as an **internal** approval gate only. Readiness checklist (scope, pieces, pricing draft, current calc, customer total, open-edge warning, custom lines). Approve persists Studio-compatible `status=approved` + `approval` blob and `scope.quoteFlowReview` metadata (no migration). Reopen clears approval. Scope/pricing edits after approval mark re-review / clear approval; do **not** publish Digital Estimate, accept, or mark sold. |
| **Why** | Estimators need a gate after Pricing before customer-quote prep without enabling publish. |
| **Impacted** | `quoteFlowReview.mjs` / `quoteFlowReviewMeta.mjs` + routes/tests, Estimates `OfficialReviewPanel`, presenter status labels, pricing/scope stale-after-approval hooks, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Inbox, Queue/Set Scope, acceptance, sold/handoff, Studio V2 layout, `app-digital-estimate`, `backend-core/src/digitalEstimate` (reuse only). |
| **Revisit trigger** | Interactive customer selections required by default; acceptance/sold/handoff; edge-profile blocker vs warning. |

### 296. Elite 100 Quote Flow — Digital Estimate publish from approved estimates (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `feature/quote-flow-digital-estimate-publish` |
| **Decision** | Activate Estimates **Digital Estimate** tab to publish a customer-facing Digital Estimate **only** from a current Quote Flow Review approval. Reuses Studio `createStudioEstimateDigitalEstimateService().publish` with `publishContext` (`quote_flow_approved_snapshot`, approved-snapshot authority, skip legacy takeoff gate). Persists `scope.quoteFlowDigitalEstimate` (publicationId, customerUrl, fingerprints) without migration. Customer payload uses existing freeze/public DTO (customer-facing custom lines included; internal-only excluded). Scope/pricing changes mark publish stale (`Needs republish`) after re-review. No acceptance, sold, handoff, or email automation. |
| **Why** | First customer-facing Quote Flow slice after internal Review, without rebuilding Digital Estimate. |
| **Impacted** | `quoteFlowDigitalEstimate.mjs` + routes/tests, `quoteFlowReviewMeta` stale publish stamp, Estimates `OfficialDigitalEstimatePanel`, presenter Published/Needs republish labels, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Inbox, Queue/Set Scope, AI Takeoff, pricing formulas, Review gate semantics (except publish-stale metadata), acceptance, sold/handoff, email automation, `app-digital-estimate` UI, `backend-core/src/digitalEstimate` (helpers reused only). |
| **Revisit trigger** | Force interactive configuration envelope when stack available; customer email send; acceptance/sold. |

### 297. Quote Flow Digital Estimate — official openEdgeLf → finishedEdge approval for edge pricing (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` (hotfix) |
| **Decision** | Quote Flow official scope stamps `openEdgeLf` into Studio-compatible `finishedEdge.{totalFinishedEdgeLengthIn, approved, finishedEdgeConfirmed}` (same shape the working DE path freezes as `room.edgeLinearFeet`). Publish-time normalize before Studio DE publish so already-saved QF estimates price paid edge upgrades against official LF. Takeoff draft stamping does **not** auto-approve. No pricing-engine changes. |
| **Why** | QF-published DE showed +$0 paid edges because publication only trusts approved `finishedEdge`, while QF wrote LF aliases without approval flags → frozen `edgeLinearFeet=0`. |
| **Impacted** | `quoteFlowOpenEdge.mjs`, QF pricing/scope stamps, `quoteFlowDigitalEstimate` publish normalize + preview, OfficialScopeEditor, DE publish tests, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Digital Estimate pricing formulas/rates, acceptance/sold/handoff/email, internal-only line exclusion, non-QF Studio DE path behavior (already correct). |
| **Revisit trigger** | None unless takeoff draft accidentally inherits official approval flags. |

### 298. Elite 100 Quote Flow — Activity tab + one library row per official estimate (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` |
| **Decision** | Activate Estimates **Activity** tab (read-only timeline, publication history, customer link/selection status from existing DE data). Collapse Estimates library to **one row per `intakeCaseId`** (highest revision) so sibling revisions / republish history do not appear as duplicate official estimates; history stays on Activity. After QF DE publish, call `supersedeOlderRevisionsAfterPublish` (same as Studio simplified) when available. No sold/handoff/acceptance/email; no destructive cleanup. |
| **Why** | Staff need post-publish visibility; republish left non-superseded siblings that both passed `isOfficialScopeSet`. |
| **Impacted** | `quoteFlowActivity.mjs` / `quoteFlowLibraryRows.mjs` + routes/tests, `listEstimates` collapse, QF publish supersede hook, `OfficialActivityPanel`, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Pricing formulas, Review/DE publish rules (except supersede after publish), acceptance/sold/handoff/email, `app-digital-estimate`, DB rows (no delete/merge). |
| **Revisit trigger** | Handoff / sold; richer amendment timeline UI. |

### 299. Elite 100 Quote Flow — Activity shows Digital Estimate customer selections (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` |
| **Decision** | Quote Flow Activity loads staff-safe customer selections via the existing Studio V2 helper `buildStudioCustomerSelectionReview` (same stack as `GET …/customer-activity`) plus DE calculation `roomPricingChanges` for before/after rows and published vs customer-selected totals. Activity UI renders a dedicated **Customer selections** section (status, totals, comparison table, current choices). Read-only: refresh / open / copy link only. No accept/sold/handoff/job/email; no pricing formula changes; no automatic approve/republish. |
| **Why** | Activity already tracked lifecycle/link events but did not visibly show customer-selected changes from the published Digital Estimate. |
| **Impacted** | `quoteFlowCustomerSelections.mjs`, `quoteFlowActivity.mjs` (+ route wiring for configuration repository), `studioCustomerSelectionReview.mjs` (`selectionComparison` from `roomPricingChanges`), `OfficialActivityPanel`, Activity tests/UI smoke, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Pricing formulas, Review/DE publish gates, acceptance/sold/handoff/email, internal-only line exclusion / economics totals, `app-digital-estimate` UX. |
| **Revisit trigger** | Staff accept / apply customer selections into official scope; sold/handoff. |
| **Note** | Public Digital Estimate may still expose Accept Estimate separately; this slice does not wire acceptance into Quote Flow. |

### 300. Elite 100 Quote Flow — sink cutout in published baseline + Activity UI cleanup (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` |
| **Decision** | When official scope includes sink cutout (piece openings and/or `qty-sink`), Quote Flow pricing and Digital Estimate publish must freeze that cutout into the published Original baseline so customer sink selection does not re-add “Kitchen sink cutout +$200”. Match Studio V2: sync piece openings → `scope.addOns`, and set `calculationSnapshot.fabrication.addOns` from priced cutout quantities. Harden `publishedScopeIncludesSinkCutout` for bare `qty-sink` envelope options. Clean Activity status cards / Customer selections panel layout (no overlap). No sold/handoff/job/email; no pricing formula rate changes. |
| **Why** | QF often priced cutouts from piece openings while leaving `scope.addOns` empty; DE freeze only read `fabrication.addOns` copied from empty addOns, so Original omitted the cutout and live DE charged it again. |
| **Impacted** | `elite100RoomPricingStudioAdapter.mjs` (`mergePricedCutoutsIntoFabricationAddOns`), `quoteFlowOpenEdge.mjs` / pricing / estimates scope sync, `sinkCutoutBaseline.mjs`, Activity panel CSS/UI, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Cutout unit rates ($200 kitchen), DE selection formulas, acceptance/sold/handoff/email, internal-only exclusion. |
| **Revisit trigger** | Staff apply-customer-selections into official scope. |

### 301. Elite 100 Quote Flow — customer acceptance status + internal accepted-job report (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` |
| **Decision** | Quote Flow Activity reads existing Studio Final Acceptance (`studio_estimate_acceptances` via lifecycle repository — same model as Studio V2 customer-activity). Shows Accepted / Not accepted yet, accepted totals, and an internal **Accepted job report** (staff-only) with room/piece SF (v4 `pieceSections` + `ceilBillableSquareFeet`), selections, customer-facing + internal-only lines, and invoice-preparation summary. Library status can show Accepted via `lifecycleStatus` / acceptance. No sold, handoff, job creation, QuickBooks invoice, or email. |
| **Why** | Staff need accepted-job visibility and invoicing prep without operational closeout. |
| **Impacted** | `quoteFlowAcceptedReport.mjs`, Activity payload/UI, `mapQuoteFlowEstimateStatus` Accepted, routes `…/accepted-report`, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Pricing formulas/rates, public DE acceptance APIs, sold/handoff/QB/email, customer-facing DE payloads (internal lines stay staff-only). |
| **Revisit trigger** | Sold review / QuickBooks invoice creation / handoff. |

### 302. Quote Flow public Digital Estimate Accept button restored (2026-08-04)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-04 · `main` (hotfix) |
| **Root cause** | Interactive DE envelopes seed `sidesplash:…:none`. `classifyCustomerConfigurationForReview` treated **any** `sidesplash:` quantity as physical scope, so after customer Save / Send selections the review DTO set `requiresEliteReview` / `canAcceptConfigured: false` and the public Accept CTA hid — even for selection-only edge/material changes. Quote Flow Activity’s “Customer changes need staff review” is a separate staff label and does not mean physical-scope Elite review. |
| **Decision** | Reuse existing public final acceptance (`POST /api/public-digital-estimate/v2/final-acceptance`, `acceptedAsPublished` / `acceptedAsConfigured`). Classify `sidesplash:…:none` as ignored and priced left/right/both as selection-only. Quote Flow publish uses `resolveSimplifiedPublishConfiguration` + interactive envelope assert (same as Studio V2). Send selections remains separate and must not permanently block selection-only configured acceptance. No sold, handoff, job, QuickBooks invoice, or email automation. |
| **Why** | Customers must accept Quote Flow–published Digital Estimates on the public link; staff already read acceptance via Activity / accepted-job report. |
| **Impacted** | `customerConfigurationFoundation.mjs` (+ test), `baselineParityGuardrails.mjs`, `quoteFlowDigitalEstimate.mjs`, `ConfigurationView.tsx`, `OfficialDigitalEstimatePanel.tsx`, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Pricing formulas/rates, sold/handoff/QB/email, internal-only line exclusion, non–Quote-Flow Studio DE acceptance model (same path; bugfix benefits all interactive pubs). |
| **Revisit trigger** | True physical-scope sidesplash modes beyond left/right/both/none. |

### 303. Elite 100 Quote Flow — Estimate Queue archive / remove from queue (2026-08-06)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-06 · `main` |
| **Decision** | Staff can **Archive / Remove from queue** Estimate Queue rows (ready, manual, failed, processing, waiting). Hides the item from the default Active queue without deleting takeoff jobs, intake cases, estimates, or emails, and without cancelling AI jobs. Persistence mirrors Inbox dismiss: `organization_integration_configs` `integration_key=quote_flow_queue` stores `archivedQueueItemKeys` map (`{ [queueItemKey]: { at, by } }`). Stable key: `takeoff:{id}` → `intake:{id}` → `message:{key}` → deterministic fallback. Routes: `POST …/queue/:queueItemKey/archive|restore`. UI: Active / Archived / All chips, Archived badge, Restore, confirm for recent processing (“does not cancel the AI job”). |
| **Why** | Stale test / abandoned queue rows cluttered Active without a non-destructive cleanup path. |
| **Impacted** | `quoteFlowQueueStateStore.mjs`, presenter key helpers, `quoteFlowSetScope` list/archive/restore, routes, Estimate Queue UI/API, archive tests, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Set Scope, AI Takeoff start/cancel, pricing/publish/acceptance/sold/handoff, Inbox dismiss model (separate key), DB row deletes. |
| **Revisit trigger** | Explicit “cancel live AI job” action; org-wide queue purge tooling. |

### 304. Elite 100 Quote Flow — Inbox AI Takeoff progress visibility (2026-08-06)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-06 · `main` |
| **Decision** | Quote Flow Inbox surfaces clear takeoff progress without DevTools: status labels (ready / starting / queued / sending / processing / returned / failed / scoped / removed), started/elapsed/updated times, plan filename, indeterminate progress (no fake %), safe failure message + stage/code when available, stale warnings (15m / 60m), batch start summary banner (selected / started / already running / failed), detail timeline, and Retry AI Takeoff via existing `startFresh` start-takeoff. Returned rows emphasize **View in Estimate Queue**. Persistence uses existing job timestamps/`error_message` on queue rows; no takeoff-engine changes. |
| **Why** | Staff could not tell what was happening after Start selected AI Takeoffs; failures showed only “Error.” |
| **Impacted** | Inbox presenter + progress helpers, Shared Inbox `aiTakeoff` timing fields, queue job select enrichment, Inbox UI/CSS/API, progress tests, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | AI Takeoff math/engine, Estimate Queue Set Scope, pricing/publish/acceptance/sold/handoff, QB/email, mailbox delete. |
| **Revisit trigger** | Real engine percent events; safe cancel for live AI jobs. |

### 305. Elite 100 Quote Flow — Set Scope imports estimator sink cutouts (2026-08-06)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-06 · `main` (hotfix) |
| **Root cause** | Reviewed takeoff stores openings as `run.cutouts[]` / `piece.cutouts[]` (`kitchen_sink`, …). Studio V2 / Pricing expect `kitchenSinkCutouts` + `scope.addOns["qty-sink"]`. Set Scope `afterEnsure` (getOrCreate already seeded rooms) persisted open edge but did not bridge cutouts → Studio openings / addOns, so Official Scope, Pricing Latest calculation, and Digital Estimate baseline omitted Kitchen sink cutout. |
| **Decision** | During Set Scope (including afterEnsure), map takeoff cutouts into Studio piece openings + `qty-sink` via `quoteFlowCutouts.mjs` + existing `syncPieceOpeningsIntoOfficialScopeAddOns`. Official Scope UI shows editable Sink cutout count. Pricing stamp/presenter surfaces Kitchen sink cutout / Fabrication add-ons (not only Other/adjustments). Existing §300 DE freeze + no-duplicate customer sink behavior applies once openings/addOns exist. No pricing formula/rate changes; no sold/handoff/QB/email; no AI refresh after Set Scope. |
| **Why** | Estimator-defined physical cutout belongs in original internal price and published customer baseline; sink product selection is separate. |
| **Impacted** | `quoteFlowCutouts.mjs`, Set Scope persist, OpenEdge/addOns sync, estimates normalize, pricing stamp/presenter, Official Scope + Pricing UI, seed/adapter cutouts bridge, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Cutout unit rates, DE rebuild, acceptance/sold/handoff/QB/email, customer acceptance, raw AI overwrite after Set Scope. |
| **Revisit trigger** | Per-room vanity/cooktop/outlet editors beyond kitchen sink; staff apply-customer-selections into official scope. |

### 307. Vercel — affected-project deployment guard (ignored build step) (2026-08-06)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-06 · `main` |
| **Decision** | Each Vercel project Root Directory keeps its own `vercel.json` (still **no** repo-root `vercel.json`). Preserve existing `git.deploymentEnabled` `{ "main": true, "*": false }` where already present. Add `ignoreCommand`: `node ../scripts/vercel-ignore-build.mjs <project-root>` so a push to `main` **skips** rebuild when that project’s tree / mapped deps / global package files were not touched. Exit **0** = skip build; exit **1** = build. Detection uses `VERCEL_GIT_PREVIOUS_SHA`…`VERCEL_GIT_COMMIT_SHA` when present, else `HEAD^`…`HEAD`; on failure, **build** (never false-skip). Docs-only changes skip app/backend builds. Root `package.json` / lockfiles / the ignore script itself trigger **all** projects. `backend-core` changes rebuild Brain by default; mapped backend folders may also rebuild a paired frontend (see `PROJECT_DEPENDENCIES` in the script). Unrelated `app-*` folders do not rebuild each other. |
| **Why** | Every `main` push was rebuilding many/all heads even when only Brain + one app changed, burning Vercel quota. |
| **Script** | `scripts/vercel-ignore-build.mjs` (+ `scripts/vercel-ignore-build.test.mjs`, `scripts/verify-vercel-ignore-build-policy.mjs`). Existing `scripts/verify-vercel-git-deployment-policy.mjs` still guards non-main suppression. |
| **How to add a new head** | (1) Add `app-<name>/vercel.json` with `deploymentEnabled` main-only policy + `ignoreCommand` for that folder. (2) If the app depends on specific Brain routes or `shared/eliteos-ui`, add paths under `PROJECT_DEPENDENCIES`. (3) Run both verify scripts. Until `vercel.json` exists, set Dashboard → Git → Ignored Build Step to the same `node ../scripts/…` command (Root Directory = the app folder). |
| **Global rebuild triggers** | Root `package.json`, lockfiles (npm/pnpm/yarn), `.npmrc`, `scripts/vercel-ignore-build.mjs`. |
| **Intentional exceptions** | `app-digital-estimate`: `ignoreCommand` in-repo; `deploymentEnabled` remains dashboard-only (§290). `app-hr`, `app-pricing-admin`, `app-internal-estimate`: no in-repo `vercel.json` yet — Dashboard Ignored Build Step required (listed in verify script). |
| **Protected / unchanged** | App build commands, env vars, product code, non-main preview suppression, Digital Estimate dashboard deploy policy. |
| **Revisit trigger** | Turbo/Nx affected graph; adding vercel.json for HR / pricing-admin / internal-estimate. |
|

|

### 306. HR Managerial Financial Metrics + restricted report (2026-08-06)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-06 · `cursor/hr-managerial-financials-1946` |
| **Decision** | Add restricted **Managerial Financials** access scope (`managerial_financials`) with three non-graded currency sections: Line of Credit Balance, Accounts Receivable over 45 Days, Accounts Payable over 30 Days. Role-based full-access users (`admin` / `executive` / `hr` / `super_admin`) see and edit them on the CEO dashboard. Assigned users get a focused Managerial Financials view + **Managerial Financial Report** only — not Executive Dashboard, mistakes, standard weekly report, or Department Access management. Executive Dashboard assignment alone does **not** grant managerial financials. Metrics use existing `workforce_grading_sections` / `workforce_section_week_values`, prior-week neutral comparisons, and are excluded from the standard weekly report. |
| **Why** | Leadership needs LOC / aged AR / aged AP visibility without exposing those figures to department operators or the broad weekly report distribution. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_workforce_managerial_financials_v1.sql` (CHECK widen + ESF section seed). |
| **Ops** | Apply SQL → redeploy **backend-core** + **app-hr**. Assign Managerial Financials under HR → Department Access for the selected leadership user. |
| **Out of scope** | Letter grades/thresholds for these metrics; combining managerial + standard reports; auto-apply migration; System Admin grants. |

### 308. Sales Dashboard QuickBooks Financial Truth Beta (2026-08-11)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-11 |
| **Decision** | Additive **QuickBooks Financial Truth — Beta** on Sales Dashboard (`quickbooks_financial_truth` on `/api/sales/dashboard-foundation` and `/api/sales/dashboard`). Fail-soft; Moraware KPIs unchanged. Sales Orders $ is **not** renamed Booked/Sold. Open A/R is **as-of refresh** when live (no fake historical A/R). Default `QB_FINANCIAL_TRUTH_ENABLED=0`. Live reads require a **supported CData QuickBooks client** plus a host with **approved stable egress** to Gateway 8166 — raw HTTP QBXML POST is not production transport. Vercel Brain has no stable egress; do not broaden firewall to Any. |
| **Why** | `slabos_ro` is authorized read-only on Remote Connector, but this repo has no licensed CData client and production Brain cannot be allowlisted by IP today. |
| **Impacted** | `backend-core/src/sales/quickbooksFinancialTruth/`, Sales foundation + dashboard handlers, `SalesCommandCenterView` / live panel Beta strip, `docs/quickbooks/ELITE_STONE_QUICKBOOKS_LIVE_READ.md`. |
| **Revisit** | CData client installed on a Windows/static-egress worker; adapter wired; finance confirms Booked/Sold definition. |

### 309. Sales QuickBooks ODBC prepared-facts sync worker (2026-08-11)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-11 |
| **Decision** | Sales QuickBooks Financial Truth uses **Windows CData ODBC** DSN `slabOS_QuickBooks_Local_RO` + PowerShell worker + `POST /api/internal/sales/quickbooks-sync` prepared facts. Backend never connects to QB. Thryve/Remote Connector untouched. Open A/R is current as-of refresh; Sales Orders $ not Booked/Sold. Production unattended path: `run-sales-qb-sync.ps1` (persistent `C:\eliteOS\config\sales-qb-sync.env`, dedicated logs, non-overlap lock; `$PSScriptRoot` worker; default incremental **60-day** lookback; `-Backfill` explicit only) and optional Task Scheduler task **`eliteOS QuickBooks Sales Sync`** (every **2 hours**; installer preview/`-Preflight` only unless `-Apply`; no CLI Windows password). Completely separate from Account Directory `QB_AD_CUSTOMER_*` (never reuse AD ingest token). |
| **Why** | Live ODBC reads proven on QB Server; Vercel cannot/should not dial QuickBooks; Gateway raw HTTP is not slabOS transport; Sales Dashboard goes stale without recurring sync + persistent `QB_SALES_*`. |
| **SQL** | Manual: `backend-core/supabase/eliteos_sales_quickbooks_financial_truth_v1.sql` |
| **Windows ops** | Scripts: `quickbooks-sdk-connector/sales-sync/` in the QB Server eOS working copy. Config: `C:\eliteOS\config\sales-qb-sync.env`. Logs: `C:\eliteOS\logs\sales-qb-sync\`. Installer: `install-sales-qb-sync-task.ps1`. |
| **Revisit** | Historical as-of A/R; Booked/Sold definition; unattended Task Scheduler account validation; cadence after ops proves 2h load. |

### 310. Sales Command Center overview date-scoped prepared reads (2026-08-11)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-11 |
| **Decision** | For `GET /api/sales/dashboard` with `loadProfile=overview` (Command Center), prepared Moraware reads are **SQL date-scoped** to the discrete **current + prior-year comparison** windows required by existing dashboard math — not full import-group history filtered only in memory. Worksheet prepared facts are loaded for those job IDs. Explorer-only signals (`brain_moraware_job_activities`, `moraware_calendar_schedule_rows`) are skipped when `includeDetails=false`. Prepared QuickBooks Financial Truth is started **concurrently** with Moraware source load. Intelligence bundle built during source load is **reused** on metrics cache miss (no second build). `loadProfile=full` retains unscoped history for Explorer/detail surfaces. Response contract unchanged. |
| **Why** | Overview YTD was paging the entire `sales_moraware_job_facts` + worksheet history then discarding most rows; QB truth waited serially after Moraware aggregation. |
| **Out of scope** | Sales math/attribution changes; Moraware ingestion; QuickBooks Windows sync worker / backfill; dashboard UI redesign. |
| **Impacted** | `salesDashboardDataSources.js`, `salesDashboardApi.js`, `salesDashboardFilters.js` (`resolveRequiredLoadDateWindow`), `salesDashboardAggregates.js`, `salesDashboardCache.js`, `salesDashboardTiming.js`, `salesDashboard.test.mjs`. |
| **Revisit** | Date-scope quotes/forecasts similarly if they become a hotspot; optional SQL OR filter instead of dual window queries. |

### 311. Account Directory QuickBooks Customer Enrichment v1 (Phases 0–2) (2026-08-11)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-11 |
| **Decision** | Additive **live ODBC → prepared facts** lane for QuickBooks Desktop customers/jobs into Account Directory enrichment — **not** into AD identity columns. Tables: `ad_qb_customer_facts`, `ad_qb_customer_sync_runs`, `ad_qb_link_suggestions`. Separate Windows worker + ingest token from Sales Financial Truth (`QB_AD_CUSTOMER_*` only; never reuse `QB_SALES_SYNC_INGEST_TOKEN`). Root ListID is the only canonical `quickbooks_desktop` external link; jobs are prepared facts only (detect via `ParentId` / `Sublevel`; CData Desktop address columns `BillingCity` / `BillingState`). Reconciliation: exact ListID = reconciled; unlinked roots = suggestions; fuzzy name ranks suggestions only; **never auto-link / never auto-merge**. Human terminal suggestion statuses (`dismissed`, `linked`) are preserved across syncs (ranking/context may refresh; exact ListID may upgrade to `reconciled`). Confirmed links remain `POST …/link-quickbooks` only — **no** create-and-link in v1 (orphan risk). Upsert/complete verify `sync_run_id` belongs to `organization_id`. Production unattended path: `run-ad-qb-customer-sync.ps1` (config + non-overlap lock + dedicated logs) and optional Task Scheduler task **`slabOS Account Directory QB Customer Sync`** (nightly; installer preview-only unless `-Apply`). No financial facts in this phase. |
| **Why** | Sales ODBC feed has txn/Open A/R by CustomerName without ListID; AD needs ListID-keyed customer/job context and a safe suggestion queue without polluting identity or estimate snapshots. |
| **SQL** | Manual: `backend-core/supabase/eliteos_account_directory_qb_customer_enrichment_v1.sql` (not applied in this change). |
| **Windows ops** | Scripts run from the QB Server eOS working copy (`…\GitHub\eOS\quickbooks-sdk-connector\account-directory-sync`; `$PSScriptRoot` — no second clone at `C:\eliteOS`). Runtime config: `C:\eliteOS\config\ad-qb-customer-sync.env` (token never committed). Logs: `C:\eliteOS\logs\account-directory-qb-customer-sync\`. Wrapper: `run-ad-qb-customer-sync.ps1`. Task installer: `install-ad-qb-customer-sync-task.ps1` (preview/`-Preflight` read-only; `-Apply` explicit; no CLI Windows password — `Get-Credential` or Task Scheduler UI). |
| **Out of scope** | Financial facts; Internal Estimate / Quote Library / `customer_identity_snapshot`; Sales Dashboard; QB writes; automatic Task Scheduler registration; automatic production ingest. |
| **Impacted** | `backend-core/src/accountDirectory/qbCustomerEnrichment/*`, AD API/service/UI badges, `quickbooks-sdk-connector/account-directory-sync/`, FEATURE_DECISIONS / SYSTEM_BLUEPRINT. |
| **Revisit** | Phase 3 AD financial profile UI; enable nightly task only after proven manual wrapper PASS. Phase 1 ListID enrichment: see §313. |

### 312. Quote Flow Inbox — attachment preview + multi-plan takeoff packet + vanity depth (2026-08-11)

| Field | Value |
|-------|--------|
| **Date / branch** | 2026-08-11 · `main` |
| **Decision** | Quote Flow Inbox staff can **Preview / Download** attachments via authenticated Brain routes that stream bytes (reuse Studio secure plan viewer; never expose Graph tokens/URLs). Plan candidates include PDF + plan-like JPG/PNG/WEBP; tiny / `image###` / logo-named images classify as **likely inline** (not default-selected; preview still allowed). Staff may multi-select supported plans; `POST …/start-takeoff` accepts `attachmentKeys[]` (singular `attachmentKey` remains). Multiple files merge into one PDF packet via `pdf-lib` and submit as one AI Takeoff job; packet build failure does not create a misleading queue item. Vanity tops with raw depth **21.0–21.75** normalize to **22.5** quoted overhang depth at seed/Set Scope (audit: `rawAiDepthIn`, `normalizedBy`), not kitchen/pantry/island; staff depth edits win. |
| **Why** | Staff could not preview multi-PDF requests, multi-select errored, signature JPGs competed with real plans, and vanity cabinet depth (21.5) under-quoted tops vs 22.5 overhang rule. |
| **Impacted** | Inbox presenter/API/UI, plan attachment support, takeoff packet builder, vanity depth helper, Set Scope / seedScope, routes preview+download, FEATURE_DECISIONS (this entry). |
| **Protected / unchanged** | Pricing formulas/rates, Digital Estimate, Review/Acceptance, sold/handoff/QB/email automation, customer-facing surfaces. |
| **Revisit trigger** | WebP multi-page embed; staff “merge plans” upload; AI prompt default vanity quoted depth 22.5. |

**Hotfix (same day):** Production Quote Flow API went down because `pdf-lib` was only declared in the monorepo root `package.json`. Vercel **backend-core** Root Directory installs `backend-core/package.json` only, and a top-level `import` of `pdf-lib` in `quoteFlowTakeoffPacket.mjs` crashed module load → Quote Flow routes failed to register → `/health` 500 and Inbox CORS/runtime failures. Fix: declare `pdf-lib` in `backend-core/package.json` (+ lockfile) and **lazy-load** it only inside multi-file packet merge so missing dep cannot take down health/inbox.

**Hotfix (preview):** Inbox attachment Preview opened a modal with “Preview unavailable” because the SPA used a **relative** `fetch(/api/…/preview)` against `quoteflow.eliteosfab.com` instead of `VITE_BACKEND_URL` / backend-core (other Inbox JSON calls already used `apiFetch`). Fix: `apiFetchBlob` + `fetchQuoteFlowAttachmentPreview/Download` hit backend-core with bearer auth; PDF → iframe blob URL, images → `<img>`; safer error copy; download uses the same binary path.

**UX (2026-08-12):** Inbox batch start no longer shows duplicate debug banners (`N selected · …`). One batch panel uses staff-friendly copy + subject/plan identity; Active AI Takeoffs panel shows stage chips + indeterminate progress (no fake %); returned batch completion CTA → Estimate Queue.

**UX (Estimate Queue clarity, 2026-08-12):** Queue rows prefer email subject / human plan names over opaque numeric attachment ids. Multi-file takeoffs persist ordered `packetFiles` + subject/sender onto `quote_takeoff_jobs.metadata.quoteFlow` at start (staff-only; no intake-case subject storage change). Detail pane shows a **Processed plan packet** card before Review Takeoff.

### 313. Account Directory Financial Intelligence — Phase 1 Sales ListID enrichment (2026-08-13)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Decision** | **Phase 1 only:** extend prepared Sales QuickBooks Financial Truth facts with nullable `qb_customer_list_id` + `qb_root_customer_list_id` so Account Directory can later join financials by **exact** QuickBooks ListID. No AD Financial UI yet. No Internal Estimate / Quote Library changes. No AD identity mutation from financial sync. |
| **Phase 0 production proof** | CData DSN `slabOS_QuickBooks_Local_RO`: `CustomerId` exists on Invoices, SalesOrders, ReceivePayments, Estimates; `DueDate` / `Terms` / `TermsId` exist on Invoice/SO/Estimate (not ingested in Phase 1). Production samples prove `Invoices.CustomerId` **equals** `Customers.Id` (e.g. Gates, Bryan `80010327-1759266211`; West, Ernie `80010E11-1770822810`; both roots with blank `ParentId` / `Sublevel=0`). |
| **Join rule** | Exact ListID only. Never join by `CustomerName`. Never fuzzy. Never auto-link AD accounts. Never invent root IDs. |
| **Root resolution** | **Server-side** on Sales ingest: `qb_customer_list_id` = ODBC `CustomerId`; `qb_root_customer_list_id` resolved via `ad_qb_customer_facts` ParentId walk (cycle detection, max depth 16). Unresolved → null + warning. Sales worker does **not** query AD tables (keeps Sales ODBC worker decoupled). |
| **Sales Dashboard** | Org-level Quoted / Sales Orders / Invoiced / Collected / Open A/R math unchanged — selects `amount` / `balance` only; ListID columns are enrichment. |
| **SQL** | Manual (not applied in this change): `backend-core/supabase/eliteos_sales_quickbooks_financial_truth_listid_v2.sql` |
| **Do not touch** | `InternalEstimateApp.tsx`; IE save/revision/hydration; `customer_identity_snapshot`; Quote Library search/history/archive/delivery/PDF/email; AD accounts/contacts/locations/aliases/external_links; Thryve Remote Connector; QB writeback. |
| **Out of scope (later phases)** | True due-date aging / terms / collection attention; `ad_qb_account_financial_summary`. Slice A UI: see §314. |
| **Impacted** | `sync-sales-financials.ps1` (CustomerId SELECT), `syncIngest.js`, `resolveQbRootCustomerListId.js`, `quickbooksSalesSyncApi.js`, Sales sync tests, FEATURE_DECISIONS / SYSTEM_BLUEPRINT. |
| **Revisit** | Apply SQL + deploy Brain + one DryRun/ingest after ops approval; Slice A AD financial profile (§314). |

### 314. Account Directory Financial Intelligence v1 — Slice A (2026-08-13)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Decision** | Read-only **Financials** tab on Account Directory account detail. Prepared Sales QuickBooks facts attach **only** through active `account_directory_external_links` where `external_system = quickbooks_desktop`; `external_id` is the canonical QB **root** Customer ListID matched to `qb_root_customer_list_id`. Never join by name/fuzzy/alias. Never write AD identity or auto-link. Multiple explicitly linked roots roll up with a staff-safe warning (ListIDs never returned to the browser). |
| **Endpoint** | `GET /api/account-directory/accounts/:accountId/financials` — same auth/head/org/VIEW gates as account detail. |
| **Metrics (Slice A)** | Open A/R + open invoice count; Invoiced / Collected / Sales Orders $ / Quoted YTD (as-of worker coverage end); last invoice/payment; days since last payment; oldest open invoice **invoice age** (days); recent activity. Sales Orders $ is not renamed Sold. |
| **Deferred** | True Current/1–30/… aging, payment terms, collection attention — require DueDate/Terms enrichment (Slice B). Do not fake due-date aging from invoice_date. |
| **Fail-soft** | `unlinked` / `unavailable` / `stale`: identity still loads; never fake $0 when unlinked/unavailable; stale keeps prepared totals + warning. |
| **Paging** | Linked txn/open-AR aggregation pages at 1000 with deterministic order (same PostgREST-cap lesson as Sales Dashboard). |
| **Out of scope** | SQL migration; QB worker/ODBC; Internal Estimate; Quote Library; Sales Dashboard math; Moraware; Thryve. |
| **Impacted** | `accountDirectoryFinancialIntelligence.mjs`, `accountDirectoryApi.js`, Account Directory Financials UI/types/API client, FEATURE_DECISIONS / SYSTEM_BLUEPRINT. |
| **Revisit** | Slice B after DueDate/Terms on prepared facts; optional summary cache. |

### 315. Account Directory Financial Intelligence v1 — Slice B aging/terms (2026-08-13)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Decision** | True QuickBooks **A/R aging**, **payment terms**, and deterministic **collection attention** on Account Directory Financials. Aging uses **Invoices.DueDate only** (never invoice Date + Net-N inference). Terms from Invoices.Terms (display); TermsId stored internally and never returned to the browser. Collection attention is rules-based (`current` / `watch` / `attention` / `priority` / `unknown`) — not AI and not a credit score. Missing DueDate → `unknown` bucket (excluded from overdue). |
| **SQL** | Manual: `backend-core/supabase/eliteos_sales_quickbooks_financial_truth_aging_v3.sql` — nullable `due_date` / `terms_name` / `terms_list_id` on open A/R + invoice transactions. |
| **Worker** | `sync-sales-financials.ps1` v1.2.0 SELECTs DueDate/Terms/TermsId on invoice + open A/R; coverage diagnostics for DueDate/Terms. |
| **Planned ops (not in this coding pass)** | One-time Sales Financial Truth **backfill 2025-01-01 → current** for full 2025 + 2026 YTD / YoY / T12 account intelligence. Recurring sync remains **60-day incremental**. |
| **Out of scope** | Sales Dashboard definition changes; AD identity/link/suggestion changes; Internal Estimate; Quote Library; Moraware; Thryve; applying SQL / production ingest in this change. |
| **Impacted** | Sales worker + ingest, AD financial intelligence + Financials UI, FEATURE_DECISIONS / SYSTEM_BLUEPRINT. |
| **Revisit** | Apply v3 SQL → deploy Brain → QB Server worker 1.2.0 → DryRun → incremental ingest → optional 2025-01-01 backfill. |

### 316. QuickBooks Full Finance Foundation Phase 1 (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Additive **Full Finance Foundation** beside Sales Financial Truth. Isolated SELECT-only domains (**master**, **revenue_ar**, **ap**, **cash**, **accounting**) post to `POST /api/internal/finance/quickbooks-sync` (`QB_FINANCE_SYNC_INGEST_TOKEN` — never reuse Sales or AD tokens). Canonical v1 report basis is **Accrual**. Official P&L / Balance Sheet are stored QuickBooks report snapshots (`ProfitAndLossStandard`, `BalanceSheetStandard`), not manufactured from invoices/bills. Opening accounting state is Accrual Balance Sheet **as-of 2024-12-31**. Historical transaction target remains 2025-01-01 → current but **is not executed in Phase 1**. `Transactions` is an activity/index only (live: summarized Bill rows, blank `TxnLineId`, AP account) — not a double-entry ledger. Cash: `DepositLineItems.ItemTxnType='ReceivePayment'` and `ItemRefId` = ReceivePayment TxnID; never sum receipt + deposit as two inflows. Single-flight CData lock `C:\eliteOS\logs\qb-odbc\qb-cdata-odbc.lock` shared with Sales wrapper. |
| **SQL** | Manual: `backend-core/supabase/eliteos_qb_finance_foundation_v1.sql` |
| **Windows ops** | `quickbooks-sdk-connector/finance-sync/` — `run-finance-qb-sync.ps1 -Domain …`; config `C:\eliteOS\config\finance-qb-sync.env`; default 14-day lookback; `-CaptureOpening` for 2024-12-31 BS; `-HistoricalBackfill` refused unless `QB_FINANCE_ALLOW_HISTORICAL_BACKFILL=1`. |
| **Do not touch** | Sales Dashboard definitions; existing Sales worker datasets/math; Internal Estimate; Quote Library; pricing; Moraware; Thryve; AD identity / `customer_identity_snapshot`; QuickBooks writeback; Finance Command Center UI. |
| **Out of scope this pass** | 2025 historical backfill; UI; applying SQL; production ingest. |
| **Revisit** | Apply SQL → deploy Brain with `QB_FINANCE_SYNC_INGEST_TOKEN` → small DryRun per domain → small live ingest + idempotent rerun → opening capture → then backfill GO checklist in `QUICKBOOKS_FINANCE_BACKFILL_READINESS.md`. Staff read APIs + Finance Head: §317. |

### 317. eliteOS Finance Head v1 — governed reads + UI (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | First visible **eliteOS Finance Head** (`app-finance/`, slug **`finance`**) reads **only** through Brain `GET /api/finance/*`. QuickBooks stays read-only. Browser never queries `qb_finance_*`. Official P&L/BS come from stored Accrual `ProfitAndLossStandard` / `BalanceSheetStandard` snapshots. Open A/R reuses Sales Financial Truth current snapshot (DueDate aging only). Open A/P uses `qb_finance_open_ap_current`. Cash keeps receipt vs deposit as separate event roles and never adds them. Missing facts render **unavailable**, never fake $0. Visual language follows the shared eliteOS bright/translucent product system under `EliteosTopbar`; Finance-only visualization and motion tokens do not restyle other heads. **`quickbooks_intelligence` remains a separate head.** |
| **Auth** | `requireAuth` + `requireRole(["admin","super_admin","executive","finance","accounting"])` + `requireHeadAccess("finance")`. Organization scope is the authenticated user's `organization_id` only (no query-org override, no default-org fallback). |
| **Env** | Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`, `VITE_HOME_URL`. Brain: `HEAD_URL_FINANCE` (launcher + CORS). Freshness: see §317d. |
| **Out of scope** | 13-week forecast, collections automation, bill-pay recommendations, credit-risk scoring, Ask Finance, email reminders, bank feeds, isolved, Moraware joins, Customer 360, QuickBooks writeback, extract-pipeline changes, historical backfill, migrations. |
| **Impacted** | `backend-core/src/finance/financeRead/*`, `app-finance/`, `server.js`, `launcherHeads.js`, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Create Vercel project for `app-finance`, set `HEAD_URL_FINANCE`, redeploy Brain, grant head access, then optional DNS `finance.eliteosfab.com` if chosen. |

### 317d. Finance freshness is cadence-aware and metric-owned (2026-08-17)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-17 |
| **Decision** | Finance domain freshness is **cadence-aware** and **metric-owned**. Intraday domains (`revenue_ar`, `ap`, `cash`) default **4 hours** stale (`QB_FINANCE_STALE_AFTER_SECONDS` fallback). Nightly domains (`accounting`, `master`) default **26 hours** (`QB_FINANCE_NIGHTLY_STALE_AFTER_SECONDS` or per-domain `QB_FINANCE_*_STALE_AFTER_SECONDS`). Overview / tab metrics apply the freshness of the domain that **owns** their prepared facts — never a single global OR that relabels every card. P&L and Balance Sheet → `accounting`; Open A/P → `ap`; bank balances (`qb_finance_account_balances_current`) → `master` (current writer); cash events / undeposited → `cash`; Finance Open A/R → Sales Financial Truth (`sales_quickbooks_*`, separate from Account 360). Overall Finance freshness summarizes each domain against **its own** threshold. UI presents `Fresh` / `Fresh · nightly` / `Stale` / `Unavailable` without implying a uniform 4h QuickBooks cadence. Prepared-fact timestamps may escalate a metric to stale when materially older than the owning domain window. |
| **Why** | Nightly Accounting/Master runs (~1:10–1:25 AM Central) were incorrectly marking P&L/Overview STALE mid-morning while intraday Revenue/AP/Cash workers were healthy. |
| **Do not change** | QuickBooks ingestion, Windows tasks, Account 360 Sales financial-truth contract, financial calculations / source amounts. |
| **Impacted** | `backend-core/src/finance/financeRead/freshness.mjs`, Finance read service/UI, `.env.example`, this doc. |

### 317a. Finance Head YTD is derived from monthly Accrual snapshots (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Finance Head **YTD / prior-YTD** are **derived** from contiguous same-calendar-month Accrual `ProfitAndLossStandard` snapshots (including a partial current month). A monthly snapshot is never labeled YTD. Control totals are summed from stored report **lines**, not invoices. Detailed YTD hierarchy is **unavailable** until lines have a stable account identity. Prior-YTD comparison is shown only when an **equivalent** prior window can be constructed (`period_end` must match). Overview and P&L UI must display the actual `period_start` / `period_end`. |
| **Why** | Stored QB P&Ls are monthly windows. Selecting `period_start = Jan 1` previously fell back to January and labeled it YTD. |
| **Out of scope** | Extract-pipeline changes, inventing a fuzzy line matcher, fabricating missing months, summing invoices to recreate P&L. |

### 317b. Finance Head premium drilldowns remain a governed presentation layer (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Overview Revenue, Gross Profit, Gross Margin, Net Income, accounting cash, Open A/R, Open A/P, and Balance Sheet identity open accessible editorial drilldowns before navigating to the full Finance tab. Supporting facts are fetched only from existing org-scoped `GET /api/finance/*` routes. P&L monthly contribution uses the exact stored monthly windows that compose governed YTD. Insight statements are deterministic frontend presentation helpers and disappear when required inputs are unavailable. |
| **Data safety** | No new financial definition, endpoint, permission, source query, or write path. Cash event roles remain separate; receipt + deposit anti-double-count guidance stays prominent. QuickBooks internal IDs remain scrubbed by Brain. U+FFFD cleanup is display-only for isolated separator characters in statement labels. |
| **Accessibility** | Modal shell uses dialog semantics, Escape close, contained Tab focus, prior-focus restoration, backdrop close, mobile full-screen treatment, and complete `prefers-reduced-motion` fallbacks. |
| **Out of scope** | AI narration, Customer 360, collection or bill-pay recommendations, bank feeds, backend aggregation changes, QuickBooks extraction changes, migrations, and production configuration. |

### 317c. Finance Head Phase 2 is an eliteOS command center with bounded investigative reads (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Finance uses the slabOS/eliteOS visual direction (bright layered background, white/translucent rounded surfaces, navy typography, selective burgundy, shared `EliteosTopbar`). Thera is retained only as an interaction reference. Overview, P&L, Balance Sheet, A/R, A/P, Cash, and Reconciliation are dense workspaces; drilldowns supplement rather than replace them. |
| **Historical truth** | Monthly P&L trends use stored Accrual monthly snapshots. 2025/2026 overlays and YoY deltas appear only when the same month has equivalent full/partial-month coverage. Balance Sheet history uses stored statement snapshots. Current A/R/A/P tables do not manufacture historical trends. |
| **Read APIs** | Added bounded org-scoped GET reads for `/api/finance/ar/invoices`, `/api/finance/ap/bills`, `/api/finance/accounts`, `/api/finance/journal-entries`, and `/api/finance/transaction-activity`. Page size defaults to 50 and is capped at 100. Search/sort/filter inputs are allowlisted and paged ordering uses a backend-only row-id tie-breaker; the ID is never serialized. Responses expose browser-safe names, dates, references, amounts, and status only. Journal lines are explicitly a `TimeModified` subset, not posting-date history or a complete GL. Raw payloads, QuickBooks IDs, internal sync metadata, and cross-org overrides remain unavailable. |
| **Motion/accessibility** | Finance motion is viewport-triggered and one-shot: exact formatted number count-up, line draw, bar/meter growth, restrained reveal, and pointer tilt. `prefers-reduced-motion` shows exact final values immediately and disables those effects. Drilldowns lock the page while their own `overflow-y:auto` surface supports keyboard and touch scrolling; Escape, focus trap, and prior-focus restoration remain required. |
| **Boundaries** | No financial-definition change, forecast, AI, collections automation, bill-pay recommendation, bank feed, QuickBooks writeback, connector/extraction change, migration, or production configuration change. Cash receipt/deposit anti-double-count rules and Accrual/YTD governance are unchanged. A cash role with no stored facts is shown as unavailable rather than fabricated as $0. |
| **Impacted** | `backend-core/src/finance/financeRead/*`, `app-finance/src/ui/*`, Finance tests, `SYSTEM_BLUEPRINT.md`, and the Finance head map entry. |
| **Revisit** | Add historical working-capital snapshots only when governed history exists; add account-identity-backed detailed YTD hierarchy only when the extraction contract provides stable identity; evaluate frontend code splitting if the Finance bundle grows materially. |

### 318. Account Directory Account 360 is customer context, not company Finance (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Account Directory remains the **identity spine** (canonical display name, contacts, locations, aliases, status, exact external mappings). Phase 2 adds **Account 360**: a customer relationship workspace assembled only from governed, exactly linked sources. **Finance Head** remains company accounting truth (P&L, Balance Sheet, cash, A/P, GL). Account 360 may show customer open/overdue A/R, invoices, payments, quoted/sales-order/invoiced YTD, and payment terms. It must not expose company-wide Finance data. |
| **Identity** | Exact Account Directory UUID, exact active `quickbooks_desktop` root ListID, and stored `account_directory_account_id` on estimates. Never join ABC Builders to ABC Builders LLC by similar names. Unresolved linkage stays needs-review / unavailable. |
| **Reads** | Extends existing Account Directory Brain routes. New GETs: `/financials/trend`, `/financials/invoices`, `/relationship`, `/timeline`. Same auth/head/org/VIEW gates. Bounded/paginated. Browser payloads scrub QuickBooks/internal IDs. List intelligence uses one org-scoped open-A/R read keyed by exact root IDs — no N+1 from the browser. |
| **Trends** | Monthly customer invoiced/collected/sales-order/quoted series from the deepest governed customer-identified source (see §319). Current open A/R is a snapshot, not historical A/R. Months outside coverage are omitted, not zero-filled as if known. |
| **Estimates / jobs** | Internal Estimate and Studio estimates appear only when `account_directory_account_id` is stored. Moraware jobs for Account 360 use Option B exact `source_account_id` links and TRUSTED_NOW 2026 job/SqFt facts (§324–§327). Quote Flow has no AD identity bridge in this phase. |
| **Out of scope** | SQL migrations; QuickBooks writes; Finance definition changes; AI/Qwen; fuzzy identity; maps/geocoding; collections automation; production configuration. |
| **Impacted** | `backend-core/src/accountDirectory/*`, `app-account-directory/`, FEATURE_DECISIONS, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Store Moraware `account_directory_account_id`; Quote Flow identity; optional summary cache if list intel becomes heavy; Account Intelligence agent on these deterministic payloads. |

### 319. Account 360 staff-safe historical customer sales (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Account 360 may expose **selected-customer** commercial and receivables history needed to serve that relationship. It does **not** expose company financial position, profitability, ownership economics, vendor economics, payroll, cost basis, or accounting internals. **Finance / Executive** remain the authority for restricted company financial intelligence. No owner dashboard, leadership toggle, or hidden margin cards in Account Directory. |
| **Staff-safe allowlist** | When exactly linked: quote/estimate count and dollars; sales-order count and dollars; invoice count and dollars; payment/collected dollars; current open/overdue A/R; open invoice count; invoice due dates/aging/terms; last invoice/payment; days since payment; customer-specific transaction history and monthly trends; exact-linked eliteOS estimates already allowed. |
| **Forbidden in the browser payload** | Company revenue/P&L/Balance Sheet/cash/bank/LOC/A/P; vendor pricing/balances; COGS/job cost/customer profitability/gross profit or margin; markup/internal cost; payroll/wages/compensation/owner distributions/tax; journal entries/GL/account balances/bank feeds; company-wide concentration or rankings; other customers' financials; QuickBooks raw payloads, ListIDs, TxnIDs, ingest tokens. Fields are omitted on the server, not CSS-hidden. |
| **History source** | Prefer `qb_finance_transaction_index` header rows (`Estimate`, `SalesOrder`, `Invoice`, `ReceivePayment` only) with exact identity: Account Directory UUID → active `quickbooks_desktop` root ListID → `ad_qb_customer_facts` descendant ListIDs → `entity_id`. Do not fuzzy-join by name. Current A/R remains `sales_quickbooks_open_ar_current` (snapshot). Sales Financial Truth is fallback when the Finance index is unavailable. Do not query QuickBooks Desktop from Account 360. |
| **Coverage** | Finance foundation historical start **2025-01-01** through latest accounting sync as-of. Never say Lifetime unless complete lifetime coverage is proven. YoY uses equivalent calendar windows only (e.g. Jan 1–as-of vs same span last year) and is unavailable when the prior window is outside coverage. |
| **Labels** | UI says **Sales Orders**, not Sold. Aggregate Quotes → Sales Orders → Invoices → Payments is **Commercial activity**, not a conversion funnel (`qb_finance_linked_transactions` is empty). |
| **Roles** | `account_directory_view` is granted to every mapped role (and unknown roles). Head access still required. Do **not** add `account_directory_sensitive_financials` this phase — omit owner-sensitive data entirely. |
| **Index note** | `qb_finance_transaction_index` is indexed by org/date/type, not `entity_id`. A customer-history index `(organization_id, entity_id, txn_type, txn_date)` is recommended later; no migration in this phase. Bounded paged reads for the selected account only; master list does not fetch histories. |
| **Impacted** | `backend-core/src/accountDirectory/*`, `app-account-directory/`, this doc, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Sales worker `-Backfill` if Sales facts should also hold 2025+; optional `entity_id` index; formal Sold = Sales Order policy. |

### 320. Account Directory customer status reconciliation is dry-run only (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Account Directory remains lifecycle identity authority. QuickBooks is authority for whether an identity is an **established accounting customer**. Phase 4 ships a **read-only** classifier and `npm run account-directory:status:reconcile:dry-run`. No status writes, archives, deletes, merges, or auto-links. |
| **Statuses** | Existing `active`, `prospect`, `inactive`, `needs_review`, `archived` are sufficient. Active = exact `quickbooks_desktop` root link + QB `is_active`. Inactive = exact link + QB `is_active = false`. Prospect = unlinked pre-sale only. Needs Review = suggestions/conflicts, sold/accepted estimate without exact QB link, unlinked workbook seed, hierarchy/shared-root conflicts. Archived stays archived. |
| **Identity** | Exact UUID → active `quickbooks_desktop` link → QB root ListID only. Name rank / suggestions may set Needs Review, never Active. QB jobs (`is_job`) never establish a separate customer. Sales Order is not Sold. Quote Flow and Moraware are not UUID-linked to Account Directory yet. |
| **Writes** | Forbidden this phase. JSON reports go to gitignored `local-imports/account-directory/status-reconciliation/`. No admin Apply UI. |
| **Impacted** | `backend-core/src/accountDirectory/accountDirectoryStatusReconciliation*.mjs`, dry-run script, this doc, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Controlled write phase only after reviewing the live dry-run matrix. |

### 321. Account Directory status review queue is admin-only and one-account (2026-08-14)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-14 |
| **Decision** | Phase 4B adds an ADMIN-only Status Review workstation for the Phase 4 **exception set** only (Active→Needs Review, Prospect→Needs Review, Active→Prospect). Consistent Active/Prospect/Archived rows stay out of the queue. Humans resolve **one account at a time**. There is no Apply All, auto-link, auto-merge, bulk archive, or bulk delete. |
| **Persistence** | Human decisions persist as `account_directory_audit_events.action = status_reconciliation_reviewed` with `new_values` `{ decision, currentStatus, recommendedStatus, reasonCodes, evidenceFingerprint, classifierVersion, keepReason, note }`. No migration. `keep_current` plus an unchanged evidence fingerprint suppresses the same recommendation from Needs decision. Material identity/lifecycle evidence change (exact QB link, QB active, sold/accepted, suggestion state) changes the fingerprint and reopens review. Prior review remains in audit history. Status-mutating review decisions update the account with an internal `suppressAudit` option so the ordinary generic `update_account` audit is not emitted; `status_reconciliation_reviewed` is the authoritative audit for that mutation. If disposition persistence fails after the status write, status is rolled back and no false status-change audit remains. |
| **Writes** | Status changes go through existing `updateAccount` (auth, org, ADMIN, `row_version`, actor, request id, audit). Stale `row_version` or fingerprint → 409, refresh, do not overwrite. Accept recommendation may not set Active from a QB name suggestion (`fuzzy_active_forbidden`). Confirming a suggested QB customer uses the existing governed `link-quickbooks` workflow only. Ordinary EDIT (`account_directory_edit`) may PATCH identity fields (name, legal name, contacts, locations) but must not include `status`. A PATCH payload that contains `status` requires `account_directory_admin` and is rejected (403) for non-ADMIN callers — the field is never silently ignored, and no partial mutation occurs. Direct ADMIN status PATCH remains allowed; Active still requires an exact QuickBooks root link. Status Review remains the governed exception-queue path. |
| **Keep Active** | Active→Prospect is a conservative recommendation, not “this is not a customer.” Keep Active requires `keepReason` (`known_customer_awaiting_qb` / `strategic_manual` / `historical_customer` / `other`) plus optional note. |
| **Auth** | `account_directory_admin` (`admin`, `super_admin`, `executive`). VIEW/EDIT (sales, office, customer service, estimator) cannot load or decide the review API. |
| **Staff-safe** | Queue payloads omit owner-sensitive finance and raw QB ListIDs/TxnIDs. |
| **Impacted** | `accountDirectoryStatusReview.mjs`, review routes, `app-account-directory` Status Review tab, this doc, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Optional reviewer display-name join; later inactive-QB queue if that cohort appears. |

### 322. Account 360 is the staff-safe customer operating workspace (2026-08-15)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-15 |
| **Decision** | Account 360 is the **staff-safe customer operating workspace** inside Account Directory. Account Directory owns identity and lifecycle. QuickBooks confirms accounting customer identity via exact root links. Finance owns restricted company financial truth. Account 360 Insights are deterministic, customer-specific, and evidence-backed. No AI-generated financial truth. No customer profitability, margin, COGS, or company P&L in Account 360. |
| **Workspace** | Near-full-screen overlay (~94–96vw × 92–94vh) over the still-mounted directory list. Tabs: Overview, Financials, Relationship, Notes, Follow-ups, Contacts, Locations, Connections, Insights. Aliases live under Connections. Directory audit activity under Connections is ADMIN / `canViewAudit` only; ordinary VIEW payloads omit `auditHistory` (no auth user ids). URL `account` + `panel` preserve deep links. |
| **Contacts / locations** | Governed PATCH via backend-core. Edit, primary, type, deactivate. No hard-delete in normal UI. Frozen estimate snapshots are not rewritten. |
| **Freshness** | Open receivables use Sales prepared facts (`sales_quickbooks_sync_runs`). Commercial history uses the Finance transaction index clock. Thresholds are independent (Sales default 4h; history default 26h for nightly accounting sync). Staff copy is source-specific. Do not blanket-stale the whole account. |
| **Insights** | `GET /api/account-directory/accounts/:id/insights` and `.../insights/:insightId/evidence`. Backend allowlisted math. True Estimate Win Rate only when Internal sold+lost both exist. Quote-to-Order is an aggregate dollar ratio, never a close/win/conversion rate. Numeric 90-day forecast is rejected until comparable history, a non-overlapping target, and a backtest exist; Outlook reuses momentum labels. |
| **Impacted** | Account Directory head, `accountDirectoryInsights.mjs`, financial freshness, this doc, SYSTEM_BLUEPRINT, head map. |
| **Revisit** | Lost/declined dispositions across Studio/DE; invoice–payment application linking; numeric outlook after longer coverage. |

### 323. Account Directory Phase 5.1 — workspace UX + Relationship reliability (2026-08-15)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-15 |
| **Decision** | Presentation-only pass on Account Directory / Account 360. Directory list desktop max width ~1500px. Account 360 keeps the near-full-screen overlay with identity header, sticky tab bar, and tab content layers. Relationship must never blank the workspace: nested optional relationship fields are read through a safe view-model; missing history uses a designed empty state. No lifecycle, QuickBooks linking, financial math, Status Review classifier, or migration changes. |
| **Impacted** | Account Directory UI, Relationship view-model tests, this doc, SYSTEM_BLUEPRINT. |

### 324. Account Directory ↔ Moraware identity uses Option B external links (2026-08-15)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-15 |
| **Decision** | Moraware Account identity cardinality: the Account Directory UUID is the canonical customer identity. Each exact Moraware Account ID may have only one active AD UUID. One AD UUID may have multiple active Moraware Account IDs. Moraware IDs remain source identities; they are not merged or rewritten. ESF booking-shop prefixes such as `Dyersville-` do not create separate AD locations/accounts by themselves. Fuzzy/history evidence may propose but never establish permanent identity. Human confirmation establishes the durable external link (`account_directory_external_links`, `external_system = moraware`). |
| **Storage** | Existing unique active index `(organization_id, external_system, external_id) WHERE is_active = true`. No uniqueness on `(account_id, external_system)`. Moraware IDs are not attached to `account_directory_locations`. No schema migration. |
| **Governance** | Confirm Link is one ID at a time. No Confirm All / bulk-link. Do not silently move an active Moraware ID; conflict 409 with the existing AD UUID. Deactivate preserves inactive history; same-account reactivate is audited as `relink_moraware`. Internal/house buckets (Direct, Dyersville- Direct, Elite Stone Fabrication, Aceno Granite, Cambrian Granite & Stone, Retail Dyersville) stay unlinked until an identity policy exists. Policy uses the canonical Brain Moraware `account_name` for the exact Account ID, not the client display name. Do not auto-create AD accounts or one-off retail UUIDs. |
| **Audit** | Moraware link/unlink/relink require a durable `account_directory_audit_events` row; a failed domain audit is returned as `audit_write_failed` rather than HTTP success. The store has no identity+audit transaction, so a rare audit-insert failure can leave the external-link row changed without an audit event. `linked_by` / `linked_at` remain on create/relink rows. QuickBooks audit remains fail-open as before. |
| **Out of scope this phase** | Salesperson ownership, View 222, sales dashboards, Moraware writeback, QuickBooks write/read-behavior changes, Account 360 operational job metrics beyond the staff-safe `moraware` relationship shape. |
| **Impacted** | `accountDirectoryService` Moraware link ops, reconciliation queue, Account Directory Moraware Links tab, Account 360 `relationship.moraware`, this doc, SYSTEM_BLUEPRINT. |

### 325. Account 360 Moraware Operations — TRUSTED_NOW 2026 jobs + SqFt (2026-08-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-16 |
| **Decision** | Account 360 may show **TRUSTED_NOW** Moraware operational facts for an Account Directory UUID: linked Moraware Account IDs, 2026 job count, **2026 Job Worksheet Sq.Ft.**, earliest/latest job date, and a bounded recent-jobs list. Identity remains Option B exact links. No material, color, room, edge, install-completion KPI, or “active = in production” interpretation. QuickBooks financial cards are unchanged. |
| **Aggregation** | Active `account_directory_external_links` where `external_system = moraware`. Typed `brain_moraware_jobs` for `organization_id` + `source_account_id IN` those IDs **and** `CURRENT_MORAWARE_JOB_SET` (`last_seen_at >=` start of the latest successful complete uncapped **full** census). Incremental sync updates `last_seen_at` on changed/new jobs only; absence from an incremental run does not drop members. Do **not** filter to the account's latest `last_seen_at` day. Count jobs whose typed date year is 2026. Union across multiple Moraware IDs on the same AD UUID. `accounts[].job_count` is that Moraware ID's 2026 job count. See §326. |
| **SqFt** | Same CURRENT_MORAWARE_JOB_SET + 2026 typed-date filter. Extract via Job Worksheet template + `Sq.Ft.` fields only (`extractJobWorksheetCensusSqft`). Deduplicate by `source_job_id`. Do **not** use prepared sales facts, View 222, or `moraware_raw_job_forms` for Account 360. `raw_payload` is loaded server-side for extraction only and must not appear in the API response. |
| **Date rule** | Typed only, never `raw_payload`: `created_at_source` if present, else `install_at_source`, else `completed_at_source`. Year is the `YYYY` prefix of that date. |
| **Failure** | Jobs query error or unresolved current population → `jobs_state` / `sqft_state = unavailable`, `job_count_2026` / `sqft_2026 = null` (never a false zero). Unlinked → unavailable. Linked with zero 2026 jobs / zero worksheet SqFt → `available` with count/SqFt 0. |
| **Salesperson** | `salesperson_name` is a **job fact** only, not Account Directory ownership. |
| **Out of scope** | View 222, Moraware/QB writes, identity changes, material/color/room/edge, install or production-stage KPIs. |
| **Impacted** | `accountDirectoryMorawareLinkage`, `accountDirectory360`, Account 360 Relationship UI, this doc, SYSTEM_BLUEPRINT. |

### 326. CURRENT_MORAWARE_JOB_SET — full census baseline + incremental overlay (2026-08-16)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-16 |
| **Decision** | Moraware **current population** is Option D. The latest **successful, complete, uncapped FULL census** establishes membership. Subsequent **incremental** runs overlay updates and new jobs only. Incremental absence is never deletion. Only a later successful complete uncapped full census may establish that a previously known job is no longer a current member. Raw `brain_moraware_jobs` rows are never purged for membership. Identity remains exact `source_job_id` (never customer-name matching). |
| **Rule** | `CURRENT_MORAWARE_JOB_SET` = org jobs where `last_seen_at >= full_census_started_at` (start of that full census). Watermark does **not** use latest job `last_seen_at`, latest import group regardless of scope, or latest incremental run. |
| **How full census is identified** | Explicit `metadata.census_scope = full` (future imports; required on live writes). Legacy 2026 Foundation groups **without** `census_scope` qualify when `mode` or `metadata.snapshot_mode` contains `baseline_2026`, the import group is complete, and there are no blocking cap warnings. **Not** inferred from chunk count. Incremental groups stamp `census_scope = incremental` and never advance the watermark, even if mode still contains `baseline_2026`. Production import_group_id is not hardcoded. Resolver searches explicit `census_scope=full` groups without a bounded recent-run cutoff; legacy `baseline_2026` is used only when no explicit full census exists. |
| **Resolver performance (2026-08-17)** | `resolveCurrentMorawarePopulation` pages successful sync runs **newest-first** and evaluates each newly seen `import_group_id` immediately, returning on the first qualifying complete uncapped FULL census (does **not** preload tens of thousands of historical chunk rows). Optional in-process TTL cache: **60s** for available results, **10s** for unavailable; `invalidateCurrentMorawarePopulationCache` clears it. Cache does not change membership semantics — only how often the authority is re-resolved. |
| **Incremental overlay exclusion (2026-08-17)** | Incremental sync runs may reference `import_group_id` / `parent_full_epoch_id` of FULL epoch A for prepared/worksheet overlay. They **must never** participate in FULL chunk completeness, census_scope selection, or watermark eligibility — whether `running`, `failed`, or `successful`. `evaluateImportGroupAsFullCensus` and `summarizeImportGroupRows` filter to FULL-authority runs only (`census_scope=full` or legacy `baseline_2026`). A stuck incremental sharing epoch A cannot fall the resolver back to an older FULL. |
| **Account 360 vNext (2026-08-17)** | Read-first workspace UX: progressive loading (identity shell + separate financials/relationship/timeline boundaries), trusted KPI row (2026 Jobs / SqFt / quote / Open A/R with unavailable≠0), Relationship reorganization, Connections identity graph (AD UUID + multi-Moraware IDs). Relationship API no longer embeds a second full financials load by default; Insights passes preloaded financials; FE enriches collection health signals from `/financials`. No new CRM writes, no unvalidated Moraware metrics. |
| **Writer lock** | Canonical population writers share exclusive `eos_sync_locks.lock_name = moraware_population` (owner token in `locked_by`, lease in `expires_at`). FULL/INCREMENTAL hold it from before crawl through import + prepared-fact rebuild. `POST /api/internal/moraware-sync/import` and `rebuild-prepared-facts` fail closed unless the caller owns the active lock. Local PID file remains process protection only. |
| **Verified Foundation** | 2026-08-15 complete uncapped `baseline_2026` census: **4,073** jobs, **271,432.5** worksheet SqFt. 24 older rows remain stored (917.5 SqFt) and are excluded from the current set. |
| **SqFt** | Same current set. Job Worksheet template + `Sq.Ft.` fields only. Not View 222. Not `moraware_raw_job_forms`. Account 360 Relationship → Moraware Operations shows **2026 SqFt** from this extractor on the linked-account current set (§325). |
| **Prepared facts** | `sales_moraware_job_facts.import_group_id` is the **full-census epoch** id. Rebuild scans the current job set **while `moraware_population` is still held**. After a 17-job incremental, facts must remain ~4,073 (+ legitimate new jobs), not 17. A later full census starts a new epoch; jobs absent from that census leave current facts; raw rows remain. |
| **Safeguards** | Failed, partial, or capped full imports do not advance the watermark. |
| **first_seen_at** | Upsert payloads omit `first_seen_at`. Residual assumption: PostgREST updates only columns present in the JSON, so omit preserves the insert DEFAULT / original value. No migration for this. |
| **Out of scope / follow-up reads** | Mac mini incremental schedule, View 222, deleting stale rows. Non-primary consumers not rewritten here: Account Directory Moraware reconciliation latest-day logic; `salesAttributionCoverage` latest-group logic; admin all-job health counts; unused `fetchLatestCompleteMorawareJobs`. |
| **Impacted** | `morawareCurrentPopulation`, `morawarePopulationLock`, import metadata, Account 360, Sales prepared-fact rebuild/read, scheduled pipeline, this doc, SYSTEM_BLUEPRINT. |

### 327. Moraware Job Worksheet scope-intelligence facts (TRUSTED_NOW raw) (2026-08-17)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-17 |
| **Decision** | The **Job Worksheet** form instance is the canonical scope-intelligence grain for Color, Sq.Ft., Room, Edge presence, Thickness, Sink Type, and selected raw fabrication fields (Faucet/Stove/Electrical/Overhang/Braces/Dry Treat/Stone Care Kit). Extractor: `extractMorawareJobWorksheetScopeFacts`. Prepared table (manual SQL): `sales_moraware_job_worksheet_facts` — one row per `(organization_id, import_group_id, source_job_id, source_form_id)`. Population epoch = latest successful complete uncapped **FULL** census `import_group_id` (same Option D contract as `sales_moraware_job_facts`). |
| **Valid aggregations** | SqFt by Color; SqFt by Room; SqFt by Thickness. Edge = worksheet count + distinct job count only (**no** Edge SqFt mix / LF). |
| **Raw only / pending** | Back Splash Type + Height extracted raw — **no** NONE/STANDARD_4_INCH/FULL_HEIGHT normalization yet. **Material / Stone family unimplemented** (no Job Worksheet Material field; Color→family inference prohibited). **Upgrade score / comment-derived options unimplemented**. Shop Comments are not structured intelligence. |
| **Controls** | CURRENT set: **4,073** jobs, **10,719** worksheets, **271,432.5** SqFt; **109** jobs without Job Worksheet. Broihahn (553+635): **13** jobs, **39** worksheets, **1,283.5** SqFt. |
| **Account 360** | Helpers (`buildWorksheetScopeReadModel`) are ready for a future read path. **Not wired into Account 360 UI** in this pass. |
| **Writer lock** | Live population of `sales_moraware_job_worksheet_facts` is part of the canonical Moraware population critical section. Standalone populate acquires `eos_sync_locks.lock_name = moraware_population` **before** resolving CURRENT jobs / loading `brain_moraware_jobs`; outer FULL/INCREMENTAL passes `outerOwnerToken` (verify/renew only — does not release). Dry-run does not acquire the lock. Fail closed if owner missing/wrong/expired/lost. |
| **Pipeline** | `POST /api/internal/moraware-sync/rebuild-prepared-facts` (scheduled pipeline after successful import, while `moraware_population` is held) rebuilds job facts then worksheet facts via `rebuildMorawarePreparedFactsBundle` + `outerOwnerToken`. Worksheet failure → HTTP 409 / pipeline non-success; outer finally still releases the lock. Old worksheet epochs are preserved. Live pipeline control mode is **reconcile** (internal consistency; allows legitimate CURRENT growth). Foundation absolute totals remain dry-run / known-epoch checks. |
| **Incremental** | Strategy: **`creation_window_plus_rolling_exact_refresh`** (2026-08-17). Moraware XML exposes **no** authoritative modified-since / changed-since list filter — **creationDate is not modification detection**. Creation-window discovery uses **`collectCompleteIncrementalJobList`** (Foundation `buildJobQueryByProcessInnerXml` pagination) — **not** the capped sample helper. Complete list traversal required (`COMPLETE_LIST_DISCOVERY`); incomplete → **`CREATION_DISCOVERY_INCOMPLETE`** (zero writes). Live production path is gated (`--live` + `--allow-live-incremental` + `MORAWARE_INCREMENTAL_LIVE=1` + `MORAWARE_INCREMENTAL_EXECUTE=I_UNDERSTAND_PRODUCTION_WRITES`), acquires **`moraware_population`**, exact-refreshes candidates under live ceiling (default **150**), Brain upsert `census_scope=incremental` under parent FULL epoch A, scoped prepared + worksheet refresh, validates, then advances **both** cursors only on total success. Account rollups remain deferred. Dry-run cannot mutate. Absence never deletes membership/worksheet rows. View 222 is not identity authority. |
| **SQL** | Manual: `backend-core/supabase/eliteos_sales_moraware_job_worksheet_facts_v1.sql` — applied; live population verified. |
| **Out of scope** | Account 360 UI wiring, Material Mix, normalized backsplash, upgrades, Moraware crawl/sync from this writer. |
| **Impacted** | `morawareJobWorksheetScope.mjs`, `morawareJobWorksheetPreparedFacts.mjs`, worksheet facts SQL/CLI, FEATURE_DECISIONS / SYSTEM_BLUEPRINT. |

### 328. Account 360 internal Notes are eliteOS data on the Account Directory UUID (2026-08-17)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-17 |
| **Decision** | Account 360 Notes are durable **internal eliteOS** staff notes keyed only by `organization_id` + canonical **Account Directory UUID**. They must not write to QuickBooks, Moraware, external CRMs, or customer-facing quote systems. Notes are not associated by customer name or fuzzy identity. Account-create payload `notes` remains discarded; this feature is the `account_directory_notes` child table + nested API. |
| **Schema** | `public.account_directory_notes` (manual SQL `backend-core/supabase/eliteos_account_directory_notes_v1.sql`, **applied**). Columns: id, organization_id, account_id FK, body (trim-nonempty, max 4000), created/updated timestamps and actors, archived_at/archived_by, row_version. Index `(organization_id, account_id, created_at DESC)`. RLS SELECT-org for authenticated; mutations via service_role backend. Soft-archive only; no hard DELETE. |
| **Permissions** | VIEW list: `account_directory_view` (anyone who can open Account 360). CREATE / EDIT / ARCHIVE: `account_directory_edit` (same as contacts/locations). Not owner-only — current auth data cannot support owner-only cleanly. Account archive remains ADMIN. Backend authorization is authoritative. |
| **API** | `GET/POST /api/account-directory/accounts/:accountId/notes`, `PATCH …/notes/:noteId`, `POST …/notes/:noteId/archive`. No org-wide notes dump. Page default 25, max 50, newest-first. Public author is `{ displayName }` from `user_profiles.full_name` (fallback `"Staff"`). No email, tokens, or user ids in the note payload. `rowVersion` is included for PATCH. |
| **Audit** | After successful mutation only: `add_note` / `update_note` / `archive_note` with `{ noteId, bodyLength }` — not the note body. |
| **UX** | Dedicated Account 360 **Notes** tab. Overview does not load notes history. Page 1 is session-cached; page 2+ appends locally; account switch aborts; create/edit/archive invalidates the Notes family only. |
| **Out of scope** | Full-text search, mentions, attachments, Overview compact summary, owner-only edit, exposing user ids/emails, account-level `notes` column. |
| **Impacted** | Account Directory store/API, Account 360 Notes tab, request coordinator, this doc, SYSTEM_BLUEPRINT. |

### 329. Account 360 internal Follow-ups are eliteOS data on the Account Directory UUID (2026-08-17)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-17 |
| **Decision** | Account 360 Follow-ups are durable **internal eliteOS** staff reminders keyed only by `organization_id` + canonical **Account Directory UUID**. They are not QuickBooks tasks, Moraware tasks, calendar events, emails, customer-facing reminders, or AI-generated actions. Identity is never customer name or fuzzy match. |
| **Schema** | `public.account_directory_follow_ups` (manual SQL `backend-core/supabase/eliteos_account_directory_follow_ups_v1.sql`, **applied**). Columns: id, organization_id, account_id FK, title (trim-nonempty, max 200), details (optional, max 4000), due_at timestamptz NOT NULL, status CHECK (`open`\|`completed`) default `open`, assigned_to (optional UUID, no FK), created/updated/completed/archived timestamps and actors, row_version. Indexes: `(organization_id, account_id, status, due_at)`; partial open `(organization_id, account_id, due_at, created_at, id) WHERE archived_at IS NULL AND status = 'open'`; partial completed `(organization_id, account_id, completed_at DESC, id) WHERE archived_at IS NULL AND status = 'completed'`; partial assignee `(organization_id, assigned_to, due_at, id) WHERE archived_at IS NULL AND status = 'open' AND assigned_to IS NOT NULL` (future My Follow-ups; not used in this phase). RLS SELECT-org for authenticated; mutations via service_role backend. Soft-archive only; no hard DELETE. No priority column. |
| **Assignment** | Implemented. Org-scoped `user_profiles` (`id`, `full_name`, `is_active`) already used for Notes authors. Public payload includes `assignedTo` UUID (PATCH round-trip) + `assignee: { displayName }`. No emails or tokens. Unassigned allowed. Cross-org rejected. Self-assign allowed. |
| **Permissions** | VIEW list: `account_directory_view`. CREATE / EDIT / COMPLETE / REOPEN / ARCHIVE: `account_directory_edit`. Assignee picker: EDIT. Not owner-only. Backend authorization is authoritative. |
| **API** | Nested only: `GET/POST /api/account-directory/accounts/:accountId/follow-ups`, `GET …/follow-ups/assignees`, `PATCH …/follow-ups/:followUpId`, `POST …/complete`, `…/reopen`, `…/archive`. DELETE → 405. Default filter `status=open` (`completed`\|`all` allowed). Page default 25, max 50. Open order: due_at ASC (overdue then nearest), then created_at, id. Completed: completed_at DESC. No org-wide dump. |
| **Due state** | Derived, not stored: `overdue` if due_at < now; `due_today` if still future and same local calendar day; `upcoming`; `completed` if status is completed. Past due timestamps are valid. |
| **Audit** | After successful mutation only: `add_follow_up` / `update_follow_up` / `complete_follow_up` / `reopen_follow_up` / `archive_follow_up` with `{ followUpId, dueAt, status, assignedTo }` — not `details`. |
| **UX** | Dedicated Account 360 **Follow-ups** tab after Notes. Open/Completed filter. Overview does not load follow-up history or a compact summary. Page 1 is session-cached per filter; page 2+ appends locally; account switch aborts; mutations invalidate the Follow-ups family only (Notes/Financials/Relationship/Insights caches stay). Complete has no confirm; archive confirms. |
| **Out of scope** | Global My Follow-ups / All Follow-ups dashboard, recurring, snooze/blocked/in_progress statuses, priority, notifications, email/calendar, AI-generated follow-ups, attachments, mentions, Overview compact next/overdue summary, owner-only edit. |
| **Impacted** | Account Directory store/API, Account 360 Follow-ups tab, request coordinator, this doc, SYSTEM_BLUEPRINT. |

### 330. Moraware final-action review queue is operator-local, not identity authority (2026-08-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-18 |
| **Decision** | The completed Moraware/QB/Account Directory reconciliation action plan is **temporary operator input**. It is not production identity. Canonical identity remains Account Directory UUID + exact QuickBooks ListID + exact Moraware `source_account_id` (Option B). Names are evidence only. Runtime always re-resolves Moraware `source_account_id` from Brain `brain_moraware_accounts` (same latest-`last_seen_at` day set as the existing reconciliation queue). Zero matches, multiple plausible source IDs, or a contradictory current Moraware link → `BLOCKED_MORAWARE_SOURCE_ID` (excluded from the fast queue). Display-name “already linked” is **not** `ALREADY_LINKED` unless the exact current `source_account_id` → AD UUID link exists. If a planned CREATE ListID is already linked to an AD UUID, reclassify to CONNECT that UUID (existing AD wins; no duplicate). |
| **Execution** | Fast queue is CONNECT then CREATE only. Human YES is mandatory for each new Moraware relationship. CREATE from QuickBooks rechecks the ListID is still unlinked, creates the AD UUID + exact QB link, and **does not** auto-connect Moraware; the same row restages for an explicit YES — CONNECT MORAWARE. No bulk confirm. No QuickBooks writes. No Moraware writes. Non-executable plan classes (`MANUAL_QB_ROOT_SELECTION`, `KEEP_UNRESOLVED`, `IGNORE_LEGACY`, `INTERNAL_BUCKET`, `REVIEW_REQUIRED`) and blocked rows stay out of the fast queue (normal reconciliation views remain). |
| **Plan loading** | Never ship or default to `local-imports/` CSV. Operator artifact is gitignored JSON. Load only via `ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_PATH`, or non-production `ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_ALLOW_LOCAL=1`. Do **not** set the path on the production web host. If a deploy would require shipping the CSV or hard-coding customer decisions, do not ship the queue. |
| **Out of scope** | Bulk link, auto-confirm, new matching system, Account Owner, mutating QuickBooks or Moraware. |
| **Impacted** | `accountDirectoryMorawareFinalActionQueue`, plan loader, existing Moraware reconciliation GET + Account Directory Moraware review UI, this doc, SYSTEM_BLUEPRINT. |

### 331. Account Directory landing page is an operational read-model dashboard (2026-08-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-18 |
| **Decision** | The Account Directory **main list** is a staff-safe operational dashboard. New cells are **read-only presentation**. Identity, reconciliation, Final Review Queue, Account 360 contracts, Notes/Follow-up mutations, financial math, RBAC, and external writes are unchanged. Names remain evidence, not durable identity. |
| **Connections** | QB connected = an exact active `quickbooks_desktop` external link only. Moraware connected = one or more exact active `moraware` links. Suggestions / fuzzy / enrichment candidates never count as connected. Existing `suggested_match` / `needs_review` enrichment may show `QB ⚠` without new matching. |
| **YTD (list)** | True calendar YTD: current year through **today**, using typed Moraware `job_date` (`created_at_source` else `install_at_source` else `completed_at_source`) on **`CURRENT_MORAWARE_JOB_SET`**, distinct `source_job_id`. Future-dated current-year jobs are excluded. Account 360 Moraware Operations remains **full calendar 2026** (no `asOf`) and is not relabeled YTD. |
| **Hero cards** | Removed 2026-08-18 (`FEATURE_DECISIONS.md` §333). The landing page is a fast customer directory, not an operational KPI dashboard. |
| **Last Activity** | Max of latest CURRENT-set Moraware job date, latest note `created_at`, and latest open follow-up `updated_at`/`created_at`. Not `updated_at`. Null renders `—`. |
| **Sorting** | Header sorts the **entire filtered population**, then paginates. Cheap sorts (name, status, updated) paginate the base directory first; a second page-intelligence request hydrates only visible rows. Derived sorts (YTD, follow-up attention, connections, A/R, last activity) still enrich the full filtered set before pagination. Safety bounds fail closed: YTD job load, account full-population sort, and note/follow-up heads use cap+1 detection and never present a truncated set as complete. Exact active-link loaders page to completion and are checked against `countActiveExternalLinks` when a complete population is required. |
| **Phone** | Display-only NANP formatter. No historical DB rewrite. Forms still submit stored values. |
| **Safety bounds** | Job load cap 20,000; in-memory account population cap 5,000; note/follow-up head cap 20,000. Overflow → unavailable/`—` or staff-safe 422, never silent undercount. |
| **Out of scope** | Schema migration, N+1 per-row Notes/Follow-up/Moraware, raw QB/Moraware payloads in the list JSON, identity/reconciliation changes. |
| **Impacted** | Account Directory list API + landing UI, `accountDirectoryListIntelligence`, Moraware job-window helpers, this doc, SYSTEM_BLUEPRINT. |

### 332. Account Directory landing-page list is page-scoped; hero Win Rate is Internal Estimate WON/(WON+LOST) (2026-08-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-18 |
| **Decision** | Default Account Directory list reads (name / status / updated) filter and sort the base account population, paginate, and return cheap row fields immediately. Visible-page intelligence (exact QB/Moraware links, A/R, YTD activity, follow-up summary, note counts, last activity) loads in a second batched request. Whole-organization job/note/follow-up/A/R intelligence is not required to render page 1. Derived sorts still rank the full filtered population before pagination and keep cap+1 fail-closed behavior. |
| **Hero** | Removed. `GET /summary` remains for other callers but is not requested from Account Directory mount. Cheap directory-health counts (Total / Active / Prospects / Needs Review) come from the base list response. |
| **YTD Estimate Win Rate** | Same Internal Estimate authority as Account Directory Insights: sold/won ÷ (sold/won + lost). Current calendar year through today. Canonical identity is `quote_family_root_id` else quote `id`; current revisions only. OPEN/undecided statuses are excluded from the denominator. Studio/Digital Estimate/Quote Flow/Moraware/QuickBooks are not used to infer wins or losses. Missing lost coverage or overflow → unavailable `—`, never quote-to-order substitution. Not a company-wide close rate across all estimate channels. |
| **Cache** | Optional org-scoped 45s TTL for expensive read-only summary job and win-rate bundles. Keys include `organization_id`. No cross-org reuse. |
| **Out of scope** | Identity, reconciliation, Final Review Queue, Notes/Follow-up mutations, financial math authority, RBAC, QuickBooks/Moraware writes, schema migration. |
| **Impacted** | Account Directory `listAccounts` / `getSummary`, landing UI table columns (Email restored), this doc, SYSTEM_BLUEPRINT. |

### 333. Account Directory landing page is a two-stage directory; A/R sort ranks the full filtered set (2026-08-18)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-18 |
| **Decision** | Opening Account Directory must render the customer table from a fast base `/accounts` read. Hero KPI cards (YTD Jobs, YTD Sq Ft, Customers with YTD Activity, YTD Estimate Win Rate) are removed and are not replaced. The landing page does not call `/summary` on mount. After base rows render, `GET/POST /accounts/list-intelligence` hydrates only the visible page UUIDs (exact QB/Moraware links, A/R, YTD, follow-ups, note counts, last activity). No N+1. |
| **A/R sort** | `ar_desc` / `ar_asc` are derived sorts: load the full filtered account population, resolve exact governed QuickBooks roots, attach `financialIntel.openAr` **before** sorting, then paginate. Unavailable/null is last in both directions. `$0` is a real linked snapshot and ranks above unavailable. Governed open A/R sums **positive** invoice balances only; credits are not converted to list zeros and do not appear as negative `openAr` on the directory. Default Name/Status browsing does not load full-population A/R. |
| **YTD helper** | Page YTD still reads typed job fields plus `raw_payload` solely to extract Job Worksheet Sq.Ft. Raw payload never leaves list/page-intelligence JSON. |
| **Out of scope** | Identity, reconciliation, Final Review Queue, Account 360, Notes/Follow-up mutations, financial math authority, RBAC, QuickBooks/Moraware writes, schema migration. |
| **Impacted** | Account Directory `listAccounts` / `listAccountPageIntelligence`, landing UI, `accountDirectoryListIntelligence`, this doc, SYSTEM_BLUEPRINT. |

### 334. Sales Ops Head: personalized plans + Monday two-way account operations (2026-08-27)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-27 |
| **Decision** | Ship a new protected head **`sales_ops`** (`app-sales-ops/`) for salesperson operating plans. It is **not** the existing Sales dashboard (`sales` / `https://sales.eliteosfab.com`). Production hostname is **`https://sales-ops.eliteosfab.com`** via **`HEAD_URL_SALES_OPS`**. The standalone Thera performance dashboard is a visual/product reference only; identity, ramp, scorecards, and accounts are generalized and Brain-authored. |
| **Sources of truth** | **Sales plan / ramp / KPI targets / scorecards / intelligence** = eliteOS. **Account assignment and CRM operational fields** = Monday Account Master List. **Historical production** = governed operational evidence, never ownership. **Authorization** = eliteOS Brain (`requireAuth` + `requireHeadAccess("sales_ops")` + server-side owner/manager checks). Normal reps see only themselves and currently assigned accounts. Broader visibility requires explicit manager assignments (`sales_ops_manager_assignments`) or org admin/executive roles. |
| **Isolation** | Rep APIs are `/api/sales-ops/me*`. Authenticated user identity is taken from the session, never from browser-supplied user/plan/org/Monday IDs. Guessing another UUID returns a safe 404 and does not leak existence. Cross-org rows are not visible. Inactive users and users without `sales_ops` head access are blocked. |
| **Monday** | All Monday I/O is Brain-only. Board ID and column IDs live in org-scoped `sales_ops_monday_config` (Elite seed board `18397092941` is tenant config, not a SaaS-global constant). Column IDs are resolved by inspecting the live board and matching titles; they are not hardcoded in the frontend. Writes use semantic fields only. Webhook: `POST /api/integrations/monday/sales-ops/webhook` (challenge echo + optional JWT verify with `MONDAY_APP_SIGNING_SECRET`). Fetch-after-webhook; idempotent event IDs; eliteOS-originated mutations update the mirror and do not write back. |
| **Realtime** | This repo does not currently use Supabase Realtime. Sales Ops uses authenticated 20s polling / invalidation after mutations and documents that limitation. |
| **Commission** | Per-plan `commission_enabled`. No shared ledger. Other reps’ commission is never returned. Thera’s historical commission files are reference only and are not production authority. |
| **Schema** | Additive `backend-core/supabase/eliteos_sales_ops_v1.sql`. Manual apply. RLS SELECT is ownership/manager/admin scoped; mutations via service_role Brain. Production persistence: `SALES_OPS_STORE=supabase` (hosted Vercel defaults to supabase when the env is unset). Local Brain defaults to the in-memory store until SQL is applied. |
| **Out of scope** | Auto-creating Monday boards/columns, Moraware/QuickBooks writeback, using static JSON as ongoing account authority, localStorage scorecards, rewriting quote/pricing heads. |
| **Impacted** | `app-sales-ops/`, `backend-core/src/salesOps/`, governance catalog, this doc, SYSTEM_BLUEPRINT, eliteOS-master-head-map, `docs/eliteos/monday-sales-ops.md`. |

### 335. Sales Ops Plan Lifecycle and Versioning (2026-08-27)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-27 |
| **Decision** | Sales plans are **eliteOS-owned**. Admins and assigned managers author **drafts**. **Publication is governed**: managers may create/edit/submit/preview drafts for **explicit direct reports** (`sales_ops_manager_assignments`). **Only `admin` / `executive` / `super_admin` may approve or publish** in v1. Clients cannot PATCH `status`; lifecycle transitions are Brain-authoritative semantic actions (`submit-review`, `approve`, `publish`, `revise`, `archive`). |
| **Versioning** | Each plan has `plan_family_id` + `version_number`. Statuses: `draft`, `in_review`, `approved`, `active`, `superseded`, `archived`. Published/effective versions are **immutable**. Material changes require **Create Revision**, which clones into a new draft with an incremented version. Historical scorecards keep `plan_id` plus a `target_snapshot` so later revisions cannot silently rewrite prior-period targets. |
| **Rep visibility** | `/api/sales-ops/me/plan` returns only the currently **effective** published/active plan. Future-dated `approved` plans may appear as **Upcoming Plan** and must not replace today’s active plan. Reps may read their own historical published versions and acknowledge their own published plan. Acknowledgment does **not** grant edit/approve rights and does **not** block effectiveness. Drafts are not a salesperson’s active plan. |
| **Templates** | Reusable `sales_ops_plan_templates` (plus period/metric/copy tables) clone into an independent draft. Later template edits do not rewrite existing plans. |
| **Prototype** | `prototype_cedar_valley_sales_plan_2026_2028` is **reference/template material only**. It is not an approved Thera/Cedar Valley production plan, is not auto-activated, and is not assigned to a real user by the SQL migration (no salesperson UUID seed). |
| **Monday** | Monday remains **account assignment / CRM operations** authority. Plan lifecycle is **not** pushed to Monday. |
| **Preview** | Admin/manager “Preview as salesperson” renders the plan DTO only. It does not impersonate the user, switch auth, or call rep account/commission APIs under another identity. |
| **Schema** | `eliteos_sales_ops_v1.sql` is applied in production. Further Sales Ops schema is additive (`eliteos_sales_ops_monday_full_mirror_v2.sql`). |
| **Out of scope** | Manager publish/approve (unless a later permission is added), generalized commission economics, pushing plans to Monday, blocking effectiveness on missing acknowledgment. |
| **Impacted** | `app-sales-ops/` Plan Admin, `backend-core/src/salesOps/`, `eliteos_sales_ops_v1.sql`, this doc, SYSTEM_BLUEPRINT, eliteOS-master-head-map, CURRENT_SYSTEM_MAP, `monday-sales-ops.md`. |

### 336. Sales Ops Monday Full-Fidelity Mirror (2026-08-27)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-27 |
| **Decision** | Monday Account Master List is the **CRM source**, not canonical eliteOS account identity. Canonical identity remains **`account_directory_accounts.id`**. Sales Ops keeps a **Layer A** full-fidelity Monday mirror (items, all column values/EAV, subitems, updates/replies, asset metadata, docs metadata, users/teams, groups) plus a **Layer B** operational projection on `sales_ops_accounts`. Future Monday columns persist in `sales_ops_monday_column_values` by `column_id` with **no new DDL**. The browser never receives `source_snapshot`, `raw_columns`, tokens, or private asset URLs. Heavy resources are account-scoped and lazy. Writes remain **disabled** (`write_enabled=false`) until separately approved; reads can run independently (`read_enabled`). Full reconcile is the safety net; incremental sync is idempotent (event ID + fetch-after-event + stale `updated_at` guard). **No time-based echo suppression.** Permanent Account Directory linkage is **exact** only: `account_directory_external_links` with `external_system = 'monday'` and `external_id = '{boardId}:{itemId}'`. Unlinked Monday accounts may still exist in the Sales Ops projection. Elite tenant config (not SaaS-global): parent board `18397092941`, subitem board `18397319923`. Ownership maps by **Monday person ID**, never display name. |
| **Why** | Selected-column projection dropped unknown columns, people arrays, subitems, replies, files, and docs. Unbounded `select *` plus DTO spreading could leak `raw_columns` to the browser. |
| **Schema** | Additive `backend-core/supabase/eliteos_sales_ops_monday_full_mirror_v2.sql` **applied** to production `wbxbzhxsdlkpqsviyzkt`. Follow-up `eliteos_sales_ops_monday_column_value_null_v2_1.sql` allows SQL NULL for empty Monday columns (PostgREST JSON null). Do **not** rewrite applied `eliteos_sales_ops_v1.sql`. |
| **Out of scope** | Enabling writes, seeding eliteOS UUID mappings, fuzzy AD linking, public asset proxy, inbound Monday webhook until `MONDAY_APP_SIGNING_SECRET` exists. |
| **Impacted** | `backend-core/src/salesOps/`, `backend-core/supabase/eliteos_sales_ops_monday_full_mirror_v2.sql`, `app-sales-ops/`, this doc, SYSTEM_BLUEPRINT, CURRENT_SYSTEM_MAP, eliteOS-master-head-map, `monday-sales-ops.md`. |

### 337. Sales Ops reconcile batching, observability, and exact person mapping (2026-08-27)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-27 |
| **Decision** | Full Monday census and Layer B reprojection must scale by **page/batch**, not per account. Organization Monday-person mappings load once per run. EAV is read in bounded `monday_item_id` IN-lists. Projection upserts use chunked `sales_ops_accounts` writes. Monday updates/docs/users are fetched in bounded ID batches. Schema/users/groups are cached for the run. Rate-limit/complexity responses back off explicitly. Durable progress lives in existing `sales_ops_monday_sync_state.metadata` (no parallel sync architecture). Operators poll admin status; activity is `ACTIVE` / `RATE_LIMITED` / `STALLED` / `FAILED` / `COMPLETE`. Person mapping is **exact unique email only** (Monday user email == one active eliteOS `user_profiles.email` in the same org). Ambiguous/unmatched stay fail-closed. Applying mappings reprojects Layer B only — it does not re-census Monday. Writes remain disabled. |
| **Why** | First production census (~836 parents) was dominated by per-item Monday update fetches and per-account Supabase round-trips (`getRepMapping`, EAV list, upsert). Operators had no pollable progress. Ownership could not be used until exact mappings existed. |
| **Schema** | No new DDL. v2 remains immutable history; v2.1 null-value follow-up already applied. Mapping rows use existing `sales_ops_monday_rep_mappings`. |
| **Out of scope** | Monday writes, fuzzy identity, Cloudflare DNS provider changes, inbound webhook without `MONDAY_APP_SIGNING_SECRET`. |
| **Impacted** | `backend-core/src/salesOps/`, this doc, `monday-sales-ops.md`, SYSTEM_BLUEPRINT. |

### 338. Sales Ops production hostname CNAME (2026-08-28)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-28 |
| **Decision** | Production Sales Ops is **`https://sales-ops.eliteosfab.com`** on Vercel project **`eliteos-sales-ops`** (`prj_wbu6ZajgzDgl43lkScrWIPRl68pA`). The authoritative DNS record is the **project-specific CNAME** Vercel rank-1 target **`c0bfc63fa49f166c.vercel-dns-016.com`**, Cloudflare **DNS-only**. Do **not** use apex-style `A 76.76.21.21` for this subdomain (valid fallback only). Generic `cname.vercel-dns.com` is rank-2. Brain `HEAD_URL_SALES_OPS` is `https://sales-ops.eliteosfab.com`. Writes remain disabled. |
| **Why** | Working eliteOS subdomains use project-specific `*.vercel-dns-016.com` CNAMEs. The temporary A record verified the domain but was `configuredBy: A` / `ipStatus: optional-change`. After the CNAME swap, Vercel reports `configuredBy: CNAME`, `verified: true`, `misconfigured: false`. Let's Encrypt was issued for the hostname (HTTP-01). |
| **Schema** | None. |
| **Out of scope** | Cloudflare nameserver/provider moves, orange-cloud proxy, Monday writes, inbound webhook until `MONDAY_APP_SIGNING_SECRET` exists. |
| **Impacted** | This doc, `monday-sales-ops.md`, CURRENT_SYSTEM_MAP. |

### 339. Sales Ops Account 360 lazy-loads governed Monday children (2026-08-28)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-28 |
| **Decision** | Sales Ops Account 360 is the salesperson workspace for a **currently assigned** Monday-owned account. Opening an account loads governed **detail** first, then lazy-loads **updates**, **subitems**, **file metadata**, **Docs**, and **activity** from existing Brain routes. The account list remains the light paginated `/me/accounts` projection. File content stays unavailable (`asset_fetch_not_enabled`); the UI must not invent downloads or show private provider URLs. Docs DTO continues to omit `sourceUrl`. Deep links may use `#account=<projection UUID>`; unknown or cross-rep IDs are not-found. Brain authorization is authoritative (rep / manager-of-owner / org admin; cross-org denied). Monday writes remain disabled. |
| **Why** | Production already exposed the child APIs, but the head only fetched detail + updates, so Account 360 was incomplete. |
| **Schema** | None. |
| **Out of scope** | Monday writes, asset content proxy, inbound webhook without `MONDAY_APP_SIGNING_SECRET`, Account Directory 360 financials. |
| **Impacted** | `app-sales-ops/`, `backend-core/src/salesOps/` tests, `monday-sales-ops.md`, SYSTEM_BLUEPRINT, eliteOS-master-head-map, this doc. |

### 340. Sales Ops monthly goals + gated performance actuals (2026-08-28)

| Field | Value |
|-------|--------|
| **Date** | 2026-08-28 |
| **Decision** | Sales Performance v1 extends the **existing** Sales Ops plan lifecycle. Monthly square-foot goals are stored as explicit `sales_ops_plan_period_targets` rows (`period` = `YYYY-MM`, `installed_target`). Ramp generation is an admin write-time helper only. **Actual SF is not computed from Moraware until a governed qualifying event/date is approved.** Existing Sales dashboard date bases (`created_at_source` / install / completed) remain **rejected proxies** for this head. Attribution, when present, is immutable eliteOS fact rows (`sales_ops_sf_attribution_facts`); current Monday ownership cannot rewrite credited history. Permanent identity stays exact Account Directory links (`monday` `{boardId}:{itemId}`, `moraware` Account ID, `quickbooks_desktop` root ListID). Missing actuals are `null` with `ACTUAL_SF_DEFINITION_REQUIRED` (or other explicit statuses), never coerced to zero. Thera is not a hardcoded tenant; any salesperson can have independent monthly targets. Monday writes, webhooks, and fuzzy linking stay disabled. |
| **APIs** | `GET /api/sales-ops/me/performance`, `/months`, `/accounts`; `GET /api/sales-ops/team/performance` and `/team/:userId/performance`; `POST /api/sales-ops/admin/plans/:planId/generate-ramp`; `GET /api/sales-ops/admin/identity-audit`. Auth remains `requireAuth` + `requireHeadAccess("sales_ops")` with Brain scope. |
| **Schema** | Additive `backend-core/supabase/eliteos_sales_ops_performance_attribution_v3.sql`. Do not rewrite v1/v2/v2.1. |
| **Out of scope** | Publishing a production Thera plan, choosing fabricated/invoice/created dates as earned-sale credit, Monday/Moraware/QuickBooks writes, automatic fuzzy identity. |
| **Impacted** | `backend-core/src/salesOps/`, `app-sales-ops/`, `eliteos_sales_ops_performance_attribution_v3.sql`, this doc, SYSTEM_BLUEPRINT, `monday-sales-ops.md`. |


