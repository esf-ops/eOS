# Quote platform — prototype pricing seed map

## 1. Purpose

The file `backend-core/supabase/eos_quote_platform_seed_prototype.sql` seeds **catalog and list-style unit economics** from the ESF Quoting Tool HTML prototype into Supabase `quote_pricing_structures` and `quote_pricing_rules`. It is intended to run **manually** after `backend-core/supabase/eos_quote_platform.sql`.

- No real customer quotes, no partner identities beyond public color names, no API tokens.
- **Additive**: does not replace unrelated schema or application code.
- **Partner accounts** are **not** seeded; assignments stay empty until a deliberate partner onboarding flow exists.

## 2. Prototype source

| Item | Path |
|------|------|
| Source of truth | `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html` |
| Regenerator (optional) | `backend-core/src/scripts/generateQuotePrototypePricingSeed.js` |

Run from repo root:

```bash
node backend-core/src/scripts/generateQuotePrototypePricingSeed.js
```

## 3. Extracted `config` sections

| Section | Role in prototype |
|---------|-------------------|
| `config.tiers` | Material group $/sf (Group Promo → Group F) |
| `config.materials` | Elite Program color list with supplier, material type, and **group** assignment |
| `config.vanityPricing` | Vanity SKUs (`25_S` … `120_D`) with tier 1 / tier 2 unit prices and bowl count |
| `config.vanitySinkOptions` | Per-sink vanity sink upgrades ($0 / $10 / $25) |
| `config.addOns` | Per-unit add-ons (cutouts, sinks) keyed by `qty-*` ids |
| `config.tearOut` | Flat job add-on for tear-out ($750); separate from `addOns[]` in the prototype |

## 4. Mapping table (prototype → Supabase)

| Prototype constant / key | Supabase table | `category` | Notes |
|--------------------------|----------------|------------|--------|
| `config.tiers[].n` / `.p` | `quote_pricing_rules` | `material_group` | `item_name` must match calculator input (e.g. `Group Promo`). `item_code` is normalized `group_promo`, … `group_f`. `price` = prototype `p`. `unit_type` = `per_sqft` (matches `quoteCalculator.js` / prototype mirror, not literal `sqft`). |
| `config.materials[]` | `quote_pricing_rules` | `material_color` | `item_code` = slug(`supplier_material_colorName`). `price` = NULL; **group** lives in `metadata.group` for color → tier mapping. Internal Estimate reads active rows via **`GET /api/internal-quotes/material-colors`** (fallback list if DB empty). |
| `config.vanityPricing` keys | `quote_pricing_rules` | `vanity` | `item_code` = prototype key (`25_S`, …). `base_cost` = `t1`, `price` = `t2` for `calculateVanities()`. Metadata duplicates tiers for admin / future parity. |
| `config.vanitySinkOptions` | `quote_pricing_rules` | `vanity_sink_upgrade` | `item_code` = `vanity_sink_upgrade_{value}`. Calculator does not consume this category yet; seed preserves prototype. |
| `config.addOns[]` (cutouts) | `quote_pricing_rules` | `cutout` | Matches prototype mirror rows used by `calculateAddOns()` (category ≠ `material_group`, `item_code` matches `qty-*`). |
| `config.addOns[]` (sinks) | `quote_pricing_rules` | `sink` | Same lookup path; category differs for reporting only. |
| `config.tearOut` | `quote_pricing_rules` | `tearout` | `item_code` = **`tearout`** (engine + `PROTOTYPE_ADDON_UNIT_PRICES`). `metadata.spec_item_code` = `tear_out_needed` documents the naming spec. `unit_type` = `job`. |
| (structures) | `quote_pricing_structures` | — | Six rows below; `metadata.seed_pack` = `prototype_v101`. |

## 5. Seeded pricing structures

| `code` | `pricing_mode` | `retail_markup_percent` | `is_public_default` |
|--------|----------------|-------------------------|---------------------|
| `public_retail` | `public_retail` | 25 | `true` |
| `dealer_tier_1` | `dealer` | 0 | `false` |
| `dealer_tier_2` | `dealer` | 0 | `false` |
| `builder_partner` | `builder` | 0 | `false` |
| `designer_partner` | `designer` | 0 | `false` |
| `internal_house` | `internal` | 0 | `false` |

## 6. Public consumer — ESF Direct + planning markup

- **`quote_pricing_structures`** for `public_retail` sets `retail_markup_percent` (minimum **25%** in schema / resolver).
- **`quoteCalculator.js` — public consumer paths** use **`ESF_DIRECT_PRICE_PER_SQFT`** for material $/sqft (not the prototype partner tier mirror). Add-on and vanity line units still come from `quote_pricing_rules` / prototype mirror and are treated as **Direct** unit prices.
- Homeowner-facing totals: **Direct subtotal × `(1 + effectiveRetailMarkupPercent/100)`** (same as `applyRetailProtection` for `public_retail`). Per-component: countertop = ct × Direct$/sf × factor; backsplash = bs × Direct$/sf × factor; add-ons = Σ(Direct unit × qty) × factor. This is **not** “wholesale + markup” and is **not** labeled to homeowners as wholesale or internal tier names.
- **Seed `material_group` rule prices** remain the prototype partner mirror for **partner** structures; public material math uses the **Direct** table in code so changing seed partner tiers does not silently change public consumer stone rates.

Example: Group Promo Direct **70** $/sf, markup **25%** → planning rate **87.50** $/sf for homeowner-facing stone lines.

## 7. Eric / admin review checklist

- Confirm tier $/sf and add-on unit prices match current authorized price sheets (prototype may lag production).
- Decide when **dealer_tier_2** (and builder/designer) should diverge from tier 1; currently all protected structures share the same rule rows.
- Confirm **tear-out** belongs in the same economic bucket as line-item add-ons for public markup (today it rolls into wholesale subtotal, then receives the same total markup).
- Validate **vanity** tier threshold (`PROTOTYPE_VANITY_TIER_THRESHOLD_SQFT` = 35 in code) against operations.
- **Color rules**: confirm supplier/color naming and slugs are acceptable for a future Pricing Admin UI (no PII).

## 8. Risks and gaps

| Risk / gap | Detail |
|------------|--------|
| Prototype ≠ production | HTML config is a **snapshot**; finance must bless numbers before customer-facing use. |
| Color pricing | Runtime pricing remains **group-based** via `material_group`; `material_color` rows are mapping + metadata until color-specific overrides exist. |
| Vanity tiers | `calculateVanities` uses `base_cost` / `price` only; tier metadata is for admin / future parity — needs explicit QA when DB-backed rules fully replace mirrors. |
| Room engine | `engine === "rooms"` path still needs parity work vs legacy single-area input. |
| Public UI | Public quote experiences must **never** ship protected partner rows or wholesale-only breakdowns to anonymous clients; use `public_retail` structure + server-calculated totals only. |
| `vanity_sink_upgrade` | Not wired in `quoteCalculator.js` yet; seed is archival / forward-looking. |

## 9. Next steps

1. Apply `eos_quote_platform.sql` in Supabase (manual).
2. Apply `eos_quote_platform_seed_prototype.sql` (manual).
3. Build **Pricing Admin** head (edit structures + rules, audit trail).
4. Build **partner pricing assignment** UI (`quote_partner_pricing_assignments`).
5. Wire **calculator** to prefer DB rules for all categories (including vanity upgrades) and add tests against seeded UUIDs in CI if feasible.
6. Implement **public retail** wizard using server-side `calculateQuote` only.

## 10. Pricing Admin foundation (parallel schema)

Manual apply: `backend-core/supabase/eliteos_pricing_admin_foundation.sql` (additive; **not** auto-run).

| Table | Role |
|-------|------|
| `quote_price_groups` | Material tier definitions (`promo` … `group_f`) |
| `quote_price_group_rates` | Direct / wholesale (and future partner/public) $/sf per group |
| `quote_pricing_policy_rules` | JSON policy keys (`public_consumer_markup_percent`, rounding, internal UX flags, …) — **not** the legacy line-catalog `quote_pricing_rules` table |
| `quote_addon_catalog` | Named add-ons / services with `addon_code` |
| `quote_material_color_mappings` | Optional color → group mapping (scaffold) |
| `quote_pricing_audit_log` | Append-only audit for Pricing Admin mutations |

**Resolver:** `backend-core/src/quotes/pricingConfigResolver.js` merges DB rows with **`quoteCalculator.js`** fallbacks. Public/Internal quote heads are **unchanged** until an explicit cutover ties math to the resolver.

**Stock Blanco discrepancy:** `PROTOTYPE_ADDON_UNIT_PRICES["qty-blanco"]` in `quoteCalculator.js` is **450**; Pricing Admin seed uses **495** pending finance alignment — do not treat as silent drift; pick one before calculator reads catalog prices.

## 11. Row counts (seed v1)

Derived from the generator (single structure × counts below; **×6** structures):

| Bucket | Rows per structure |
|--------|--------------------|
| Material groups (`config.tiers`) | 7 |
| Material colors (`config.materials`) | 100 |
| Vanities (`config.vanityPricing`) | 14 |
| Vanity sink upgrades (`config.vanitySinkOptions`) | 3 |
| Add-ons (`config.addOns`) | 8 |
| Tear-out (`config.tearOut`) | 1 |
| **Total rules per structure** | **133** |
| **Total rule INSERTs in seed file** | **798** (133 × 6) |

**Pricing structures:** 6.

**Partner seed:** intentionally omitted (no `quote_partner_accounts` rows).
