# eliteOS Quote / Partner Quoting Platform — Phase 0 Implementation Plan

**Source prototype:** `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html` (~4.4k lines, single HTML + embedded CSS + `<script>`).

**Strategy:** Preserve workflow and UX patterns from the prototype; move **pricing authority**, **persistence**, and **audit** to Supabase + `backend-core`. Do not rebuild UX from scratch in early phases.

---

## 1. Prototype map (structural)

| Region | Approx. lines | Role |
|--------|----------------|------|
| CSS / layout | 1–~1700 | Branding, print/PDF layout, responsive grids — reuse as reference for future Vite/React heads |
| HTML sections | ~1780–2200 | Partner/customer tracking, room engine toggles, material UI, quick modes, vanity/add-ons, pricing controls, readiness checklist, handoff, partner message, receipt/print panel |
| `<script>` config | ~2200–2360 | **`config` object**: `vanityTierThresholdSqFt`, `tiers[]` ($/sf by group), `materials[]` (100 colors → group), `vanityPricing`, `vanitySinkOptions`, `addOns[]`, `tearOut` |
| Core math & DOM | ~2360–4300 | `calculateQuote`, `calculateAllRooms`, `calculateRoom`, `calculateAreas`, `calculateVanities`, `calculateAddOns`, `calculateRetailFromWholesale`, readiness builders, receipt renderers, storage I/O |
| Persistence | ~4300–4463 | `localStorage` keys `esf_partner_estimate_v21_*`, export/import JSON, legacy prefix migration |

**Dual engines:** (A) **Legacy single-scope** — inches/linear/direct SF + piece list + global vanities/add-ons. (B) **Room-by-room** — `use-room-engine` checkbox; `calculateAllRooms` / `renderRoomEngineQuote` with per-room materials, FHB, add-ons, vanity rows.

---

## 2. Inventory: hardcoded pricing (must leave frontend)

| Data | Prototype location | eOS destination |
|------|-------------------|-----------------|
| Price groups Promo→F ($/sf) | `config.tiers` | `quote_pricing_rules` (`category` = `material_group`, `item_code` = group key) + `quote_pricing_structures` |
| 100 program colors → group | `config.materials[]` | Rules or separate `quote_program_materials` table (future); Phase 1 can seed rules only |
| Vanity SKU matrix (t1/t2/bowl mult.) | `config.vanityPricing` | `quote_pricing_rules` (`category` = `vanity`) |
| Vanity sink option $ | `config.vanitySinkOptions` | `quote_pricing_rules` (`vanity` / `sink`) |
| Cutouts, sinks, tear-out | `config.addOns`, `tearOut` | `quote_pricing_rules` (`cutout`, `hardware`, `tearout`, etc.) |
| Non-stock remnant $55/sf + $100 + bowl | `calculateRoom` vanity branch | Rules + formula metadata in `metadata` jsonb |
| FHB electrical cutouts $30 | `calculateRoom` | `quote_pricing_rules` |
| Retail methods | `getMarkupSettings` + `calculateRetailFromWholesale` | `quote_pricing_structures.retail_markup_percent` + structure `pricing_mode`; enforce **≥25%** for `public_retail` in backend |

---

## 3. Quote modes (prototype `estimate-mode`)

| Mode | Behavior to preserve |
|------|------------------------|
| Internal ESF Worksheet | Full wholesale matrix + internal notes |
| Partner Wholesale Estimate | Partner-facing wholesale emphasis |
| Customer Retail Quote | Hides wholesale matrix row pricing; shows retail column |
| Wholesale + Retail Worksheet | Side-by-side partner view |

**Mapping:** `quote_headers.quote_source` / `pricing_structure.pricing_mode` together determine which totals the API returns to the client (sanitized for `public_retail`).

---

## 4. Key calculation functions (preserve logic in `quoteCalculator.js`)

- `calculateAreas` / `getQuotedPieces` / triangle SF — legacy path.
- `calculateRoom` / `roomPieceSf` / `calculateAllRooms` / `roomAllGroupMatrix` — room engine.
- `tierByName` → resolve group $/sf from **rules**, not hardcoded `config.tiers`.
- `calculateVanities` / vanity container rows (legacy) + room vanity panel.
- `calculateAddOns` — global qty ids (`qty-sink`, …).
- `calculateRetailFromWholesale` → **`applyRetailProtection`** + partner markup from DB; **never** trust client totals.
- `buildReviewReadiness` / `buildRoomReadiness` — checklist scoring → store summary in `calculation_snapshot` + optional `quote_forecast_events` for “review score”.

---

## 5. Inputs & outputs to model in API + DB

**Inputs (normalized):** partner block, customer/project, rep/branch/type, valid days, prepared by, estimate mode & confidence, backsplash type, markup method/percent/flat, material selection or “all groups”, room list (type, name, material index/group, calc mode, pieces, FHB, add-ons, vanity options), global vanities (legacy), upgrade toggles, handoff block (edge, sink, faucet, appliance, files meta), review checkboxes, notes.

**Outputs:** wholesale line totals, retail totals, matrix (all groups), readiness status, warnings, partner message text, ESF handoff package text, terms — **all** in `calculation_snapshot` on persist.

---

## 6. localStorage / export/import

- **Keys:** `STORAGE_PREFIX` + `activeEstimateKey` (`EST-YYMMDD-HHMMSS-XXXX`).
- **Behavior:** `JSON.stringify` full serializable state; file import via `FileReader`.
- **eOS replacement:** `quote_headers` + child tables + optional `quote_files` (Supabase Storage paths, not base64 blobs in DB).

---

## 7. Monday.com (fields to map later)

| Prototype / eOS field | Monday column (suggested) |
|----------------------|---------------------------|
| quote_number | Name or custom |
| quote_status | Status |
| customer_name, project_name, project_address | Text columns |
| sales_rep, branch | People / dropdowns |
| partner_company | Link to partner board item |
| grand_total, estimated_sqft, material group | Numbers / text |
| estimate_confidence, quote_source | Labels |
| monday_board_id / monday_item_id | Stored on `quote_headers` after sync |

**Phase 4:** log-only sync stub; no live calls without env.

---

## 8. Forecasting / analytics (future consumption)

- Pipeline: counts by `quote_status`, aging = `now() - created_at`.
- Value: `grand_total` from snapshot at submit time.
- Rep/branch/partner: dimensions on `quote_headers` + `quote_forecast_events`.
- Bid/close: accepted vs rejected + submitted cohort.

---

## 9. Recommended new files (repository)

### Backend (`backend-core/src/`)

| File | Purpose |
|------|---------|
| `quotes/quoteCalculator.js` | Pure calculation + snapshot builder; optional DB rule injection |
| `quotes/quoteRoutes.js` | Express: `/api/quote/*`, `/api/admin/quote-*` |
| `quotes/quoteAnalytics.js` | Read models for dashboards |
| `integrations/mondayQuoteSync.js` | Payload builder + sync log + guarded API TODO |

### SQL

| File | Purpose |
|------|---------|
| `supabase/eos_quote_platform.sql` | Additive DDL (manual apply) |

### Docs (`docs/quote-platform/`)

| File | Purpose |
|------|---------|
| `PHASE0_IMPLEMENTATION_PLAN.md` | This document |
| `prototype-extraction.md` | Deep extraction checklist |
| `frontend-plan.md` | Heads/widgets roadmap |

### Future (not created in this pass)

| Path | Purpose |
|------|---------|
| `app-quote/` or `app-partner-quote/` + `app-public-quote/` | Vite heads |
| `backend-core/src/quotes/quoteRepository.js` | Typed Supabase accessors |

---

## 10. API routes (Phase 3)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/quote/calculate` | `requireAuth()` (v1) | Returns totals + `calculation_snapshot`; **recalculates**; optional `sanitizeForPublic` |
| POST | `/api/quote/submit` | `requireAuth()` | Recalc + insert header/rooms/lines/history/forecast/sync log stub |
| GET | `/api/admin/quote-pricing-structures` | admin + `system_admin` head | List structures |
| POST | `/api/admin/quote-pricing-structures` | admin + `system_admin` | Create structure |
| GET | `/api/admin/quote-partners` | admin + `system_admin` | List partner accounts |
| POST | `/api/admin/quote-partners/:id/pricing-assignment` | admin + `system_admin` | Assign structure |
| GET | `/api/admin/quotes` | admin + `system_admin` | List quotes (paginated) |
| GET | `/api/admin/quotes/:id` | admin + `system_admin` | Quote detail |

**Public unauthenticated calculate:** defer to Phase with rate limits + CAPTCHA; document in `frontend-plan.md`.

---

## 11. Migration sequence

1. Apply `eos_quote_platform.sql` (manual).
2. Seed `quote_pricing_structures`: at minimum `PUBLIC_RETAIL_DEFAULT` (mode `public_retail`, markup ≥25) and `PARTNER_ELITE_PROGRAM_V1` (mode `partner`).
3. Seed `quote_pricing_rules` from prototype `config` (tiers, add-ons, vanity matrix) — script or SQL insert pack.
4. Wire `quoteRoutes` in `server.js`.
5. Partner pilot: assign partners via `quote_partner_pricing_assignments`.
6. Build first React head consuming `/api/quote/calculate` (read-only).
7. Enable `/api/quote/submit` + Storage for files.
8. Monday: enable env + implement `syncQuoteToMonday` API portion.

---

## 12. Preserve exactly from prototype

- Room-by-room vs legacy toggle behavior.
- Vanity tier threshold (35 sf) and tier1/tier2 pricing **semantics** (numbers come from DB).
- Retail markup methods: pass-through, markup %, margin %, flat add — **server-side**.
- Readiness checklist item definitions and “missing” messages.
- Handoff field set (edge, backsplash, sink, faucet, appliance, template dates, cabinet readiness).
- Estimate confidence enum values.
- Partner selling “packages” narrative (Value/Core/Premium) for internal modes.
- Print/receipt information architecture (sections order).

---

## 13. Must move out of frontend

- All $ amounts in `config` and derived totals.
- `calculateRetailFromWholesale` final numbers for any persisted quote.
- Material group $/sf table.
- Partner-specific discounts/markups (future) — rule engine in DB.

---

## 14. Risks / gaps

- **100 colors** in one HTML array — migration size; consider CSV import pipeline.
- **File uploads** — prototype lists filenames only; production needs Supabase Storage + virus scan policy.
- **Public abuse** — anonymous quoting needs throttling.
- **Monday schema** — tenant-specific column IDs; map via config table later.
- **Dual calculation paths** — room vs legacy must stay in parity in `quoteCalculator` until legacy retired.

---

## 15. Non-goals (this initiative)

- Moraware job creation from quotes.
- Changing Sales Head, Sales Mapping, Identity Resolution, or Moraware sync.
- Live Monday writes without env + review.

---

## 16. Implementation status (Phases 1–7 delivered in-repo)

| Deliverable | Path |
|---------------|------|
| Additive SQL | `backend-core/supabase/eos_quote_platform.sql` |
| Calculator module | `backend-core/src/quotes/quoteCalculator.js` |
| HTTP routes | `backend-core/src/quotes/quoteRoutes.js` (wired from `server.js`) |
| Monday stub | `backend-core/src/integrations/mondayQuoteSync.js` |
| Analytics | `backend-core/src/quotes/quoteAnalytics.js` |
| Extraction doc | `docs/quote-platform/prototype-extraction.md` |
| Frontend plan | `docs/quote-platform/frontend-plan.md` |

**Checks:** `node --check` on new modules + `npm run eos:check:local` — **pass** (no `npm test` script in root `package.json`).
