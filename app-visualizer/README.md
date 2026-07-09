# Countertop Visualizer — slabOS Visualizer Head

Standalone **slabOS Visualizer** head for eliteOS. Upload a kitchen photo, browse countertop materials, and receive an **AI concept render** from `backend-core` at `/api/visualizer/*`.

> **Concept visualization only.** Not an estimate, measurement, layout, inventory reservation, or production drawing.

Isolated from slab inventory operations, quotes, pricing, and AI Takeoff job tables.

## Architecture

| Layer | Location |
|-------|----------|
| Frontend | `app-visualizer/` (Vite + React, port **5190**) |
| Texture catalog | `app-visualizer/catalog/visualizer-textures.json` |
| Static assets | `app-visualizer/public/material-textures/` |
| Backend | `backend-core/src/visualizer/` → `/api/visualizer/*` |
| Head slug | `visualizer` (unchanged — matches existing head access grants) |

## Requirements

- Node.js 18+
- Running **backend-core** (port **3001**)
- Supabase auth env on the frontend
- Visualizer head access for the signed-in user (`visualizer` slug)
- Server env: `VISUALIZER_RENDER_ENABLED=1` + provider API key

## Backend env (`backend-core/.env`)

```bash
VISUALIZER_RENDER_ENABLED=1
VISUALIZER_RENDER_PROVIDER=gemini   # or openai
VISUALIZER_RENDER_MODEL=gemini-2.0-flash-preview-image-generation
VISUALIZER_MAX_UPLOAD_MB=10
GEMINI_API_KEY=...                  # when provider=gemini
# OPENAI_API_KEY=...                # when provider=openai
HEAD_URL_VISUALIZER=http://localhost:5190
```

## Frontend env (`app-visualizer/.env.local`)

```bash
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
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

Open http://localhost:5190, sign in, upload a photo, pick a material, click **Visualize**.

## API

### `GET /api/visualizer/config`

Safe provider config (no secrets). Requires auth + `visualizer` head access.

### `GET /api/visualizer/textures`

Static demo texture manifest. Does **not** call `/api/slab-inventory/*`.

### `POST /api/visualizer/render`

`multipart/form-data`:

| Field | Required | Description |
|-------|----------|-------------|
| `roomImage` | yes | Kitchen/bath photo |
| `materialId` | one of | Demo texture id from catalog |
| `materialImage` | one of | Optional custom texture upload |
| `userInstruction` | no | Extra prompt hint |

Returns `renderedImage` as a data URL plus disclaimer. **No DB writes.**

## Tests

```bash
node backend-core/src/visualizer/visualizerRoutes.test.mjs
npm run build --prefix app-visualizer
node --check backend-core/src/visualizer/visualizerRoutes.js
node --check backend-core/src/server.js
```

## Legacy local Python engine

The `render/` folder contains an earlier OpenCV prototype (local FastAPI). The MVP uses **backend-core provider render** instead. It is kept for reference only.
