# Countertop Visualizer (Local MVP)

Standalone local countertop concept visualizer. Uses **Vite + React** for the UI and a **FastAPI + OpenCV** render engine on the local filesystem. No database, Supabase, quote workflow, or cloud AI APIs.

> **Concept visualization only.** Not an estimate, measurement, layout, inventory reservation, or production drawing.

## Requirements

- Python 3.9+
- Node.js 18+

## Setup

```bash
cd app-visualizer

# Python render API
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Generate sample kitchen + slab textures
python render/generate_samples.py

# Frontend
npm install
```

## Run locally

Terminal 1 — render API (port **8190**):

```bash
cd app-visualizer
source .venv/bin/activate
uvicorn render.api:app --reload --host 127.0.0.1 --port 8190
```

Terminal 2 — frontend (port **5190**):

```bash
cd app-visualizer
npm run dev
```

Open http://localhost:5190

1. Upload a kitchen photo (or use the sample)
2. Pick a local slab material
3. Click four countertop corners on the photo
4. Click **Render visualization** to see before/after

Outputs are written to `outputs/`; uploads to `uploads/`.

## CLI

```bash
cd app-visualizer
source .venv/bin/activate

python render/visualize.py \
  --kitchen samples/kitchen.jpg \
  --slab slabs/sample.jpg \
  --points "80,418 1200,418 1240,518 40,518" \
  --output outputs/result.jpg
```

Point order: top-left → top-right → bottom-right → bottom-left (image pixel coordinates).

## API

### `POST /api/render`

`multipart/form-data`:

| Field | Required | Description |
|-------|----------|-------------|
| `kitchen_image` | yes | Kitchen photo file |
| `points` | yes | JSON `[[x,y],...]` (4 points) or `"x1,y1 x2,y2 x3,y3 x4,y4"` |
| `slab_id` | one of | Catalog id matching a file in `slabs/` |
| `slab_image` | one of | Custom slab texture upload |

Response includes `output_url` (saved under `outputs/`).

### `GET /api/slabs`

Lists slab textures from `slabs/`.

## Render pipeline

1. Load kitchen photo and slab texture
2. Tile slab texture to cover the quad
3. Perspective-warp tiled texture into the 4-point polygon (OpenCV)
4. Build polygon mask
5. Preserve original photo luminance (shadows/highlights) via LAB channel blend
6. Composite and save JPEG locally

## Folder layout

```
app-visualizer/
  render/           # Python engine + FastAPI + CLI
  src/              # React frontend
  samples/          # Sample kitchen images
  slabs/            # Local slab texture catalog
  uploads/          # Uploaded kitchen photos (runtime)
  outputs/          # Render results (runtime)
```

## Isolation

This MVP is intentionally isolated from eliteOS quote, pricing, inventory, Moraware, QuickBooks, Monday, and AI takeoff systems. No shared database tables or Supabase storage.
