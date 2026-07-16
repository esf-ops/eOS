/**
 * DE.2C engine identity + version constants.
 */

export const ELITE100_CONFIG_DELTA_ENGINE_ID = "elite100-config-delta-v1";
export const ELITE100_CONFIG_DELTA_SCHEMA_VERSION = 1;

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
