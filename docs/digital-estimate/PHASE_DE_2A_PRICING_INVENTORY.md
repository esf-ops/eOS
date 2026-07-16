# Phase DE.2A — Authoritative Pricing Inventory (Elite 100 Expanded)

**Date:** 2026-07-16
**Status:** Documentation only — no pricing or source changes
**Scope:** Every pricing input that can affect an **Elite 100 Internal Estimate** (`quote_source=internal_quote`, Direct basis) and closely related sources that conflict or will feed interactive Digital Estimate configuration.
**Companion:** [`PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md`](./PHASE_DE_2A_PRICING_AUTHORITY_AUDIT.md)

**Companion decision sheet:** [`PHASE_DE_2A_1_BUSINESS_PRICING_DECISIONS.md`](./PHASE_DE_2A_1_BUSINESS_PRICING_DECISIONS.md) (business approvals; DE.2B readiness gate).

### How to read this inventory

For each item:

| Column | Meaning |
|--------|---------|
| **Software charges today** | What `calculateQuote()` / IE display actually apply for Elite 100 IE |
| **Pricing Admin stores** | `quote_price_group_rates` / `quote_addon_catalog` / policy seeds |
| **Fixtures/tests assume** | Contract tests / seeds / UI fixtures |
| **Business approval still required** | Ambiguous / conflicting / missing — **do not silently pick** |
| **Future DE.2 authority** | Recommended freeze target for interactive config |

**Authority status values:** `production` · `fallback` · `fixture` · `unused` · `ambiguous`

**Basis note (Elite 100 IE):** Internal Estimate forces Direct economics: `retail = wholesale` (no partner/public markup). “Wholesale value” below is the **Wholesale rate table** used when `internalMaterialBasis=wholesale` or partner paths — not a separate homeowner price for standard IE Direct jobs.

---

## 1. Five-way separation (summary)

| Layer | Role today |
|-------|------------|
| **1. Software currently charges** | `quoteCalculator.js` constants + room/add-on/vanity/edge math + IE UI customer-display rounding |
| **2. Pricing Admin currently stores** | Parallel seeds in `eliteos_pricing_admin_foundation.sql` — **not consumed by `calculateQuote()`** |
| **3. Fixtures/tests assume** | `pricingAuthority.contract.test.mjs`, prototype mirrors, vanity/edge UI mirrors |
| **4. Business approval still required** | Conflicts in §10; items marked missing/ambiguous |
| **5. Future pricing authority** | Hybrid: freeze publication baseline + versioned config delta catalog (audit §8) — Admin cutover only after parity |

---

## 2. MATERIAL

### 2.1 Elite 100 / Promo price groups ($/SF)

| Group | Unit | Direct (software) | Wholesale (software) | Admin Direct seed | Admin Wholesale seed | `calculateQuote` consumes? | Authority | Customer-visible label | Customer sees $ | May be customer-selectable | Estimator-controlled | Locked scope | Tax | Notes |
|-------|------|-------------------|----------------------|-------------------|----------------------|---------------------------|-----------|------------------------|-----------------|------------------------------|----------------------|--------------|-----|-------|
| Group Promo | $/SF | **70** | **45** | 70 | 45 | **Yes** (Direct always from `ESF_DIRECT_*`) | production (SW) / unused (Admin for IE Direct) | Material group / color tier | Via material lines | Yes (if envelope offers multiple groups/colors) | Yes | Group may be locked per room | 2% use tax on material $ | Remnant not in Admin |
| Group A | $/SF | **77** | **57** | 77 | 57 | Yes | production | | | Yes | Yes | | 2% | Match Admin |
| Group B | $/SF | **85** | **65** | 85 | 65 | Yes | production | | | Yes | Yes | | 2% | |
| Group C | $/SF | **95** | **75** | 95 | 75 | Yes | production | | | Yes | Yes | | 2% | |
| Group D | $/SF | **105** | **85** | 105 | 85 | Yes | production | | | Yes | Yes | | 2% | |
| Group E | $/SF | **120** | **100** | 120 | 100 | Yes | production | | | Yes | Yes | | 2% | |
| Group F | $/SF | **135** | **115** | 135 | 115 | Yes | production | | | Yes | Yes | | 2% | |
| Remnant | $/SF | **50** | **50** (calculator) | **missing** | **missing** | Yes | production (SW) / missing (Admin) | Remnant | Via material | Possibly | Yes | | 2% | **Conflict:** Admin missing Remnant; **confirmed future Wholesale Remnant = 45** (DE.2B fixture; calculator unchanged) |

**Source (software):** `backend-core/src/quotes/quoteCalculator.js` → `ESF_DIRECT_PRICE_PER_SQFT`, `PROTOTYPE_TIER_PRICE_PER_SQFT`
**Source (Admin):** `quote_price_group_rates.rate_per_sqft` where `rate_type` ∈ {`direct`,`wholesale`}
**Account-specific:** Not for IE Direct. Partner structures may override wholesale via `quote_pricing_rules` (not Elite 100 IE Direct path).
**Dependencies:** Color → group mapping (estimator or catalog). Chargeable SF from measurements.
**Rounding:** Line math `round2` (cents); customer display ceil-$5 on material rows (UI).
**Fabrication/install:** **Bundled into group $/SF** for IE — no separate fab/install lines in calculator (§3).

### 2.2 Color → group mapping

| Item | Formula/amount | Unit | SW | Admin | Consumed? | Status | Visible | Selectable | Estimator | Locked | Conflicts |
|------|----------------|------|----|-------|-----------|--------|---------|------------|-----------|--------|-----------|
| Color picker catalog | N/A (metadata) | — | `materialColorsCatalog.js` from `quote_pricing_rules` category `material_color` or fallback 4 colors | `quote_material_color_mappings` **empty schema** | Yes for UI list; **pricing uses selected group**, not color SKU | production (UI) / unused (mappings table) | Color name | Yes (envelope) | Yes | Measurements locked | Parallel slab `elite100-2026.json` not joined to quote math |
| Slab catalog price_group | display only | — | slab inventory | n/a | No for calculateQuote | unused for quotes | Collection labels | Future | — | — | No FK to `quote_price_groups` |

### 2.3 Material cost basis / markup / waste / thickness

| Item | Software today | Admin | Consumed? | Status | Notes |
|------|----------------|-------|-----------|--------|-------|
| Material cost basis (internal COGS) | **Not modeled** as separate field on IE | unused | No | missing | Future internal evidence only |
| Material markup % (IE Direct) | **0%** — retail=wholesale | public markup policy 25% is for **public_retail** | IE: no | production | Do not expose markup to customer |
| Waste / overage factor | **Not applied** in IE `calculateQuote` | unused | No | missing / custom_quote only (`DEFAULT_WASTE_FACTOR=1.2`) | Custom Quote Tool only — out of Elite 100 IE |
| Thickness upgrades | **Not a priced field** in calculator | unused | No | missing | Business approval needed if offered |
| Account-specific material $/SF | Not on IE Direct | org-scoped Admin rates unused | No for IE Direct | unused | Freeze into envelope if ever enabled |

---

## 3. FABRICATION AND INSTALLATION

| Item | Software charges today | Admin | Consumed? | Status | Customer-visible | Selectable? | Estimator | Locked | Future |
|------|------------------------|-------|-----------|--------|------------------|-------------|-----------|--------|--------|
| Fabrication | **Included in material $/SF** (no separate line) | none | Implicit | production (bundled) | Not broken out | No | — | Yes (scope) | Keep bundled unless business unbundles |
| Installation | **Included in material $/SF** | none | Implicit | production (bundled) | Not broken out | No | — | Yes | Same |
| Template | **Not priced** | none | No | missing | — | No | — | Yes | Approval if trip fee exists off-system |
| Delivery / trip | **Not priced** | none | No | missing | — | Possibly later | — | Often locked | Approval required |
| Minimum job charge | **Not enforced** in calculator | none | No | missing | — | No | — | — | Approval required |
| Minimum SF | **Not enforced** as commercial minimum | vanity tier uses 35 SF kitchen threshold | Vanity only | production (vanity tier) | Indirect | No | Yes (tier) | Measurements locked | Document kitchen SF rule |
| Difficult access / stairs / distance | **Not priced** | none | No | missing | — | No | Manual custom line | — | Custom line or envelope option |
| Tear-out / removal | **$750 flat** (`tearout`) | `tear_out` **$750** | Yes | production | Yes if add-on selected | Possibly | Yes | No | Align codes |
| Plumbing disconnect/reconnect | **Not priced** | none | No | missing | — | — | Custom line | — | Approval |
| Field measure / return trip | **Not priced** | none | No | missing | — | — | Custom line | — | Approval |
| Waterfall edge (Admin flat) | See edges — SW uses LF profile, Admin has **$600 flat** | conflict | Ambiguous | See §10 | | | | | |

---

## 4. MEASURED SCOPE

| Item | How priced today | Unit | Consumed? | Status | Customer-visible $ | Selectable | Estimator | Locked professional scope | Tax |
|------|------------------|------|-----------|--------|-------------------|------------|-----------|---------------------------|-----|
| Countertop SF | group $/SF × **chargeable** SF (ceil exact→whole for internal) | $/SF | Yes | production | Yes (display row) | No | Measures | **Yes** | 2% use tax on $ |
| Standard backsplash | same $/SF as room group × chargeable splash SF | $/SF | Yes | production | Yes | Option type maybe; SF locked | Yes | **SF locked** | 2% |
| Full-height backsplash | Included in guided splash/fhb totals then same $/SF | $/SF | Yes | production | Rolled into splash | Maybe style | Yes | SF locked | 2% |
| Waterfall panels | Legacy profile name “Waterfall” → specialty edge LF; **not** Admin $600 | $/LF or Admin flat | Partial | **ambiguous** | If edge charged | Edge option | Yes | Geometry locked | No tax on edge lines in tax helper (material tax is CT/BS) |
| Build-up / lamination | **$20/SF** v2 with miter | $/SF | Yes (rooms+edgeMode mitered) | production | Yes as line | Possibly | Yes | SF locked | No use-tax in edge path |
| Mitered edges | **$65–$80/LF** by height | $/LF | Yes | production | Yes | Possibly | Yes | LF locked | |
| Aprons | **Not distinct** priced type | — | No | missing | — | — | Custom / piece | Often locked | |
| Window sills | As pieces in rooms (SF × group) if entered | $/SF | If modeled as pieces | production if entered | Yes | No | Yes | Yes | 2% if material |
| Shower / specialty pieces | Same as room pieces if entered | $/SF | If entered | production if entered | Yes | No | Yes | Yes | 2% |
| Seams | **Not priced** | — | No | missing | — | No | — | — | Approval |
| Radius / irregular geometry | Via guided measurement SF, not surcharge | — | Indirect | production (SF only) | Via SF | No | Yes | Yes | |
| Cooktop / range modifications | Cutout add-on **$150** each (`qty-cook`) | each | Yes | production | Yes | Possibly | Qty | Cut count often locked | No |

**Chargeable SF rule (internal):** `chargeableCounterSqftFromExact` / `chargeableSplashSqftFromExact` — ceiling to whole SF (`roomGuidedMeasurement.js`). **Not** per-piece ceil for chargeable total (project/room exact then ceil).

**Standard dimensions (measurement helpers, not prices):** counter depth 25.5"; backsplash height 4"; vanity depth 22.5" for side splash.

---

## 5. CUTOUTS AND FABRICATION ADD-ONS

| Code (SW) | Customer label (SW) | Amount | Unit | Wholesale=Direct (IE) | Admin code / amount | Consumed? | Status | Selectable? | Tax |
|-----------|---------------------|--------|------|----------------------|---------------------|-----------|--------|-------------|-----|
| `qty-sink` | Kitchen Sink Cutouts | **200** | each | 200 | `kitchen_sink_cutout` 200 | Yes | production | Possibly | No |
| `qty-bar` | Vanity/Bar Sink Cutouts | **100** | each | 100 | `vanity_bar_sink_cutout` 100 | Yes | production | Possibly | No |
| `qty-cook` | Cooktop Cutouts | **150** | each | 150 | `cooktop_cutout` 150 | Yes | production | Possibly | No |
| `qty-outlet` | Electrical Outlet Cutouts | **30** | each | 30 | `electrical_outlet_cutout` 30 | Yes | production | Possibly | No |
| — | Pop-up outlet cutout | **not in SW** | each | — | `popup_outlet_cutout` **150** | **No** | unused (Admin only) | Future | — |
| `qty-ss` | ESF Stainless Kitchen Sink | **160** | each | 160 | `esf_stainless_kitchen_sink` 160 | Yes | production | Yes | No |
| `qty-blanco` | Stock Blanco Sink | **450** | each | 450 | `stock_blanco_sink` **495** | Yes | **conflict** | Yes | No |
| `qty-v-rect` | ESF Rectangular Vanity Sink | **55** | each | 55 | `rectangular_vanity_sink` 55 | Yes | production | Yes | No |
| `qty-v-oval` | ESF Oval Vanity Sink | **35** | each | 35 | `oval_vanity_sink` 35 | Yes | production | Yes | No |
| `tearout` | Tear Out Needed | **750** | fixed | 750 | `tear_out` 750 | Yes | production | Possibly | No |
| — | Faucet holes | **not priced** | — | — | — | No | missing | — | — |
| — | Notches | **not priced** | — | — | — | No | missing | — | — |
| — | Polished sink edges | **not priced** | — | — | — | No | missing | — | — |
| — | Rodding / reinforcement | **not priced** | — | — | — | No | missing | — | — |
| — | Special CNC ops | **not priced** | — | — | — | No | missing | Custom line | — |

**Source SW:** `PROTOTYPE_ADDON_UNIT_PRICES`. If a matching `quote_pricing_rules` row exists for the add-on `item_code` (non–material_group), **that rule price wins** over the prototype constant — including on IE paths when such rules are present. Admin `quote_addon_catalog` is **not** read by `calculateQuote()`.
**IE Direct material $/SF:** always from `ESF_DIRECT_*` / wholesale table as applicable — Admin group rates unused.

**Vanity program sink upgrades (separate from qty-v-*):** oval_bisque +$10/sink; rectangular_white/bisque +$25/sink (`vanityProgram2026.js`).

---

## 6. EDGE PROFILES

| Mode / profile | Amount | Unit | Direct | Wholesale | Consumed? | Status | Selectable | Compatibility |
|----------------|--------|------|--------|-----------|-----------|--------|------------|---------------|
| `edgeMode=included` | $0 | — | 0 | 0 | Yes | production | Default | Standard included edge |
| Legacy profiles: Full Bullnose, Ogee, Waterfall, Laminated (mitered), Dupont | **$15/LF** fallback (`SPECIALTY_EDGE_RATE_PER_LF`) or `specialty_edge_per_lf` rule | $/LF | 15 | 15 | Yes if no edgeMode | production / fallback | Legacy | Dupont retained for old quotes only |
| v2 upgraded: Small Ogee, Crescent, Knife | **$25/LF Direct** / **$15/LF Wholesale** | $/LF | 25 | 15 | Yes | production | Yes | Requires LF > 0 |
| Miter 2–3" | **65**/LF | $/LF | 65 | 65 | Yes | production | Yes | Height key |
| Miter 4" | **70**/LF | | | | Yes | production | Yes | |
| Miter 5" | **75**/LF | | | | Yes | production | Yes | |
| Miter 6" | **80**/LF | | | | Yes | production | Yes | |
| Build-up with miter | **20**/SF | $/SF | 20 | 20 | Yes | production | Yes | With mitered mode |
| `edgeMode=manual` | Estimator amount | fixed | as entered | | Yes | production | No (staff) | Requires internal reason |
| Admin `waterfall` | **600** flat | fixed | — | — | **No** | unused / conflict | — | Conflicts with LF Waterfall |
| Admin `polish_waterfall_backside` | **225** flat | fixed | — | — | **No** | unused | — | Not in calculateQuote |
| Admin `specialty_edge_per_lf` | **15** | $/LF | — | — | Only if mirrored into `quote_pricing_rules` | unused for IE unless rules wired | — | Matches SW fallback |

**Linear feet:** estimator-entered `edgeLinearFeet`; **locked professional** for customer.
**Tax:** edge lines not in material use-tax base.

---

## 7. PRODUCTS (sinks, faucets, pop-ups, accessories)

| Product class | Software price | Catalog | Consumed by calculateQuote? | Status | Sell vs cost | Included vs optional | Qty limits | Images/SKU | Account pricing |
|---------------|----------------|---------|------------------------------|--------|--------------|----------------------|------------|------------|-----------------|
| Stock sinks (qty-ss, blanco, vanity) | See §5 | Admin addon + productCatalog display | Yes (add-on codes) | production / conflict Blanco | Sell only in SW; cost not stored | Optional add-ons | Estimator qty | productCatalogData.ts display-only | None |
| Faucets | **Not priced** | productCatalogData.ts | No | fixture / unused for quotes | — | — | — | Yes in slab app | None |
| Pop-up outlets (device) | **Not priced** (cutout only in Admin) | — | No | missing | — | — | — | — | None |
| Accessories | **Not priced** | productCatalogData.ts | No | fixture | — | Custom line | — | Display | None |
| Vanity tops (program) | Package $ by size/tier (§7.1) | vanityProgram2026 | Yes | production | Sell package | Estimator | qty≥1 | — | Tier by kitchen SF |

### 7.1 Vanity program 2026 package prices (exact)

Threshold: kitchen qualifying counter SF **≥ 35** → `over35` tier; else `under35`. Display round: **nearest $5** (`roundCustomerDisplayVanity`).

| Code | Label | over35 ($) | under35 ($) |
|------|-------|------------|-------------|
| 25_S | 25" Single | 190 | 370 |
| 31_S | 31" Single | 210 | 425 |
| 37_S | 37" Single | 240 | 475 |
| 43_S | 43" Single | 270 | 535 |
| 49_S | 49" Single | 310 | 590 |
| 55_S | 55" Single | 360 | 650 |
| 61_S | 61" Single | 385 | 675 |
| 61_D | 61" Double | 410 | 700 |
| 73_D | 73" Double | 490 | 810 |
| 84_D | 84" Double | 570 | 950 |
| 93_D | 93" Double | 650 | 1000 |
| 96_D | 96" Double | 685 | 1050 |
| 105_D | 105" Double | 760 | 1100 |
| 120_D | 120" Double | 800 | 1150 |

Plus per-sink upgrades (§5). Outside-program vanities: **$0** from program pricer (must use other paths).

**Side splash:** SF from vanity depth × 4" / 144 × qty; rate = room material group $/SF + use tax path via vanity side splash helper.

---

## 8. CUSTOM AND MANUAL ITEMS

| Item | Software | Amount | Consumed? | Status | Customer-visible | Selectable | Approval |
|------|----------|--------|-----------|--------|------------------|------------|----------|
| Customer-facing custom line | `customLineItems` with `customerFacing=true` | Estimator unitPrice × qty | Yes | production | Yes | Qty only if envelope allows fixed catalog lines | None modeled |
| Internal-only custom line | `customerFacing=false` | Same | Yes (in totals) | production | No (bundled into economics) | No | None |
| Discount/Credit | category Discount/Credit; **negative** unitPrice allowed | Estimator | Yes | production | Yes if facing | No | **No max discount authority in code** |
| Other negative prices | Rejected with warning | — | Skipped | production | — | — | — |
| Allowances | Not first-class | — | No | missing | — | — | Approval |
| Surcharges | Via custom line or tearout | — | Partial | — | — | — | |
| Estimator override of catalog rates | Not first-class; change inputs or manual edge | — | Partial | ambiguous | — | — | **No approval workflow** |
| Passthrough items | `customPassthroughItems` | Estimator | Yes | production | Internal/partner oriented | No | — |

---

## 9. COMMERCIAL LOGIC

| Rule | Software today | Admin policy seed | Consumed by IE? | Status |
|------|----------------|-------------------|-----------------|--------|
| Wholesale vs Direct | `internalMaterialBasis` direct\|wholesale; IE typically Direct | rates tables | Yes | production |
| Promo-group behavior | Same as any group; public Monday policy points to promo | `public_monday_quote_value_group=promo` | Monday/public path | production (public) / unused (IE) |
| Account pricing | Partner assignments only | org Admin rates | Not IE Direct | unused for Elite 100 IE |
| Salesperson classifications | Not in calculator | — | No | missing |
| Markup order (IE) | **None** | public 25% | No for IE | production |
| Public markup | min 25% on Direct for public_retail | `public_consumer_markup_percent` | public only | production |
| Bundled charges | Fab/install in $/SF | — | Implicit | production |
| Subtotal order | See §11 | — | Yes | production |
| Tax | **2%** material use tax on CT+BS material $ | not in Admin policies as % | Yes | production |
| OOC premium | 10% wholesale / 15% Direct of eligible material — **rooms engine currently charges $0 for internal** | — | Legacy path only | ambiguous / effectively unused for IE rooms |
| Internal rounding | `round2` (cents) | — | Yes | production |
| Customer-display rounding (IE) | **Ceil to next $5** per display row; credits exact | Admin public rule still says round_up_nearest_10 | UI yes; calc no | **conflict** public policy vs IE UI |
| Public consumer rounding | `roundPublicEstimateToNearestTen` = ceil $10 | matches Admin public_rounding_rule | public only | production |
| `customer_display_total` | Client sum of displayed rows; stored | — | Validated on save | production |
| `finalRounded` | Must equal CDT | — | Validated | production |
| `grand_total` | `calc.totals.retail` exact | — | Yes | production |
| Monday Quote Amount | Sync uses `grand_total` / quote_value; public planning may use promo group policy | policy seed | Sync path | production (ops) |

---

## 10. CONFLICT / DUPLICATE / HARDCODED / MISSING REPORT

| ID | Topic | Software | Pricing Admin | Fixtures/tests | Do not silently choose — needs business approval |
|----|-------|----------|---------------|----------------|--------------------------------------------------|
| C1 | Stock Blanco | **$450** | **$495** | SW constants in contract tests | Which sell price is authoritative? |
| C2 | Pop-up outlet cutout | **Absent** | **$150** | Admin/resolver fallback only | Offer in IE/DE.2? Amount? |
| C3 | Waterfall | Legacy **$15/LF** specialty or v2 profiles | Flat **$600** + polish **$225** | SW edge sets | LF vs flat package? |
| C4 | Remnant group | **$50** Direct & Wholesale | **No Remnant group** | Contract tests require Remnant | Add to Admin or hide from Admin? |
| C5 | Customer display rounding | IE **ceil $5** | Policy JSON **round_up_nearest_10** | IE beta tests ceil $5 | Which rule for Digital Estimate customer totals? |
| C6 | Vanity display round | SW nearest $5 (`Math.round`) | — | Tests | Align with ceil-$5 material rows? |
| C7 | OOC premium | Constants exist; IE rooms **$0** | — | Comments in calculator | Confirm OOC never on Elite 100 DE |
| C8 | Fab/install/template/delivery/min job | Bundled or missing | — | — | Confirm commercial reality off-system |
| C9 | Faucets/accessories | Unpriced | Display catalog | — | Pricelist for DE.2 options? |
| C10 | Faucet holes / notches / polish / rodding | Missing | — | — | Price list or N/A? |
| C11 | Admin rates vs SW Direct | Equal for Promo–F | Equal seeds | Parity intentional today | Keep freeze from SW until Admin wired |
| C12 | `quote_material_color_mappings` | Unused | Empty | — | Use or drop for DE.2 freeze |
| C13 | Discount max / override approval | None | None | — | Authority matrix for F-class overrides |

---

## 11. CALCULATION ORDER

### 11.1 Actual current order — Elite 100 IE (`rooms` engine, Direct)

Observed from `calculateQuote()` / `sumRoomsWholesale` / save path (not assumed ideal):

1. **Normalize input** (force internal_quote behaviors; strip retail markup fields).
2. **Resolve pricing structure/rules** (metadata; Direct CT/BS still use `ESF_DIRECT_*`).
3. **Authoritative measured quantities** — expand guided rooms/pieces; compute exact CT/BS SF; apply **chargeable ceiling** for internal.
4. **Material/group pricing** — $/SF × chargeable SF per piece/room (Direct table).
5. **Material use tax (2%)** on CT+BS material dollars (vanity-program rooms excluded from that tax base per tax helper).
6. **OOC premium** — computed path exists; **currently $0** for internal rooms engine.
7. **Add-ons / products** (`calculateAddOns`) — cutouts, sinks, tearout.
8. **Vanities** — program packages + sink upgrades + side splash.
9. **Edge upgrades / miter / build-up / manual** (`calculateRoomUpgradedEdges`).
10. **Custom passthrough + custom line items** (including discounts).
11. **Account-specific adjustments** — **none** on IE Direct.
12. **Material markup** — **none** (retail := wholesale).
13. **Minimum-job enforcement** — **none**.
14. **Internal rounding** — `round2` throughout.
15. **Persist** `grand_total` = retail exact; UI separately builds **customer_display_total** with **ceil-$5** row rounding (and vanity nearest-$5).

**Not in this order today:** separate fabrication, installation, template, delivery, waste factor, faucet SKUs.

### 11.2 Recommended future deterministic order (DE.2 config delta)

For interactive configuration **on a frozen baseline** (hybrid model):

1. Locked measured quantities & baseline package total (from publication).
2. Apply selection replacements/deltas from **frozen option sell prices** (envelope).
3. Enforce compatibility / min-max qty.
4. Apply included→upgrade deltas (not live Admin).
5. Apply customer-facing custom optional lines allowed by envelope.
6. Apply credits/discounts only if envelope permits (with caps once approved).
7. Enforce minimum-job if business adds a frozen rule.
8. Apply tax policy **version** frozen on envelope (if customer-visible).
9. Engine `round2` / policy rounding version.
10. Emit customer-display rounding **same version** as Digital Estimate presentation.
11. Persist immutable calculation snapshot.

Do **not** re-enter live `calculateQuote()` with mutable constants for customer submits.

---

## 12. INCLUDED-VERSUS-OPTIONAL MATRIX

| Item | Included in Elite 100 base $/SF | Auto from scope | Estimator-selected | Customer-selectable (future) | Customer-visible locked | Internal-only | Prohibited from customer |
|------|----------------------------------|-----------------|--------------------|------------------------------|-------------------------|---------------|--------------------------|
| CT/BS material SF | Yes (priced) | Yes | Measures | No | Total yes; SF locked | | SF/geometry |
| Fab/install/template | Bundled | Implicit | — | No | Not itemized | Cost basis | Unbundling without approval |
| Standard edge | Yes ($0 upgrade) | Default | Mode | Choose upgrade only | | | Changing included without envelope |
| Edge upgrades / miter / buildup | No | No | Yes | Yes if offered | | | |
| Cutouts | No | No | Qty | Yes if offered | | | Raising cut count above locked authority without review |
| Stock sinks / Blanco | No | No | Yes | Yes if offered | | | |
| Tear-out | No | No | Yes | Maybe | | | |
| Vanity program | No | Tier from kitchen SF | Yes | Limited options | | | Outside-program freeform |
| Faucets / accessories | — | — | Custom today | After priced catalog | | | Unpriced SKUs |
| Custom facing lines | No | No | Yes | Qty/select if listed | | | Arbitrary price entry |
| Internal custom lines | Bundled | No | Yes | No | No | Yes | |
| Discounts | No | No | Yes | No | Maybe | | Customer-authored discount |
| OOC material | N/A Elite 100 | — | Blocked for DE publish | No | | | Yes |
| Tax 2% | Embedded in material $ | Yes | — | No | Usually not itemized | Policy | Editing tax % |
| Markup % | N/A IE | — | — | No | | Yes | Yes |

---

## 13. INTERACTIVE PRICING DISPLAY (per selectable option)

Browser **never** authoritative. Server returns one of:

| Treatment | When to use |
|-----------|-------------|
| **Included** | Option is baseline/default; delta $0 |
| **Full option price** | Absolute sell price frozen on option (e.g. sink SKU) |
| **Upgrade/downgrade delta** | Relative to included selection (e.g. group B→C on locked SF × frozen rates) |
| **No change** | Selection equals current saved config |
| **Requires estimator review** | Compatibility fail, missing freeze, override class F, or cut count above locked |
| **Price unavailable until reviewed** | Envelope incomplete / calc engine mismatch / expired pricing |

---

## 14. What should become future pricing authority

| Domain | Future authority (recommended) |
|--------|--------------------------------|
| Baseline package | Immutable DE publication snapshot (already DE.1) |
| Option sell prices | Frozen on envelope activate (copied from approved catalog version) |
| Group $/SF for deltas | Frozen rate map on envelope (initially copy of `ESF_DIRECT_*` + approved Remnant policy) |
| Tax / rounding | Versioned policy ids on envelope |
| Admin tables | Source for **authoring** after parity — not live customer calc until cutover phase |
| `calculateQuote()` | Remains IE production authority; not customer config engine |

---

## 15. References

- `backend-core/src/quotes/quoteCalculator.js`
- `backend-core/src/quotes/vanityProgram2026.js`
- `backend-core/src/quotes/internalEstimateMaterialTaxPolicy.js`
- `backend-core/src/quotes/internalEstimateOutOfCollectionPolicy.js`
- `backend-core/src/quotes/pricingConfigResolver.js`
- `backend-core/src/quotes/roomGuidedMeasurement.js`
- `backend-core/supabase/eliteos_pricing_admin_foundation.sql`
- `app-quote/src/lib/customerDisplayRounding.ts`
- `backend-core/src/quotes/pricingAuthority.contract.test.mjs`
