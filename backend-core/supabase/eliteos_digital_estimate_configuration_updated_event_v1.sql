-- =============================================================================
-- eliteOS Digital Estimate — allow configuration_updated publication events +
-- quote_library_customer_config configuration telemetry.
-- ADDITIVE for already-deployed production. Do not rewrite prior migration files.
--
-- Root cause (hosted 23514):
--   1) Studio Save/Update Configuration appended event_type='configuration_updated'
--      to quote_publication_events, which only allowed published/link_copied/
--      first_viewed/viewed/revoked/token_replaced/superseded.
--   2) Public selection autosave appended event_type='quote_library_customer_config'
--      to digital_estimate_configuration_events, which did not include that value.
-- =============================================================================

-- 1) Publication activity: configuration permission updates on an active link
alter table public.quote_publication_events
  drop constraint if exists quote_publication_events_event_type_check;

alter table public.quote_publication_events
  add constraint quote_publication_events_event_type_check
  check (event_type in (
    'published',
    'link_copied',
    'first_viewed',
    'viewed',
    'revoked',
    'token_replaced',
    'superseded',
    'configuration_updated'
  ));

comment on constraint quote_publication_events_event_type_check on public.quote_publication_events is
  'Digital Estimate publication lifecycle events. configuration_updated records Studio permission/envelope fingerprint changes without rotating the customer token.';

-- 2) Configuration telemetry: quote-library projection after customer save
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
    'configuration_blocked',
    'quote_library_customer_config'
  ));

comment on constraint digital_estimate_configuration_events_event_type_check on public.digital_estimate_configuration_events is
  'Digital Estimate configuration activity. quote_library_customer_config is privacy-preserving customer-config projection telemetry after a successful public save.';
