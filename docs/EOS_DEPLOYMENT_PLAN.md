# eOS deployment plan

This document describes how Elite Operating System (eOS) is developed locally today, how to stand up **hosted staging**, and how **production** on `eos.elitestonefabrication.com` should evolve.

---

## 1. Current local development architecture

| Layer | Role | Typical URL / host |
|--------|------|---------------------|
| **Supabase (cloud)** | Auth (email/password), Postgres Brain tables, Row Level Security where applicable | Project URL from Supabase dashboard |
| **backend-core** | REST API: auth bridge (`/api/me`), Brain read routes, executive aggregates, sync health, cron-gated sync triggers | `http://localhost:3001` (`PORT` overrides default) |
| **app-brain-health** | Vite + React “Brain Health” head; Supabase session in browser; calls API with Bearer token | `http://localhost:5173` (or next free Vite port) |
| **app-executive** | Vite + React “Executive” head; same auth pattern | Often `http://localhost:5174` if brain-health holds 5173 |
| **Moraware sync** | Node scripts under repo root / `backend-core/src/scripts` ; uses **backend-only** Moraware + service role credentials | Runs on developer machine or future worker host |

Local flow:

1. Developer copies `.env` / `.env.local` from examples (no secrets in Git).
2. `npm run eos:server` starts **backend-core**.
3. Each head runs `npm run dev` inside its app folder with `VITE_BACKEND_URL=http://localhost:3001`.

---

## 2. Target staging architecture

Goals: **authenticated users beyond a single workstation**, **stable URLs**, secrets only on the server and in the CI/hosting vault.

| Component | Staging expectation |
|-----------|---------------------|
| **Hosted backend API** | Node process (e.g. Railway, Fly.io, AWS ECS, internal VM) running `backend-core/src/server.js` with production-like env vars |
| **Hosted frontends** | Static build from each Vite app (`npm run build` → deploy `dist/`) — e.g. Vercel, Netlify, CloudFront+S3 |
| **Supabase** | Same project as prod *or* a dedicated **staging** Supabase project (recommended for safe schema experiments) |
| **Environment variables** | Set in hosting provider UI / secrets manager — **never** committed |
| **Frontends** | Only **anon** Supabase key + **public** API URL (`VITE_*`) — see `docs/EOS_ENV_VARS.md` |

**CORS:** Backend merges localhost Vite origins with **`EOS_ALLOWED_ORIGINS`** (comma-separated). Stage each frontend’s **exact** origin (e.g. `https://eos-brain-health-staging.vercel.app`). Use `GET /api/debug/cors` with browser DevTools “Origin” to verify.

**Cron / autosync:** Staging cron jobs (GitHub Actions, platform schedulers, or `curl` with `x-eos-cron-secret`) call the existing internal sync routes; **EOS_CRON_SECRET** must match.

---

## 3. Target production architecture

| Area | Direction |
|------|-----------|
| **Domain** | Primary experience at **`eos.elitestonefabrication.com`** (launcher or shell) with role-based access |
| **Heads** | Brain Health, Executive, and future heads routed by path or subdomain (e.g. `/brain-health`, `/executive`) — all still using Supabase Auth + backend API |
| **Auth** | Supabase Auth; `user_profiles` (or equivalent) drives **admin / executive / …** as implemented in backend |
| **Scheduled sync** | Nightly / operational jobs using existing scripts + **EOS_CRON_SECRET**; locks and `brain_sync_runs` / failure tables unchanged |
| **Observability** | Action / audit logs (existing patterns), **sync health** surfaces in Brain Health + executive summaries |
| **Secrets** | Moraware credentials + service role + cron secret **backend only** |

Exact hosting choices (Vercel vs Azure vs ESF-owned VM) are organizational; this repo stays **portable** via env vars and static builds.

---

## 4. Development workflow

1. **Edit** locally in Cursor (or any editor) on feature branches.
2. **Test** locally: backend `npm run eos:server`, heads `npm run dev`, optional `npm run eos:check:local`.
3. **Commit** and push to GitHub (no `.env`, no `.env.local` secrets).
4. **Deploy staging** via CI/CD or manual promotion: backend + both heads with **staging** env vars and **staging** `EOS_ALLOWED_ORIGINS`.
5. **Test staging** with non-Chris accounts; confirm login, CORS, executive + brain-health flows, sync triggers if applicable.
6. **Promote to production** after sign-off — update production secrets, origins, and Supabase redirect URLs.

---

## 5. Future update workflow

| Change type | Practice |
|-------------|----------|
| **Application code** | Git branches → PR → merge → redeploy backend and/or heads (version pinned by Git SHA in CI artifacts). |
| **Database schema** | Additive SQL migrations in repo (Supabase migrations or `supabase/migrations` if adopted); avoid destructive changes without backup + plan. |
| **Sync pipeline** | Script + env tuning (still no secrets in Git); coordinate with ops for cron windows and **SUPABASE_WRITE_ENABLED**. |
| **Heads** | Versioned in this monorepo; each head is an independent `npm run build` artifact. |

---

## Related documents

- `docs/EOS_ENV_VARS.md` — variable inventory
- `docs/EOS_DEPLOYMENT_CHECKLIST.md` — go-live checks
