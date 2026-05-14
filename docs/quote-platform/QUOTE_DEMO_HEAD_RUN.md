# eliteOS Public Quote Head — run locally

New Vite app: **`app-quote`** (port **5179**). This is a **meeting demo**, not the final public homeowner wizard. The UI is a **light, customer-facing style** with clear “Preview · Not production” and **Demo mode active** messaging when Supabase sign-in is not configured.

**Measurement direction:** The demo now includes a **quote method** picker (manual sq ft, rapid linear, guided shape, room-by-room) aligned to **`docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html`**, with shared math in `app-quote/src/lib/measurementEngine.ts` and `prototypeQuoteMath.ts`. See **`docs/quote-platform/quote-engine-parity-audit.md`** for gaps vs the full prototype.

### Guided “Help me lay it out” (homeowner path)

- Default flow uses **plain-language layout presets** (straight run, L-shape, U-shape, galley, island only, “I’m not sure”) with **feet** for runs and **inches** for splash height and counter depth (`app-quote/src/lib/guidedHomeowner.ts`).
- A live **measurement preview** shows estimated countertop sf, backsplash sf, total sf, plain-English formula lines, and confidence copy.
- The **piece-by-piece editor** from the ESF prototype remains available under **“Advanced: edit individual pieces”** (a `<details>` block). It is **collapsed by default in Public retail** and **expanded by default in Partner / internal demo** so staff can jump straight to parity testing.
- Optional checkbox: **“Use piece-by-piece measurements for this quote instead of the simple layout above.”** When checked, **Calculate** uses guided pieces; when unchecked, the simple preset math feeds a single manual-scope room into the same engine.

### Compare material groups (after Calculate)

- After a successful **Calculate** (local fallback or live API), the app shows **Compare material groups**: totals for **Group Promo** through **Group F** with **countertop cost**, **backsplash cost**, **add-ons once per row**, and **total**, using `buildMaterialGroupComparison` in `prototypeQuoteMath.ts`.
- **Mixed material groups (room-by-room):** if non-vanity rooms use different primary groups, a banner explains that the matrix uses **total measured scope** across groups; per-room mixed comparison is deferred.
- **Public retail:** the table shows **homeowner-safe dollar estimates** only (counter / splash / add-ons / estimated total with **≥ 25% protection**). It does **not** show wholesale, internal rates, or margin.
- **Partner / internal:** the table adds **rate**, wholesale-style line costs, wholesale total, retail/protected total, and display profit; it is labeled **internal demo — not public-facing.** The **Math check** panel remains **partner-only** and hidden in public mode.

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

- **Without Supabase:** the app shows **Demo mode active** and **Calculate** uses the **gentle labeled prototype fallback** (“Demo calculation fallback — backend not connected.”) with the same tier/add-on rates as `quoteCalculator.js` and **25%+ public retail protection** (no wholesale shown in **Public retail** mode).
- **With Supabase sign-in:** `POST /api/quote/calculate` and `POST /api/quote/submit` run against the backend when `npm run eos:server` is up and quote tables exist.

**Public consumer (no sign-in):** when the backend is running, **Public retail** mode in `app-quote` calls `POST /api/public-quote/calculate` and can submit leads via `POST /api/public-quote/submit-measurements` (see `docs/quote-platform/three-head-quote-architecture.md`). Apply `backend-core/supabase/eos_quote_public_internal_partner_foundation.sql` for territory and payload audit tables.

**Monday.com (optional):** to create a board item on each successful public submit, configure `MONDAY_API_TOKEN` and `MONDAY_PUBLIC_QUOTES_BOARD_ID` on the server. See **`docs/quote-platform/monday-public-quotes-setup.md`** for column mapping env vars and the `inspectMondayBoardColumns.js` helper.

## Production build

```bash
npm run eos:build:quote
# or
npm run build --prefix app-quote
```

Root `package.json` includes **`eos:build:quote`** so CI and local workflows can opt in without changing `eos:build:all-heads`. For a quick check before a demo, run `npm run build --prefix app-quote` (also used in release prep alongside `npm run eos:check:local`).

## Launcher (eliteOS Home)

If `VITE_QUOTE_URL` or `VITE_HEAD_URL_PUBLIC_QUOTE` is unset, eliteOS Home defaults the Public Quote card to **http://localhost:5179** (see `app-home/src/lib/config.ts`).

## Related docs

- `docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html` — legacy reference UI  
- `docs/quote-platform/ai-takeoff-and-visualize-plan.md` — future takeoff/visualize  
