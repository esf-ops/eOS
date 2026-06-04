-- eliteOS SlabCloud Inventory Cache — SQL draft (not yet applied).
--
-- DRAFT STATUS: This file has been reviewed for correctness but NOT yet applied
-- to any Supabase project (staging or production). Apply only after:
--   1) Full uncapped dry-run output has been reviewed.
--   2) SlabCloud written confirmation of read-only API use is received
--      (verbal approval from Andrey received 2026-06-04; written preferred before
--      scheduled production sync or public showroom use).
--   3) Schema has been reviewed by a second set of eyes.
--
-- Manual apply (Supabase SQL editor, when ready):
--   1) Open Supabase → SQL → New query.
--   2) Paste this file; run once.
--      Re-running is safe — all statements use IF NOT EXISTS.
--   3) Verify table row counts and indexes in the Supabase Table Editor.
--
-- Safety contract:
--   - Read-only integration. SlabCloud/Slabsmith is the external source of truth.
--   - slabOS stores a normalized cached copy. It NEVER writes back to SlabCloud
--     or Slabsmith. No writeback triggers, no outbound DML to external systems.
--   - The backend service role writes these tables. No frontend write path exists.
--   - Organization-scoped: every table carries organization_id so multi-tenant
--     use is safe from the first row.
--   - No hard DELETEs. Slabs that vanish from the feed are marked is_active=false.
--
-- RLS:
--   RLS is enabled on every table in this file but NO permissive read/write
--   policies are created. All access today is via the service role (bypasses RLS).
--   Frontend read policies and customer-safe public policies will be added in
--   separate migration files when the Slab Inventory head / showroom ships.
--
-- Future overlay tables (slab_holds, slab_quote_links, slab_customer_selections,
-- slab_display_channels) are NOT in this file. They are separate Phase 4/5 slices.

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. slabcloud_sync_runs
--    Audit log for every sync attempt. Written before fetching begins;
--    updated on completion or failure. Never deleted.
-- ---------------------------------------------------------------------------

create table if not exists public.slabcloud_sync_runs (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null,
  external_source           text        not null default 'slabcloud',
  external_company_code     text        not null,

  -- Run lifecycle
  -- Allowed values (application-enforced):
  --   pending | running | completed | failed | dry_run
  status                    text        not null default 'pending',
  started_at                timestamptz not null default now(),
  finished_at               timestamptz,
  triggered_by              text,        -- 'scheduled' | 'manual' | 'script'

  -- Config used for this run (env snapshot — no secrets)
  fetch_mode                text,        -- 'summary_only' | 'with_details'
  company_code_config       text,        -- resolved company code at run time
  max_details_config        integer,     -- null = no cap
  concurrency_config        integer,

  -- Outcome counts
  material_row_count        integer,
  slab_summary_row_count    integer,
  slab_detail_row_count     integer,
  slab_raw_written_count    integer,
  slab_upserted_count       integer,
  slab_deactivated_count    integer,     -- 0 for Phase 1 (deactivation deferred)
  material_upserted_count   integer,
  image_row_written_count   integer,
  warning_count             integer      not null default 0,
  warnings                  jsonb        not null default '[]'::jsonb,

  -- Error info (status = 'failed')
  error_message             text,
  error_detail              jsonb,

  created_at                timestamptz  not null default now(),
  updated_at                timestamptz  not null default now()
);

comment on table public.slabcloud_sync_runs is
  'Audit log for every SlabCloud inventory sync attempt. Written before fetch; '
  'updated on completion/failure. Never deleted. Phase 1: deactivation not yet used.';

comment on column public.slabcloud_sync_runs.external_source is
  'Always "slabcloud" for this integration. Present for future multi-source joins.';

comment on column public.slabcloud_sync_runs.slab_deactivated_count is
  'Phase 1: always 0. Inactive marking is deferred until full syncs (no cap) are '
  'stable and SLABCLOUD_MARK_INACTIVE=1 is explicitly set.';

create index if not exists idx_slabcloud_sync_runs_org_started
  on public.slabcloud_sync_runs (organization_id, started_at desc);

create index if not exists idx_slabcloud_sync_runs_org_status
  on public.slabcloud_sync_runs (organization_id, status);

alter table public.slabcloud_sync_runs enable row level security;

-- No read/write RLS policies yet. Service role writes; frontend policies added
-- when the Slab Inventory head ships.

-- ---------------------------------------------------------------------------
-- 2. slab_inventory_raw_records
--    Preserves the raw SlabCloud JSON exactly as received, keyed to the sync
--    run. Enables replay, field-mapping audits, and debugging without
--    re-fetching. Unconditional — written even when normalization fails.
-- ---------------------------------------------------------------------------

create table if not exists public.slab_inventory_raw_records (
  id                        uuid        primary key default gen_random_uuid(),
  sync_run_id               uuid        not null
                              references public.slabcloud_sync_runs(id)
                              on delete restrict,
  organization_id           uuid        not null,
  external_source           text        not null default 'slabcloud',
  external_company_code     text        not null,

  -- Identity (may be null if the source record is malformed)
  external_slab_id          text,        -- SlabID
  color_name                text,        -- Name — denormalized for quick queries

  -- Record provenance
  -- Allowed values: 'summary' | 'detail'
  record_source             text        not null,

  -- Untouched source record
  raw_json                  jsonb       not null,

  created_at                timestamptz not null default now()
);

comment on table public.slab_inventory_raw_records is
  'Raw SlabCloud JSON records as received, keyed to a sync run. Written '
  'unconditionally — even if normalization fails. Enables replay and '
  'field-mapping audits. No writeback to SlabCloud/Slabsmith.';

comment on column public.slab_inventory_raw_records.external_slab_id is
  'SlabID from SlabCloud. May be null for malformed records; null rows are '
  'written to raw_records but excluded from slab_inventory upsert.';

create index if not exists idx_slab_inv_raw_sync_run
  on public.slab_inventory_raw_records (sync_run_id);

create index if not exists idx_slab_inv_raw_org_slab_id
  on public.slab_inventory_raw_records (organization_id, external_slab_id);

create index if not exists idx_slab_inv_raw_org_color
  on public.slab_inventory_raw_records (organization_id, color_name);

alter table public.slab_inventory_raw_records enable row level security;

-- ---------------------------------------------------------------------------
-- 3. slab_inventory
--    Normalized, queryable, org-scoped slab inventory cache.
--    One row per physical slab identified by the four-part unique key.
--    This is the table internal heads and future workflows read from.
--    Source of truth remains SlabCloud/Slabsmith — this is a cached copy.
-- ---------------------------------------------------------------------------

create table if not exists public.slab_inventory (
  id                        uuid        primary key default gen_random_uuid(),

  -- Tenant + integration identity
  organization_id           uuid        not null,
  external_source           text        not null default 'slabcloud',
  external_company_code     text        not null,

  -- External IDs
  external_slab_id          text        not null,  -- SlabID (UUID from SlabCloud)
  inventory_id              text,                  -- InventoryID (Slabsmith ID)

  -- Slab attributes
  color_name                text,        -- Name
  material_name             text,        -- Material
  distributor               text,        -- Distributor
  price_group               text,        -- Price_Group (e.g. "A", "B", "C")
  thickness_nominal         text,        -- Thickness_Nominal (e.g. "3 cm", "2 cm")
  rack                      text,        -- Rack (staff/internal only)
  lot                       text,        -- Lot

  -- Count field notes:
  --   SlabCloud's `count` is a COLOR-GROUP-LEVEL value, not a per-row quantity.
  --   It is repeated identically on every detail row for the same color.
  --   DO NOT SUM count_for_color across rows — you will over-count.
  --   To get actual slab count for a color:
  --     SELECT COUNT(*) FROM slab_inventory
  --     WHERE organization_id = $1 AND color_name = $2 AND is_active = true
  count_for_color           integer,

  -- Dimensions (meters are the authoritative source value).
  --   Width_Actual / Length_Actual from SlabCloud appear to be meters.
  --   Verified: 2.0748 m → 81.68 in ✓, 3.5227 m → 138.69 in ✓
  --
  --   IMPORTANT: These dimensions are NOT used for quote pricing authority.
  --   Do not read width_actual_in / length_actual_in into quoting calculations
  --   until a separate explicit decision is made and tested.
  width_actual_m            numeric(12, 8),  -- Width_Actual (source, meters)
  length_actual_m           numeric(12, 8),  -- Length_Actual (source, meters)
  width_actual_in           numeric(8, 2),   -- Derived: width_actual_m * 39.3701
  length_actual_in          numeric(8, 2),   -- Derived: length_actual_m * 39.3701
  thickness_nominal_cm      numeric(6, 2),   -- Parsed from thickness_nominal if unambiguous; null otherwise

  -- UsableA / UsableD: raw strings from SlabCloud. Meaning not yet confirmed.
  --   Possibly mm² or cm² usable area/depth. Do NOT compute from these until
  --   SlabCloud confirms the field semantics. Preserved for audit only.
  usable_a_raw              text,
  usable_d_raw              text,

  -- Dimension provenance
  dimension_source          text        not null default 'slabcloud_api',

  -- Sync bookkeeping
  is_active                 boolean     not null default true,
  first_seen_sync_run_id    uuid        references public.slabcloud_sync_runs(id) on delete restrict,
  last_seen_sync_run_id     uuid        references public.slabcloud_sync_runs(id) on delete restrict,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Four-part unique key: allows multiple sources and company codes without
  -- conflict; external_slab_id (SlabID UUID) is the external identity.
  unique (organization_id, external_source, external_company_code, external_slab_id)
);

comment on table public.slab_inventory is
  'Normalized slabOS slab inventory cache populated by backend SlabCloud sync. '
  'Source of truth remains SlabCloud/Slabsmith — this is a cached copy for '
  'internal workflow and future showroom/SlabRoom use. '
  'No writeback to SlabCloud or Slabsmith from this table.';

comment on column public.slab_inventory.count_for_color is
  'COLOR-GROUP-LEVEL count from SlabCloud. Repeated identically on every detail '
  'row for the same color. DO NOT SUM across rows — use COUNT(DISTINCT id) WHERE '
  'color_name = X AND is_active = true for actual physical slab count.';

comment on column public.slab_inventory.width_actual_in is
  'Convenience column derived from width_actual_m * 39.3701. NOT quote-pricing '
  'authority. Do not use in quoting calculations without an explicit separate decision.';

comment on column public.slab_inventory.length_actual_in is
  'Convenience column derived from length_actual_m * 39.3701. NOT quote-pricing '
  'authority. Do not use in quoting calculations without an explicit separate decision.';

comment on column public.slab_inventory.usable_a_raw is
  'Raw UsableA value from SlabCloud. Meaning unconfirmed (possibly mm² usable area). '
  'Preserved for audit only. Do not compute from this field until semantics are confirmed.';

comment on column public.slab_inventory.usable_d_raw is
  'Raw UsableD value from SlabCloud. Meaning unconfirmed (possibly mm usable depth). '
  'Preserved for audit only. Do not compute from this field until semantics are confirmed.';

comment on column public.slab_inventory.is_active is
  'False when a slab stops appearing in the SlabCloud feed. Set only when '
  'SLABCLOUD_MARK_INACTIVE=1 AND the sync was a full (uncapped) run. '
  'Phase 1: always true. No rows are ever hard-deleted.';

-- Lookup indexes for filter UI (internal head, Phase 2)
create index if not exists idx_slab_inventory_org_active
  on public.slab_inventory (organization_id, is_active);

create index if not exists idx_slab_inventory_org_material
  on public.slab_inventory (organization_id, material_name, is_active);

create index if not exists idx_slab_inventory_org_color
  on public.slab_inventory (organization_id, color_name, is_active);

create index if not exists idx_slab_inventory_org_price_group
  on public.slab_inventory (organization_id, price_group, is_active);

create index if not exists idx_slab_inventory_org_thickness
  on public.slab_inventory (organization_id, thickness_nominal, is_active);

create index if not exists idx_slab_inventory_org_rack
  on public.slab_inventory (organization_id, rack, is_active);

create index if not exists idx_slab_inventory_org_distributor
  on public.slab_inventory (organization_id, distributor, is_active);

-- Cross-reference with Slabsmith if a direct integration is added later
create index if not exists idx_slab_inventory_inventory_id
  on public.slab_inventory (organization_id, inventory_id);

-- Sync run FK lookups
create index if not exists idx_slab_inventory_last_sync_run
  on public.slab_inventory (last_seen_sync_run_id);

alter table public.slab_inventory enable row level security;

-- No read/write RLS policies yet. Service role writes; org-scoped read
-- policies for the internal head are added in a separate migration.

-- ---------------------------------------------------------------------------
-- 4. slab_materials
--    Normalized material/brand catalog from /api/materials/{companyCode}.
--    Small table, cheap to refresh. Useful for filter UIs without scanning
--    the full slab_inventory table.
-- ---------------------------------------------------------------------------

create table if not exists public.slab_materials (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null,
  external_source           text        not null default 'slabcloud',
  external_company_code     text        not null,

  material_name             text        not null,
  raw_json                  jsonb,       -- Raw material record from the API

  is_active                 boolean     not null default true,
  last_seen_sync_run_id     uuid        references public.slabcloud_sync_runs(id) on delete restrict,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (organization_id, external_source, external_company_code, material_name)
);

comment on table public.slab_materials is
  'Normalized material/brand catalog from SlabCloud /api/materials endpoint. '
  'Refreshed on each sync run. No writeback to SlabCloud/Slabsmith.';

create index if not exists idx_slab_materials_org_active
  on public.slab_materials (organization_id, is_active);

alter table public.slab_materials enable row level security;

-- ---------------------------------------------------------------------------
-- 5. slab_images
--    Guessed and verified image URLs per slab. Separated from slab_inventory
--    so image probe runs do not disturb the core inventory upsert.
--    Phase 1: rows written with image_status = 'unknown'. Verification is
--    optional and runs separately (best-effort HEAD probe, never fatal).
-- ---------------------------------------------------------------------------

create table if not exists public.slab_images (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null,
  external_source           text        not null default 'slabcloud',
  external_slab_id          text        not null,   -- SlabID

  -- URL
  image_url                 text        not null,
  thumbnail_url             text,

  -- Which URL pattern produced this row. Allows multiple patterns to coexist
  -- if a second URL format is discovered.
  -- e.g. 'slabcloud_slab_jpg' = /slabs/{companyCode}/{SlabID}.jpg
  image_url_pattern         text        not null,

  -- Verification
  -- Allowed values: 'unknown' | 'ok' | 'missing' | 'error'
  image_status              text        not null default 'unknown',
  last_checked_at           timestamptz,           -- null until first probe run

  -- Phase 1: no image bytes stored here.
  -- Future: add storage_path text for Supabase Storage cached copy if needed.

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (organization_id, external_source, external_slab_id, image_url_pattern)
);

comment on table public.slab_images is
  'Guessed and optionally verified image URLs for slabs. Separated from '
  'slab_inventory so image probes do not disturb inventory upserts. '
  'Phase 1: image_status = unknown; no image bytes stored. '
  'Future: add storage_path for Supabase Storage cached copy.';

comment on column public.slab_images.image_url_pattern is
  'Discriminator for URL generation strategy. Allows multiple URL patterns '
  'per slab if SlabCloud changes its image hosting scheme. '
  'Current pattern: "slabcloud_slab_jpg" = /slabs/{companyCode}/{SlabID}.jpg';

comment on column public.slab_images.image_status is
  'Result of optional best-effort HEAD probe. Allowed values: '
  'unknown (not yet checked) | ok (200) | missing (404/410) | error (other).';

create index if not exists idx_slab_images_org_slab_id
  on public.slab_images (organization_id, external_slab_id);

create index if not exists idx_slab_images_status
  on public.slab_images (organization_id, image_status);

alter table public.slab_images enable row level security;

-- ---------------------------------------------------------------------------
-- RLS summary
-- ---------------------------------------------------------------------------
--
-- All five tables have RLS ENABLED.
-- NO permissive policies are created in this file.
-- All current access is via the Supabase service role (bypasses RLS).
--
-- Future policies to add in separate migrations:
--
--   Internal Slab Inventory head (Phase 2):
--     CREATE POLICY "org members read slab_inventory"
--       ON public.slab_inventory FOR SELECT
--       USING (organization_id = (auth.jwt() ->> 'org_id')::uuid);
--     (equivalent for slab_materials, slab_images)
--
--   Showroom / TV channel (Phase 3):
--     Scoped to display-token resolution — likely a backend route, not
--     a direct Supabase client read. Customer-safe fields only.
--
--   Customer SlabRoom (Phase 5):
--     Scoped to quote/job token. Customer-safe fields only. Staff-internal
--     fields (rack, lot, price_group, inventory_id) are never exposed.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Future overlay tables (NOT in this file — separate Phase 4/5 migrations)
-- ---------------------------------------------------------------------------
--
--   slab_holds           — Phase 4: staff soft-holds on slabs linked to quotes
--   slab_quote_links     — Phase 4: slab–quote associations
--   slab_customer_selections — Phase 5: customer SlabRoom actions
--   slab_display_channels    — Phase 3: showroom display tokens + filter config
--
-- These tables NEVER write back to SlabCloud or Slabsmith.
-- Hold state is slabOS-internal only.
--
-- ---------------------------------------------------------------------------
