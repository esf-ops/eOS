# Phase DE.2A.1 — Business Pricing Decision Sheet

**Date:** 2026-07-16
**Status:** Documentation only — worksheet for business approval
**Does not:** change prices, `calculateQuote()`, Pricing Admin, IE, QL, Takeoff, delivery, catalogs, SQL, flags, commits, or deploys
**Does not begin:** DE.2B
**Evidence base:** [`PHASE_DE_2A_PRICING_INVENTORY.md`](./PHASE_DE_2A_PRICING_INVENTORY.md), [`PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md`](./PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md), [`PHASE_DE_2A_CONFIGURATION_MODEL.md`](./PHASE_DE_2A_CONFIGURATION_MODEL.md), [`PHASE_DE_2A_IMPLEMENTATION_PLAN.md`](./PHASE_DE_2A_IMPLEMENTATION_PLAN.md), and the cited source files below.

### How to use this sheet

- **Repository evidence** columns are facts from the codebase.
- **Recommended approved value** is a draft recommendation for discussion — **not** an automatic cutover.
- **Approval status** values: `Open` · `Approved` · `Rejected` · `Deferred`. All rows start **Open**.
- Do **not** silently resolve conflicts. Fill **owner notes** and change status when decided.

---

## 1. ELITE 100 MATERIAL GROUPS

**Production source (consumed by `calculateQuote()` for Direct $/SF):**
`backend-core/src/quotes/quoteCalculator.js` → `ESF_DIRECT_PRICE_PER_SQFT`

**Wholesale table (consumed when `internalMaterialBasis=wholesale` or partner/wholesale fallbacks):**
same file → `PROTOTYPE_TIER_PRICE_PER_SQFT`

**Pricing Admin seeds (not consumed by `calculateQuote()`):**
`backend-core/supabase/eliteos_pricing_admin_foundation.sql` → `quote_price_group_rates`

| Price-group name | Wholesale $/SF | Direct/Retail $/SF | Promo $/SF if applicable | Current production source | Current calculator consumption | Included commercial scope | Conflicting value | Recommended approved value | Approval status | Owner notes |
|------------------|----------------|--------------------|--------------------------|---------------------------|--------------------------------|---------------------------|-------------------|----------------------------|-----------------|-------------|
| Group Promo | **45** | **70** | Direct **70** / Wholesale **45** (this *is* the Promo tier) | `ESF_DIRECT_*` + `PROTOTYPE_TIER_*` | Yes — Direct CT/BS always from `ESF_DIRECT_*` when basis=direct | See §2 (bundled fab/install assumed; not itemized) | Admin seeds match Direct 70 / Wholesale 45 | Keep **W 45 / D 70** for freeze until Admin cutover | Open | |
| Group A | **57** | **77** | n/a (not Promo) | same | Yes | §2 | Admin match 57 / 77 | Keep **W 57 / D 77** | Open | |
| Group B | **65** | **85** | n/a | same | Yes | §2 | Admin match 65 / 85 | Keep **W 65 / D 85** | Open | |
| Group C | **75** | **95** | n/a | same | Yes | §2 | Admin match 75 / 95 | Keep **W 75 / D 95** | Open | |
| Group D | **85** | **105** | n/a | same | Yes | §2 | Admin match 85 / 105 | Keep **W 85 / D 105** | Open | |
| Group E | **100** | **120** | n/a | same | Yes | §2 | Admin match 100 / 120 | Keep **W 100 / D 120** | Open | |
| Group F | **115** | **135** | n/a | same | Yes | §2 | Admin match 115 / 135 | Keep **W 115 / D 135** | Open | |
| Remnant | **50** (calculator) / **45** (confirmed future policy) | **50** | n/a | `ESF_DIRECT_*` + `PROTOTYPE_TIER_*` only | Yes | §2 | **Admin has no Remnant group**; calculator Wholesale Remnant **50** vs confirmed policy Wholesale Remnant **45** | **Approved future policy: W 45 / D 50** (DE.2B fixtures). Do not change `calculateQuote` in DE.2B | Open → partial | Calculator still W50 until DE.2C/cutover |

**Promo commercial behavior (public / Monday — not IE Direct markup):**

| Fact | Exact value | Source |
|------|-------------|--------|
| Public consumer material base | `ESF_DIRECT_PRICE_PER_SQFT` (same Direct table) | `quoteCalculator.js` |
| Public planning markup | minimum **25%** (`MIN_PUBLIC_RETAIL_MARKUP = 25`; multiplier **1.25**) | `quoteCalculator.js` |
| Admin public markup policy seed | `{"percent":25}` | `quote_pricing_policy_rules.public_consumer_markup_percent` |
| Monday headline group policy seed | `{"group_code":"promo"}` | `quote_pricing_policy_rules.public_monday_quote_value_group` |
| Elite 100 IE Direct markup | **0%** — `retail = wholesale` | Internal save / calculator path |

**Formula (material line, IE Direct):**
`chargeable_sf × ESF_DIRECT_PRICE_PER_SQFT[group]` then apply material use tax per §6 (not a separate group rate).

---

## 2. BASE-PRICE INCLUSIONS

For each Elite 100 group $/SF, whether that rate commercially includes the component in software behavior today.

Legend: **Yes** / **No** / **Unknown** / **Conflicting**.

| Component | Promo | A | B | C | D | E | F | Remnant | Evidence |
|-----------|-------|---|---|---|---|---|---|---------|----------|
| Material | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Priced as group $/SF × chargeable SF |
| Fabrication | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No separate fab line in `calculateQuote()`; inventory documents fab as bundled |
| Template | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | **Not priced** in calculator; may exist off-system |
| Installation | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No separate install line; treated as bundled with $/SF |
| Delivery | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | **Not priced** in calculator |
| Standard eased / included edge | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | `edgeMode=included` → **$0**; upgrades charged separately (§3) |
| Standard sink cutout | No | No | No | No | No | No | No | No | Kitchen cutout **$200 each** (`qty-sink`) when selected |
| Standard backsplash | No* | No* | No* | No* | No* | No* | No* | No* | *Splash SF priced at **same group $/SF**, not “included free”; quantity from measurements |
| Waste / overage factor | No | No | No | No | No | No | No | No | IE applies **no** waste factor (`DEFAULT_WASTE_FACTOR=1.2` is Custom Quote only) |
| Use tax (2%) | Conflicting | Conflicting | Conflicting | Conflicting | Conflicting | Conflicting | Conflicting | Conflicting | Tax is **added on** material dollars (§6), not inside the $/SF constant — but customer may not see a separate line |
| Other bundled (OOC premium) | No | No | No | No | No | No | No | No | IE rooms engine returns OOC premium **$0** |

**Business decision needed:** Confirm template/delivery/install commercial truth for customer communications (Yes/No/Unknown → Approved).

| Decision field | Choices | Recommended | Status | Owner notes |
|----------------|---------|-------------|--------|-------------|
| Confirm fab+install bundled in $/SF for customer copy | Bundled / Unbundle with separate lines | Bundled | Open | |
| Template included in $/SF? | Yes / No / Separate fee TBD | Unknown → resolve | Open | |
| Delivery included in $/SF? | Yes / No / Separate fee TBD | Unknown → resolve | Open | |
| Backsplash: charged SF vs “included allowance” | Charged SF (current) / Allowance SF free | Charged SF (current software) | Open | |

---

## 3. EXACT ADD-ON PRICE BOOK

### 3.1 Calculator-consumed add-ons (`PROTOTYPE_ADDON_UNIT_PRICES`)

IE Direct and Wholesale use the **same unit dollar** for these codes (no Wholesale/Direct split in the constant). Rule override: if `quote_pricing_rules` has matching `item_code`, that **rule price wins**.

| Item | SW code / label | Wholesale amount/formula | Direct amount/formula | Unit | Tax treatment | Current source | Customer visibility | Conflict | Proposed decision | Status | Owner notes |
|------|-----------------|--------------------------|----------------------|------|---------------|----------------|---------------------|----------|-------------------|--------|-------------|
| Undermount / kitchen sink cutout | `qty-sink` / Kitchen Sink Cutouts | **200** × qty | **200** × qty | each | Not in 2% material use-tax base | `quoteCalculator.js` | Yes if selected | Admin `kitchen_sink_cutout` = **200** (match) | Approve **200** | Open | |
| Vanity / bar sink cutout | `qty-bar` / Vanity/Bar Sink Cutouts | **100** × qty | **100** × qty | each | Not in use-tax base | same | Yes if selected | Admin `vanity_bar_sink_cutout` = **100** | Approve **100** | Open | |
| Drop-in sink cutout | — | **Not discovered** | **Not discovered** | — | — | No SW code | — | Missing | Price TBD or N/A | Open | |
| Cooktop cutout | `qty-cook` / Cooktop Cutouts | **150** × qty | **150** × qty | each | Not in use-tax base | same | Yes if selected | Admin `cooktop_cutout` = **150** | Approve **150** | Open | |
| Electrical outlet cutout | `qty-outlet` / Electrical Outlet Cutouts | **30** × qty | **30** × qty | each | Not in use-tax base | same | Yes if selected | Admin `electrical_outlet_cutout` = **30** | Approve **30** | Open | |
| Faucet holes | — | **Not discovered** | **Not discovered** | — | — | Not priced | — | Missing | Price TBD or N/A | Open | |
| Pop-up outlet **cutout** | — | **Not in calculator** | **Not in calculator** | each | — | Admin only: `popup_outlet_cutout` **150** | Admin unused by calc | **Conflict: Admin 150 / SW absent** | Choose: adopt **150**, other $, or omit | Open | |
| ESF stainless kitchen sink | `qty-ss` / ESF Stainless Kitchen Sink | **160** × qty | **160** × qty | each | Not in use-tax base | same | Yes if selected | Admin `esf_stainless_kitchen_sink` = **160** | Approve **160**; map SKU later | Open | |
| Stock Blanco sink | `qty-blanco` / Stock Blanco Sink | **450** × qty | **450** × qty | each | Not in use-tax base | same | Yes if selected | Admin `stock_blanco_sink` = **495** | **Must choose 450 vs 495** | Open | |
| ESF rectangular vanity sink | `qty-v-rect` | **55** × qty | **55** × qty | each | Not in use-tax base | same | Yes if selected | Admin **55** | Approve **55** | Open | |
| ESF oval vanity sink | `qty-v-oval` | **35** × qty | **35** × qty | each | Not in use-tax base | same | Yes if selected | Admin **35** | Approve **35** | Open | |
| Tear-out | `tearout` / Tear Out Needed | **750** flat | **750** flat | fixed | Not in use-tax base | same | Yes if selected | Admin `tear_out` = **750** | Approve **750** | Open | |

### 3.2 Measured scope priced via material $/SF (not separate add-on SKUs)

| Item | Wholesale formula | Direct formula | Unit | Tax | Source | Visibility | Conflict | Proposed decision | Status |
|------|-------------------|----------------|------|-----|--------|------------|----------|-------------------|--------|
| Standard backsplash | `chargeable_splash_sf × PROTOTYPE_TIER[group]` | `chargeable_splash_sf × ESF_DIRECT[group]` | $/SF | **+2%** use tax on material $ (IE) | room engine | Yes (splash row) | None on rate | Keep SF × group | Open |
| Full-height backsplash | Same $/SF as group on FHB/splash SF | Same | $/SF | +2% on material $ | guided measurement → splash totals | Rolled into splash | None | Keep | Open |

### 3.3 Edges / waterfalls / miter / build-up

| Item | Wholesale amount/formula | Direct amount/formula | Unit | Tax | Source | Visibility | Conflict | Proposed decision | Status |
|------|--------------------------|----------------------|------|-----|--------|------------|----------|-------------------|--------|
| Included / standard edge | **0** | **0** | — | n/a | `edgeMode=included` | Included | None | Keep $0 included | Open |
| Legacy specialty profiles: Full Bullnose, Ogee, **Waterfall**, Laminated (mitered), Dupont | **15**/LF (or `specialty_edge_per_lf` rule) | **15**/LF (same fallback) | $/LF | Not in material use-tax helper | `SPECIALTY_EDGE_RATE_PER_LF = 15`; Admin seed specialty **15** | Yes if charged | Admin also has flat waterfall **600** | Resolve waterfall model (§10 B5) | Open |
| v2 upgrade: Small Ogee, Crescent, Knife | **15**/LF (`UPGRADED_EDGE_RATE_WHOLESALE_V2`) | **25**/LF (`UPGRADED_EDGE_RATE_DIRECT_V2`) | $/LF | Not in use-tax base | `quoteCalculator.js` | Yes | None vs Admin specialty LF | Approve W **15** / D **25** | Open |
| Miter 2–3" | **65**/LF | **65**/LF | $/LF | Not in use-tax base | `MITER_RATES_V2["2-3in"]=65` | Yes | None | Approve **65** | Open |
| Miter 4" | **70**/LF | **70**/LF | $/LF | same | `MITER_RATES_V2["4in"]=70` | Yes | None | Approve **70** | Open |
| Miter 5" | **75**/LF | **75**/LF | $/LF | same | `MITER_RATES_V2["5in"]=75` | Yes | None | Approve **75** | Open |
| Miter 6" | **80**/LF | **80**/LF | $/LF | same | `MITER_RATES_V2["6in"]=80` | Yes | None | Approve **80** | Open |
| Build-up / lamination (with miter) | **20**/SF | **20**/SF | $/SF | Not in use-tax base | `BUILDUP_RATE_PER_SQFT_V2 = 20` | Yes | None | Approve **20** | Open |
| Admin waterfall flat | **Not consumed** | **Not consumed** | fixed | — | Admin `waterfall` **600** | — | vs legacy Waterfall **15**/LF | Choose LF vs **600** flat (± polish) | Open |
| Polish waterfall backside | **Not consumed** | **Not consumed** | fixed | — | Admin `polish_waterfall_backside` **225** | — | Unused by calc | Include / omit | Open |
| Manual edge | Estimator-entered amount | same | fixed | Not in use-tax base | `edgeMode=manual` | Staff | None | Estimator-only | Open |

### 3.4 Services / commercial charges not in calculator

| Item | Wholesale | Direct | Unit | Tax | Source | Visibility | Conflict | Proposed decision | Status |
|------|-----------|--------|------|-----|--------|------------|----------|-------------------|--------|
| Plumbing disconnect/reconnect | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Custom line or fee TBD | Open |
| Delivery | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Bundled vs fee TBD | Open |
| Template | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Bundled vs fee TBD | Open |
| Trip / return-trip / field measure | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Custom line or fee TBD | Open |
| Minimum job charge | **Not discovered / not enforced** | same | — | — | Absent | — | Missing | Dollar minimum TBD or none | Open |
| Difficult access / stairs / distance | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Custom line TBD | Open |
| Faucet holes / notches / polished sink edge / rodding / special CNC | **Not discovered** | **Not discovered** | — | — | Absent | — | Missing | Price book TBD or N/A | Open |

### 3.5 Vanity program 2026 (package prices — exact)

Threshold: qualifying kitchen counter SF **≥ 35** → `over35` tier; else `under35`.
Source: `backend-core/src/quotes/vanityProgram2026.js` → `VANITY_PROGRAM_2026_BY_CODE`.
Display helper: `roundCustomerDisplayVanity` = **nearest $5** (`Math.round(n/5)*5`), not ceil.

| Code | Label | over35 ($) | under35 ($) |
|------|-------|------------|-------------|
| 25_S | 25" Single Bowl Vanity | 190 | 370 |
| 31_S | 31" Single Bowl Vanity | 210 | 425 |
| 37_S | 37" Single Bowl Vanity | 240 | 475 |
| 43_S | 43" Single Bowl Vanity | 270 | 535 |
| 49_S | 49" Single Bowl Vanity | 310 | 590 |
| 55_S | 55" Single Bowl Vanity | 360 | 650 |
| 61_S | 61" Single Bowl Vanity | 385 | 675 |
| 61_D | 61" Double Bowl Vanity | 410 | 700 |
| 73_D | 73" Double Bowl Vanity | 490 | 810 |
| 84_D | 84" Double Bowl Vanity | 570 | 950 |
| 93_D | 93" Double Bowl Vanity | 650 | 1000 |
| 96_D | 96" Double Bowl Vanity | 685 | 1050 |
| 105_D | 105" Double Bowl Vanity | 760 | 1100 |
| 120_D | 120" Double Bowl Vanity | 800 | 1150 |

**Sink upgrades (per sink × bowl count):** oval_bisque **+10**; rectangular_white **+25**; rectangular_bisque **+25**; oval_white **+0**.

| Vanity decision | Recommended | Status | Owner notes |
|-----------------|-------------|--------|-------------|
| Keep 2026 table as freeze source for DE.2 options | Yes | Open | |
| Align vanity display rounding with IE ceil-$5 | Choose nearest-$5 vs ceil-$5 | Open | |

---

## 4. PRODUCT PRICING

### 4.1 Priced in `calculateQuote()` (authoritative for Elite 100 IE today)

| SKU / code | Product name | Cost stored? | Customer / sell price | Wholesale vs Direct | Active | Image | Install/cutout dependency | Authority |
|------------|--------------|--------------|----------------------|---------------------|--------|-------|---------------------------|-----------|
| `qty-ss` | ESF Stainless Kitchen Sink | **No** | **160** each | Same $ both bases | Yes (constant) | Not in calculator | Typically with sink cutout (`qty-sink` / `qty-bar`) — not enforced in code | production |
| `qty-blanco` | Stock Blanco Sink | **No** | **450** each | Same | Yes | Not in calculator | Same | production — **conflicts Admin 495** |
| Admin `stock_blanco_sink` | Stock Blanco sink | **No** | **495** (seed only) | flat seed | seed active | — | — | unused by calculator |
| `qty-v-rect` | ESF Rectangular Vanity Sink | **No** | **55** each | Same | Yes | — | Vanity cutout often separate | production |
| `qty-v-oval` | ESF Oval Vanity Sink | **No** | **35** each | Same | Yes | — | Vanity cutout often separate | production |
| Admin `popup_outlet_cutout` | Pop-up outlet cutout | **No** | **150** | flat seed | seed | — | Cutout only — device not priced | unused by calculator |

**Blanco conflict (do not silently choose):**

| Source | Amount |
|--------|--------|
| `PROTOTYPE_ADDON_UNIT_PRICES["qty-blanco"].price` | **450** |
| Admin seed `stock_blanco_sink.base_price` | **495** |
| SQL comment in foundation file | Explicitly notes calculator still **450** until cutover |

### 4.2 Display catalog (`app-slab-inventory` product catalog) — **no sell prices exported**

File header states: *“Display-only product catalog. No pricing fields are exported.”*
Source: `app-slab-inventory/src/lib/productCatalogData.ts` (112 items).

| Category | Count | SKU present | Workbook `active` | Workbook `assetStatus` | Cost | Customer price | Wholesale/Direct | `calculateQuote`? | Authority |
|----------|-------|-------------|-------------------|------------------------|------|----------------|------------------|-------------------|-----------|
| sink | **44** | 29 of 44 | all true in export | all `missing` in export* | **not stored** | **not stored** | none | No | fixture / unused for quotes |
| sink_accessory | **26** | 13 of 26 | all true | all `missing`* | not stored | not stored | none | No | fixture |
| faucet | **32** | 32 of 32 | all true | all `missing`* | not stored | not stored | none | No | fixture |
| specialty_add_on | **10** | 0 of 10 | all true | all `missing`* | not stored | not stored | none | No | fixture |

\*Runtime image overrides exist for some Blanco/faucet IDs under `productCatalogAssets.ts` / faucet overrides; workbook export still marks `assetStatus: "missing"`.

**Pop-up / specialty devices discovered (display only — no price):**

| Catalog id | Name | SKU | Price | Authority |
|------------|------|-----|-------|-----------|
| specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-15-w | Point Pod Connect Silver … (15 W) | null | **none** | unused for quotes |
| specialty-point-pod-connect-silver-kitchen-counter-pop-up-outlet-65w | Point Pod Connect Silver … (65W) | null | **none** | unused |
| specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-15-w | Point Pod Connect Black … (15 W) | null | **none** | unused |
| specialty-point-pod-connect-black-kitchen-counter-pop-up-outlet-65w | Point Pod Connect Black … (65W) | null | **none** | unused |
| specialty-hubbell-dual-sided-countertop-pop-up-receptacle-15amp | Hubbell Dual-Sided … (15Amp) | null | **none** | unused |
| specialty-hubbell-tri-power-countertop-pop-up-receptacle-15-amp | Hubbell Tri-Power … (15 Amp) | null | **none** | unused |
| specialty-hubbell-tri-power-countertop-pop-up-receptacle-20-amp | Hubbell Tri-Power … (20 Amp) | null | **none** | unused |
| specialty-free-power-3-device-charging-station-wholesale-and-partner-15-w | Free Power 3 Device Charging Station … | null | **none** | unused |
| specialty-glowback-led-panels-… | Glowback LED panels (custom bid) | null | **none** — bid on request | unused |
| specialty-invisacook-… | InvisaCook (custom quote) | null | **none** — custom quote | unused |

**Faucets:** 32 active display SKUs (Delta/Moen ids such as `faucet-delta-9176-cz-pr-dst`, `faucet-moen-7864srs`, …). **Customer price = not stored. Cost = not stored.**

**Decision fields (products):**

| Decision | Choices | Recommended | Status | Owner notes |
|----------|---------|-------------|--------|-------------|
| Blanco sell price for Elite 100 / DE.2 freeze | **450** / **495** / other $____ | Prefer production **450** until deliberate Admin cutover | Open | |
| Map `qty-ss` to specific Kansas SKU(s) | SKU list / leave generic | Leave generic **160** for now | Open | |
| Price faucets for DE.2 | Full price book / exclude from customer select | Exclude until priced | Open | |
| Price pop-up **devices** | Per-SKU book / cutout-only **150** / exclude | Cutout **150** optional; devices TBD | Open | |

---

## 5. CALCULATION AND ROUNDING DECISIONS

### 5.1 Discovered policies (exact)

| Policy | Exact rule | Where |
|--------|------------|-------|
| Internal line math | `round2(n) = Math.round(n * 100) / 100` | `quoteCalculator.js` |
| IE customer display row (CDT building blocks) | Positive: `Math.ceil(n / 5) * 5`; negative credits: exact | `app-quote/src/lib/customerDisplayRounding.ts` → `roundCustomerDisplay` |
| Vanity display | `Math.round(n / 5) * 5` (nearest $5) | `vanityProgram2026.js` → `roundCustomerDisplayVanity` |
| Public consumer display | `Math.ceil(n / 10) * 10` | `roundPublicEstimateToNearestTen` |
| Admin public rounding seed | `{"mode":"round_up_nearest_10"}` | `public_rounding_rule` |
| `customer_display_total` / `finalRounded` | Client-authored integers; save validates equality; not derived server-side from `grand_total` | `internalQuotesApi.js` |
| Whole-dollar-only policy | **Not implemented** as a named IE/DE policy | — |

### 5.2 Worked examples (single pre-rounding amount → displayed)

| Pre-rounding total | Whole-dollar `Math.round` | Ceil to $5 `ceil(n/5)*5` | Nearest $10 `round(n/10)*10` | Round up to $10 `ceil(n/10)*10` (= public) | Current IE CDT row behavior (= ceil $5) |
|--------------------|---------------------------|-------------------------|-----------------------------|-------------------------------|----------------------------------------|
| **$4,872.01** | **4872** | **4875** | **4870** | **4880** | **4875** |
| **$4,875.00** | **4875** | **4875** | **4880** | **4880** | **4875** |
| **$4,876.00** | **4876** | **4880** | **4880** | **4880** | **4880** |
| **$4,879.01** | **4879** | **4880** | **4880** | **4880** | **4880** |

**Note:** Real IE CDT is the **sum of per-row** ceil-$5 displays (material, splash, add-ons, customer-facing customs, edges, …), not one global round of `grand_total`. Vanity rows may use nearest-$5 instead.

| Digital Estimate rounding decision | Recommended (draft) | Approval status | Owner notes |
|------------------------------------|---------------------|-----------------|-------------|
| Adopt one DE presentation rule | **Ceil to $5 per customer-visible row**, match IE CDT; store policy version on envelope | **Open** | |
| Align vanity with ceil-$5 | Yes / keep nearest-$5 | Open | |
| Use public ceil-$10 for DE | No (conflicts IE habit) unless marketing requires | Open | |

---

## 6. TAX DECISION

| Topic | Exact repository fact |
|-------|----------------------|
| Rate | **`INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT = 2`** (2%) |
| Module | `backend-core/src/quotes/internalEstimateMaterialTaxPolicy.js` |
| Named treatment in code | **“material use tax”** (not labeled sales tax in code) |
| Taxable basis | Countertop material $ + backsplash material $ (`materialUseTaxScope: "countertop_and_backsplash_material"`) |
| Excludes | add_ons, custom_lines, labor, fees, credits (policy `excludes` array) |
| Vanity program rooms | Excluded from material use-tax base when flagged vanity program |
| Formula | `tax = round2(base × 0.02)` on CT and BS bases separately then summed |
| Wholesale behavior | Applied on material dollars after Wholesale or Direct rates as selected by basis |
| Direct behavior | Same 2% on Direct material dollars |
| Customer separate tax line | **Not a first-class public line item** in DE.1 publication model; dollars are embedded in material economics / evidence — presentation TBD |
| Legal/accounting classification | **Unresolved** — code says “use tax”; whether customer-facing copy may say sales tax / use tax / embedded is a business+accounting decision |

| Tax decision field | Choices | Recommended | Status | Owner notes |
|--------------------|---------|-------------|--------|-------------|
| Keep 2% on CT+BS material for Elite 100 DE | Yes / change % / remove | Keep **2%** pending accounting | Open | |
| Customer sees separate tax line? | Yes / No (embedded) | Embedded until legal review | Open | |
| Legal name for customer copy | Use tax / Sales tax / “included” / other | **Accounting approval required** — no legal conclusion here | Open | |

---

## 7. ACCOUNT-SPECIFIC PRICING

**Design-only fields** (do not implement in DE.2A.1). Today: Elite 100 IE Direct does **not** apply account material schedules; partner structures can override wholesale rules outside this path.

| Field | Description | Example / type | Approval needed? |
|-------|-------------|----------------|------------------|
| Account name / reference | Partner or org account id + display name | UUID + string | Yes |
| Default Wholesale/Direct schedule | Which rate table freezes into envelope | `wholesale` \| `direct` | Yes |
| Material markup percentage | Applied after base schedule (order TBD in engine) | percent, e.g. 0–50 | Yes + max |
| Product discount / markup | Per product class or SKU | percent or fixed | Yes |
| Fixed account adjustments | Flat $ credit/surcharge | money | Yes |
| Pricing-valid dates | `valid_from` / `valid_through` | dates | Yes |
| Authorized approver | Role/user who may set account terms | role id | Yes |
| Override limits | Max discount %, max negative custom, require reason | numeric + flags | Yes |
| Customer-visible treatment | Show list / show “account pricing applied” / hide | enum | Yes |

| Account pricing decision | Recommended | Status | Owner notes |
|--------------------------|-------------|--------|-------------|
| Support account freezes in DE.2 envelope JSON? | Schema may hold optional account freeze blob; values TBD | Open | |
| Allow customer to see account markup %? | **No** | Open | |

---

## 8. INTERNAL BUNDLED COMPONENTS

Charges that may sit **inside** a customer-facing package/line price. Customer model must **not** call these “hidden fees”; they are internal cost/sell contributions.

| Internal label | Cost basis (repo) | Sell-price contribution (repo) | Public package/line receiving contribution | Required disclosure status | Approval owner | Status | Notes |
|----------------|-------------------|--------------------------------|--------------------------------------------|----------------------------|----------------|--------|-------|
| Fabrication labor/CNC | **Not stored** as $ | Bundled into group $/SF sell | Material / countertop line | Unknown — marketing copy TBD | | Open | |
| Installation labor | **Not stored** | Bundled into group $/SF | Material line | Unknown | | Open | |
| Template labor/trip | **Not stored** | Unknown if inside $/SF | Material or separate | Unknown | | Open | |
| Delivery | **Not stored** | Unknown if inside $/SF | Material or separate | Unknown | | Open | |
| Standard included edge | **Not stored** | **$0** upgrade line | “Included edge” | Disclose as Included | | Open | |
| Material use tax 2% | Computed | Embedded in material economics | Material totals | Disclose vs embed TBD (§6) | Accounting | Open | |
| Internal-only custom lines (`customerFacing=false`) | Estimator unitPrice | In `grand_total`, not CDT rows | Package total | Staff-only | | Open | |
| OOC premium | Constants exist; IE rooms **$0** | None today | n/a | Confirm remains off Elite 100 | | Open | |
| Partner/public markup 25% | Policy | Public path only | Public totals | Not IE Direct | | Open | |

---

## 9. CUSTOMER-CONFIGURABILITY DECISIONS

Mark intended DE.2 behavior. Checkboxes are worksheet fields (☐). Default suggestions in **Recommended** column only.

| Item | Selectable by customer | Visible but locked | Estimator only | Included | Optional upgrade | Requires estimator review | Prohibited from customer control | Recommended default | Status | Owner notes |
|------|------------------------|--------------------|----------------|----------|------------------|---------------------------|----------------------------------|---------------------|--------|-------------|
| Material Group Promo | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional upgrade if in envelope | Open | |
| Material Groups A–F | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional upgrade / mutually exclusive | Open | |
| Remnant | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Estimator only or review | Open | |
| Color within group | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Selectable if mapped | Open | |
| Countertop / splash SF | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | **Visible locked** (professional scope) | Open | |
| Standard / included edge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Included | Open | |
| Edge upgrades (Small Ogee, Crescent, Knife) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional upgrade; LF locked | Open | |
| Miter / build-up | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional or review | Open | |
| Waterfall (pending formula) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Review until formula approved | Open | |
| Standard backsplash style | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Style selectable; SF locked | Open | |
| Full-height backsplash | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional; SF locked | Open | |
| Kitchen sink cutout qty | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Locked qty or review if increase | Open | |
| Stock sinks (`qty-ss`, Blanco) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional upgrade | Open | |
| Vanity sinks | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional / program | Open | |
| Faucets (unpriced catalog) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | **Prohibited** until priced | Open | |
| Pop-up cutout | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Optional after price approved | Open | |
| Pop-up devices (catalog) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Prohibited until priced | Open | |
| Accessories (catalog) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Prohibited until priced | Open | |
| Tear-out | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Estimator only or optional | Open | |
| Customer-facing custom lines | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | Only if listed in envelope | Open | |
| Discounts / credits | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | **Prohibited** customer control | Open | |
| Tax % / markup % | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | **Prohibited** | Open | |

Interactive price display when selectable (from configuration model): full price · upgrade/downgrade delta · Included · No change · Requires estimator review · Price unavailable until reviewed. Browser never authoritative.

---

## 10. BLOCKING APPROVAL REGISTER

| ID | Decision | Repository evidence | Available choices | Recommended choice | Business owner | Status | Implementation impact |
|----|----------|---------------------|-------------------|--------------------|----------------|--------|------------------------|
| B1 | Exact Elite 100 Wholesale group rates | Calculator Remnant W **50**; confirmed policy Remnant W **45** (DE.2B fixture) | Keep calculator / adopt policy | **Policy Remnant W 45** for DE; leave calculator until cutover | | Partial | DE.2C freeze data |
| B2 | Exact Direct group rates | Direct Remnant **50** confirmed (matches calculator) | Keep | Keep Direct including Remnant **50** | | Confirmed | Same |
| B3 | Promo behavior (IE vs public Monday) | IE: Direct 70 no markup; Public: Direct × ≥1.25; Monday group policy `promo` | IE-only Direct / also public rules in DE | DE.2 uses IE Direct freeze; public Monday out of DE.2 | | Open | Envelope basis flag |
| B4 | Remnant behavior | Admin missing; SW W50/D50; **policy W45/D50** | Add Admin Remnant W45/D50 / etc. | Policy **W45/D50**; calculator unchanged in DE.2B | | Partial | Option catalog + rate map |
| B5 | Blanco price | SW **450** vs Admin **495** | 450 / 495 / other | Prefer **450** until cutover | | Open | Option sell_price freeze |
| B6 | Waterfall formula | Legacy **15**/LF name “Waterfall”; Admin flat **600** + polish **225** | LF 15 / flat 600±225 / other | **Requires choice** — do not ship waterfall option until decided | | Open | Option pricing_mode |
| B7 | Pop-up pricing | Admin cutout **150**; devices unpriced | 150 cutout only / device book / omit | Cutout **150** optional; devices omit | | Open | Addon options |
| B8 | Group $/SF inclusions (template/delivery/install) | Fab/install treated bundled; template/delivery unpriced | Confirm Yes/No per §2 | Confirm bundled fab+install; resolve template/delivery | | Open | Customer copy + disclosure |
| B9 | Template fee | Not in calculator | Included / separate $____ / N/A | Resolve before customer copy | | Open | Optional fee option |
| B10 | Delivery fee | Not in calculator | Included / separate $____ / N/A | Resolve before customer copy | | Open | Optional fee option |
| B11 | Minimum job | Not enforced | None / $____ minimum | None until defined | | Open | Engine rule version |
| B12 | 2% tax treatment | Confirmed **0.02** on material sell across schedules; IE still CT+BS with vanity exclusions | Keep / align exclusions / customer line | Keep 2%; resolve presentation + IE exclusion conflict in DE.2C | | Partial | Tax policy version on envelope |
| B13 | Digital Estimate rounding | IE ceil $5; public ceil $10; vanity nearest $5; Admin seed round_up_nearest_10 | Ceil $5 / ceil $10 / nearest $10 / whole-dollar | **Ceil $5 per visible row** (Open) | | Open | Calc policy id |
| B14 | Account markup authorization | Partner rules exist; IE Direct unused | Allow frozen account terms / forbid in pilot | Forbid live markup; optional freeze later | | Open | Envelope JSON shape (optional) |
| B15 | Override / discount approval | No max discount in code | Caps + roles / pilot freeform | Caps before customer pilot | | Open | Validation rules |
| B16 | Faucet & accessory sell prices | Catalog display-only, **0** price fields | Price book / exclude from DE.2 | Exclude until priced | | Open | Merchandising |
| B17 | Drop-in cutout / faucet holes / plumbing | Absent | Add prices / N/A | Mark N/A or add prices | | Open | Catalog completeness |

---

## 11. DE.2B READINESS GATE

### A. Must be approved before schema

Only **schema-shaping** uncertainty belongs here. Price *amounts* that freeze as versioned data do **not** block schema.

| Item | Schema-shaping? | Verdict |
|------|-----------------|---------|
| Envelope + options with frozen `sell_price` / treatment enums | Already designed in `PHASE_DE_2A_DATA_MODEL.md` | **No blocker** |
| Support both absolute and delta price treatments | Enum already proposed | **No blocker** |
| Optional account-freeze JSON blob | Can be nullable column/json later without redesign | **No blocker** — defer values |
| Remnant as optional group key in rate map | Free-form / keyed rates already fit | **No blocker** |
| Tax/rounding as versioned policy ids on envelope | Already proposed (`pricing_engine_version` / freeze) | **No blocker** |
| Waterfall LF vs flat | Representable as option `pricing_mode` + amount; choose amount later | **No blocker** |

**A-gate result:** No open decision requires changing the proposed DE.2B table shape before drafting SQL.

### B. May remain configurable after schema

- Exact group $/SF cells (B1–B2)
- Blanco 450 vs 495 (B5)
- Pop-up device prices (B7/B16)
- Template/delivery dollar amounts (B9–B10)
- Minimum job dollar (B11)
- Account markup percentages (B14)
- Vanity table cells
- Edge upgrade dollars

### C. Must be approved before calculation engine (DE.2C)

- Digital Estimate rounding policy (B13)
- Tax application + presentation rules (B12)
- Waterfall pricing mode if waterfall is offered (B6)
- Whether configuration deltas reprice full material or constrained options only (implementation plan risk #2)
- Override / negative-line caps if engine enforces them (B15)
- Promo / basis: IE Direct vs any public markup in DE path (B3)

### D. Must be approved before customer pilot (DE.2E/G)

- Group inclusion / disclosure copy (B8)
- Customer-configurability matrix (§9) filled
- Blanco + any merchandised sinks (B5)
- Remnant customer rules (B4)
- Faucet/accessory exclusion or prices (B16)
- Accounting-approved tax customer language (B12)
- Override authority for staff (B15)

---

## Confirmed rules captured for DE.2B (2026-07-16)

| Rule | Status |
|------|--------|
| Direct rates Promo→F + Remnant **50** | Confirmed business; DE.2B fixture |
| Wholesale rates Promo→F + Remnant **45** | Confirmed business; DE.2B fixture (calculator still Remnant W **50**) |
| Global material use tax **2%** on material sell across schedules | Confirmed; presentation/order vs Spahn deferred |
| Watt’s Promo **$40/SF** for trusted account group only | Confirmed; membership via `partner_account_id` |
| Spahn & Rose **+3%** entire-estimate adjustment | Confirmed; order vs use tax = DE.2C |

See [`PHASE_DE_2B_NOTES.md`](./PHASE_DE_2B_NOTES.md).

## DE.2B readiness result

### **READY_FOR_DE_2B_SCHEMA** → **DE.2B implemented (unapplied)**

Rationale: Proposed DE.2B schema already models versioned, frozen option economics and policy version ids. Unresolved **amounts** and commercial inclusions are data/approval items for freeze and DE.2C/E — they do not require a different table design before drafting additive SQL.

---

## Cross-links

- Inventory: [`PHASE_DE_2A_PRICING_INVENTORY.md`](./PHASE_DE_2A_PRICING_INVENTORY.md)
- Authority audit: [`PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md`](./PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md)
- Data model (schema target): [`PHASE_DE_2A_DATA_MODEL.md`](./PHASE_DE_2A_DATA_MODEL.md)
- Implementation plan: [`PHASE_DE_2A_IMPLEMENTATION_PLAN.md`](./PHASE_DE_2A_IMPLEMENTATION_PLAN.md)
