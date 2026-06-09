# Slabsmith Windows connector (v1)

Local Windows package that reads Slabsmith export XML and POSTs it to **backend-core** over HTTPS. The PC never receives the Supabase service role key.

## v1 source file

Default path (SlabCloud export drop folder):

`C:\slabcloud\sync\slabs.xml`

## Quick setup

1. Install **Node.js 18+** on the Windows PC.
2. Copy this folder to `C:\eliteos-slabsmith-sync`.
3. Copy `config.example.json` → `config.json`.
4. Set `syncToken` to the same value as backend env `SLABSMITH_SYNC_TOKEN` (placeholder in repo only).
5. Keep `writeEnabled: false` until manual testing is complete.

## Manual dry-run (local only)

Validates XML exists; prints path, size, and modified time. **Does not call the backend.**

```powershell
cd C:\eliteos-slabsmith-sync
node sync-slabs.mjs --config config.json --dry-run
```

## Manual live send

```powershell
node sync-slabs.mjs --config config.json --send
```

Or set `"writeEnabled": true` in `config.json` and run without `--dry-run`.

## Image manifest (discovery only)

Pairs local slab JPGs with XML `SlabID` values. Does **not** upload images.

```powershell
node sync-images.mjs --config config.json
```

Equivalent:

```powershell
node sync-slabs.mjs --config config.json --image-manifest
```

Writes `image-manifest-<timestamp>.json` under `logDir` and prints summary counts.

## Upload plan / live upload

```powershell
node sync-images.mjs --config config.json --plan-upload
node sync-images.mjs --config config.json --upload --limit 5
```

Tracks `logDir/image-upload-state.json` to skip unchanged file pairs. Never logs sync token or image bytes.

## Backend endpoint

`POST /api/integrations/slabsmith/inventory/xml`

Header: `X-EliteOS-Slabsmith-Sync-Token: <token>`

Body: raw XML (`Content-Type: application/xml`) or JSON `{ "xml": "..." }`.

`POST /api/integrations/slabsmith/inventory/images`

Header: same sync token. Body: `multipart/form-data` with `slab_id`, `inventory_id`, `full_image`, `thumb_image`, and file metadata fields.

## Scheduling

See `install-task-scheduler.example.ps1` for an **disabled-by-default** hourly Task Scheduler example (60 minutes).

## Security

- **Never** commit `config.json` (gitignored).
- **Never** put Supabase service role on the Windows PC.
- Logs must not print the sync token.

## What this does / does not do

- **Does:** ingest Slabsmith XML into Supabase `slab_inventory` with `external_source=slabsmith`; discover local slab JPGs and write an image manifest JSON.
- **Does not:** connect to Slabsmith SQL, modify SlabCloud rows, delete missing slabs, upload orphan/unmatched images, or schedule automatic image upload (manual `--upload` only).
- **Does not:** change SlabCloud FTP scripts or production default `SLAB_INVENTORY_ACTIVE_SOURCE=slabcloud`.

## Future

Replace dependency on SlabCloud-exported XML with an eliteOS-owned read-only Slabsmith SQL export job.

See also: [docs/slabos/slabsmith-local-sync-v1.md](../../docs/slabos/slabsmith-local-sync-v1.md)
