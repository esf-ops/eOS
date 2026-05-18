# Moraware Sync Foundation v1

## Purpose

Moraware remains the system that records operational work. eliteOS Brain stores read-only Moraware staging and normalized data so multiple heads can explain and move that work over time: Sales / Accounts, Executive, Production Flow, Shop Floor TV, Job Timeline, Template, Install, Purchasing, Customer Service, Quality / Rework, Data Quality, Brain Health, System Admin, and future Finance / Job Costing.

This is not a Sales Dashboard feature and does not write to Moraware.

## Runner Decision

The repo has two Moraware access paths:

- Node HTTP/XML path: `src/morawareClient.js`, `src/morawareDiscovery.js`, and `backend-core/src/scripts/syncMoraware.js`. This can run on normal Node where Moraware HTTP credentials are available.
- Windows SDK path: `tools/moraware-sdk-trace/*` uses `JobTrackerAPI5.dll` for SDK-only probes. This requires Windows/.NET Framework when the DLL is needed.

Vercel/Linux must not be assumed capable of loading `JobTrackerAPI5.dll`. Foundation v1 therefore supports a protected import endpoint so either runner can feed Brain:

- Cloud/backend runner can post batches when the HTTP/XML path is sufficient.
- Windows scheduled worker can read with the DLL, produce normalized JSON, then post to the same endpoint.

## V1 Data Scope

Included:

- Accounts/customers.
- Jobs and identifiers.
- Account id/name and job name/number.
- Process/status.
- Created/modified/scheduled/completed/install dates when available.
- Job activities with type/name/status/date/time/duration where available.
- Forms/custom fields as raw staged payloads.
- File metadata as raw staged payloads, no binary downloads.
- Assignee/resource catalog.
- Sync run metadata, row counts, errors, raw payloads, and data quality findings.

Not included yet:

- Trusted activity-to-machine/resource assignment.
- Material/inventory readiness from Moraware Inventory Edition.
- Live Machines calendar row data.
- Any Moraware writeback.

## Backend API

Protected import:

`POST /api/internal/moraware-sync/import`

Headers:

- `x-moraware-sync-secret: <MORAWARE_SYNC_IMPORT_SECRET>`
- or `x-eos-cron-secret: <EOS_CRON_SECRET>`

Payload shape:

```json
{
  "organization_id": "00000000-0000-0000-0000-000000000000",
  "mode": "manual-worker-import",
  "runner": "windows-worker",
  "metadata": {},
  "batches": {
    "accounts": [],
    "jobs": [],
    "job_activities": [],
    "job_forms": [],
    "job_files": [],
    "assignees": []
  }
}
```

Status:

`GET /api/moraware-sync/status`

Requires authenticated `admin`, `executive`, or `super_admin` with `brain_health` access. Returns latest run, last successful run, freshness, row counts, recent errors, unresolved data quality counts, current data scope, and known gaps.

## Manual Run

1. Apply `backend-core/supabase/eliteos_moraware_sync_foundation_v1.sql` in Supabase.
2. Set backend env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MORAWARE_SYNC_IMPORT_SECRET`, and optionally `MORAWARE_DEFAULT_ORGANIZATION_ID`.
3. Generate a tiny capped snapshot from a local ignored Moraware export/probe artifact. Do not commit it:

```bash
MORAWARE_TINY_SOURCE_FILE=debug/moraware/latest/jobs/index.json \
MORAWARE_TINY_OUTPUT_FILE=debug/moraware/import-tests/tiny-real-moraware-snapshot.json \
npm run eos:moraware:generate-tiny-snapshot
```

When `jobs/index.json` has blank `jobStatus`, the generator also merges per-job operational artifacts (`debug/moraware/latest/jobs/<jobId>.operational.json`) when present. Those artifacts can carry job-level status at Moraware's raw job attribute path and process on the raw job node. If a Windows SDK job identifier export provides better status/process rows, pass it as a sidecar:

```bash
MORAWARE_TINY_SOURCE_FILE=debug/moraware/latest/jobs/index.json \
MORAWARE_TINY_STATUS_SOURCE_FILE=debug/moraware/latest/moraware-sdk-job-identifiers.json \
MORAWARE_TINY_OUTPUT_FILE=debug/moraware/import-tests/tiny-real-moraware-snapshot.json \
npm run eos:moraware:generate-tiny-snapshot
```

If no status-bearing local artifact exists, run the read-only Windows identifier probe first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/moraware-sdk-trace/MorawareSdkJobIdentifierProbe.ps1
```

Keep any generated SDK output under `debug/moraware/` and do not commit it.

Default caps for the first run:

- 5 accounts
- 10 jobs
- 25 job activities
- 25 forms/custom field rows
- 25 file metadata rows
- 25 assignees/resources

The generator accepts an existing import payload, `jobs/index.json`, a `jobs` array, a single normalized job artifact, or a single operational job artifact. Generated files live under `debug/`, which is git-ignored.

4. Import manually when ready:

```bash
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/import-tests/tiny-real-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

## Small Capped Baseline

After the tiny import validates org scope, status/process mapping, and sync logging, generate a larger but still capped baseline snapshot. This does **not** run a live Moraware sync and does **not** schedule anything; it only converts local ignored Moraware artifacts into an import payload.

Generate:

```bash
MORAWARE_SNAPSHOT_MODE=baseline \
MORAWARE_TINY_SOURCE_FILE=debug/moraware/latest/jobs/index.json \
MORAWARE_TINY_OUTPUT_FILE=debug/moraware/baseline-tests/capped-baseline-moraware-snapshot.json \
MORAWARE_BASELINE_MAX_JOBS=50 \
MORAWARE_BASELINE_MAX_ACTIVITIES=250 \
MORAWARE_BASELINE_MAX_FORMS=250 \
MORAWARE_BASELINE_MAX_FILES=250 \
MORAWARE_BASELINE_MAX_ASSIGNEES=100 \
npm run eos:moraware:generate-tiny-snapshot
```

Default baseline caps:

- 50 jobs
- related accounts, capped to `MORAWARE_BASELINE_MAX_ACCOUNTS` if set, otherwise the job cap
- 250 job activities
- 250 forms/custom field rows
- 250 file metadata rows
- 100 assignees/resources

Counts-only inspection (do not print records):

```bash
node -e "const fs=require('fs'); const p='debug/moraware/baseline-tests/capped-baseline-moraware-snapshot.json'; const x=JSON.parse(fs.readFileSync(p,'utf8')); console.log(Object.fromEntries(Object.entries(x.batches||{}).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))); console.log({jobs_with_status:(x.batches.jobs||[]).filter(j=>String(j.status_name||j.jobStatus||j.status||'').trim()).length,jobs_with_process:(x.batches.jobs||[]).filter(j=>String(j.process_name||j.processName||j.process||'').trim()).length});"
```

Import manually:

```bash
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/baseline-tests/capped-baseline-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

Supabase verification queries:

```sql
select id, organization_id, status, row_counts, data_quality_counts, started_at, finished_at
from public.moraware_sync_runs
order by started_at desc
limit 5;

select count(*) as normalized_jobs
from public.brain_moraware_jobs
where sync_run_id = '<SYNC_RUN_ID>';

select
  count(*) filter (where nullif(status_name, '') is not null) as jobs_with_status,
  count(*) filter (where nullif(status_name, '') is null) as jobs_missing_status,
  count(*) filter (where nullif(process_name, '') is not null) as jobs_with_process
from public.brain_moraware_jobs
where sync_run_id = '<SYNC_RUN_ID>';

select finding_type, severity, count(*) as finding_count
from public.moraware_data_quality_findings
where sync_run_id = '<SYNC_RUN_ID>'
group by finding_type, severity
order by finding_count desc;
```

## Live Capped Snapshot

Once manual snapshot imports are validated, the next repeatable runner is the Node HTTP/XML path, not the Windows SDK. The current validated v1 scope (jobs, forms/custom fields, operational activities, status/process from operational artifacts) is available through `src/morawareClient.js` + `src/morawareDiscovery.js`. The Windows `JobTrackerAPI5.dll` worker remains for unresolved SDK-only surfaces such as deeper activity-to-resource/machine assignment.

Generate a live capped snapshot (read-only Moraware; local ignored output only):

```bash
MORAWARE_API_URL=... \
MORAWARE_USERNAME=... \
MORAWARE_PASSWORD=... \
MORAWARE_DEFAULT_ORGANIZATION_ID=... \
MORAWARE_LIVE_MAX_JOBS=100 \
MORAWARE_LIVE_MAX_ACTIVITIES=500 \
MORAWARE_LIVE_MAX_FORMS=500 \
MORAWARE_LIVE_MAX_FILES=250 \
MORAWARE_LIVE_MAX_ASSIGNEES=100 \
npm run eos:moraware:generate-live-capped-snapshot
```

The runner sets conservative defaults:

- `SUPABASE_WRITE_ENABLED=0` always, so this step cannot write directly to Supabase.
- `MORAWARE_DISCOVERY_MODE=global-sync`.
- `MORAWARE_INGEST_OPERATIONAL=1`.
- `MORAWARE_INGEST_FORMS=1`.
- `MORAWARE_MAX_JOBS_TO_INGEST=<MORAWARE_LIVE_MAX_JOBS>`.
- output: `debug/moraware/live-capped/live-capped-moraware-snapshot.json`.

Inspect counts only:

```bash
node -e "const fs=require('fs'); const p='debug/moraware/live-capped/live-capped-moraware-snapshot.json'; const x=JSON.parse(fs.readFileSync(p,'utf8')); console.log(Object.fromEntries(Object.entries(x.batches||{}).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))); console.log({jobs_with_status:(x.batches.jobs||[]).filter(j=>String(j.status_name||j.jobStatus||j.status||'').trim()).length,jobs_with_process:(x.batches.jobs||[]).filter(j=>String(j.process_name||j.processName||j.process||'').trim()).length});"
```

Import the live capped snapshot manually:

```bash
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/live-capped/live-capped-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

Schedule recommendation, after one or more successful manual live capped imports:

- Start with a manual live capped run during business hours.
- Then schedule a capped 100-job run every 60 minutes during business hours for observation only.
- Move to every 30 minutes only after `moraware_sync_runs` duration, row counts, and data-quality findings are stable.
- Keep a nightly reconciliation/full-ish plan separate; do not enable until modified-date/page filtering is proven safe.

Windows Task Scheduler is not required for the validated v1 live capped scope. Use the Windows SDK probes only when targeting SDK-only surfaces such as machine/resource assignment:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/moraware-sdk-trace/MorawareSdkActivityAssigneeLinkProbe.ps1
```

## Future Windows Task Scheduler

Do not schedule automatically yet. When scheduling is approved later, prefer scheduling the live capped snapshot plus import as two explicit commands so the ignored JSON artifact remains inspectable between steps.

Example future Task Scheduler command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "cd C:\eliteOS\eOS; npm run eos:moraware:generate-live-capped-snapshot; $env:MORAWARE_SYNC_IMPORT_FILE='debug/moraware/live-capped/live-capped-moraware-snapshot.json'; npm run eos:moraware:import-snapshot"
```

Environment on the Windows machine:

- `BACKEND_URL`
- `MORAWARE_SYNC_IMPORT_SECRET`
- `MORAWARE_DEFAULT_ORGANIZATION_ID` if the payload omits `organization_id`
- `MORAWARE_API_URL`, `MORAWARE_USERNAME`, `MORAWARE_PASSWORD`
- `MORAWARE_LIVE_MAX_JOBS`, `MORAWARE_LIVE_MAX_ACTIVITIES`, `MORAWARE_LIVE_MAX_FORMS`, `MORAWARE_LIVE_MAX_FILES`, `MORAWARE_LIVE_MAX_ASSIGNEES`

Write worker logs outside the repo or under ignored `debug/moraware/`. Success is HTTP 200 from the import endpoint with `sync_run_id`, row counts, and data quality count. Failure is a non-zero process exit and a failed/error sync run if the backend received the request.

## Data Quality

Sync does not fail because of data quality issues. The backend records findings for:

- Jobs missing account id/name.
- Jobs missing status.
- Jobs missing created/modified date.
- Activities missing job link.
- Activities missing type/name.
- Accounts missing name.
- Resources missing name.

Future checks should add unmapped statuses/resources, stale sync age, and account-owner mapping coverage.

## Cross-Head Readiness

Synced v1 data can feed:

- Sales / Accounts: accounts, jobs, statuses, recent activity.
- Executive: job volume, flow status, aging; bottlenecks later.
- Production Flow: job activities/statuses, but not trusted machine assignment yet.
- Install: install dates/statuses where available.
- Customer Service: job status/timeline and file metadata.
- Data Quality: missing fields and mapping issues.
- Brain Health / System Admin: sync freshness, errors, row counts, and readiness.

Still blocked or partial:

- Titans/Machine capacity until activity-to-resource assignment is trusted.
- Material/Purchasing until SlabSmith or Moraware Inventory path is integrated.
- Detailed live schedule until calendar/machines data is unlocked.

## Security

- No Moraware credentials in frontend code or Vite env.
- No Supabase service role key in frontend code.
- Import endpoint requires server secret.
- Sync logs should redact credentials and avoid committed customer/job payloads.
- Read-only Moraware methods only in v1.
- No Moraware writes.
- Frontends read Brain/Supabase data through backend APIs only.
