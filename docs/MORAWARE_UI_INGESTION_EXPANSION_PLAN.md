# Moraware UI ingestion expansion plan (additive)

**Principles:** additive schema only; **no** destructive changes to existing Brain tables; **no** changes to worksheet Sq.Ft. math; **no** broad sync rewrites until each tranche is designed, sampled, and tested. Moraware credentials remain **server-side only**.

> Moraware records the work. eOS explains the work. The heads move the work.

Strategic outcome: eOS Brain should answer not only **“What jobs exist?”** but **where they sit on the schedule**, **who/what owns the next step**, **how much Sq.Ft. is implied per day**, and **what is missing or blocking**—so we can **keep the Titans running well.**

---

## Priority 1 — Operational trust

**Goal:** trustworthy operational truth for scheduling, reminders, and floor visibility.

| Item | Action |
| --- | --- |
| Job notes | Verify full text in `brain_jobs.notes` / raw; add length guardrails if needed |
| Job addresses | Add `brain_job_addresses` or additive columns; map from `jobQuery` `<all/>` samples |
| Contacts | Extend `brain_job_contacts` normalization for reminder instructions / roles when XML proven |
| Activity notes / description | Already stored; add parsers for assignee strings |
| assigned_to | Extract from `brain_job_activities.raw_json` into nullable column(s) |
| scheduled_time / duration | Keep `sched_time` / `duration`; validate formats |
| status / activity type | Keep; expand canonical type map with ESF-specific synonyms |
| Template / install / material / CS detail | Deepen `deriveOperationalSummary` only with tests |
| JWD / reminder history | Discovery: locate XML nodes; new `brain_job_reminders` or embed in activities |
| Unscheduled activities | Rule engine: `start_date` null + type filters |
| Machine / person / truck assignment | Regex / JSONPath on `raw_json` → structured columns |

**Exit criteria:** Titans / Shop TV can trust “who / when / what” for a majority of jobs without manual Moraware tab checks.

---

## Priority 2 — Schedule / capacity intelligence

**Goal:** reconstruct Moraware-style calendars without Moraware view definitions.

| Item | Action |
| --- | --- |
| Calendar reconstruction | Materialized views or API queries: activities ⨯ jobs |
| 30-day fabrication schedule signals | Rolling window on `start_date` + fabrication-related types |
| Daily scheduled worksheet Sq.Ft. | Join activity date → job’s `worksheet_sqft` (document double-count rules) |
| Shop / programming / machine / install / template / delivery views | Saved filters in eOS, not Moraware XML |
| Over / under-loaded day detection | Aggregate by date + resource column (from P1) |
| Work-center capacity | Longer-term: capacity tables + actuals from activities |

**Exit criteria:** Executive “capacity” style views and Shop TV can show **day-level load** with documented assumptions.

---

## Priority 3 — Quote / staging readiness

| Item | Action |
| --- | --- |
| Worksheet fields | Continue normalized_label + template-aware maps |
| Install checklist / accounting forms | Template ID registry |
| Signed proposal / SO / invoice fields | Field dictionary per template |
| Files metadata | `brain_job_files` (name, type, size, moraware_ref, **no** binary in Postgres initially) |
| Account default template / notes | `brain_accounts` additive |
| Account contacts | Account-scoped ingest pipeline |
| Pricing / markup notes | Only with strict ACL + partner vs internal split |

---

## Priority 4 — Automation readiness

| Item | Action |
| --- | --- |
| Communication contacts | P1 contacts + address |
| Reminder history | P1 JWD |
| Schedule confirmations | Outbound system—not Moraware ingest; ingest only **state** if Moraware stores it |
| Missing information | Rules on null fields + activity gaps |
| Issues / remakes / CS | Issues API discovery (Priority 1 research) |

---

## Priority 5 — Future AI takeoff readiness

| Item | Action |
| --- | --- |
| Drawing set metadata | `brain_job_files` + MIME/size |
| Plan PDFs | Store Moraware reference URL/hash if API allows; **no** auto-download until legal/IT review |
| Supabase Storage copy | Optional phase 2 |
| Quote file linkage | Partner quoting platform tables (non-Moraware) |

---

## Priority 6 — Beyond Moraware

SlabSmith/inventory, Monday/CRM, payroll/time, AI takeoff providers, SMS/email—**separate integration plans**; Brain remains Moraware-shaped core.

---

## Dependencies & sequencing

1. **Payload sampling** (discovery artifacts + redacted production `raw_json`) for each new column.
2. **Unit tests** for normalizers (especially dates and Sq.Ft.-adjacent fields—do not touch core Sq.Ft. math).
3. **Backfill jobs** optional per table.
4. **Documentation** update `MORAWARE_UI_COVERAGE_MAP.md` + matrix JSON when each tranche lands.

---

## Next live discovery step

Run **read-only** expanded API discovery against a Moraware tenant (credentials via existing env only):

- **Script:** `backend-core/src/scripts/discoverMorawareExpandedCoverage.js`
- **Command:** `npm run eos:discover:moraware-expanded`
- **Report:** `debug/moraware/latest/moraware-expanded-discovery.json` and `.txt` (gitignored `debug/` tree — do not commit sensitive runs)

See **`docs/MORAWARE_EXPANDED_DISCOVERY_RESULTS.md`** for env flags, existing API inventory (Part A), and how to interpret categories without exposing secrets.

---

## Related

- `docs/MORAWARE_UI_COVERAGE_MAP.md`
- `docs/MORAWARE_COVERAGE_TO_HEADS_MAP.md`
- `docs/MORAWARE_DATA_COVERAGE_MAP.md`
- `npm run eos:audit:moraware-ui-coverage`
