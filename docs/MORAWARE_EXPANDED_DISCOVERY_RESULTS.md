# Moraware expanded live discovery

This document describes **read-only** probes against the Moraware API (no Supabase writes, no Moraware mutations). Run the script only where Moraware credentials are already configured server-side.

**Credentials:** `MORAWARE_API_URL`, `MORAWARE_USERNAME`, and `MORAWARE_PASSWORD` are required (same as `MorawareClient`). **`MORAWARE_ACCOUNT_ID` is optional** unless a specific Moraware API method requires it for your tenant. The discovery script follows the same credential requirements as the working sync path: if `MORAWARE_ACCOUNT_ID` is unset, the client sends an empty `accountId` on `sessionCreate`, which is sufficient when Moraware resolves the account from the user login.

## How to run

```bash
# Optional: throttle between calls (default 350 ms)
export MORAWARE_DISCOVERY_DELAY_MS=400

# Sample sizes (defaults shown)
export MORAWARE_DISCOVERY_SAMPLE_JOBS=5
export MORAWARE_DISCOVERY_SAMPLE_ACCOUNTS=5

# Optional: experiment with creation-date range on jobQuery (may fail per Moraware version)
export MORAWARE_DISCOVERY_START_DATE=2026-01-01
# export MORAWARE_DISCOVERY_END_DATE=2026-12-31

# File metadata probe: key/json scan only — no binary download
export MORAWARE_DISCOVERY_INCLUDE_FILES=0

# Raw snippets: may include customer PII — keep in debug/ only
export MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=0

# Quieter Moraware client logs (set automatically by the script to "1" if unset)
export MORAWARE_DISCOVERY_QUIET_LOGS=1

npm run eos:discover:moraware-expanded
```

### Key-shape audit mode (sanitized structure)

Set **`MORAWARE_DISCOVERY_KEY_SHAPES=1`** to emit aggregated **key paths, value types, counts,** and **array child key unions** without dumping full Moraware payloads. Optional guards: `MORAWARE_DISCOVERY_KEY_SHAPE_MAX_DEPTH` (default 12), `MORAWARE_DISCOVERY_KEY_SHAPE_MAX_PATHS` (default 8000).

**Difference from raw snippets**

| Mode | Purpose |
| --- | --- |
| `MORAWARE_DISCOVERY_KEY_SHAPES=1` | Structure discovery: paths, types, length hints on strings (`string_len_N`), detector matches. Safer for sharing internally. |
| `MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=1` | May embed **customer text** in `example_scalar_kinds` as `raw_snippet:…` inside the key-shape JSON. Use only in controlled `debug/` runs; **never commit**. |

The `.txt` key-shape report repeats a warning when raw snippets are enabled.

**Outputs (extra when key shapes on)**

- `debug/moraware/latest/moraware-expanded-key-shapes.json`
- `debug/moraware/latest/moraware-expanded-key-shapes.txt`

The key-shape JSON includes: `paths`, `shape_summaries_by_area`, `detector_hits` (focused categories: address/contact, notes, schedule, files/issues, forms/quote), `job_notes_scope_research`, `contacts_key_shapes`, `file_and_attachment_paths` (when `MORAWARE_DISCOVERY_INCLUDE_FILES=1`), and normalized/forms raw trees. **No file binaries are downloaded.**

**Recommended command (known job 38837)**

```bash
MORAWARE_DISCOVERY_JOB_ID=38837 MORAWARE_DISCOVERY_SAMPLE_JOBS=1 MORAWARE_DISCOVERY_SAMPLE_ACCOUNTS=1 MORAWARE_DISCOVERY_INCLUDE_FILES=1 MORAWARE_DISCOVERY_KEY_SHAPES=1 npm run eos:discover:moraware-expanded
```

---

**Outputs (always)**

- `debug/moraware/latest/moraware-expanded-discovery.json`
- `debug/moraware/latest/moraware-expanded-discovery.txt`

If `MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=1`, treat those files as **potentially sensitive**; do not commit them to git.

---

## Job sampling (aligned with production global sync)

The expanded discovery script does **not** rely on the filterless `listAllJobs` query alone (many Moraware tenants return zero rows without a process filter). It samples jobs in this order:

1. **Explicit job IDs** — optional `MORAWARE_DISCOVERY_JOB_ID` and/or `EOS_DISCOVERY_JOB_ID` (both honored if different). These rows are probed first and count toward `MORAWARE_DISCOVERY_SAMPLE_JOBS`.
2. **Global-sync style listing** — `collectGlobalSyncStyleJobListSample()` in `src/morawareDiscovery.js`, which mirrors `runMorawareDiscovery` **global-sync**: process discovery (`discoverProcesses`) or `MORAWARE_PROCESS_IDS`, then paged `jobQuery` with `buildJobQueryByProcessInnerXml` (same variants `processIdAttr` / `processText` as sync). Uses the same paging env as sync: `MORAWARE_MAX_SEARCH_PAGES`, `MORAWARE_SEARCH_PAGE_SIZE` (fallback `MORAWARE_PAGE_SIZE`), `MORAWARE_MAX_PROCESSES`.
3. **Fallback** — `MorawareClient.listAllJobs` if more samples are still needed.

**Creation-date window:** If `MORAWARE_SYNC_START_DATE`, `MORAWARE_SYNC_END_DATE`, or `MORAWARE_SYNC_YEAR` are set (same as sync), the global-sync-style pool is filtered using `creationDate` on each list row — identical semantics to global-sync’s date gating on candidates.

**Account sampling:** Account IDs for `listAccountJobs` probes come only from **sampled jobs** (header / operational payloads). There is no account-wide crawl.

### Optional: probe a known job

```bash
export MORAWARE_DISCOVERY_JOB_ID=12345   # or EOS_DISCOVERY_JOB_ID
npm run eos:discover:moraware-expanded
```

### What “zero sample jobs” means

The JSON report includes `job_sampling` with `zero_jobs_hints`, `global_sync_style` diagnostics (process count, date filter stats, optional `hint`), and `list_all_jobs_fallback_total`. Typical causes: no process IDs (set `MORAWARE_PROCESS_IDS`), or `MORAWARE_SYNC_*` filters removed every list-row candidate.

### Minimal run (match sync-style search)

```bash
MORAWARE_SYNC_START_DATE=2026-01-01 \
MORAWARE_DISCOVERY_SAMPLE_JOBS=2 MORAWARE_DISCOVERY_SAMPLE_ACCOUNTS=2 \
MORAWARE_DISCOVERY_INCLUDE_FILES=0 MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=0 \
npm run eos:discover:moraware-expanded
```

---

## Part A — Existing read APIs (repo)

These are the main **read** entry points used by sync and discovery tooling. Parameters are summarized; see source for exact XML builders.

| Location | Method / export | Role | Parameters / inputs |
| --- | --- | --- | --- |
| `src/morawareClient.js` | `MorawareClient.ensureSession()` | Login; sets `sessionId` | Env: `MORAWARE_API_URL`, `MORAWARE_USERNAME`, `MORAWARE_PASSWORD`; `MORAWARE_ACCOUNT_ID` optional (empty string if unset) |
| `src/morawareClient.js` | `MorawareClient.morawareCommand(innerXml)` | POST Moraware command with session-wrapped body | `innerXml` string (e.g. `<jobQuery>…</jobQuery>`) |
| `src/morawareClient.js` | `MorawareClient.morawareCommandWithBody(xmlBody)` | POST full XML body (used for login-like flows) | Full `MorawareCommand` XML |
| `src/morawareDiscovery.js` | `collectGlobalSyncStyleJobListSample(client, options?)` | **Same job discovery path as global-sync** (process-scoped `jobQuery` paging) | Env: `MORAWARE_PROCESS_IDS`, `MORAWARE_MAX_PROCESSES`, `MORAWARE_MAX_SEARCH_PAGES`, `MORAWARE_SEARCH_PAGE_SIZE` (fallback `MORAWARE_PAGE_SIZE`), optional `MORAWARE_SYNC_*` date/year filters |
| `src/morawareDiscovery.js` | `buildJobQueryByProcessInnerXml(...)` | Inner XML for process-filtered job list pages | Used by global-sync and expanded discovery |
| `src/morawareClient.js` | `MorawareClient.listAllJobs({ includeCreationDate })` | Global paged job list (no process filter) | `includeCreationDate`; env `MORAWARE_PAGE_SIZE`, `MORAWARE_MAX_SEARCH_PAGES` / `MORAWARE_MAX_PAGES`; used as **fallback** only in expanded discovery |
| `src/morawareClient.js` | `MorawareClient.listAccountJobs({ accountId, includeCreationDate })` | Jobs for one account | `accountId`, `includeCreationDate` |
| `src/morawareClient.js` | `MorawareClient.getJobHeader({ jobId })` | Job header include subset | `jobId` |
| `src/morawareClient.js` | `MorawareClient.listJobFormIdsByJob({ jobId })` | List `jobForm` ids for a job | `jobId` |
| `src/morawareClient.js` | `MorawareClient.getJobFormFieldValuesDetail({ jobFormId })` | Single form fields + values | `jobFormId` |
| `src/morawareClient.js` | `fetchJobFormsAllFields(client, jobId, options)` | All worksheets for a job (SDK-style nested query) | `jobId`; optional `debugDir` / `MORAWARE_DEBUG_JOBFORMS_DIR` |
| `src/morawareClient.js` | `fetchJobOperationalAll(client, jobId, options)` | Job operational “include all” payload | `jobId`; optional `debugDir` / `MORAWARE_DEBUG_OPERATIONAL_DIR` |
| `src/morawareOperational.js` | `normalizeJobOperational(jobId, parsed)` | Normalize phases, contacts, activities from parsed `jobQuery` | Moraware parsed JSON |
| `src/morawareOperational.js` | `deriveOperationalSummary(jobId, operational)` | Derived schedule / signal flags | Output of `normalizeJobOperational` |
| `backend-core/src/scripts/morawareKeyShapeAudit.js` | `createKeyShapeCollector`, `analyzeJobNotesScope` | Sanitized recursive key/path audit for expanded discovery | Used when `MORAWARE_DISCOVERY_KEY_SHAPES=1` |
| `src/morawareDiscovery.js` | (various) | Legacy discovery helpers | See file — not required for expanded script |
| `src/morawareJobFormsSdk.js` | (normalizers) | Job form SDK normalization | Used by `fetchJobFormsAllFields` |
| `backend-core/src/scripts/syncMoraware.js` | sync orchestration | Production ingest | **Unchanged** by expanded discovery |

---

## Interpreting the JSON report

Each `categories[]` row includes:

- `available`: `yes` | `no` | `partial` | `unknown`
- `api_method_or_source`
- `sample_count`
- `fields_seen` (names only when snippets are off)
- `raw_payload_available`
- `notes`, `confidence`
- `recommended_ingestion_table`, `recommended_next_action`

The script **does not** guarantee Moraware schema stability across tenants or API versions; failed experiments are recorded under `calendar_query_experiments` and `errors`.

---

## What usually appears vs unknown

**Often observable from existing calls**

- Job header keys (`getJobHeader`), activities / contacts / phases (`fetchJobOperationalAll` + `normalizeJobOperational`), worksheet form names and field labels (`fetchJobFormsAllFields`).
- Account IDs on job records; account-scoped job lists (`listAccountJobs`).

**Often unknown without further XML research**

- Saved Moraware calendar “view definitions” (not referenced in eOS).
- Exact shapes for server-side date filters on `jobQuery` (the script runs a **best-effort** experiment).
- Rich file attachment metadata unless a dedicated include is confirmed for your Moraware version.

---

## Ingestion guidance (high level)

| Preserve raw | Normalize to tables |
| --- | --- |
| Full `jobQuery` / activity / form payloads in `raw_json` columns where policy allows | `brain_jobs`, `brain_job_activities`, `brain_job_contacts`, `brain_forms` / `brain_fields` (existing patterns) |
| Attachment references if Moraware returns stable IDs/URLs | Future `brain_job_files` metadata rows (no binaries in Postgres initially) |

**Heads that benefit:** operational / schedule heads, account history, install-checklist readiness, Titan-adjacent “who/when/what” once assignee columns exist — see `docs/MORAWARE_COVERAGE_TO_HEADS_MAP.md`.

---

## Related

- Script: `backend-core/src/scripts/discoverMorawareExpandedCoverage.js`
- Plan: `docs/MORAWARE_UI_INGESTION_EXPANSION_PLAN.md` — section *Next live discovery step*
- UI matrix: `docs/MORAWARE_UI_COVERAGE_MAP.md`
