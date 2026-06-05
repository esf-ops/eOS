# SlabCloud Inventory Integration — Read-Only Dry-Run POC

**Status:** POC complete · full dry-run succeeded · SQL **applied & verified in Supabase** · write-gated persistence layer built · image verification built (backend-only, write-gated).
**Date:** 2026-06-04 (POC) · 2026-06-04 (full dry-run + SQL draft) · 2026-06-04 (SQL applied + persistence layer) · 2026-06-04 (image verification)
**Owner module:** `backend-core/src/slabcloud/`

This document describes the first foundation for a future slabOS **Slab Inventory / showroom / SlabRoom** experience: a safe way to pull Elite Stone Fabrication's slab inventory out of SlabCloud's JSON endpoints and normalize it into a consistent internal shape.

> **This is a POC only.** It writes local JSON files and nothing else. See [Safety scope](#safety-scope) and [What is NOT built](#what-is-not-built).

---

## 1. Endpoint discovery

The SlabCloud manager page for ESF loads slab data through JSON endpoints (not just rendered HTML). We observed three useful ones:

| Purpose | Method + URL |
|---------|--------------|
| Materials list | `GET https://slabcloud.com/api/materials/{companyCode}` |
| Slab/color summary list | `GET https://slabcloud.com/api/slabs/{companyCode}?type=Slab&edges=true` |
| Per-color detail | `GET https://slabcloud.com/api/slabs/{companyCode}?name={Name}&type=Slab&edges=true` |

During the POC these were reachable for company code `kbyd` **without credentials, cookies, or tokens**. We discovered them by observing the existing JSON requests the manager page already makes — **not** by scraping HTML, automating login, or reusing a browser session.

### Company code vs public slug

- The observed **company code** is **`kbyd`**.
- The public inventory URL is **`/inventory/esf/`**.
- These are **not** the same value. The company code is treated as **configurable** (`SLABCLOUD_COMPANY_CODE`, default `kbyd`) and is **never hardcoded** across the modules. Do not assume `esf` works as the API company code.

---

## 2. Read-only POC scope

The integration:

- fetches the materials list,
- fetches the slab/color summary list,
- optionally fetches per-color detail records (`SLABCLOUD_FETCH_DETAILS=1`, default on),
- normalizes raw records into a consistent internal shape,
- converts meters → inches,
- guesses image URLs (but does not download them by default),
- writes two local JSON files.

It **never** writes to a database, **never** mutates external systems, and **never** sends auth/cookies.

---

## 3. Files

| File | Role |
|------|------|
| `backend-core/src/slabcloud/slabCloudClient.js` | Read-only HTTP helpers: URL builders, `fetchJson` (timeout + retry), `probeImage` (HEAD), `mapWithConcurrency`, high-level `fetchMaterials` / `fetchSlabSummary` / `fetchSlabDetail`. No cookies/auth — `assertNoAuthHeaders` actively rejects forbidden headers. |
| `backend-core/src/slabcloud/normalizeSlabCloudInventory.js` | Pure normalization: `metersToInches`, `normalizeSlabRecord(s)`, `buildImageUrlGuesses`, `extractDistinctColorNames`, `summarizeInventory`. No I/O. |
| `backend-core/src/slabcloud/slabCloudInventoryPoc.test.mjs` | Unit tests (pure, no network). |
| `backend-core/src/scripts/slabcloud/importSlabCloudInventoryPoc.js` | Dry-run script that orchestrates fetch → normalize → write local JSON. |
| `backend-core/src/slabcloud/slabCloudPersistence.js` | **Write-gated** Supabase persistence (pure builders + orchestrator). No writes unless `SLABCLOUD_CACHE_WRITE_ENABLED=1`. |
| `backend-core/src/slabcloud/slabCloudSync.js` | Orchestration: fetch → normalize → persist. Returns one summary object. |
| `backend-core/src/scripts/slabcloud/cacheSlabCloudInventory.js` | Cache script. Dry-run by default; writes to Supabase only with the gate enabled. |
| `backend-core/src/slabcloud/slabCloudPersistence.test.mjs` | Persistence unit tests (mock Supabase, no network). |
| `backend-core/src/slabcloud/slabCloudImageVerification.js` | **Write-gated** image URL verification (HEAD + Range-GET fallback). Updates only `slab_images` status. No bytes downloaded. |
| `backend-core/src/scripts/slabcloud/verifySlabCloudImages.js` | Image verify script. Dry-run by default; updates `slab_images` only with the gate enabled. |
| `backend-core/src/slabcloud/slabCloudImageVerification.test.mjs` | Image verification unit tests (mock Supabase + mock fetch). |

### NPM scripts

```bash
# Run the dry-run POC (writes debug/slabcloud/*.json)
npm run eos:slabcloud:inventory-poc

# Run the cache flow in dry-run mode (no Supabase writes)
npm run eos:slabcloud:cache

# Verify image URLs in dry-run mode (no DB writes; needs org id + Supabase creds)
SLABCLOUD_ORGANIZATION_ID=<org-uuid> npm run eos:slabcloud:verify-images

# Run the unit tests
npm run eos:test:slabcloud-inventory
npm run eos:test:slabcloud-cache
npm run eos:test:slabcloud-images
```

---

## 4. Environment variables

| Var | Default | Meaning |
|-----|---------|---------|
| `SLABCLOUD_BASE_URL` | `https://slabcloud.com` | API + image host base. |
| `SLABCLOUD_COMPANY_CODE` | `kbyd` | Configurable company code (NOT the `/inventory/esf/` slug). |
| `SLABCLOUD_TYPE` | `Slab` | `type` query param. |
| `SLABCLOUD_FETCH_DETAILS` | `1` | Fetch per-color detail records when `1`. |
| `SLABCLOUD_MAX_DETAILS` | _(none)_ | Safety cap on number of detail fetches (e.g. `10`). |
| `SLABCLOUD_CONCURRENCY` | `2` | Max parallel detail/image fetches. |
| `SLABCLOUD_VERIFY_IMAGES` | `0` | When `1`, best-effort HEAD-probe guessed image URLs. |
| `SLABCLOUD_TIMEOUT_MS` | `15000` | Per-request timeout. |

---

## 5. Field mapping

Raw SlabCloud fields → normalized record:

| Normalized field | Source | Notes |
|------------------|--------|-------|
| `external_source` | _(constant)_ | Always `"slabcloud"`. |
| `external_company_code` | config | e.g. `kbyd`. |
| `external_slab_id` | `SlabID` | |
| `inventory_id` | `InventoryID` | |
| `color_name` | `Name` | |
| `material_name` | `Material` | |
| `distributor` | `Distributor` | |
| `price_group` | `Price_Group` | |
| `thickness_nominal` | `Thickness_Nominal` | e.g. `"3 cm"`. |
| `rack` | `Rack` | |
| `lot` | `Lot` | |
| `count_for_color` | `count` | Count reported for the color group. |
| `width_actual_m` | `Width_Actual` | Meters (raw, parsed to number). |
| `length_actual_m` | `Length_Actual` | Meters (raw, parsed to number). |
| `width_actual_in` | derived | `Width_Actual × 39.3701`, rounded to 2 dp. |
| `length_actual_in` | derived | `Length_Actual × 39.3701`, rounded to 2 dp. |
| `usable_a_raw` | `UsableA` | **Preserved raw**, meaning uncertain. |
| `usable_d_raw` | `UsableD` | **Preserved raw**, meaning uncertain. |
| `image_url_guess` | derived | `/slabs/{companyCode}/{lowercase-slabid}.jpg` (SlabID lowercased in path; see §7). |
| `thumbnail_url_guess` | derived | `/slabs/{companyCode}/{lowercase-slabid}_thumb.jpg` (SlabID lowercased in path; see §7). |
| `image_status` | runtime | `unknown` unless image verification ran (`ok`/`missing`/`error`). |
| `raw` | _(whole record)_ | Untouched original for later mapping/debugging. |

Missing/null/garbage inputs normalize to `null` rather than throwing.

---

## 6. Dimension assumptions

- `Width_Actual` and `Length_Actual` appear to be **meters**. We convert with `meters × 39.3701` and round to 2 decimals. This matches the on-screen examples:
  - `2.07475210775013 m ≈ 81.68 in`
  - `3.52267981545561 m ≈ 138.69 in`
- `UsableA` / `UsableD` look like a metric/mm-style usable area/depth, but their exact semantics are **not confirmed**. We **preserve the raw strings** and do **not** interpret them.
- **None of these dimensions are used for quote pricing in this POC.**

---

## 7. Image URL assumptions

Image URLs are **derived** from the confirmed pattern (verified 2026-06-04, see §10b). The SlabID UUID is reused but **lowercased** in the URL path; the slab's identity (`external_slab_id`) is preserved unchanged.

- full: `https://slabcloud.com/slabs/{companyCode}/{lowercase-slabid}.jpg`
- thumb: `https://slabcloud.com/slabs/{companyCode}/{lowercase-slabid}_thumb.jpg`

By default the POC **does not download or even probe** images. With `SLABCLOUD_VERIFY_IMAGES=1`, it performs a **best-effort HEAD probe** (bounded concurrency, never fatal) and records `image_status` as `ok` / `missing` / `error`. It never downloads image bytes in bulk.

---

## 8. Output

Written to (both gitignored under `debug/`):

- `debug/slabcloud/slabcloud-inventory-dry-run.json` — full payload: config, endpoints, summary, warnings, materials, normalized slabs.
- `debug/slabcloud/slabcloud-inventory-summary.json` — small summary: counts + a few sample slabs.

### Capped live run (`SLABCLOUD_MAX_DETAILS=10`) — 2026-06-04

```
slabRecordCount: 30
distinctColorCount: 10
distinctMaterialCount: 6
materialsEndpointCount: 44
summedSlabCount: 118
warnings: 0
```

### Full uncapped run (all colors) — 2026-06-04

```
materialsEndpointCount: 44
slabRecordCount: 384 (source: detail)
distinctColorCount: 139
distinctMaterialCount: 23
summedSlabCount: (not summed — count_for_color is group-level, not per-row)
warnings: 0
```

No auth, no cookies, no writes. All 23 materials and 139 distinct colors successfully fetched and normalized. Zero warnings across the full uncapped run.

> **count_for_color semantics:** The `count` field is repeated at the color-group level on every detail row for the same color. Summing it across rows will over-count. Actual slab count = number of distinct `external_slab_id` rows per color in the cache.

---

## 8a. SlabCloud API approval

**Verbal confirmation received 2026-06-04:** Andrey (SlabCloud) verbally approved read-only internal use of the `/api/slabs/kbyd` and `/api/materials/kbyd` endpoints for ESF/slabOS.

**Written confirmation is still preferred** before:
- Scheduling recurring automated syncs against production Supabase
- Building a public showroom or customer SlabRoom that depends on this data path

No rate limits, fees, or API plan requirements were mentioned, but these remain open questions to confirm in writing.

---

## 9. Safety scope

- **Read-only.** GET (plus optional HEAD for image probing) only.
- **No cookies, no PHPSESSID, no Authorization headers, no tokens.** `assertNoAuthHeaders` throws if any are present.
- **No HTML scraping, no login/session automation.** JSON endpoints only.
- **No Supabase writes, no migrations.**
- **No writeback** to SlabCloud or Slabsmith. **No holds/reservations.**
- Request **timeout**, simple **retry** for transient errors (429/5xx/network), and **low concurrency** for detail/image fetches.
- A clear, honest **User-Agent** (`eliteOS-SlabCloud-POC/...`).
- The run only aborts if the **initial summary list** can't be fetched; other endpoint errors are recorded as `warnings` and the run continues.
- No secrets are read or written.

> **If this ever starts requiring cookies, auth headers, scraping `manager.php` HTML, or browser automation — stop.** That is out of scope for this POC and must be re-scoped (likely a backend-owned, approved integration), not bolted on here.

---

## 10. What is NOT built

Explicitly out of scope for this POC:

- Slab Inventory head (`app-slab-inventory`)
- SlabRoom customer portal
- Showroom TV channel
- QR code display
- Quote / slab hold workflow
- Slabsmith writeback
- Payments / scheduling / customer approval
- AI recommendations
- Supabase cache tables / migrations

---

## 10a. Supabase persistence (Phase 1 — write-gated)

The cache SQL (`backend-core/supabase/eliteos_slabcloud_inventory_cache.sql`) has been **applied and verified in Supabase**. RLS is enabled on all five tables. The persistence layer that writes into them is built and **gated behind `SLABCLOUD_CACHE_WRITE_ENABLED=1`**.

**Write-gate behavior:**
- Default (gate off): the cache flow fetches + normalizes (read-only) and reports `would_write` counts. **No Supabase insert/upsert/update calls are made.**
- Gate on (`SLABCLOUD_CACHE_WRITE_ENABLED=1`): persists to the cache. Requires `SLABCLOUD_ORGANIZATION_ID`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; fails loudly if any are missing.

**Write order:** create `slabcloud_sync_runs` (running) → insert `slab_inventory_raw_records` (all records, incl. missing slab id) → upsert `slab_inventory` (records with `external_slab_id` only) → upsert `slab_materials` → upsert `slab_images` (`image_status=unknown`) → update sync run (completed). On error the run is marked `failed`.

**Phase 1 guarantees:** no deletes, no inactive marking (`slab_deactivated_count` always 0), no writeback to SlabCloud/Slabsmith, every payload carries `organization_id`, `count_for_color` stored as-is (never summed).

**Cache env vars (in addition to the read-only vars in §4):**

| Var | Default | Meaning |
|-----|---------|---------|
| `SLABCLOUD_CACHE_WRITE_ENABLED` | _(off)_ | Must equal `1` to write to Supabase. |
| `SLABCLOUD_ORGANIZATION_ID` | _(none)_ | Required only when writing. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | _(none)_ | Service-role config, required only when writing. |

**Rollout sequence:** dry-run smoke first → manual single write with the gate enabled (reviewed) → then consider scheduling. **No scheduled automation exists yet. No UI exists yet.**

---

## 10b. Image URL verification (separate from inventory sync)

Image verification is a **separate** backend step from the inventory sync — it never re-fetches or mutates inventory. It reads `slab_images` rows for an organization, verifies the URLs, and (behind its own gate) updates only `slab_images.image_status` + timestamps.

**How it checks:** HEAD request first; a lightweight `Range: bytes=0-0` GET fallback **only** when the server reports HEAD is unsupported (405/501). **No image bytes are ever downloaded or stored** — the response body is canceled. Bounded concurrency (default 3), per-request timeout, no cookies/auth.

**Statuses:** `ok` (2xx) · `missing` (404/410) · `error` (other/timeout/network) · `skipped` (row has no URL). Only `slab_images` is updated; `slab_inventory` is never touched; no rows are created or deleted; no slab is marked inactive.

**Write gate:** `SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED=1` (exactly). Off by default → checks run and report would-update counts but **no DB writes**. Reading Supabase requires `SLABCLOUD_ORGANIZATION_ID` + service-role config regardless of the gate.

**Env vars:**

| Var | Default | Meaning |
|-----|---------|---------|
| `SLABCLOUD_IMAGE_VERIFY_WRITE_ENABLED` | _(off)_ | Must equal `1` to update `slab_images`. |
| `SLABCLOUD_ORGANIZATION_ID` | _(none)_ | Required (Supabase read scope). |
| `SLABCLOUD_IMAGE_VERIFY_LIMIT` | `50` | Max rows per run. |
| `SLABCLOUD_IMAGE_VERIFY_CONCURRENCY` | `3` | Parallel checks. |
| `SLABCLOUD_IMAGE_VERIFY_STATUS` | `unknown` | Row filter (`all` = no filter). |
| `SLABCLOUD_IMAGE_VERIFY_KIND` | `thumbnail-first` | `thumbnail-first` / `image-first` / `thumbnail` / `image`. |

### First dry-run finding (2026-06-04): uppercase guess returned 404

The first dry-run verified 50 `unknown` rows (`thumbnail-first`): **0 ok · 50 missing · 0 error**, all clean `HEAD 404`. A follow-up `image-first` check of 10 rows was also **10 missing (404)**.

This proved the *original* guess (`/slabs/{companyCode}/{SlabID}.jpg`, using the SlabID **as-is**) was not the real scheme, and confirmed the verification tooling was working correctly (it cleanly classified them as `missing`).

### ✅ Resolved (2026-06-04): correct pattern uses a LOWERCASED SlabID

Manual browser/network inspection confirmed the real scheme reuses the **same** SlabID UUID but **lowercased** in the URL path:

- `https://slabcloud.com/slabs/{companyCode}/{lowercase-slabid}.jpg`
- `https://slabcloud.com/slabs/{companyCode}/{lowercase-slabid}_thumb.jpg`

Example — SlabID `437D9CA4-76B0-453B-BDE9-9007FFC44C5A`:

| URL | HEAD |
|-----|------|
| `…/slabs/kbyd/437D9CA4-…C5A.jpg` (old, uppercase) | `404` |
| `…/slabs/kbyd/437d9ca4-…c5a.jpg` (new, lowercase) | `200` |

`buildImageUrlGuesses()` now lowercases **only the URL path segment**; the slab's identity (`external_slab_id`) is preserved unchanged. The `image_url_pattern` key is intentionally kept stable (`slabcloud_slab_jpg`) so a re-sync **upserts the existing `slab_images` rows in place** (correcting the stored URL casing and resetting `image_status` to `unknown`) rather than creating duplicate rows under a new pattern key.

**Note — existing rows are stale:** the `slab_images` rows currently persisted in Supabase were written before this fix and still hold uppercase URLs (a no-write re-verify of 20 rows after the code fix still reported **20 missing**, because verification reads the *stored* URLs, not freshly-generated ones). A **cache sync (write-enabled) must be re-run** to refresh `slab_images` with lowercase URLs before image verification will report `ok`.

---

## 11a. Manager-scope diagnostic (2026-06-05)

### Discovery: ESF manager URL vs. API company code

The public ESF manager page is:

```
https://slabcloud.com/inventory/esf/manager.php
```

But the **browser console** on that page logs:

```
company    kbyd
edges      true
showZoom   true
filterOpen true
measure    true
```

This confirms:
- The API company code is **`kbyd`** — NOT `esf`.
- `/inventory/esf/` is a public display slug, not the API company code.
- **Do NOT change `SLABCLOUD_API_COMPANY_CODE` to `esf`.**
- Image assets also confirm `kbyd`: `/slabs/kbyd/{lowercase-uuid}(_thumb)?.jpg`

### Missing inventory hypothesis

The current slabOS sync fetches **`type=Slab`** only. The manager page supports:
- Any Type
- Full Slabs
- Remnants
- Min Length / Min Width filters

Missing slabs from the cache may come from **Remnant** or **Full Slab** type variants that our sync does not currently request. This is distinct from a company-code mismatch.

### Diagnostic tooling

Added: `backend-core/src/scripts/slabcloud/compareSlabCloudManagerScopes.js`

Probes all known type/filter variants read-only:

| Variant | URL |
|---------|-----|
| Materials | `/api/materials/kbyd` |
| Slab (current) | `/api/slabs/kbyd?type=Slab&edges=true` |
| Remnant | `/api/slabs/kbyd?type=Remnant&edges=true` |
| Full Slab | `/api/slabs/kbyd?type=Full%20Slab&edges=true` |
| Full Slabs | `/api/slabs/kbyd?type=Full%20Slabs&edges=true` |
| All | `/api/slabs/kbyd?type=All&edges=true` |
| No type (edges only) | `/api/slabs/kbyd?edges=true` |
| No params | `/api/slabs/kbyd` |

Also: per-name detail sampling, optional HAR UUID comparison, optional Supabase read-only comparison.

```bash
# Run the diagnostic (read-only, no writes)
npm run eos:slabcloud:manager-scope-diagnostic

# With HAR comparison:
SLABCLOUD_PUBLIC_HAR_FILE=/path/to/esf-manager.har npm run eos:slabcloud:manager-scope-diagnostic

# With HAR + Supabase read-only comparison:
SLABCLOUD_PUBLIC_HAR_FILE=/path/to/har \
  SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run eos:slabcloud:manager-scope-diagnostic

# Run unit tests
npm run eos:test:slabcloud-manager-scope
```

Output: `debug/slabcloud/slabcloud-manager-scope-diagnostic.json`

### Magnify / measure UX note

`measure=true` and `showZoom=true` in the manager config indicate the manager page has a zoom/measurement UI. This is **UX inspiration only** — do NOT copy or reverse-engineer `manager.js`. Any slabOS measurement UI must be an original eliteOS design.

### Next steps before any sync change

1. Run `npm run eos:slabcloud:manager-scope-diagnostic` and review the JSON output.
2. Confirm which type variants return distinct SlabIDs not in the current `type=Slab` sync.
3. Decide whether a second sync lane (separate type) is warranted — **do not add without operator review**.
4. Update `SLABCLOUD_INVENTORY_TYPES` (or equivalent config) only after review.

---

## 11b. Full inventory scope upgrade — Slabs + Remnants (2026-06-05)

**Status:** Backend pipeline upgraded · SQL draft written (not yet applied) · dry-run tested.

### Diagnostic findings confirmed

The manager-scope diagnostic (section 11a) proved:

| Endpoint | Row count |
|----------|-----------|
| `/api/slabs/kbyd?type=Slab&edges=true` | 145 summary rows |
| `/api/slabs/kbyd?type=Remnant&edges=true` | 689 summary rows |
| `/api/slabs/kbyd?edges=true` (bare — **all inventory**) | **742 rows** |
| `/api/slabs/kbyd?type=Full%20Slab` or `type=All` | 0 rows (not supported) |

The current `type=Slab` sync was capturing only ~20% of the full public ESF catalog. **Missing inventory is a type/scope filter gap, not a company-code error.**

### Config model (separate concepts)

| Env var | Default | Purpose |
|---------|---------|---------|
| `SLABCLOUD_PUBLIC_SLUG` | `esf` | Public URL slug (for traceability — not used in API requests) |
| `SLABCLOUD_API_COMPANY_CODE` | `kbyd` | Code used in API requests `/api/slabs/{code}` |
| `SLABCLOUD_ASSET_COMPANY_CODE` | same as API code | Code in image URL paths `/slabs/{code}/{uuid}.jpg` |
| `SLABCLOUD_INVENTORY_SCOPE` | `slab` | `slab` → `type=Slab&edges=true` · `remnant` → `type=Remnant&edges=true` · `all` → no type param |
| `SLABCLOUD_COMPANY_CODE` | `kbyd` | Legacy alias → maps to `SLABCLOUD_API_COMPANY_CODE` |

### New source fields

Every normalized record now carries:

| Field | Example | Notes |
|-------|---------|-------|
| `source_inventory_type` | `Slab`, `Remnant`, `null` | From fetch config or raw `record.Type`; null when bare endpoint |
| `source_inventory_scope` | `slab`, `remnant`, `all` | Scope used during this sync run |
| `source_public_slug` | `esf` | Public URL slug |
| `source_api_company_code` | `kbyd` | API company code |
| `source_asset_company_code` | `kbyd` | Asset/image CDN code |

The DB also gets a **generated** `is_remnant boolean` column (COALESCE to false for old rows).

### SQL migration required before write-enabled all-scope sync

File: `backend-core/supabase/eliteos_slabcloud_inventory_scope_upgrade.sql`

Apply manually in the Supabase SQL editor. The migration:
- Adds new columns to `slab_inventory`, `slab_inventory_raw_records`, `slabcloud_sync_runs`, `slab_images`.
- Adds `is_remnant` as a `GENERATED ALWAYS AS` column.
- Adds 4 indexes for type-filtered queries.
- No DML, no deletes, no RLS changes.
- All `ALTER TABLE` statements are idempotent (`IF NOT EXISTS`).

### Dry-run all-scope

```bash
# Dry-run all-scope (safe — no writes, no SQL apply needed)
SLABCLOUD_INVENTORY_SCOPE=all \
  SLABCLOUD_API_COMPANY_CODE=kbyd \
  SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
  SLABCLOUD_PUBLIC_SLUG=esf \
  npm run eos:slabcloud:cache
```

### Future capped write-enabled all-scope smoke (do not run until SQL applied)

```bash
SLABCLOUD_CACHE_WRITE_ENABLED=1 \
  SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  SLABCLOUD_INVENTORY_SCOPE=all \
  SLABCLOUD_API_COMPANY_CODE=kbyd \
  SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
  SLABCLOUD_PUBLIC_SLUG=esf \
  SLABCLOUD_MAX_DETAILS=20 \
  npm run eos:slabcloud:cache
```

---

## 11c. Typed full-inventory sync — Slab + Remnant lanes (2026-06-05)

**Status:** Typed mode built · dry-run confirmed · zero overlap found · capped write smoke is next.

### Why typed

| Scope | Rows | Type known? |
|-------|------|-------------|
| `slab` | ~145 summary / ~401 with details | Yes — Slab |
| `remnant` | ~689 summary / ~1,278 with details | Yes — Remnant |
| `all` | ~742 summary / ~1,683 with details | **No** — bare endpoint has no Type field |
| `typed` | Two fetches merged — **1,679 total** | **Yes — each row tagged Slab or Remnant** |

The future Slab Inventory color modal needs tabs (All / Full slabs / Remnants). This requires typed inventory rows. `typed` is the preferred production scope.

### Typed dry-run results (ESF / kbyd, 2026-06-05)

```
Slab lane:    401 records (via ?type=Slab&edges=true + detail fetches)
Remnant lane: 1,278 records (via ?type=Remnant&edges=true + detail fetches)
Total:        1,679 normalized records
Distinct SlabIDs: 1,679
Overlap across lanes: NONE (clean — safe to write)
Distinct colors: 740   Distinct materials: 44   Warnings: 0
```

### Overlap safety rule

Write-enabled typed sync **aborts before any DB write** if any `external_slab_id` appears in both the Slab and Remnant lane responses. The error carries the full `overlapResult` for diagnosis. Dry-run proceeds with a warning instead.

**ESF / kbyd confirmed clean:** No overlapping physical SlabIDs exist across lanes.

### Dry-run command

```bash
SLABCLOUD_INVENTORY_SCOPE=typed \
  SLABCLOUD_API_COMPANY_CODE=kbyd \
  SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
  SLABCLOUD_PUBLIC_SLUG=esf \
  npm run eos:slabcloud:cache
```

### Future capped write-enabled typed smoke (do not run until review complete)

```bash
SLABCLOUD_CACHE_WRITE_ENABLED=1 \
  SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  SLABCLOUD_INVENTORY_SCOPE=typed \
  SLABCLOUD_API_COMPANY_CODE=kbyd \
  SLABCLOUD_ASSET_COMPANY_CODE=kbyd \
  SLABCLOUD_PUBLIC_SLUG=esf \
  SLABCLOUD_MAX_DETAILS=20 \
  npm run eos:slabcloud:cache
```

---

## 11. Future path

Dry-run reviewed · SlabCloud verbal approval received · SQL applied · persistence built (write-gated) · all-scope + typed sync built. Next steps:

1. ~~Apply `backend-core/supabase/eliteos_slabcloud_inventory_scope_upgrade.sql`~~ — **done**.
2. ~~Run all-scope dry-run~~ — done (742 records).
3. Run capped write-enabled **typed** smoke (1,679 records, zero overlap confirmed). See §11c.
4. After typed write smoke passes, run full typed write without `SLABCLOUD_MAX_DETAILS` cap.
5. Obtain SlabCloud **written confirmation** of API use before any scheduled production sync.
6. Update `app-slab-inventory` API to filter by `source_inventory_type`; update UI for Remnant tab.
7. Plan Elite 100 / Non-Stock tab scoping once typed inventory is in production.

A real head must use **backend-owned cached data**, **never** direct browser calls to SlabCloud.

See [`slabos-slab-inventory-profit-engine-roadmap.md`](./slabos-slab-inventory-profit-engine-roadmap.md) for the full phased plan.

---

## 12. Color-program read API (typed aggregation)

### Summary

After the typed sync landed (§10 / Decision #74), the backend now surfaces a **color-level read API** that aggregates the typed inventory into one card per `(color_name, material_name, source_price_group)` combination.

### New endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/slab-inventory/color-programs` | One card per color/material/price-group — totals, slab vs remnant counts, verified photo count, representative image |
| `GET /api/slab-inventory/colors/:colorKey/inventory` | Physical slab + remnant rows for one color group; supports `?type=all\|slab\|remnant`, `?image_status=ok`, `?active_only=false` |

### Color key behavior

`color_key` is a stable, deterministic slug computed by `makeColorKey(color_name, material_name, price_group)`:

```
slugify(colorName) + "--" + slugify(materialName) + "--" + slugify(priceGroup)
```

- `slugify` lowercases + trims + collapses non-alphanum runs to a single `-`.
- Segments use `"unknown"` when the source value is null/empty.
- Not a DB ID — not reversible. Same inputs always produce the same key.
- Example: `"Alabaster", "ESF Quartz", "B"` → `"alabaster--esf-quartz--b"`.

### Aggregation behavior

- Typed rows only: `is_active = true`, `source_inventory_scope = 'typed'`, `source_inventory_type IN ('Slab', 'Remnant')`.
- 10 legacy/null-scope rows are ignored in aggregation (no deletion, no mutation).
- `count_for_color` is never read, never summed. Counts are physical row counts only.
- `slab_count` / `remnant_count` come from `source_inventory_type` per row.
- `verified_photo_count` counts slab_images rows with `image_status = 'ok'`.
- `representative_image_url` is the first verified (`ok`) image found in the group; `null` if none.

### Price group order

Active ESF groups: **Promo, A, B, C, D, E, F** — in that order. Unknown/other (including Group G) sort after F.

Group G is not included in the current default sort order. Data is preserved but sorts to the "other" bucket.

### program_status placeholder

All cards return `program_status = "unclassified"`. Elite 100 classification requires a future catalog/override layer (see Decision #75). No Elite 100 membership logic was built in this slice.

### Source price group rule

`source_price_group` on every card and row is the **imported SlabCloud price group** — NOT slabOS pricing authority. Label: "Source price group". No override UI was added.

### Safety contracts

- Both endpoints are GET-only. No mutations to `slab_inventory`, no write-back to SlabCloud.
- Both require `requireAuth()` + `requireHeadAccess("slab_inventory")` + `organization_id` scope.
- Service-role Supabase client only — no direct browser reads.
- `COLOR_INVENTORY_SELECT_COLUMNS` never includes `count_for_color`, `raw_json`, `usable_*`, or meter columns.

See `FEATURE_DECISIONS.md §75` for the full decision record.

---

## 13. Elite 100 editable color catalog + fuzzy matching foundation

### Summary

The backend/data foundation for classifying SlabCloud color groups into Elite 100 vs. Non-Stock is now in place. This must happen before building the Elite 100 carousel UI.

### New files

| File | Purpose |
|------|---------|
| `backend-core/supabase/eliteos_slab_inventory_color_catalog.sql` | SQL draft — 4 catalog tables |
| `backend-core/src/slabInventory/fixtures/elite100-2026.json` | 100-color fixture (transcribed from screenshot) |
| `backend-core/src/slabInventory/colorProgramMatching.js` | Pure matching helpers |
| `backend-core/src/scripts/slabInventory/importElite100Catalog.js` | Dry-run import script |
| `backend-core/src/scripts/slabInventory/previewElite100Matches.js` | Match preview script |
| `backend-core/src/slabInventory/colorProgramMatching.test.mjs` | 18 pure-unit test suites |

### New SQL tables (draft — not yet applied)

- **`slab_color_collections`** — versioned collection records (e.g. `elite100-2026`). `is_active=false` by default; operator activates after verifying.
- **`slab_color_catalog_items`** — individual color entries. `price_group` constrained to Promo/A/B/C/D/E/F. Group G not allowed.
- **`slab_color_aliases`** — alternate spellings / source-system name variants for alias matching.
- **`slab_color_program_match_reviews`** — per-color match result records with `match_method` (exact/alias/fuzzy/manual/none) and `review_status` (approved/needs_review/rejected).

All four tables have RLS enabled with no permissive policies (service-role only).

### Fixture transcription notes (9 items flagged for Chris's review)

| Group | Item | Note |
|-------|------|------|
| A | Wiscon White | Possible truncation — may be "Wisconsin White" |
| B | Belezza | Possible spelling — may be "Bellezza" |
| B | Regal D'Oro | Apostrophe encoding — verify matches SlabCloud source |
| C | Aurataj | Unusual name — verify from Q Quartz product list |
| C | Macavella | Unusual name — verify from ASMI product list |
| D | Larvic | Possible spelling — may be "Larvik" |
| D | Solitaj | Unusual name — verify from Q Quartz product list |
| D | St. Soubirous | Unusual name — verify from Aggranite product list |
| F | Calacatta Viol | Possible truncation — may be "Calacatta Viola" |

**Chris must verify all `_review` items before running write-enabled import.**

### Matching behavior

- Matching order: **exact → alias → fuzzy → none**.
- **Exact**: normalized color name + exact (or empty) material → `review_status=approved`.
- **Alias**: exact color + compatible material via alias group (ESF ≡ ESF Quartz) → `review_status=approved`.
- **Fuzzy**: Levenshtein similarity ≥ 0.75 + compatible material → `review_status=needs_review` always.
- **None**: no match → Non-Stock candidate.
- Low-confidence fuzzy MUST NOT silently classify as Elite 100.
- All fuzzy suggestions require human review.

### Screenshot parsing convention

Each item in "The 100 Color Collection" is `"Color Name - Manufacturer/Brand"`. The left side is `color_name`; the right side is `material_name`. Do not reverse.

See `FEATURE_DECISIONS.md §76` for the full decision record.

---

## 14. Elite 100 alias/review seed — Chris batch #1 applied

### Summary

Chris reviewed the first fuzzy match batch from `previewElite100Matches.js`. 8 fuzzy candidates were approved as aliases; 2 were explicitly rejected. The decisions are captured in a seed fixture and applied via a new import script.

### New files

| File | Purpose |
|------|---------|
| `backend-core/src/slabInventory/fixtures/elite100-2026-alias-review-seed.json` | Human-auditable record of 8 approved + 2 rejected decisions |
| `backend-core/src/scripts/slabInventory/importElite100AliasReviews.js` | Dry-run script to apply aliases + rejections to Supabase |

### Updated files

| File | Change |
|------|--------|
| `backend-core/src/slabInventory/colorProgramMatching.js` | Added `matchSourceColorWithAliases`, `matchAllSourceColorsWithAliases`, `buildAliasPayload`, `buildRejectReviewPayload` |
| `backend-core/src/scripts/slabInventory/previewElite100Matches.js` | Loads aliases + rejected reviews from Supabase when credentials available; uses alias-aware matching; prints rejected count |
| `backend-core/src/slabInventory/colorProgramMatching.test.mjs` | 11 new test suites for alias/review logic |

### Approved aliases (source SlabCloud name → catalog name)

| Source | Catalog | Group | Reason |
|--------|---------|-------|--------|
| Winter Fresh / ESF Quartz | Winterfresh / ESF | C | Word split; material alias |
| Belfast Grey / Aggranite | Belfast Gray / Aggranite | C | Grey vs Gray |
| Classic Gray / ESF Quartz | Classic Grey / ESF | Promo | Gray vs Grey; material alias |
| Costal Tide / ESF Quartz | Coastal Tide / ESF | B | Missing 'a'; material alias |
| Regal D Oro / Stratus | Regal D'Oro / Stratus | B | Missing apostrophe |
| Skys The Limit / ESF Quartz | Sky's the Limit / ESF | A | Missing apostrophe; material alias |
| Larvik / ESF Quartz | Larvic / ESF | D | k→c; also confirms 'Larvic' is correct catalog spelling |
| Whitendale / Cambria | Whitenedale / Cambria | A | Missing 'e' |

### Rejected fuzzy candidates

| Source | Was suggested as | Group | Reason |
|--------|-----------------|-------|--------|
| Calacatta Athena / Stratus | Calacatta Lucent / Stratus | A | Different colors — shared prefix only |
| Armitage / Cambria | Hermitage / Cambria | D | Different colors — spurious fuzzy similarity |

### Matching order (updated)

1. **Exact** (normalized color + exact material) → approved
2. **Material-alias** (exact color + `MATERIAL_ALIAS_GROUPS` compatible) → approved
3. **DB alias** (Chris-approved `slab_color_aliases` exact match) → alias / approved
4. **Fuzzy** (Levenshtein ≥ 0.75 + compatible material) → needs_review
5. **None** → Non-Stock candidate

### Safety rules (unchanged)

- Fuzzy matches are **never** auto-approved as Elite 100.
- Rejected records act as an explicit blocklist — they are moved from fuzzy to a separate "rejected" bucket in preview output.
- Collection `is_active` is **never** changed by any import script.
- `slab_inventory` is **never** touched.

### Manual next steps for Chris

```bash
# 1. Import catalog (if not already done — Decision #76)
ELITE100_CATALOG_WRITE_ENABLED=1 \
SLABOS_ORGANIZATION_ID=<org> \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run eos:elite100:import-catalog

# 2. Import aliases + rejections
ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1 \
SLABOS_ORGANIZATION_ID=<org> \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run eos:elite100:import-alias-reviews

# 3. Preview updated match counts (aliases now applied)
SLABOS_ORGANIZATION_ID=<org> \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run eos:elite100:preview-matches

# 4. After reviewing the preview — manual activation only
# UPDATE slab_color_collections SET is_active=true
# WHERE collection_key='elite100-2026' AND organization_id='<org>';
```

See `FEATURE_DECISIONS.md §77` for the full decision record.

---

## Phase 4 — Elite 100 / Non-Stock Color Browser UI (v1)

**Status:** Shipped — 2026-06-05  
**Decision:** `FEATURE_DECISIONS.md §78`

### What was built

The Slab Inventory head has been transformed from a raw slab table/grid into a **color-program browser** with three tabs:

| Tab | Description |
|-----|-------------|
| **Elite 100** | One card per active catalog color. Grouped into horizontal carousels by Promo, A, B, C, D, E, F. Premium showroom-quality design: contained image, white mat, color name label. |
| **Non-Stock** | One card per typed color/material group not matched to Elite 100. Clean responsive grid — searchable. |
| **All Inventory** | Preserves the existing raw slab browser (filter/search/list/grid/lightbox/health panel). Operational fallback. |

### New backend APIs (read-only)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/slab-inventory/elite100-programs` | Active catalog organized by Promo/A–F, enriched with live typed inventory counts and representative images. Returns all 100 items even if zero inventory. |
| `GET /api/slab-inventory/elite100-programs/:catalogItemId/inventory` | Physical slab + remnant rows for one Elite 100 catalog item (exact + alias match only). Slabs and remnants returned in separate arrays. |
| `GET /api/slab-inventory/non-stock-programs` | One card per typed color/material group not matched to active Elite 100. Uses same `groupColorPrograms` logic. |

All three new routes are `GET`, behind `requireAuth()` + `requireHeadAccess("slab_inventory")`, and are `organization_id` scoped. `count_for_color` is never read or summed.

### Elite 100 design decisions

- **One card = one catalog color.** Never one card per physical slab.
- Cards use **contained/no-bleed image** with white mat/padding (12px) + rounded 8px image area + 16px card radius.
- Color name is the only primary label; count meta is subtle (faint, small).
- **Zero-inventory colors** still appear with a "No inventory" badge.
- Horizontal carousels with smooth scroll + arrow controls + fade-edge gradients.
- `program_status: "elite_100"` on all catalog cards.

### Non-Stock design decisions

- Simple responsive grid (`auto-fill minmax(180px, 1fr)`).
- Client-side search filter on color name + material name.
- Same inventory modal pattern as Elite 100 (slabs first, remnants below).
- `program_status: "non_stock"` on all non-stock cards.

### Color Inventory Modal

- Opened by clicking any Elite 100 or Non-Stock card.
- Header: Elite 100 badge + group label, color name, material, availability counts.
- Body: **Full Slabs** section first, **Remnants** section below.
- Each physical item: thumbnail, dimensions, thickness, rack/lot, inventory ID, source price group badge.
- Empty states per section; "No current inventory" for both-empty case.
- Keyboard: `Escape` closes.

### Matching logic (Elite 100 → inventory)

Matching follows exact priority order:
1. Exact normalized color + material
2. Material alias match (ESF ≡ ESF Quartz, etc.)
3. Database alias match (approved by Chris: `slab_color_aliases`)

Fuzzy matches and unmatched groups go to **Non-Stock** (never auto-classified as Elite 100 without an explicit alias record).

### Exported helper

`buildElite100InventoryMap(invRows, catalogItemList, resolvedAliases)` is exported from `slabInventoryApi.js` for unit testing. It returns a `Map<catalog_item_id, { slabCount, remnantCount, slabIds }>`.

