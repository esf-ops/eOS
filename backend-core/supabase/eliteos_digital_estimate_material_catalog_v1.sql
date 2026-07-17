-- eliteOS Digital Estimate — Elite 100 customer material freeze contract (DE.2H)
-- Additive / idempotent. DO NOT APPLY automatically.
-- Apply manually only when explicitly approved for synthetic/staging/production.
--
-- Purpose:
--   Version the activated-envelope contract for per-room frozen material/color
--   allowlists. Allowed colors continue to live on envelope options
--   (option_key = material:{roomKey}:{materialId}, compatibility_json).
--   This column records the catalog contract version frozen at activation.
--
-- Does NOT:
--   mutate existing envelopes
--   alter rates, calculateQuote(), or public selection payload shape
--   revoke sessions (see DE.2G session lifecycle migration)

alter table public.digital_estimate_configuration_envelopes
  add column if not exists material_catalog_contract text;

comment on column public.digital_estimate_configuration_envelopes.material_catalog_contract is
  'Frozen Elite 100 customer material catalog contract id (e.g. elite100-customer-materials-v1). Set on activation; null for legacy group-only envelopes.';
