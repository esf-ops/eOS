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
| `image_url_guess` | derived | `/slabs/{companyCode}/{SlabID}.jpg` (guess). |
| `thumbnail_url_guess` | derived | `/slabs/{companyCode}/{SlabID}_thumb.jpg` (guess). |
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

Image URLs are **guessed** from the observed pattern:

- full: `https://slabcloud.com/slabs/{companyCode}/{SlabID}.jpg`
- thumb: `https://slabcloud.com/slabs/{companyCode}/{SlabID}_thumb.jpg`

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

### ⚠️ First dry-run finding (2026-06-04): guessed URL pattern returns 404

The first dry-run verified 50 `unknown` rows (`thumbnail-first`): **0 ok · 50 missing · 0 error**, all clean `HEAD 404`. A follow-up `image-first` check of 10 rows was also **10 missing (404)**.

**Conclusion:** The *guessed* URL pattern (`/slabs/{companyCode}/{SlabID}.jpg` and `..._thumb.jpg`) is **not** the real SlabCloud image URL scheme. The verification tooling is working correctly (it cleanly classified them as `missing`), but the URL pattern itself is unconfirmed and must be resolved before image display is built. **Action item:** ask SlabCloud for the real image/thumbnail URL format (an open question already tracked in §8a / roadmap). Once known, add it as a new `image_url_pattern` (the schema supports multiple patterns per slab) and re-verify.

---

## 11. Future path

Dry-run reviewed · SlabCloud verbal approval received · SQL applied · persistence built (write-gated). Next steps:

1. Run the dry-run cache smoke: `npm run eos:slabcloud:cache` (no writes).
2. First **real write** — manual, reviewed, with `SLABCLOUD_CACHE_WRITE_ENABLED=1` against the target org (see roadmap for the exact command).
3. Obtain SlabCloud **written confirmation** of API use before any scheduled production sync.
4. Plan internal **Slab Inventory head** (`app-slab-inventory`) — Phase 2.

A real head must use **backend-owned cached data**, **never** direct browser calls to SlabCloud.

See [`slabos-slab-inventory-profit-engine-roadmap.md`](./slabos-slab-inventory-profit-engine-roadmap.md) for the full phased plan.
