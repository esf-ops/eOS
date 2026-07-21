/**
 * DE.2B — public / customer-safe projection for configuration options.
 * Never expose internal pricing evidence, account groups, wholesale, margin, etc.
 */

import {
  conciseCustomerTitle,
  customerPriceEffectLabel,
  sideSplashPieceDisplayName,
  stripInternalChannelTerms
} from "../catalog/customerFacingCopy.mjs";

export const CONFIGURATION_PUBLIC_OPTION_KEYS = Object.freeze([
  "optionKey",
  "groupKey",
  "displayLabel",
  "description",
  "imageAssetRef",
  "minQty",
  "maxQty",
  "defaultQty",
  "includedInBaseline",
  "requiredSelection",
  "availabilityState",
  "customerPriceTreatment",
  "pricingMode",
  "visibleSellPrice",
  "visibleDelta",
  "priceEffectLabel",
  "pieceDisplayName",
  "pieceIndex",
  "accessoryKind",
  "compatibleFamilyIds",
  "notesCustomer",
  "unit"
]);

export const CONFIGURATION_PUBLIC_FORBIDDEN_SUBSTRINGS = Object.freeze([
  "wholesale",
  "cost_basis",
  "costBasis",
  "margin",
  "markup",
  "account_group",
  "accountGroup",
  "partner_account",
  "partnerAccount",
  "approval_evidence",
  "approvalEvidence",
  "approver",
  "notes_internal",
  "notesInternal",
  "internal_evidence",
  "internalEvidence",
  "internal_pricing",
  "watts",
  "spahn",
  "discount_amount",
  "base_rate",
  "raw_token",
  "rawToken",
  "service_role",
  // Frozen hidden custom-line allocation internals (publish snapshot audit
  // and configured-state reattachment records) must never reach the browser.
  "customLineAllocations",
  "allocatedCents",
  "internalReattachments",
  "allocationRule",
  "policyVersion",
  "pricingBasis",
  "ratePerLf",
  "eligibleLf",
  "billedSf",
  "measuredSf",
  "runId",
  "areaId"
]);

/**
 * @param {Record<string, unknown>} option
 * @param {{ groupKey?: string }} [ctx]
 */
export function toPublicConfigurationOption(option, ctx = {}) {
  const treatment = String(option.customer_price_treatment || option.customerPriceTreatment || "absolute");
  const sell = option.sell_price ?? option.sellPrice ?? null;
  let visibleSellPrice = null;
  let visibleDelta = null;
  if (treatment === "included" || treatment === "no_change") {
    visibleSellPrice = null;
  } else if (treatment === "delta") {
    visibleDelta = sell;
  } else if (treatment === "absolute") {
    visibleSellPrice = sell;
  } else if (treatment === "review_required") {
    visibleSellPrice = null;
    visibleDelta = null;
  }

  const compat =
    option.compatibility_json && typeof option.compatibility_json === "object"
      ? option.compatibility_json
      : option.compatibilityJson && typeof option.compatibilityJson === "object"
        ? option.compatibilityJson
        : {};
  const pieceDisplayNameRaw = compat.pieceDisplayName || compat.piece_display_name || null;
  const pieceIndex = Number(compat.pieceIndex || compat.piece_index || 0) || null;
  const pieceDisplayName = pieceDisplayNameRaw
    ? sideSplashPieceDisplayName(String(pieceDisplayNameRaw), pieceIndex || 1)
    : null;

  const rawLabel = String(option.display_label || option.displayLabel || "");
  const displayLabel = conciseCustomerTitle(stripInternalChannelTerms(rawLabel), { maxLen: 96 });
  const descriptionRaw = option.description_customer ?? option.description ?? null;
  const description =
    descriptionRaw != null ? stripInternalChannelTerms(String(descriptionRaw)) || null : null;

  const reviewRequired =
    treatment === "review_required" ||
    Boolean(compat.estimatorReviewRequired) ||
    String(compat.pricingTreatment || "") === "review_only";

  const priceEffectLabel = customerPriceEffectLabel({
    includedInBaseline: Boolean(option.included_in_baseline ?? option.includedInBaseline),
    customerPriceTreatment: treatment,
    availabilityState: String(option.availability_state || option.availabilityState || "active"),
    visibleSellPrice,
    visibleDelta,
    reviewRequired
  });

  return {
    optionKey: String(option.option_key || option.optionKey || ""),
    groupKey: String(ctx.groupKey || option.group_key || option.groupKey || ""),
    displayLabel,
    description,
    imageAssetRef: option.image_asset_ref ?? option.imageAssetRef ?? null,
    minQty: Number(option.min_qty ?? option.minQty ?? 0),
    maxQty: option.max_qty ?? option.maxQty ?? null,
    defaultQty: Number(option.default_qty ?? option.defaultQty ?? 0),
    includedInBaseline: Boolean(option.included_in_baseline ?? option.includedInBaseline),
    requiredSelection: Boolean(option.required_selection ?? option.requiredSelection),
    availabilityState: String(option.availability_state || option.availabilityState || "active"),
    customerPriceTreatment: treatment,
    pricingMode: String(option.pricing_mode || option.pricingMode || "fixed"),
    visibleSellPrice,
    visibleDelta,
    priceEffectLabel,
    pieceDisplayName,
    pieceIndex,
    accessoryKind: compat.accessoryKind || compat.accessory_kind || null,
    compatibleFamilyIds: Array.isArray(compat.compatibleFamilyIds)
      ? compat.compatibleFamilyIds.map(String)
      : Array.isArray(compat.compatible_family_ids)
        ? compat.compatible_family_ids.map(String)
        : [],
    notesCustomer: option.notes_customer ?? option.notesCustomer ?? null,
    unit: option.sell_price_unit ?? option.sellPriceUnit ?? option.unit ?? null
  };
}

/**
 * @param {unknown} value
 * @param {string} [path]
 */
export function assertPublicConfigurationHasNoForbiddenContent(value, path = "$") {
  if (value == null) return;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const bad of CONFIGURATION_PUBLIC_FORBIDDEN_SUBSTRINGS) {
      if (lower.includes(String(bad).toLowerCase())) {
        throw new Error(`forbidden public configuration content at ${path}: ${bad}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPublicConfigurationHasNoForbiddenContent(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const keyLower = k.toLowerCase();
      for (const bad of CONFIGURATION_PUBLIC_FORBIDDEN_SUBSTRINGS) {
        if (keyLower.includes(String(bad).toLowerCase().replace(/_/g, ""))) {
          // allow benign keys that don't match; check exact forbidden key fragments
        }
      }
      const forbiddenKeys = [
        "wholesale",
        "costBasis",
        "cost_basis",
        "margin",
        "markup",
        "accountGroup",
        "account_group",
        "partnerAccountId",
        "partner_account_id",
        "approvalEvidence",
        "notesInternal",
        "notes_internal",
        "internalEvidence",
        "internal_evidence",
        "approverUserId",
        "rawToken",
        "raw_token",
        "watts",
        "spahn",
        "spahnAndRose",
        "materialUseTax",
        "useTax",
        "taxAmount"
      ];
      if (forbiddenKeys.includes(k)) {
        throw new Error(`forbidden public configuration key at ${path}.${k}`);
      }
      assertPublicConfigurationHasNoForbiddenContent(v, `${path}.${k}`);
    }
  }
}
