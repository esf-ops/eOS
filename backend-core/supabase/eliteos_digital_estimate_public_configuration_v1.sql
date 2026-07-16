-- =============================================================================
-- eliteOS Digital Estimate — DE.2E public configuration session additives
-- UNAPPLIED. Do not apply in this phase.
--
-- Migration order:
--   1) eliteos_digital_estimate_v1.sql
--   2) eliteos_digital_estimate_configuration_v1.sql
--   3) eliteos_digital_estimate_public_configuration_v1.sql (this file)
-- =============================================================================

-- Session secret hash (HttpOnly cookie raw secret never stored)
alter table public.digital_estimate_configuration_sessions
  add column if not exists session_secret_hash text;

alter table public.digital_estimate_configuration_sessions
  add column if not exists latest_calculation_id uuid
    references public.digital_estimate_configuration_calculations (id) on delete set null;

create unique index if not exists uq_de_config_sessions_secret_hash
  on public.digital_estimate_configuration_sessions (session_secret_hash)
  where session_secret_hash is not null;

-- Expand session status for public lifecycle (keep legacy values)
alter table public.digital_estimate_configuration_sessions
  drop constraint if exists digital_estimate_configuration_sessions_status_check;

alter table public.digital_estimate_configuration_sessions
  add constraint digital_estimate_configuration_sessions_status_check
  check (status in (
    'configuring',
    'saved',
    'active',
    'expired',
    'abandoned',
    'superseded',
    'revoked',
    'blocked',
    'completed'
  ));

-- Allow publication-only sessions (read-only baseline when no envelope)
alter table public.digital_estimate_configuration_sessions
  alter column envelope_id drop not null;

-- Expand event types for public configuration telemetry (privacy-preserving metadata only)
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
    'configuration_blocked'
  ));

-- =============================================================================
-- Atomic selection + calculation RPC (service_role only)
-- =============================================================================

create or replace function public.digital_estimate_save_selection_and_calculation(
  p_organization_id uuid,
  p_session_id uuid,
  p_expected_row_version integer,
  p_idempotency_key text,
  p_selection_payload_json jsonb,
  p_selection_hash text,
  p_engine_version text,
  p_calculation_input_fingerprint text,
  p_customer_result_json jsonb,
  p_internal_evidence_json jsonb,
  p_baseline_total numeric default null,
  p_configured_total numeric default null,
  p_pricing_valid_through date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_prior_sel record;
  v_prior_calc record;
  v_sel_id uuid;
  v_calc_id uuid;
  v_now timestamptz := now();
begin
  if p_organization_id is null
     or p_session_id is null
     or p_expected_row_version is null
     or p_idempotency_key is null
     or p_selection_payload_json is null
     or p_selection_hash is null
     or p_engine_version is null
     or p_calculation_input_fingerprint is null
     or p_customer_result_json is null
     or p_internal_evidence_json is null then
    raise exception 'required selection/calculation arguments missing';
  end if;

  select * into v_session
  from public.digital_estimate_configuration_sessions
  where id = p_session_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'configuration session not found' using errcode = 'P0002';
  end if;

  if v_session.row_version is distinct from p_expected_row_version then
    raise exception 'session row_version conflict' using errcode = '40001';
  end if;

  if v_session.envelope_id is null then
    raise exception 'configuration session has no envelope' using errcode = '22023';
  end if;

  -- Idempotent retry
  if v_session.last_client_idempotency_key is not distinct from p_idempotency_key then
    select * into v_prior_sel
    from public.digital_estimate_configuration_selections
    where session_id = p_session_id
      and client_idempotency_key = p_idempotency_key
    order by created_at desc
    limit 1;

    if found then
      select * into v_prior_calc
      from public.digital_estimate_configuration_calculations
      where selection_id = v_prior_sel.id
      limit 1;

      if found then
        return jsonb_build_object(
          'reused', true,
          'session', to_jsonb(v_session),
          'selection', to_jsonb(v_prior_sel),
          'calculation', to_jsonb(v_prior_calc)
        );
      end if;
    end if;
  end if;

  insert into public.digital_estimate_configuration_selections (
    organization_id, session_id, envelope_id,
    selection_payload_json, selection_hash, client_idempotency_key, created_at
  ) values (
    p_organization_id, p_session_id, v_session.envelope_id,
    p_selection_payload_json, p_selection_hash, p_idempotency_key, v_now
  )
  returning id into v_sel_id;

  insert into public.digital_estimate_configuration_calculations (
    organization_id, selection_id, envelope_id, engine_version,
    calculation_input_fingerprint, customer_result_json, internal_evidence_json,
    baseline_total, configured_total, pricing_valid_through, created_at
  ) values (
    p_organization_id, v_sel_id, v_session.envelope_id, p_engine_version,
    p_calculation_input_fingerprint, p_customer_result_json, p_internal_evidence_json,
    p_baseline_total, p_configured_total, p_pricing_valid_through, v_now
  )
  returning id into v_calc_id;

  update public.digital_estimate_configuration_sessions
  set row_version = row_version + 1,
      last_client_idempotency_key = p_idempotency_key,
      status = 'saved',
      latest_calculation_id = v_calc_id,
      updated_at = v_now
  where id = p_session_id
    and organization_id = p_organization_id;

  insert into public.digital_estimate_configuration_events (
    organization_id, envelope_id, publication_id, session_id, event_type, actor_type, metadata, created_at
  ) values
    (p_organization_id, v_session.envelope_id, v_session.publication_id, p_session_id,
     'selection_saved', 'public', jsonb_build_object('selectionHash', p_selection_hash), v_now),
    (p_organization_id, v_session.envelope_id, v_session.publication_id, p_session_id,
     'selections_saved', 'public', jsonb_build_object('selectionHash', p_selection_hash), v_now),
    (p_organization_id, v_session.envelope_id, v_session.publication_id, p_session_id,
     'calculated', 'system',
     jsonb_build_object('calculationId', v_calc_id, 'fingerprint', p_calculation_input_fingerprint), v_now),
    (p_organization_id, v_session.envelope_id, v_session.publication_id, p_session_id,
     'configuration_calculated', 'system', jsonb_build_object('calculationId', v_calc_id), v_now);

  select * into v_session
  from public.digital_estimate_configuration_sessions
  where id = p_session_id;

  select * into v_prior_sel
  from public.digital_estimate_configuration_selections
  where id = v_sel_id;

  select * into v_prior_calc
  from public.digital_estimate_configuration_calculations
  where id = v_calc_id;

  return jsonb_build_object(
    'reused', false,
    'session', to_jsonb(v_session),
    'selection', to_jsonb(v_prior_sel),
    'calculation', to_jsonb(v_prior_calc)
  );
end;
$$;

revoke all on function public.digital_estimate_save_selection_and_calculation(
  uuid, uuid, integer, text, jsonb, text, text, text, jsonb, jsonb, numeric, numeric, date
) from public;
revoke all on function public.digital_estimate_save_selection_and_calculation(
  uuid, uuid, integer, text, jsonb, text, text, text, jsonb, jsonb, numeric, numeric, date
) from anon, authenticated;
grant execute on function public.digital_estimate_save_selection_and_calculation(
  uuid, uuid, integer, text, jsonb, text, text, text, jsonb, jsonb, numeric, numeric, date
) to service_role;

comment on function public.digital_estimate_save_selection_and_calculation is
  'DE.2E atomic public selection + calculation persist. service_role only. Fixed search_path.';
