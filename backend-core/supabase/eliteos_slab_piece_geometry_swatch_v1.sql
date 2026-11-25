-- eliteOS — slab_piece_geometry swatch columns v1 (additive)
--
-- Each derived piece gets a texture swatch: a crop of the largest near-square
-- region of usable stone (inset from the edge), cut from the full-resolution
-- Slabsmith photo and stored in eliteos-slab-images under
-- org/{org}/slabsmith-derived/{SlabID}/swatch-{hash}.jpg (content-addressed,
-- so a new photo yields a new object and URLs can be cached long-term).
-- Live Inventory color cards use it so every card shows sharp, full-bleed stone.
--
-- Safe to re-run. No existing data changes.

alter table public.slab_piece_geometry
  add column if not exists swatch_rect_px   jsonb,     -- [x, y, w, h] crop in full-image pixels
  add column if not exists swatch_url       text,
  add column if not exists swatch_width_px  integer,
  add column if not exists swatch_height_px integer;

comment on column public.slab_piece_geometry.swatch_url is
  'Public URL of the derived texture swatch JPEG (crop of usable stone from the Slabsmith photo).';
