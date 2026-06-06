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
| Snapshot generation | **Production: Ubuntu cloud VM** ([runbook](../eliteos/moraware-cloud-worker-runbook.md)); dev: any self-hosted worker | `npm run eos:moraware:run-scheduled-pipeline` |
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

**Production worker:** See [`docs/eliteos/moraware-cloud-worker-runbook.md`](../docs/eliteos/moraware-cloud-worker-runbook.md) — Ubuntu VM, env at `/etc/eliteos/moraware-worker.env`, cron via `deploy/moraware-worker/run-moraware-worker.sh`.

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

Reviews chunk plan via import dry-run; skips HTTP import, prepared-facts rebuild, and freshness verification. Exits 0 with a clear console message.

### Manual live run (supervised)

```bash
npm run eos:moraware:run-scheduled-pipeline
```

Run once during business hours before enabling production cron.

### Dev-only: Mac launchd (not production)

For local/dev scheduling only — **production should use the [cloud worker runbook](../docs/eliteos/moraware-cloud-worker-runbook.md)**.

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

---

## Phase 2 — SlabCloud Typed Inventory Sync (implemented, scheduler not yet active)

**Inventory freshness** depends on the hourly SlabCloud sync calling `runSlabCloudInventorySync` directly (no subprocess). The scheduler calls a protected backend endpoint.

| Layer | Where it runs | Endpoint / command |
|-------|---------------|--------------------|
| Scheduler trigger | Vercel Cron or Cloudflare Worker | `GET|POST /api/internal/slabcloud/hourly-sync` |
| Sync execution | **In-process** (Express route imports `runSlabCloudInventorySync` directly) | Always `inventoryScope: "typed"` |
| Inventory read | Browser → backend | `GET /api/slab-inventory/elite100-programs`, `/non-stock-programs`, `/all-inventory` |

**Do not** run per-color detail fetches (`SLABCLOUD_HOURLY_FETCH_DETAILS`) in Vercel Pro unless you increase `maxDuration` or migrate to a long-lived worker. Summary-only (~10–15 s) fits within the default 15 s timeout.

### Sync endpoint

**Route:** `GET|POST /api/internal/slabcloud/hourly-sync`
- `GET` — Vercel Cron (sends `Authorization: Bearer <CRON_SECRET>` automatically)
- `POST` — manual tests, Cloudflare Worker, any HTTP client
- Other methods → `405 Method Not Allowed`

**File:** `backend-core/src/slabcloud/slabCloudHourlySyncApi.js`

#### Authentication
Two methods accepted (either satisfies the check):

```
Authorization: Bearer <secret>      ← primary (Vercel Cron native; also any HTTP client)
x-eos-cron-secret: <secret>         ← custom header (Moraware precedent; Cloudflare Worker)
x-eliteos-cron-secret: <secret>     ← alias (listed in CORS allowed headers)
```

Returns `401` if header missing or wrong. Returns `500` if no secret is configured on the backend.

**Server-side secret env var priority:**
1. `CRON_SECRET` — Vercel's native cron secret (set this in Vercel project env vars; Vercel injects `Authorization: Bearer` automatically on scheduled cron calls)
2. `EOS_CRON_SECRET` — legacy alias used by existing Moraware endpoints and manual tests
3. `ELITEOS_CRON_SECRET` — additional alias for future unification

#### Anti-overlap guard
Before running, the route queries `slabcloud_sync_runs` for any row where:
- `organization_id = <SLABOS_ORGANIZATION_ID>`
- `external_source = 'slabcloud'`
- `status = 'running'`
- `started_at > now() - 60 minutes`

If found → returns `409 { skipped: true, reason: "sync_already_running" }`.  
Stale stuck runs (>60 min) are not blocking.  
Guard failure is non-fatal: logs a warning and proceeds.

### Scheduler: Vercel Cron (pre-configured)

`backend-core/vercel.json` already contains:

```json
{
  "crons": [
    {
      "path": "/api/internal/slabcloud/hourly-sync",
      "schedule": "0 * * * *"
    }
  ]
}
```

Vercel Cron:
- Invokes cron paths with **GET** requests.
- Automatically adds `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set in Vercel project env vars.
- Set `CRON_SECRET` (not `EOS_CRON_SECRET`) in your Vercel project environment variables.

**Important:** Do not activate the cron until the endpoint has been manually tested (see below).

### Scheduler: Cloudflare Worker alternative

If backend-core is not on Vercel or you prefer a Cloudflare Worker:

```javascript
// Cloudflare Worker scheduled handler (docs-only example — not deployed code)
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      fetch(`${env.BACKEND_URL}/api/internal/slabcloud/hourly-sync`, {
        method: "POST",
        headers: {
          "x-eos-cron-secret": env.EOS_CRON_SECRET,
          "Content-Type": "application/json",
        },
      }).then((r) => r.json()).then(console.log)
    );
  },
};
```

Bind to a Cron Trigger: `0 * * * *` in `wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]
```

### Required backend env vars

| Var | Value |
|-----|-------|
| `CRON_SECRET` | Strong random secret — **set this in Vercel project env vars** (Vercel injects `Authorization: Bearer` automatically on cron calls) |
| `EOS_CRON_SECRET` | Optional — kept for local/manual compatibility (also accepted by Moraware endpoints) |
| `SLABOS_ORGANIZATION_ID` | `89180433-9fab-4024-bec9-a14d870bd0a8` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (backend only — never in frontend) |
| `SLABCLOUD_CACHE_WRITE_ENABLED` | `1` to enable writes (omit for dry-run) |
| `SLABCLOUD_API_COMPANY_CODE` | `kbyd` |
| `SLABCLOUD_ASSET_COMPANY_CODE` | `kbyd` |
| `SLABCLOUD_PUBLIC_SLUG` | `esf` |

Optional:

| Var | Default | Purpose |
|-----|---------|---------|
| `SLABCLOUD_CONCURRENCY` | `2` | Parallel detail fetches (if enabled) |
| `SLABCLOUD_HOURLY_FETCH_DETAILS` | off | Enable per-color detail fetches (30–60 s; not recommended for Vercel Pro) |

### Manual test (required before enabling scheduler)

```bash
# Step 1 — dry-run via GET (mirrors Vercel Cron; no writes):
curl -X GET https://<BACKEND_URL>/api/internal/slabcloud/hourly-sync \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"

# Step 2 — dry-run via POST (manual / Cloudflare Worker pattern):
curl -X POST https://<BACKEND_URL>/api/internal/slabcloud/hourly-sync \
  -H "x-eos-cron-secret: <YOUR_EOS_CRON_SECRET>"

# Step 3 — write-enabled (ensure SLABCLOUD_CACHE_WRITE_ENABLED=1 is set on the server):
curl -X GET https://<BACKEND_URL>/api/internal/slabcloud/hourly-sync \
  -H "Authorization: Bearer <YOUR_CRON_SECRET>"
# Verify: check slabcloud_sync_runs for a new row with status='completed'.
```

### What the SlabCloud sync does NOT do (hard guardrails)

- Does **not** delete rows or mark inventory inactive
- Does **not** write back to SlabCloud/Slabsmith
- Does **not** use `count_for_color` or v2 display counts as inventory authority
- Does **not** run the v2 texture cache (`cacheSlabCloudV2Textures.js`) hourly
- Does **not** run full image verification hourly (only verify `image_status='unknown'` rows; daily is sufficient)
- Does **not** expose service-role keys to `app-slab-inventory` or any browser

### SlabCloud texture cache (NOT hourly)

The v2 texture cache (`cacheSlabCloudV2Textures.js`) runs **daily or manually** because product/texture assets change far less frequently than physical slab availability. Run:

```bash
SLABCLOUD_V2_TEXTURE_CACHE_WRITE_ENABLED=1 \
SLABOS_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npm run eos:slabcloud:v2-texture-cache
```

### UX expectation for the Slab Inventory head

- `app-slab-inventory` reads from `GET /api/slab-inventory/elite100-programs` (and `/non-stock-programs`, `/all-inventory`) — never calls SlabCloud directly.
- Pages show last-cached inventory even if SlabCloud is temporarily unavailable.
- Freshness lag is at most ~1 hour when the hourly sync is active.
