-- eliteOS Quote Platform — prototype pricing seed (v1.01 HTML reference)
-- Safe to run AFTER: backend-core/supabase/eos_quote_platform.sql
--
-- Idempotency:
-- - quote_pricing_structures: ON CONFLICT (code) DO UPDATE
-- - quote_pricing_rules: no unique constraint on (pricing_structure_id, category, item_code).
--   Re-run deletes prior rows for this seed via metadata->>'seed_pack' = 'prototype_v101' on
--   structures we manage below, then re-inserts. Safe to repeat; do not hand-edit seeded rows
--   without updating seed_pack or expect them to be wiped on re-seed.
--
-- IMPORTANT — Public retail vs rule unit prices:
-- - quoteCalculator.js treats per-line rule prices as WHOLESALE economics, then applies
--   applyRetailProtection() to the QUOTE TOTAL when pricing_mode is public_retail.
-- - Therefore material_group / add-on / vanity unit prices are the SAME across all structures
--   in this seed (prototype baseline). Public list is enforced by structure retail_markup_percent
--   (>=25) on totals, not by inflating per-sf rows (which would double-apply markup).
--
-- Admin review:
-- - These are initial seed values from the prototype and require Eric/admin review.
-- - Future Pricing Admin UI should edit these values.
-- - Prototype file: docs/reference/quote-prototype/ESF Quoting Tool - v1.01.html
-- - Regenerate: node backend-core/src/scripts/generateQuotePrototypePricingSeed.js
--

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Public Retail',
  'public_retail',
  'Public-facing retail pricing that protects dealer/partner pricing with at least 25% markup (applied at quote total level in quoteCalculator.js).',
  'public_retail',
  25,
  true,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Dealer Tier 1',
  'dealer_tier_1',
  'Protected dealer baseline (prototype v1.01 rates). Initial seed; requires Eric/admin review.',
  'dealer',
  0,
  false,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Dealer Tier 2',
  'dealer_tier_2',
  'Protected dealer tier 2 (seeded same as Tier 1 until tier split is defined).',
  'dealer',
  0,
  false,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Builder Partner',
  'builder_partner',
  'Protected builder partner baseline (prototype v1.01 rates).',
  'builder',
  0,
  false,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Designer Partner',
  'designer_partner',
  'Protected designer partner baseline (prototype v1.01 rates).',
  'designer',
  0,
  false,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.quote_pricing_structures (name, code, description, pricing_mode, retail_markup_percent, is_public_default, is_active, metadata)
VALUES (
  'Internal / House',
  'internal_house',
  'Internal house economics (prototype v1.01 rates).',
  'internal',
  0,
  false,
  true,
  '{"seed_pack":"prototype_v101"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  pricing_mode = EXCLUDED.pricing_mode,
  retail_markup_percent = EXCLUDED.retail_markup_percent,
  is_public_default = EXCLUDED.is_public_default,
  is_active = EXCLUDED.is_active,
  metadata = COALESCE(public.quote_pricing_structures.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

-- Remove prior prototype seed rules (scoped to our structures only)
DELETE FROM public.quote_pricing_rules r
USING public.quote_pricing_structures s
WHERE r.pricing_structure_id = s.id
  AND s.code IN ('public_retail', 'dealer_tier_1', 'dealer_tier_2', 'builder_partner', 'designer_partner', 'internal_house')
  AND r.metadata->>'seed_pack' = 'prototype_v101';

-- ---------------------------------------------------------------------------
-- Rules: same baseline unit economics on every structure; public retail markup
-- is enforced on quote totals (see header comment).
-- ---------------------------------------------------------------------------

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'public_retail';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_1';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'dealer_tier_2';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'builder_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'designer_partner';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_promo', 'Group Promo', 'per_sqft', NULL, 45, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group Promo","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_a', 'Group A', 'per_sqft', NULL, 57, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group A","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_b', 'Group B', 'per_sqft', NULL, 65, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group B","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_c', 'Group C', 'per_sqft', NULL, 75, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group C","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_d', 'Group D', 'per_sqft', NULL, 85, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group D","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_e', 'Group E', 'per_sqft', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group E","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_group', 'group_f', 'Group F', 'per_sqft', NULL, 115, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tiers","original_group_name":"Group F","notes":"Extracted from ESF Quoting Tool v1.01 prototype"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_carrara_classic', 'Carrara Classic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Carrara Classic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_carrara', 'Bianco Carrara', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Bianco Carrara","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_moonflakes', 'Moonflakes', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group Promo","color_name":"Moonflakes","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_bayshore_sand', 'Bayshore Sand', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group Promo","color_name":"Bayshore Sand","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_antique_gray', 'Antique Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Antique Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_carrara_royale', 'Carrara Royale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Carrara Royale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_classic_grey', 'Classic Grey', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Classic Grey","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_india_black_pearl_dual_finish', 'India Black Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"India Black Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sicilia', 'Sicilia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Sicilia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_silver_pearl_dual_finish', 'Silver Pearl Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Silver Pearl Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_suede_brown_dual_finish', 'Suede Brown Dual Finish', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group Promo","color_name":"Suede Brown Dual Finish","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_super_white', 'Super White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Super White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_warm_fuzzy', 'Warm & Fuzzy', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"Warm & Fuzzy","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_white_blizzard', 'White Blizzard', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group Promo","color_name":"White Blizzard","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_white_dove', 'White Dove', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group Promo","color_name":"White Dove","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_axbridge', 'Axbridge', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Axbridge","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_bear_hug', 'Bear Hug', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Bear Hug","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_bianco_olympus', 'Bianco Olympus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Bianco Olympus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_lucent', 'Calacatta Lucent', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Lucent","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_miracle', 'Calacatta Miracle', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Miracle","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_rusta', 'Calacatta Rusta', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group A","color_name":"Calacatta Rusta","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_calacatta_solana', 'Calacatta Solana', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group A","color_name":"Calacatta Solana","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_heart_of_gold', 'Heart of Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Heart of Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_mackinaw', 'Mackinaw', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Mackinaw","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_omega_white', 'Omega White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Omega White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_ridgegate', 'Ridgegate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Ridgegate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_seacourt', 'Seacourt', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Seacourt","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'trends_quartz_shiprock', 'Shiprock', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Trends","material":"Quartz","group":"Group A","color_name":"Shiprock","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_sky_s_the_limit', 'Sky’s the Limit', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group A","color_name":"Sky’s the Limit","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_fiona', 'Statuario Fiona', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group A","color_name":"Statuario Fiona","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_warwick', 'Warwick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Warwick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_whitenedale', 'Whitenedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group A","color_name":"Whitenedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'granite_granite_wiscon_white', 'Wiscon White', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Granite","material":"Granite","group":"Group A","color_name":"Wiscon White","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_alabaster', 'Alabaster', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Alabaster","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_belezza', 'Belezza', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Belezza","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_gold', 'Calacatta Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_jade', 'Calacatta Jade', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Jade","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_calacatta_riviera', 'Calacatta Riviera', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Calacatta Riviera","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_calacatta_plazo_light', 'Calacatta Plazo Light', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Calacatta Plazo Light","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_canterbury', 'Canterbury', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Canterbury","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_carrick', 'Carrick', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Carrick","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_castello', 'Castello', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Castello","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_charlestown', 'Charlestown', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group B","color_name":"Charlestown","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus', 'Cirrus', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_cirrus_oro', 'Cirrus Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Cirrus Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_coastal_tide', 'Coastal Tide', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group B","color_name":"Coastal Tide","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lenox_oro', 'Lenox Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lenox Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_lusso_dior', 'Lusso Dior', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Lusso Dior","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_nova_taj', 'Nova Taj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Nova Taj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_d_oro', 'Regal D’Oro', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group B","color_name":"Regal D’Oro","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_statuario_mocha', 'Statuario Mocha', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group B","color_name":"Statuario Mocha","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_aurataj', 'Aurataj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Aurataj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_aureate', 'Aureate', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Aureate","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_belfast_gray', 'Belfast Gray', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Belfast Gray","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_bellini_honed', 'Bellini Honed', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Bellini Honed","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_calacatta_fioressa', 'Calacatta Fioressa', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group C","color_name":"Calacatta Fioressa","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_empyrean', 'Empyrean', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Empyrean","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_haydon', 'Haydon', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Haydon","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_honeydew', 'Honeydew', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Honeydew","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'asmi_quartz_macavella', 'Macavella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ASMI","material":"Quartz","group":"Group C","color_name":"Macavella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_michelangelo', 'Michelangelo', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group C","color_name":"Michelangelo","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_newport_polished', 'Newport Polished', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group C","color_name":"Newport Polished","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_calacatta_zeal', 'Regal Calacatta Zeal', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Calacatta Zeal","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_soapstone', 'Regal Soapstone', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Regal Soapstone","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_sienna', 'Taj Sienna', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Taj Sienna","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_utopia', 'Utopia', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Utopia","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_winterfresh', 'Winterfresh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group C","color_name":"Winterfresh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_zenith', 'Zenith', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group C","color_name":"Zenith","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_athena', 'Athena', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Athena","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_bellingham', 'Bellingham', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Bellingham","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_berwyn', 'Berwyn', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Berwyn","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_blackbrook', 'Blackbrook', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Blackbrook","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_colton', 'Colton', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Colton","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_french_vanilla', 'French Vanilla', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"French Vanilla","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hawksmoore', 'Hawksmoore', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hawksmoore","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_hermitage', 'Hermitage', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Hermitage","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'esf_quartz_quartz_larvic', 'Larvic', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"ESF Quartz","material":"Quartz","group":"Group D","color_name":"Larvic","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_macbeth', 'Macbeth', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Macbeth","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_regal_arabescato_gold', 'Regal Arabescato Gold', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group D","color_name":"Regal Arabescato Gold","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_smithfield', 'Smithfield', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Smithfield","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'q_quartz_quartz_solitaj', 'Solitaj', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Q Quartz","material":"Quartz","group":"Group D","color_name":"Solitaj","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_st_soubirous', 'St. Soubirous', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group D","color_name":"St. Soubirous","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_torquay', 'Torquay', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Torquay","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_travella', 'Travella', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group D","color_name":"Travella","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_granada_beige', 'Granada Beige', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group E","color_name":"Granada Beige","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_mammoth_cave', 'Mammoth Cave', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Mammoth Cave","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_st_isley', 'St. Isley', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"St. Isley","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_summerhill', 'Summerhill', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group E","color_name":"Summerhill","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'stratus_quartz_taj_valmont', 'Taj Valmont', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Stratus","material":"Quartz","group":"Group E","color_name":"Taj Valmont","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'aggranite_quartz_calacatta_viol', 'Calacatta Viol', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Aggranite","material":"Quartz","group":"Group F","color_name":"Calacatta Viol","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_delgatie_satin', 'Delgatie Satin', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Delgatie Satin","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh', 'Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_everleigh_warm', 'Everleigh Warm', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Everleigh Warm","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_harlow', 'Harlow', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Harlow","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_everleigh', 'Inverness Everleigh', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Everleigh","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_inverness_stonestreet', 'Inverness Stonestreet', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Inverness Stonestreet","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_kenwood', 'Kenwood', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Kenwood","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_lakedale', 'Lakedale', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Lakedale","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_portrush', 'Portrush', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Portrush","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'material_color', 'cambria_quartz_skara_brae', 'Skara Brae', 'per_sqft', NULL, NULL, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.materials","supplier":"Cambria","material":"Quartz","group":"Group F","color_name":"Skara Brae","notes":"Color→group mapping; calculator still prices by material_group until color-specific pricing exists."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '25_S', '25" Single Bowl Vanity', 'each', 190, 370, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":190,"tier_2_price":370,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '31_S', '31" Single Bowl Vanity', 'each', 210, 425, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":210,"tier_2_price":425,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '37_S', '37" Single Bowl Vanity', 'each', 240, 475, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":240,"tier_2_price":475,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '43_S', '43" Single Bowl Vanity', 'each', 270, 535, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":270,"tier_2_price":535,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '49_S', '49" Single Bowl Vanity', 'each', 310, 590, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":310,"tier_2_price":590,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '55_S', '55" Single Bowl Vanity', 'each', 360, 650, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":360,"tier_2_price":650,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_S', '61" Single Bowl Vanity', 'each', 385, 675, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":385,"tier_2_price":675,"bowls":1,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '61_D', '61" Double Bowl Vanity', 'each', 410, 700, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":410,"tier_2_price":700,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '73_D', '73" Double Bowl Vanity', 'each', 490, 810, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":490,"tier_2_price":810,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '84_D', '84" Double Bowl Vanity', 'each', 570, 950, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":570,"tier_2_price":950,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '93_D', '93" Double Bowl Vanity', 'each', 650, 1000, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":650,"tier_2_price":1000,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '96_D', '96" Double Bowl Vanity', 'each', 685, 1050, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":685,"tier_2_price":1050,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '105_D', '105" Double Bowl Vanity', 'each', 760, 1100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":760,"tier_2_price":1100,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity', '120_D', '120" Double Bowl Vanity', 'each', 800, 1150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanityPricing","tier_1_price":800,"tier_2_price":1150,"bowls":2,"notes":"quoteCalculator.js uses base_cost=tier1 and price=tier2; full tier metadata preserved for admin/calculator parity review."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_0', 'White Oval Sink Included ($0)', 'each', NULL, 0, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"0","label":"White Oval Sink Included ($0)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_10', 'Bisque Oval Upgrade ($10 per sink)', 'each', NULL, 10, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"10","label":"Bisque Oval Upgrade ($10 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'vanity_sink_upgrade', 'vanity_sink_upgrade_25', 'Rectangular Sink Upgrade ($25 per sink)', 'each', NULL, 25, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.vanitySinkOptions","prototype_value":"25","label":"Rectangular Sink Upgrade ($25 per sink)"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-sink', 'Kitchen Sink Cutouts', 'each', NULL, 200, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-sink"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-bar', 'Vanity/Bar Sink Cutouts', 'each', NULL, 100, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-bar"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-cook', 'Cooktop Cutouts', 'each', NULL, 150, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-cook"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'cutout', 'qty-outlet', 'Electrical Outlet Cutouts', 'each', NULL, 30, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-outlet"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-ss', 'ESF Stainless Kitchen Sink', 'each', NULL, 160, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-ss"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-blanco', 'Stock Blanco Sink', 'each', NULL, 450, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-blanco"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-rect', 'ESF Rectangular Vanity Sink', 'each', NULL, 55, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-rect"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'sink', 'qty-v-oval', 'ESF Oval Vanity Sink', 'each', NULL, 35, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.addOns","prototype_id":"qty-v-oval"}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

INSERT INTO public.quote_pricing_rules (pricing_structure_id, category, item_code, item_name, unit_type, base_cost, price, markup_percent, is_active, metadata)
SELECT s.id, 'tearout', 'tearout', 'Tear Out Needed', 'job', NULL, 750, NULL, true, '{"seed_pack":"prototype_v101","source":"prototype","prototype_key":"config.tearOut","spec_item_code":"tear_out_needed","notes":"item_code is tearout to match quoteCalculator.js / prototype add-on key; spec_item_code records naming from pricing spec."}'::jsonb
FROM public.quote_pricing_structures s WHERE s.code = 'internal_house';

