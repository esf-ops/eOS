# Phase DE.2G.1A — Private Synthetic Deployment Environment Discovery and Migration Apply Plan

**Date:** 2026-07-16  
**Nature:** Read-only operational verification  
**Status:** Complete — **no external state changed**  
**Do not begin DE.2G.1B from this document alone without Chris approval.**

---

## 0. Explicit non-actions (this phase)

| Action | Performed? |
|--------|------------|
| Deploy Brain / Studio / public head | **No** |
| Apply SQL / migrations | **No** |
| Modify DNS | **No** |
| Create or change Vercel projects | **No** |
| Modify Supabase | **No** |
| Grant head access / enable flags | **No** |
| Create quote or publication | **No** |
| Commit / push / PR | **No** |
| Begin DE.2G.1B | **No** |

---

## 1. Repository state (verified)

| Check | Result |
|-------|--------|
| Branch | `elite-100-digital-estimate` |
| Upstream | In sync with `origin/elite-100-digital-estimate` (**0 ahead / 0 behind**) |
| Working tree | **Clean** (`git status --short` empty at discovery time) |
| Recent commits | `f50aedf` preflight; `98c52d7` DE.2G.0 guards; `506bc8c` DE.2F; `c1cc3c2` DE.2E; `cb98950` DE.2D |
| DE.2G.0 committed? | **Yes** (`98c52d7`) |
| Synthetic preflight committed? | **Yes** (`f50aedf`) |

Branch was not modified in this phase beyond documentation files written for DE.2G.1A.

---

## 2. Local read-only preflight

**Command:** `node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs`

| Expectation | Result |
|-------------|--------|
| Four migrations exist | **PASS** |
| Order matches runbook | **PASS** (v1 → configuration → public_configuration → amendment) |
| SHA-256 matches `MIGRATION_CHECKSUMS_DE_2G_0.json` | **PASS** (all four) |
| Feature flags disabled/absent | **PASS** |
| Synthetic-only default on | **PASS** |
| Empty Studio pilot allowlist fail-closed | **PASS** |
| Empty publication allowlist fail-closed | **PASS** |
| Secrets printed | **None** |
| DB / network mutation | **None** (script is read-only) |
| Env file | Local env may be absent; script only checks names/presence. WARN: `HEAD_URL_*` unset (expected on readiness machine) |

**Verdict:** Preflight **PASSED**.

---

## 3. Brain / backend-core deployment architecture

### Established from repository evidence

| Item | Finding |
|------|---------|
| Code root | `backend-core/` |
| Provider | **Vercel** (serverless) — `backend-core/vercel.json`, `backend-core/api/index.js` |
| Documented live URL | `https://backend-core-six.vercel.app` (`docs/eliteos/SYSTEM_BLUEPRINT.md`) |
| Future preferred API host | `api.eliteosfab.com` — **if/when** DNS + Vercel wiring exist (**not confirmed live from repo alone**) |
| Monolithic vs serverless | **Serverless** Express app exported as Vercel function (`api/index.js`); rewrite `/api/*` → `/api` |
| Memory / duration | 1024 MB; `maxDuration` 300 |
| Build/start | Local: `npm run eos:server` / `src/server.js`. Hosted: Vercel builds from `backend-core` package and serves `api/index.js` |
| Env management | Vercel project environment variables (server-only). Names include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, CORS origins (`EOS_ALLOWED_ORIGINS` / `ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS`), `HEAD_URL_*`, DE feature flags |
| Process-local state | **Does not reliably survive** across serverless invocations. Process-local rate limiting is acceptable **only** for private synthetic pilot; distributed limiting remains a hard blocker for real-customer use |
| Shared Brain for eliteosfab.com heads | **Yes** — staff heads call the same Brain URL pattern; CORS merges fixed eliteOS origins + env + `HEAD_URL_*` via `collectHeadEnvOriginsForCors()`; production may also trust `https://*.eliteosfab.com` when `EOS_TRUST_ELITEOSFAB_SUBDOMAIN_ORIGINS` defaults on under `VERCEL_ENV=production` |
| Public session cookie support in code | Implemented: `de_cfg_session`, HttpOnly, Path `/api/public-digital-estimate/v2`, SameSite=**Strict**, Secure in production, **host-only** (no `Domain`) |

### Chris must retrieve from Vercel dashboard (not in repo)

1. Exact **production** Vercel project name for Brain (repo documents URL `backend-core-six.vercel.app`; confirm project ↔ URL mapping).
2. Production **git branch** linked to that project.
3. Whether a custom domain **`api.eliteosfab.com`** is already attached (critical for cookie gate — §9).
4. Current env var **names** present for DE flags / `HEAD_URL_*` / CORS (values never printed).
5. Preview vs production env separation.

**Do not deploy or alter the project in DE.2G.1A.**

---

## 4. Supabase target

### Established from repository evidence

| Item | Finding |
|------|---------|
| Pattern | eliteOS uses **one primary cloud Supabase** for Auth + Postgres that Brain already uses via `SUPABASE_URL` + service role (server only) |
| Separate staging project | **Recommended** in docs / ops practice; **existence not confirmed** from committed config |
| Project reference in repo | **No** non-sensitive committed project ref suitable as unambiguous identity for apply |
| Where migrations are normally applied | SQL under `backend-core/supabase/` applied manually (or via operator process) against the **active** Brain Supabase project — not auto-applied by this preflight |
| Synthetic pilot recommendation | **A** if staging exists and can hold eligible `quote_headers` safely; else **B** production with additive migrations + all flags off + backup/rollback per runbook; else **C** stop |

### Recommendation for this phase

**Target = UNKNOWN until Chris confirms** in the Supabase dashboard:

1. Project name / ref currently used by production Brain (`SUPABASE_URL` host identity — confirm visually; do not paste secrets).
2. Whether a **staging** project exists and is operational.
3. That a current backup (or PITR) is available for the chosen project.

**Do not apply migrations until that confirmation is recorded.**

Priority:

- **A.** Staging Supabase (preferred).
- **B.** Production Supabase, additive only, flags off, backup verified.
- **C.** Stop if ambiguous.

---

## 5. Migration audit (order fixed; checksums must match)

**Manifest:** `docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_0.json`  
**Rule:** If checksum differs → **do not apply**.

### 5.1 `eliteos_digital_estimate_v1.sql`

| Aspect | Detail |
|--------|--------|
| Tables | `quote_publications`, `quote_publication_snapshots`, `quote_publication_access_tokens`, `quote_publication_events` |
| Functions / RPCs | Immutability helpers; `digital_estimate_publish_atomic`; `digital_estimate_replace_token_atomic`; `digital_estimate_try_first_viewed` |
| Triggers | Immutable / org-match guards on publication child tables |
| Indexes / uniqueness | Token hash uniqueness and publication linkage indexes (see SQL) |
| RLS | Enabled on all four tables |
| Grants / revokes | Broad revokes from public/anon/authenticated; `service_role` grants for Brain |
| Dependencies | Assumes existing `quote_headers` / org model already present (read/FK references — **no DML on `quote_headers`**) |
| Rerun safety | `CREATE TABLE IF NOT EXISTS` style; functions `CREATE OR REPLACE` — generally re-runnable but treat as **once applied** in ops |
| Touches `quote_headers`? | **No mutating DML** |
| Rollback | Prefer flags off; preserve tables/audit; avoid DROP |
| Lock risk | **Low–medium** (new objects); brief catalog locks possible |
| Transaction boundary | Apply as single script in SQL editor / migration runner; stop on first error |

### 5.2 `eliteos_digital_estimate_configuration_v1.sql`

| Aspect | Detail |
|--------|--------|
| Tables | Pricing/policy + envelope/session tables (`digital_estimate_pricing_*`, `digital_estimate_material_*`, `digital_estimate_configuration_*`, estimator overrides, calculations, events, etc. — 16 tables) |
| Functions / RPCs | Org/immutability guards; `digital_estimate_activate_configuration_envelope`; `digital_estimate_insert_configuration_calculation` |
| Triggers | Org match, active immutable, draft children, append-only calculations/events/overrides |
| RLS | Enabled on all created tables |
| Grants | Revokes + `service_role` |
| Dependencies | **Requires DE.1 publication tables** (v1) where FKs reference publications |
| Rerun | Mostly IF NOT EXISTS / OR REPLACE |
| `quote_headers` DML | **None** |
| Lock risk | **Medium** (many new objects) |
| Rollback | Flags off; keep rows for audit |

### 5.3 `eliteos_digital_estimate_public_configuration_v1.sql`

| Aspect | Detail |
|--------|--------|
| Tables | **None new** (RPC-focused additive) |
| Functions / RPCs | `digital_estimate_save_selection_and_calculation` (SECURITY DEFINER, fixed `search_path`) |
| Triggers / RLS | N/A new tables |
| Grants | Revoke public paths; grant `service_role` |
| Dependencies | **Requires configuration_v1** tables/functions |
| `quote_headers` DML | **None** |
| Lock risk | **Low** |
| Rollback | Flags off; function can remain |

### 5.4 `eliteos_digital_estimate_amendment_v1.sql`

| Aspect | Detail |
|--------|--------|
| Tables | `digital_estimate_configuration_review_requests`, `digital_estimate_amendments`, `digital_estimate_amendment_events` |
| Functions / RPCs | Review immutability helper; `digital_estimate_publish_amendment_atomic` |
| Triggers | Immutability on review requests |
| RLS | Enabled on three tables |
| Dependencies | **Requires** v1 + configuration (+ public RPC for runtime flow) |
| `quote_headers` DML | **None** |
| Lock risk | **Low–medium** |
| Rollback | Flags off; preserve amendment audit |

---

## 6. Backup and rollback instructions (operator)

### 6.1 Verify correct project before any SQL

1. In Supabase dashboard, open the project whose **Project URL** matches Brain’s configured `SUPABASE_URL` host (compare visually; do not paste keys into chat/logs).
2. Confirm environment label (staging vs production) with Chris.
3. Record: project name, ref (non-secret), timestamp, operator name.

### 6.2 Confirm backup / PITR

1. Supabase → Project Settings → Database → confirm backups / PITR enabled for the target.
2. Optionally trigger or note “last backup time” before Gate 3.
3. Record evidence in the approval note (no credentials).

### 6.3 Pre-migration read-only existence check

Run **SELECT-only** (illustrative):

```sql
-- Expect zero rows before first apply
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'quote_publications',
    'quote_publication_snapshots',
    'quote_publication_access_tokens',
    'quote_publication_events',
    'digital_estimate_pricing_policy_versions',
    'digital_estimate_configuration_envelopes',
    'digital_estimate_configuration_sessions',
    'digital_estimate_configuration_review_requests',
    'digital_estimate_amendments',
    'digital_estimate_amendment_events'
  )
ORDER BY 1;
```

```sql
-- Expect zero before apply
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'digital_estimate_publish_atomic',
    'digital_estimate_activate_configuration_envelope',
    'digital_estimate_save_selection_and_calculation',
    'digital_estimate_publish_amendment_atomic'
  )
ORDER BY 1;
```

### 6.4 Post-apply verification (read-only)

Re-run the same queries; expect all listed tables/functions present. Optionally:

```sql
SELECT relname, relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname LIKE 'quote_publication%'
   OR relname LIKE 'digital_estimate_%';
```

Confirm RLS enabled on DE tables. Spot-check grants: anon/authenticated should not have broad table privileges.

### 6.5 Rollback strategy (preferred)

1. Keep all Digital Estimate feature flags **off**.
2. Keep synthetic-only **on**; empty allowlists.
3. Do **not** DROP tables as default rollback (preserves audit).
4. Only consider PITR / restore if a migration apply **corrupts** unrelated schema (escalation) — not for ordinary “turn DE off.”

---

## 7. Studio deployment configuration (`app-elite100-estimate-studio`)

| Item | Value |
|------|-------|
| Install | `npm ci` or `npm install` in `app-elite100-estimate-studio/` |
| Build | `npm run build` (`vite build`) |
| Output | `dist/` |
| SPA rewrite | `vercel.json`: all non-`assets/` → `/index.html` |
| Vite env names | `VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED`, `VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED`, `VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED`, `VITE_BACKEND_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_HEAD_URL_HOME` |
| Required public URL | Proposed `https://elite100.eliteosfab.com` → set `HEAD_URL_ELITE100_ESTIMATE_STUDIO` on Brain |
| Supabase | Anon + Auth only (staff session); **no service role** |
| Brain / CORS | `VITE_BACKEND_URL` → Brain; Brain must allow Studio origin (explicit `HEAD_URL_*` and/or `*.eliteosfab.com` trust) |
| Launcher / head | Slug `elite100_estimate_studio`; System Admin `user_head_access`; Brain `ELITE100_ESTIMATE_STUDIO_*` flags + pilot allowlist |
| Cookie behavior | Uses shared staff auth cookie pattern on `*.eliteosfab.com` (separate from public `de_cfg_session`) |
| Secrets in Vite bundle | **Must not** include service role / Monday / Moraware / Graph. Anon key is expected browser-public |

**Do not create or link a Vercel project in this phase.**

---

## 8. Public-head deployment configuration (`app-digital-estimate`)

| Item | Value |
|------|-------|
| Install | `npm ci` / `npm install` in `app-digital-estimate/` |
| Build | `npm run build` |
| Output | `dist/` |
| SPA `/e` | Same SPA rewrite; client route for `/e` + fragment token |
| Fragment token | Read from hash only; exchange via `Authorization: Bearer`; clear fragment; never put raw token in path/query after exchange |
| Vite env | `VITE_BACKEND_URL`, `VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED`, `VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED` |
| Brain Origin | Exact public origin must match `HEAD_URL_DIGITAL_ESTIMATE`; credentialed `fetch` with cookies |
| Cookie | `de_cfg_session`; Path `/api/public-digital-estimate/v2`; SameSite=Strict; Secure; HttpOnly; **host-only on Brain host** |
| Same-site vs cross-site | Public `digital.eliteosfab.com` + Brain `*.vercel.app` = **cross-site** → Strict cookie **will not** round-trip. Public + Brain both under `*.eliteosfab.com` (e.g. `api.eliteosfab.com`) = **same-site** → Strict host-only cookie on API host **can** work |
| CSP / Referrer-Policy | Public HTML sets CSP meta + `Referrer-Policy: no-referrer` (see `app-digital-estimate/index.html` / DE notes) |
| Supabase / service-role | **None** in public head |

**Do not create or link a Vercel project in this phase.**

---

## 9. CORS and cookie deployment gate

### Planned combination

| Surface | Proposed origin |
|---------|-----------------|
| Studio | `https://elite100.eliteosfab.com` |
| Public DE | `https://digital.eliteosfab.com` |
| Brain (documented today) | `https://backend-core-six.vercel.app` |
| Brain (preferred for cookies) | `https://api.eliteosfab.com` (future / unconfirmed) |

### Verdict

| Scenario | Cookie + credentialed CORS |
|----------|----------------------------|
| Public head on `digital.eliteosfab.com` → Brain on `backend-core-six.vercel.app` | **FAIL** — cross-site; `SameSite=Strict` host-only cookie set by Brain is not returned on subsequent credentialed XHR from the public head |
| Public head on `digital.eliteosfab.com` → Brain on `api.eliteosfab.com` (same registrable domain) | **PASS** (expected) — same-site request to cookie host; CORS must allow exact Origin; do not use `*` |
| Weaken SameSite / broaden cookie Domain to “make it work” on vercel.app | **Rejected** in this phase — do not weaken security to pass the gate |

**Readiness impact:** Public configuration session smoke (Gates 9–10) is **blocked** until Brain is reachable on an `*.eliteosfab.com` API host **or** a later authorized phase redesigns cookie topology without weakening Origin checks. Studio staff auth is a separate cookie model and is not the same blocker.

CORS for origins: set `HEAD_URL_DIGITAL_ESTIMATE` and `HEAD_URL_ELITE100_ESTIMATE_STUDIO` on Brain; production subdomain trust may already allow `*.eliteosfab.com`. Still set explicit head URLs for Origin equality checks in DE public configuration.

---

## 10. DNS authority

| Item | Finding |
|------|---------|
| Provider (repo) | **Cloudflare** for DNS / domain routing (`SYSTEM_BLUEPRINT.md`) |
| GoDaddy | Not evidenced as active DNS authority; **do not log in to GoDaddy** for this work |
| Proposed A/CNAME later | `elite100.eliteosfab.com` → Studio Vercel project; `digital.eliteosfab.com` → public DE Vercel project; optionally `api.eliteosfab.com` → Brain |
| `estimate.eliteosfab.com` | **Must remain unchanged** |

Chris must confirm Cloudflare zone access before any later DNS gate. **No DNS changes in DE.2G.1A.**

---

## 11. Owner access plan (later — do not execute now)

1. System Admin → Access Scope → grant head slug **`elite100_estimate_studio`** to Chris **only**.
2. Set Brain env `ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS` to Chris’s user id (**never print UUID in docs/chat**).
3. Optionally set `ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS` as secondary evidence only (server still requires pilot user id / head access — email alone must not authorize).
4. Enable Studio server flags only when entering PRIVATE_STUDIO_ONLY (still synthetic-only; empty publication allowlist).
5. Verify second non-pilot employee: **no** Home tile; direct Studio URL / API → **403**.
6. Confirm launcher tile visibility alone cannot grant backend access (remove grant or pilot id → 403 despite knowing URL).

---

## 12. Synthetic fixture plan (later — do not create now)

| Need | Plan |
|------|------|
| Eligibility | Persisted `quote_headers` via Internal Estimate: `quote_source=internal_quote`, `material_program_default=elite_100`, no OOC rooms, positive `customer_display_total`, print snapshot `finalRounded` matches CDT when present, not archived |
| Creation path | Use existing IE UI / workflows only — **no** unsafe direct SQL inserts of customer data |
| Content | Fictional **Example Homes** / example.com style data only |
| Evidence | Studio/Brain eligibility response + server-authored snapshot fields (not browser claims) |
| Publication allowlist | After publish, place publication UUID into `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` on Brain (staff-only storage; never commit) |
| Amendments | Replacement publication UUID must be allowlisted separately; old token/session fail closed |

---

## 13. Gate 1–12 execution checklist

| Gate | Action | Environment | Exact command / dashboard action | Expected result | Rollback / stop | Changes external state? | Approver |
|------|--------|-------------|----------------------------------|-----------------|-----------------|-------------------------|----------|
| **1** Read-only | Branch + tests + preflight | Local | `git status`; `node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs`; DE.2G.0 + regression tests; Vite builds | Clean + PASS | Stop on red / secret in dist | **No** | Chris |
| **2** Read-only | Human migration review | Local | Diff four SQL vs checksum manifest | Match; no `quote_headers` DML | Do not apply | **No** | Chris |
| **3** Migration apply | Apply SQL 1→4 | **Staging preferred** / prod only if A unavailable | Supabase SQL editor or approved runner; verify §6 queries | Tables/RPCs exist; RLS on | Flags off; no DROP; PITR if catastrophe | **Yes (DB)** | Chris + written approval |
| **4** Brain deploy | Deploy Brain flags off | Vercel Brain project | Redeploy with DE flags `0`, synthetic `1`, empty allowlists; set `HEAD_URL_*` when hosts known | Routes fail closed | Redeploy previous | **Yes** | Chris |
| **5** Studio deploy | Deploy Studio SPA | New Vercel project + DNS later | Build `app-elite100-estimate-studio`; SPA rewrite; Vite env | App loads; APIs 403 without pilot | Prior deploy / unpublish | **Yes** | Chris |
| **6** Owner grant | Head + pilot allowlist | System Admin + Brain env | Grant slug; set pilot user ids; enable Studio flags for PRIVATE_STUDIO_ONLY | Owner only; other user 403 | Revoke grant; clear pilot; flag 0 | **Yes** | Chris |
| **7** Synthetic quote | Create IE fixture + publish | Target Supabase via IE/Studio | IE UI fictional quote; Studio publish | Publication id; may await allowlist | Revoke publication | **Yes** | Chris |
| **8** Allowlist | Set publication UUID env | Brain env | `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` | Diagnostics count ≥ 1 (no IDs returned) | Clear env | **Yes** | Chris |
| **9** Public deploy | Deploy public SPA + CORS | Vercel + DNS; Brain must be same-site API host | Deploy `app-digital-estimate`; `HEAD_URL_DIGITAL_ESTIMATE` | Non-allowlisted 404; allowlisted exchange works | Flags 0 | **Yes** | Chris |
| **10** E2E smoke | Synthetic smoke list | Staging/pilot hosts | Runbook smoke 1–28 | All pass; no email; no `quote_headers` mutation | Kill switches | **Yes** (reads/writes DE tables) | Chris |
| **11** Rollback test | Flag kill | Brain env | Disable public flags | Instant 404; data retained; IE/QL OK | Re-enable only under approval | **Yes** (env) | Chris |
| **12** Stop before real customer | Confirm synthetic-only | Brain diagnostics | `realCustomerPilotAuthorized: false`; distributed limiter still absent | No real-customer auth | N/A | **No** (verify only) | Chris |

**Separate clearly:**

- **Read-only:** Gates 1–2 (and all of DE.2G.1A).
- **Migration:** Gate 3 → DE.2G.1B scope.
- **Brain / Studio / public deploy:** Gates 4–5, 9.
- **DNS:** Between Gates 5/9 and smoke; not in 1A.
- **Owner grant / fixture / allowlist / E2E:** Gates 6–8, 10–12.

---

## 14. Information Chris must retrieve (dashboard)

1. Supabase: staging exists? production project identity for Brain?
2. Backup / PITR status for chosen project.
3. Vercel: Brain project name, production branch, whether `api.eliteosfab.com` is attached.
4. Cloudflare: zone access for `eliteosfab.com`.
5. Confirm `estimate.eliteosfab.com` will not be edited.

---

## 15. Recommendation

**`BLOCKED_PENDING_ENVIRONMENT_INFORMATION`**

Reasons:

1. Supabase apply target (staging vs production) is **not unambiguous** from the repo.
2. Brain custom domain `api.eliteosfab.com` **not confirmed**; without same-site API host, public `de_cfg_session` **fails** the cookie gate (§9).
3. New Vercel projects for Studio / public DE not yet created (expected; blocks deploy gates, not migration review).

**Conditional upgrade:** If Chris confirms Brain will remain **only** on `*.vercel.app` for public config smoke with no same-site API host and no authorized redesign, treat public config rollout as **`BLOCKED_BY_SECURITY_OR_DEPLOYMENT_DEFECT`** (do not weaken SameSite).

**Not** `READY_FOR_DE_2G_1B_MIGRATION_APPLY` until Supabase target + backup confirmation are recorded. Migration **code** itself is checksum-clean and ordered correctly.

---

## 16. Stop

DE.2G.1A ends here. **Do not begin DE.2G.1B** until Chris approves with environment answers above.
