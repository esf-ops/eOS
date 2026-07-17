-- =============================================================================
-- eliteOS Digital Estimate — DE.2G session lifecycle on envelope supersession
-- ADDITIVE for already-deployed production. Do not rewrite prior migration files.
--
-- Behavior:
--   When a replacement configuration envelope is activated, every public session
--   bound to a superseded envelope is status-revoked in the same transaction.
--   Historical session / selection / calculation / event rows are preserved.
-- =============================================================================

-- Telemetry event for envelope-supersede session revocation (status-only lifecycle)
alter table public.digital_estimate_configuration_events
  drop constraint if exists digital_estimate_configuration_events_event_type_check;

alter table public.digital_estimate_configuration_events
  add constraint digital_estimate_configuration_events_event_type_check
  check (event_type in (
    'envelope_created',
    'envelope_updated',
    'envelope_validated',
    'envelope_activated',
    'envelope_cloned',
    'envelope_superseded',
    'envelope_expired',
    'session_started',
    'selection_saved',
    'calculated',
    'review_flagged',
    'configuration_session_started',
    'configuration_session_resumed',
    'selections_saved',
    'configuration_calculated',
    'configuration_viewed',
    'configuration_session_expired',
    'configuration_session_revoked',
    'configuration_blocked'
  ));

-- Replace activation RPC: supersede prior envelopes + revoke their public sessions atomically
create or replace function public.digital_estimate_activate_configuration_envelope(
  p_organization_id uuid,
  p_envelope_id uuid,
  p_actor_user_id uuid,
  p_pricing_policy_fingerprint text,
  p_catalog_fingerprint text,
  p_expected_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_env record;
  v_pub record;
  v_snap record;
  v_group_count integer;
  v_option_count integer;
  v_prior record;
  v_superseded_count integer := 0;
  v_sessions_revoked_count integer := 0;
  v_revoked_for_prior integer := 0;
begin
  if p_organization_id is null or p_envelope_id is null then
    raise exception 'required activation arguments missing';
  end if;

  select * into v_env
  from public.digital_estimate_configuration_envelopes
  where id = p_envelope_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'configuration envelope not found' using errcode = 'P0002';
  end if;

  if v_env.status not in ('draft', 'ready') then
    raise exception 'only draft/ready envelopes can be activated' using errcode = '22023';
  end if;

  if p_expected_row_version is not null and v_env.row_version is distinct from p_expected_row_version then
    raise exception 'envelope row_version conflict' using errcode = '40001';
  end if;

  select * into v_pub
  from public.quote_publications
  where id = v_env.publication_id
    and organization_id = p_organization_id
  for share;

  if not found then
    raise exception 'publication not found for envelope' using errcode = 'P0002';
  end if;

  if v_pub.status is distinct from 'active' then
    raise exception 'publication is not active' using errcode = '22023';
  end if;

  select * into v_snap
  from public.quote_publication_snapshots
  where publication_id = v_pub.id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'publication snapshot missing' using errcode = 'P0002';
  end if;

  select count(*) into v_group_count
  from public.digital_estimate_configuration_groups
  where envelope_id = p_envelope_id
    and organization_id = p_organization_id;

  select count(*) into v_option_count
  from public.digital_estimate_configuration_options
  where envelope_id = p_envelope_id
    and organization_id = p_organization_id
    and is_active_in_envelope = true;

  if v_group_count < 1 or v_option_count < 1 then
    raise exception 'envelope must include at least one group and one active option'
      using errcode = '22023';
  end if;

  -- Supersede prior active envelopes and revoke their public sessions (status only)
  for v_prior in
    select id
    from public.digital_estimate_configuration_envelopes
    where organization_id = p_organization_id
      and publication_id = v_env.publication_id
      and status = 'active'
      and id is distinct from p_envelope_id
    for update
  loop
    update public.digital_estimate_configuration_envelopes
    set status = 'superseded',
        superseded_by_envelope_id = p_envelope_id,
        updated_at = v_now
    where id = v_prior.id;

    insert into public.digital_estimate_configuration_events (
      organization_id, envelope_id, publication_id, event_type, actor_type,
      actor_user_id, metadata, created_at
    ) values (
      p_organization_id, v_prior.id, v_env.publication_id, 'envelope_superseded', 'system',
      p_actor_user_id,
      jsonb_build_object('supersededByEnvelopeId', p_envelope_id),
      v_now
    );

    with revoked as (
      update public.digital_estimate_configuration_sessions
      set status = 'revoked',
          updated_at = v_now
      where organization_id = p_organization_id
        and envelope_id = v_prior.id
        and status in ('active', 'configuring', 'saved')
      returning id
    )
    select count(*) into v_revoked_for_prior from revoked;

    if v_revoked_for_prior > 0 then
      insert into public.digital_estimate_configuration_events (
        organization_id, envelope_id, publication_id, event_type, actor_type,
        actor_user_id, metadata, created_at
      ) values (
        p_organization_id, v_prior.id, v_env.publication_id, 'configuration_session_revoked', 'system',
        p_actor_user_id,
        jsonb_build_object(
          'reason', 'envelope_superseded',
          'supersededByEnvelopeId', p_envelope_id,
          'revokedSessionCount', v_revoked_for_prior
        ),
        v_now
      );
    end if;

    v_sessions_revoked_count := v_sessions_revoked_count + coalesce(v_revoked_for_prior, 0);
    v_superseded_count := v_superseded_count + 1;
  end loop;

  update public.digital_estimate_configuration_envelopes
  set status = 'active',
      publication_snapshot_id = coalesce(publication_snapshot_id, v_snap.id),
      pricing_policy_fingerprint = coalesce(p_pricing_policy_fingerprint, pricing_policy_fingerprint),
      catalog_fingerprint = coalesce(p_catalog_fingerprint, catalog_fingerprint),
      activated_at = v_now,
      activated_by_user_id = p_actor_user_id,
      row_version = row_version + 1,
      updated_at = v_now
  where id = p_envelope_id
    and organization_id = p_organization_id;

  insert into public.digital_estimate_configuration_events (
    organization_id, envelope_id, publication_id, event_type, actor_type,
    actor_user_id, metadata, created_at
  ) values (
    p_organization_id, p_envelope_id, v_env.publication_id, 'envelope_activated', 'user',
    p_actor_user_id,
    jsonb_build_object(
      'supersededCount', v_superseded_count,
      'sessionsRevokedCount', v_sessions_revoked_count,
      'pricingPolicyFingerprint', coalesce(p_pricing_policy_fingerprint, v_env.pricing_policy_fingerprint),
      'catalogFingerprint', coalesce(p_catalog_fingerprint, v_env.catalog_fingerprint)
    ),
    v_now
  );

  return jsonb_build_object(
    'envelope_id', p_envelope_id,
    'status', 'active',
    'activated_at', v_now,
    'superseded_count', v_superseded_count,
    'sessions_revoked_count', v_sessions_revoked_count
  );
end;
$$;

revoke all on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) from public;
revoke all on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) from anon, authenticated;
grant execute on function public.digital_estimate_activate_configuration_envelope(
  uuid, uuid, uuid, text, text, integer
) to service_role;

-- Backfill: revoke live public sessions still bound to already-superseded envelopes
-- (status update only; never delete historical rows)
with revoked as (
  update public.digital_estimate_configuration_sessions s
  set status = 'revoked',
      updated_at = now()
  from public.digital_estimate_configuration_envelopes e
  where s.envelope_id = e.id
    and e.status = 'superseded'
    and s.status in ('active', 'configuring', 'saved')
  returning s.id, s.organization_id, s.envelope_id, s.publication_id
)
insert into public.digital_estimate_configuration_events (
  organization_id, envelope_id, publication_id, event_type, actor_type,
  actor_user_id, metadata, created_at
)
select
  r.organization_id,
  r.envelope_id,
  r.publication_id,
  'configuration_session_revoked',
  'system',
  null,
  jsonb_build_object('reason', 'backfill_superseded_envelope', 'sessionId', r.id),
  now()
from revoked r;

comment on function public.digital_estimate_activate_configuration_envelope is
  'Activate draft/ready envelope; supersede prior active; revoke public sessions bound to superseded envelopes (status only).';
