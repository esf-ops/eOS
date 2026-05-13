# Quote engine parity audit — app-quote vs ESF Quoting Tool v1.01

**Source of truth (workflow + math):** `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html`  
**Current eOS demo head:** `app-quote/`  
**Backend calculator (authoritative long-term):** `backend-core/src/quotes/quoteCalculator.js`  
**Date:** 2026-05-11

This document is **Phase 1**: map what exists, what is missing, and how to converge without losing prototype behavior.

---

## 1. Current app-quote capabilities (after direction correction)

| Area | Status |
|------|--------|
| Public vs Partner / internal demo mode | Yes — public hides wholesale in UI |
| Supabase sign-in + live `POST /api/quote/calculate` | Optional |
| Client fallback when API unavailable | Yes — labeled “Demo calculation fallback” |
| **Quote workflow choice** | **Yes** — “How would you like to measure?” (manual sq ft, rapid linear, guided shape, room-by-room, upload/visualize placeholders) |
| **Measurement engine (ported formulas)** | **Partial in TS** — manual, rapid linear, guided rectangle/triangle sq ft, room-by-room aggregation, qualifying sf, vanity program paths aligned to prototype |
| **Room-by-room scope builder (React)** | **First pass** — add/remove rooms, name/type/group, measurement method per room, pieces, FHB modes, per-room add-ons + tear, vanity room type, simple layout preview |
| **All-group matrix + retail-from-wholesale (partner)** | **Local demo** — `prototypeQuoteMath.ts` mirrors `roomAllGroupMatrix` / `calculateRetailFromWholesale` patterns |
| **Math check panel** | **Partner only** — measurement breakdown, rates, vanity tier, wholesale/retail |
| Customer / project fields, submit preview | Yes |
| Monday / Moraware / unrelated heads | Not touched |

---

## 2. Original prototype capabilities (high level)

| Capability | Location in prototype (approx.) |
|------------|----------------------------------|
| **Legacy single-flow** calc modes: Guided (inch pieces), Rapid linear, Manual direct | `setCalcMode`, `calculateAreas` |
| **Room-by-room engine** toggle | `use-room-engine`, `isRoomEngineActive`, `calculateAllRooms` |
| **Per-room:** name, type, program color + manual group, raised bar, notes | `addRoom`, `toggleRoomPanels` |
| **Per-room measurement:** Guided Shape (presets L/U/Galley/Island + pieces), Rapid Linear, Manual | `room-calc-mode` panels |
| **Full-height backsplash (FHB):** Off / Manual sf / Guided pieces + electrical cutouts ($30 ea) | `room-fhb-*` |
| **Per-room add-ons + tear** | `room-addon-*` |
| **Vanity program:** Promo/Stock vs ESF Non-Stock remnant formulas | `calculateRoom` vanity branch |
| **Qualifying countertop sf** (excludes vanity rooms) for vanity tier | `roomQualifyingSf` |
| **Vanity tier threshold** (35 sq ft) | `config.vanityTierThresholdSqFt` |
| **All-group pricing matrix** | `roomAllGroupMatrix`, legacy `lastQuoteSnapshot.matrix` |
| **Selected color / Elite Program materials list** | `config.materials`, filters, `getSelectedMaterial` |
| **Material mode:** All Groups vs Selected Color | `material-mode` |
| **Partner markup methods** | `calculateRetailFromWholesale`, markup UI |
| **Customer retail quote vs internal modes** | `estimate-mode` |
| **Public retail narrative** (25%+ protection framing) | Copy + estimate modes |
| **Review readiness, lead quality, next steps** | `buildReviewReadiness`, `buildLeadQuality`, `buildNextSteps`, `buildRoomReadiness`, `buildRoomNextSteps` |
| **Customer follow-up message** | `buildFollowupMessage`, `buildRoomCustomerMessage` |
| **ESF handoff package / submission summary** | `buildSubmissionSummary`, `buildRoomSubmissionSummary`, file lists |
| **Layout visuals** | `buildQuoteVisual`, `renderRoomVisual` |
| **Packages (Value/Core/Premium)** | `buildPackages` |
| **Upgrades checklist** | `getUpgradeSelections` |
| **Persistence / estimate keys / storage** | `STORAGE_PREFIX`, `ensureEstimateKey`, etc. |

---

## 3. What is still missing or simplified in app-quote

| Gap | Notes |
|-----|------|
| Full **materials catalog** UI (hundreds of colors, filters) | Prototype has full `config.materials`; app-quote uses **group dropdown** per room until catalog is ported |
| **Legacy non–room-engine** path in one screen | Prototype keeps both; app-quote focuses on **unified room-draft model** (single “synthetic” room for simple methods) |
| **Global vanity rows** (legacy `v-row` container) | Prototype supports global vanities outside room engine; app-quote uses **vanity as room type** in room builder |
| **Handoff package UI** (sink/faucet/cooktop/edge/files) | Not ported — only measurement/pricing/math check in this phase |
| **Review readiness UI parity** | Logic exists in prototype; app-quote surfaces **warnings + math check** only |
| **Packages / upgrades** | Not in app-quote |
| **Persistence / PDF / print** | Not in app-quote |
| **AI takeoff / Visualize** | Placeholder cards only |
| **Island “Straight Run” preset** | Prototype `applyRoomPreset` has L, U, Galley, +Island; app-quote presets match subset (extendable) |
| **Triangle defaults / mixed units** | Rectangle + triangle supported in inches; **feet vs inches** UX not as rich as prototype |
| **Backend parity for complex rooms** | `quoteCalculator.js` `sumRoomsWholesale` supports `pieces` or sqft fields; **FHB** should be sent as splash-type pieces or merged into backsplash sqft for API until backend models FHB explicitly |

---

## 4. Original square-footage calculation paths

### 4.1 Guided Shape (legacy + per-room)

- Each piece: length `l` in, depth/height `d` in, shape `rect` or `tri`.
- **sf = (l × d) / 144**, triangle **÷ 2**.
- Counter vs splash vs FHB determined by **piece type** (`counter` / `splash` / `fhb`).
- **Defaults:** standard counter depth **25.5"** on presets; standard splash height **4"** on “+ Add Splash Piece”.

### 4.2 Rapid Linear Foot

- Wall cabinets **LF × 2.125** (25.5″ depth as **2.125 ft**) → countertop sf.
- Backsplash: **LF × (splashHeightIn / 12)**.
- Island: **length_ft × width_ft** (all feet) → countertop sf.

### 4.3 Manual Sq Ft

- Direct countertop sf and backsplash sf (per room or legacy direct fields).

### 4.4 Room-by-room

- Multiple `room-card` blocks; each has own measurement mode + FHB + add-ons.
- **Totals:** sum `counter`, `splash`, `fhb`, `extras` across rooms (`calculateAllRooms`).

### 4.5 Vanity program

- **Promo / Stock 100:** tier from **qualifying sf** vs threshold (35): `t1` vs `t2` from `config.vanityPricing[size]`, plus sink upcharge × bowl count `b`.
- **ESF Non-Stock:** width from vanity **name** prefix (inches), depth from field, **sf = (w × d) / 144**, price **((sf × 55) + 100 + bowl + rectangle upcharge) × qty** per prototype.

### 4.6 Full-height backsplash

- Manual sf and/or guided pieces in FHB panel; **$30 per electrical cutout** added to extras; template note strings in prototype.

### 4.7 Qualifying square footage

- Sum **non-vanity** rooms only:
  - Manual: countertop sf only.
  - Rapid: wall LF × 2.125 + island L×W.
  - Guided: sum **counter** pieces only (not splash/FHB).

---

## 5. Pricing paths in prototype

| Path | Behavior |
|------|----------|
| **All Groups** | Matrix: each tier `p` $/sf on priceable counter + splash (splash includes FHB sf for matrix row in room engine). |
| **Selected Color** | Resolves **group** from material row; filters matrix emphasis in UI. |
| **Customer Retail Quote** | Applies `calculateRetailFromWholesale` to wholesale totals for display. |
| **Partner / internal** | Wholesale economics + partner markup settings. |
| **Wholesale → retail** | Markup %, margin %, flat dollar add (`calculateRetailFromWholesale`). |
| **Public consumer planning** | `public_retail`: material uses **`ESF_DIRECT_PRICE_PER_SQFT`**; add-ons at Direct units; total = Direct subtotal × `(1 + markup%)` with **≥ 25%** floor (`MIN_PUBLIC_RETAIL_MARKUP`); not “prototype partner $/sf + protection”. |

---

## 6. Prototype functions — port / mirror status

| Function | Port status |
|----------|-------------|
| `calculateAreas` | Mirrored as **single-room synthetic drafts** + `measurementEngine` |
| `calculateQuote` | **Partial** — local `runLocalPrototypeQuote`; live path remains `quoteCalculator.js` |
| `calculateAllRooms` | Mirrored as `calculateAllRoomDrafts` in `prototypeQuoteMath.ts` |
| `calculateRoom` | Mirrored as `measureRoomDraft` |
| `roomQualifyingSf` | `qualifyingSfFromRoomDrafts` |
| `roomPieceSf` | `sfFromGuidedPiece` in `measurementEngine.ts` |
| `roomAllGroupMatrix` | `buildAllGroupMatrix` |
| `calculateVanities` | **Partial** — vanity-as-room covers program path; legacy global vanity rows not duplicated |
| `calculateAddOns` | Mirrored via shared add-on keys + tear; per-room + (for non–room-by-room) global add-ons in App |
| `calculateRetailFromWholesale` | `calculateRetailFromWholesaleSettings` |
| `buildReviewReadiness` | **Not ported** (handoff data not in app) |
| `buildRoomReadiness` | **Not ported** |
| `buildNextSteps` / `buildRoomNextSteps` | **Not ported** (warnings only) |
| `buildFollowupMessage` / `buildRoomCustomerMessage` | **Not ported** |
| `renderRoomVisual` / `buildQuoteVisual` | **Simplified** — compact SVG preview in `RoomScopeBuilder` |

---

## 7. Risk areas (math must be verified)

1. **Qualifying sf vs vanity tier** — must exclude vanity rooms and only count qualifying countertop sf; errors mis-price vanity tiers.
2. **FHB pricing** — prototype bills FHB at same $/sf as splash in `selected = (counter+splash+fhb)*tier.p`; ensure API serialization matches backend expectations.
3. **Non-stock vanity** — regex width from name, bowl + rectangle upcharge rules.
4. **Island depth warnings** — prototype adds notes when depth > 30" or bar/island width×12 > 30; informational only but should stay for parity.
5. **Public retail** — must never surface wholesale in UI; minimum 25% markup on backend for live API.
6. **Dual sources of truth** — `prototypeQuoteMath.ts` (demo) vs `quoteCalculator.js` (live); **drift risk** until shared package or generated constants.

---

## 8. Recommended implementation sequence

1. **Done:** Parity audit (this doc) + `quoteTypes` + `measurementEngine` + `prototypeQuoteMath` + room builder UI + math check + test case doc.
2. **Next:** Extract shared constants (tier $/sf, add-ons, vanity table) into a single module consumed by **both** `quoteCalculator.js` (via build step or shared JSON) and `app-quote` to prevent drift.
3. **Next:** Port `buildReviewReadiness` / `buildRoomReadiness` with minimal handoff fields (checkboxes only).
4. **Next:** Materials catalog + “Selected Color” UX wired to DB catalog tables.
5. **Next:** AI takeoff / Visualize integration per `docs/quote-platform/ai-takeoff-and-visualize-plan.md`.
6. **Ongoing:** Automated unit tests from `quote-math-test-cases.md` (numeric assertions).

---

## References

- Prototype: `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html`
- Backend: `backend-core/src/quotes/quoteCalculator.js`
- App: `app-quote/src/lib/measurementEngine.ts`, `prototypeQuoteMath.ts`, `RoomScopeBuilder.tsx`
