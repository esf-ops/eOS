/**
 * DE.2C — public allowlist serializer for configuration calculation results.
 */

import { centsToDollars } from "./money.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";

export const PUBLIC_CALCULATION_DTO_KEYS = Object.freeze([
  "estimateIdentity",
  "pricingValidThrough",
  "baselineDisplayTotal",
  "configuredDisplayTotal",
  "displayTotalDelta",
  "rooms",
  "options",
  "customFacingLines",
  "reviewRequiredMessages",
  "disclaimers"
]);

/**
 * @param {{
 *   estimateIdentity: { publicationId: string, envelopeId: string },
 *   pricingValidThrough?: string|null,
 *   baselineDisplayTotalCents: number|null,
 *   configuredDisplayTotalCents: number,
 *   displayTotalDeltaCents: number|null,
 *   rooms: Array<Record<string, unknown>>,
 *   options: Array<Record<string, unknown>>,
 *   customFacingLines: Array<Record<string, unknown>>,
 *   reviewRequiredMessages?: string[],
 *   disclaimers?: string[]
 * }} args
 */
export function toPublicConfigurationCalculationDto(args) {
  const dto = {
    estimateIdentity: {
      publicationId: args.estimateIdentity.publicationId,
      envelopeId: args.estimateIdentity.envelopeId
    },
    pricingValidThrough: args.pricingValidThrough ?? null,
    baselineDisplayTotal:
      args.baselineDisplayTotalCents != null
        ? centsToDollars(args.baselineDisplayTotalCents)
        : null,
    configuredDisplayTotal: centsToDollars(args.configuredDisplayTotalCents),
    displayTotalDelta:
      args.displayTotalDeltaCents != null ? centsToDollars(args.displayTotalDeltaCents) : null,
    rooms: (args.rooms || []).map((r) => ({
      roomKey: r.roomKey,
      displayName: r.displayName,
      selectedMaterialLabel: r.selectedMaterialLabel,
      chargeableCounterSf: r.chargeableCounterSf
    })),
    options: args.options || [],
    customFacingLines: args.customFacingLines || [],
    reviewRequiredMessages: args.reviewRequiredMessages || [],
    disclaimers: args.disclaimers || []
  };

  // Strip any accidental keys
  for (const k of Object.keys(dto)) {
    if (!PUBLIC_CALCULATION_DTO_KEYS.includes(k)) delete dto[k];
  }

  assertPublicConfigurationHasNoForbiddenContent(dto);
  return dto;
}
