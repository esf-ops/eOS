# eOS subdomain & production routing migration plan

This document captures how local development is wired today and how it should migrate to hosted domains without baking `localhost` into application code.

## 1. Current local development topology

| Layer | Typical URL / port |
| --- | --- |
| **backend-core** (Express, Moraware ingest + APIs) | `http://localhost:3001` (override via `PORT`) |
| **app-home** (launcher) | Vite dev server (e.g. `http://localhost:5177`) |
| **app-executive** | Vite (`http://localhost:5175` default in launcher env) |
| **app-brain-health** | Vite (`http://localhost:5174`) |
| **app-system-admin** | Vite (`http://localhost:5176`) |
| **Supabase Auth / Postgres / Storage** | Supabase Cloud project URLs + anon key on each SPA |

Local SPAs authenticate with Supabase Auth, then call the backend via `Authorization: Bearer <access_token>`. Launcher “Open head” targets are driven by **`VITE_*_URL`** env vars with localhost fallbacks in `app-home` only until production URLs exist.

## 2. Target production shape

**Primary entry:** `eos.elitestonefabrication.com` (or similarly named canonical host):

- Hosted **app-home** as the branded login shell and launcher (“one central login”).
- Operational heads reachable as separate hosted SPAs opened in the same browser session (reuse Supabase session) **or**, long-term, as routes inside a consolidated shell (`/home`, `/executive`, `/brain-health`, etc.).
- **Backend API** on a stable API host (same-origin via reverse-proxy or dedicated `api.…`) behind HTTPS.

Principles:

- Browsers trust **HTTPS** origins; **`EOS_ALLOWED_ORIGINS`** on the backend must list every production SPA origin that calls the API with credentials (`Authorization`).
- Frontend uses **anon** Supabase keys only; **service-role** stays on the backend.

## 3. Environment configuration checklist

### Frontends (each Vite app)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable browser key |
| `VITE_BACKEND_URL` | API origin without trailing slash; omit `/api` suffix (launcher + heads normalize this consistently) |

**Launcher-specific (app-home)**

| Variable | Purpose |
| --- | --- |
| `VITE_EXECUTIVE_URL` | Production Executive SPA origin |
| `VITE_BRAIN_HEALTH_URL` | Brain Health origin |
| `VITE_SYSTEM_ADMIN_URL` | System Admin origin |
| `VITE_QUOTE_URL` *(future)* | Dealer / internal quote experiences |
| `VITE_SHOP_TV_URL` *(future)* | Shop-floor display head |

Avoid hard-coded `localhost` in committed code paths; localhost defaults may remain in dev-only wrappers or `.env.local` (gitignored).

### Backend (backend-core / server runtime)

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP listen port (default project convention `3001` locally) |
| `SUPABASE_URL` | Service Supabase connectivity |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — never exposed to browsers |
| `EOS_ALLOWED_ORIGINS` | Comma-separated list of allowed SPA origins for CORS (production hostnames included) |
| `EOS_CRON_SECRET` *(if used)* | Shared secret header for cron-only sync endpoints — **never** ship to frontend |
| Moraware + internal sync env | Remain backend-only |

### Supabase Dashboard

Under **Authentication → URL configuration**, configure:

- **Site URL** (production launcher origin).
- **Redirect URLs** for every SPA origin that participates in OAuth / invite / recovery flows (`api` callbacks, previews, localhost as needed).

## 4. Migration principles

1. **No secrets in SPA bundles:** anon key OK; **service-role** and **Moraware** credentials strictly server-side.
2. **`EOS_ALLOWED_ORIGINS` must track real browser origins:** add staging previews before rollout; remove stale hosts after decommission.
3. **Cron / internal ingestion** callers use HTTPS + `x-eos-cron-secret`, not browser calls.
4. **Launcher URLs:** production uses `VITE_*_URL`; local dev relies on `.env.local` placeholders.
5. **Same Supabase tenant** across launcher + heads so users can move between surfaces without redundant email/password prompts while the JWT remains valid.

## 5. Long-term consolidation (optional)

Today's multi-app mono-repo stays practical for isolated deploys during early rollout. Consolidation paths:

| Route (example) | Source today |
| --- | --- |
| `/home` | `app-home` |
| `/executive` | `app-executive` components |
| `/brain-health` | `app-brain-health` |
| `/system-admin` | `app-system-admin` |
| `/quote` | dealer / quoting experiences |
| `/shop-tv` | display dashboards |

Migrating helpers (`apiFetch`, Supabase singleton, launcher cards) behind a router keeps API contracts unchanged.

## 6. Rollout checklist snapshot

1. Provision production SPA hosts + HTTPS certificates.
2. Point `VITE_BACKEND_URL` for every SPA build to production API URL.
3. Expand `EOS_ALLOWED_ORIGINS` on backend to production (and staging) origins.
4. Update Supabase redirect allow-lists + Site URL for launcher-first login.
5. Smoke-test **`GET /api/me`** / **`GET /api/me/heads`** from production launcher after login (401 without token expected on direct curl).

When this migration completes, **`curl`** against production without a bearer token continues to yield **401 JSON**, never silent HTML errors from mismatched proxies.
