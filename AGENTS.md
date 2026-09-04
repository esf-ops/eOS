# AGENTS.md

## Cursor Cloud specific instructions

eliteOS is a multi-head monorepo: a central Express **Brain API** (`backend-core`), ~22 Vite + React **heads** (`app-*`), and a legacy Moraware pipeline under `src/`. There are **no npm workspaces** — the repo root, `backend-core`, and each `app-*` have their own `node_modules` and must be installed separately. The startup update script already runs `npm install` for the root, `backend-core`, and every `app-*` with a `package.json`, so you normally do not need to reinstall.

Standard commands are documented in `README.md` (run/build/verify) and `package.json` scripts. Key ones: backend `npm run eos:server` (port 3001), a head `cd app-<name> && npm run dev`, lint `npm run lint`, build all heads `npm run eos:build:all-heads`, full verify `npm run eos:check:local`.

### Non-obvious gotchas

- **Backend requires Supabase env at boot.** `backend-core/src/server.js` eagerly constructs the Supabase client (via the Elite 100 studio estimate service) at import time, so it will **crash on startup** with `Missing required env var: SUPABASE_URL` unless both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Env is read from a root `.env` (dotenv resolves from the process cwd = repo root). Copy `.env.example` → `.env`. With **placeholder** Supabase values the server boots and serves no-DB endpoints (`/api/health`, `/api/auth/roles`, `/api/brain/sync-plan`), but any endpoint that actually queries Supabase (auth, `/api/me`, executive/brain/quote data) will fail at runtime — those need a **real** Supabase project + service role key.
- **Full auth / data E2E needs real Supabase credentials** (project URL, service role key for backend, anon key for heads) plus seeded users with head access. Without them you can validate build/lint/tests, backend boot + no-DB endpoints, and head UI rendering (the sign-in screen), but not authenticated flows.
- **Heads read `.env.local`** (browser-safe `VITE_*` only): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL=http://localhost:3001`. Copy from each app's `.env.local.example` / `.env.example`.
- **Vite dev port collisions:** `app-hr` and `app-visualizer` both default to 5190; `app-kiosk` and `app-digital-estimate` both default to 5195. Do not run a colliding pair simultaneously without overriding the port.
- **Tests are plain `node` scripts** run via `eos:test:*` / `qb:test` npm scripts (no test runner). Many (e.g. `eos:test:hr-workforce`, `eos:test:custom-quote`) are pure fixture-based unit tests that pass without Supabase.
- **Secrets:** never put the Supabase service role key, Moraware, Monday, or QuickBooks credentials into any `VITE_*` var or head code — those are browser-exposed. Backend/worker only.
