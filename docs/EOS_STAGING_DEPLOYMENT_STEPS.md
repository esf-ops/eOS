# eOS — staging deployment steps (GitHub handoff)

Use this checklist when moving from Chris’s workstation to **private GitHub** and a **hosted staging** slice. Narrative complements `EOS_DEPLOYMENT_PLAN.md` and `EOS_ENV_VARS.md`.

---

## Operational sequence

### 1. Create a private GitHub repository

- Create org or personal **private** repo (e.g. `elitestonefabrication/eos`).
- Decide default branch (`main`).
- Optionally enable branch protection later.

### 2. Push the local eOS repository

From the repo root (after verifying **Part A secret checks**):

```bash
git init   # only if not already a repo
git remote add origin git@github.com:ORG/eos.git
git add -A
git status # confirm no .env, .env.local, debug/, node_modules/, dist/
git commit -m "Initial handoff"
git push -u origin main
```

### 3. Create hosting projects (example: Vercel for heads + API elsewhere)

- **Brain Health Head** → one static/Vite deployment (project root `app-brain-health`).
- **Executive Head** → second deployment (`app-executive`).
- **Backend API** (`backend-core`) is **long-running Node** → use Railway, Fly.io, Render, EC2, or similar — **not** a serverless-only function if cron callers need predictable TCP.

### 4. Backend: configure environment variables

On the API host only (never in frontend env UI):

| Required (typical) | Notes |
|--------------------|--------|
| `SUPABASE_URL` | Same project users authenticate against |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only |
| `PORT` | If platform requires custom port binding |
| `EOS_CRON_SECRET` | Matches schedulers hitting internal sync routes |
| `EOS_ALLOWED_ORIGINS` | Comma-separated HTTPS origins **for both heads** |

Optional for workers/cron VMs: Moraware vars + `SUPABASE_WRITE_ENABLED=1` for sync scripts (see `EOS_ENV_VARS.md`).

### 5. Frontend: configure each head

For **both** Brain Health and Executive deployments:

| Variable | Example |
|---------|---------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_BACKEND_URL` | `https://api-staging.example.com` (no trailing slash) |

Never set service role / Moraware / cron secret in Vercel frontend env.

### 6. Backend: `EOS_ALLOWED_ORIGINS`

Set to exact browser origins hosting the SPA, comma-separated:

```text
https://eos-brain-health-staging.vercel.app,https://eos-executive-staging.vercel.app
```

Local dev localhost ports remain allowed in server code; staging/prod URLs **must** be listed here.

### 7. Supabase: Auth redirect URLs

Dashboard → Authentication → URL configuration:

- **Site URL** — pick primary staging head or a neutral launcher URL.
- **Redirect URLs** — add **both** staged head HTTPS URLs (magic link / OAuth return paths).

Misconfiguration shows up as silent login failures or redirects to localhost.

### 8. Deploy backend

- Build command generally **none** (plain Node entry).
- Start command: `node backend-core/src/server.js` from repo root with env injected—or container image with same layout.
- Health check URL: `/api/health`.

### 9. Deploy Brain Health Head

- Install & build (`npm ci && npm run build` in `app-brain-health`).
- Publish `dist/` to static hosting.
- Confirm production env overrides show correct `VITE_BACKEND_URL`.

### 10. Deploy Executive Head

- Same pattern under `app-executive`.

### 11. Smoke test: `/api/health`

```bash
curl -sS https://YOUR-API-STAGING/host-prefix/api/health
```

Expect JSON with `ok: true`.

### 12. Smoke test: login from each head

- Open staging Brain URL → login with staging user.

### 13. Smoke test: `/api/me`

With valid session (browser devtools Application → grab Bearer token briefly, or extension):

```bash
curl -sS https://YOUR-API/api/me -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expect `{ ok: true, user: { … } }`.

### 14. Smoke test: Brain Health

- Load sync health, recent runs, dashboards using live API.

### 15. Smoke test: Executive Head

- Confirm aggregates load as **admin** or **executive** role accounts.

### 16. Freeze wide rollout until validated

Until Chris + Eric sign off staging:

- Limit Supabase staging users invited.
- Do **not** publish staging URLs broadly.

---

## Production readiness notes (ahead of prod cutover)

- **Canonical production domain** — plan for **`eos.elitestonefabrication.com`** launcher / shell and stable head routes.
- **Localhost stays dev-only** — production `VITE_*` must never point at `localhost` except developers’ laptops.
- **Staging is private / limited access** — keep auth allow-list tight (Chris + Eric at first).
- **Long-running sync jobs** — full Moraware ingest may exceed **serverless timeouts** on some platforms; production/staging cron might need **a worker VPS or job runner**.
- **Cron endpoints** — require `EOS_CRON_SECRET`; still expose only behind TLS and rate limits; cron URLs are secrets-in-practice — do not expose in Slack/public docs.
- **Future heads** — installer / partner / homeowner surfaces need **narrower RBAC + data masking** before any external rollout.

---

## References

- `docs/EOS_DEPLOYMENT_CHECKLIST.md`
- `docs/EOS_DEPLOYMENT_PLAN.md`
- `docs/EOS_ENV_VARS.md`
- `docs/EOS_REPO_SECRET_AUDIT.md`
