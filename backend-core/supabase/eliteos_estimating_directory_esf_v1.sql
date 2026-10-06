-- Estimate Builder estimating directory — Elite Stone Fabrication (ADDITIVE CONFIG ONLY)
--
-- Branch and sales rep dropdowns for the Estimate Builder header, each tied to the organization's
-- QuickBooks ListID so an estimate's branch → QuickBooks Class and rep → QuickBooks SalesRep line up
-- when the quote is pushed to QuickBooks. Names are display only; QuickBooks identity is the ListID.
--
-- Decided by the owner 2026-10-06:
--   Branches  = the classes current QuickBooks estimates use: ESF - Dyersville,
--               ESF - Lisbon:Lisbon - North, ESF - Lisbon:Lisbon - South (no Iowa City class exists).
--   Sales reps = Casey J Schenke (CJS), Thera J McEnany (TJM), Michael Joseph (MJ).
-- ListIDs verified against brain_quickbooks_classes / brain_quickbooks_sales_reps (active) for this org.
--
-- Idempotent: inserts once; never overwrites a directory edited after the first apply.

insert into public.organization_integration_configs (organization_id, integration_key, display_name, is_enabled, config, metadata)
values (
  '89180433-9fab-4024-bec9-a14d870bd0a8',
  'estimating_directory',
  'Estimating directory (branches, sales reps)',
  true,
  jsonb_build_object(
    'version', 1,
    'branches', jsonb_build_array(
      jsonb_build_object('code', 'dyersville', 'label', 'Dyersville', 'qbClassListId', '8000002A-1758026709'),
      jsonb_build_object('code', 'lisbon_north', 'label', 'Lisbon - North', 'qbClassListId', '80000025-1702422814'),
      jsonb_build_object('code', 'lisbon_south', 'label', 'Lisbon - South', 'qbClassListId', '80000026-1754077015')
    ),
    'salesReps', jsonb_build_array(
      jsonb_build_object('code', 'CJS', 'name', 'Casey Schenke', 'qbSalesRepListId', '8000011E-1701776253'),
      jsonb_build_object('code', 'TJM', 'name', 'Thera McEnany', 'qbSalesRepListId', '80000121-1771965930'),
      jsonb_build_object('code', 'MJ', 'name', 'Michael Joseph', 'qbSalesRepListId', '80000120-1768241406')
    )
  ),
  jsonb_build_object('source', 'backend-core/supabase/eliteos_estimating_directory_esf_v1.sql', 'decided', '2026-10-06')
)
on conflict (organization_id, integration_key) do nothing;
