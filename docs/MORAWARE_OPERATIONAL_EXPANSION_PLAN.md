# Moraware operational Brain expansion

## Why this exists

Key-shape discovery on real Moraware payloads (e.g. job `38837`) proved additional **structured** fields beyond what we previously denormalized into `brain_job_activities` text columns alone: nested `activityType` / `status` ids and names, activity-scoped phase id/seq/name, schedule text (`schedTime`, `duration`, `description`, `notes`), operational **`job.address`** (line1, city, state, zip, contact, email, cell, notes), and global **`jobPhases.jobPhase`** rows with `id` / `seqNum` / `name`.

Moraware does **not** expose saved calendar “view definitions” in-repo. **eOS reconstructs** Shop / machine / programming / install views from **normalized activities** (plus business rules), not from Moraware UI view XML.

## What was added (additive)

SQL: `backend-core/supabase/moraware_operational_expansion.sql` (run against Supabase after `operational_schema.sql`).

| Area | Behavior |
| --- | --- |
| `brain_job_activities` | New nullable columns: `activity_type_id`, `activity_type_name`, `status_id`, `status_name`, `phase_id`, `phase_seq_num`. Legacy `activity_type`, `activity_status`, `phase_name` remain populated for backward compatibility. |
| `brain_job_addresses` | One row per `job_id` from operational `job.address` (upsert). |
| `brain_job_phases` | Existing table; adds `phase_seq_num` when missing. |
| `brain_job_notes_scope_signals` | **Non-authoritative** heuristics on **job header notes** (sqft-like lines, `PHASE N` labels). **Does not** replace worksheet Sq.Ft. math or production Sq.Ft. totals. |

Ingestion: `normalizeJobOperational` (`src/morawareOperational.js`) enriches activity rows and phases; `replaceJobOperational` (`backend-core/src/brain/supabaseBrainStore.js`) upserts addresses and notes-scope signals alongside existing operational deletes/inserts.

## Proven vs not yet proven

**Proven (ingested when operational sync runs with `SUPABASE_WRITE_ENABLED=1` + schema applied)**

- Activity type / status names and ids from nested Moraware nodes.
- Activity phase id / name / seq from activity `jobPhases`.
- `start_date`, `sched_time`, `duration`, `description`, `notes` on activities (dates normalized to ISO date where possible).
- Job-level address block fields listed above.
- Global job phases with seq num.
- Job notes scope **signals** only (`brain_job_notes_scope_signals`).

**Not proven in-repo yet (no new columns dedicated to these)**

- Machine / truck / employee assignment as first-class columns.
- JWD / reminder history tables.
- File attachment metadata table ingest.

## Future schedule heads

Normalized **`start_date`**, **`activity_type_name`**, **`status_name`**, **`phase_name` / `phase_id`**, and text fields enable SQL and API filters for “what runs when” without Moraware view exports. Combine with `brain_job_operational_summary` for coarse flags.

## Job notes scope signals — important disclaimer

Rows in **`brain_job_notes_scope_signals`** are **heuristic metadata** for search/validation UX and future parsers. They may count lines like `70sf` or `PHASE 2` in free text. **Never** use them as authoritative pricing or worksheet Sq.Ft.; worksheet truth remains in **`brain_fields` / worksheet metrics** and existing Sq.Ft. pipelines.

## Audit

```bash
npm run eos:audit:operational-expansion
```

Outputs: `debug/moraware/latest/operational-expansion-coverage.json` and `.txt`. Activity metrics are computed over a capped sample (`MORAWARE_AUDIT_ACTIVITY_MAX_ROWS`, default 25000) for safety on large tenants.

## Related

- `src/morawareOperational.js` — `normalizeJobOperational`, `analyzeJobNotesScope`, `extractJobSiteAddressFromOperationalJobNode`
- `backend-core/src/brain/supabaseBrainStore.js` — `replaceJobOperational`
- `docs/MORAWARE_EXPANDED_DISCOVERY_RESULTS.md` — discovery + key-shape audit
