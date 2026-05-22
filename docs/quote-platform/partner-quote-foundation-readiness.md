# Partner Quote Foundation — Readiness Matrix (v1)

**Date:** 2026-05-19 (readiness); **v1 backend:** 2026-05-19  
**Scope:** Readiness matrix + **v1 backend foundation** (no `app-partner-quote` UI, no external partner login rollout).  
**Product model:** **Organization** = fabricator tenant (e.g. Elite Stone Fabrication). **Partner account** = dealer/builder/contractor under that org (e.g. Skogman as **seed data only**). Partner users are **not** separate organizations.

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Organization / tenant | **Partial** | `organizations` + nullable `organization_id`; partner routes use **strict** `organization_id` (no null-org leakage) |
| Head access (`partner_quote`) | **Ready** | Slug, launcher, `requireHeadAccess`, dealer-safe clamp |
| Partner account data (`quote_partner_accounts`) | **Partial → v1** | SQL adds `account_slug`, `display_name`, `status`, optional `dealer_account_id` bridge |
| Partner user ↔ account binding | **v1 backend** | `quote_partner_user_access` + `resolvePartnerContext` (apply SQL + seed rows) |
| Pricing structures & assignment | **Partial** | Assignments + partial unique index for one active row per partner |
| Partner branding | **v1 backend** | `quote_partner_branding_settings` + context API |
| `quote_source = partner_quote` | **v1 backend** | Dedicated routes; persist `partner_account_id`, `created_by_user_id` |
| Partner-safe API responses | **v1 backend** | `sanitizePartnerCalculateResponse`; no wholesale/profit in payloads |
| Security / RLS | **Not ready** | App-layer scoping + `dealer_partner` blocked from internal/generic quote APIs; **no RLS** yet |
| **Start `app-partner-quote` v1** | **Ready to scaffold** | After SQL applied + pilot `quote_partner_user_access` rows; **not** production external login until leakage tests + RLS |

---

## 1. Organization / tenant foundation

### Exists

- **`organizations`** — `backend-core/supabase/eos_saas_foundation.sql` (seed `elite_stone_fabrication`).
- **Nullable `organization_id`** on: `quote_headers`, `quote_pricing_structures`, `quote_pricing_rules`, `quote_partner_accounts`, `quote_partner_pricing_assignments`, `quote_source_configs`, `user_profiles`, `user_head_access`, child quote tables.
- **`organizationContext.js`** — `resolveOrganizationContext`, `mergeRowOrganizationId`, `organizationScopeOrFilter` (org **or null** during migration).
- **Org-level branding stub:** `organization_public_quote_settings` (logo, colors — for **public** consumer, not partner portal).

### Gaps

- No **NOT NULL** enforcement on `organization_id` for tenant-owned rows.
- No **RLS** on quote or partner tables.
- Authenticated context still **defaults to Elite** when profile org is unset.
- No **organization switcher** for multi-fabricator operators.

---

## 2. Head access / permissions

### Exists

- **`partner_quote`** in `EOS_HEAD_SLUGS` / `eosGovernanceConstants.js`.
- Launcher row: `backend-core/src/me/launcherHeads.js` (`/partner-quote`, dealer defaults include `partner_quote`).
- **`requireHeadAccess("partner_quote")`** pattern used on other heads; ready to wrap partner routes.
- **`user_head_access`** + System Admin assignment UI.
- **`user_kind = dealer_partner`** clamps launcher to dealer-safe heads (`partner_quote`, `dealer_resources`, `quote`).
- Deploy URL: `HEAD_URL_PARTNER_QUOTE` in `headDeploymentUrls.js`.

### Gaps

- **`app-partner-quote/`** does not exist (no Vite head yet).
- No partner-specific API module; `POST /api/partner-quote/submit` returns **501** (`quoteRoutes.js`).

---

## 3. Partner account model

### Exists — quote platform (`quote_partner_accounts`)

| Column / concept | Present |
|------------------|---------|
| `account_name`, `account_type` | Yes |
| `is_active` | Yes |
| `monday_account_id`, `moraware_account_id` | Yes |
| `default_sales_rep`, `default_branch` | Yes |
| `metadata` jsonb | Yes (extensible) |
| `organization_id` | Yes (additive migration) |

**Pricing Admin:** `GET/POST/PATCH /api/admin/quote-partners`, assignment POST (`quotePricingAdminApi.js`).

### Exists — legacy user management (`dealer_accounts`)

| Table | Purpose |
|-------|---------|
| `dealer_accounts` | Named dealer for System Admin user management |
| `pricing_groups` | Legacy pricing group codes |
| `user_account_access` | Links `user_id` → `dealer_account_id`, flags (`can_view_all_dealer_quotes`, etc.) |

### Critical gap — two parallel models

There is **no FK or sync** between `dealer_accounts` and `quote_partner_accounts`. System Admin dealer access and quote pricing assignment use **different tables**. For Skogman v1 you must either:

1. **Converge** on `quote_partner_accounts` as source of truth and add `quote_partner_user_access`, or  
2. **Bridge** with `quote_partner_accounts.metadata.dealer_account_id` (interim, document mapping).

**Missing on `quote_partner_accounts` for v1 UX:**

- `account_slug` (stable URL key)
- `display_name` (customer-facing label distinct from legal name)
- Dedicated branding columns (logo, theme) — today only `metadata` or new table

---

## 4. Partner user access model

### Can support today (with glue code)

| Capability | Mechanism |
|------------|-----------|
| User belongs to organization | `user_profiles.organization_id` |
| User is dealer/partner kind | `user_profiles.user_kind = dealer_partner` |
| User has head access | `user_head_access` includes `partner_quote` |
| User tied to a dealer row | `user_account_access` → `dealer_accounts` |

### Cannot support yet (without new schema)

| Capability | Blocker |
|------------|---------|
| Partner user sees only their partner's quotes | No `quote_partner_account_id` on `user_account_access`; quotes use `quote_headers.partner_account_id` |
| Resolve pricing from logged-in partner | API must map user → `quote_partner_accounts.id` |
| Partner admin manages users for one account | No scoped admin API |
| Internal impersonation with audit | No `acting_partner_account_id` on session/context |

**Recommended:** `quote_partner_user_access` (`user_id`, `partner_account_id`, `organization_id`, `role`, `is_active`, flags).

---

## 5. Pricing structures

### Legacy catalog path (used by `quoteCalculator.resolvePricingStructure`)

- `quote_pricing_structures` — modes: `public_retail`, `partner`, `dealer`, `builder`, etc.
- `quote_pricing_rules` — line-level rules per structure
- `quote_partner_pricing_assignments` — partner → structure, `starts_at` / `ends_at` / `is_active`
- Calculator resolves assignment when `partnerAccountId` is passed (`quoteCalculator.js`)

### Pricing Admin path (parallel, converging)

- `quote_price_groups` + `quote_price_group_rates` — includes `partner_tier_1|2|3` rate types
- `quote_pricing_policy_rules`, `quote_addon_catalog`
- `pricingConfigResolver.js` — used heavily for **internal** Direct/Wholesale; partner tier cutover not complete in calculator

### Org scoping

- Structures, rules, partners, assignments: **org-scoped in admin APIs** when `organization_id` column exists.

### Gaps

- No single admin UI rule: “Skogman uses Builder Standard 2026” without using **structure code** or assignment row.
- **Effective dating** on assignments exists (`starts_at`/`ends_at`) but no partial unique index enforcing one active assignment per partner.
- **Audit** on assignment changes: `assigned_by` only; no history table.
- Partner quote UI must not expose **wholesale/direct** labels from internal calculator paths.

---

## 6. Partner pricing assignment (business scenarios)

| Scenario | Supported? | How |
|----------|------------|-----|
| Skogman → Skogman-specific structure | Yes | One active row in `quote_partner_pricing_assignments` |
| Many accounts → shared “Builder Standard 2026” | Yes | Same `pricing_structure_id` on multiple partners |
| One account override | Yes | Different assignment per `partner_account_id` |
| Snapshot on quote | Partial | `quote_headers.pricing_structure_id` + `calculation_snapshot`; ensure partner-safe fields only in API responses |

**No hardcoded Skogman** — create partner row + assignment in Pricing Admin / SQL seed.

---

## 7. Partner branding

| Need | Status |
|------|--------|
| Partner logo | **Gap** — use `metadata.logo_url` interim or new table |
| Display name | **Partial** — `account_name` only |
| Primary color / theme | **Gap** |
| Footer / terms override | **Gap** |
| Org + partner scoping | Org table exists for **public** settings only |

**Recommended table:** `quote_partner_branding_settings` (`organization_id`, `partner_account_id`, `logo_url`, `primary_color`, `accent_color`, `quote_footer_html`, `is_active`).

---

## 8. Partner quote source & snapshots

### Exists

- `quote_source_configs` row for **`partner_quote`** (`eos_quote_public_internal_partner_foundation.sql`).
- `quote_headers`: `quote_source`, `partner_account_id`, `pricing_structure_id`, `calculation_snapshot`, `created_by` (text).
- `quote_submission_payloads` for audit payloads.
- `persistQuoteSubmission` / `calculateQuote` accept `partnerAccountId` / `partner_account_id`.
- Shared calculator and snapshot pipeline (same as internal/public with different source + structure resolution).

### Gaps

- No **`created_by_user_id`** uuid on header (email/text only).
- Snapshot may still contain internal-only fields unless **partner response sanitizer** is added (mirror `sanitizePublicCalculateResponse`).
- Legacy sources `partner_portal` still accepted in calculator — normalize to `partner_quote` in v1 API.

---

## 9. Route / API readiness (proposed v1)

| Route | Status | Notes |
|-------|--------|-------|
| `GET /api/partner-quote/context` | **Not implemented** | Should return org, partner account, branding, assigned structure summary, allowed heads |
| `POST /api/partner-quote/calculate` | **Not implemented** | Wrap `calculateQuote` + **partner-safe** response filter |
| `POST /api/partner-quote/submit` | **501 scaffold** | Use `POST /api/quote/submit` with `quote_source: partner_quote` until dedicated route |
| `GET /api/partner-quote/my-quotes` | **Not implemented** | Filter `quote_headers` by `partner_account_id` + `organization_id` + user access |

**Interim:** Internal staff can test via generic submit with `partner_account_id` + Pricing Admin assignment; not partner-login-safe.

---

## 10. Security / RLS readiness

| Risk | Severity | Mitigation today | Target |
|------|----------|------------------|--------|
| Partner A reads Partner B quotes | **High** | None at DB | RLS + API filter on `partner_account_id` |
| Partner reads internal estimates | **High** | Head clamp hides UI; APIs must enforce | `requireHeadAccess` + deny `internal_quote` list routes |
| Partner sees wholesale/direct economics | **High** | Calculator returns full snapshot unless stripped | Partner-safe DTO + snapshot partition in `internal_ui` |
| Frontend-only filtering | **High** | N/A | Backend enforcement on every route |
| Missing `organization_id` on reads | **Medium** | `organizationScopeOrFilter` includes null rows | Strict org match after backfill |
| Service role in browser | **Critical** | Not used in heads | Keep secrets server-side |

**Do not enable external partner login** until `quote_partner_user_access` (or bridge) + partner routes enforce account scope.

---

## 11. Recommended SQL additions (additive only)

File suggestion: `backend-core/supabase/partner_quote_foundation_v1_additive.sql` (manual apply).

1. **`quote_partner_accounts`**
   - `account_slug text` (unique per `organization_id`)
   - `display_name text`
   - Optional: `external_ref text` (CRM id)

2. **`quote_partner_user_access`** (new)
   - `user_id` → `user_profiles`
   - `partner_account_id` → `quote_partner_accounts`
   - `organization_id` → `organizations`
   - `partner_role text` (`user` | `admin`)
   - `can_view_all_partner_quotes boolean`
   - `is_active boolean`
   - PK `(user_id, partner_account_id)`

3. **`quote_partner_branding_settings`** (new) — see §7

4. **`quote_headers`**
   - `created_by_user_id uuid` (nullable FK to auth.users or user_profiles)

5. **Partial unique index** (optional):
   - One active assignment per partner: `(partner_account_id) WHERE is_active AND ends_at IS NULL`

6. **Bridge migration (one-time):**
   - Document mapping `dealer_accounts` → `quote_partner_accounts` or add `quote_partner_accounts.dealer_account_id uuid` nullable FK.

---

## 12. Recommended backend auth pattern

```text
requireAuth()
  → requireHeadAccess("partner_quote")
  → resolveOrganizationContext()  // fabricator tenant
  → resolvePartnerContext(req)  // NEW: user → single partner_account_id (or 403)
  → all queries: .eq("organization_id", orgId)
                 .eq("partner_account_id", partnerId)
                 .eq("quote_source", "partner_quote")  // for partner lists
```

- **Internal admins** use existing internal/quote-library routes; optional `X-Acting-Partner-Account-Id` header with audit (later).
- **Never** return `quote_pricing_rules` wholesale rows to partner clients; return computed line items + partner labels only.

---

## 13. Recommended Pricing Admin additions (no behavior change required for scaffold)

- Partner list: show **current assignment** (already partially via `attachCurrentAssignmentsToPartners`).
- UI to assign structure with **effective dates** and deactivate prior row.
- Optional: link **Pricing Admin** `partner_tier_*` rates to a `quote_pricing_structures.code` for calculator convergence.
- Seed script pattern: org-scoped partner row + assignment (no Skogman-specific code).

---

## 14. Recommended `app-partner-quote` boundary

| Layer | Reuse |
|-------|--------|
| Calculator | `@quote-lib` / `backend-core` `calculateQuote` |
| Measurement UI | `@quote-ui/RoomScopeBuilder` (hide internal-only modes/copy) |
| Auth | Same Supabase session as Home (`shared/eliteos-supabase`) |
| API client | Same pattern as `app-internal-estimate` |
| Branding | CSS variables from `GET /api/partner-quote/context` |
| Print/PDF | Separate partner template; no internal math audit blocks |

**Do not bundle** with `app-quote` (public-only deployable).

---

## 15. Data model proposal (v1)

```text
organizations (fabricator tenant)
  └── quote_partner_accounts (Skogman, …)
        ├── quote_partner_user_access → user_profiles
        ├── quote_partner_branding_settings
        ├── quote_partner_pricing_assignments → quote_pricing_structures
        └── quote_headers (quote_source = partner_quote)
              ├── quote_line_items, quote_rooms, calculation_snapshot
              └── quote_submission_payloads
```

**Pricing:**

```text
quote_pricing_structures + quote_pricing_rules  (authoritative for partner calculator today)
quote_price_groups + quote_price_group_rates    (Pricing Admin; partner_tier_* for future convergence)
```

---

## 16. Readiness matrix (detail)

| Component | Ready | Partial | Missing |
|-----------|-------|---------|---------|
| `organizations` | ✓ | | |
| `organization_id` on quotes/partners | | ✓ | |
| RLS | | | ✓ |
| `partner_quote` head slug | ✓ | | |
| `quote_partner_accounts` | | ✓ | |
| `quote_partner_pricing_assignments` | | ✓ | |
| `quote_source_configs.partner_quote` | ✓ | | |
| `quoteCalculator` + partner assignment | | ✓ | |
| Partner-safe API responses | | ✓ (v1) | |
| Partner user ↔ account | | ✓ (v1 SQL + API) | |
| Partner branding | | ✓ (v1) | |
| Dedicated partner routes | | ✓ (v1) | |
| `app-partner-quote` | | | ✓ |
| `dealer_accounts` bridge | | | ✓ |

---

## 17. v1 backend landed (2026-05-19)

### SQL (manual apply)

Apply in order:

1. `backend-core/supabase/eos_quote_platform.sql` (if not already)
2. `backend-core/supabase/eos_saas_foundation.sql` (if not already)
3. **`backend-core/supabase/partner_quote_foundation_v1_additive.sql`**

Creates: `quote_partner_user_access`, `quote_partner_branding_settings`, columns on `quote_partner_accounts`, `quote_headers.created_by_user_id`, partial unique index on active pricing assignments.

### Backend

| Piece | Location |
|-------|----------|
| `resolvePartnerContext` | `backend-core/src/quotes/partnerContext.js` |
| Partner routes | `backend-core/src/quotes/partnerQuotesApi.js` |
| Sanitization | `backend-core/src/quotes/partnerQuoteSanitize.js` |
| Verification (no DB) | `node backend-core/src/scripts/verifyPartnerQuoteFoundation.mjs` |

**Routes:** `GET /api/partner-quote/context`, `POST /api/partner-quote/calculate`, `POST /api/partner-quote/submit`, `GET /api/partner-quote/my-quotes` — all require auth + `partner_quote` head + active `quote_partner_user_access`.

**Not ready for production external partners until:** SQL applied in target env, access rows seeded, integration/leakage tests against real DB, RLS milestone.

---

## References

- `docs/quote-platform/three-head-quote-architecture.md`
- `backend-core/supabase/partner_quote_foundation_v1_additive.sql`
- `docs/saas/saas-readiness-foundation-plan.md`
- `backend-core/supabase/eos_quote_platform.sql`
- `backend-core/supabase/eos_saas_foundation.sql`
- `backend-core/supabase/user_management_schema.sql`
- `docs/quote-platform/pricing-admin-head-plan.md`
