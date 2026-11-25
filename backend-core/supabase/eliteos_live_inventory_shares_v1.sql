-- eliteOS — live_inventory_shares v1 (additive)
--
-- Shareable customer picks from Live Inventory: a rep selects specific slabs /
-- remnants and sends the customer a read-only link (/s/<token> on the Live
-- Inventory host). The link resolves live against slab_inventory, so pieces that
-- sell show as no longer available; display fields are snapshotted at creation
-- so the page still renders them.
--
-- Token: 256-bit random, base64url; only sha256(token) is stored (same pattern as
-- digital estimate publications). Raw token is returned once, to the creator.
-- Public DTO never carries price group, rack, lot, supplier codes or costs.
--
-- Access: Brain service role only (RLS enabled, no policies).
-- Safe to re-run.

create table if not exists public.live_inventory_shares (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id),
  token_hash        text        not null,

  title             text,
  customer_name     text,
  message           text,
  -- [{ inventory_row_id, color_key, color_name, material_name, source_inventory_type,
  --    thickness_nominal, length_in, width_in, inventory_id }] — display snapshot at creation.
  items             jsonb       not null,
  show_contact      boolean     not null default true,

  created_by        uuid        not null,
  created_by_name   text,
  created_by_email  text,

  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_by        uuid,

  view_count        integer     not null default 0,
  last_viewed_at    timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint live_inventory_shares_token_hash_key unique (token_hash),
  constraint live_inventory_shares_items_array check (jsonb_typeof(items) = 'array'),
  constraint live_inventory_shares_token_hash_hex check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.live_inventory_shares is
  'Customer share links for Live Inventory picks. Token stored as sha256 only. '
  'slab_inventory stays stock authority; items is a display snapshot. Brain-only.';

create index if not exists idx_live_inventory_shares_org_created
  on public.live_inventory_shares (organization_id, created_at desc);

alter table public.live_inventory_shares enable row level security;
