/**
 * Quote Library customer-config projection contract (prepare-only).
 * Status is always "Customer configuring" while the customer is actively selecting.
 * Wire into dashboards later — builder attaches to calculation meta after save.
 */

export const QUOTE_LIBRARY_CUSTOMER_CONFIG_STATUS = "Customer configuring";

/**
 * @typedef {Object} QuoteLibraryMeaningfulOptionChange
 * @property {string} optionKey
 * @property {string} [displayLabel]
 * @property {number} quantity
 * @property {string} [kind]
 * @property {string} [roomKey]
 */

/**
 * @typedef {Object} QuoteLibraryCustomerConfigProjection
 * @property {number|null} configuredTotal
 * @property {number|null} deltaFromPublished
 * @property {string|null} lastCustomerActivityAt
 * @property {string|null} selectedMaterialGroup
 * @property {QuoteLibraryMeaningfulOptionChange[]} meaningfulOptionChanges
 * @property {number} missingInformationCount
 * @property {'Customer configuring'} status
 */

/**
 * @param {{
 *   configuredTotal?: number|null,
 *   baselineTotal?: number|null,
 *   deltaFromPublished?: number|null,
 *   lastCustomerActivityAt?: string|null,
 *   selectedMaterialGroup?: string|null,
 *   roomMaterialGroups?: Record<string, string>|null,
 *   selectionQuantities?: Record<string, number>|null,
 *   optionLabels?: Record<string, string>|null,
 *   missingInformationRequirements?: Array<{ code?: string }>|null,
 *   now?: string|Date
 * }} input
 * @returns {QuoteLibraryCustomerConfigProjection}
 */
export function buildQuoteLibraryCustomerConfigProjection(input = {}) {
  const configuredTotal =
    input.configuredTotal != null && Number.isFinite(Number(input.configuredTotal))
      ? Number(input.configuredTotal)
      : null;
  const baselineTotal =
    input.baselineTotal != null && Number.isFinite(Number(input.baselineTotal))
      ? Number(input.baselineTotal)
      : null;
  const deltaFromPublished =
    input.deltaFromPublished != null && Number.isFinite(Number(input.deltaFromPublished))
      ? Number(input.deltaFromPublished)
      : configuredTotal != null && baselineTotal != null
        ? configuredTotal - baselineTotal
        : null;

  const quantities =
    input.selectionQuantities && typeof input.selectionQuantities === "object"
      ? input.selectionQuantities
      : {};
  const labels =
    input.optionLabels && typeof input.optionLabels === "object" ? input.optionLabels : {};

  /** @type {QuoteLibraryMeaningfulOptionChange[]} */
  const meaningfulOptionChanges = [];
  for (const [optionKey, qtyRaw] of Object.entries(quantities)) {
    const quantity = Number(qtyRaw) || 0;
    if (quantity <= 0) continue;
    if (String(optionKey).startsWith("__")) continue;
    const parts = String(optionKey).split(":");
    const kind = parts[0] || null;
    const roomKey = parts.length > 1 ? parts[1] : null;
    // Skip default-ish none/eased baselines from "meaningful" noise when qty is baseline-like
    const mode = parts[2];
    if (
      (kind === "sink" || kind === "faucet" || kind === "backsplash") &&
      mode === "none"
    ) {
      continue;
    }
    if (kind === "edge" && (mode === "eased" || mode === "included")) continue;
    if (kind === "sidesplash" && parts[parts.length - 1] === "none") continue;

    meaningfulOptionChanges.push({
      optionKey,
      displayLabel: labels[optionKey] || optionKey,
      quantity,
      kind,
      roomKey
    });
  }

  let selectedMaterialGroup = input.selectedMaterialGroup || null;
  if (!selectedMaterialGroup && input.roomMaterialGroups) {
    const groups = Object.values(input.roomMaterialGroups).filter(Boolean);
    selectedMaterialGroup = groups[0] || null;
  }

  const missingInformationCount = Array.isArray(input.missingInformationRequirements)
    ? input.missingInformationRequirements.length
    : 0;

  const lastCustomerActivityAt =
    input.lastCustomerActivityAt != null
      ? String(input.lastCustomerActivityAt)
      : input.now
        ? new Date(input.now).toISOString()
        : new Date().toISOString();

  return {
    configuredTotal,
    deltaFromPublished,
    lastCustomerActivityAt,
    selectedMaterialGroup,
    meaningfulOptionChanges,
    missingInformationCount,
    status: QUOTE_LIBRARY_CUSTOMER_CONFIG_STATUS
  };
}
