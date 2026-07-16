-- =============================================================================
-- eliteOS Digital Estimate — DE.2F review requests + amendments
-- UNAPPLIED. Do not apply in this phase.
--
-- Migration order:
--   1) eliteos_digital_estimate_v1.sql
--   2) eliteos_digital_estimate_configuration_v1.sql
--   3) eliteos_digital_estimate_public_configuration_v1.sql
--   4) eliteos_digital_estimate_amendment_v1.sql (this file)
-- =============================================================================

-- Review requests (immutable after insert)
create table if not exists public.digital_estimate_configuration_review_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  publication_id uuid not null
    references public.quote_publications (id) on delete restrict,
  publication_snapshot_id uuid
    references public.quote_publication_snapshots (id) on delete restrict,
  envelope_id uuid not null
    references public.digital_estimate_configuration_envelopes (id) on delete restrict,
  envelope_version integer not null,
  session_id uuid not null
    references public.digital_estimate_configuration_sessions (id) on delete restrict,
  selection_id uuid not null
    references public.digital_estimate_configuration_selections (id) on delete restrict,
  calculation_id uuid not null
    references public.digital_estimate_configuration_calculations (id) on delete restrict,
  selection_hash text not null,
  calculation_input_fingerprint text not null,
  request_fingerprint text not null,
  client_idempotency_key text not null,
  status text not null default 'review_requested'
    check (status in (
      'review_requested',
      'estimator_reviewing',
      'clarification_required',
      'amendment_prepared',
      'updated_estimate_published',
      'review_closed',
      'review_superseded'
    )),
  customer_note text,
  request_snapshot_json jsonb not null,
  baseline_display_total numeric,
  configured_display_total numeric,
  display_delta numeric,
  pricing_valid_through date,
  closed_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_de_review_request_idempotency unique (session_id, client_idempotency_key)
);

create index if not exists idx_de_review_requests_org_status
  on public.digital_estimate_configuration_review_requests (organization_id, status, created_at desc);

create index if not exists idx_de_review_requests_publication
  on public.digital_estimate_configuration_review_requests (organization_id, publication_id);

comment on table public.digital_estimate_configuration_review_requests is
  'Immutable customer review requests. Not acceptance/sold. No raw tokens.';

-- Prevent mutation of frozen request payload columns
create or replace function public.digital_estimate_review_requests_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.publication_id is distinct from old.publication_id
       or new.envelope_id is distinct from old.envelope_id
       or new.session_id is distinct from old.session_id
       or new.selection_id is distinct from old.selection_id
       or new.calculation_id is distinct from old.calculation_id
       or new.selection_hash is distinct from old.selection_hash
       or new.calculation_input_fingerprint is distinct from old.calculation_input_fingerprint
       or new.request_fingerprint is distinct from old.request_fingerprint
       or new.request_snapshot_json is distinct from old.request_snapshot_json
       or new.client_idempotency_key is distinct from old.client_idempotency_key
       or new.baseline_display_total is distinct from old.baseline_display_total
       or new.configured_display_total is distinct from old.configured_display_total
       or new.display_delta is distinct from old.display_delta then
      raise exception 'review request freeze fields are immutable' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'review requests are not deletable via DML' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_de_review_requests_immutable on public.digital_estimate_configuration_review_requests;
create trigger trg_de_review_requests_immutable
  before update or delete on public.digital_estimate_configuration_review_requests
  for each row execute function public.digital_estimate_review_requests_immutable();

-- Amendments
create table if not exists public.digital_estimate_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_request_id uuid not null
    references public.digital_estimate_configuration_review_requests (id) on delete restrict,
  source_publication_id uuid not null
    references public.quote_publications (id) on delete restrict,
  source_publication_snapshot_id uuid
    references public.quote_publication_snapshots (id) on delete restrict,
  source_calculation_id uuid
    references public.digital_estimate_configuration_calculations (id) on delete restrict,
  parent_amendment_id uuid
    references public.digital_estimate_amendments (id) on delete set null,
  amendment_version integer not null check (amendment_version >= 1),
  status text not null default 'amendment_draft'
    check (status in (
      'amendment_draft',
      'amendment_validating',
      'amendment_ready',
      'amendment_published',
      'amendment_superseded',
      'amendment_cancelled',
      'amendment_failed'
    )),
  row_version integer not null default 1 check (row_version >= 1),
  draft_selections_json jsonb not null default '{}'::jsonb,
  customer_safe_explanation text,
  internal_notes_json jsonb not null default '[]'::jsonb,
  clarification_message_customer text,
  pricing_policy_fingerprint text,
  catalog_fingerprint text,
  engine_version text,
  source_selection_fingerprint text,
  final_calculation_fingerprint text,
  amendment_calculation_json jsonb,
  customer_snapshot_json jsonb,
  internal_evidence_json jsonb,
  baseline_display_total numeric,
  configured_display_total numeric,
  display_delta numeric,
  pricing_valid_through date,
  replacement_publication_id uuid
    references public.quote_publications (id) on delete set null,
  created_by_user_id uuid,
  published_by_user_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_de_amendments_org_status
  on public.digital_estimate_amendments (organization_id, status, updated_at desc);

create index if not exists idx_de_amendments_review
  on public.digital_estimate_amendments (organization_id, review_request_id);

-- Amendment events (append-only)
create table if not exists public.digital_estimate_amendment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  review_request_id uuid
    references public.digital_estimate_configuration_review_requests (id) on delete cascade,
  amendment_id uuid
    references public.digital_estimate_amendments (id) on delete cascade,
  publication_id uuid,
  event_type text not null
    check (event_type in (
      'review_requested',
      'review_opened',
      'review_started',
      'clarification_required',
      'amendment_draft_created',
      'amendment_created',
      'amendment_updated',
      'amendment_validated',
      'amendment_published',
      'replacement_link_copied',
      'review_superseded',
      'review_closed',
      'prior_publication_superseded'
    )),
  actor_type text not null
    check (actor_type in ('user', 'system', 'public')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_de_amendment_events_org
  on public.digital_estimate_amendment_events (organization_id, event_type, created_at desc);

-- Privileges
revoke all on table public.digital_estimate_configuration_review_requests from anon, authenticated;
revoke all on table public.digital_estimate_amendments from anon, authenticated;
revoke all on table public.digital_estimate_amendment_events from anon, authenticated;

alter table public.digital_estimate_configuration_review_requests enable row level security;
alter table public.digital_estimate_amendments enable row level security;
alter table public.digital_estimate_amendment_events enable row level security;

-- =============================================================================
-- Atomic amendment re-publication RPC (service_role only)
-- Freezes amendment + creates replacement publication via existing publish pattern fields.
-- Callers must supply already-built customer/pricing snapshot JSON and token hash.
-- =============================================================================

create or replace function public.digital_estimate_publish_amendment_atomic(
  p_organization_id uuid,
  p_amendment_id uuid,
  p_actor_user_id uuid,
  p_token_hash text,
  p_customer_snapshot_json jsonb,
  p_pricing_evidence_json jsonb,
  p_customer_snapshot_hash text,
  p_pricing_evidence_hash text,
  p_source_quote_fingerprint text,
  p_access_expires_at timestamptz,
  p_pricing_valid_through date,
  p_terms_disclosure_version text,
  p_calculation_engine_version text,
  p_idempotency_key text default null,
  p_expected_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amd record;
  v_req record;
  v_src_pub record;
  v_now timestamptz := now();
  v_pub_id uuid := gen_random_uuid();
  v_snap_id uuid := gen_random_uuid();
  v_token_id uuid := gen_random_uuid();
  v_prior record;
  v_superseded_count integer := 0;
begin
  if p_organization_id is null or p_amendment_id is null or p_token_hash is null
     or p_customer_snapshot_json is null or p_pricing_evidence_json is null then
    raise exception 'required amendment publish arguments missing';
  end if;

  select * into v_amd
  from public.digital_estimate_amendments
  where id = p_amendment_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'amendment not found' using errcode = 'P0002';
  end if;

  if v_amd.status not in ('amendment_ready', 'amendment_draft', 'amendment_validating') then
    raise exception 'amendment not publishable' using errcode = '22023';
  end if;

  if p_expected_row_version is not null and v_amd.row_version is distinct from p_expected_row_version then
    raise exception 'amendment row_version conflict' using errcode = '40001';
  end if;

  -- Idempotent: already published with same replacement
  if v_amd.status = 'amendment_published' and v_amd.replacement_publication_id is not null then
    return jsonb_build_object(
      'reused', true,
      'amendment_id', v_amd.id,
      'publication_id', v_amd.replacement_publication_id
    );
  end if;

  select * into v_req
  from public.digital_estimate_configuration_review_requests
  where id = v_amd.review_request_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'review request not found' using errcode = 'P0002';
  end if;

  select * into v_src_pub
  from public.quote_publications
  where id = v_amd.source_publication_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'source publication not found' using errcode = 'P0002';
  end if;

  -- Freeze amendment
  update public.digital_estimate_amendments
  set status = 'amendment_published',
      customer_snapshot_json = p_customer_snapshot_json,
      internal_evidence_json = coalesce(internal_evidence_json, '{}'::jsonb),
      published_by_user_id = p_actor_user_id,
      published_at = v_now,
      replacement_publication_id = v_pub_id,
      row_version = row_version + 1,
      updated_at = v_now
  where id = p_amendment_id;

  -- Supersede active publications in family
  for v_prior in
    select id, source_quote_id
    from public.quote_publications
    where organization_id = p_organization_id
      and quote_family_root_id = v_src_pub.quote_family_root_id
      and status = 'active'
    for update
  loop
    update public.quote_publications
    set status = 'superseded',
        superseded_at = v_now,
        superseded_by_publication_id = v_pub_id,
        updated_at = v_now
    where id = v_prior.id;

    update public.quote_publication_access_tokens
    set revoked_at = coalesce(revoked_at, v_now)
    where publication_id = v_prior.id and revoked_at is null;

    -- Block configuration sessions for prior publication
    update public.digital_estimate_configuration_sessions
    set status = 'revoked', updated_at = v_now
    where organization_id = p_organization_id
      and publication_id = v_prior.id
      and status in ('active', 'configuring', 'saved');

    insert into public.quote_publication_events (
      organization_id, publication_id, source_quote_id, event_type, actor_type, actor_user_id, metadata, created_at
    ) values (
      p_organization_id, v_prior.id, v_prior.source_quote_id, 'superseded', 'system', p_actor_user_id,
      jsonb_build_object('supersededByPublicationId', v_pub_id, 'amendmentId', p_amendment_id),
      v_now
    );

    v_superseded_count := v_superseded_count + 1;
  end loop;

  insert into public.quote_publications (
    id, organization_id, source_quote_id, quote_family_root_id, quote_number,
    revision_number, revision_label, quote_source, status, published_at, published_by_user_id,
    access_expires_at, pricing_valid_through, terms_disclosure_version, calculation_engine_version,
    source_quote_fingerprint, customer_snapshot_hash, pricing_evidence_hash, created_at, updated_at
  ) values (
    v_pub_id, p_organization_id, v_src_pub.source_quote_id, v_src_pub.quote_family_root_id, v_src_pub.quote_number,
    v_src_pub.revision_number, v_src_pub.revision_label, v_src_pub.quote_source, 'active', v_now, p_actor_user_id,
    p_access_expires_at, p_pricing_valid_through, p_terms_disclosure_version, p_calculation_engine_version,
    p_source_quote_fingerprint, p_customer_snapshot_hash, p_pricing_evidence_hash, v_now, v_now
  );

  insert into public.quote_publication_snapshots (
    id, organization_id, publication_id, customer_snapshot_json, pricing_evidence_json,
    customer_snapshot_hash, pricing_evidence_hash, created_at
  ) values (
    v_snap_id, p_organization_id, v_pub_id, p_customer_snapshot_json, p_pricing_evidence_json,
    p_customer_snapshot_hash, p_pricing_evidence_hash, v_now
  );

  insert into public.quote_publication_access_tokens (
    id, organization_id, publication_id, token_hash, created_at
  ) values (
    v_token_id, p_organization_id, v_pub_id, p_token_hash, v_now
  );

  insert into public.quote_publication_events (
    organization_id, publication_id, source_quote_id, event_type, actor_type, actor_user_id, metadata, created_at
  ) values (
    p_organization_id, v_pub_id, v_src_pub.source_quote_id, 'published', 'user', p_actor_user_id,
    jsonb_build_object(
      'sourceType', 'digital_estimate_amendment',
      'amendmentId', p_amendment_id,
      'reviewRequestId', v_amd.review_request_id,
      'supersededCount', v_superseded_count,
      'idempotencyKey', p_idempotency_key
    ),
    v_now
  );

  update public.digital_estimate_configuration_review_requests
  set status = 'updated_estimate_published',
      updated_at = v_now,
      closed_at = v_now,
      closed_reason = 'amendment_published'
  where id = v_amd.review_request_id;

  insert into public.digital_estimate_amendment_events (
    organization_id, review_request_id, amendment_id, publication_id, event_type, actor_type, actor_user_id, metadata, created_at
  ) values
    (p_organization_id, v_amd.review_request_id, p_amendment_id, v_pub_id, 'amendment_published', 'user', p_actor_user_id,
     jsonb_build_object('publicationId', v_pub_id), v_now),
    (p_organization_id, v_amd.review_request_id, p_amendment_id, v_src_pub.id, 'prior_publication_superseded', 'system', p_actor_user_id,
     jsonb_build_object('supersededCount', v_superseded_count), v_now);

  return jsonb_build_object(
    'reused', false,
    'amendment_id', p_amendment_id,
    'publication_id', v_pub_id,
    'snapshot_id', v_snap_id,
    'superseded_count', v_superseded_count
  );
end;
$$;

revoke all on function public.digital_estimate_publish_amendment_atomic(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, timestamptz, date, text, text, text, integer
) from public;
revoke all on function public.digital_estimate_publish_amendment_atomic(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, timestamptz, date, text, text, text, integer
) from anon, authenticated;
grant execute on function public.digital_estimate_publish_amendment_atomic(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, timestamptz, date, text, text, text, integer
) to service_role;

comment on function public.digital_estimate_publish_amendment_atomic is
  'DE.2F atomic amendment freeze + replacement publication. service_role only. Does not write quote_headers.';
