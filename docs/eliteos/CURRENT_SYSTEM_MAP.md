# eliteOS Current System Map

**Audience:** Chris and anyone who needs a **practical, current-state** picture of what exists today—not only future intent.

**Source material:** [`SYSTEM_BLUEPRINT.md`](./SYSTEM_BLUEPRINT.md), [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md), [`eliteOS-master-head-map.md`](./eliteOS-master-head-map.md), [`domain-routing-plan.md`](./domain-routing-plan.md), repo `app-*` and `backend-core` route mounts, `.cursor/rules/*.mdc` (architecture, security, quote-platform).

**Maintenance rule (this file):** Update after major deployment, domain, auth, quote workflow, pricing, or integration changes. **[`SYSTEM_BLUEPRINT.md`](./SYSTEM_BLUEPRINT.md)** remains the **intended architecture**; **this document** is the **live / as-built snapshot** and may call out drift or unknowns explicitly.

---

## 1. Executive summary

**eliteOS** is a **multi-head operating system** for stone fabrication (and adjacent workflows). Operators land on **eliteOS Home / Launcher** (`app-home`), sign in with **Supabase Auth**, and open **separate heads**—each head is its **own Vite + React app** and typically its **own subdomain and Vercel deployment**, not one giant single-page product.

**backend-core** is the shared **eliteOS Brain / API** (Express, deployed on Vercel). Heads call it with the **anon Supabase key** in the browser and pass the **user JWT** where required; sensitive operations use **server-side** Supabase and secrets (no service role or Monday token in browsers—see `.cursor/rules/security-audit.mdc`).

**Supabase** holds **Auth** and the **Postgres** data model (quotes, profiles, pricing config, sync metadata, etc.). **Row Level Security** posture varies by table; the Brain still applies **route-level** auth and head access.

**Vercel** hosts each head and the Brain API. **Cloudflare** fronts DNS (custom domains, apex redirect, SSL). **Monday.com** receives **public** quote workflow items from the Brain after a successful save (non-blocking); internal Monday routing uses **separate env vars** when configured.

**Pricing Admin** (`app-pricing-admin` + `/api/pricing-admin/*`) is a **real foundation**: SQL, UI, and APIs exist; **`pricingConfigResolver.js`** can read DB config but **`quoteCalculator.js`** remains the **authoritative fallback** until a deliberate **calculator cutover** with parity tests. Today, changing Pricing Admin mostly affects **future** quote math, not a guaranteed immediate change to every live calculation path.

---

## 2. Current domain map

**Convention:** No trailing slashes in origins or URLs used in CORS / Supabase redirect allowlists.

| Domain / URL | Role | Vercel project name (typical) | Repo root | Login? | Status |
|--------------|------|----------------------------------|-----------|--------|--------|
| `https://www.eliteosfab.com` | **eliteOS Home / Launcher** | Often aligned with folder name **`app-home`** on Vercel (exact UI label may differ—confirm in Vercel) | `app-home/` | **Yes** (Supabase) | **Working** (per blueprint) |
| `https://eliteosfab.com` | Redirect to `www` | (same as home or Cloudflare rule) | — | — | **Working** (301 to www—per routing plan) |
| `https://quote.eliteosfab.com` | **eliteOS Public Quote Head** | **`app-quote`** (blueprint also lists fallback **`https://eliteos-quote.vercel.app`**) | `app-quote/` | **No** (public wizard) | **Working / testing** (production use; smoke-test after changes) |
| `https://internal.eliteosfab.com` | **eliteOS Internal Estimate Head** | **`app-internal-estimate`** (TODO: confirm exact Vercel project slug in dashboard) | `app-internal-estimate/` | **Yes** | **Testing** (staff flows; save/list/open needs verification) |
| `https://estimate.eliteosfab.com` | Optional **alias** for Internal Estimate (same app as internal) | Same as internal head | `app-internal-estimate/` | **Yes** | **Planned / optional** (pick one primary CNAME per product preference) |
| `https://pricing.eliteosfab.com` | **eliteOS Pricing Admin Head** | **`app-pricing-admin`** (TODO: confirm exact Vercel slug) | `app-pricing-admin/` | **Yes** | **Working** (admin UI + gated APIs) |
| `https://system.eliteosfab.com` | **eliteOS System Admin Head** | **`app-system-admin`** (TODO: confirm exact Vercel slug) | `app-system-admin/` | **Yes** | **Working / testing** (user + head management; invite flow needs real-user confirmation) |
| `https://backend-core-six.vercel.app` | **eliteOS Brain / API** (current production API host in docs) | **`backend-core`** (TODO: confirm project name if renamed) | `backend-core/` | N/A (API) | **Working** |
| `https://api.eliteosfab.com` | Future hostname for Brain | Same `backend-core/` project | `backend-core/` | N/A | **Planned** (DNS + Vercel domain wiring per routing plan) |

**Unknown / TODO:** Exact **Vercel project display names** for every head (dashboard truth). Whether **`system.eliteosfab.com`** and all heads are already attached in Vercel vs only documented—confirm in Vercel **Domains** and Cloudflare **DNS**.

---

## 3. Head inventory

Repo **`app-*`** folders today: **`app-brain-health`**, **`app-executive`**, **`app-home`**, **`app-internal-estimate`**, **`app-pricing-admin`**, **`app-quote`**, **`app-sales`**, **`app-system-admin`**. (No other `app-*` roots at repository root.)

| Head name (eliteOS branding) | App folder | Purpose | Auth | Main backend routes (representative) | Deployed domain (documented) | Current status | Known gaps |
|------------------------------|------------|---------|------|----------------------------------------|-------------------------------|----------------|-------------|
| **eliteOS Home / Launcher** | `app-home/` | Sign-in, launcher cards from **`GET /api/me`** and **`GET /api/me/heads`**, deep links to other heads | **Yes** | `/api/me`, `/api/me/heads` | `https://www.eliteosfab.com` | **Working** | Per-origin sessions: opening another subdomain may require **sign-in again** (see §5). |
| **eliteOS Public Quote Head** | `app-quote/` | Homeowner-facing quote wizard; public calculate + submit | **No** | **`POST /api/public-quote/calculate`**, **`POST /api/public-quote/submit-measurements`** | `https://quote.eliteosfab.com` (+ `eliteos-quote.vercel.app` fallback) | **Working / testing** | Optional Monday columns need careful rollout; calculators not fully on Pricing Admin resolver. |
| **eliteOS Internal Estimate Head** | `app-internal-estimate/` | Staff quoting, quote library, Direct/Wholesale, internal Monday | **Yes** | **`/api/internal-quotes/*`**, internal calculate/save/list/patch/duplicate | `https://internal.eliteosfab.com` (or `estimate.*`) | **Testing** | Save/list/open/reopen and internal Monday board need verification; form hydration polish. |
| **eliteOS Pricing Admin Head** | `app-pricing-admin/` | Admin pricing config (groups, rates, add-ons, rules, audit) | **Yes** + head/role gates | **`/api/pricing-admin/*`** | `https://pricing.eliteosfab.com` | **Working** | Partner tiers, mappings, fixtures, branch-specific pricing largely scaffolded/planned. |
| **eliteOS System Admin Head** | `app-system-admin/` | **People & access** (roster, roles, head access, dealer/pricing assignments), **invites**, **user lifecycle** (resend invite, password reset, deactivate/reactivate, guarded delete), **audit snippets** per user, **diagnostics** (schema health, legacy quote pipeline / legacy pricing tools). Sales mapping + identity resolution remain embedded. | **Yes** (`admin` or `super_admin`) | **`/api/system-admin/*`** (alias **`/api/admin/*`** for same user routes), schema health, reference | `https://system.eliteosfab.com` (intended; confirm DNS) | **Working / testing** | Quote Library + Pricing Admin will absorb primary quote/pricing UX; confirm env **`VITE_HEAD_URL_PRICING_ADMIN`** for launcher-style links. |
| **eliteOS Sales Head** | `app-sales/` | Sales performance and intelligence UI | **Yes** | **`/api/sales/*`** (requires auth + `sales` head + allowed roles) | **Unknown** (TODO: production hostname in Vercel; not in blueprint §4 table) | **Working / testing** (depends on deploy) | Revenue brain fields may be partial until Quote Platform feeds more aggregates. |
| **eliteOS Executive Head** | `app-executive/` | Leadership dashboards (jobs, sqft, trends) | **Yes** | **`/api/executive/*`**, **`/api/titans/today`** | **Unknown** (TODO: confirm `HEAD_URL_EXECUTIVE` target) | **Working / testing** | Same as sales: data completeness tied to Moraware/brain ingestion. |
| **eliteOS Brain Health Head** | `app-brain-health/` | Sync health, runs, failed jobs, operator triggers | **Yes** | **`/api/brain/*`**, **`/api/admin/sync/*`** | **Unknown** (TODO: confirm `HEAD_URL_BRAIN_HEALTH`) | **Working / testing** | Long syncs may need worker/queue hardening (server comments mention timeouts). |

**Embedded in System Admin (same `app-system-admin` bundle):** Sales Account Mapping and Identity Resolution readiness (primary cross-head admin tools). **Quote Pipeline** and **legacy quote pricing** UIs are **Diagnostics / legacy** only—primary quote workflow moves to **Quote Library**; pricing configuration moves to **Pricing Admin** (`app-pricing-admin` + `/api/pricing-admin/*`). Backend **`/api/admin/quote-*`** and **`/api/quotes/pipeline`** routes remain for diagnostics and any other callers until explicitly retired.

---

## 4. Backend Brain/API map

**Role:** Single Express app (`backend-core/src/server.js`) exporting `app` for Vercel (`api/index.js`). Owns quote math, persistence, Monday sync, launcher payload, sales/executive aggregates, admin APIs, and cron-style internal sync triggers.

**Documented production URL:** `https://backend-core-six.vercel.app` (see [`SYSTEM_BLUEPRINT.md`](./SYSTEM_BLUEPRINT.md) §4).

### Route groups (high level)

| Group | Examples | Public? | Auth? | Head / role notes |
|-------|----------|---------|-------|-------------------|
| Health / debug | `GET /api/health`, `GET /api/debug/cors` | **Yes** | No | Operational. |
| Auth helpers | `GET /api/auth/roles` | **Yes** | No | Lists allowed application roles (read-only helper). |
| Session / launcher | `GET /api/me`, `GET /api/me/heads`, `POST /api/auth/log-login` | No | **Yes** (Bearer JWT) | `log-login` requires auth. `/api/me/heads` builds launcher cards from profile + `user_head_access` / defaults (see §5). |
| **Public quote** | **`POST /api/public-quote/calculate`**, **`POST /api/public-quote/submit-measurements`** | **Yes** | No | Returns public-safe calculate JSON; submit persists then **best-effort Monday**. |
| **Internal quotes** | **`POST /api/internal-quotes/calculate`**, **`/save`**, **`GET /api/internal-quotes`**, **`GET/PATCH /api/internal-quotes/:id`**, **`POST .../duplicate`** | No | **Yes** + **`requireHeadAccess("quote")`** (stack in `internalQuotesApi.js`) | Staff internal estimate head. |
| **Authenticated quote (legacy/general)** | `POST /api/quote/calculate`, `POST /api/quote/submit` | No | **Yes** | Used for broader quote sources; **`public_retail`** body on calculate is sanitized for public-safe responses. |
| **Scaffold** | `POST /api/internal-quote/submit`, `POST /api/partner-quote/submit` | No | **Yes** | Returns **501** with guidance to use `POST /api/quote/submit` until completed. |
| **Pricing Admin head** | **`/api/pricing-admin/*`** (status, config-preview, price-groups, rates, addons, rules, audit-log) | No | **Yes** + **`pricing_admin` head** + role gate (see `pricingAdminHeadApi.js`) | Long-term config surface. |
| **Legacy System Admin quote structures** | `/api/admin/quote-pricing-structures`, `quote-pricing-rules`, `quote-partners`, `quotes`, `quote-analytics`, etc. (mounted via `quotePricingAdminApi`) | No | **Yes** + admin-style gates | Distinct from `/api/pricing-admin/*` Pricing Admin head APIs. |
| **System / user admin** | **`/api/system-admin/*`** and **`/api/admin/*`** for **same** advanced user router: users, invite, profile, head-access, dealer-access, pricing-group, **`POST .../send-password-reset`**, **`POST .../resend-invite`**, **`PATCH .../deactivate`**, **`PATCH .../reactivate`**, **`DELETE .../:id`** (guarded), role, reference, schema-health | No | **Yes** + **`system_admin` head** + **`admin` or `super_admin`** role | Per `systemAdminUserManagement.js`. Service role **only** on the server. |
| **Sales head** | `/api/sales/summary`, `.../salesperson-performance`, `.../account-performance`, `.../trend`, `.../jobs`, `.../filters`, `.../performance-intelligence`, `.../debug` | No | **Yes** + `sales` head + roles in `SALES_API_ROLES` | See `salesHead.js`. |
| **Executive head** | `/api/executive/summary`, performance, production-flow, titan-signals, field-trends, monthly-trend, `GET /api/executive/debug` | No | **Yes** + `admin`/`executive` + executive head middleware | Read-oriented aggregates. |
| **Titans** | `GET /api/titans/today` | No | **Yes** + head access wrapper (see server) | Shop/production signal surface. |
| **Brain health** | `GET /api/brain/sync-runs`, `GET /api/brain/failed-jobs`, `GET /api/brain/sync-health`, `GET /api/brain/sync-plan`, `GET /api/brain/summary`, `GET /api/brain/jobs`, … | Mixed | **`sync-health`**: either public (if `EOS_ALLOW_PUBLIC_SYNC_HEALTH=1`) or **auth + brain_health head**; most others **auth + admin/executive + brain_health** | Operator visibility into Moraware ingestion. |
| **Admin-triggered sync** | `POST /api/admin/sync/recent`, `POST /api/admin/sync/retry-failed` | No | **Yes** + `admin`/`executive` | Spawns background node scripts. |
| **Cron / internal sync** | `POST /api/internal/sync/recent`, `.../nightly`, `.../nightly-operational`, `.../retry-failed` | **Shared secret** (not browser) | **`requireCronSecret`** | Intended for scheduled jobs, not interactive users. |
| **Quote pipeline** | `GET /api/quotes/pipeline`, `GET /api/quotes/pipeline/:id`, timeline, `PATCH .../status`, `PATCH .../assign`, sales-users, summary | No | **Yes** + head/role stack in `quotePipelineApi.js` | Used from System Admin quote pipeline UI among others. |

**Note:** Server startup logs list additional **`/api/admin/*`** quote and mapping routes; treat logs + source files as exhaustive when debugging.

---

## 5. Auth and access model

- **Supabase Auth** issues JWTs; heads store the session in **per-origin** browser storage.
- **`app-home`** is the **canonical entry**: after login it loads **`GET /api/me`** and **`GET /api/me/heads`** and renders allowed head cards with URLs from env / Brain (`headDeploymentUrls.js` + launcher logic).
- **Profiles:** `user_profiles` carries **`role`**, **`user_kind`**, **`is_active`**, optional **`organization_id`**, etc.
- **Head access:** `user_head_access` rows assign **`head_slug`** access. If **no rows**, launcher applies **role + user_kind defaults** (`launcherHeads.js`). **`admin`**, **`executive`**, and **`super_admin`** receive the **full catalog** in the launcher response (URLs still env-driven).
- **Inactive users** should see **no heads** in launcher logic (verify against `launcherHeads.js` when testing).
- **Dealer/partner users** are **clamped** to dealer-safe launcher slugs (same module).
- **Backend routes** always re-check **`requireAuth`**, **`requireRole`**, and **`requireHeadAccess`** as applicable—**UI visibility is not authorization** (`.cursor/rules/eliteos-architecture.mdc`, `.cursor/rules/security-audit.mdc`).
- **Current limitation:** Navigating from **`www.eliteosfab.com`** to **`quote.*`**, **`internal.*`**, etc., is a **new origin**—users often need to **sign in again** unless session is restored another way.
- **Future:** **eliteOS session handoff** / SSO-like flow between subdomains (not implemented as of this map).

**System Admin (today):** **`admin`** and **`super_admin`** can operate user management APIs. **Invites:** omitting **`heads` / `initial_heads`** avoids wiping launcher defaults on invite (Brain behavior documented in recent work). **`estimator`** exists in **application role constants** and an **additive SQL file** (`eliteos_estimator_role.sql`); **DB constraint** may still need **manual apply** in Supabase for the role to be selectable end-to-end.

---

## 6. Supabase database map

Scripts under `backend-core/supabase/` define install order and intent; **production** may differ if a migration was skipped. Use **“installed?”** as *schema present in the project* unless you verify in SQL.

### User / access

| Tables / objects | Installed? | Used in production now? | Source of truth vs foundation | Known gaps |
|-------------------|------------|-------------------------|--------------------------------|------------|
| **`user_profiles`** (+ role check) | **Yes** (expected) | **Yes** | **Source of truth** for app roles and profile fields | `organization_id` column may be missing on older DBs—code often retries without it. |
| **`user_head_access`** | **Yes** when `user_management_schema.sql` applied | **Yes** (testing+) | **Source of truth** for assigned heads | Confirm rows exist for non-admin testers. |
| **`organizations`** (and SaaS foundation) | **Partial** (`eos_saas_foundation.sql` and related) | **Growing** | **Foundation** for multi-tenant | Not every quote path may enforce org scope yet—verify per feature. |
| **`user_account_access`**, **`dealer_user_settings`**, dealer tables | Per `user_management_schema.sql` | **Yes** for dealer flows | **Source of truth** for partner access | System Admin UI depends on schema health checks. |
| **`eos_action_log`** (`auth_schema.sql`) | **Yes** (expected) | **Yes** | **Audit** trail | Coverage depends on callers using `logAction`. |

### Quote platform (shared)

| Tables | Installed? | Production? | Role | Gaps |
|--------|------------|-------------|------|------|
| **`quote_headers`**, **`quote_line_items`**, **`quote_rooms`**, **`quote_status_history`** | From `eos_quote_platform.sql` + extensions | **Yes** for public + internal | **System of record** for quotes | Internal flows need end-to-end verification. |
| **`calculation_snapshot`** (JSON on **`quote_headers`**, not a separate `quote_calculation_snapshots` table) | **Yes** | **Yes** | Immutable pricing inputs at save | Naming: docs sometimes say “snapshot”; DB column is `calculation_snapshot`. |
| **`quote_calculation_audit`** | **Yes** | **Yes** (when writes occur) | Audit rows on calculation | — |
| **`quote_submission_payloads`** | From `eos_quote_public_internal_partner_foundation.sql` | **Yes** when enabled | Raw/normalized submission bodies | Internal/support; may warn if missing in pipeline UI. |
| **`quote_forecast_events`** | **Yes** | **Varies** | Forecasting / pipeline analytics | Depends on writers. |
| **`quote_monday_sync_log`** | **Yes** | **Yes** for public | Monday diagnostics | Internal Monday uses separate board env. |
| **`quote_files`** | Schema present | **Unknown / partial** | Attachments / takeoff foundation | `eos_quote_takeoff_visual_foundation.sql` exists—confirm apply status. |

### Pricing Admin foundation (newer tables)

| Tables | Installed? | Production? | Role | Gaps |
|--------|------------|-------------|------|------|
| **`quote_price_groups`**, **`quote_price_group_rates`**, **`quote_pricing_policy_rules`**, **`quote_addon_catalog`**, **`quote_material_color_mappings`**, **`quote_pricing_audit_log`** | `eliteos_pricing_admin_foundation.sql` | **Yes** (per recent work: “applied and verified” in Pricing Admin context) | **Future source of truth** for admin-driven pricing | **`quoteCalculator.js`** not fully cut over; resolver is additive/fallback until parity + cutover decision. |

### Legacy admin quote config (older naming)

| Tables | Installed? | Role | Gaps |
|--------|------------|------|------|
| **`quote_pricing_structures`**, **`quote_pricing_rules`**, **`quote_partner_accounts`**, assignments | `eos_quote_platform.sql` + seeds | Legacy **System Admin** quote structure APIs + prototype seeds | Converge with Pricing Admin long-term (`FEATURE_DECISIONS.md` #10). |

### Sales / identity / Moraware

| Area | Tables / scripts | Installed? | Notes |
|------|------------------|-------------|-------|
| **Sales account mapping** | `sales_account_attribution.sql` + admin APIs | **Yes** when applied | Used from System Admin **Sales Account Mapping** UI. |
| **Identity resolution** | `eos_identity_resolution.sql` | **Yes** when applied | Readiness UI in System Admin. |
| **Moraware brain** | `operational_schema.sql`, `moraware_operational_expansion.sql`, job/brain views | **Yes** in active deployments | Feeds executive/sales/brain health; large surface—see audit scripts in root `package.json`. |

---

## 7. Quote platform current state

### Public Quote (`app-quote`)

- **No login.**
- **`POST /api/public-quote/calculate`** and submit use the **legacy aggregate area payload** (`countertopSqft` / `backsplashSqft`, `addOns`, `engine: "legacy"`) for **`estimates_by_group`** even when the UI used guided layout—**client collapses** measurements before API calls (`FEATURE_DECISIONS.md` #4, `.cursor/rules/quote-platform.mdc`).
- **Pricing:** **ESF Direct** material $/sf + **25%** public planning markup; **display** rounds tier totals **up to nearest $10**; **Monday Quote Amount** uses **Promo** tier aligned to **rounded** total (`FEATURE_DECISIONS.md` #1–#3).
- **UI:** One professional estimate card across material levels (multi-tier comparison).
- **Persistence + Monday:** Submit saves to Supabase first; Monday sync is **best-effort** and **incremental by column groups** so optional column failures do not delete items (`FEATURE_DECISIONS.md` #5, blueprint §9).
- **Monday columns known working (typical):** Quote Amount, City, State, Estimated Sq Ft, eliteOS ID (blueprint §9).
- **Gaps:** Optional columns need staged testing; **quote calculators do not yet read Pricing Admin resolver as primary**.

### Internal Estimate (`app-internal-estimate`)

- **Login required**; Brain routes on **`/api/internal-quotes/*`** require **`quote`** head access.
- **Product behavior (intended v1 testing):** manual SF default; guided shape secondary; rapid linear hidden; Direct/Wholesale internal modes; custom add-ons; add splash per piece; entered-by; sales reps (**Casey, Thera, MJ, House, Direct**); branches (**Dyersville, Lisbon, Iowa City**); quote library foundation; internal Monday routing foundation (`FEATURE_DECISIONS.md` #8–#9).
- **Gaps:** Verify **save / list / open / reopen**; verify **internal Monday** board + **`MONDAY_INTERNAL_*`** column mapping; improve **hydration** from saved quotes if needed; **user testing** before calling production-ready.

---

## 8. Pricing Admin current state

- **`app-pricing-admin`** is **deployed** (custom domain in blueprint) with **working** authenticated UI.
- **SQL foundation** (`eliteos_pricing_admin_foundation.sql`) defines **`quote_price_groups`**, rates, policy rules, add-on catalog, material/color mappings, audit log.
- **Editable today (via API/UI):** material group rates, add-on prices, **public markup rule** (among configured surfaces).
- **Scaffolded / planned:** partner tiers, color/material mapping workflows, fixtures, vanity program, branch/account-specific pricing.
- **Cutover rule:** **`quoteCalculator.js`** remains fallback until **`pricingConfigResolver.js`** parity is proven and a deliberate cutover is recorded (`FEATURE_DECISIONS.md` #10). **Existing quotes** keep their **`calculation_snapshot`**.
- **Documented discrepancy:** **Stock Blanco** unit price **495** (seed) vs **450** (calculator prototype constant)—documented in [`docs/quote-platform/pricing-seed-map.md`](../quote-platform/pricing-seed-map.md); **not silently aligned** until finance picks one.

---

## 9. System Admin current state

- **`app-system-admin`** deployed; operators use **`admin`** or **`super_admin`** for full user management.
- **User roster, detail, profile updates (without `is_active` toggle—use lifecycle endpoints), head access, dealer access, pricing group assignment, role changes, invites** via **`/api/system-admin/*`** (and **`/api/admin/*`** aliases).
- **Lifecycle APIs:** **`POST .../resend-invite`**, **`POST .../send-password-reset`** (returns **`use_resend_invite_instead`** when email is not confirmed), **`PATCH .../deactivate`** / **`reactivate`** (blocks self-deactivate and last **active** admin/super_admin on deactivate), **`DELETE .../:id`** with body **`{ "confirm": "DELETE" }`** or **`{ "confirm": "<user email>" }`** — blocked when the user has **quote** or **audit** history, is the last privileged admin, or is self.
- **UI sections:** People & access, Organizations (guidance), Invite users, Audit (guidance + per-user drawer slices), Diagnostics (schema + legacy quote pipeline + legacy pricing), plus Sales mapping and Identity resolution nav entries.
- **Invite:** **`heads` / `initial_heads`** only applied when explicitly sent—omission **does not** replace head access with an empty set (defaults remain until assigned).
- **Head labels:** UI uses **`head_catalog`** from **`GET .../reference`** for friendlier names (e.g. internal estimate alias for `quote`).
- **`estimator` role:** in **code** list + **SQL file** for DB check constraint—**may require manual SQL** in Supabase.
- **Invite emails:** **`backend-core`** passes **`redirectTo`** from **`SUPABASE_INVITE_REDIRECT_URL`** (default `https://www.eliteosfab.com/auth/callback`) so links are **not** tied to localhost `SITE_URL`. Invited users finish setup in **eliteOS Home** (`app-home` + `vercel.json` SPA rewrite for `/auth/callback`).
- **Password recovery:** same production **`/auth/callback`** pattern via **`EOS_ADMIN_PASSWORD_RECOVERY_REDIRECT_URL`** or invite redirect resolution (`FEATURE_DECISIONS.md` §12–13).
- **Manual invite test:** see **`docs/eliteos/domain-routing-plan.md` §3.1**.

---

## 10. Monday.com integration current state

**Public quotes**

- Board example documented (blueprint §9; see `docs/quote-platform/monday-public-quotes-setup.md`).
- **Item creation works** when env column IDs are valid.
- **Safe columns** populate when mapped.
- **Incremental / grouped column updates** protect the item if an optional column fails; diagnostics land in **`quote_monday_sync_log`**.

**Internal quotes**

- **Separate** internal board via **`MONDAY_INTERNAL_QUOTES_BOARD_ID`** and **`MONDAY_INTERNAL_COL_*`** (see `docs/quote-platform/monday-internal-quotes-setup.md`).
- **Status:** **Foundation exists**; **needs verification** against a real internal board.

**Principle**

- **System of record:** **Supabase / eliteOS quote tables** (especially **`quote_headers`** and snapshots).
- **Monday:** **Workflow visibility**—do not treat Monday as canonical financial or quote storage.

---

## 11. Domain / Vercel / Cloudflare current state

**Vercel:** Each head and `backend-core` is a **separate project** with monorepo **root directory** set to the matching folder (`domain-routing-plan.md` §1). **Exact project slugs** should match the Vercel dashboard (TODO if renamed).

**Cloudflare:** **CNAME** per hostname (`www`, `quote`, `quotes`, `internal` or `estimate`, `pricing`, `system`, future `api`) to the **Vercel-supplied target**; **apex** `eliteosfab.com` **301 → `https://www.eliteosfab.com`**.

**Brain CORS (`EOS_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS`):** comma-separated, **no trailing slashes**. Baseline production checklist (from routing plan + blueprint):

- `https://www.eliteosfab.com`
- `https://eliteosfab.com`
- `https://quote.eliteosfab.com`
- `https://quotes.eliteosfab.com`
- `https://internal.eliteosfab.com` and/or `https://estimate.eliteosfab.com`
- `https://pricing.eliteosfab.com`
- `https://system.eliteosfab.com`
- **`https://eliteos-quote.vercel.app`** (public quote fallback)
- **`https://eliteos-quotes.vercel.app`** (Quote Library Vercel preview fallback)
- **Each active `https://*.vercel.app`** preview origin used during staging

**Supabase Auth redirect URLs:** Site URL **`https://www.eliteosfab.com`**; redirect patterns include `www`, apex, internal/estimate, pricing, quote, **quotes**, and localhost ports per `domain-routing-plan.md` §3.

**Head URL env vars (Brain):** `HEAD_URL_PUBLIC_QUOTE`, `HEAD_URL_INTERNAL_ESTIMATE` (alias `HEAD_URL_QUOTE`), **`HEAD_URL_QUOTE_LIBRARY`**, `HEAD_URL_PRICING_ADMIN`, `HEAD_URL_EXECUTIVE`, `HEAD_URL_BRAIN_HEALTH`, `HEAD_URL_SYSTEM_ADMIN`, `HEAD_URL_SALES` (`headDeploymentUrls.js`).

---

## 12. Known gaps / cleanup backlog

### Priority 1 — stabilize testing

- Confirm **System Admin invite** with a real inbox and first login.
- Confirm **non-admin** sees **only assigned heads** (launcher + route denials).
- Confirm **Internal Estimate** save / list / open / reopen.
- Confirm **internal Monday** routing + columns.
- Confirm **public quote** after domain/CORS changes (calculate + submit + Supabase + Monday).

### Priority 2 — polish head experience

- **Session handoff** across subdomains.
- Internal Estimate UI polish for a **2–4 week** test window.
- Quote Library **deep filters**, **partner-scoped accounts**, and **Internal Estimate quoteId hydration**.
- Pricing Admin UI depth + **audit** readability.

### Priority 3 — architecture cutovers

- Move **`quoteCalculator.js`** to **Pricing Admin resolver** first with **parity tests**, then cut over.
- Move hardcoded **reps/branches** to admin/config tables.
- Move hardcoded **add-ons / mappings** into Pricing Admin data.
- Configure **`api.eliteosfab.com`** for Brain.
- Build **Moraware Admin / Integration Mapping Head** (blueprint prerequisite for SaaS Moraware).

### Priority 4 — future modules

- Partner Quote Head, AI Takeoff, Moraware sold-job handoff, QuickBooks sold-job workflow, dealer/partner portals (see master head map).

---

## 13. Recommended next actions

1. **Commit/push** any pending launcher, System Admin, domain, or CORS work (if not already on `main`).
2. **Smoke test** every **live** head URL from §2 (home, quote, internal, pricing, system, Brain health URL if known).
3. **Invite one test `estimator`** (after DB role constraint applied if needed) and assign **`quote`** + any other heads.
4. **Internal Estimate:** run save/list/open/reopen against production Supabase.
5. **Configure internal Monday** board + **`MONDAY_INTERNAL_*`** column IDs in Vercel env for `backend-core`.
6. **Update docs** (`SYSTEM_BLUEPRINT`, `FEATURE_DECISIONS`, or this map) with findings from steps 2–5.
7. **Only then** start deeper Internal Estimate UI cleanup.

---

## 14. Maintenance rule (this document)

Update **`CURRENT_SYSTEM_MAP.md`** after **major deployment**, **domain**, **auth**, **quote workflow**, **pricing**, or **integration** changes.

**[`SYSTEM_BLUEPRINT.md`](./SYSTEM_BLUEPRINT.md)** remains the **intended architecture** and deep logic reference; **this file** is the **as-deployed / as-understood-now** snapshot and should name **uncertainties** explicitly until verified.

---

## Deliverable checklist

| Item | Status |
|------|--------|
| File created | **`docs/eliteos/CURRENT_SYSTEM_MAP.md`** (this file) |
| Uncertain facts flagged | **Vercel project display names** for some heads; **exact production URLs** for sales/executive/brain-health if not set in env; **DNS live** status for every custom domain; **`estimate.*` vs `internal.*`** as primary hostname; **DB migration apply** state per Supabase project |
| Recommended immediate next step | **§13 step 2** — smoke test all live heads + Brain against current env |
