# Countertop Visualizer — slabOS Visualizer Head

Standalone **slabOS Visualizer** head for eliteOS. Upload a kitchen photo, browse countertop materials, and receive an **AI concept render** from `backend-core` at `/api/public-visualizer/*`.

> **Concept visualization only.** Not an estimate, measurement, layout, inventory reservation, or production drawing.

Public customer-facing deployment at **https://visualizer.eliteosfab.com** — no sign-in required.

Isolated from slab inventory operations, quotes, pricing, and AI Takeoff job tables.

## Architecture

| Layer | Location |
|-------|----------|
| Frontend | `app-visualizer/` (Vite + React, port **5190**) |
| Texture catalog | `app-visualizer/catalog/visualizer-textures.json` |
| Static assets | `app-visualizer/public/material-textures/` |
| Public API | `backend-core/src/visualizer/` → `/api/public-visualizer/*` |
| Internal API | `/api/visualizer/*` (auth + head access, optional for staff) |

## Requirements

- Node.js 18+
- Running **backend-core** (port **3001**)
- Frontend env: `VITE_BACKEND_URL` only (no Supabase required for public deployment)
- Server env: `PUBLIC_VISUALIZER_ENABLED=1`, `PUBLIC_VISUALIZER_RENDER_ENABLED=1`, provider API key

## Backend env (`backend-core/.env`)

```bash
PUBLIC_VISUALIZER_ENABLED=1
PUBLIC_VISUALIZER_RENDER_ENABLED=1
PUBLIC_VISUALIZER_MAX_UPLOAD_MB=10
PUBLIC_VISUALIZER_MAX_RENDERS_PER_IP_PER_HOUR=12

VISUALIZER_RENDER_PROVIDER=gemini   # or openai
VISUALIZER_RENDER_MODEL=gemini-2.0-flash-preview-image-generation
GEMINI_API_KEY=...                  # when provider=gemini
# OPENAI_API_KEY=...                # when provider=openai

HEAD_URL_VISUALIZER=https://visualizer.eliteosfab.com

# Optional: expand public texture catalog from Elite 100 visual assets (read-only DB)
PUBLIC_VISUALIZER_USE_ELITE100_ASSETS=1
PUBLIC_VISUALIZER_ORGANIZATION_ID=   # org UUID; falls back to SLABOS_ORGANIZATION_ID / SLABCLOUD_ORGANIZATION_ID
```

Optional internal-only routes (staff with visualizer head access):

```bash
VISUALIZER_RENDER_ENABLED=1
```

## Frontend env (`app-visualizer/.env.local`)

```bash
VITE_BACKEND_URL=http://localhost:3001
```

## Run locally

Terminal 1 — backend-core:

```bash
cd backend-core
npm start   # or node src/server.js — port 3001
```

Terminal 2 — visualizer head:

```bash
cd app-visualizer
npm install
npm run dev
```

Open http://localhost:5190, upload a photo, pick a material, click **Visualize**.

## Public API

### `GET /api/public-visualizer/config`

Safe public config (no secrets). No auth required.

### `GET /api/public-visualizer/textures`

Returns static preview textures from `app-visualizer/catalog/visualizer-textures.json`, plus optional **Elite 100** visual assets from `slab_color_visual_assets` when `PUBLIC_VISUALIZER_USE_ELITE100_ASSETS=1`. Does **not** call `/api/slab-inventory/*` and does not return inventory counts, slab IDs, availability, or operational metadata.

Response includes `meta.staticCount`, `meta.elite100VisualAssetCount`, `meta.usesElite100Assets`, and `meta.skippedAssets` (when DB enrichment runs).

### `POST /api/public-visualizer/render`

`multipart/form-data`:

| Field | Required | Description |
|-------|----------|-------------|
| `roomImage` | yes | Kitchen/bath photo |
| `materialId` | yes | Texture id from catalog |
| `userInstruction` | no | Extra prompt hint |

Returns `renderedImage` as a data URL plus disclaimer. **No DB writes.** Rate-limited per IP.

## Tests

```bash
node backend-core/src/visualizer/visualizerRoutes.test.mjs
npm run build --prefix app-visualizer
node --check backend-core/src/visualizer/publicVisualizerRoutes.js
node --check backend-core/src/visualizer/visualizerRoutes.js
node --check backend-core/src/server.js
```

## Legacy local Python engine

The `render/` folder contains an earlier OpenCV prototype (local FastAPI). The MVP uses **backend-core provider render** instead. It is kept for reference only.
