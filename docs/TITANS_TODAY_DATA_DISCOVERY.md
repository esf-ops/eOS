# Titans “Today” — data discovery for `GET /api/titans/today`

This document supports the **“Are the Titans Flowing?”** widget in the Executive Head: digitize Eric’s paper Titan list with Brain-backed Moraware data — **not** raw Moraware calls from the browser.

**Pitch:** *This is the digital version of the paper list — except now it updates itself from Moraware, follows the Titan saws in real time, and can be seen from anywhere.*

---

## 1. Which Brain tables can power `/api/titans/today` today

| Table | Role |
| --- | --- |
| `brain_job_activities` | **Primary:** activity types (e.g. “Titan Program”, “Saw”, “Saw Program”), statuses (“Auto-Schedule”, “Complete”, …), `start_date`, `sched_time`, optional text in `description` / `notes`, `synced_at`. |
| `brain_jobs` | Job name, account, `worksheet_sqft`, optional `job_status`, dates. |
| `brain_fields` | Material/color via `normalized_label` / `label` + `value`; Sq.Ft. line items if worksheet total missing. |
| `brain_job_operational_summary` | Boolean signals: template, order stone, install, fabrication, saw, slab, CS/remake/changes — for **heuristics** (material risk, template gating). |
| `brain_forms` | Context (e.g. “Job Worksheet”) — template name frequency for validation; not required for every Titan row. |
| `brain_job_phases` | Optional extra phase naming if synced; schema exists; volume may be low depending on ingest mode. |

**No Moraware XML/query changes** are required for discovery; the endpoint should read **Brain only** for v1.

Regenerate numbers after major syncs:

```bash
npm run eos:audit:titans-today
```

Artifacts: `debug/moraware/latest/titans-today-readiness.{json,txt}`.

---

## 2. Activity types that represent Titan / saw / cutting work

From Brain aggregates (see audit **Part 1**), types that **typically** indicate shop floor / saw path include:

- **Explicit:** “Titan Program”, “Saw Program”, “Saw”, “Fabrication”, “Polish”, “Template” (feeds sequencing).
- **Lexical matches** (regex over `activity_type` + `activity_status` + notes): `titan`, `saw`, `cutting`, `cut`, `cnc`, `program`, `fabrication`, `fab`, `polish`, `shop`, `production`.

**Schema note:** `brain_job_activities` does not store a separate `activity_type_id` in our Supabase schema — classification is **text-based** on Moraware exports.

---

## 3. Status mapping (what maps cleanly)

Moraware statuses in Brain are **free-text** (e.g. “Auto-Schedule”, “Complete”, “Estimate”, “Scheduled”, “Installed”). Buckets that map **reasonably well**:

| Moraware-style bucket | Interpretation |
| --- | --- |
| Complete / Installed / Done | Terminal success for that activity row |
| Scheduled / Estimate / Auto-Schedule | Not yet complete; queue / calendar noise depends on shop convention |
| Hold / Cancel / Delay (if present) | Exception path |

**There is no PLC telemetry** in Brain — “cutting now” is an **inference** from status + activity type + ordering, not guaranteed blade state.

---

## 4. How material color can be found

1. **Prefer:** `brain_fields` where `normalized_label` or `label` matches `color`, `material`, `granite`, `quartz`, `slab` (and take `value`).
2. **Fallback:** scan same job’s fields with broader worksheet labels if color is embedded in description (future refinement only).
3. **Not on** `brain_jobs` as a first-class column today — expect denormalization only if product adds it later.

---

## 5. How Sq.Ft. can be found

1. **Prefer:** `brain_jobs.worksheet_sqft` (aggregated worksheet total from existing pipeline — **do not change math**).
2. **Fallback:** sum numeric `brain_fields` rows whose labels match Sq.Ft. patterns for that job (audit script uses a narrow query — endpoint can reuse the same policy as Executive aggregates).

---

## 6. Known gaps

- **“Today” definition:** Activities use `start_date` (date). True “cutting right now” may need `sched_time` parsing + timezone policy; Brain `synced_at` reflects **ingest** time, not shop floor time.
- **Titan vs generic saw:** Distinguished by text (“Titan Program”) — no machine id.
- **Low volume on a calendar day:** If no `start_date = today` Titan-like rows, the widget should show a clear **empty state**, not fake throughput.
- **Live Moraware:** Possible later **server-side** refresh or hybrid job; **never** from the frontend. Not required for discovery completion.

---

## 7. Recommended endpoint design (v1)

- **Route:** `GET /api/titans/today`
- **Auth:** `requireAuth()` + `requireRole(["admin", "executive"])` (same family as Executive routes).
- **Query params (optional):** `date=YYYY-MM-DD` (default: server local today), `tz` (future; document default).
- **Source:** Supabase Brain tables above; **no** Moraware client in request path.
- **Response shape:** Align with product JSON (`ok`, `lastUpdated`, `source`, counters, `jobs[]` with leadership statuses).
- **Labeling:** If inference is soft, set `sourceDetail` or doc string to **“Titan/Saw Activity Signals (Brain)”** — do not claim machine telemetry.

**Caching:** Short TTL (e.g. 30–60s) in-process or `Cache-Control: private, max-age=30` if CDN-safe; data is user-specific via auth.

**Frontend polling:** 30–60s for shop-floor mood; backoff when tab hidden.

**Empty state:** `{ ok: true, jobs: [], activeTitanJobs: 0, …, message: "No Titan/Saw activities scheduled for this date in Brain." }`

---

## 8. Fallback if data is incomplete

- Return **partial rows** with null `materialColor` or `squareFootage` when missing.
- Use **operational summary** flags only as **hints** (e.g. “possible material risk”), not as the main status enum until rules are validated with Eric’s list.
- **Never** synthesize throughput metrics from guesses.

---

## 9. Brain-only vs hybrid

| Approach | When |
| --- | --- |
| **Brain-only (recommended v1)** | Ship fast; respect “no sync change”; matches Executive trust model. |
| **Hybrid** | Optional `backend-core` Moraware **read** for same-day refresh *after* explicit design + env guards — still not frontend. |
| **Direct Moraware only** | Rejected for browser; only server-side if ever added. |

---

## Implementation plan for `GET /api/titans/today`

1. **Auth:** `admin`, `executive` (extend later for `production` / `shop_tv` if product wants).
2. **Data pull (Brain):**
   - Load activities for target **calendar date** (`start_date = :ymd`) where combined text matches Titan/saw/cutting heuristic (same keyword set as audit).
   - Join `brain_jobs` on `job_id`.
   - Left-join `brain_job_operational_summary` on `job_id`.
   - Fetch color fields per job (batched `IN` queries) and `worksheet_sqft`.
3. **Derive each job row:**
   - `lastPhaseUpdate`: max(`synced_at` or parsed `sched_time` / `start_date`) for activities in scope — document chosen rule in code comment.
   - `status` (leadership enum): map from `activity_status` + type + operational hints per §3/§7 audit `proposed_rules`; unknown → “Queued for Titan” or “Held / Needs Review” conservatively.
4. **Aggregates:** `activeTitanJobs` = distinct jobs in non-terminal states per mapping; `completedToday` = terminal for today slice; `totalSqftToday` = sum `worksheet_sqft` (or field fallback); `averageCompletionPace` = optional null until throughput windows defined.
5. **Tests:** Unit-test status mapper with strings from `titans-today-readiness.json`; integration test against Supabase mock or staging snapshot.
6. **Observability:** Log count of activities scanned and date filter for support.

---

## v1 endpoint (implemented)

| Item | Detail |
| --- | --- |
| **Route** | `GET /api/titans/today` |
| **Implementation** | `backend-core/src/titans/titansToday.js` (payload builder), registered in `backend-core/src/server.js` |
| **Auth** | `requireAuth()` + `requireRole(["admin", "executive"])` |
| **Query params** | `date=YYYY-MM-DD` (optional; default server **local** calendar today), `limit` (default **50**, max **200** — Executive Titan widget requests **200** for a fuller same-day slice) |
| **Labeling** | Response `label`: **"Titan/Saw activity signals"** — not machine telemetry |
| **Brain tables** | `brain_job_activities` (`start_date` = selected day, Titan keyword filter), `brain_jobs`, `brain_job_operational_summary`, `brain_fields` (color + Sq.Ft. fallback only) |
| **Date rule** | Activities matched on `start_date` = `localDate`; recency for tie-break uses `synced_at` then `start_date` (see `activityRecencyMs` in code). |
| **Metrics** | `activeTitanJobs`, `completedToday`, `heldOrNeedsReview`, `totalSqftToday` are computed over **all** Titan-like jobs for that date; `jobs` is **truncated** to `limit` (most recently updated first). |
| **Empty state** | `emptyStateMessage` set when no Titan-like rows for the date; metrics zeroed; `ok: true`. |

### Response shape (reference)

**Core (v1):** `ok`, `label`, `source`, `lastUpdated`, `localDate`, aggregate counters, `averageCompletionPace`, `jobs[]` (truncated), `signals` per job, `notes`, `emptyStateMessage`.

**Per-job (additive):** `activityGroupKey`, `activityGroupLabel` — string bucket from `classifyActivityGroupKey`; always label as Moraware-derived **activity group**, not audited shop geometry.

**Additive executive/pulse fields (v1.1):**

| Field | Meaning |
| --- | --- |
| `recommendedSyncCadence` | Guidance string (not enforced): frequent operational Brain sync expectation for credible same-day Titan review — *“…every 5–15 minutes during production hours.”* |
| `syncFreshness.lastBrainSyncAt` | Timestamp of latest **relevant** `brain_sync_runs.finished_at` (prefers operational-tagged runs when `ingest_operational` / mode hint present; falls back to most recent finished run). |
| `syncFreshness.ageSeconds` | Seconds between “now” and `lastBrainSyncAt` when known. |
| `syncFreshness.freshnessLabel` | **`Fresh`** if age ≤ **10 minutes**; **`Aging`** if ≤ **30 minutes**; **`Stale`** if older; **`Unknown`** if no timestamp. Widget copy should frame this as Brain **ingestion** freshness — not PLC runtime. |
| `pace.completedJobCount` | Count of jobs mapped to **Cut Complete** for the selected day (`null` pattern when insufficient data). |
| `pace.completedSqft` | Sum of worksheet / field-fallback Sq.Ft. across those completions. |
| `pace.averageMinutesBetweenCompletions` | **Mean gap in minutes between consecutive Cut Complete jobs** sorted by Moraware-aligned `lastPhaseUpdate` timestamps — labelled in UI **“average time between Moraware completion signals.”** **Not machine cycle time.** |
| `pace.longestGapMinutes` | Max gap between consecutive completion signals for the same sequence. |
| `pace.firstCompletionAt` / `pace.lastCompletionAt` | ISO bounds of that sorted completion sequence. |
| `pace.completedSqftPerHour` | Completed Sq.Ft. divided by elapsed hours **between first and last** completion timestamps (requires ≥2 completions and positive span); distinct from legacy `averageCompletionPace`. |
| `shops[]` | **Activity-group** rollup (below), not asserted physical departments. Each entry includes **`jobs`** mirroring grouped rows (additive duplication for dashboards). |

### Activity group (“shop”) mapping

Conservative lexical buckets derived from representative `brain_job_activities` text (`type`, `status`, phase, notes) — documented in **`classifyActivityGroupKey`** (`titansToday.js`). **Do not describe these as validated machine cells** until compared with Eric’s paper route list.

| `shopKey` | Intent |
| --- | --- |
| `install_ready` | Install / installed / ready-for-install / ready-for-next-phase style language. |
| `polish` | Polish-phase wording. |
| `fabrication` | Fabrication / “fab”. |
| `programming` | Saw program / Titan program / CNC / generic “program” naming. |
| `titan_saw` | Titan / saw / cutting / cut / sawyer tokens. |
| `other_shop_activity` | Matches Titan/day filter but not the above buckets. |

**Uncertainty:** overlaps (e.g. “program” on non-CNC queues) route to heuristic buckets; refinement only after stakeholder validation.

### Direct machine telemetry (future · not current)

All `/api/titans/today` metrics are **Moraware/eOS Brain activity signals**. **Direct machine telemetry**, blade-on-stone PLC readouts, and guaranteed spindle runtime **are explicitly out of scope** for this endpoint until a validated integration is designed alongside Eric’s paper reconciliation.

### Known limitations

- **Not live PLC data** — Moraware activity rows and Brain ingest times, not blade-on-stone sensing.
- **`start_date`** may not equal “shop clock now” — timezone and Moraware scheduling rules affect “today.”
- **Status mapping** is heuristic until validated against **Eric’s paper list** and optionally machine software.
- **averageCompletionPace** requires ≥2 completed jobs with valid `lastPhaseUpdate` and a non-trivial time spread; often `null`.
- **`syncFreshness`** reflects last **Brain sync batch** finish times — stale labels mean “last successful ingest boundary is old”, not necessarily “Titans idle.”
- **`pace`** gaps omit jobs without parseable completion timestamps and should not be read as bottleneck science without SME review.
- **`shops`** cards are **semantic activity groups**, not audited floor zoning.

### Debug envelope (`debug=1`, additive · admin / executive only)

Trusted operators can request `GET /api/titans/today?debug=1&date=YYYY-MM-DD&limit=N` — same auth as baseline. Adds a `debug`
object summarizing heuristic filters, unseen Moraware type/status aggregates, omission counts, lite `brain_sync_runs` slice
picked for freshness, capped `sampleCandidates` activity rows (**no credentials, no XML, no Activity `raw_json` blobs**).

The Executive Head hides this payload behind **“Show mapping details”** (`admin`-only toggle; mirrored in DEV for engineers).

---

## Validation with Eric’s paper list

Use this checklist before treating `/api/titans/today` as shop-floor authoritative:

1. Pick **one known production date** Eric already tracked on paper.
2. Compare **eOS job rows** (job id / job name where known) vs **Eric’s hand-written Titan list**.
3. **Mark missing jobs** that Eric expected but Brain/Moraware heuristic filters excluded.
4. **Mark extra jobs** that eOS surfaced but Eric did not expect for Titan/Saw that day — decide if Moraware wording or scope needs tuning.
5. Confirm **which Moraware `activity_type` strings** reliably mean Titan/Saw-related work vs generic production noise.
6. Confirm **which `activity_status` strings** correlate with **Queued**, **Cutting**, **Cut Complete**, **Held**, and reconcile edge cases (“Auto-Schedule”, etc.).
7. Confirm whether heuristic **activity group labels** (“Titan / Saw (activity group)”, Programming, Fabrication…) match Elite’s **spoken shop vocabulary** — rename labels accordingly after sign-off, not silently.
8. Confirm whether **`lastPhaseUpdate` / ingest timestamps** are meaningful enough for pace metrics (**Moraware completion signal spacing**) or need `sched_time` / TZ policy refinements later.
9. **Adjust keyword / leadership / grouping rules only after** jointly reviewing items 3–8 and documenting deltas — **avoid drive-by heuristic edits.**

### Validation step (required before calling it “final”)

1. Run `GET /api/titans/today?date=YYYY-MM-DD` as admin/executive (optionally append `debug=1` while validating), or run `npm run eos:titans:test`.
2. Compare job IDs / names / statuses side-by-side with Eric’s paper Titan list for that day.
3. Adjust mapping rules in `mapToLeadershipStatus` / grouping keywords **only after** checklist sign-off (no sync engine changes required for keyword tuning).

### Test helper

```bash
# Terminal 1: npm run eos:server
# Terminal 2:
EOS_TEST_EMAIL=... EOS_TEST_PASSWORD=... npm run eos:titans:test
```

---

*See also:* `docs/TITAN_SYNC_CADENCE_PLAN.md`, `docs/MORAWARE_DATA_COVERAGE_MAP.md`, `docs/EOS_MASTER_HEAD_ROADMAP.md`, `docs/EOS_ROLES_AND_PERMISSIONS_MAP.md`.
