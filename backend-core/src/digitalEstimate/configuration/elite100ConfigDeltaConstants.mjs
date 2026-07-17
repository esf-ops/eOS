/**
 * DE.2C engine identity + version constants.
 *
 * elite100-config-delta-v1 — historical absolute/full-reprice calculation identity.
 * elite100-config-delta-v2 — frozen publication total as monetary anchor + authorized deltas.
 *
 * New calculations must persist CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID (v2).
 * Historical v1 rows must never be silently recomputed or relabeled as v2.
 */

/** @deprecated Historical identity — do not use for new calculations. */
export const ELITE100_CONFIG_DELTA_ENGINE_ID_V1 = "elite100-config-delta-v1";

/** Frozen-baseline-anchor engine identity for new calculations. */
export const ELITE100_CONFIG_DELTA_ENGINE_ID_V2 = "elite100-config-delta-v2";

/**
 * Legacy alias retained for v1 module compatibility only.
 * Prefer ELITE100_CONFIG_DELTA_ENGINE_ID_V1 / _V2 / CURRENT explicitly.
 */
export const ELITE100_CONFIG_DELTA_ENGINE_ID = ELITE100_CONFIG_DELTA_ENGINE_ID_V1;

/** Engine id persisted on every new calculation. */
export const CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID = ELITE100_CONFIG_DELTA_ENGINE_ID_V2;

export const ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V1 = 1;
export const ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V2 = 2;

/** @deprecated Prefer ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V1 / _V2. */
export const ELITE100_CONFIG_DELTA_SCHEMA_VERSION = ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V1;

/** Material use tax: 200 basis points = 2%. */
export const MATERIAL_USE_TAX_BPS = 200;

/** Spahn & Rose entire-estimate adjustment: 300 basis points = 3%. */
export const SPAHN_AND_ROSE_ADJUSTMENT_BPS = 300;

export const PRICING_BASIS = Object.freeze({
  DIRECT: "direct",
  WHOLESALE: "wholesale"
});

/** Caller fields that are never authoritative on public/client payloads. */
export const FORBIDDEN_CLIENT_CALC_FIELDS = Object.freeze([
  "organizationId",
  "organization_id",
  "sellPrice",
  "sell_price",
  "unitPrice",
  "ratePerSqft",
  "rate_per_sqft",
  "wholesale",
  "direct",
  "markup",
  "markupBps",
  "materialMarkupBps",
  "taxRate",
  "tax_rate",
  "useTaxRate",
  "accountGroupId",
  "account_group_id",
  "accountGroupCode",
  "partnerAccountId",
  "partner_account_id",
  "configuredTotal",
  "baselineTotal",
  "exactTotal",
  "displayTotal",
  "spahnAdjustment",
  "wattsRate",
  "engineVersion",
  "pricingPolicyVersion",
  "cost",
  "margin"
]);
