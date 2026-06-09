# Slabsmith local sync v1 (Windows connector)

## Overview

eliteOS ingests Slabsmith inventory from a **Windows PC** that already receives Slabsmith export XML. v1 reads the same file SlabCloud uses today:

`C:\slabcloud\sync\slabs.xml`

The PC POSTs XML to **backend-core**; the server parses and writes to Supabase using the existing Slabsmith normalizer and persistence modules. The Windows host authenticates with a dedicated sync token — **not** the Supabase service role.

## Architecture

```text
Slabsmith (on-prem) → export XML → C:\slabcloud\sync\slabs.xml
                                        ↓
                          tools/slabsmith-connector (Windows)
                                        ↓ HTTPS POST + sync token
                          backend-core POST /api/integrations/slabsmith/inventory/xml
                                        ↓ service role (server only)
                          Supabase slab_inventory (external_source=slabsmith)
                                        ↓ read API
                          app-slab-inventory head (unchanged in v1)
```

## Why read-only against Slabsmith

v1 does **not** connect to Slabsmith SQL. It only reads a file already written by the existing export path. No schema changes, no SQL credentials on the connector PC beyond what SlabCloud already uses for the XML drop.

## Why this does not modify SlabCloud

- Writes use `external_source=slabsmith` and the upsert conflict key includes `external_source`.
- SlabCloud cache rows (`external_source=slabcloud`) are never updated or deleted by this path.
- SlabCloud FTP/hourly sync scripts are untouched.
- Production Slab Inventory default remains `SLAB_INVENTORY_ACTIVE_SOURCE=slabcloud` until operators switch views.

## Windows setup

1. **Copy connector** from repo `tools/slabsmith-connector/` to `C:\eliteos-slabsmith-sync\`.
2. **Node.js 18+** installed and on PATH.
3. **config.json** from `config.example.json`:
   - `backendBaseUrl` — deployed backend-core URL
   - `sourceXmlPath` — `C:\slabcloud\sync\slabs.xml`
   - `imageRootPath` — `C:\slabcloud` (optional; this is the default when omitted)
   - `syncToken` — matches backend `SLABSMITH_SYNC_TOKEN` (set in Vercel/host env, not in git)
   - `logDir` — e.g. `C:\eliteos-slabsmith-sync\logs`
   - `writeEnabled` — `false` until manual send verified

## Backend env (server-side)

| Variable | Purpose |
|----------|---------|
| `SLABSMITH_SYNC_TOKEN` | Shared secret; must match connector `syncToken` |
| `SUPABASE_URL` | Server-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only |
| `SLABSMITH_SYNC_ORGANIZATION_ID` or `SLABOS_ORGANIZATION_ID` | Tenant org for writes |
| Supabase bucket `eliteos-slab-images` | Public-read storage for uploaded slab JPGs (apply `backend-core/supabase/eliteos_slab_images_storage.sql`) |

## Manual dry-run

```powershell
cd C:\eliteos-slabsmith-sync
node sync-slabs.mjs --config config.json --dry-run
```

Checks file exists; logs size and timestamp. No network call.

## Manual send

```powershell
node sync-slabs.mjs --config config.json --send
```

Expect JSON with `rows_seen`, `inserted`, `updated`, `sync_run_id`, `status`, etc.

## Image manifest (discovery only; no upload)

Slab images live beside the SlabCloud export folder:

- Full: `C:\slabcloud\<SlabID>.jpg`
- Thumbnail: `C:\slabcloud\<SlabID>_thumb.jpg`

The manifest scans XML `SlabID` values, pairs images case-insensitively, ignores the `sync\` subfolder, and writes JSON under `logDir`:

```powershell
node sync-images.mjs --config config.json
```

Or use the flag on the XML connector:

```powershell
node sync-slabs.mjs --config config.json --image-manifest
```

Config fields:

| Field | Purpose |
|-------|---------|
| `sourceXmlPath` | Same Slabsmith export XML as inventory sync |
| `imageRootPath` | Folder containing slab JPGs (default `C:\slabcloud`) |
| `logDir` | Output folder for `image-manifest-<timestamp>.json` |

Console output includes safe counts only (`xml_slab_count`, matched/missing/unmatched samples). **No sync token, no raw XML.**

After reviewing the manifest on Windows, upload images incrementally:

```powershell
# Preview upload plan (no network upload)
node sync-images.mjs --config config.json --plan-upload

# Upload first 5 matched pairs only
node sync-images.mjs --config config.json --upload --limit 5

# Upload one known slab (SlabID from manifest/XML)
node sync-images.mjs --config config.json --upload --slab-id 3c179475-5052-4b0d-ae38-9f154bf5daf6
```

Backend endpoint: `POST /api/integrations/slabsmith/inventory/images` (multipart, same sync token as XML ingest).

Upload state is tracked in `logDir/image-upload-state.json` using file size + modified time fingerprints so unchanged pairs are skipped on later runs.

### Production churn (files disappearing during upload)

Elite is actively cutting and producing material during the day. A slab JPG that existed when the manifest was built may be gone by the time upload reaches that file (consumed, moved, or refreshed by SlabCloud/SlabSmith).

When a planned full or thumb file is missing at upload time (`ENOENT`), the connector:

- logs `skipped_missing_during_upload_count` (non-fatal)
- does **not** increment `failed_count`
- does **not** mark the pair as uploaded in `image-upload-state.json`
- exits with code **0** if there are no other real failures

When the backend returns a non-fatal skip (for example `skipped_no_inventory_match` because inventory was consumed before upload), the connector:

- logs `skipped_no_inventory_match_count` (or `skipped_backend_nonfatal_count` for other non-fatal backend statuses)
- includes compact samples such as `sample_skipped_no_inventory_match`
- does **not** write upload success state for that slab
- does **not** increment `failed_count`

Upload summary reconciliation (upload mode):

`planned_upload_count = uploaded_count + skipped_missing_during_upload_count + skipped_no_inventory_match_count + skipped_backend_nonfatal_count + failed_count`

The log also prints `outcomes_reconciled=true` when every planned item is explicitly classified. `skipped_unchanged_count` is separate and reflects pairs skipped before planning because local files match a prior successful upload fingerprint.

Those slabs remain eligible on a later `--upload` run if the files reappear locally.

**Before first upload:** create Supabase Storage bucket `eliteos-slab-images` (public read). See `backend-core/supabase/eliteos_slab_images_storage.sql`.

Do **not** schedule image upload yet — validate manually with `--limit 5` first.

## Verifying images in Slab Inventory UI

With `SLAB_INVENTORY_ACTIVE_SOURCE=slabsmith`, **All Inventory** shows local Slabsmith rows automatically (no source selector in the UI). Uploaded photos resolve from `slab_images` where `image_url_pattern=slabsmith_local_upload` and `image_status=ok`, joined on `external_slab_id` (Slabsmith `InventoryID`). The slab lightbox **Technical details** panel shows **Image source: Local inventory image** when the resolver picked a local upload row. Operators can still override via `?source=slabsmith|slabcloud|all` on API routes for admin/debug.

## Hourly schedule

Use `install-task-scheduler.example.ps1` as a template. Task name: **eliteOS Slabsmith Inventory Sync**. Example cadence: every 60 minutes. **Leave disabled** until operators validate one manual send and backend counts (`?source=slabsmith` on summary API).

## Future: SlabCloud XML dependency

v1 reuses the SlabCloud sync folder for convenience. A later slice should add an eliteOS-owned read-only Slabsmith SQL export so inventory sync does not depend on the SlabCloud XML pipeline.

## Related docs

- [eliteos/slabcloud-inventory-poc.md](../eliteos/slabcloud-inventory-poc.md)
- Connector README: [tools/slabsmith-connector/README.md](../../tools/slabsmith-connector/README.md)
