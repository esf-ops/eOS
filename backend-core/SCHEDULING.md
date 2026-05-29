## eOS Brain autosync scheduling

This repo is structured so **Heads never call Moraware directly**. Moraware data is ingested into the eOS Brain in Supabase, and Heads read only from the secured backend-core API.

### Goals

- **Repeatable**: sync can run unattended.
- **Safe**: single-job failures never crash the full run.
- **Non-overlapping**: never run concurrent syncs (enforced via `eos_sync_locks` on legacy sync paths).
- **Observable**: health status exposed via `GET /api/brain/sync-health` and `GET /api/admin/moraware/health`.

---

## Phase 1 — Moraware → Sales Dashboard autosync (implemented)

**Sales Dashboard freshness** depends on the **chunked import + prepared facts** pipeline, not legacy `syncMoraware.js`.

| Layer | Where it runs | Command / endpoint |
|-------|----------------|-------------------|
| Snapshot generation | **Self-hosted worker** (Mac launchd, cron, or self-hosted CI runner) | `npm run eos:moraware:run-scheduled-pipeline` (step 1 inside runner) |
| Chunked import | Worker calls **Vercel backend** | `POST /api/internal/moraware-sync/import` |
| Prepared facts rebuild | Worker calls **Vercel backend** | `POST /api/internal/moraware-sync/rebuild-prepared-facts` |
| Sales Dashboard reads | Browser → backend | Prepared tables only (`sales_moraware_job_facts`, rollups) |

**Do not** use Vercel cron to generate Moraware snapshots or run the full 400MB / hundreds-of-chunks import loop inside serverless functions. Vercel remains the **API receiver** only.

### Worker command (one entry point)

From repo root on the worker machine:

```bash
npm run eos:moraware:run-scheduled-pipeline
```

Implementation: `backend-core/src/scripts/moraware/runScheduledMorawarePipeline.js`

Structured logs: `debug/moraware/scheduled-runs/*.jsonl` (git-ignored).

### Required worker env vars

See `docs/EOS_ENV_VARS.md` — minimum:

- `MORAWARE_API_URL`, `MORAWARE_USERNAME`, `MORAWARE_PASSWORD`
- `MORAWARE_DEFAULT_ORGANIZATION_ID`
- `BACKEND_URL` (Vercel backend, no trailing `/api`)
- `MORAWARE_SYNC_IMPORT_SECRET` **or** `EOS_CRON_SECRET`

Optional pipeline controls:

- `MORAWARE_IMPORT_DRY_RUN=1` — build chunk plan only; no HTTP import or rebuild
- `MORAWARE_PIPELINE_SKIP_GENERATE=1` — reuse existing snapshot JSON
- `MORAWARE_IMPORT_RESUME_GROUP_ID` + `MORAWARE_IMPORT_START_CHUNK_INDEX` — resume failed chunk group
- `MORAWARE_BASELINE_END_DATE` — defaults to **today** when omitted

### Required backend env vars (Vercel)

- `SUPABASE_SERVICE_ROLE_KEY`
- `MORAWARE_SYNC_IMPORT_SECRET` and/or `EOS_CRON_SECRET` (must match worker)

### Manual dry-run (safe)

```bash
MORAWARE_IMPORT_DRY_RUN=1 npm run eos:moraware:run-scheduled-pipeline
```

Reviews chunk plan via import dry-run; skips prepared-facts rebuild.

### Manual live run (supervised)

```bash
npm run eos:moraware:run-scheduled-pipeline
```

Run once during business hours before enabling launchd/cron.

### Mac launchd example (off-hours)

Create `~/Library/LaunchAgents/com.eliteos.moraware-nightly.plist` pointing at the repo with env vars loaded from a **non-repo** `.env` file, then:

```bash
launchctl load ~/Library/LaunchAgents/com.eliteos.moraware-nightly.plist
```

**Disable / stop:**

```bash
launchctl unload ~/Library/LaunchAgents/com.eliteos.moraware-nightly.plist
```

Remove or comment the cron/launchd entry — there is no in-app toggle.

### Resume after mid-group import failure

If chunk N of M fails, **do not regenerate** the snapshot. Re-run with the same chunk env:

```bash
MORAWARE_PIPELINE_SKIP_GENERATE=1 \
MORAWARE_IMPORT_RESUME_GROUP_ID=<import_group_id from logs> \
MORAWARE_IMPORT_START_CHUNK_INDEX=<failed chunk index> \
npm run eos:moraware:run-scheduled-pipeline
```

The import script also prints a suggested resume command on failure.

### Verify Sales Dashboard freshness after deploy

1. **System Admin → Moraware → Sync Health** — `health_status: healthy`, `prepared_facts.freshness: fresh`
2. **Sales Dashboard** — sync banner shows recent last success and complete chunk group
3. Optional API: `GET /api/admin/moraware/health` (admin session)

---

## Legacy Brain autosync (separate path)

Legacy HTTP sync still exists for older `brain_*` tables. It does **not** replace the Sales chunked-import pipeline above.

### Legacy intended schedule

- **Every 15–30 minutes (future)**: `npm run eos:sync:recent` — once true incremental mode exists
- **Nightly**: `npm run eos:sync:nightly`
- **Nightly or weekly**: `npm run eos:sync:nightly:operational`
- **After legacy sync**: `npm run eos:sync:retry-failed`

### Cron-ready internal endpoints (legacy spawn only)

- Required env: `EOS_CRON_SECRET`
- Required header: `x-eos-cron-secret: <EOS_CRON_SECRET>`

Endpoints:

- `POST /api/internal/sync/recent`
- `POST /api/internal/sync/nightly`
- `POST /api/internal/sync/nightly-operational`
- `POST /api/internal/sync/retry-failed`

These spawn background Node processes running `syncMoraware.js`. They return immediately with `accepted: true`.

**Do not** point Vercel cron at these for Sales Dashboard freshness unless you intentionally maintain the legacy Brain path separately.

### Warning: serverless timeouts

Full legacy syncs may exceed Vercel function limits. Prefer a worker for long runs. Keep `eos_sync_locks` to prevent overlap on legacy sync.

### Locking (legacy)

- Global sync: `moraware_global_sync`
- Retry script: `moraware_retry_failed_sync`
- Locks expire after ~2 hours (TTL)

### UX expectation for Heads

Heads should:

- display the **last known Brain data** even if Moraware is unavailable
- surface sync status from Moraware admin health / Sales dashboard foundation
- never block user workflows on Moraware availability

See also: `docs/eliteos/moraware-sync-foundation.md`
