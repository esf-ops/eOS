# eliteOS Stabilization QA Log

**Working log — not a marketing report.**  
Update this file as smoke tests run and bugs are found.


| Field                 | Value                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date opened**       | 2026-05-27                                                                                                                                                                                 |
| **Phase**             | Stabilization Week / Stabilization Phase                                                                                                                                                   |
| **Baseline**          | [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md) · [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md) · [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md) §36 |
| **Branch (planning)** | `main` (record actual branch per test run)                                                                                                                                                 |
| **Tester**            | *fill in*                                                                                                                                                                                  |
| **Environment**       | *local / staging / production — fill in*                                                                                                                                                   |


---

## Deployment / state notes

Record what was actually running during this QA pass. Stale backend processes have caused **404 on Sales routes** while `/api/health` still returns 200.


| Item                                      | Local                        | Staging | Production                       |
| ----------------------------------------- | ---------------------------- | ------- | -------------------------------- |
| **backend-core** commit / deploy          |                              |         |                                  |
| **Last `npm run eos:server` restart**     |                              | N/A     | N/A                              |
| **Supabase project**                      |                              |         |                                  |
| **app-home URL**                          | e.g. `http://localhost:5173` |         | `https://www.eliteosfab.com`     |
| **app-system-admin URL**                  |                              |         | `https://system.eliteosfab.com`  |
| **app-internal-estimate URL**             |                              |         |                                  |
| **app-quote-library URL**                 |                              |         | `https://quotes.eliteosfab.com`  |
| **app-pricing-admin URL**                 |                              |         | `https://pricing.eliteosfab.com` |
| **app-sales URL**                         |                              |         | `https://sales.eliteosfab.com`   |
| **VITE_BACKEND_URL** points to live Brain |                              |         |                                  |
| **Notes**                                 |                              |         |                                  |


**Pre-flight:** After any backend pull, run `lsof -ti :3001 | xargs kill -9` (if needed) then `npm run eos:server` from repo root.

---

## Severity definitions


| Level  | Definition                                                                  | Stabilization action                 |
| ------ | --------------------------------------------------------------------------- | ------------------------------------ |
| **P0** | Production blocker, security breach, data loss, cross-tenant leak           | Fix immediately; may use Sonnet/Opus |
| **P1** | Core workflow broken (cannot save quote, login, launcher, required API 404) | Fix during stabilization             |
| **P2** | Confusing or wrong but workaround exists                                    | Fix if one-file; else backlog        |
| **P3** | Polish, copy, minor layout                                                  | Log only; defer unless trivial       |


**Route rule:** `401` / `403` / JSON error body on protected routes **without token** = OK. `**404 Cannot GET /api/...`** on a mounted route = **P1** until proven otherwise.

---

## Required SQL checklist

**Do not run SQL from this doc.** Confirm in Supabase SQL editor or team runbook. Check when applied; note environment.


| #   | Check                                                                             | Applied? | Date / by | Notes if missing                                        |
| --- | --------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------- |
| S1  | `user_preferences` table exists (`eliteos_user_preferences_v1.sql`)               | [ ]      |           | Profile prefs fall back to localStorage only            |
| S2  | `user_profiles.job_title` column exists (`eliteos_job_title_v1.sql`)              | [ ]      |           | Job title does not persist in System Admin              |
| S3  | `organizations` table has **Elite Stone Fabrication** (or expected tenant row)    | [ ]      |           | Org dropdown empty; `/api/me` lacks `organization_name` |
| S4  | `organization_id` on `user_profiles` (from `eos_saas_foundation.sql`)             | [ ]      |           | Org assignment broken                                   |
| S5  | Quote library foundation tables/indexes applied                                   | [ ]      |           | Quote Library errors                                    |
| S6  | Internal quote phase2 / revisions schema applied                                  | [ ]      |           | Revision workflow broken                                |
| S7  | `eliteos_audit_foundation.sql` (login/action log columns)                         | [ ]      |           | System Admin audit degraded                             |
| S8  | `eliteos_sales_moraware_prepared_facts.sql`                                       | [ ]      |           | Sales KPI Moraware rollups empty/slow                   |
| S9  | Partner Quote foundation tables (`partner_quote_foundation_v1_additive.sql`)      | [ ]      |           | Internal partner pilot broken                           |
| S10 | `**partner_quote_rls_draft.sql` NOT applied** unless security explicitly approved | [ ] N/A  |           | **Must stay unapplied** for external partner gate       |


---

## Backend route checklist

### Local (`http://localhost:3001`)

Run after fresh `npm run eos:server`. Use browser Network tab or curl.


| #   | Route                                                                                                                 | Method | Auth                        | Pass? | Actual (status / note)                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- | ----- | ----------------------------------------------------------------------------- |
| B1  | `/api/health`                                                                                                         | GET    | No                          | [ ]   | Expect **200** JSON `ok: true`                                                |
| B2  | `/api/me`                                                                                                             | GET    | Bearer JWT                  | [ ]   | Expect **200**; user has `organization_name`, `job_title` when set on profile |
| B3  | `/api/me/heads`                                                                                                       | GET    | Bearer JWT                  | [ ]   | Expect **200**; assigned heads list                                           |
| B4  | `/api/me/preferences`                                                                                                 | GET    | Bearer JWT                  | [ ]   | Expect **200** or defaults (not 500)                                          |
| B5  | `/api/sales/dashboard-foundation?datePreset=ytd&timeGrain=month&sortBy=sqft&sortDirection=desc&attributionStatus=all` | GET    | Bearer + sales head         | [ ]   | **Not 404** (401/403 OK without auth)                                         |
| B6  | `/api/sales/kpi-v1?start_date=2026-01-01&end_date=2026-05-27&grain=month`                                             | GET    | Bearer + sales head         | [ ]   | **Not 404**                                                                   |
| B7  | `/api/quote-library/quotes` (or `/metrics`)                                                                           | GET    | Bearer + quote_library head | [ ]   | **Not 404**                                                                   |
| B8  | `/api/internal-quotes/calculate`                                                                                      | POST   | Bearer + quote head         | [ ]   | **Not 404** (400/403 OK if body invalid)                                      |
| B9  | `/api/internal-quotes/save`                                                                                           | POST   | Bearer + quote head         | [ ]   | **Not 404**                                                                   |
| B10 | `/api/system-admin/reference` or `/api/admin/reference`                                                               | GET    | Bearer + system_admin       | [ ]   | **Not 404**; includes `organizations` array                                   |
| B11 | `/api/system-admin/users`                                                                                             | GET    | Bearer + system_admin       | [ ]   | **Not 404**                                                                   |


**Local curl examples (no token — expect auth failure, not 404):**

```bash
curl -i http://localhost:3001/api/health
curl -i "http://localhost:3001/api/sales/dashboard-foundation?datePreset=ytd&timeGrain=month&sortBy=sqft&sortDirection=desc&attributionStatus=all"
curl -i "http://localhost:3001/api/sales/kpi-v1?start_date=2026-01-01&end_date=2026-05-27&grain=month"
```

### Production / staging (browser-authenticated)

Same routes exercised **through the app** (Network tab). Unauthenticated curl may return **401/403** — acceptable. **404 = fail.**


| #   | Route (via app)                             | Pass? | Note                           |
| --- | ------------------------------------------- | ----- | ------------------------------ |
| P1  | Health / Brain reachable from heads         | [ ]   | `VITE_BACKEND_URL` correct     |
| P2  | `/api/me` on Home load                      | [ ]   |                                |
| P3  | Sales Command Center → dashboard-foundation | [ ]   | No "Cannot GET" in UI          |
| P4  | Sales KPI History → kpi-v1                  | [ ]   | Data or clean unavailable card |
| P5  | Quote Library → quote-library APIs          | [ ]   |                                |
| P6  | Internal Estimate → calculate + save        | [ ]   |                                |
| P7  | System Admin → users + reference            | [ ]   |                                |


---

## Active heads checklist

Mark: **Pass** / **Fail** / **Skip** / **Blocked**. Add bug IDs from log below.

### Home Launcher (`app-home`)


| #   | Test                                                                                                     | Pass?  | Bug ID | Notes                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------- |
| H1  | Opens without console errors                                                                             | [PASS] |        | Home loads cleanly. Network tab shows `/me`, `/heads`, and `/preferences` returning `200`. No failed API calls shown. |
| H2  | Workspace shows **organization name** (e.g. Elite Stone Fabrication), not raw UUID as primary label      | [PASS] |        | Elite Stone Fabrication is the visible workspace.                                                                     |
| H3  | Workspace card shows **on slabOS**; org slug **not** shown on main card (slug OK in Access details only) | [PASS] |        | Org ID only appears in Access details. Organization slug appears in Access details, not primary card.                 |
| H4  | Hero third stat: value = **job title** when set, else role; label = **Your role**                        | [PASS] |        | Role/title display appears correct.                                                                                   |
| H5  | User chip subtitle prefers job title / department / role (not only raw role)                             | [PASS] |        | User chip displays expected title/role context.                                                                       |
| H6  | Assigned tools list loads (not fake "0" when API down)                                                   | [PASS] |        | 8 tools available.                                                                                                    |
| H7  | Open tool from launcher works                                                                            | [PASS] |        | Clicking on link redirects to selected tool.                                                                          |
| H8  | User dropdown → **Profile & preferences** opens `?view=profile`                                          | [PASS] |        | Dropdown opens and displays everything.                                                                               |
| H9  | Sign out works                                                                                           | [PASS] |        | Signs user out.                                                                                                       |


### System Admin (`app-system-admin`)


| #   | Test                                                                                     | Pass? | Bug ID | Notes |
| --- | ---------------------------------------------------------------------------------------- | ----- | ------ | ----- |
| A1  | User list loads                                                                          | [ ]   |        |       |
| A2  | Open user drawer → Overview shows org **name** (not only UUID)                           | [ ]   |        |       |
| A3  | Edit profile → **Organization** dropdown lists orgs (e.g. Elite Stone Fabrication)       | [ ]   |        |       |
| A4  | Select org + **Job title** (e.g. Architect) → Save profile → **Saving…** button readable | [ ]   |        |       |
| A5  | Reload drawer → job title and org **persist**                                            | [ ]   |        |       |
| A6  | **Permission role** dropdown still canonical (not freeform text)                         | [ ]   |        |       |
| A7  | Head access checkboxes save                                                              | [ ]   |        |       |
| A8  | Profile & Preferences (Home) cannot edit role/org/heads                                  | [ ]   |        |       |


### Internal Estimate (`app-internal-estimate`)


| #   | Test                                                                                       | Pass? | Bug ID | Notes |
| --- | ------------------------------------------------------------------------------------------ | ----- | ------ | ----- |
| E1  | Calculate works                                                                            | [ ]   |        |       |
| E2  | Save / update works                                                                        | [ ]   |        |       |
| E3  | Customer estimate print/PDF opens                                                          | [ ]   |        |       |
| E4  | Rounded visible lines sum to **Estimated project total** on PDF                            | [ ]   |        |       |
| E5  | After save, Quote Library shows **customer estimate total** (CDT), not only exact subtotal | [ ]   |        |       |
| E6  | Account field placeholder = **Account Name** (not "Direct")                                | [ ]   |        |       |
| E7  | Chargeable sqft rounds up (whole SF)                                                       | [ ]   |        |       |
| E8  | No console errors on load/save                                                             | [ ]   |        |       |


### Quote Library (`app-quote-library`)


| #   | Test                                                            | Pass? | Bug ID | Notes |
| --- | --------------------------------------------------------------- | ----- | ------ | ----- |
| Q1  | List loads                                                      | [ ]   |        |       |
| Q2  | Quote detail drawer opens                                       | [ ]   |        |       |
| Q3  | Total shows **customer-facing** value when CDT present          | [ ]   |        |       |
| Q4  | Old quote without CDT falls back to `grand_total` without crash | [ ]   |        |       |
| Q5  | Status change works                                             | [ ]   |        |       |
| Q6  | Open latest in Internal Estimate deep link works                | [ ]   |        |       |
| Q7  | Handoff doc generation (Moraware/QB entry JSON) if used         | [ ]   |        |       |


### Pricing Admin (`app-pricing-admin`)


| #   | Test                                      | Pass? | Bug ID | Notes |
| --- | ----------------------------------------- | ----- | ------ | ----- |
| P1  | App loads; auth required                  | [ ]   |        |       |
| P2  | Unauthorized user blocked                 | [ ]   |        |       |
| P3  | Price groups / rates / rules screens load | [ ]   |        |       |
| P4  | No obvious console errors                 | [ ]   |        |       |


### Sales Dashboard (`app-sales`)


| #   | Test                                                                                                  | Pass? | Bug ID | Notes |
| --- | ----------------------------------------------------------------------------------------------------- | ----- | ------ | ----- |
| S1  | Command Center loads (not "Cannot GET /api/sales/dashboard-foundation")                               | [ ]   |        |       |
| S2  | KPI History tab loads                                                                                 | [ ]   |        |       |
| S3  | KPI shows Quote Library + Moraware sections or **clean unavailable** (not fake zeros / not route 404) | [ ]   |        |       |
| S4  | `/api/sales/kpi-v1` reachable (Network tab)                                                           | [ ]   |        |       |
| S5  | No hardcoded account/customer exception names in visible UI                                           | [ ]   |        |       |
| S6  | Quote Pipeline tab works                                                                              | [ ]   |        |       |
| S7  | Legacy Intelligence tab works                                                                         | [ ]   |        |       |


### Profile & Preferences (in `app-home`)


| #   | Test                                                                                 | Pass? | Bug ID | Notes |
| --- | ------------------------------------------------------------------------------------ | ----- | ------ | ----- |
| F1  | Profile fields load (name, email, job title, department, permission role, workspace) | [ ]   |        |       |
| F2  | Preferences save (or documented localStorage-only if SQL S1 missing)                 | [ ]   |        |       |
| F3  | Role, org, head access **read-only** — no edit controls                              | [ ]   |        |       |
| F4  | Link from protected head user menu works                                             | [ ]   |        |       |


### backend-core (summary)


| #   | Test                                                                              | Pass? | Bug ID | Notes |
| --- | --------------------------------------------------------------------------------- | ----- | ------ | ----- |
| C1  | All backend route checklist items B1–B11                                          | [ ]   |        |       |
| C2  | `[sales] mounted ...` log line on server start (confirms Sales routes registered) | [ ]   |        |       |


---

## Manual browser QA checklist (session flow)

Suggested order for one full pass (~60–90 min):

1. [ ] Start fresh `npm run eos:server`; confirm B1–B2
2. [ ] Home: sign in → H1–H9
3. [ ] System Admin: A1–A8
4. [ ] Internal Estimate: create/edit quote → E1–E8
5. [ ] Quote Library: open same quote → Q1–Q7
6. [ ] Sales: S1–S7
7. [ ] Pricing Admin: P1–P4
8. [ ] Profile again from Home + one protected head menu → F1–F4
9. [ ] Record SQL checklist S1–S10 with DBA/operator
10. [ ] Triage bug log; assign owners

**Console rule:** Any **red** uncaught error on load = at least P2; note head and URL.

---

## Bug log


| ID     | Head/module | Severity | Symptom | Reproduction | Expected | Actual | Owner / next action | Status |
| ------ | ----------- | -------- | ------- | ------------ | -------- | ------ | ------------------- | ------ |
| QA-001 | *example*   | P3       | *—*     | *—*          | *—*      | *—*    | *—*                 | Open   |
|        |             |          |         |              |          |        |                     |        |


**Status values:** Open · In progress · Fixed · Won't fix (stabilization) · Deferred (post-stabilization)

---

## Stabilization exit criteria

Phase complete when **all** checked:

- All active heads open **without console crashes** on primary flows (H, A, E, Q, P, S, F checklists)  
- **No open P0 or P1** bugs (or explicitly accepted with owner sign-off)  
- SQL checklist S1–S10 reviewed; gaps documented or remediated  
- Backend protected routes return **401/403/JSON**, **not 404**, when mounted (B5–B11, production P1–P7)  
- Internal Estimate: calculate + save + customer print work (E1–E4)  
- Quote Library total **agrees** with customer estimate total for newly saved quote (E5 + Q3)  
- Sales KPI loads data **or** fails gracefully with unavailable state (S2–S3), not route-missing  
- Partner Quote remains **internal only**; leakage script run or scheduled; S10 confirmed  
- Team agrees **one** next major build ([STABILIZATION_PLAN](./STABILIZATION_PLAN_2026-05-27.md) deferred list)  
- Short “stabilization complete” note added to FEATURE_DECISIONS or STATUS_REPORT when exiting

---

## Next actions


| Priority | Action                                                                                      | Owner | Due |
| -------- | ------------------------------------------------------------------------------------------- | ----- | --- |
| 1        | Run local backend route checklist B1–B11                                                    |       |     |
| 2        | Complete SQL checklist S1–S10 in target Supabase                                            |       |     |
| 3        | Full browser pass (session flow above)                                                      |       |     |
| 4        | Log bugs in table; triage P0/P1                                                             |       |     |
| 5        | Redeploy backend + heads if prod behind `main`                                              |       |     |
| 6        | Run `npm run eos:check:local` before any stabilization code fixes                           |       |     |
| 7        | Partner: `node backend-core/src/scripts/verifyPartnerQuoteLeakage.mjs` (internal gate only) |       |     |
| 8        | Update STATUS_REPORT or FEATURE_DECISIONS when phase exits                                  |       |     |


---

## Related documents

- [STABILIZATION_PLAN_2026-05-27.md](./STABILIZATION_PLAN_2026-05-27.md)  
- [STATUS_REPORT_2026-05-27.md](./STATUS_REPORT_2026-05-27.md)  
- [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md) §36

