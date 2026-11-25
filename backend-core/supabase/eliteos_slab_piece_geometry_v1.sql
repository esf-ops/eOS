-- eliteOS — slab_piece_geometry v1 (additive)
--
-- Per-piece geometry derived from the piece's own Slabsmith photo
-- (slab_images.image_url_pattern = 'slabsmith_local_upload').
--
-- Slabsmith photos are rectified top-down shots on a white field; the stone's
-- pixel bounding box matches Length$Actual × Width$Actual within ~1%, so the
-- photo is a reliable scale source. Derived values are a governed cache:
-- slab_inventory stays the stock authority, slab_images the photo authority.
-- Rows are recomputed when the source photo URL/updated_at, the source
-- dimensions, or the derivation method change.
--
-- Access: Brain service role only (RLS enabled, no policies), same as slab_images.
-- Safe to re-run.

create table if not exists public.slab_piece_geometry (
  id                      uuid        primary key default gen_random_uuid(),
  organization_id         uuid        not null,
  external_source         text        not null,
  external_slab_id        text        not null,

  -- Inputs (change detection)
  method                  text        not null,          -- e.g. 'photo_mask_v1'
  source_image_url        text        not null,
  source_image_updated_at timestamptz,
  source_length_in        numeric,
  source_width_in         numeric,

  -- Result
  status                  text        not null,          -- ok | no_stone | no_dims | error
  error                   text,
  image_width_px          integer,
  image_height_px         integer,
  px_per_in               numeric,
  scale_mismatch_pct      numeric,                       -- |ipp(long) - ipp(short)| / ipp(long) × 100
  outline_px              jsonb,                         -- [[x,y],...] in full-image pixels, closed implicitly
  area_sqft               numeric,                       -- stone area from the photo mask
  bbox_long_in            numeric,
  bbox_short_in           numeric,
  max_rect_long_in        numeric,                       -- largest-area inscribed axis-aligned rectangle
  max_rect_short_in       numeric,
  fit_frontier_in         jsonb,                         -- [[short,long],...] Pareto set of inscribed rectangles
  fill_ratio              numeric,                       -- stone area / bbox area
  is_rectangular          boolean,

  computed_at             timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint slab_piece_geometry_status_check
    check (status in ('ok', 'no_stone', 'no_dims', 'error')),
  unique (organization_id, external_source, external_slab_id)
);

comment on table public.slab_piece_geometry is
  'Per-piece outline, area, and inscribed-rectangle fit data derived from the Slabsmith photo. '
  'Derived cache — slab_inventory is stock authority, slab_images is photo authority. Brain-only.';

comment on column public.slab_piece_geometry.fit_frontier_in is
  'Pareto set of axis-aligned rectangles that fit inside the stone, as [short_in, long_in]. '
  'A job piece fits when some entry has short >= job short and long >= job long.';

create index if not exists idx_slab_piece_geometry_org_source
  on public.slab_piece_geometry (organization_id, external_source, status);

alter table public.slab_piece_geometry enable row level security;
