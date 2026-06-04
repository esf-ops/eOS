# SlabCloud Inventory Integration — Read-Only Dry-Run POC

**Status:** Proof of concept (read-only, dry-run). Not wired into any head, Supabase, or sync pipeline.
**Date:** 2026-06-04
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

### NPM scripts

```bash
# Run the dry-run POC (writes debug/slabcloud/*.json)
npm run eos:slabcloud:inventory-poc

# Run the unit tests
npm run eos:test:slabcloud-inventory
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

### Example summary (capped live run, `SLABCLOUD_MAX_DETAILS=10`)

```
slabRecordCount: 30
distinctColorCount: 10
distinctMaterialCount: 6
materialsEndpointCount: 44
summedSlabCount: 118
warnings: 0
```

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

## 11. Future path

After reviewing the dry-run output we will decide whether to:

1. Build Supabase **cache tables** (org-scoped by `organization_id`) populated by a **backend-owned** fetch, and/or
2. Build an internal **Slab Inventory head** that reads the cached data.

A real head must use **backend-owned cached data**, **never** direct browser calls to SlabCloud.

> **Action item:** Confirm with SlabCloud whether these JSON endpoints are **approved for internal/automated use** before scheduling any recurring sync.
