# Pricing authority map (contract baseline)

**Status:** Phase 1 — tests + this doc lock **current** behavior. No calculator math changes until deliberate cutover.

**Related:** [`pricing-seed-map.md`](./pricing-seed-map.md), [`pricing-admin-head-plan.md`](./pricing-admin-head-plan.md), [`FEATURE_DECISIONS.md`](../eliteos/FEATURE_DECISIONS.md) §10, [`SYSTEM_BLUEPRINT.md`](../eliteos/SYSTEM_BLUEPRINT.md) §7–8.

**Contract tests:** `npm run eos:test:pricing-authority` → `backend-core/src/quotes/pricingAuthority.contract.test.mjs`

---

## Live calculator authority (today)

| Layer | Role |
|-------|------|
| **`quoteCalculator.js`** | Authoritative math for Internal Estimate, Public Quote, Partner Quote |
| **`quote_pricing_structures` + `quote_pricing_rules`** | Loaded by `resolvePricingStructure()` when Supabase tables exist |
| **Hardcoded fallbacks** | `ESF_DIRECT_PRICE_PER_SQFT`, `PROTOTYPE_TIER_PRICE_PER_SQFT`, `PROTOTYPE_ADDON_UNIT_PRICES`, vanity 2026, edge profile names, specialty edge $15/LF |
| **`pricingConfigResolver.js`** | Preview + Pricing Admin only — **not** called from `calculateQuote()` |

### By quote source

| Source | Material $/sf | Markup |
|--------|---------------|--------|
| **internal_quote** Direct | ESF Direct **constants** | **None** (`retail === wholesale`) |
| **internal_quote** Wholesale | DB `material_group` rules → prototype wholesale constants | **None** |
| **public_retail** | ESF Direct **constants** (not seed tier mirror) | Min **25%** on Direct subtotal |
| **partner_quote** | Assigned structure’s `quote_pricing_rules` | Partner display rules; resolver **fail closed** on unexpected DB errors |

---

## Pricing Admin foundation (not live yet)

Tables in `eliteos_pricing_admin_foundation.sql`:

- `quote_price_groups`, `quote_price_group_rates`
- `quote_addon_catalog`, `quote_pricing_policy_rules`
- `quote_pricing_audit_log`

**Gap:** Edits in Pricing Admin UI do **not** change `calculateQuote()` until resolver is wired and parity-tested.

---

## High-risk drift areas

| Area | Risk |
|------|------|
| **`prototypeQuoteMath.ts`** (shared) | Mirrors backend constants for IE/public sticky preview — can diverge from server |
| **Direct $/sf** | Hardcoded in calculator; Admin `quote_price_group_rates` unused in math |
| **Upgraded edge profile list** | Hardcoded `UPGRADED_EDGE_PROFILE_NAMES` — not admin-configurable |
| **Specialty edge $/LF** | DB rule `specialty_edge_per_lf` or fallback **$15** |
| **Vanity 2026 program** | `vanityProgram2026.js` — fully hardcoded; IE may bypass API for vanity rooms |
| **Stock Blanco** | Calculator/add-on catalog **$450** vs Pricing Admin seed **$495** — reconcile before cutover |
| **Save payload** | `customerRoomAreaBreakdown` may be built from local preview math |

---

## Protected behaviors (contract tests)

1. **internal_quote** — no public/partner markup; snapshot `no_partner_or_public_markup_percent`.
2. **internal Direct** — ESF Direct constants; ignores wholesale rule prices for material.
3. **internal Wholesale** — uses injected `quote_pricing_rules`; empty rules → prototype constants.
4. **public_retail** — 25% markup floor even when structure requests lower %.
5. **partner_quote** — `resolvePricingStructure` throws on simulated DB failure after assignment (fail closed).

---

## Future migration principle

1. **Tests first** (this file + contract suite).
2. **Small resolver cutovers** — one category at a time with parity checks.
3. **Effective dates + snapshot hardening** — record pricing version ids on save; never PATCH snapshots from client.

Do not wire `pricingConfigResolver` into `calculateQuote` without explicit approval and expanded golden tests.
