/**
 * Quote ↔ QuickBooks catalog foundation (Phase 0).
 *
 * Transport-independent. No QuickBooks sessions. No EstimateAdd.
 * Mapping identity = qb_list_id. Pricing authority is separate (pricing_source).
 */

/** @typedef {'eliteos_pricing_admin'|'quickbooks_item_price'|'custom_quote_price'|'none'} QuoteQbPricingSource */

export const QUOTE_QB_PRICING_SOURCES = Object.freeze([
  "eliteos_pricing_admin",
  "quickbooks_item_price",
  "custom_quote_price",
  "none"
]);

/**
 * Strong-match seeds verified against:
 * - SDK ItemQuery export `quickbooks-full-materialized-20260710/items`
 * - Live `brain_quickbooks_items` ListIDs (Elite org)
 *
 * Not live DB rows until `eliteos_quote_qb_item_mapping_and_write_queue_v1.sql` is applied.
 * pricing_source is eliteos_pricing_admin for all Phase 0 seeds.
 *
 * @type {ReadonlyArray<{
 *   eliteos_concept_key: string,
 *   qb_list_id: string,
 *   qb_full_name: string,
 *   pricing_source: QuoteQbPricingSource,
 *   customer_facing_name: string,
 *   organization_key: string,
 *   notes: string
 * }>}
 */
export const QUOTE_QB_STRONG_MATCH_SEEDS = Object.freeze([
  Object.freeze({
    eliteos_concept_key: "tear_out",
    qb_list_id: "8000005C-1327168522",
    qb_full_name: "Tear Out",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Tear Out",
    organization_key: "elite_stone_fabrication",
    notes: "Prefer Tear Out over Labor:Tear Out Labor (Granite) pending accounting confirmation."
  }),
  Object.freeze({
    eliteos_concept_key: "cooktop_cutout",
    qb_list_id: "80000023-1327168507",
    qb_full_name: "Cooktop Cutout",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Cooktop cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Phase 0 strong match."
  }),
  Object.freeze({
    eliteos_concept_key: "electrical_outlet_cutout",
    qb_list_id: "8000002C-1327168509",
    qb_full_name: "Electrical Cutouts",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Electrical outlet cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Phase 0 strong match."
  }),
  Object.freeze({
    eliteos_concept_key: "kitchen_sink_cutout",
    qb_list_id: "8000006D-1327168526",
    qb_full_name: "Undermount Sink Cutout",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Kitchen sink cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Mapped to Undermount Sink Cutout."
  }),
  Object.freeze({
    eliteos_concept_key: "vanity_bar_sink_cutout",
    qb_list_id: "8000006E-1327168527",
    qb_full_name: "Undermount Sink Cutout Bar",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Vanity/bar sink cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Phase 0 strong match."
  }),
  Object.freeze({
    eliteos_concept_key: "vanity_sink_cutout",
    qb_list_id: "800000DF-1412265128",
    qb_full_name: "Undermount Sink cutout Vanity",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Vanity sink cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Distinct ListID from bar cutout."
  }),
  Object.freeze({
    eliteos_concept_key: "waterfall",
    qb_list_id: "8000023B-1652221291",
    qb_full_name: "Edge:Waterfall End Panels",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Waterfall",
    organization_key: "elite_stone_fabrication",
    notes: "Phase 0 strong match."
  }),
  Object.freeze({
    eliteos_concept_key: "polish_waterfall_backside",
    qb_list_id: "8000023C-1652272304",
    qb_full_name: "Edge:Polished Waterfall Back",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Polish waterfall backside",
    organization_key: "elite_stone_fabrication",
    notes: "Phase 0 strong match."
  }),
  Object.freeze({
    eliteos_concept_key: "popup_outlet_cutout",
    qb_list_id: "80000263-1668527188",
    qb_full_name: "Labor:Pop-up Cutout",
    pricing_source: /** @type {QuoteQbPricingSource} */ ("eliteos_pricing_admin"),
    customer_facing_name: "Pop-up outlet cutout",
    organization_key: "elite_stone_fabrication",
    notes: "Not Flush Pop-Up Cutout."
  })
]);

/**
 * Map Internal Estimate / calculator line codes → eliteos_concept_key.
 * Aligns with Pricing Admin addon codes where possible.
 */
export const QUOTE_LINE_CODE_TO_QB_CONCEPT = Object.freeze({
  tearout: "tear_out",
  tear_out: "tear_out",
  "qty-cook": "cooktop_cutout",
  cooktop_cutout: "cooktop_cutout",
  "qty-outlet": "electrical_outlet_cutout",
  electrical_outlet_cutout: "electrical_outlet_cutout",
  "qty-sink": "kitchen_sink_cutout",
  kitchen_sink_cutout: "kitchen_sink_cutout",
  "qty-bar": "vanity_bar_sink_cutout",
  vanity_bar_sink_cutout: "vanity_bar_sink_cutout",
  waterfall: "waterfall",
  polish_waterfall_backside: "polish_waterfall_backside",
  "qty-popup": "popup_outlet_cutout",
  popup_outlet_cutout: "popup_outlet_cutout"
});

/**
 * @param {string|null|undefined} organizationKey
 * @param {ReadonlyArray<typeof QUOTE_QB_STRONG_MATCH_SEEDS[number]>} [seeds]
 */
export function listStrongMatchSeedsForOrganization(organizationKey, seeds = QUOTE_QB_STRONG_MATCH_SEEDS) {
  const key = organizationKey != null ? String(organizationKey).trim() : "";
  if (!key) return [];
  return seeds.filter((s) => s.organization_key === key);
}

/**
 * @param {string} conceptKey
 * @param {ReadonlyArray<{ eliteos_concept_key: string, qb_list_id: string, qb_full_name?: string|null, pricing_source: string, customer_facing_name?: string|null }>} mappings
 */
export function resolveQbItemMapping(conceptKey, mappings) {
  const key = conceptKey != null ? String(conceptKey).trim() : "";
  if (!key) return null;
  const hit = (mappings || []).find((m) => m && String(m.eliteos_concept_key) === key);
  return hit || null;
}

/**
 * Infer concept key from a quote_line_items-like row.
 * @param {Record<string, unknown>|null|undefined} line
 */
export function inferConceptKeyFromLineItem(line) {
  if (!line || typeof line !== "object") return null;
  const code = String(line.item_code || line.code || "").trim();
  if (code && QUOTE_LINE_CODE_TO_QB_CONCEPT[code]) return QUOTE_LINE_CODE_TO_QB_CONCEPT[code];
  const category = String(line.category || "").trim().toLowerCase();
  if (category === "tearout" || category === "tear_out") return "tear_out";
  if (category === "waterfall") return "waterfall";
  const name = String(line.item_name || line.name || "").trim().toLowerCase();
  if (name.includes("tear out") || name.includes("tear-out")) return "tear_out";
  if (name.includes("cooktop") && name.includes("cut")) return "cooktop_cutout";
  if (name.includes("electrical") && name.includes("cut")) return "electrical_outlet_cutout";
  if (name.includes("kitchen") && name.includes("sink") && name.includes("cut")) return "kitchen_sink_cutout";
  if ((name.includes("vanity") || name.includes("bar")) && name.includes("cut")) {
    return name.includes("vanity") && !name.includes("bar") ? "vanity_sink_cutout" : "vanity_bar_sink_cutout";
  }
  if (name.includes("waterfall") && name.includes("polish")) return "polish_waterfall_backside";
  if (name.includes("waterfall")) return "waterfall";
  if (name.includes("pop-up") || name.includes("popup")) return "popup_outlet_cutout";
  return null;
}

/**
 * @param {unknown} value
 * @returns {value is QuoteQbPricingSource}
 */
export function isQuoteQbPricingSource(value) {
  return QUOTE_QB_PRICING_SOURCES.includes(/** @type {QuoteQbPricingSource} */ (value));
}
