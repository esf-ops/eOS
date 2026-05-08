## eOS Brain autosync scheduling (planned)

This repo is structured so **Heads never call Moraware directly**. Moraware data is ingested into the eOS Brain in Supabase, and Heads read only from the secured backend-core API.

### Goals

- **Repeatable**: sync can run unattended.
- **Safe**: single-job failures never crash the full run.
- **Non-overlapping**: never run concurrent syncs (enforced via `eos_sync_locks`).
- **Observable**: health status exposed via `GET /api/brain/sync-health`.

### Intended schedule (future)

Nothing here installs a scheduler yet. These are the intended commands for a future cron/job runner.

- **Every 15–30 minutes (future)**: recent/active jobs sync, once a true incremental mode exists.
  - Planned command: `npm run eos:sync:recent`

- **Nightly**: full current-year sync.
  - Command: `npm run eos:sync:nightly`

- **Nightly or weekly**: operational sync (jobQuery include-all operational signals).
  - Command: `npm run eos:sync:nightly:operational`

- **After each scheduled sync**: retry failed jobs.
  - Command: `npm run eos:sync:retry-failed`

### Cron-ready internal endpoints (for Vercel Cron later)

The API exposes **secret-protected** internal endpoints intended for a scheduler.

- Required env: `EOS_CRON_SECRET`
- Required header: `x-eos-cron-secret: <EOS_CRON_SECRET>`

Endpoints:

- `POST /api/internal/sync/recent`
- `POST /api/internal/sync/nightly`
- `POST /api/internal/sync/nightly-operational`
- `POST /api/internal/sync/retry-failed`

These endpoints start background Node processes that run the existing backend-core scripts. They return immediately with `accepted: true`.

### Recommended (example) Vercel Cron schedule

Do **not** run full syncs every 15 minutes.

- **Recent**: every 30 minutes
- **Nightly**: once per night (off-hours)
- **Nightly operational**: nightly or weekly (start weekly if run time is high)
- **Retry failed**: after each scheduled sync (or at least nightly)

### Warning: serverless timeouts

If deployed to a platform with strict function limits, full syncs may exceed the runtime budget.

- Prefer a worker/queue platform for full syncs if timeouts occur.
- Keep `eos_sync_locks` to prevent overlap.

### Locking

- Global sync uses lock name: `moraware_global_sync`
- Retry script uses lock name: `moraware_retry_failed_sync`
- Locks expire automatically after ~2 hours (TTL) to prevent permanent deadlocks.

### UX expectation for Heads

Heads should:

- display the **last known Brain data** even if Moraware is unavailable
- surface sync status from `GET /api/brain/sync-health`
- never block user workflows on Moraware availability

