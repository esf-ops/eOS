-- eliteOS report-feed API-mirror identity apply (additive).
-- Manual apply: authenticated CLI against verified eliteOS production.
-- Do NOT rewrite eliteos_moraware_completed_install_form_facts_v1.sql.
--
-- Purpose:
--   Batch-apply matched identity onto moraware_report_raw_rows without
--   one PostgREST round-trip per unique job. Brain/service_role only.
--   Does not write prepared facts, attribution, or Moraware.

create or replace function public.eliteos_apply_report_feed_raw_row_identity_matches(
  p_organization_id uuid,
  p_matches jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if p_organization_id is null then
    raise exception 'eliteos_apply_report_feed_raw_row_identity_matches: organization_id required';
  end if;

  update public.moraware_report_raw_rows r
  set
    account_id = m.account_id,
    job_id = m.job_id,
    identity_status = 'matched',
    identity_reason = 'api_mirror_exact_account_job'
  from jsonb_to_recordset(coalesce(p_matches, '[]'::jsonb)) as m(
    id uuid,
    account_id text,
    job_id text
  )
  where r.id = m.id
    and r.organization_id = p_organization_id
    and r.identity_status = 'needs_identity_review';

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.eliteos_apply_report_feed_raw_row_identity_matches(uuid, jsonb) is
  'Batch API-mirror identity matches for report-feed raw rows. Invoker; Brain/service_role only.';

revoke all on function public.eliteos_apply_report_feed_raw_row_identity_matches(uuid, jsonb) from public;
revoke all on function public.eliteos_apply_report_feed_raw_row_identity_matches(uuid, jsonb) from anon, authenticated;
grant execute on function public.eliteos_apply_report_feed_raw_row_identity_matches(uuid, jsonb) to service_role;
