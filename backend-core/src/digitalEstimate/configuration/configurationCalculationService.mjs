/**
 * DE.2C — calculate + persist immutable configuration calculation snapshots.
 */

import {
  calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./currentConfigDeltaEngine.mjs";

function err(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

/**
 * @param {{
 *   organizationId: string,
 *   repository: {
 *     getCalculationByInputFingerprint?: Function,
 *     insertCalculation?: Function,
 *     getCalculation?: Function
 *   },
 *   selectionId?: string|null,
 *   trustedInput: Record<string, unknown>,
 *   idempotencyKey?: string|null
 * }} args
 */
export async function calculateAndPersistConfigurationDelta(args) {
  const { organizationId, repository, selectionId = null, trustedInput, idempotencyKey = null } = args;
  if (!organizationId) throw err("missing_organization", "organizationId required");
  if (!repository) throw err("missing_repository", "repository required");

  const result = calculateElite100ConfigDelta({
    ...trustedInput,
    organizationId,
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
    idempotencyKey: idempotencyKey || trustedInput.idempotencyKey || null
  });

  if (typeof repository.getCalculationByInputFingerprint === "function") {
    const existing = await repository.getCalculationByInputFingerprint(
      organizationId,
      result.inputFingerprint,
      { idempotencyKey: idempotencyKey || null, selectionId }
    );
    if (existing) {
      return {
        reused: true,
        calculation: existing,
        result: {
          ...result,
          public: existing.customer_result_json,
          internal: existing.internal_evidence_json
        }
      };
    }
  }

  if (typeof repository.insertCalculation !== "function") {
    return { reused: false, calculation: null, result };
  }

  if (!selectionId) {
    // Allow pure compute without persistence when no selection row
    return { reused: false, calculation: null, result };
  }

  const saved = await repository.insertCalculation(organizationId, {
    selectionId,
    customerResultJson: result.public,
    internalEvidenceJson: result.internal,
    baselineTotal: result.totals.baselineExactTotal,
    configuredTotal: result.totals.configuredExactTotal,
    pricingValidThrough: trustedInput.pricingValidThrough ?? null,
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
    calculationInputFingerprint: result.inputFingerprint,
    calculationFingerprint: result.calculationFingerprint,
    idempotencyKey: idempotencyKey || null
  });

  return { reused: false, calculation: saved, result };
}
