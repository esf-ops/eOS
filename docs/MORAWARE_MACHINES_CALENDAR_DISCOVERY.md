# Moraware Machines calendar — discovery and Brain modeling

## 1. What the PDF showed

Eric’s Moraware **Machines** calendar uses a URL shaped like:

`/sys/calendar?&view=146&effdate=2026-05-07`

Observed UI attributes from export / notes:

- **View:** Machines  
- **View id:** `146` (tenant-specific; configurable via `MORAWARE_MACHINES_VIEW_ID`)  
- **Activity types in view:** Saw, Polish  
- **Assigned To (row labels):** Robot 1, Saber 1, Saber 2, Titan 1 (2k), Titan 2 (3k), Titan 3 (3k), Titan 4 (2k), Titan 7 (3k), Titan 8 (3k)  
- **Color activities by:** Activity Type  

The grid shows **jobs scheduled across machine rows** by date/time. Eric **crosses jobs off** when Moraware **activity status** changes—not when physical equipment sends telemetry.

## 2. Why this matters for Eric’s checklist

Titans Flowing / shop heads need a **checklist-shaped** answer:

- Which jobs are **on each machine** for a given day?  
- Which are **still scheduled** vs **done**?  
- What text (notes, phase, account) supports a quick human scan?

That is **Moraware schedule semantics**, not CNC or saw telemetry.

## 3. What eOS can already infer

With **operational ingest** and expansion columns:

- **Activity type** — `activity_type_name` / legacy `activity_type` (e.g. Saw, Polish).  
- **Status** — `status_name` / legacy `activity_status`; **Complete** is the natural “crossed off” signal when the status label matches Moraware’s completed state.  
- **Schedule** — `start_date`, `sched_time`, `duration` for ordering within a day.  
- **Context** — `phase_name`, `notes`, `description`; job header from `brain_jobs` (name, account, city) when joined in an API.  
- **`/api/titans/today`** — existing Brain-only Titan/Saw **keyword** grouping; **unchanged** by this discovery work.

### Machines row assignment — current discovery status

The same script now writes a **second** report focused on **where Moraware stores machine/resource assignment** for Saw/Polish:

- `debug/moraware/latest/machines-assignment-key-discovery.json`  
- `debug/moraware/latest/machines-assignment-key-discovery.txt`  

That pass includes:

- **Per-include `jobActivityQuery` probes** — many speculative include tags (`assignedTo`, `resource`, `machine`, `calendarResource`, …); each result is classified as accepted / empty / Moraware error / transport error (nothing is assumed correct without tenant validation).  
- **`jobQuery` nested `jobActivity` include experiments** — narrow XML shapes to see if Moraware returns assignee-like keys on activity rows.  
- **Structural key paths** on Saw/Polish activity `raw` objects (paths only; no customer text unless `MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=1`).  
- **Token search** for Eric’s machine labels plus normalized variants (`titan 1`, `titan1`, …) across raw JSON paths, notes, description, type/status/phase fields, and **read-only** `brain_job_activities.raw_json` (substring match only; report lists token, path, area, counts, sample `job_id`).  
- **Optional GET** of `/sys/calendar?view=…&effdate=…` HTML — **discovery only**; uses `MORAWARE_WEB_BASE_URL` or a derived host from `MORAWARE_API_URL`. Marked **“possible but not preferred until validated”** if HTML looks unauthenticated-rich; otherwise documented as login/session gated.  
- **Outcome A / B / C** in the JSON: structured API field vs HTML/view rendering vs not found — with recommended next steps.

**Current finding:** Saw/Polish activities are reconstructable by **date, type, status, sched_time, duration** from `jobQuery` operational payloads and Brain.

**Blocker:** In typical samples, **machine row assignment** (Robot 1, Saber 1, Titan 1 (2k), …) has **not** appeared as a stable structured field on activity `raw` nodes; the checklist cannot be **machine-row accurate** until `assigned_machine` (or equivalent) is sourced from Moraware or a validated alternate (e.g. controlled calendar import).

**Next discovery approach:** Re-run after Moraware publishes API/SDK details for **calendar resource rows**; compare UI row labels to any new include payloads; if only HTML exposes rows, decide between a **controlled** calendar-view importer vs vendor support for a proper query.

## 3b. Activity assignment / resource investigation (XML API vs SDK)

**XML / HTTP API (eOS `jobQuery` operational + `jobActivityQuery` probes)**  
In current read-only discovery, Saw/Polish activities expose **schedule and status** (`start_date`, `sched_time`, `duration`, `status_name` / legacy `activity_status`, type, notes, etc.) but **not** a reliable **machine row / Assigned To** field on the activity `raw` object. Outcome **C** in `machines-assignment-key-discovery.json` means: *in sampled payloads, assignment was not found as structured data.*

**Brain (`brain_job_activities`)**  
Operational sync populates Saw/Polish rows with strong **schedule/status** coverage; **machine tokens** (Titan/Saber/Robot labels) appear only rarely in text/`raw_json` substring scans — so **machine row cannot be inferred** from Brain alone today.

**.NET SDK (`JobTrackerAPI5.dll`)**  
The repo includes a small trace tool under `tools/moraware-sdk-trace/`:

- **`MORAWARE_SDK_TRACE_MODE=assignment`** — reflects **public type/method/property names** from the DLL (no credential payload in the report file) and writes:  
  `debug/moraware/latest/moraware-sdk-activity-assignment-surface.{json,txt}`  
- **Full surface inventory** (same run): `debug/moraware/latest/moraware-sdk-full-surface.{json,txt}` — all public types in `Moraware.JobTrackerAPI5` with properties, methods (signatures), nested types, and filtered read/write/assignment sections; **full** `Connection` method list (alphabetical, overloads with parameters). Or run only full surface: `npm run eos:inspect:moraware-sdk-full`.  
- **SDK reflection (read-only):** types such as **`JobActivity`** expose **`Assignees`**; **`Assignee`** includes **`AssigneeId`**, **`AssigneeName`**, **`Description`**, etc. **Hypothesis:** Moraware **Machines** calendar row assignment is carried on **`JobActivity.Assignees`** (machine labels like Titan/Saber/Robot align with **`Assignee.AssigneeName`**). **Live probe** against a real job is needed to confirm on tenant data. If confirmed, the next modeling step is to normalize **`assignee_id` / `assignee_name` / `assigned_machine`** into Brain activity rows (no sync change until validated).  
- Optional **read-only live probe** (off by default): set `MORAWARE_SDK_ASSIGNMENT_INCLUDE_LIVE_PROBE=1` plus **`MORAWARE_URL` or `MORAWARE_API_URL`** (same fallback as Node sync), `MORAWARE_USERNAME`, `MORAWARE_PASSWORD`; uses safe **`GetJob`/`LoadJob`/`QueryJob`-style** calls only (no create/update/delete paths), then summarizes **`JobActivity.Assignees`** (assignee names allowed; notes/description lengths only).  
- From repo (stub if no dotnet/DLL): `npm run eos:inspect:moraware-sdk-assignment`  
- **Live .NET SDK connection on Mac** may fail with **`System.Windows.Forms`** load errors; use **Windows / .NET Framework** for a live SDK probe, or rely on **XML/API** discovery below.

### 3c. XML assignee probe (SDK-aligned `jobActivityQuery` / `jobQuery` includes)

Read-only script: **`npm run eos:probe:moraware-assignee-xml`** (`backend-core/src/scripts/probeMorawareAssigneeXml.js`).

- **Defaults:** job **38837**, Machines view **146** and **2026-05-07** recorded as metadata only; baseline includes per probe: `activityType`, `status`, `startDate`, `schedTime`, `duration`, `notes`, `jobPhases`, plus one speculative include (e.g. `assignees`, `Assignees`, `jobActivityAssignees`, `assignedTo`, `resource`, …). Same tags are also merged into `discoverMorawareMachinesCalendar.js` single-tag probes.  
- **Outputs:** `debug/moraware/latest/machines-assignee-xml-probe.{json,txt}` — per include: `accepted_or_error`, `activity_count`, `assignee_like_key_paths`, `assignee_name_like_paths`, `machine_token_matches` (paths + token + length only; **no** customer note text), sample activity/job ids.  
- **Optional:** `MORAWARE_ASSIGNEE_XML_PROBE_CAPTURE_XML=1` — sanitized outgoing command XML (session redacted; **no** password). `MORAWARE_ASSIGNEE_XML_PROBE_INCLUDE_RAW_RESPONSE=1` — truncated redacted response excerpt for local debugging only.

**Interpret `assignment_outcome.outcome` in the JSON:**

- **Outcome A — XML activity assignees found:** At least one include produced assignee-like **name/id** values or machine-label tokens under assignee-shaped paths. **Likely mapping:** nested structure analogous to **`activity.assignees.assignee.name`** (exact tag names vary by tenant/version — confirm in `machines-assignee-xml-probe.json`). **Suggested Brain extensions (design-only until validated):** `brain_job_activity_assignees` (normalized rows), or **`brain_job_activities.assignee_names`** (`jsonb` / `text[]`), plus **`assigned_machine`** / **`work_center`** text for the primary calendar row label.  
- **Outcome C2 — SDK exposes `JobActivity.Assignees`, XML include not found:** No include in this run surfaced assignee fields on XML activities. Prefer **(1)** run the **live SDK probe on Windows/.NET Framework**, or **(2)** ask Moraware which **XML include** mirrors **`JobActivity.Assignees` / `AssigneeName`** for `jobActivityQuery` (see support draft).

### 3d. SDK activity read-method analyzer (offline, full surface JSON)

After **`moraware-sdk-full-surface.json`** exists (from `npm run eos:inspect:moraware-sdk-assignment` or `eos:inspect:moraware-sdk-full`), run:

**`npm run eos:analyze:moraware-sdk-activity`**

This executes **`backend-core/src/scripts/analyzeMorawareSdkActivityMethods.js`** — it **does not** call Moraware or Supabase. It ranks **`Connection`** methods whose names/signatures suggest **read-only** access to **`JobActivity`**, **assignee/calendar/resource** surfaces, and flags **`Create*` / `Update*` / …** as **do not call**.

**Outputs:** `debug/moraware/latest/moraware-sdk-activity-method-analysis.{json,txt}` — top candidates are typically **`GetJobActivity`**, **`GetJobActivities`**, **`GetJob`**, **`GetJobActivitiesForSeries`**, etc. **Whether `Assignees` is populated** still requires a **live SDK call on Windows/.NET Framework** (or Moraware documentation). If no safe read path is confirmed, next steps remain **Moraware support** or **Windows SDK probe**.

### 3e. Targeted SDK activity read probe (live Connection, allowlisted `Get*` only)

The **XML include probe** did **not** expose **`Assignees`** on HTTP payloads (**Outcome C2**). The **offline analyzer** (§3d) lists plausible **`Connection`** read methods. To see whether **`JobActivity.Assignees`** is populated from the SDK for real tenant data, run the **targeted read probe** (still **no** XML/sync/Supabase writes — only SDK **`GetJob*` / `GetJobActivity*`** calls):

**`npm run eos:probe:moraware-sdk-activity-read`**

- **Tool:** `MORAWARE_SDK_TRACE_MODE=activity-read-probe` (`tools/moraware-sdk-trace`). Calls only **allowlisted** read APIs: **`GetJobActivities`**, **`GetJob`**, **`GetJobActivity`** (after resolving ids), **`GetJobActivitiesForSeries`** (when **`JobActivitySeriesId`** appears on a sampled activity), **`GetJobActivityTypes`**, **`GetJobActivityStatuses`**. Never **`Create*`/`Update*`/`Delete*`/`…`**.  
- **Credentials:** **`MORAWARE_URL`** or **`MORAWARE_API_URL`**, **`MORAWARE_USERNAME`**, **`MORAWARE_PASSWORD`** (password never logged).  
- **Inputs:** **`MORAWARE_SDK_PROBE_JOB_ID`** (default **38837**), optional **`MORAWARE_SDK_PROBE_JOB_ACTIVITY_ID`**, **`MORAWARE_SDK_PROBE_MAX_ACTIVITIES`** (default **50**).  
- **Outputs:** `debug/moraware/latest/moraware-sdk-activity-read-probe.{json,txt}` — per-method **`success`/`error`**, **`assignees_populated`** summary, activity samples (**notes length only**).  
- If **`System.Windows.Forms`** (or similar) blocks startup on **Mac**, classify as **environment blocker** in the report — use **Windows / .NET Framework** or ask **Moraware** which read overload populates **`Assignees`**.

**Suspected next sources for `assigned_machine`**

1. A **documented** Moraware include or SDK member that maps activity → **resource / calendar row** (preferred).  
2. **Moraware support / official API docs** clarifying where Machines view stores assignment (see `docs/MORAWARE_SUPPORT_QUESTION_ACTIVITY_ASSIGNMENT.md`).  
3. Only if validated: a **controlled** calendar HTML read (discovery already notes login/session risk — **not preferred** for production).

## 4. What remains unknown

- **Saved view definition** — Whether Moraware exposes view `146` (filters, columns, colors) through the **same XML API** eOS uses for `jobQuery` / `jobActivityQuery` is **not proven** in-repo. The UI URL is a **web app** concern until a supported command is documented for your tenant.  
- **Machine assignment** — Which XML/JSON path reliably carries **“Titan 1 (2k)”** vs free text in notes is **not yet normalized** into Brain columns. Candidates include `assignedTo`, `resource`, `employee`, `crew`, `machine`, calendar-related nodes, or **text-only** hints in `notes` / `description`.  
- **Sort within a row** — Moraware may use finer ordering than `sched_time` + `duration`; that must be validated against the live UI.

## 5. Saved Moraware view definitions — accessible?

**Not via checked-in eOS client code today.**  
`src/morawareClient.js` implements session + `jobQuery`, `jobFormQuery`, `jobActivityQuery`, etc.—not a first-class “export calendar view 146” API.

The read-only script `backend-core/src/scripts/discoverMorawareMachinesCalendar.js` sends **speculative** probes (`calendarQuery`, `viewQuery`, `savedViewQuery`) and records success/failure **without** changing sync behavior. Treat positive results as **tenant-specific** until repeated on production and aligned with Moraware documentation.

## 6. Should eOS reconstruct the Machines view from activities?

**Yes, as the default plan:** treat the Machines calendar as a **projection** of:

- `brain_job_activities` (types, status, dates, times, notes, `raw_json`), plus  
- `brain_jobs` (job name, account, city, worksheet-derived Sq.Ft. when needed), plus  
- explicit **business rules** (machine list, type allowlist, checklist state rules).

This matches the approach already described for other Moraware calendar surfaces: **reconstruct in eOS**, do not depend on Moraware persisting view XML in Brain.

## 7. Proposed future Brain fields

| Field | Purpose |
|--------|---------|
| `activity_type_name` | Already populated when operational expansion is on; primary filter for Saw/Polish. |
| `status_name` | Same; drives **Complete** vs in-flight. |
| `phase_name` | Context on the floor. |
| `start_date` | Calendar day bucketing. |
| `sched_time` | Intra-day ordering on a machine row. |
| `duration` | Block length / secondary sort. |
| `notes` / `description` | Human scan; may hold machine hints until structured assignee exists. |
| **`assigned_machine`** (new, nullable) | Normalized machine row label when Moraware path is proven stable. |
| **`work_center`** (new, nullable) | If Moraware distinguishes work center from assignee name. |
| **`sort_order_on_machine_day`** (new, nullable) | Derived: `sched_time` then tie-breakers (`job_id`, `activity_index`). |
| **`checklist_state`** (new, nullable) | Derived enum for API convenience: `complete` \| `scheduled` \| `needs_review`. |

**Checklist state rules (v1 proposal):**

- **complete** — Activity status indicates **Complete** (word match on normalized status).  
- **scheduled** — Saw/Polish activity on target date with schedule fields and resolvable machine.  
- **needs_review** — Missing status, machine, or schedule, or conflicting duplicates.

## 8. Proposed future endpoint

`GET /api/titans/machines-day?date=2026-05-07`

**Response shape (contract sketch — not implemented yet):**

```json
{
  "ok": true,
  "label": "Moraware Machines calendar signals",
  "date": "2026-05-07",
  "source": {
    "morawareViewId": 146,
    "activityTypes": ["Saw", "Polish"],
    "note": "Reconstructed from Moraware activity/status signals, not machine telemetry."
  },
  "machines": [
    {
      "machineName": "Titan 1 (2k)",
      "scheduledJobs": [
        {
          "jobId": "",
          "jobName": "",
          "account": "",
          "city": "",
          "activityType": "",
          "status": "",
          "phaseName": "",
          "scheduledTime": "",
          "duration": "",
          "notes": "",
          "squareFeet": null,
          "checklistState": "scheduled"
        }
      ]
    }
  ],
  "totals": {
    "scheduledJobs": 0,
    "completeJobs": 0,
    "activeOrPendingJobs": 0,
    "scheduledSqft": 0
  }
}
```

**Important:** This endpoint would be **read-only Brain** (and optionally Moraware live fetch in a later phase), **not** equipment telemetry.

## 9. How to run discovery

```bash
npm run eos:discover:moraware-machines
```

Environment (defaults shown):

| Variable | Default | Meaning |
|----------|---------|---------|
| `MORAWARE_MACHINES_VIEW_ID` | `146` | View id from Moraware URL (for probe only). |
| `MORAWARE_MACHINES_EFFDATE` | `2026-05-07` | Center date for activity window. |
| `MORAWARE_MACHINES_DATE_WINDOW_DAYS` | `3` | ± days around effdate for activity `start_date`. |
| `MORAWARE_MACHINES_ACTIVITY_TYPES` | `Saw,Polish` | CSV type filter. |
| `MORAWARE_MACHINES_ASSIGNED_TO` | *(Eric’s machine list)* | CSV labels for substring / bucket matching heuristics. |
| `MORAWARE_MACHINES_SAMPLE_JOBS` | `10` | Max jobs to pull operational payloads for. |
| `MORAWARE_MACHINES_BRAIN_SAMPLE_LIMIT` | `600` | Max `brain_job_activities` rows for optional Supabase read. |
| `MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS` | `0` | Set `1` only in controlled environments (may include PII in debug files). |
| `MORAWARE_MACHINES_INCLUDE_PROBE_MAX_TAGS` | all tags | Cap speculative `jobActivityQuery` single-include probes. |
| `MORAWARE_MACHINES_TRY_CALENDAR_HTML` | `1` | Set `0` to skip GET `/sys/calendar` HTML probe. |
| `MORAWARE_WEB_BASE_URL` | *(derived)* | Moraware **web** origin for calendar HTML (API URL may differ). |

Outputs:

- `debug/moraware/latest/machines-calendar-discovery.json`  
- `debug/moraware/latest/machines-calendar-discovery.txt`  
- `debug/moraware/latest/machines-assignment-key-discovery.json`  
- `debug/moraware/latest/machines-assignment-key-discovery.txt`  

**No Supabase writes.** Optional Brain read uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` if set.

## 10. Related code

- `backend-core/src/scripts/discoverMorawareMachinesCalendar.js` — this discovery.  
- `backend-core/src/scripts/probeMorawareAssigneeXml.js` — SDK-aligned assignee XML includes (`npm run eos:probe:moraware-assignee-xml`).  
- `backend-core/src/scripts/analyzeMorawareSdkActivityMethods.js` — offline ranking of Connection read methods (`npm run eos:analyze:moraware-sdk-activity`).  
- `backend-core/src/scripts/emitMorawareSdkActivityReadProbe.js` — live allowlisted SDK read probe (`npm run eos:probe:moraware-sdk-activity-read`).  
- `backend-core/src/scripts/emitMorawareSdkAssignmentSurfaceReport.js` — optional SDK assignment + full surface emit (`npm run eos:inspect:moraware-sdk-assignment`).  
- `backend-core/src/scripts/emitMorawareSdkFullSurfaceReport.js` — full SDK inventory only (`npm run eos:inspect:moraware-sdk-full`).  
- `tools/moraware-sdk-trace/` — `JobTrackerAPI5.dll` reflection + optional read-only `Connection` probe (`MORAWARE_SDK_TRACE_MODE=assignment`).  
- `docs/MORAWARE_SUPPORT_QUESTION_ACTIVITY_ASSIGNMENT.md` — draft for Moraware support.  
- `backend-core/src/scripts/discoverMorawareExpandedCoverage.js` — broader operational key scan.  
- `backend-core/src/scripts/morawareKeyShapeAudit.js` — sanitized path/key audit helpers.  
- `src/morawareOperational.js` — `normalizeJobOperational`, `mergeActivityFieldsForBrainInsert`.  
- `backend-core/src/titans/titansToday.js` — existing `/api/titans/today` grouping (unchanged).
