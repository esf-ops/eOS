-- eliteOS Digital Estimate — atomic token_wrapped on replace (v2)
-- Additive / idempotent. Apply manually after eliteos_digital_estimate_reusable_links_v1.sql.
--
-- WHY: Replace must persist token_wrapped in the same transaction that inserts the new
-- access token. A post-RPC UPDATE can leave an active hash-only token when wrap persist
-- fails, so readiness cannot rebuild customerUrl after refresh.

alter table public.quote_publication_access_tokens
  add column if not exists token_wrapped text;

-- Drop prior 4-arg signature so callers cannot replace without wrap persistence.
drop function if exists public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid);

create or replace function public.digital_estimate_replace_token_atomic(
  p_organization_id uuid,
  p_publication_id uuid,
  p_new_token_hash text,
  p_actor_user_id uuid,
  p_token_wrapped text
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
begin
  if p_organization_id is null or p_publication_id is null or p_new_token_hash is null then
    raise exception 'required replace arguments missing';
  end if;
  if p_token_wrapped is null or length(trim(p_token_wrapped)) = 0 then
    raise exception 'token_wrapped required for recoverable customer links'
      using errcode = '22023';
  end if;

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

  perform 1
  from public.quote_publication_access_tokens
  where publication_id = p_publication_id
  for update;

  -- Revoke then insert in one transaction. Failure rolls back and keeps prior token.
  update public.quote_publication_access_tokens
  set revoked_at = v_now
  where publication_id = p_publication_id
    and organization_id = p_organization_id
    and revoked_at is null;

  insert into public.quote_publication_access_tokens (
    id, organization_id, publication_id, token_hash, token_wrapped,
    created_at, created_by_user_id, access_count
  ) values (
    v_token_id, p_organization_id, p_publication_id, p_new_token_hash, trim(p_token_wrapped),
    v_now, p_actor_user_id, 0
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
    'replaced_at', v_now,
    'token_wrapped_persisted', true
  );
end;
$$;

revoke all on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid, text) from public;
revoke all on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid, text) from anon, authenticated;
grant execute on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid, text) to service_role;

comment on function public.digital_estimate_replace_token_atomic(uuid, uuid, text, uuid, text) is
  'Atomic token replace with required token_wrapped for Studio-recoverable stable customer URLs.';
