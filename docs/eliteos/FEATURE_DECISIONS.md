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
| **Decision** | Studio estimates persist in **`studio_estimates`** (Supabase default; memory for tests only). Scope edits after approval **supersede** the approved row (preserving calculation/approval snapshot) and open a new active revision. **Wholesale Remnant = $50/SF** (calculator authority; product brief $45 rejected because it equals Group Promo wholesale and would shadow Remnant). **W edge** = wholesale **$15/LF** / direct **$25/LF** (quoteCalculator v2 upgraded edge — not a universal $15). Internal Estimate **2% material use tax** is applied **once** into `totals.wholesale` for `internal_quote` (contract test 714 = 700 × 1.02). |
| **Why** | Approved Studio estimates must survive Brain restarts before Digital Estimate publish. Pricing ambiguity must be explicit so future DE publication has a single authority. |
| **SQL** | Manual apply: `backend-core/supabase/eliteos_studio_estimates_v1.sql` (does not touch Digital Estimate tables). |
| **Impacted files/docs** | `backend-core/src/elite100EstimateStudio/*`, `quoteCalculator.js` (exported edge rates + Remnant comment), `pricingAuthority.contract.test.mjs`, `app-elite100-estimate-studio` Estimate Scope panel, this entry. |
| **Revisit trigger** | Finance formally sets Remnant wholesale ≠ $50; Pricing Admin wires Remnant/edge catalog into `calculateQuote`; Digital Estimate publish consumes approved Studio estimate snapshots. |

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

