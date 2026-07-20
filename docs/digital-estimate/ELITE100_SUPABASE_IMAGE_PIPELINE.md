# Elite 100 image pipeline — Supabase-backed (corrected)

**Branch:** `fix/digital-estimate-breakdowns-controls-assets-and-layout`  
**Date:** 2026-07-20  
**Correction:** Prior “11 ready / 89 missing” counted **repo-local pilot JPEGs only**. That is not the production source of truth.

## Runtime source of truth

| Layer | Resource |
|-------|----------|
| Storage bucket | `eliteos-slab-images` (public) |
| Tables | `slab_color_collections` → `slab_color_catalog_items` → `slab_color_visual_assets` (+ `slab_color_aliases`) |
| Public URLs | `getPublicUrl` — permanent, non-expiring |
| Thumb | `texture_url_600` (`…/thumb-600.jpg`) |
| Preview | `texture_url_1024` / `hero_url` (not original 40–55 MB masters) |
| Original master | `original_image_url` — import/admin only; not used for DE grid |

URL shape:
```
https://{project}.supabase.co/storage/v1/object/public/eliteos-slab-images/org/{orgId}/elite100-visual/{slug}-{itemId[:8]}/thumb-600.jpg
```

No Supabase `/render/image` transforms — sizes are pre-generated at import (`importElite100ManualPhotos.js`).

## Surfaces that already use this pipeline

1. **Kiosk Elite 100 section** — iframes `VITE_KIOSK_ELITE100_URL?kiosk=1` → `app-slab-inventory` `PublicElite100Page` → `GET /api/public/elite100-showroom`
2. **Slab Inventory** — `GET /api/slab-inventory/elite100-programs` + same card model (`elite100CardModel.js`)
3. **Carousel** — `Elite100ShowroomSection` / `Elite100ShowroomCard` in `app-slab-inventory/src/lib/elite100Showroom.tsx`
4. **Visualizer** — `fetchElite100CatalogAndAssets` + `buildElite100PublicTextures`

Kiosk **home nav swatches** (`/stone/*.jpg`) remain local pilots only — not the full 100.

## Canonical join key

Digital Estimate `materialId` = `e100-` + slugify(color_name)  
matched to catalog `color_name` / Grey↔Gray normalization / `color_key`.

Resolver: `backend-core/src/digitalEstimate/configuration/elite100CustomerImageResolver.mjs`  
(reuses `fetchElite100CatalogAndAssets`, `chooseBestAssetsByCatalogId`, `pickElite100TextureUrls`).

Public DTO fields (customer-safe):
- `thumbnailUrl` / `imageAssetPath`
- `previewUrl` / `imageFullPath`
- `imageStatus`: `ready` | `missing` | `fallback_local`

## Local pilots (11)

Still under `app-*/public/materials/elite100/{thumb,full}/` as **fallback only** when Supabase resolution fails. They are not required for DE when org visual assets are present.

## Digital Estimate behavior

- Material grid loads **thumbnails only** (lazy)
- Preview panel loads **1024/hero** lazily when hovered/focused
- Does **not** eagerly load original masters
- Does **not** duplicate full catalog into `app-digital-estimate/public`
- Org id from `PUBLIC_VISUALIZER_ORGANIZATION_ID` / `SLABOS_ORGANIZATION_ID` / `SLABCLOUD_ORGANIZATION_ID`

## Live reconciliation (Supabase query 2026-07-20)

| Metric | Count |
|--------|------:|
| Active Elite 100 catalog colors | 100 |
| With approved/imported visual asset | **95** |
| Truly without visual asset | **5** |

Colors without an approved visual asset row (polished fallback until assets exist):

- Mackinaw
- Delgatie Satin
- Everleigh Warm
- Inverness Everleigh
- Kenwood

Full per-color rows: `docs/digital-estimate/ELITE100_IMAGE_RECONCILIATION.json`.

**Retracted:** “11 ready / 89 missing” (repo-local pilots only).
