-- eliteOS — slab_piece_geometry appearance features v1 (additive)
--
-- Color + texture fingerprint computed from each piece's derived swatch
-- (backend-core/src/slabInventory/swatchFeatures.js):
--   { v, lab:[L,a,b], l_std, contrast, edge, palette:[[L,a,b,weight] ×3] }
-- Used for "More like this" and tone (paint / room color) matching in Live Inventory.
-- Derived cache like the rest of the row; null until computed.
-- Safe to re-run.

alter table public.slab_piece_geometry
  add column if not exists swatch_features jsonb;

comment on column public.slab_piece_geometry.swatch_features is
  'Appearance features from the swatch (CIELAB mean, lightness spread, vein contrast, edge density, 3-color palette). Derived; see swatchFeatures.js.';
