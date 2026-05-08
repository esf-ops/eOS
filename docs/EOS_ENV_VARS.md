# eOS environment variables

Variables are split into **backend-only secrets**, **sync / worker** (still backend), **optional backend toggles**, and **frontend-safe** `VITE_*` values.

**Never put in the browser bundle:** `SUPABASE_SERVICE_ROLE_KEY`, Moraware credentials, `EOS_CRON_SECRET`, or any private API keys.

---

## Frontend-safe (Vite apps: `app-brain-health`, `app-executive`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (same project users log into). |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase **anon** public key (RLS applies). |
| `VITE_BACKEND_URL` | Recommended | eOS API base, **no trailing slash**, e.g. `https://api-staging.esf-internal.com` or `http://localhost:3001`. |

Copy `app-brain-health/.env.local.example` and `app-executive/.env.local.example` to `.env.local` locally.

---

## Backend-only — Supabase & API server (`backend-core`)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Same project URL as server-side access. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role — **server only**; bypasses RLS — never expose to clients. |
| `PORT` | No | Listener port (default **3001** in code). |
| `EOS_ALLOWED_ORIGINS` | Staging/prod | Comma-separated origins, e.g. `https://app1.vercel.app,https://app2.vercel.app`. Localhost Vite ports are always merged in — see server comment block. |
| `EOS_CRON_SECRET` | For cron routes | Shared secret header `x-eos-cron-secret` for internal autosync endpoints. |
| `EOS_ALLOW_PUBLIC_SYNC_HEALTH` | No | Set to `1` only if you intentionally expose sync health without auth (default is guarded — see server). |

---

## Backend-only — Moraware & sync scripts

Used by **`backend-core/src/scripts/syncMoraware.js`**, discovery in `src/morawareClient.js`, and related tooling. Typical staging/production deployment runs these **only on a worker/server**, not in the browser.

| Variable | Description |
|----------|-------------|
| `MORAWARE_API_URL` | SOAP/API base URL. |
| `MORAWARE_USERNAME` | Moraware username. |
| `MORAWARE_PASSWORD` | Moraware password. |
| `MORAWARE_ACCOUNT_ID` | Account scope when modes require it. |
| `MORAWARE_SYNC_MODE` | e.g. `global`, account flows (see scripts). |
| `MORAWARE_SYNC_START_DATE` | Lower bound for job selection (often `YYYY-MM-DD`). |
| `MORAWARE_SYNC_END_DATE` | Optional upper bound. |
| `MORAWARE_MAX_SEARCH_PAGES` | Discovery/search cap (large syncs tune this explicitly). |
| `MORAWARE_MAX_JOBS_TO_INGEST` | Safety cap for partial runs. |
| `MORAWARE_INGEST_ALL_MATCHING_JOBS` | Set when full cohort ingest is intentional. |
| `MORAWARE_INGEST_OPERATIONAL` | Operational summary pipeline toggle. |
| `MORAWARE_INGEST_FORMS` | Forms ingestion toggle where supported. |
| `MORAWARE_PROCESS_IDS` | Optional CSV override when discovery needs explicit process list. |
| `MORAWARE_PAGE_SIZE` / `MORAWARE_SEARCH_PAGE_SIZE` | Pagination. |
| `MORAWARE_DISCOVERY`, `MORAWARE_DISCOVERY_MODE` | Diagnostic / discovery flows (normally off in cron). |

---

## Backend-only — Supabase writes & Brain persistence

| Variable | Description |
|----------|-------------|
| `SUPABASE_WRITE_ENABLED` | Must be `1` for scripts that mutate Brain tables. |
| `EOS_SYNC_RUN_ID` | Usually set internally during a sync run for correlation. |

---

## Backend — optional tooling / audits

| Variable | Description |
|----------|-------------|
| `MORAWARE_AUDIT_YEAR` | Scripts like audit coverage defaults. |
| `EOS_RETRY_LIMIT` | Failed-job retry script. |
| `EOS_API_BASE_URL` | e.g. `testAuthLogin` script target. |
| `EOS_TEST_PASSWORD` | Local-only auth smoke tests — never staging/prod secrets in repo. |
| `MORAWARE_REPORT_CSV` | Reconcile script input path. |
| Various `EOS_DEBUG_*` / `MORAWARE_DEBUG_*` | Diagnostics only. |

---

## Quick rules

1. **`SUPABASE_SERVICE_ROLE_KEY`** → backend & worker processes only.
2. **Moraware credentials** → backend & worker processes only.
3. **`EOS_CRON_SECRET`** → backend + trusted schedulers only; never in frontend.
4. **`VITE_SUPABASE_ANON_KEY`** → OK in static builds (public by design).

See `backend-core/.env.example` for a consolidated template aligned with deployment.
