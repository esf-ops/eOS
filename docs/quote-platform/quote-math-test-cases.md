# Quote math — manual test cases (prototype parity)

These cases validate **local demo math** (`app-quote/src/lib/prototypeQuoteMath.ts` + `measurementEngine.ts`) against the rules in **ESF Quoting Tool v1.01**. Run in the app by matching inputs, or add automated tests later.

**Constants (prototype v1.01):**

- Group Promo **$45/sf** on combined **priceable countertop + backsplash + FHB** (room engine rolls splash+FHB for matrix counter/backsplash split; simple path uses one group rate on total sf for legacy parity in demo — see implementation notes in code comments if divergent).
- Add-ons: kitchen sink cutout **$200**, cooktop **$150**, tear-out **$750**.
- Vanity tier threshold: **35 sq ft** qualifying countertop sf (non-vanity rooms).
- **Partner / demo wholesale** in this doc uses prototype **$45/sf …** tiers (`PROTOTYPE_TIERS`).
- **Public consumer (live API + `computePublicConsumerEstimatesByGroup`)** uses **ESF Direct $/sf** (`ESF_DIRECT_PRICE_PER_SQFT` / `ESF_DIRECT_TIER_RATES`) × planning markup (default **25%**), not prototype partner $/sf × 1.25 — see §9 and `quoteCalculator.js`.

> **Note:** Room-engine wholesale in the prototype is  
> `(counter + splash + fhb) * tier.p + roomExtras` per room, then summed.  
> The demo `runLocalPrototypeQuote` follows that pattern.

---

## 1. Manual: 45 counter + 12 splash, Group Promo, 1 sink, 1 cooktop

**Inputs**

- Measurement: Manual countertop **45**, backsplash **12** (sf).
- Material: **Group Promo** ($45/sf).
- Add-ons: `qty-sink = 1`, `qty-cook = 1`, no tear.

**Expected**

- Stone wholesale (material only): `(45 + 12) × 45 = 57 × 45 = 2565.00`
- Add-ons: `200 + 150 = 350.00`
- **Wholesale total:** `2565 + 350 = 2915.00`
- **Partner retail @ 20% markup:** `2915 × 1.20 = 3498.00`
- **Public consumer live totals (authoritative backend)** for the same geometry use **Direct** Promo **70** $/sf × **1.25** on stone and on add-ons → **5425.00** (not `2915 × 1.25`). The `2915 × 1.25` figure applies only to **partner-style wholesale** × protection, not to public consumer material rates.
- **Estimated priceable sf (material line quantity):** `57` sf (counter+splash combined in single material line for simple engine — verify line items in Math check).

---

## 2. Rapid linear: 20 LF wall cabinets, 25.5″ depth, 4″ splash, no island

**Inputs**

- Wall cabinets **20 LF**
- Splash height **4 in**
- Island **0 × 0**

**Formulas**

- Counter from wall: `20 × 2.125 = 42.50` sf (25.5″ = 2.125 ft).
- Backsplash: `20 × (4 / 12) = 6.666…` sf.

**Expected**

- Countertop sf: **42.50**
- Backsplash sf: **6.67** (rounded display; exact 20/3).
- Total scope sf: **49.17** (rounded two decimals).
- Group Promo stone only: `49.1666… × 45 ≈ 2212.50` (round to cents).

---

## 3. Rapid linear with island: 20 LF wall + 8 ft × 3.5 ft island

**Additional**

- Island **8 × 3.5 ft** → `28` sf countertop.

**Expected**

- Wall counter: **42.50** sf  
- Island counter: **28.00** sf  
- **Total counter:** **70.50** sf  
- Backsplash unchanged from case 2: **6.67** sf  
- Total scope: **77.17** sf (rounded)  
- Stone @ $45: `≈ 3472.50` (verify with app rounding).

---

## 4. Guided shape: L-shape preset (example dimensions)

Use two **rectangle** counter pieces:

- Piece A: **120 in × 25.5 in**
- Piece B: **96 in × 25.5 in**

**Formula**

- sf = `(L × D) / 144` per rectangle.

**Expected**

- A: `120 × 25.5 / 144 = 21.25` sf  
- B: `96 × 25.5 / 144 = 17.00` sf  
- **Total counter:** **38.25** sf  
- Stone @ Group Promo: `38.25 × 45 = 1721.25` (before add-ons).

---

## 5. Vanity tier — under 35 sq ft qualifying (Promo / Stock 100)

**Setup**

- One **Kitchen** room with enough counter to yield **qualifying sf &lt; 35** (e.g. manual **10** sf counter only).
- Second room: **Vanity**, size **31_S**, qty **1**, source **Promo / Stock 100**, program sink **$0**, bowl **$0**.

**Expected**

- Qualifying sf &lt; 35 → **tier 2** base for `31_S`: **$425** each (from prototype `t2`), total **425.00** for that vanity line before other rooms’ stone.

---

## 6. Vanity tier — at/over 35 sq ft qualifying

**Setup**

- Kitchen (or non-vanity) room: manual **40** sf counter (or equivalent guided/linear).
- Same vanity **31_S**, qty **1**, Promo path.

**Expected**

- Qualifying sf **≥ 35** → **tier 1** base: **$210** (`t1` for 31_S), total **210.00** for that vanity line (plus sink upcharges if any).

---

## 7. Public retail ≥ wholesale × 1.25

For any case with **public** mode:

\[
\text{retail} \geq \text{wholesale} \times 1.25
\]

**Expected**

- Math check shows **applied markup ≥ 25%** on wholesale baseline.
- Partner view may show lower internal wholesale; public view must **not** display wholesale numbers.

---

## 8. Public retail must not show wholesale

**Checklist (UI)**

- Toggle **Public retail**.
- Calculate with live API or fallback.
- Confirm **no** fields labeled wholesale, partner line economics, or matrix wholesale column appears.
- **Partner / internal** mode: **Math check** panel visible; public mode: **Math check hidden**.
- **Material group comparison:** In **Public retail**, the comparison table must **not** show rate, wholesale, or margin columns (only protected-style dollars). In **Partner / internal**, those columns are allowed.

---

## 9. Material group comparison matrix (fixed scope + add-ons)

**Purpose:** Validate `buildMaterialGroupComparison` — same countertop sf and backsplash sf priced at each tier’s **$/sf**, with **global add-ons applied once per group row** (not multiplied by tier).

**Inputs (manual measurement path)**

- Countertop sq ft: **45**
- Backsplash sq ft: **12**
- Kitchen sink cutouts: **1** ($200)
- Cooktop cutouts: **1** ($150)
- No tear-out.

**Tier rates — partner / prototype mirror** (`PROTOTYPE_TIERS` in `prototypeQuoteMath.ts`; used for partner-style comparison, not public consumer material.)

| Group       | $/sf |
|------------|-----:|
| Group Promo | 45 |
| Group A     | 57 |
| Group B     | 65 |
| Group C     | 75 |
| Group D     | 85 |
| Group E     | 100 |
| Group F     | 115 |

**Public consumer** material tiers use **`ESF_DIRECT_TIER_RATES`** (70, 77, 85, 95, 105, 120, 135) × `(1 + planning markup %)` — see `quoteCalculator.js` / `computePublicConsumerEstimatesByGroup`.

**Add-on bucket (same for every group row)**

- Direct add-on subtotal: `200 + 150 = 350.00` (cutout unit prices before planning markup)

**Per group — public consumer planning (authoritative backend)**

For each tier, Direct material $/sf \(d\) and markup factor \(f = 1.25\) when structure uses 25%:

\[
\text{countertop} = 45 \times d \times f,\quad
\text{backsplash} = 12 \times d \times f,\quad
\text{addons} = 350 \times f,\quad
\text{total} = \text{countertop} + \text{backsplash} + \text{addons}
\]

**Example — Group Promo** (\(d = 70\), \(f = 1.25\))

- Countertop: `45 × 70 × 1.25 = 3937.50`
- Backsplash: `12 × 70 × 1.25 = 1050.00`
- Add-ons: `350 × 1.25 = 437.50`
- **Public planning total:** `5425.00`

**Public retail row (UI)**

- Countertop, backsplash, and add-ons are each **Direct × markup** for that line type; they sum to the row total. This is not “partner prototype $/sf + total-level protection” and must not be labeled as wholesale to homeowners.

**Checks**

- **Public planning row** matches Direct × markup math for each tier (see `verifyPublicPlanningPricingSanity` in `quoteCalculator.js` and `checkQuotePublicParity.js`).
- **Public retail UI** must not show wholesale, internal Direct wording, or internal margin.
- **Partner / internal** comparison may still use the prototype $/sf table above where applicable.

---

## Backend vs local fallback parity test

**Goal:** When the browser cannot reach `POST /api/public-quote/calculate`, `app-quote` uses `computePublicConsumerEstimatesLocal` (`publicConsumerParity.ts`). That path must match **`computePublicConsumerEstimatesByGroup`** in `backend-core/src/quotes/quoteCalculator.js` for the same inputs when the server uses the **prototype mirror rules** (no DB, or DB miss → prototype fallback).

**Standard inputs**

- `areas.countertopSqft = 45`, `areas.backsplashSqft = 12`
- `addOns`: `qty-sink = 1`, `qty-cook = 1`, `tearout = 0`
- `engine = legacy`, `rooms = []`, `quoteSource = public_retail`

**Expected `estimates_by_group` (prototype mirror)** — seven rows (Group Promo through Group F). **Group Promo** example (run `node backend-core/src/scripts/checkQuotePublicParity.js` to regenerate):

| Field        | Value (rounded cents) |
|-------------|------------------------:|
| countertop | 3937.50 |
| backsplash | 1050.00 |
| addons     | 437.50 |
| total      | 5425.00 |
| total_display | 5430 (ceil to nearest $10 for homeowner UI, `quote_headers.grand_total`, Monday quote value) |
| countertop_display | 3940 |
| backsplash_display | 1050 |
| addons_display | 440 |

**Public display:** Homeowner UI and Monday long-text summary use **whole dollars, no cents**, with tier totals **rounded up to the nearest $10** (`Math.ceil(value / 10) * 10`). Internal exact line math remains on `countertop` / `total` fields.

**If live backend differs:** When Supabase returns active `quote_pricing_rules` with different cutout unit prices, live `estimates_by_group` may differ from the prototype script above. In that case the UI should still prefer the **server** numbers when the request succeeds; the local fallback only mirrors **prototype** economics.

**Manual curl (optional)**

```bash
curl -sS -X POST "http://localhost:3001/api/public-quote/calculate" \
  -H "content-type: application/json" \
  -d '{"quoteSource":"public_retail","materialGroup":"Group Promo","areas":{"countertopSqft":45,"backsplashSqft":12},"addOns":{"qty-sink":1,"qty-cook":1,"tearout":0},"engine":"legacy","rooms":[]}' | jq .
```

---

## Running checks

```bash
npm run build --prefix app-quote
npm run eos:check:local
```
