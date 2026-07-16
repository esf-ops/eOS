-- eliteOS Digital Estimate v1 (Phase DE.1) — additive / idempotent
-- DO NOT APPLY in DE.1 automation. Apply manually in staging/production when ready.
--
-- Prerequisite: public.quote_headers exists (eos_quote_platform.sql + revision columns).
-- Public token validation occurs ONLY through backend-core (Brain service role).
-- Anonymous/authenticated clients must NOT read these tables directly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Publications (lifecycle header)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_quote_id uuid not null references public.quote_headers (id) on delete restrict,
  quote_family_root_id uuid,
  quote_number text not null,
  revision_number integer not null check (revision_number >= 1),
  revision_label text,
  quote_source text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'superseded', 'expired')),
  published_at timestamptz not null default now(),
  published_by_user_id uuid,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  superseded_at timestamptz,
  superseded_by_publication_id uuid references public.quote_publications (id) on delete set null,
  access_expires_at timestamptz not null,
  pricing_valid_through date,
  terms_disclosure_version text not null default 'de1_v1',
  calculation_engine_version text not null default 'quoteCalculator',
  source_quote_fingerprint text not null,
  customer_snapshot_hash text not null,
  pricing_evidence_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quote_publications_org_source
  on public.quote_publications (organization_id, source_quote_id, published_at desc);

create index if not exists idx_quote_publications_org_family
  on public.quote_publications (organization_id, quote_family_root_id, status);

create index if not exists idx_quote_publications_org_status_expires
  on public.quote_publications (organization_id, status, access_expires_at);

comment on table public.quote_publications is
  'Digital Estimate publication lifecycle. Content lives in quote_publication_snapshots; tokens in quote_publication_access_tokens.';

-- ---------------------------------------------------------------------------
-- Immutable snapshots (1:1 with publication)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_publication_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null unique references public.quote_publications (id) on delete cascade,
  -- Customer-safe allowlist JSON served by public API (never pricing evidence).
  customer_snapshot_json jsonb not null,
  -- Internal evidence only — never returned on public routes.
  pricing_evidence_json jsonb not null,
  customer_snapshot_hash text not null,
  pricing_evidence_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_publication_snapshots_org
  on public.quote_publication_snapshots (organization_id);

comment on table public.quote_publication_snapshots is
  'Immutable frozen customer-safe + pricing-evidence documents. No UPDATE of content after insert.';

-- Block content mutation on snapshots
create or replace function public.quote_publication_snapshots_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.customer_snapshot_json is distinct from old.customer_snapshot_json
       or new.pricing_evidence_json is distinct from old.pricing_evidence_json
       or new.customer_snapshot_hash is distinct from old.customer_snapshot_hash
       or new.pricing_evidence_hash is distinct from old.pricing_evidence_hash
       or new.publication_id is distinct from old.publication_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'quote_publication_snapshots content is immutable'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'quote_publication_snapshots are not deletable via DML'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.quote_publication_snapshots_immutable() from public;
revoke all on function public.quote_publication_snapshots_immutable() from anon, authenticated;

drop trigger if exists trg_quote_publication_snapshots_immutable on public.quote_publication_snapshots;
create trigger trg_quote_publication_snapshots_immutable
  before update or delete on public.quote_publication_snapshots
  for each row execute function public.quote_publication_snapshots_immutable();

-- ---------------------------------------------------------------------------
-- Access tokens (hash only)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_publication_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null references public.quote_publications (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  revoked_at timestamptz,
  replaced_by_token_id uuid references public.quote_publication_access_tokens (id) on delete set null,
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0)
);

create unique index if not exists uq_quote_publication_access_tokens_hash
  on public.quote_publication_access_tokens (token_hash);

create index if not exists idx_quote_publication_access_tokens_pub
  on public.quote_publication_access_tokens (publication_id, created_at desc);

comment on table public.quote_publication_access_tokens is
  'SHA-256 (hex) of raw access tokens. Raw tokens are never stored.';

-- ---------------------------------------------------------------------------
-- Append-only events
-- ---------------------------------------------------------------------------
create table if not exists public.quote_publication_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null references public.quote_publications (id) on delete cascade,
  source_quote_id uuid,
  event_type text not null
    check (event_type in (
      'published',
      'link_copied',
      'first_viewed',
      'viewed',
      'revoked',
      'token_replaced',
      'superseded'
    )),
  actor_type text not null
    check (actor_type in ('user', 'system', 'public')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_publication_events_pub
  on public.quote_publication_events (publication_id, created_at desc);

create index if not exists idx_quote_publication_events_org
  on public.quote_publication_events (organization_id, event_type, created_at desc);

create index if not exists idx_quote_publication_events_quote
  on public.quote_publication_events (source_quote_id, created_at desc);

comment on table public.quote_publication_events is
  'Append-only Digital Estimate activity. metadata must not contain raw tokens, IPs, or estimate bodies.';

create or replace function public.quote_publication_events_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'quote_publication_events are append-only'
    using errcode = '42501';
end;
$$;

revoke all on function public.quote_publication_events_immutable() from public;
revoke all on function public.quote_publication_events_immutable() from anon, authenticated;

drop trigger if exists trg_quote_publication_events_no_update on public.quote_publication_events;
create trigger trg_quote_publication_events_no_update
  before update on public.quote_publication_events
  for each row execute function public.quote_publication_events_immutable();

drop trigger if exists trg_quote_publication_events_no_delete on public.quote_publication_events;
create trigger trg_quote_publication_events_no_delete
  before delete on public.quote_publication_events
  for each row execute function public.quote_publication_events_immutable();

-- ---------------------------------------------------------------------------
-- Privileges / RLS posture
-- ---------------------------------------------------------------------------
-- Brain uses service_role. Revoke direct client access.
revoke all on table public.quote_publications from anon, authenticated;
revoke all on table public.quote_publication_snapshots from anon, authenticated;
revoke all on table public.quote_publication_access_tokens from anon, authenticated;
revoke all on table public.quote_publication_events from anon, authenticated;

alter table public.quote_publications enable row level security;
alter table public.quote_publication_snapshots enable row level security;
alter table public.quote_publication_access_tokens enable row level security;
alter table public.quote_publication_events enable row level security;

-- No policies for anon/authenticated → deny by default for those roles.
-- service_role bypasses RLS (Brain-only path).

comment on column public.quote_publications.source_quote_fingerprint is
  'SHA-256 of canonical source calculation_snapshot + identity fields at publish time.';
comment on column public.quote_publication_access_tokens.token_hash is
  'Hex SHA-256 of raw token. Never store raw token.';

-- ---------------------------------------------------------------------------
-- Closure hardening: uniqueness, org immutability, atomic RPCs (DE.1 closure)
-- ---------------------------------------------------------------------------

-- At most one active publication per organization + quote family.
create unique index if not exists uq_quote_publications_one_active_per_family
  on public.quote_publications (organization_id, quote_family_root_id)
  where status = 'active' and quote_family_root_id is not null;

-- At most one non-revoked access token per publication.
create unique index if not exists uq_quote_publication_one_active_token
  on public.quote_publication_access_tokens (publication_id)
  where revoked_at is null;

-- first_viewed recorded at most once per publication.
create unique index if not exists uq_quote_publication_events_first_viewed
  on public.quote_publication_events (publication_id)
  where event_type = 'first_viewed';

-- Prevent organization_id moves on publications / snapshots / tokens.
create or replace function public.quote_publication_org_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable on digital estimate rows'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.quote_publication_org_immutable() from public;
revoke all on function public.quote_publication_org_immutable() from anon, authenticated;

drop trigger if exists trg_quote_publications_org_immutable on public.quote_publications;
create trigger trg_quote_publications_org_immutable
  before update on public.quote_publications
  for each row execute function public.quote_publication_org_immutable();

drop trigger if exists trg_quote_publication_snapshots_org_immutable on public.quote_publication_snapshots;
create trigger trg_quote_publication_snapshots_org_immutable
  before update on public.quote_publication_snapshots
  for each row execute function public.quote_publication_org_immutable();

drop trigger if exists trg_quote_publication_access_tokens_org_immutable on public.quote_publication_access_tokens;
create trigger trg_quote_publication_access_tokens_org_immutable
  before update on public.quote_publication_access_tokens
  for each row execute function public.quote_publication_org_immutable();

-- Child rows must share publication organization_id.
create or replace function public.quote_publication_child_org_match()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  pub_org uuid;
begin
  select organization_id into pub_org
  from public.quote_publications
  where id = new.publication_id;
  if pub_org is null then
    raise exception 'publication not found for child row';
  end if;
  if new.organization_id is distinct from pub_org then
    raise exception 'child organization_id must match publication'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.quote_publication_child_org_match() from public;
revoke all on function public.quote_publication_child_org_match() from anon, authenticated;

drop trigger if exists trg_quote_publication_snapshots_org_match on public.quote_publication_snapshots;
create trigger trg_quote_publication_snapshots_org_match
  before insert or update on public.quote_publication_snapshots
  for each row execute function public.quote_publication_child_org_match();

drop trigger if exists trg_quote_publication_tokens_org_match on public.quote_publication_access_tokens;
create trigger trg_quote_publication_tokens_org_match
  before insert or update on public.quote_publication_access_tokens
  for each row execute function public.quote_publication_child_org_match();

drop trigger if exists trg_quote_publication_events_org_match on public.quote_publication_events;
create trigger trg_quote_publication_events_org_match
  before insert or update on public.quote_publication_events
  for each row execute function public.quote_publication_child_org_match();

-- Atomic publish: snapshot + token + events + supersede prior actives in one transaction.
create or replace function public.digital_estimate_publish_atomic(
  p_organization_id uuid,
  p_source_quote_id uuid,
  p_quote_family_root_id uuid,
  p_quote_number text,
  p_revision_number integer,
  p_revision_label text,
  p_quote_source text,
  p_published_by_user_id uuid,
  p_access_expires_at timestamptz,
  p_pricing_valid_through date,
  p_terms_disclosure_version text,
  p_calculation_engine_version text,
  p_source_quote_fingerprint text,
  p_customer_snapshot_hash text,
  p_pricing_evidence_hash text,
  p_customer_snapshot_json jsonb,
  p_pricing_evidence_json jsonb,
  p_token_hash text,
  p_published_event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_pub_id uuid := gen_random_uuid();
  v_token_id uuid := gen_random_uuid();
  v_prior record;
  v_superseded_count integer := 0;
begin
  if p_organization_id is null or p_source_quote_id is null or p_token_hash is null then
    raise exception 'required publish arguments missing';
  end if;
  if p_customer_snapshot_json is null or p_pricing_evidence_json is null then
    raise exception 'snapshot payloads required';
  end if;

  -- Serialize concurrent publishers on this family, clear the active slot, then
  -- insert the new active row. Partial unique index (one active per org+family)
  -- is never violated. FK for superseded_by is set after the new row exists.
  for v_prior in
    select id, source_quote_id
    from public.quote_publications
    where organization_id = p_organization_id
      and quote_family_root_id = p_quote_family_root_id
      and status = 'active'
    for update
  loop
    update public.quote_publications
    set status = 'superseded',
        superseded_at = v_now,
        updated_at = v_now
    where id = v_prior.id;

    update public.quote_publication_access_tokens
    set revoked_at = coalesce(revoked_at, v_now)
    where publication_id = v_prior.id
      and revoked_at is null;

    insert into public.quote_publication_events (
      organization_id, publication_id, source_quote_id, event_type, actor_type,
      actor_user_id, metadata, created_at
    ) values (
      p_organization_id, v_prior.id, v_prior.source_quote_id, 'superseded', 'system',
      p_published_by_user_id,
      jsonb_build_object('supersededByPublicationId', v_pub_id),
      v_now
    );

    v_superseded_count := v_superseded_count + 1;
  end loop;

  insert into public.quote_publications (
    id, organization_id, source_quote_id, quote_family_root_id, quote_number,
    revision_number, revision_label, quote_source, status, published_at,
    published_by_user_id, access_expires_at, pricing_valid_through,
    terms_disclosure_version, calculation_engine_version,
    source_quote_fingerprint, customer_snapshot_hash, pricing_evidence_hash,
    created_at, updated_at
  ) values (
    v_pub_id, p_organization_id, p_source_quote_id, p_quote_family_root_id, p_quote_number,
    p_revision_number, p_revision_label, p_quote_source, 'active', v_now,
    p_published_by_user_id, p_access_expires_at, p_pricing_valid_through,
    p_terms_disclosure_version, p_calculation_engine_version,
    p_source_quote_fingerprint, p_customer_snapshot_hash, p_pricing_evidence_hash,
    v_now, v_now
  );

  if v_superseded_count > 0 then
    update public.quote_publications
    set superseded_by_publication_id = v_pub_id,
        updated_at = v_now
    where organization_id = p_organization_id
      and quote_family_root_id = p_quote_family_root_id
      and status = 'superseded'
      and superseded_at = v_now
      and superseded_by_publication_id is null;
  end if;

  insert into public.quote_publication_snapshots (
    organization_id, publication_id, customer_snapshot_json, pricing_evidence_json,
    customer_snapshot_hash, pricing_evidence_hash, created_at
  ) values (
    p_organization_id, v_pub_id, p_customer_snapshot_json, p_pricing_evidence_json,
    p_customer_snapshot_hash, p_pricing_evidence_hash, v_now
  );

  insert into public.quote_publication_access_tokens (
    id, organization_id, publication_id, token_hash, created_at, created_by_user_id, access_count
  ) values (
    v_token_id, p_organization_id, v_pub_id, p_token_hash, v_now, p_published_by_user_id, 0
  );

  insert into public.quote_publication_events (
    organization_id, publication_id, source_quote_id, event_type, actor_type,
    actor_user_id, metadata, created_at
  ) values (
    p_organization_id, v_pub_id, p_source_quote_id, 'published', 'user',
    p_published_by_user_id, coalesce(p_published_event_metadata, '{}'::jsonb), v_now
  );

  return jsonb_build_object(
    'publication_id', v_pub_id,
    'token_id', v_token_id,
    'published_at', v_now,
    'superseded_count', v_superseded_count
  );
end;
$$;

revoke all on function public.digital_estimate_publish_atomic(
  uuid, uuid, uuid, text, integer, text, text, uuid, timestamptz, date, text, text, text, text, text, jsonb, jsonb, text, jsonb
) from public;
revoke all on function public.digital_estimate_publish_atomic(
  uuid, uuid, uuid, text, integer, text, text, uuid, timestamptz, date, text, text, text, text, text, jsonb, jsonb, text, jsonb
) from anon, authenticated;
-- service_role executes via Brain; grant explicitly for clarity when roles exist.
do $$ begin
  grant execute on function public.digital_estimate_publish_atomic(
    uuid, uuid, uuid, text, integer, text, text, uuid, timestamptz, date, text, text, text, text, text, jsonb, jsonb, text, jsonb
  ) to service_role;
exception when undefined_object then null;
end $$;

-- Atomic token replace: insert new active token, revoke prior, event — never tokenless active.
create or replace function public.digital_estimate_replace_token_atomic(
  p_organization_id uuid,
  p_publication_id uuid,
  p_new_token_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_token_id uuid := gen_random_uuid();
  v_pub record;
  v_old record;
begin
  select * into v_pub
  from public.quote_publications
  where id = p_publication_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'publication not found' using errcode = 'P0002';
  end if;
  if v_pub.status <> 'active' then
    raise exception 'publication is not active';
  end if;

  -- Lock existing tokens for this publication.
  perform 1
  from public.quote_publication_access_tokens
  where publication_id = p_publication_id
  for update;

  -- Insert new token first (unique active-token index requires prior revoke in same txn after insert...
  -- so revoke old first ONLY after inserting would violate unique index. Order:
  -- 1) revoke all active tokens
  -- 2) insert new active token
  -- If step 2 fails, transaction rolls back and old tokens remain (because revoke is rolled back).
  update public.quote_publication_access_tokens
  set revoked_at = v_now
  where publication_id = p_publication_id
    and organization_id = p_organization_id
    and revoked_at is null;

  insert into public.quote_publication_access_tokens (
    id, organization_id, publication_id, token_hash, created_at, created_by_user_id, access_count
  ) values (
    v_token_id, p_organization_id, p_publication_id, p_new_token_hash, v_now, p_actor_user_id, 0
  );

  insert into public.quote_publication_events (
    organization_id, publication_id, source_quote_id, event_type, actor_type,
    actor_user_id, metadata, created_at
  ) values (
    p_organization_id, p_publication_id, v_pub.source_quote_id, 'token_replaced', 'user',
    p_actor_user_id, '{}'::jsonb, v_now
  );

  return jsonb_build_object(
    'token_id', v_token_id,
    'publication_id', p_publication_id,
    'replaced_at', v_now
  );
end;
$$;

revoke all on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid) from public;
revoke all on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid) from anon, authenticated;
do $$ begin
  grant execute on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid) to service_role;
exception when undefined_object then null;
end $$;

-- Concurrency-safe first_viewed (unique partial index + ignore conflict).
create or replace function public.digital_estimate_try_first_viewed(
  p_organization_id uuid,
  p_publication_id uuid,
  p_source_quote_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.quote_publication_events (
    organization_id, publication_id, source_quote_id, event_type, actor_type,
    actor_user_id, metadata, created_at
  ) values (
    p_organization_id, p_publication_id, p_source_quote_id, 'first_viewed', 'public',
    null, coalesce(p_metadata, '{}'::jsonb), now()
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.digital_estimate_try_first_viewed(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.digital_estimate_try_first_viewed(uuid, uuid, uuid, jsonb) from anon, authenticated;
do $$ begin
  grant execute on function public.digital_estimate_try_first_viewed(uuid, uuid, uuid, jsonb) to service_role;
exception when undefined_object then null;
end $$;

comment on function public.digital_estimate_publish_atomic is
  'Transactional publish: publication + snapshot + token + published event + supersede priors.';
comment on function public.digital_estimate_replace_token_atomic is
  'Transactional token replace; rolls back to prior usable token on failure.';
comment on function public.digital_estimate_try_first_viewed is
  'Insert first_viewed once; returns false if already recorded.';
