# Quote Platform — SaaS readiness notes

This document complements `docs/saas/saas-readiness-foundation-plan.md` with Elite-specific context and how it maps to tenant-ready tables.

---

## 1. Current Elite-specific pieces

| Area | Today (Elite) | Notes |
|------|----------------|-------|
| Monday boards | `MONDAY_PUBLIC_QUOTES_BOARD_ID`, `MONDAY_INTERNAL_QUOTES_BOARD_ID`, `MONDAY_PARTNER_QUOTES_BOARD_ID`, `MONDAY_QUOTES_BOARD_ID`, `MONDAY_API_TOKEN` | Token stays in env; SQL seeds only **env key names** in `organization_integration_configs`. |
| Public quote branding | Mostly app-level / Elite marketing | Future: `organization_public_quote_settings` (slug, colors, logo, disclaimer, measurement methods). |
| Material groups / pricing | Supabase `quote_pricing_*` seeded for Elite | Becomes per-`organization_id` as columns are applied and admin UI scopes lists. |
| Territories | `quote_sales_territories` | Assignment prefers rows with matching `organization_id`, with `NULL` org rows still considered during migration. |
| Users | `user_profiles`, `user_head_access` | Optional `organization_id` links profiles to an org for authenticated org resolution. |

---

## 2. How each becomes tenant-configurable

| Elite today | Tenant direction |
|-------------|------------------|
| Monday env board IDs | `organization_integration_configs` (`integration_key = monday`, `config` JSON for env key names and future board IDs). |
| Public branding | `organization_public_quote_settings` per organization. |
| Pricing structures / rules | `quote_pricing_structures`, `quote_pricing_rules` gain `organization_id`; admin APIs scope lists and inserts. |
| Territories | `quote_sales_territories.organization_id` + admin list scope. |
| User directory | `user_profiles.organization_id` (future: filter sales directory by org). |

---

## 3. What was added in the foundation sprint

- **`organizations`** — Canonical tenant row; Elite seeded as `elite_stone_fabrication`.
- **`organization_public_quote_settings`**, **`organization_integration_configs`**, **`organization_branches`** — Structure for branding, integrations, and locations.
- **Nullable `organization_id`** on quote and related tables (see migration file), with **backfill** to Elite where safe.
- **`organizationContext.js`** — `resolveOrganizationContext`, `getDefaultOrganization`, `getOrganizationByKey`, `requireOrganizationId`, `tableHasOrganizationId`, `mergeRowOrganizationId`, `organizationScopeOrFilter`.
- **Quote paths** — Public submit, authenticated submit, pipeline list/detail, pricing admin lists/inserts, territory assignment, Monday sync log optionally include org context when columns exist.

---

## 4. What remains single-tenant / Elite-specific

- Default org resolution still falls back to Elite when the `organizations` table is missing or unseeded.
- Monday **token** remains env-only; DB holds metadata, not secrets.
- Many heads (Executive, Brain Health, Moraware flows) are unchanged by this foundation.

---

## 5. What remains for true multi-tenant SaaS

- **Strict enforcement** — Remove `OR organization_id IS NULL` scoping when all rows are backfilled and verified.
- **RLS** policies per table aligned with `organization_id`.
- **Tenant onboarding UI** and **organization switcher**.
- **Integration settings UI** editing `organization_integration_configs` safely (with secret refs only).
- **Tenant-specific public domains/slugs** and signed/public org resolution (do not trust raw client headers for protected data).

---

## Migration file

Apply manually when ready (not auto-run in CI):

`backend-core/supabase/eos_saas_foundation.sql`
