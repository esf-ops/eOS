# eOS (Elite Operating System)

Shared brain for **Elite Stone Fabrication**: Moraware ingestion, Supabase “Brain” persistence, a **backend API** (`backend-core`), and **web heads** for sync health and executive reporting.

> **Do not commit secrets.** Keep `.env`, `.env.local`, and `debug/` dumps local only. Copy from `/.env.example`, `backend-core/.env.example`, and each app’s `.env.local.example`. See [docs/EOS_ENV_VARS.md](docs/EOS_ENV_VARS.md) and [docs/EOS_REPO_SECRET_AUDIT.md](docs/EOS_REPO_SECRET_AUDIT.md).

---

## Heads (Vite + React)

| App | Path | Role |
|-----|------|------|
| **Brain Health Head** | `app-brain-health/` | Sync runs, health, failed jobs, operator visibility |
| **Executive Head** | `app-executive/` | Executive dashboards (admin / executive roles) |

Both use **Supabase Auth** (anon key in browser) and call the API with the user’s JWT.

---

## Backend API

- Entry: `backend-core/src/server.js`
- Default URL (local): `http://localhost:3001`
- Health: `GET /api/health`
- CORS: merges localhost Vite origins with **`EOS_ALLOWED_ORIGINS`** (comma-separated HTTPS origins for staging/prod)

---

## Local development

### Prerequisites

- Node **≥ 18.18**
- Supabase project + service role (backend) + anon key (heads)
- Repo root: `npm install`
- Each head: `npm install` inside `app-brain-health/` and `app-executive/`

### Environment

1. Copy templates to real env files (never commit the copies):

   - Repo root: `.env` from [`.env.example`](.env.example) (API + Moraware sync scripts)
   - Backend-only host (optional): [`backend-core/.env.example`](backend-core/.env.example)
   - Heads: `app-brain-health/.env.local` and `app-executive/.env.local` from their `*.example` files

2. Set `VITE_BACKEND_URL` (and Supabase `VITE_*`) in each head.

### Run

**Terminal 1 — API**

```bash
npm run eos:server
```

**Terminal 2 — Brain Health**

```bash
cd app-brain-health && npm run dev
```

**Terminal 3 — Executive**

```bash
cd app-executive && npm run dev
```

Vite may use `5173`, `5174`, etc.; the server already allows common localhost ports via CORS.

---

## Build / verify

From repo root:

```bash
npm run eos:check:local
```

This runs `node --check` on the server and production-builds **both** heads.

Individual builds:

```bash
npm run eos:build:brain-health
npm run eos:build:executive
npm run eos:build:all-heads
```

---

## Moraware switchboard (legacy pipeline)

Legacy **firehose → normalizer → router** still lives under `src/` for Make.com–aligned batch runs:

```bash
npm start
# or: node src/index.js --mapping "/absolute/path/to/eos_mapping.csv"
```

Mapping file: `./eos_mapping.csv` with headers `moraware_id,esfn_label`.

---

## Deployment docs

| Doc | Purpose |
|-----|---------|
| [docs/EOS_STAGING_DEPLOYMENT_STEPS.md](docs/EOS_STAGING_DEPLOYMENT_STEPS.md) | GitHub + staging host step-by-step |
| [docs/EOS_DEPLOYMENT_PLAN.md](docs/EOS_DEPLOYMENT_PLAN.md) | Architecture (local / staging / production) |
| [docs/EOS_DEPLOYMENT_CHECKLIST.md](docs/EOS_DEPLOYMENT_CHECKLIST.md) | Go / no-go checklist |
| [docs/EOS_ENV_VARS.md](docs/EOS_ENV_VARS.md) | Full variable inventory |

---

## Repo hygiene

- **`debug/`** — Moraware/sync artifacts; **gitignored** — do not ship to GitHub unless you have a deliberate CI artifact policy.
- **`dist/`** — build output; gitignored; rebuilt on each deploy.
- Never `git add -f` `.env` files.

---

## License

Private / UNLICENSED unless otherwise specified.
