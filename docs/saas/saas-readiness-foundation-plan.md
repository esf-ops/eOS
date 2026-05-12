# SaaS readiness — foundation plan (eliteOS Quote Platform)

**Brand standard:** User-facing product name is **eliteOS**. Legacy and internal technical identifiers may still use `eos`, `eOS`, or paths such as `~/eOS` until a later, safe technical rename (for example npm script `eos:check:local`, table `eos_action_log`, API routes, and environment variable names stay unchanged).

---

## 1. Current state

- **Single-tenant Elite MVP:** Quote flows, pricing, territories, and integrations are effectively scoped to Elite Stone Fabrication.
- **Public quote flow:** Wizard, calculate, and submit-measurements work end-to-end locally; quotes persist to Supabase.
- **Quote Pipeline:** Sales and system-admin pipeline views work with authenticated access.
- **Monday.com sync:** Item creation uses environment-based board IDs and optional column mapping; no tenant UI for board selection yet.

---

## 2. SaaS target

- **Multi-tenant fabricator SaaS:** Each organization (fabricator) has its own users, pricing, territories, quote records, integrations, public-quote settings, and branding.
- **Isolation:** Data and configuration must not leak across tenants at the application and database layers.

---

## 3. Core SaaS pillars

1. **Strict data isolation** — Queries and writes scoped by `organization_id` (and later RLS).
2. **Zero hardcoding** — Tenant defaults (e.g. Elite) are data, not magic strings in business logic.
3. **Integration abstraction** — Monday, Moraware, QuickBooks, etc. resolve from tenant config with env/secret-manager fallback.
4. **Admin UI configuration** — Org settings, branding, branches, and connectors editable without deploys.
5. **Role-based access and auditability** — Who changed what, for which organization.

---

## 4. Safe migration strategy

1. **Additive tables and columns first** — No drops or renames of existing tables/columns.
2. **Default Elite organization** — Seed `organizations` with `organization_key = elite_stone_fabrication`.
3. **Backfill** — Set `organization_id` on existing rows to the Elite org where the column is added.
4. **Update writes** — Application code includes `organization_id` on new inserts when the column exists.
5. **Update reads** — List and aggregate queries prefer `organization_id = current org OR organization_id IS NULL` during transition so legacy rows remain visible.
6. **Enforcement later** — `NOT NULL`, strict matching, and **RLS** only after data and code paths are verified.

---

## 5. What is in this sprint (foundation only)

- New org-related tables and nullable `organization_id` on quote and related entities (see `backend-core/supabase/eos_saas_foundation.sql`).
- Backend **organization context** helper defaulting to Elite when no tenant is specified.
- Quote write/read paths updated to use org context **when columns exist** — no requirement to run SQL before local dev keeps working.
- Documentation and a **small** system-admin readiness indicator — no full tenant admin UI.

**Out of scope for this sprint:** Destructive migrations, forcing every historical row to have `organization_id` without backfill, changing public math, exposing internal pricing, or touching Moraware / Sales Account Mapping / Identity Resolution beyond quote paths listed in the mission.

---

## 6. What comes later

- **Full RLS** on tenant tables.
- **Tenant onboarding** flows and billing (e.g. Stripe per org).
- **Organization switcher** for users with multiple org access.
- **Tenant-specific connectors** — Moraware, Monday, QuickBooks, SlabSmith, etc., fully driven from `organization_integration_configs` and secret references.
- **Marketplace or multi-org admin console** for operators serving many fabricators.

---

## References

- SQL: `backend-core/supabase/eos_saas_foundation.sql`
- Backend helper: `backend-core/src/organizations/organizationContext.js`
- Quote notes: `docs/quote-platform/quote-saas-readiness-notes.md`

## Related roadmap

See `docs/eliteos/eliteOS-master-head-map.md` for the full eliteOS head roadmap and priority order.
