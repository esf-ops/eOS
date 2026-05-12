# Quote Demo Head — run locally

New Vite app: **`app-quote`** (port **5179**). This is a **meeting demo**, not the final public homeowner wizard.

## Quick start

```bash
cd app-quote
npm install
npm run dev
```

Open **http://localhost:5179**

## Environment (optional live API)

Create `app-quote/.env.local` (not committed) with:

```bash
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- **Without Supabase:** Calculate always uses the **labeled prototype fallback** (same tier/add-on rates as `quoteCalculator.js`, 25% public markup).
- **With Supabase sign-in:** `POST /api/quote/calculate` and `POST /api/quote/submit` run against the backend when `npm run eos:server` is up and quote tables exist.

## Production build (not part of `eos:check:local`)

```bash
npm run eos:build:quote
# or
npm run build --prefix app-quote
```

Root `package.json` includes **`eos:build:quote`** so CI and local workflows can opt in without changing `eos:build:all-heads`.

## Launcher (eOS Home)

If `VITE_QUOTE_URL` is unset, Home defaults the Quote card to **http://localhost:5179** (see `app-home/src/lib/config.ts`).

## Related docs

- `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html` — legacy reference UI  
- `docs/quote-platform/ai-takeoff-and-visualize-plan.md` — future takeoff/visualize  
