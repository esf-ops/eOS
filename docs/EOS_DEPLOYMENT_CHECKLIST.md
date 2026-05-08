# eOS staging / production deployment checklist

Use this before pointing non-local users at hosted staging or production.

## Repository & secrets hygiene

- [ ] GitHub (or canonical Git remote) accessible to the team  
- [ ] `.env`, `.env.local`, and secrets **not** committed (verify `git status`)  
- [ ] `.gitignore` allows **example** env files (`!.env.example`, `!.env.local.example`)  
- [ ] `backend-core/.env.example` present and up to date  
- [ ] `app-brain-health/.env.local.example` and `app-executive/.env.local.example` present  

## Supabase

- [ ] Staging (or prod) project created; URL + anon key noted for frontends  
- [ ] **Auth** providers / email settings match how users will sign in  
- [ ] **Site URL** and **redirect URLs** include staging/prod head URLs (Supabase Auth settings)  
- [ ] `user_profiles` (or equivalent) seeded with at least one **admin** user for smoke tests  
- [ ] RLS policies reviewed for new environments (no accidental open tables)  

## Backend (backend-core)

- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set on host (never in frontend)  
- [ ] `EOS_CRON_SECRET` set if autosync / cron routes are used  
- [ ] `EOS_ALLOWED_ORIGINS` includes **every** hosted frontend origin (comma-separated, no trailing slashes on paths)  
- [ ] `GET /api/health` returns `ok: true` from outside the box  
- [ ] `GET /api/debug/cors` — from browser on each head, confirm `origin` is listed when authenticated requests matter  
- [ ] Sync health / executive routes behave as expected for test `admin` / `executive` roles  
- [ ] Cron or GitHub Actions **only** call sync routes with correct `x-eos-cron-secret`  
- [ ] Moraware credentials and `SUPABASE_WRITE_ENABLED` documented for whoever runs ingest (never in frontend)  

## Frontend heads

- [ ] Each app built with production env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`  
- [ ] `VITE_BACKEND_URL` matches real API URL (HTTPS in staging/prod; no accidental `localhost`)  
- [ ] Login succeeds; session persists across refresh  
- [ ] Brain Health dashboards load Brain-backed data  
- [ ] Executive head loads aggregates (403 for non-privileged roles is expected)  

## Builds & automation

From repo root (optional shortcuts):

```bash
npm run eos:check:local
```

- [ ] `node --check backend-core/src/server.js` passes  
- [ ] `npm run eos:build:brain-health` passes  
- [ ] `npm run eos:build:executive` passes  

## Operations

- [ ] Sync lock behaviour verified on staging (no duplicate full sync collisions)  
- [ ] Failure queue / unresolved failed jobs monitored  
- [ ] Action / audit logs reviewed for privileged actions (if enabled)  

## Sign-off

- [ ] Named owner for **staging cutover**  
- [ ] Named owner for **production promotion** and DNS (`eos.elitestonefabrication.com` when applicable)  

---

**Reference:** `docs/EOS_DEPLOYMENT_PLAN.md`, `docs/EOS_ENV_VARS.md`, `docs/EOS_STAGING_DEPLOYMENT_STEPS.md`, `docs/EOS_REPO_SECRET_AUDIT.md`
