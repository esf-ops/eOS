# Moraware UI → eOS Brain coverage map

**Elite Operating System (eOS)** for Elite Stone Fabrication.

> Moraware records the work. eOS explains the work. The heads move the work.

---

## 1. Executive summary

eOS Brain currently captures a **strong operational subset** of Moraware—jobs, worksheet forms and fields (including Sq.Ft. aggregation per established rules), job activities (when operational ingest is enabled), phases, job-level contacts, operational summary signals, and sync health metadata. **Not every possible Moraware object, calendar saved view, file attachment catalog, or account-level artifact has been proven complete** in production Brain tables.

This document aligns **Moraware UI categories** (what fabricators see in Moraware every day) with **what the sync pipeline actually persists** today. It complements:

- `docs/MORAWARE_DATA_COVERAGE_MAP.md` (table-centric recap)
- `debug/moraware/latest/moraware-ui-coverage-matrix.{json,txt}` from `npm run eos:audit:moraware-ui-coverage`

**Standing rule:** Moraware coverage remains a **priority**; do **not** overclaim completeness until measured on real payloads and spot-checked against Moraware screens.

---

## 2. What eOS Brain currently sees (high confidence)

| UI theme | Ingestion path | Supabase (primary) |
| --- | --- | --- |
| Job list / job header core | `MorawareClient` jobQuery variants; `runMorawareDiscovery` → `upsertBrainJob` | `brain_jobs` |
| Worksheet forms & field grid | `fetchJobFormsAllFields` / `morawareJobFormsSdk.js` → `upsertBrainForms`, `upsertBrainFields` | `brain_forms`, `brain_fields` |
| Worksheet Sq.Ft. totals | `computeWorksheetSqFtMetrics` → `brain_jobs.worksheet_sqft` | `brain_jobs` (**math unchanged**) |
| Job activities (types, status, dates, schedule text) | `fetchJobOperationalAll` + `normalizeJobOperational` when `MORAWARE_INGEST_OPERATIONAL=1` → `replaceJobOperational` | `brain_job_activities` |
| Job contacts (job-scoped) | `normalizeJobOperational` → `replaceJobOperational` | `brain_job_contacts` |
| Phases | `normalizeJobOperational` | `brain_job_phases` |
| Operational heuristics | `deriveOperationalSummary` | `brain_job_operational_summary` |
| Sync observability | `syncMoraware.js` / discovery | `brain_sync_runs`, `eos_failed_job_syncs`, `eos_sync_locks` |

**Raw preservation:** `brain_jobs`, `brain_forms`, `brain_fields`, `brain_job_*` rows carry **`raw_json`** (or equivalent) so future parsers can deepen normalization without losing source shape.

---

## 3. What eOS Brain partially sees

| UI theme | Why “partial” |
| --- | --- |
| **Job info** (stone/color, scope lines) | Header row is thin; rich detail often lives in **notes** or **worksheet fields**, not guaranteed denormalized columns. |
| **Job worksheet / “special” forms** | Stored generically in `brain_forms` / `brain_fields`; template semantics require **known template IDs** or label rules. |
| **Install inspection / accounting-style forms** | Same storage as worksheets—**no dedicated checklist/finance tables** yet. |
| **Calendar / schedule-equivalent data** | **Activity rows** capture type, status, `start_date`, `sched_time`, `duration`, text—but **not** Moraware’s saved calendar view definitions, grid layout, or color rules. Reconstruction is an **eOS responsibility** on top of Brain. |
| **Account context on jobs** | `account_id` / `account_name` on `brain_jobs`; deeper **account** records (notes, defaults) are **not** a separate Brain table today. |

---

## 4. What eOS Brain does not yet see (or has not proven)

| UI theme | Status |
| --- | --- |
| **Dedicated job & account addresses** as first-class columns/tables | Not written by `supabaseBrainStore` (discovery may extract text for artifacts only). |
| **Account-wide contacts** (rolodex separate from job contacts) | Not in proven sync → Brain path. |
| **Files / attachments catalog** in Supabase | Discovery probes exist; **production Brain store** does not persist file metadata tables. |
| **Moraware saved searches / UI filter definitions** | Not imported; eOS must implement filters as queries. |
| **JWD / reminder history** as structured entities | **Unknown** in repo normalization—may appear inside activity `raw_json` until proven. |
| **Issues (job/account)** | **Unknown** / no dedicated table. |
| **Machine / truck / programmer rows** as structured FKs | **Unknown**—likely require parsing `raw_json` / description text from activities. |
| **Daily scheduled worksheet Sq.Ft. by calendar day** | **Not precomputed** in Brain. |
| **Moraware “view definition” API** for Ron’s View, Shop View, etc. | **No evidence** in codebase of consuming saved view XML; assume reconstruction from activities + business rules. |

---

## 5. Calendar / schedule view discovery

### 5.1 Saved Moraware views

- **View definitions:** Not referenced in `src/morawareClient.js` beyond **`jobQuery`** / **`jobFormQuery`** style commands. There is **no** checked-in client for “export Moraware calendar layout.”
- **Practical approach:** Treat Moraware calendar UIs as **projections** of the same underlying **activities** (plus account/job metadata). eOS should **rebuild** Shop/Machine/Programming/Install/30-day fabrication views from **`brain_job_activities`** + `brain_jobs` + `brain_fields` as needed.

### 5.2 API query capabilities (inferred from code, not Moraware vendor docs)

| Capability | Evidence |
| --- | --- |
| Activities per job | `buildJobIncludeAllCommand` → `fetchJobOperationalAll` |
| Filter by activity type in eOS | SQL / app logic on `activity_type` |
| Filter by date range | `start_date` column (YMD) + optional `sched_time` string |
| Filter by assignee / machine | **Not proven** as dedicated columns—**inspect `raw_json`** samples |

### 5.3 Coverage dimension matrix (summary)

| Dimension | Coverage |
| --- | --- |
| `calendar_views` | **partial** (reconstruct; no Moraware view export) |
| `schedule_rows` | **partial** (`brain_job_activities`) |
| `assigned_to` | **unknown** (not normalized) |
| `scheduled_time` | **partial** (`sched_time` string) |
| `duration` | **partial** (`duration` string) |
| `unscheduled_bucket` | **unknown** (infer by rules) |
| `machine_assignment` | **unknown** |
| `person_assignment` | **unknown** |
| `truck_assignment` | **unknown** |
| `daily_scheduled_sqft` | **no** (design-time) |
| `view_definition` | **no** |

Full detail: `moraware-ui-coverage-matrix.json` → `calendar_dimensions`.

---

## 6. Why Moraware views are operational gold

Calendar and schedule surfaces compress **truth about flow**: what is scheduled, for which resource, when work should start, how long it blocks a machine or crew, what is still **unscheduled**, and how much **worksheet Sq.Ft.** is implied for a day. That is how eOS answers:

- Where are jobs in the schedule?
- Who or what owns the next step?
- What is overloaded or starved?
- What is blocking the Titans?

---

## 7. Which future heads need each category (overview)

See **`docs/MORAWARE_COVERAGE_TO_HEADS_MAP.md`** for the per-head matrix. In short:

- **Executive / Titans / Shop TV / schedule heads** → activities + worksheet Sq.Ft. + signals.
- **Sales / Quote / Partner** → forms, fields, files (later), contacts.
- **Install / Trucks / Programming** → activities + addresses + assignments (as they become structured).
- **Finance** → accounting-oriented forms + strict ACL.
- **Customer Service / Quality** → activities, issues (when available), forms, files metadata.

---

## 8. Sensitive data & access control

| Class | Examples | Handling |
| --- | --- | --- |
| **customer_contact** | phones, emails, addresses | Head access + future dealer scoping; minimize logging. |
| **financial** | invoice #, billing flags | Executive/finance roles only; consider separate store. |
| **internal** | shop comments, assignments | Operational heads. |

Frontend hiding is **not** security—**backend** `requireAuth` / `requireHeadAccess` / roles already gate APIs.

---

## 9. Normalize vs preserve raw

| Pattern | When |
| --- | --- |
| **Normalize** | Stable enums: activity type/status, dates, worksheet Sq.Ft., known template fields. |
| **Preserve raw_json** | Everything else until XML paths are proven—especially **activities**, **forms**, future **files** and **reminders**. |

---

## 10. What not to overclaim

- Do **not** claim eOS Brain “sees everything Moraware shows” until **category-by-category** proof (payload samples + row counts + UI spot checks).
- Do **not** assume calendar colors, machine row labels, or saved view names round-trip through the API unless verified.
- Do **not** change **worksheet Sq.Ft. math** or destructive schemas while expanding—**additive** tables/columns first.

---

## Regenerate artifacts

```bash
npm run eos:audit:moraware-ui-coverage
```

Outputs:

- `debug/moraware/latest/moraware-ui-coverage-matrix.json`
- `debug/moraware/latest/moraware-ui-coverage-matrix.txt`
