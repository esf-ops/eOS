# app-kiosk — Elite Stone Showroom (public kiosk presentation)

Public, **no-login**, full-screen showroom presentation for slabOS / **Elite Stone**.
Designed to be launched by **Arreya** as a single full-screen URL on a 65" touchscreen
Chromebox. Arreya remains the device shell (lockdown, kiosk mode, remote management);
this app is **only the presentation content**.

> Public brand: **Elite Stone Showroom** · secondary: _Powered by slabOS_.

Target public URL (later): **https://kiosk.eliteosfab.com/showroom/main**

## What this is (and isn't)

- ✅ Public presentation shell: Home + section launchpads.
- ✅ Premium 65" touch UX: big cards, cinematic transitions, idle attract return.
- ✅ Section destinations are configurable (iframe-embed or polished hero launchpad).
- ❌ No backend routes, no auth, no internal data, no secrets, no DB writes.
- ❌ Not a Product Catalog / Elite 100 / Live Inventory rebuild (those are handed off).

## Routing (custom, no react-router)

| Path | Renders |
|------|---------|
| `/` | Redirects (replaceState) to `/showroom/main` |
| `/showroom/:showroomSlug` | Home attract screen for that showroom |
| `/showroom/:showroomSlug/home` | Home (explicit) |
| `/showroom/:showroomSlug/elite100` | Elite 100 section |
| `/showroom/:showroomSlug/product-catalog` | Product Catalog section |
| `/showroom/:showroomSlug/live-inventory` | Live Inventory section |
| `/showroom/:showroomSlug/visualizer` | Visualizer (phone-handoff QR + open on screen) |

Client-side routing uses the History API (`src/lib/kioskRoutes.ts`). The host must
rewrite all paths to `index.html` — handled by `vercel.json`.

## Sections: native vs iframe vs placeholder

Each section renders one of:

- **Embedded iframe** — when a public URL is configured (with a loading state +
  timeout fallback).
- **Hero launchpad** — a polished "Open section" panel when no URL is configured.
- **Handoff (Visualizer)** — a QR code (generated locally via `qrcode`, no third-party
  API) to continue on a phone, plus "Open Visualizer on this screen".

Configure destinations in `src/lib/kioskConfig.ts` or via env vars:

| Env var | Section | Default |
|---------|---------|---------|
| `VITE_KIOSK_ELITE100_URL` | Elite 100 | _(blank → hero launchpad)_ |
| `VITE_KIOSK_PRODUCT_CATALOG_URL` | Product Catalog | _(blank → hero launchpad)_ |
| `VITE_KIOSK_LIVE_INVENTORY_URL` | Live Inventory | _(blank → hero launchpad)_ |
| `VITE_KIOSK_VISUALIZER_URL` | Visualizer | `https://visualizer.eliteosfab.com` |
| `VITE_KIOSK_PUBLIC_BASE_URL` | deep links / QR base | `https://kiosk.eliteosfab.com` |
| `VITE_KIOSK_IDLE_MS` | idle timeout (ms) | `120000` (2 min) |

> Only set **public-safe** URLs. Never expose internal pricing, costs, slab IDs,
> availability, or operational metadata. See `.env.example`.

## Run locally

```bash
npm install --prefix app-kiosk
npm run dev --prefix app-kiosk      # http://localhost:5195/showroom/main
npm run build --prefix app-kiosk    # production build -> app-kiosk/dist
npm run preview --prefix app-kiosk  # preview the built output
```

## Deploy on Vercel

1. New Vercel project, **Root Directory = `app-kiosk`** (framework auto-detected: Vite).
2. Build command `npm run build`, output `dist` (also declared in `vercel.json`).
3. Add any public env vars above in Project Settings → Environment Variables.
4. Assign the domain **`kiosk.eliteosfab.com`**.
5. Point Arreya at **`https://kiosk.eliteosfab.com/showroom/main`** (full-screen).

Local Arreya smoke test URL: `http://<dev-host>:5195/showroom/main`.

## Idle / attract behavior

After ~2 minutes of no interaction inside a section, the kiosk fades back to the
home attract screen (`src/lib/idleTimer.ts`). Any touch/click/key/wheel resets it.

## Known limitations

- External sites that send `X-Frame-Options: DENY` / restrictive `frame-ancestors`
  cannot be embedded; the frame shows a timeout fallback. Prefer first-party public
  URLs for embedding.
- Section content is handed off (iframe/launchpad), not rebuilt natively — by design
  for this first pass.
