-- eliteOS Quote Delivery foundation (additive / idempotent)
--
-- Apply manually in Supabase SQL editor or migration runner.
-- Prerequisite: public.quote_headers exists (eos_quote_platform.sql).
--
-- Phase 1: delivery audit logs + secure share-link scaffold.
-- Backend service role is the write path; no browser-direct RLS in this pass.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Quote delivery audit log
-- ---------------------------------------------------------------------------
create table if not exists public.quote_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  quote_id uuid not null references public.quote_headers (id) on delete cascade,
  quote_number text,
  revision_number integer,
  revision_label text,
  snapshot_hash text,
  delivery_mode text not null default 'email',
  status text not null,
  sent_by uuid,
  sent_by_email text,
  recipients jsonb not null default '[]'::jsonb,
  subject text,
  provider text,
  provider_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_quote_delivery_logs_quote on public.quote_delivery_logs (quote_id);
create index if not exists idx_quote_delivery_logs_org on public.quote_delivery_logs (organization_id);
create index if not exists idx_quote_delivery_logs_created on public.quote_delivery_logs (created_at desc);
create index if not exists idx_quote_delivery_logs_status on public.quote_delivery_logs (status);

comment on table public.quote_delivery_logs is
  'Audit trail for customer estimate delivery (email preview/send, future link/PDF modes). Written by backend-core only.';

-- ---------------------------------------------------------------------------
-- Secure share links (Phase 3 scaffold — not used in Phase 1 send path)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  quote_id uuid not null references public.quote_headers (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  access_count integer not null default 0
);

create index if not exists idx_quote_share_links_quote on public.quote_share_links (quote_id);
create index if not exists idx_quote_share_links_org on public.quote_share_links (organization_id);
create index if not exists idx_quote_share_links_expires on public.quote_share_links (expires_at);

comment on table public.quote_share_links is
  'Hashed tokens for future secure customer estimate links. Raw tokens are never stored.';
