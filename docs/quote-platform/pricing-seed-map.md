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
| `config.materials[]` | `quote_pricing_rules` | `material_color` | `item_code` = slug(`supplier_material_colorName`). `price` = NULL; **group** lives in `metadata.group` for color → tier mapping. |
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

## 6. Public retail — minimum 25% markup

- **`quote_pricing_structures`** for `public_retail` sets `retail_markup_percent = 25` (and satisfies the schema check `>= 25`).
- **`quoteCalculator.js`** computes line **wholesale** from rule unit prices, then for `pricing_mode === 'public_retail'` applies `applyRetailProtection()` so **retail total = wholesale total × (1 + effectiveMarkup/100)**`, with a floor of 25%.
- **Seed rule rows are identical** across all six structures for unit prices (prototype baseline). We **do not** store per-line prices pre-multiplied by 1.25 for public retail, because that would **double-apply** markup on top of the calculator’s total-level protection.

Example: Group Promo prototype $/sf **45** → wholesale uses **45** for every structure; public retail **display total** is wholesale × **1.25** (e.g. **56.25** $/sf equivalent on a single-SF quote with no other lines).

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

## 10. Row counts (seed v1)

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
