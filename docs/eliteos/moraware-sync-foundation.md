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

## Date-Bounded 2026 Baseline Snapshot

Sales Dashboard 2026 YTD actuals should use a manual, date-bounded baseline snapshot before any recurring sync is considered. This mode is still read-only against Moraware, writes only ignored local JSON under `debug/moraware/`, and does not import automatically.

Generate the 2026 baseline snapshot:

```bash
MORAWARE_SNAPSHOT_MODE=baseline_2026 \
MORAWARE_API_URL=... \
MORAWARE_USERNAME=... \
MORAWARE_PASSWORD=... \
MORAWARE_DEFAULT_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
MORAWARE_BASELINE_START_DATE=2026-01-01 \
MORAWARE_BASELINE_END_DATE=2026-05-18 \
MORAWARE_BASELINE_MAX_JOBS=5000 \
MORAWARE_BASELINE_MAX_ACTIVITIES=50000 \
MORAWARE_BASELINE_MAX_FORMS=50000 \
MORAWARE_BASELINE_MAX_FILES=10000 \
MORAWARE_BASELINE_MAX_ASSIGNEES=1000 \
npm run eos:moraware:generate-live-capped-snapshot
```

If `MORAWARE_BASELINE_END_DATE` is omitted, the runner uses today's local date. The runner maps the baseline range to `MORAWARE_SYNC_START_DATE`, `MORAWARE_SYNC_END_DATE`, and `MORAWARE_SYNC_YEAR=2026` before discovery so job detail/form ingestion is limited to matching 2026 jobs. `baseline_2026` refuses missing or invalid start dates, start dates before `2026-01-01`, and inverted ranges.

Inspect counts only before import:

```bash
node -e "const fs=require('fs'); const p='debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json'; const x=JSON.parse(fs.readFileSync(p,'utf8')); const b=x.batches||{}; console.log(Object.fromEntries(Object.entries(b).map(([k,v])=>[k,Array.isArray(v)?v.length:0]))); console.log({mode:x.mode, range:{start:x.metadata?.baseline_start_date,end:x.metadata?.baseline_end_date}, cap_warnings:x.metadata?.cap_warnings||[], jobs_with_status:(b.jobs||[]).filter(j=>String(j.status_name||j.jobStatus||j.status||'').trim()).length,jobs_with_process:(b.jobs||[]).filter(j=>String(j.process_name||j.processName||j.process||'').trim()).length,jobs_with_sqft:(b.jobs||[]).filter(j=>JSON.stringify(j.raw_payload||{}).match(/sq\\.?\\s*ft/i)).length});"
```

If `cap_warnings` is non-empty, do not import until the cap is understood. Increase the relevant `MORAWARE_BASELINE_MAX_*` value and regenerate, or document why the cap is intentionally limiting the baseline.

Run an import dry-run before posting the 2026 baseline. Dry-run reads the snapshot, builds the same chunk plan the importer would use, prints the `import_group_id`, total row counts, planned chunk count, largest estimated payload size, and per-chunk row counts, then exits without sending HTTP requests. Large baseline snapshots fail closed unless `MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1` is set.

```bash
MORAWARE_IMPORT_DRY_RUN=1 \
MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1 \
MORAWARE_IMPORT_CHUNKED=1 \
MORAWARE_IMPORT_MAX_PAYLOAD_BYTES=1500000 \
MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK=50 \
MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FILES_PER_CHUNK=250 \
MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK=250 \
MORAWARE_DEFAULT_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

Review the dry-run output before import:

- `planned_chunks` is understandable and not accidentally thousands of chunks.
- `largest_estimated_payload_size` is below the configured `MORAWARE_IMPORT_MAX_PAYLOAD_BYTES`.
- Per-chunk row counts look balanced; very large single-row chunks require investigation.
- `total_snapshot_counts` matches the count-only inspection.

Chunked import command for the 2026 baseline, only after dry-run review:

```bash
MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1 \
MORAWARE_IMPORT_CHUNKED=1 \
MORAWARE_IMPORT_MAX_PAYLOAD_BYTES=1500000 \
MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK=50 \
MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FILES_PER_CHUNK=250 \
MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK=250 \
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_DEFAULT_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

If an import fails mid-group, do not start a new group blindly. Use the failed chunk index and `import_group_id` from the importer log. Example for a failure at chunk 19:

```bash
MORAWARE_IMPORT_RESUME_GROUP_ID=<IMPORT_GROUP_ID> \
MORAWARE_IMPORT_START_CHUNK_INDEX=19 \
MORAWARE_IMPORT_ALLOW_LARGE_BASELINE=1 \
MORAWARE_IMPORT_CHUNKED=1 \
MORAWARE_IMPORT_MAX_PAYLOAD_BYTES=1500000 \
MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK=50 \
MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK=1000 \
MORAWARE_IMPORT_MAX_FILES_PER_CHUNK=250 \
MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK=250 \
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_DEFAULT_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/baseline-2026/baseline-2026-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

The backend treats an import group as complete only when every expected chunk index has a latest successful run and no latest failed chunk. System Admin and Sales Head should show an incomplete/failed latest group as review-needed, not as healthy baseline truth. Sales Head company-wide Sq.Ft. actuals remain visible but include an incomplete import warning until the group is completed.

The 2026 baseline should be manually verified in Supabase, System Admin Moraware Sync Status, and Sales Head YTD filters before any recurring sync is scheduled.

Supabase verification queries after import:

```sql
select
  id,
  status,
  row_counts,
  metadata->>'import_group_id' as import_group_id,
  metadata->'parent_snapshot_counts' as parent_snapshot_counts,
  started_at,
  finished_at
from public.moraware_sync_runs
order by started_at desc
limit 10;

select
  metadata->>'import_group_id' as import_group_id,
  count(*) as chunks,
  count(*) filter (where status = 'success') as successful_chunks,
  sum(coalesce((row_counts->>'jobs')::int, 0)) as jobs_seen,
  sum(coalesce((row_counts->>'job_forms')::int, 0)) as forms_seen
from public.moraware_sync_runs
where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
group by metadata->>'import_group_id';

select
  count(*) as jobs_2026,
  min(created_at) as min_created_at,
  max(created_at) as max_created_at,
  count(*) filter (where nullif(status_name, '') is not null) as jobs_with_status,
  count(*) filter (where nullif(process_name, '') is not null) as jobs_with_process
from public.brain_moraware_jobs
where sync_run_id in (
  select id
  from public.moraware_sync_runs
  where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
);

select finding_type, severity, count(*) as finding_count
from public.moraware_data_quality_findings
where sync_run_id in (
  select id
  from public.moraware_sync_runs
  where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
)
group by finding_type, severity
order by finding_count desc;
```

Sales Head validation after import:

- System Admin Moraware Sync Status shows the latest chunk group as successful and row counts match the inspected baseline counts.
- Sales Dashboard default YTD view shows 2026 company-wide synced Sq.Ft. actuals without requiring branch/salesperson attribution.
- QTD, MTD, week/day, and custom date filters operate over the imported 2026 baseline.
- Branch and salesperson totals remain gated by approved Sales Account Mapping.
- Blackstone remains unmapped/needs approval unless explicitly approved through Sales Account Mapping.

For 100-job live capped snapshots and larger, use chunked import. Vercel rejects oversized request bodies before backend code runs, which appears as `HTTP 413 Request Entity Too Large` / `FUNCTION_PAYLOAD_TOO_LARGE`. Chunking keeps the protected import endpoint unchanged and sends several smaller payloads instead. Each chunk currently creates its own `moraware_sync_runs` row; all rows are tied together by `metadata.import_group_id`.

Recommended chunk sizes:

- jobs: `20`
- activities: `100`
- forms: `100`
- files: `50`
- assignees/resources: `50`

Chunked import command:

```bash
MORAWARE_IMPORT_CHUNKED=1 \
MORAWARE_IMPORT_MAX_JOBS_PER_CHUNK=20 \
MORAWARE_IMPORT_MAX_ACTIVITIES_PER_CHUNK=100 \
MORAWARE_IMPORT_MAX_FORMS_PER_CHUNK=100 \
MORAWARE_IMPORT_MAX_FILES_PER_CHUNK=50 \
MORAWARE_IMPORT_MAX_ASSIGNEES_PER_CHUNK=50 \
BACKEND_URL=https://backend-core-six.vercel.app \
MORAWARE_SYNC_IMPORT_SECRET=... \
MORAWARE_DEFAULT_ORGANIZATION_ID=89180433-9fab-4024-bec9-a14d870bd0a8 \
MORAWARE_SYNC_IMPORT_FILE=debug/moraware/live-capped/live-capped-moraware-snapshot.json \
npm run eos:moraware:import-snapshot
```

Verify a chunk group:

```sql
select
  id,
  status,
  started_at,
  finished_at,
  row_counts,
  metadata->>'import_group_id' as import_group_id,
  (metadata->>'chunk_index')::int as chunk_index,
  (metadata->>'chunk_count')::int as chunk_count,
  metadata->'chunk_counts' as chunk_counts,
  metadata->'parent_snapshot_counts' as parent_snapshot_counts
from public.moraware_sync_runs
where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
order by (metadata->>'chunk_index')::int;

select
  metadata->>'import_group_id' as import_group_id,
  count(*) as chunks,
  count(*) filter (where status = 'success') as successful_chunks,
  sum(coalesce((row_counts->>'accounts')::int, 0)) as accounts_seen,
  sum(coalesce((row_counts->>'jobs')::int, 0)) as jobs_seen,
  sum(coalesce((row_counts->>'job_activities')::int, 0)) as activities_seen,
  sum(coalesce((row_counts->>'job_forms')::int, 0)) as forms_seen,
  sum(coalesce((row_counts->>'job_files')::int, 0)) as files_seen,
  sum(coalesce((row_counts->>'assignees')::int, 0)) as assignees_seen
from public.moraware_sync_runs
where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
group by metadata->>'import_group_id';

select
  sync_run_id,
  finding_type,
  severity,
  count(*) as finding_count
from public.moraware_data_quality_findings
where sync_run_id in (
  select id
  from public.moraware_sync_runs
  where metadata->>'import_group_id' = '<IMPORT_GROUP_ID>'
)
group by sync_run_id, finding_type, severity
order by finding_count desc;
```

## Admin Sync Health Validation

Before recurring scheduling, admins should validate Moraware health from System Admin diagnostics. The card uses the protected `GET /api/moraware-sync/status` endpoint and returns aggregate health only: latest run metadata, latest successful run, chunk group totals, row counts, data-quality counts, stale warning state, and known gaps. It does not return raw customers, jobs, forms, files, credentials, or Moraware payloads.

Access rules:

- Requires authenticated eliteOS session.
- Requires `admin`, `super_admin`, or approved executive role.
- Requires access to either `system_admin` or `brain_health`; admins and super admins still have recovery bypass.

Admin checklist after each manual/chunked import:

- Last success is recent and below the stale threshold.
- Latest chunk group shows all chunks successful.
- Latest group row counts match the capped import expectation.
- Data quality warning count is `0` or understood.
- Known gaps are expected for this phase: file metadata may be absent, assignees/resources may be absent, machine assignment is not trusted, and material inventory is not integrated.

The same aggregate endpoint can be checked directly:

```bash
curl -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  https://backend-core-six.vercel.app/api/moraware-sync/status
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
