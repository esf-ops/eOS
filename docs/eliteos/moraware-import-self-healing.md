# Moraware Import: Self-Healing Pipeline Runbook

**Last updated:** July 2026  
**Covers:** automatic resume of interrupted daily imports, Sales Dashboard fallback, worker setup, and manual recovery.

---

## Why This Exists

On June 29, 2026 the daily Moraware import started at 07:01 UTC, processed 250 of 526 chunks, then stopped at 07:05 UTC. The Sales Dashboard immediately returned **"Moraware Production Actuals — NOT AVAILABLE"** even though the previous day's complete data was sitting in `sales_moraware_job_facts`. Chris had to SSH in, find the first missing chunk (251), and manually run the resume command.

This runbook documents the two fixes deployed after that incident:

| Fix | Where | What it does |
|---|---|---|
| Auto-resume preflight | Worker pipeline | Detects an incomplete latest group at startup and resumes it automatically |
| Dashboard fallback | `salesHead.js` / KPI endpoint | Serves yesterday's complete data while today's import is in progress |

---

## Architecture

```
Worker machine (launchd cron @ 07:00 UTC)
  └── npm run eos:moraware:run-scheduled-pipeline
        ├── [NEW] acquire lock file          (prevents double-run)
        ├── [NEW] auto-resume preflight      (detects + resumes incomplete group)
        ├── generate snapshot                (skipped on resume)
        ├── import chunks                    (importSnapshotToBrain.js)
        └── rebuild prepared facts           (POST /api/internal/moraware-sync/rebuild-prepared-facts)

Backend API
  ├── GET  /api/internal/moraware-sync/group-health  [NEW — import secret]
  ├── POST /api/internal/moraware-sync/import        [import secret]
  └── POST /api/internal/moraware-sync/rebuild-prepared-facts  [import secret]

Sales Dashboard (GET /api/sales/kpi-v1)
  ├── loadLatestMorawareGroup()   → includes latest_complete_group when latest is incomplete [NEW]
  └── fetchLatestPreparedSalesJobFacts()  → falls back to latest_complete_group [NEW]
```

---

## Part A — Auto-Resume: How It Works

### Trigger

Every time `npm run eos:moraware:run-scheduled-pipeline` starts (in live mode, not dry-run), before doing anything else:

1. **Acquire lock file** at `debug/moraware/.pipeline.lock` (contains PID + `startedAt`). If a process with that PID is running → exit immediately. If PID is stale → clear the lock and proceed.

2. **Call `GET /api/internal/moraware-sync/group-health`** (authenticated with the import secret). This returns:
   - `latest_group` — the most recently started import group and its completeness
   - `latest_complete_group` — the most recent group where all chunks succeeded
   - `incomplete_latest_group: true/false`
   - `first_missing_chunk` / `missing_chunk_count`
   - `resume_group_id` / `resume_start_chunk_index`

3. **If `incomplete_latest_group === true`** and `first_missing_chunk >= 2`:
   - Check if the snapshot file (`debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json`) still exists on the worker
   - **Snapshot exists** → set `MORAWARE_IMPORT_RESUME_GROUP_ID` + `MORAWARE_IMPORT_START_CHUNK_INDEX` in `process.env`, log `auto_resume_triggered`, skip generate, continue import from the first missing chunk
   - **Snapshot missing** → log `auto_resume_skipped_no_snapshot`, proceed with fresh generate + import (new group ID)

4. **If `first_missing_chunk === 1`** (first chunk ever missing) → cannot resume safely; proceed fresh.

5. **After import succeeds** → `rebuild-prepared-facts` runs automatically as always.

### What gets logged

All events are written to `debug/moraware/scheduled-runs/<timestamp>.jsonl`:

| Event | When |
|---|---|
| `auto_resume_preflight` | Always — records latest group completeness at startup |
| `auto_resume_triggered` | Resume was detected and configured automatically |
| `auto_resume_skipped` | Manual resume already set, or credentials missing |
| `auto_resume_skipped_no_snapshot` | Group is incomplete but snapshot file is gone |
| `auto_resume_health_check_failed` | Backend API unreachable; fresh import proceeds |
| `pipeline_already_running` | Lock held by a live process — exiting |
| `stale_lock_removed` | Stale PID file cleared |

### Jun 29 scenario — what would have happened

```
07:00 UTC  cron fires → pipeline_start
07:01      auto_resume_preflight: latest group ff340b9e is COMPLETE → no resume needed
07:01      generate_start → generate snapshot (526 chunks needed)
07:01      import_start → chunks 1–526 begin
07:05      *** CRASH / INTERRUPT *** at chunk 250

[Next day, 07:00 UTC]
07:00 UTC  cron fires → acquire lock → no stale lock
07:00      auto_resume_preflight: latest group 905fec7b has 276 missing chunks (first=251)
07:00      snapshot file exists at debug/moraware/baseline-2026/...
07:00      auto_resume_triggered: MORAWARE_IMPORT_RESUME_GROUP_ID=905fec7b, START=251
07:00      generate_skipped (reason: auto_resume)
07:00      import_start → chunks 1–250 skipped, chunks 251–526 sent
07:10      import_complete → rebuild_start → rebuild_complete
07:10      pipeline_success
```

No manual SSH required. The Sales Dashboard would have shown yesterday's data (Jun 28's complete group) during the gap via the fallback.

---

## Part B — Dashboard Fallback: How It Works

**Problem:** The KPI endpoint called `fetchLatestPreparedSalesJobFacts()` which returned `NOT AVAILABLE` the moment the latest group's `complete === false`, even if yesterday's complete data was in `sales_moraware_job_facts`.

**Fix in `salesHead.js`:**

`loadLatestMorawareGroup()` now calls `loadLatestCompleteImportGroup()` (from `morawareSyncHealth.js`) when the latest group is incomplete. The result is returned as `syncHealth.latest_complete_group`.

`fetchLatestPreparedSalesJobFacts()` then:
- If `latest_group.complete === false` AND `latest_complete_group` exists → query `sales_moraware_job_facts` for the complete group's data
- Sets `fallback_used: true`
- Sets `warning: "Latest Moraware import is incomplete; showing data from the last complete import (2026-06-28)."`
- If no complete fallback exists → still returns NOT AVAILABLE (correct behavior)

The `/api/sales/kpi-v1` response now includes in `moraware_actuals`:

```json
{
  "extraction_status": "ok",
  "sync_note": "Latest Moraware import is incomplete; showing data from the last complete import (2026-06-28).",
  "fallback_used": true,
  "latest_import_group_id": "905fec7b-7a15-4f91-a43d-a961da21a46e",
  "latest_import_group_complete": false,
  "used_import_group_id": "ff340b9e-6a4a-4750-aac8-7b741b4e21ab",
  "periods": [...],
  "totals": {...}
}
```

The Sales Dashboard shows data (with the fallback warning in `sync_note`) instead of NOT AVAILABLE.

---

## Part C — Worker Setup

### Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MORAWARE_DEFAULT_ORGANIZATION_ID` | Always | Target org UUID |
| `BACKEND_URL` | Live runs | Backend base URL (e.g. `https://api.eliteos.com`) |
| `MORAWARE_SYNC_IMPORT_SECRET` | Live runs | Auth header for `/api/internal/moraware-sync/*` |
| `EOS_CRON_SECRET` | Fallback if no import secret | Same auth, used for rebuild endpoint |
| `MORAWARE_API_URL` | Fresh generate only | Moraware API endpoint |
| `MORAWARE_USERNAME` | Fresh generate only | Moraware credentials |
| `MORAWARE_PASSWORD` | Fresh generate only | Moraware credentials |

### Canonical env source

The worker reads env from `/opt/eliteos/eOS/.env` (loaded by `import "dotenv/config"` at script start). This file is the single source of truth — do not set values in launchd plist or cron directly; put them in `.env`.

### Scheduled run (launchd)

The plist at `/Library/LaunchDaemons/com.eliteos.moraware-pipeline.plist` (or equivalent) runs:

```xml
<key>ProgramArguments</key>
<array>
  <string>/usr/local/bin/node</string>
  <string>/opt/eliteos/eOS/backend-core/src/scripts/moraware/runScheduledMorawarePipeline.js</string>
</array>
<key>WorkingDirectory</key>
<string>/opt/eliteos/eOS</string>
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key><integer>7</integer>
  <key>Minute</key><integer>0</integer>
</dict>
```

### Manual run (sources same env as the cron)

```bash
cd /opt/eliteos/eOS
npm run eos:moraware:run-scheduled-pipeline
```

Because the script uses `import "dotenv/config"`, it reads `/opt/eliteos/eOS/.env` automatically. No need to `source` the env file separately.

### Dry-run (no data written)

```bash
cd /opt/eliteos/eOS
MORAWARE_IMPORT_DRY_RUN=1 npm run eos:moraware:run-scheduled-pipeline
```

Prints the chunk plan and exits without making any HTTP calls or rebuilding facts.

---

## Part D — Manual Recovery (if auto-resume doesn't fire)

### Step 1 — Find the incomplete group

```sql
SELECT
  metadata->>'import_group_id' AS import_group_id,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE status='success') AS success_runs,
  COUNT(*) FILTER (WHERE status='failed') AS failed_runs,
  MAX((metadata->>'chunk_count')::int) AS expected_chunks,
  MAX((metadata->>'chunk_index')::int) AS max_chunk_seen,
  MIN(started_at) AS started_at,
  MAX(finished_at) AS latest_finished_at
FROM moraware_sync_runs
WHERE metadata->>'import_group_id' IS NOT NULL
GROUP BY metadata->>'import_group_id'
ORDER BY MIN(started_at) DESC
LIMIT 5;
```

### Step 2 — Find the first missing chunk

```sql
WITH chunk_series AS (
  SELECT generate_series(1, <expected_chunks>) AS expected_chunk
),
observed AS (
  SELECT (metadata->>'chunk_index')::int AS chunk_index
  FROM moraware_sync_runs
  WHERE metadata->>'import_group_id' = '<import_group_id>'
)
SELECT MIN(expected_chunk) AS first_missing_chunk
FROM chunk_series
WHERE expected_chunk NOT IN (SELECT chunk_index FROM observed);
```

### Step 3 — Dry-run to verify the chunk plan

```bash
cd /opt/eliteos/eOS
MORAWARE_IMPORT_DRY_RUN=1 \
MORAWARE_IMPORT_RESUME_GROUP_ID=<import_group_id> \
MORAWARE_IMPORT_START_CHUNK_INDEX=<first_missing_chunk> \
npm run eos:moraware:run-scheduled-pipeline
```

Confirm `"chunks_to_send"` matches `expected_chunks - first_missing_chunk + 1`.

### Step 4 — Run the live resume

```bash
cd /opt/eliteos/eOS
MORAWARE_IMPORT_RESUME_GROUP_ID=<import_group_id> \
MORAWARE_IMPORT_START_CHUNK_INDEX=<first_missing_chunk> \
npm run eos:moraware:run-scheduled-pipeline
```

### Step 5 — Verify

```sql
-- Confirm all chunks succeeded
SELECT
  metadata->>'import_group_id',
  COUNT(*) FILTER (WHERE status='success') AS success_runs,
  MAX((metadata->>'chunk_count')::int) AS expected_chunks
FROM moraware_sync_runs
WHERE metadata->>'import_group_id' = '<import_group_id>'
GROUP BY metadata->>'import_group_id';

-- Confirm facts were rebuilt
SELECT COUNT(*), import_group_id, MAX(updated_at)
FROM sales_moraware_job_facts
WHERE import_group_id = '<import_group_id>'
GROUP BY import_group_id;
```

Then reload the Sales Dashboard — `moraware_actuals.extraction_status` should be `"ok"` and `fallback_used` should be `false`.

---

## Completeness Definition

A Moraware import group is **complete** when all four conditions hold (from `summarizeMorawareImportGroupRows`):

1. `expectedChunkCount` is a known positive number (stored in `moraware_sync_runs.metadata.chunk_count`)
2. Every chunk index 1 → N was observed in `moraware_sync_runs`
3. All observed chunks have `status = 'success'`
4. No chunk has `status = 'failed'`

If any chunk is missing, failed, or `chunk_count` was never stored, `complete = false`.

---

## What Causes Incomplete Groups

Known causes (all observed or simulated):

| Cause | Symptom | Fix |
|---|---|---|
| Worker process killed mid-import (OOM, SSH disconnect, cron overlap) | Chunks 1–N success, N+1 onward missing | Auto-resume (or manual) |
| Network timeout to backend during a chunk | Single chunk `failed`, rest succeed | If only 1–2 failed: rebuild-prepared-facts; if many: resume |
| Backend deploy/restart during import | Chunks stop at deploy time, no failures | Auto-resume |
| Snapshot file deleted before chunks finished | Chunks imported from a stale/incomplete snapshot | Fresh generate + import |

The auto-resume handles all except the last case (missing snapshot → fresh import creates a new group).

---

## Files Changed (self-healing feature)

| File | Change |
|---|---|
| `backend-core/src/scripts/moraware/runScheduledMorawarePipeline.js` | Lock file, `detectAndApplyAutoResume`, `fetchGroupHealth`, `acquireLockFile`/`releaseLockFile` |
| `backend-core/src/moraware/morawareSyncApi.js` | New `GET /api/internal/moraware-sync/group-health` endpoint |
| `backend-core/src/sales/salesHead.js` | `loadLatestMorawareGroup` returns `latest_complete_group`; `fetchLatestPreparedSalesJobFacts` uses fallback; KPI response adds `fallback_used`/`used_import_group_id` |
| `backend-core/src/scripts/moraware/runScheduledMorawarePipeline.test.mjs` | 9 test cases |
| `backend-core/src/server.js` | Console log for new endpoint |
| `package.json` | `eos:test:moraware-pipeline` script |
| `docs/eliteos/moraware-import-self-healing.md` | This document |
