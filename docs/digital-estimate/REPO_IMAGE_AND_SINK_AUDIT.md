# Digital Estimate — repository image & sink catalog audit

**Branch:** `fix/digital-estimate-breakdowns-controls-assets-and-layout`  
**Date:** 2026-07-20

## Elite 100 materials (100 colors)

| Metric | Count |
|--------|------:|
| Catalog colors | 100 |
| Prior image-ready (thumbs+full in DE public) | 11 |
| After this branch | **11 ready / 89 missing** |
| Newly resolved from other apps | 0 |

### Search locations checked

- `app-digital-estimate/public/materials/elite100/{thumb,full}/`
- `app-elite100-estimate-studio/public/materials/elite100/`
- `app-slab-inventory/public/materials/elite100/` and `public/material-textures/`
- `app-visualizer` / hub-spoke material texture folders
- `docs/digital-estimate/ELITE100_MATERIAL_TEXTURE_INVENTORY.json`
- `app-slab-inventory/src/lib/elite100TextureAssets.ts`
- Backend `elite100-2026.json` + `elite100CustomerMaterialCatalog`
- Grep for Carrara Classic, India Black Pearl, Skara Brae, Summerhill, St. Isley

**Finding:** Only the 11 pilot textures exist as deployable files. Skara Brae / Summerhill / St. Isley have **no** repository image files. No CDN/Supabase Storage URLs for the remaining 89 were found.

### Shared delivery strategy (chosen)

1. Keep Elite 100 thumbs/full on Digital Estimate same-origin `/materials/elite100/…`
2. Copy **lightweight Product Catalog heroes** into `app-digital-estimate/public/product-catalog/{sinks,faucets}/…/thumb.*` (~19 MB) so DE domain can load them without slab-inventory hosting
3. Exact SKU / productId map: `app-digital-estimate/src/productCatalogImageMap.json` + `productCatalogImages.ts`

## Sink catalog (normalized ESF plumbing)

| Metric | Count |
|--------|------:|
| Active customer-visible sinks (excl. strainer/flange/grid) | 44 |
| Stock | 14 |
| Special-order | 30 |
| Excluded non-sink row | `blanco:strainer-and-flange` (and any name/id matching strainer/flange/grid) |

Eligibility: room type + publication envelope options + customer-visible + active + approved pricing on Brain seed.

## Faucet / specialty images

- Heroes copied from `app-slab-inventory/public/product-catalog/faucets/`
- Resolver matches exact catalog folder id / SKU keys only (no loose substring assignment)

## Truly missing (Elite 100)

All 89 non-pilot colors remain missing until photography / CDN ingest. See `ELITE100_MATERIAL_IMAGE_QUALITY_REPORT.json`.
