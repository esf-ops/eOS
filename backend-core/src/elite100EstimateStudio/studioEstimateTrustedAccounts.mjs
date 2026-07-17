/**
 * Trusted partner account rules for Elite 100 Studio estimates.
 * Membership is by partner_account_id allowlist only — never customer name.
 */
import { ESF_DIRECT_PRICE_PER_SQFT, PROTOTYPE_TIER_PRICE_PER_SQFT } from "../quotes/quoteCalculator.js";

/**
 * @param {string|undefined|null} raw
 * @returns {Set<string>}
 */
function parseIdSet(raw) {
  const set = new Set();
  for (const part of String(raw ?? "").split(",")) {
    const v = part.trim().toLowerCase();
    if (v) set.add(v);
  }
  return set;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readTrustedPartnerAccountConfig(env = process.env) {
  return {
    wattsPartnerAccountIds: parseIdSet(env.ELITE100_TRUSTED_WATTS_PARTNER_ACCOUNT_IDS),
    spahnPartnerAccountIds: parseIdSet(env.ELITE100_TRUSTED_SPAHN_PARTNER_ACCOUNT_IDS),
    internalMarkupAllowedUserIds: parseIdSet(env.ELITE100_INTERNAL_MARKUP_ALLOWED_USER_IDS)
  };
}

/**
 * @param {string|null|undefined} partnerAccountId
 * @param {ReturnType<typeof readTrustedPartnerAccountConfig>} cfg
 */
export function isWattsTrustedPartner(partnerAccountId, cfg) {
  const id = String(partnerAccountId ?? "")
    .trim()
    .toLowerCase();
  return Boolean(id) && cfg.wattsPartnerAccountIds.has(id);
}

/**
 * @param {string|null|undefined} partnerAccountId
 * @param {ReturnType<typeof readTrustedPartnerAccountConfig>} cfg
 */
export function isSpahnTrustedPartner(partnerAccountId, cfg) {
  const id = String(partnerAccountId ?? "")
    .trim()
    .toLowerCase();
  return Boolean(id) && cfg.spahnPartnerAccountIds.has(id);
}

/**
 * @param {string|null|undefined} userId
 * @param {ReturnType<typeof readTrustedPartnerAccountConfig>} cfg
 */
export function canApplyInternalMarkup(userId, cfg) {
  const id = String(userId ?? "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  // Empty allowlist ⇒ nobody may apply markup (fail closed).
  if (cfg.internalMarkupAllowedUserIds.size === 0) return false;
  return cfg.internalMarkupAllowedUserIds.has(id);
}

/** Watts trusted Promo material override ($/SF). */
export const WATTS_PROMO_RATE_PER_SF = 40;

/** Spahn & Rose whole-estimate adjustment after material use tax. */
export const SPAHN_ESTIMATE_ADJUSTMENT_PERCENT = 3;

/**
 * Resolve material $/SF for studio estimates (server authority).
 * Watts Promo override only when partner is in trusted Watts allowlist AND group is Promo.
 *
 * @param {{
 *   materialGroup: string,
 *   pricingBasis: "direct"|"wholesale",
 *   partnerAccountId?: string|null,
 *   env?: NodeJS.ProcessEnv
 * }} params
 */
export function resolveStudioMaterialRatePerSf(params) {
  const group = String(params.materialGroup ?? "Group Promo").trim() || "Group Promo";
  const basis = params.pricingBasis === "wholesale" ? "wholesale" : "direct";
  const cfg = readTrustedPartnerAccountConfig(params.env);
  const table = basis === "wholesale" ? PROTOTYPE_TIER_PRICE_PER_SQFT : ESF_DIRECT_PRICE_PER_SQFT;
  let rate = Number(table[group] ?? table["Group Promo"]);
  let wattsOverrideApplied = false;
  if (
    group === "Group Promo" &&
    isWattsTrustedPartner(params.partnerAccountId, cfg) &&
    Number.isFinite(WATTS_PROMO_RATE_PER_SF)
  ) {
    rate = WATTS_PROMO_RATE_PER_SF;
    wattsOverrideApplied = true;
  }
  return {
    rate,
    group,
    basis,
    wattsOverrideApplied,
    rateSource: wattsOverrideApplied ? "watts_trusted_promo" : "quote_calculator_authority"
  };
}
