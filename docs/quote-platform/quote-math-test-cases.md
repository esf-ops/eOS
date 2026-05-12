# Quote math — manual test cases (prototype parity)

These cases validate **local demo math** (`app-quote/src/lib/prototypeQuoteMath.ts` + `measurementEngine.ts`) against the rules in **ESF Quoting Tool v1.01**. Run in the app by matching inputs, or add automated tests later.

**Constants (prototype v1.01):**

- Group Promo **$45/sf** on combined **priceable countertop + backsplash + FHB** (room engine rolls splash+FHB for matrix counter/backsplash split; simple path uses one group rate on total sf for legacy parity in demo — see implementation notes in code comments if divergent).
- Add-ons: kitchen sink cutout **$200**, cooktop **$150**, tear-out **$750**.
- Vanity tier threshold: **35 sq ft** qualifying countertop sf (non-vanity rooms).
- Public retail: **≥ 25%** markup over wholesale (demo uses **exactly 25%** when mode is public).

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
- **Public retail (25% min):** `2915 × 1.25 = 3643.75`
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

---

## Running checks

```bash
npm run build --prefix app-quote
npm run eos:check:local
```
