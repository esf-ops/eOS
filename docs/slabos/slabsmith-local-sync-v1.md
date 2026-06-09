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

## Hourly schedule

Use `install-task-scheduler.example.ps1` as a template. Task name: **eliteOS Slabsmith Inventory Sync**. Example cadence: every 60 minutes. **Leave disabled** until operators validate one manual send and backend counts (`?source=slabsmith` on summary API).

## Future: SlabCloud XML dependency

v1 reuses the SlabCloud sync folder for convenience. A later slice should add an eliteOS-owned read-only Slabsmith SQL export so inventory sync does not depend on the SlabCloud XML pipeline.

## Related docs

- [eliteos/slabcloud-inventory-poc.md](../eliteos/slabcloud-inventory-poc.md)
- Connector README: [tools/slabsmith-connector/README.md](../../tools/slabsmith-connector/README.md)
