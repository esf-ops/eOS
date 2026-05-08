# backend-core

`backend-core` is the foundation for eOS "Brain" storage that will later feed multiple heads:
- `app-sales`
- `app-production`
- `app-field`

## Current status

- Moraware **global sync** is working via the existing discovery implementation in `src/index.js`.
- Persistence is currently **local JSON artifacts** written under `debug/moraware/latest/`.
- Supabase integration is planned next (schema drafting is tracked separately).

## Moraware sync wrapper

For now, `backend-core` exposes a thin wrapper script that launches the known-working discovery global sync.

### Safe test command

```bash
MORAWARE_SYNC_MODE=global MORAWARE_MAX_JOBS_TO_INGEST=5 MORAWARE_MAX_SEARCH_PAGES=5 node backend-core/src/scripts/syncMoraware.js
```

This runs `src/index.js` with:
- `MORAWARE_DISCOVERY=1`
- `MORAWARE_DISCOVERY_MODE=global-sync`

and should produce artifacts like:
- `debug/moraware/latest/jobs/index.json`
- `debug/moraware/latest/jobs/<jobId>.json`
- `debug/moraware/latest/global-sync-summary.json`

## Supabase persistence (optional)

Supabase writes are **disabled by default**. Local JSON artifacts always remain the fallback.

### Local JSON only

```bash
MORAWARE_DISCOVERY=1 MORAWARE_DISCOVERY_MODE=global-sync MORAWARE_MAX_JOBS_TO_INGEST=5 MORAWARE_MAX_SEARCH_PAGES=5 node src/index.js
```

### Supabase write enabled

```bash
SUPABASE_WRITE_ENABLED=1 MORAWARE_DISCOVERY=1 MORAWARE_DISCOVERY_MODE=global-sync MORAWARE_MAX_JOBS_TO_INGEST=5 MORAWARE_MAX_SEARCH_PAGES=5 node src/index.js
```

## Next steps (not implemented yet)

- Move Moraware ingestion into `backend-core/src/integrations/moraware/`
- Add Brain store abstraction (local JSON + optional Supabase)
- Have dashboards/heads read from Brain storage, not Moraware directly

## Backend read API (Supabase-only)

`backend-core/src/server.js` is a small Express server that reads Moraware Brain v1 from Supabase.

### Run

```bash
SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node backend-core/src/server.js
```

Defaults to port `3001` (override with `PORT=3001`).

### Test

```bash
curl http://localhost:3001/api/health
curl "http://localhost:3001/api/brain/summary?year=2026"
curl "http://localhost:3001/api/brain/sales/by-salesperson?year=2026"
curl "http://localhost:3001/api/brain/jobs?year=2026&limit=5"
```

### Security note

This server uses `SUPABASE_SERVICE_ROLE_KEY` and must remain **server-side only**. Do not embed it in `app-sales`, `app-production`, `app-field`, or any browser code.

