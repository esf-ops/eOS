# slabOS — Slab Inventory & Profit Engine Roadmap

**Status:** Planning only. No migrations, no UI, no sync pipeline exists yet beyond the read-only dry-run POC.
**Date:** 2026-06-04
**Category:** slabOS platform · Inventory · Profit Engine

---

## 1. Executive Summary

SlabCloud exposes structured slab inventory data through observable JSON endpoints. SlabCloud itself appears to be reading from the Slabsmith inventory database and surfacing it through its own manager UI. This means **eliteOS / slabOS can read the same structured data** — without scraping HTML, without automating login, and without a separate direct Slabsmith integration.

The long-term vision is:

```
SlabCloud / Slabsmith
    ↓  (JSON endpoints, backend-owned read)
slabOS inventory cache (Supabase, org-scoped)
    ↓
Internal Slab Inventory Head (staff search/filter/hold)
    ↓
Showroom / TV Display Channel (public-safe rotating cards)
    ↓
Quote-linked selection and holds (Internal Estimate / Quote Library)
    ↓
Customer SlabRoom (secure token-scoped slab selection/approval)
    ↓
Profit Engine (remnant monetization, procurement forecast, margin alerts)
```

**slabOS becomes the workflow and presentation layer.** SlabCloud/Slabsmith remains the inventory source of truth. eliteOS does not try to replace Slabsmith — it reads the normalized output and adds the workflow, intelligence, and customer experience layers on top.

---

## 2. Why This Matters

| Business driver | Current gap | slabOS benefit |
|----------------|-------------|----------------|
| Staff slab search | Dependent on SlabCloud UI, limited filter options | Internal head with material/color/rack/price-group filtering, purpose-built for ESF workflow |
| Estimator visibility | Estimators do not see live inventory during quoting | Future: "possible stock/remnant match" suggestions inside Internal Estimate |
| Showroom experience | No digital slab display; dependent on physical samples | Rotating showroom TV channel with customer-safe slab cards |
| Customer selection | Manual back-and-forth on slab choices | Future SlabRoom: secure quote-linked slab viewing, favoriting, and approval |
| Remnant monetization | Remnants are tracked in Slabsmith but not surfaced to sales workflows | Remnant match suggestions reduce waste and increase margin |
| Purchasing optimization | No demand forecast vs. current stock | Future: win-probability-weighted quote demand vs. inventory → purchase signal |
| Margin protection | No alerts for aging/low-stock/high-demand slabs | Future: margin alerts surfaced to Pricing Admin, not auto-pricing changes |

---

## 3. Current Discovery

### Observed endpoints (2026-06-04)

| Endpoint | Description |
|----------|-------------|
| `GET /api/materials/{companyCode}` | Materials/brand list |
| `GET /api/slabs/{companyCode}?type=Slab&edges=true` | Full slab/color summary |
| `GET /api/slabs/{companyCode}?name={Name}&type=Slab&edges=true` | Per-color slab detail records |

Company code `kbyd` was reachable **without credentials, cookies, or session tokens** during the POC run on 2026-06-04 (see `docs/eliteos/slabcloud-inventory-poc.md`).

> **Company code vs public slug:** The API company code is `kbyd`. The public inventory URL slug is `/inventory/esf/`. These are not the same — treat the company code as configurable (`SLABCLOUD_COMPANY_CODE`) and never assume the two are interchangeable.

### Dry-run results

**Capped run (`SLABCLOUD_MAX_DETAILS=10`, 2026-06-04):**
- Materials rows: **44**, Slab records: **30**, Distinct colors: **10**, Distinct materials: **6**, Warnings: **0**

**Full uncapped run (all colors, 2026-06-04):**
- Materials rows: **44**, Slab records: **384**, Distinct colors: **139**, Distinct materials: **23**, Warnings: **0**

All 23 materials and 139 distinct color names fetched and normalized successfully. No auth, no cookies, no writes.

> `count_for_color` is a group-level value repeated on every detail row for a color — do not sum it across rows. Actual slab count = `COUNT(DISTINCT external_slab_id)` per color in the cache.

### Field mapping

| SlabCloud field | Internal name | Notes |
|----------------|---------------|-------|
| `SlabID` | `external_slab_id` | UUID, appears stable |
| `InventoryID` | `inventory_id` | Slabsmith internal ID |
| `Name` | `color_name` | e.g. `"Alabaster"` |
| `Material` | `material_name` | e.g. `"ESF Quartz"`, `"Caesarstone"` |
| `Distributor` | `distributor` | e.g. `"ESF"` |
| `Price_Group` | `price_group` | e.g. `"B"` |
| `Thickness_Nominal` | `thickness_nominal` | e.g. `"3 cm"` |
| `Rack` | `rack` | e.g. `"79L"` |
| `Lot` | `lot` | e.g. `"5999-14"` |
| `Width_Actual` | `width_actual_m` + `width_actual_in` | Meters; convert × 39.3701. `2.0748 m ≈ 81.68 in` ✓ |
| `Length_Actual` | `length_actual_m` + `length_actual_in` | Meters; convert × 39.3701. `3.5227 m ≈ 138.69 in` ✓ |
| `UsableA` | `usable_a_raw` | Meaning uncertain — preserved raw |
| `UsableD` | `usable_d_raw` | Meaning uncertain — preserved raw |
| `count` | `count_for_color` | Count repeated on each detail row for the color group |

> **`count` semantics:** When fetching per-color detail records, `count` is repeated on every individual slab row. Do not sum `count` across detail rows for the same color — it will over-count. Resolve this before using the field for business logic.

### Known unknowns / open field questions

| Question | Status |
|----------|--------|
| Image URL pattern stable? | Guessed from `SlabID`; not verified |
| `status` / sold / held / available flags? | Not yet observed in sample |
| Remnant vs full slab distinction? | Not yet observed |
| Bookmatch / bundle metadata? | Not yet observed |
| `UsableA` / `UsableD` exact semantics? | Uncertain — raw preserved only |
| Sync timestamp / `updated_at` field? | Not yet observed |

---

## 4. Architecture Principles

These are non-negotiable guardrails for every phase:

1. **Backend owns the SlabCloud integration.** The fetch, normalization, and cache-write happen server-side only. No frontend code calls SlabCloud directly for production use.
2. **Cache before exposing.** Internal and public views read from the slabOS-owned normalized cache (Supabase), not from live SlabCloud queries.
3. **No cookies, no session tokens, no authorization headers.** If an endpoint ever starts requiring auth, stop and re-scope — do not implement login automation or session scraping.
4. **No writeback** to SlabCloud or Slabsmith until explicitly researched, approved, and scoped in a separate decision.
5. **No HTML scraping** of `manager.php` or any other page. JSON endpoints only.
6. **Public views expose customer-safe fields only.** Rack, lot, price group, inventory ID, cost, and staff workflow data are never surfaced to customers without explicit approval.
7. **Organization-scoped.** All cached slab data carries `organization_id` so multi-tenant use is safe from day one.
8. **All protected internal heads use the shared `EliteosTopbar`.** No one-off topbars (see `FEATURE_DECISIONS.md #64` and `SYSTEM_BLUEPRINT.md §15`).
9. **Confirm endpoint use with SlabCloud** before scheduling recurring automated fetches (see open questions below).

---

## 5. Phased Roadmap

### Phase 0 — SlabCloud Read-Only Dry-Run POC ✅ **(Complete 2026-06-04)**

**Goal:** Prove that SlabCloud JSON endpoints return usable structured data and that normalization + dimension conversion work correctly.

**Deliverables (done):**
- `backend-core/src/slabcloud/slabCloudClient.js` — read-only HTTP helpers
- `backend-core/src/slabcloud/normalizeSlabCloudInventory.js` — pure normalization
- `backend-core/src/slabcloud/slabCloudInventoryPoc.test.mjs` — unit tests (all passing)
- `backend-core/src/scripts/slabcloud/importSlabCloudInventoryPoc.js` — dry-run script
- `docs/eliteos/slabcloud-inventory-poc.md` — endpoint doc with full dry-run results
- `debug/slabcloud/slabcloud-inventory-dry-run.json` + `...-summary.json` — sample output (gitignored)

**Full uncapped dry-run result:** 44 materials · 384 slab records · 139 distinct colors · 23 distinct materials · 0 warnings.

**SlabCloud approval:** Verbal OK from Andrey for read-only internal use received 2026-06-04. Written confirmation preferred before scheduled production sync.

**No Supabase writes. No UI. No holds. No schema applied.**

---

### Phase 1 — slabOS Inventory Cache 🔄 **(In progress 2026-06-04)**

**Goal:** Create a Supabase-backed normalized slab inventory cache so internal heads have a stable, backend-owned data source.

**Trigger:** Dry-run output reviewed ✅. SlabCloud verbal approval received ✅. Written confirmation preferred before scheduled production sync.

**SQL schema:** `backend-core/supabase/eliteos_slabcloud_inventory_cache.sql` — **applied & verified in Supabase** (5 tables, RLS enabled).

**Persistence layer (built, write-gated):**
- `backend-core/src/slabcloud/slabCloudPersistence.js` — pure builders + orchestrator; writes only when `SLABCLOUD_CACHE_WRITE_ENABLED=1`
- `backend-core/src/slabcloud/slabCloudSync.js` — fetch → normalize → persist
- `backend-core/src/scripts/slabcloud/cacheSlabCloudInventory.js` — dry-run by default
- `backend-core/src/slabcloud/slabCloudPersistence.test.mjs` — mock-Supabase unit tests (all passing)

**Dry-run cache result (full, 2026-06-04):** would write 1 sync run · 384 raw records · 384 inventory · 44 materials · 384 images · 0 warnings. No Supabase writes performed.

**Remaining for Phase 1:** dry-run smoke ✅ → first manual gated write (reviewed) → SlabCloud written confirmation → optional scheduling. No UI, no holds, no inactive marking, no writeback.

**Image verification (built, write-gated):**
- `backend-core/src/slabcloud/slabCloudImageVerification.js` — HEAD (+ Range-GET fallback) checks; updates only `slab_images.image_status`; never downloads bytes; gated behind `SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1`
- `backend-core/src/scripts/slabcloud/verifySlabCloudImages.js` — dry-run by default
- `backend-core/src/slabcloud/slabCloudImageVerification.test.mjs` — mock Supabase + mock fetch (all passing)

> **✅ Resolved (2026-06-04):** the first dry-run found the original guessed image URL pattern returned **404 for all rows** because it used the SlabID UUID *as-is*. Manual browser/network inspection confirmed the real scheme reuses the **same SlabID but lowercased** in the URL path (`/slabs/{companyCode}/{lowercase-slabid}.jpg` / `…_thumb.jpg`); a HEAD probe of the lowercase URL returns `200` vs `404` for the uppercase one. `buildImageUrlGuesses()` now lowercases only the URL path segment (identity preserved). **Remaining step:** the persisted `slab_images` rows still hold pre-fix uppercase URLs, so a **write-enabled cache re-sync is required** to refresh them before image verification will report `ok`. The verification machinery itself works (cleanly reports `missing`); image display in Phase 2/3 is unblocked once the rows are refreshed.

**Potential tables (planning sketches — no SQL yet):**

| Table | Purpose |
|-------|---------|
| `slab_inventory` | One row per physical slab (normalized fields, org-scoped) |
| `slab_inventory_sync_runs` | Audit log of each sync/import run (status, record count, warnings) |
| `slab_inventory_raw_records` | Optional: raw JSON blobs for debugging/replay |
| `slab_materials` | Normalized material/brand catalog |
| `slab_images` | Guessed / confirmed image URLs per slab |

**Backend additions:**
- Scheduled or on-demand backend fetch → normalize → upsert to Supabase
- Sync run status tracking
- `organization_id` on all rows

**Guardrails:** Backend fetch only. No browser calls to SlabCloud. No writeback.

---

### Phase 2 — Internal Slab Inventory Head (`app-slab-inventory`)

**Goal:** A protected internal head giving staff better slab search and filtering than the current SlabCloud UI.

**Features:**
- Search / filter by material, color, price group, thickness, rack, distributor
- Slab cards with photos (once image URLs are confirmed)
- Slab detail page (internal fields visible: rack, lot, inventory ID, price group)
- Sync status / last-updated indicator
- Deep link back to SlabCloud page
- Staff-only access (protected head, shared `EliteosTopbar`)
- No customer-facing access in this phase
- No hold/reservation workflow in this phase

**Guardrails:** Reads from slabOS cache only. No live SlabCloud calls from the browser.

---

### Phase 3 — Showroom / TV Display Channel

**Goal:** Public or display-token slab channel, Arreya-style, for the ESF showroom TV.

**Features:**
- Fullscreen rotating slab cards
- Featured / promoted slabs
- Category / material filters
- QR code linking to slab detail or SlabRoom
- Customer-safe fields only (no rack, lot, price group, cost)
- Token-based access (display token, not per-user auth)
- No holds or interaction in this phase

---

### Phase 4 — Quote-Linked Slab Selections and Holds

**Goal:** Staff can attach a slab choice to a Quote Library quote and place a soft hold.

**Features:**
- Staff-initiated hold on a slab from the Internal Slab Inventory Head
- Hold state tracked in slabOS (not written back to Slabsmith yet)
- Hold expiration timer
- Audit log (who placed/released hold, when)
- Visible indicator on slab cards when held
- No automated Slabsmith writeback in this phase

**Guardrails:** slabOS hold state is its own record. Slabsmith/SlabCloud writeback is a separate future decision.

---

### Phase 5 — Customer SlabRoom

**Goal:** Secure customer-facing slab selection and approval experience, linked to their specific quote or job.

**Features:**
- Access via secure quote/job token (no customer account required initially)
- Customer sees only approved slabs for their job/material choice
- Favorite / select / request alternatives
- Approve a selected slab (staff review required before hold is confirmed)
- Customer-safe fields only
- Staff must review and confirm any customer selection

---

### Phase 6 — Profit Engine Recommendations

**Goal:** Surface data-driven recommendations to staff and Pricing Admin — starting with suggestions, not automatic changes.

See §6 below for full analysis.

---

## 6. Profit Engine Analysis

The following four capabilities represent the long-term profit value of owning the slab inventory layer. They are future goals — none should be built until the inventory cache (Phase 1) and internal viewer (Phase 2) are stable.

### A. Automated Remnant Monetization

**Best first profit feature** after Phase 1 and Phase 2 are done.

- After a job is templated/cut, Slabsmith records remnant dimensions.
- slabOS can cross-reference new quote square footage and material/color needs against available remnants.
- Initial behavior: **"Possible stock/remnant match found"** — a staff-facing suggestion only.
- Staff confirms; slabOS does not automatically allocate the remnant.
- Reduces waste, reduces material cost, increases margin on matched jobs.

**Not yet built. Requires:** inventory cache, internal viewer, reliable material/color capture on quotes.

### B. Predictive Procurement

Valuable but requires reliable data from multiple upstream sources before it is trustworthy.

- Formula: `quoted demand × estimated win probability − current inventory = forecasted purchase need`
- Requires: consistent material/color capture on quotes, win-rate history, inventory cache with accurate counts.
- Start by building the data pipeline; surface forecasts to purchasing staff for review — not auto-orders.

**Not yet built. Requires:** inventory cache, quote material linkage, win-rate data.

### C. Dynamic Margin Protection

Do not auto-change pricing. Start with alerts surfaced to Pricing Admin for human decision.

Candidate alerts:
- Low-stock / high-demand (specific color/material below threshold)
- Aging inventory / promotion eligible (slabs sitting long with no recent quote matches)
- Backorder/supplier note if available from SlabCloud

Pricing Admin must approve any actual price changes. Never auto-update pricing tables.

**Not yet built. Requires:** inventory cache, quote-to-inventory material linkage, Pricing Admin surface.

### D. Capacity-Aware Quoting

Long-term, low-priority until production capacity data is reliable.

- Idea: quote acceptance recommendations should account for current shop throughput.
- Requires: trusted production schedule from Moraware / Monday / Titans.
- Do not build until that data is trustworthy and Moraware Machines/scheduling integration is stable.

---

## 7. Recommended First Profit Feature

**Remnant / in-stock slab match suggestions for Internal Estimate.**

This is the highest-value, lowest-risk profit feature:
- Reduces material waste
- Increases margin on matched jobs without changing pricing
- Does not require customer-facing change
- Surfaces as a suggestion only, not an automatic allocation

**Prerequisite gate (must be true before building this):**
1. SlabCloud dry-run POC reviewed and endpoint use confirmed ✅ (dry-run done)
2. Inventory cache (Phase 1) exists and is populated
3. Internal Slab Inventory Head (Phase 2) is in production
4. Basic material/color/price-group matching is reliable in the cache

**Initial UX:**
- Inside Internal Estimate, a non-blocking suggestion panel:
  > _"Possible stock/remnant match found: 2 × Alabaster slabs on Rack 79L (≈82 × 139 in). Confirm with inventory."_
- Staff clicks to see the slab detail; staff manually confirms or dismisses.
- No automatic hold placed by Internal Estimate.

---

## 8. Public vs Internal Access Model

### Protected internal head (`app-slab-inventory`)

Staff-only. Uses shared `EliteosTopbar`. Behind standard eliteOS auth.

**Internal-only fields (never shown to customers):**
- Rack, Lot
- Inventory ID (raw Slabsmith InventoryID)
- Price Group (may be sensitive depending on pricing strategy)
- Cost / supplier margin data (if added later)
- Staff workflow notes
- Hold history and quote links
- Raw sync fields and debug data

### Public showroom (`app-slab-showroom` or display-token route)

Token-based display access; no per-user login required. Not linked to a customer account.

**Customer-safe fields:**
- Slab photo
- Color name
- Material / brand name
- Thickness
- Count / availability signal (e.g. "In stock", "Limited", not raw count)
- Broad category
- QR code to detail / SlabRoom

### Customer SlabRoom (Phase 5)

Secure quote/job-token access. Customer sees only their approved slab choices.

Customer sees: photo, color name, material, thickness, availability signal, action (favorite/select/request alternative).
Customer never sees: rack, lot, inventory ID, price group, cost, staff notes.

---

## 9. Data Model Sketch

**Planning-level entities only. No SQL yet.** These entities will be designed in a later implementation slice after dry-run output is reviewed and endpoint use is confirmed with SlabCloud.

| Entity | Key fields (sketch) | Notes |
|--------|--------------------|-|
| `slab_inventory` | `organization_id`, `external_slab_id`, `inventory_id`, `color_name`, `material_name`, `distributor`, `price_group`, `thickness_nominal`, `rack`, `lot`, `count_for_color`, `width_actual_m`, `length_actual_m`, `width_actual_in`, `length_actual_in`, `usable_a_raw`, `usable_d_raw`, `synced_at` | Core normalized table, one row per slab |
| `slab_images` | `external_slab_id`, `image_url`, `thumbnail_url`, `image_status`, `verified_at` | Separated to allow image-verify runs without touching slab rows |
| `slab_inventory_sync_runs` | `organization_id`, `started_at`, `finished_at`, `status`, `slab_count`, `warning_count`, `config_snapshot` | Audit log of every sync |
| `slab_inventory_raw_records` | `sync_run_id`, `external_slab_id`, `raw_json` | Optional: raw blobs for replay/debugging |
| `slab_materials` | `organization_id`, `material_name`, `distributor`, `slab_count` | Denormalized material catalog for filter UI |
| `slab_holds` | `organization_id`, `external_slab_id`, `held_by_user_id`, `held_at`, `expires_at`, `released_at`, `quote_id` | Phase 4 |
| `slab_quote_links` | `organization_id`, `quote_id`, `external_slab_id`, `selected_by`, `selected_at`, `status` | Phase 4 |
| `slab_display_channels` | `organization_id`, `channel_token`, `name`, `filter_config` | Phase 3 showroom tokens |
| `slab_customer_selections` | `quote_id`, `customer_token`, `external_slab_id`, `action`, `submitted_at` | Phase 5 SlabRoom |

> These are planning sketches. SQL, RLS policies, and migrations should be written in a separate implementation slice after dry-run output is reviewed.

---

## 10. Immediate Next Step

**The next implementation step is the read-only SlabCloud dry-run POC** — which has already been built and run (2026-06-04). Output is at `debug/slabcloud/slabcloud-inventory-dry-run.json`.

**Before proceeding to Phase 1 (Supabase cache):**
1. Review the dry-run JSON output for data quality and field completeness.
2. Confirm with SlabCloud that `/api/slabs/kbyd` is approved for ESF internal/automated use.
3. Resolve the open questions below.
4. Decide whether to schedule a recurring backend sync or start with on-demand sync.

**Do not build the inventory head, showroom, or SlabRoom until Phase 1 is stable.**

---

## 11. Open Questions for SlabCloud

Before scheduling recurring syncs or building any production integration:

| # | Question | Priority |
|---|----------|---------|
| 1 | Is `/api/slabs/kbyd` approved for ESF internal automated use? | **Critical** |
| 2 | Is `kbyd` our company code? (vs. public slug `/inventory/esf/`) | **Critical** |
| 3 | Is there an official API, feed, or export we should use instead? | High |
| 4 | ~~What is the correct image URL pattern per slab?~~ **Resolved 2026-06-04:** `/slabs/{companyCode}/{lowercase-slabid}.jpg` (+ `_thumb`). | ~~High~~ Done |
| 5 | Are image URLs stable (won't change if the slab is re-imported)? | High |
| 6 | Are status/availability/hold/sold flags available on slab records? | High |
| 7 | Are remnants available through the same endpoint? How to distinguish? | High |
| 8 | Is bookmatch / bundle metadata available? | Medium |
| 9 | Are `updated_at` / sync timestamps or webhooks available? | Medium |
| 10 | Are there rate limits on the JSON endpoints? | Medium |
| 11 | Is there an API plan, fee, or terms-of-service for programmatic access? | **Critical** |
| 12 | What do `UsableA` and `UsableD` measure exactly (mm²? cm²? something else)? | Medium |
| 13 | Does `count` on a detail record represent group count or individual slab count? | High |

---

## 12. Do-Not-Build-Yet List

The following are explicitly out of scope until the prerequisite phases are done and each item is scoped separately:

- Customer SlabRoom (Phase 5 — requires Phases 1–4)
- Public showroom / TV channel (Phase 3 — requires Phase 1–2)
- Supabase cache tables / migrations (Phase 1 — requires dry-run review + SlabCloud approval)
- Quote hold / slab reservation workflow (Phase 4)
- Payment / scheduling / customer approval flows
- AI recommendations or auto-allocation
- Slabsmith / SlabCloud writeback (any phase — requires explicit separate decision)
- Scraping `manager.php` or any HTML page
- Capacity-aware quoting (requires trusted Moraware/Titans data)
- Automated pricing changes (Pricing Admin must always approve)

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [`slabcloud-inventory-poc.md`](./slabcloud-inventory-poc.md) | Endpoint discovery, field map, safety notes for the Phase 0 POC |
| [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) | Dated decisions including #65 (dry-run POC) and #66 (this phased roadmap) |
| [`SYSTEM_BLUEPRINT.md`](./SYSTEM_BLUEPRINT.md) | System architecture, topbar rules, head checklist |
| [`eliteOS-master-head-map.md`](./eliteOS-master-head-map.md) | Head inventory and future head planning |
