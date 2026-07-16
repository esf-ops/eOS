# Private Synthetic Deployment Runbook

**Sources:** DE.2G.0 readiness + **DE.2G.1A environment discovery** (`PHASE_DE_2G_1A_ENVIRONMENT_DISCOVERY.md`).

**Do not execute gates from automation alone.** Manual approval required. DE.2G.1A changed **no** external state.

Domains (proposed — **DNS not created in DE.2G.0 / 1A**):

| Surface | Domain | App root |
|---------|--------|----------|
| Studio | `https://elite100.eliteosfab.com` | `app-elite100-estimate-studio` |
| Public DE | `https://digital.eliteosfab.com` | `app-digital-estimate` |
| Internal Estimate | `https://estimate.eliteosfab.com` | **unchanged** |
| Brain (documented) | `https://backend-core-six.vercel.app` | `backend-core` |
| Brain (preferred for public cookies) | `https://api.eliteosfab.com` | same project — **confirm if attached** |

---

## DE.2G.1A discovery summary (read-only)

| Target | Found? | Notes |
|--------|--------|-------|
| Brain provider | **Yes** | Vercel serverless (`backend-core/vercel.json`, `api/index.js`) |
| Brain public URL | **Documented** | `backend-core-six.vercel.app`; confirm dashboard mapping |
| Supabase target | **Unknown** | One primary cloud project pattern; staging existence unconfirmed — Chris must identify before Gate 3 |
| Staging Supabase | **Unknown** | Prefer A (staging) if operational |
| DNS authority | **Likely Cloudflare** | Per `SYSTEM_BLUEPRINT.md`; confirm zone access; do not use GoDaddy for this |
| Studio / public Vercel projects | **Not created** | Config files exist; no deploy in 1A |
| Cookie / CORS gate | **Conditional fail** | Public head on `digital.eliteosfab.com` + Brain only on `*.vercel.app` = **cross-site**; `SameSite=Strict` host-only `de_cfg_session` will **not** round-trip. Require Brain on `*.eliteosfab.com` (e.g. `api.eliteosfab.com`) before Gates 9–10. **Do not weaken SameSite.** |
| Process-local rate limit | Acceptable for synthetic pilot only | Does not survive reliably across Vercel invocations; distributed limiter still blocks real-customer |
| 1A recommendation | `BLOCKED_PENDING_ENVIRONMENT_INFORMATION` | See discovery doc §15 |

### Chris must retrieve before DE.2G.1B / deploys

1. Supabase project used by production Brain (and whether staging exists) + backup/PITR status.
2. Vercel Brain project name, production branch, whether `api.eliteosfab.com` is attached.
3. Cloudflare access for `eliteosfab.com`.
4. Confirmation `estimate.eliteosfab.com` stays untouched.

---

## Deployment architecture found

### Brain (`backend-core`)

| Item | Value |
|------|-------|
| Provider | Vercel serverless function |
| Entry | `api/index.js` → Express `src/server.js` |
| Documented URL | `https://backend-core-six.vercel.app` |
| Env | Vercel project env: `SUPABASE_*` (server only), CORS / `HEAD_URL_*`, DE flags |
| Shared Brain | Yes — eliteosfab.com heads call the same API |
| Cookie for DE public config | Host-only on Brain host; Path `/api/public-digital-estimate/v2`; SameSite=Strict; Secure in prod |

### Vite heads

Both follow the same pattern as `app-home` / other heads:

| Item | Studio | Public Digital Estimate |
|------|--------|-------------------------|
| Install | `npm ci` / `npm install` in app dir | same |
| Build | `npm run build` → Vite | same |
| Output | `dist/` | `dist/` |
| SPA rewrite | `vercel.json` rewrite to `/index.html` | same |
| Node | match Brain/hosting Node LTS used by other Vite heads (verify host) | same |
| Auth | Supabase anon + session to Brain | **no** Supabase; fragment token only |
| API | `VITE_BACKEND_URL` | `VITE_BACKEND_URL` |
| Secrets in Vite | **none** (anon key only for Studio auth) | **none** |

Fragment behavior: Studio emits `HEAD_URL_DIGITAL_ESTIMATE/e#<rawToken>`. Public SPA reads hash locally, exchanges via `Authorization: Bearer`, clears fragment. Cookie: `de_cfg_session` HttpOnly; Path `/api/public-digital-estimate/v2`; SameSite=Strict; Secure in production. CORS Origin must equal public head URL. **Brain must be same-site under `*.eliteosfab.com` for this cookie model.**

---

## Env matrix (safe defaults)

### Backend (Brain)

```bash
DIGITAL_ESTIMATE_API_ENABLED=0
DIGITAL_ESTIMATE_PUBLISH_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED=0
DIGITAL_ESTIMATE_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED=0
DIGITAL_ESTIMATE_AMENDMENTS_ENABLED=0
ELITE100_ESTIMATE_STUDIO_ENABLED=0
ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS=
ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS=
DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=1
DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS=
HEAD_URL_ELITE100_ESTIMATE_STUDIO=
HEAD_URL_DIGITAL_ESTIMATE=

# Existing Supabase server credentials (names already used by Brain — do not invent aliases)
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or project-equivalent) — server only
```

### Frontend

```bash
# Studio
VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED=false
VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED=false
VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED=false
VITE_BACKEND_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_HEAD_URL_HOME=

# Public
VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED=false
VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED=false
VITE_BACKEND_URL=
```

---

## Migration order + checksums

1. `eliteos_digital_estimate_v1.sql`
2. `eliteos_digital_estimate_configuration_v1.sql`
3. `eliteos_digital_estimate_public_configuration_v1.sql`
4. `eliteos_digital_estimate_amendment_v1.sql`

SHA-256: `docs/digital-estimate/MIGRATION_CHECKSUMS_DE_2G_0.json`
Preflight: `node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs`

---

## Rollback (feature flags — preferred)

1. Disable public configuration
2. Disable review requests
3. Disable amendments
4. Disable public read
5. Disable publishing
6. Disable Studio
7. Revoke synthetic tokens if needed (Studio revoke)
8. Preserve audit/history
9. Remove `user_head_access` for Studio
10. DNS disable only if necessary
11. **Do not drop tables** in ordinary rollback

Migration rollback is separate and discouraged once populated; prefer flag rollback.

---

## Approval gates (do not perform in DE.2G.0)

### Gate 1 — Code / branch verification

- **Action:** Confirm branch contains DE.1–DE.2F + DE.2G.0; run `phaseDe2g0.test.mjs` + DE.1–2F regressions + both Vite builds + preflight.
- **Expected:** All green; `git status` shows readiness files only.
- **Evidence:** Test/build logs.
- **Rollback:** N/A (no deploy).
- **Stop:** Any red test / secret in Vite dist.

### Gate 2 — Migration review

- **Action:** Human review of four SQL files vs checksums; confirm no `quote_headers` DML; RPC grants service_role only.
- **Expected:** Checksums match manifest.
- **Evidence:** Signed review note + checksum file.
- **Rollback:** Do not apply.
- **Stop:** Checksum drift or destructive SQL.

### Gate 3 — Migration apply authorization (DE.2G.1B)

- **Action:** Apply SQL **only** after written approval, on staging first (or production only if staging unavailable and backup verified), in order 1→4. Re-verify checksums immediately before apply. Pre/post SELECT checks in `PHASE_DE_2G_1A_ENVIRONMENT_DISCOVERY.md` §6.
- **Expected:** Tables/RPCs exist; RLS/revokes intact; no `quote_headers` DML.
- **Evidence:** DB migration log (no secrets).
- **Rollback:** Flag-off; do not drop populated tables casually.
- **Stop:** Ambiguous project identity; checksum drift; apply errors; grant leakage to anon.
- **Prerequisite from 1A:** Supabase target identified — **blocked until Chris confirms.**

### Gate 4 — Backend deploy authorization

- **Action:** Deploy Brain with all DE feature flags **0**, synthetic-only **1**, empty allowlists/pilots; set head URL envs.
- **Expected:** Studio/public routes unmounted or fail closed.
- **Evidence:** `/api/...` 404 when flags off; diagnostics only when later enabled.
- **Rollback:** Redeploy previous Brain.
- **Stop:** Any flag accidentally `1`.

### Gate 5 — Private Studio deploy authorization

- **Action:** Deploy `app-elite100-estimate-studio` to proposed host; SPA rewrites; UI flags still false or true only for owner machine testing — server still authoritative.
- **Expected:** Sign-in works; APIs 403 without pilot/head.
- **Evidence:** Screenshot/network 403 for non-pilot.
- **Rollback:** Take Studio host offline / prior deploy.
- **Stop:** Tile visible to non-pilot.

### Gate 6 — Owner-only head grant

- **Action:** System Admin Access Scope → grant `elite100_estimate_studio` to owner only; set `ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS`; enable Studio + API flags as needed for PRIVATE_STUDIO_ONLY.
- **Expected:** Owner sees tile; other employee does not; direct URL/API 403.
- **Evidence:** Two-account check.
- **Rollback:** Remove grant + clear pilot env + Studio flag 0.
- **Stop:** Any non-owner grant.

### Gate 7 — Synthetic fixture / publication creation

- **Action:** Create **staging-only** fictional Elite 100 quote (example.com) **or** use approved synthetic fixture path; publish from Studio.
- **Expected:** Publication ID returned; staff notice may show awaiting allowlist.
- **Evidence:** Publication UUID (staff-only store).
- **Rollback:** Revoke publication.
- **Stop:** Real customer quote used; no automatic production insert authorized.

### Gate 8 — Synthetic publication allowlist

- **Action:** Set `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS=<uuid>` on Brain; restart/redeploy env.
- **Expected:** Diagnostics show allowlist count ≥ 1 (IDs never returned).
- **Evidence:** Diagnostics JSON.
- **Rollback:** Clear allowlist env.
- **Stop:** Wildcard / multiple real IDs.

### Gate 9 — Public head deploy

- **Action:** Deploy `app-digital-estimate`; configure CORS/`HEAD_URL_DIGITAL_ESTIMATE`; enable public read (+ config flags only if smoke needs them). **Hard gate:** Brain `VITE_BACKEND_URL` / public Brain base must be same-site (`*.eliteosfab.com`, e.g. `api.eliteosfab.com`) so `de_cfg_session` (SameSite=Strict) is returned. Do not weaken cookie policy.
- **Expected:** Non-allowlisted tokens 404; allowlisted fragment exchange works; credentialed config cookie set and returned.
- **Evidence:** Smoke network log (redact tokens).
- **Rollback:** Public flags 0; prior deploy.
- **Stop:** Real publication reachable; cross-site Brain host only (`*.vercel.app`) with Strict cookie.

### Gate 10 — Synthetic end-to-end smoke

Follow smoke list in `PHASE_DE_2G_0_READINESS.md` / below. Capture checklist. Stop on email/send or quote_headers mutation.

### Gate 11 — Rollback test

- **Action:** Flip public flags off; confirm 404; confirm data retained; confirm IE/QL unaffected.
- **Expected:** Instant kill; history preserved.
- **Evidence:** Before/after API responses.
- **Rollback:** Re-enable only under Gate 10 approval.
- **Stop:** Data loss / destructive SQL.

### Gate 12 — Explicit stop before real-customer use

- **Action:** Confirm `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=1`; distributed limiter still not ready; no REAL_CUSTOMER authorization.
- **Expected:** Deployment state ≠ authorized real-customer.
- **Evidence:** Diagnostics `realCustomerPilotAuthorized: false`.
- **Rollback:** N/A.
- **Stop:** Any plan to set synthetic-only `0` without later phase.

---

## Smoke test plan (Gate 10)

1. Owner sees Studio tile
2. Non-pilot does not
3. Direct non-pilot access 403
4. Synthetic publication created safely
5. Non-allowlisted link unavailable
6. Add publication ID to server allowlist
7. Fragment link exchange succeeds
8. Raw token absent from path/logs
9. Customer-safe read works
10. Envelope activation
11. Material selection
12. Server DE.2C calculation
13. Correct 2% material tax internally
14. Correct ceiling-$10 publicly
15. Review request
16. Studio queue
17. Comparison
18. Amendment
19. Replacement publication initially blocked
20. Replacement ID allowlisted
21. Replacement link works
22. Old link/session unavailable
23. No email sent
24. No `quote_headers` changes
25. No Quote Library changes
26. No Takeoff changes
27. Kill switch disables public access
28. Data/audit preserved

---

## Secret audit checklist

- [ ] No service-role in any `VITE_*` / `dist/`
- [ ] No publication/session secrets in source
- [ ] No owner UUID/email hardcoded
- [ ] No Graph/Gemini secrets in new apps
- [ ] `.env` gitignored; examples placeholders only
- [ ] Fragment token never logged / never in path/query after exchange
