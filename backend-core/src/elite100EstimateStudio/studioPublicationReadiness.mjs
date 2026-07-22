/**
 * Unified Studio Digital Estimate readiness DTO.
 * Separates calculation / approval / publication-configuration / publication status
 * so the UI never shows contradictory Approve + Approved messages for one calculation.
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { hashConfigurationEnvelope } from "./studioEstimatePublicationAdapter.mjs";

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

const PRICING_BLOCKER_CODES = new Set([
  "estimate_not_approved",
  "estimate_stale",
  "calculation_fingerprint_mismatch",
  "approved_snapshot_missing",
  "pricing_engine_missing",
  "takeoff_not_approved",
  "estimate_superseded",
  "memory_only_estimate"
]);

const PUBLICATION_CONFIG_BLOCKER_CODES = new Set([
  "invalid_pricing_valid_through",
  "unknown_catalog_option",
  "unsupported_customer_option",
  "customer_name_required",
  "project_name_required",
  "rooms_required",
  "unresolved_commercial_item"
]);

/**
 * @param {Array<{ code?: string }>} blockers
 * @param {Set<string>} codes
 */
function filterBlockers(blockers, codes) {
  return (blockers || []).filter((b) => codes.has(String(b?.code || "")));
}

/**
 * Build the four-group readiness contract from an existing flat readiness result.
 *
 * @param {{
 *   estimate: object,
 *   readiness: object,
 *   configuration?: object|null,
 *   publishedConfiguration?: object|null,
 *   activePublication?: object|null
 * }} args
 */
export function buildStudioPublicationReadinessDto(args) {
  const estimate = args.estimate || {};
  const readiness = args.readiness || {};
  const blockers = Array.isArray(readiness.blockingReasons)
    ? readiness.blockingReasons
    : Array.isArray(readiness.blockers)
      ? readiness.blockers
      : [];
  const configuration = args.configuration || null;
  const publishedConfiguration = args.publishedConfiguration || null;
  const activePublication = args.activePublication || null;

  const calcFp =
    str(estimate.calculationFingerprint) ||
    str(estimate.calculationSnapshot?.fingerprint) ||
    str(estimate.calculation?.fingerprint) ||
    null;
  const approvalFp = str(estimate.approval?.calculationFingerprint) || null;
  const approvedAt = estimate.approval?.approvedAt || null;
  const status = str(estimate.status).toLowerCase();
  const isApproved = status === STUDIO_ESTIMATE_STATUSES.APPROVED || Boolean(approvedAt);
  const fingerprintMatch = Boolean(approvalFp && calcFp && approvalFp === calcFp);

  /** @type {"not_calculated"|"calculated_current"|"calculated_stale"} */
  let calculationStatus = "not_calculated";
  if (calcFp) {
    calculationStatus =
      isApproved && fingerprintMatch ? "calculated_current" : fingerprintMatch || !isApproved
        ? "calculated_current"
        : "calculated_stale";
  }
  if (isApproved && calcFp && !fingerprintMatch) {
    calculationStatus = "calculated_stale";
  }
  if (!calcFp && (estimate.calculationSnapshot || estimate.calculation)) {
    calculationStatus = "calculated_current";
  }

  /** @type {"not_approved"|"approved_current"|"approved_stale"} */
  let approvalStatus = "not_approved";
  if (isApproved) {
    approvalStatus = fingerprintMatch ? "approved_current" : "approved_stale";
  }

  const currentEnvelopeFp = configuration
    ? hashConfigurationEnvelope(configuration)
    : null;
  const publishedEnvelopeFp = publishedConfiguration?.envelopeFingerprint
    ? String(publishedConfiguration.envelopeFingerprint)
    : null;
  const configBlockers = filterBlockers(blockers, PUBLICATION_CONFIG_BLOCKER_CODES);
  const configurationDirty =
    Boolean(currentEnvelopeFp) &&
    Boolean(publishedEnvelopeFp) &&
    currentEnvelopeFp !== publishedEnvelopeFp;
  // No prior published config + local configuration present → treat as unsaved when
  // estimator has opened the panel with draft settings (UI hydrates published flags).
  const hasLocalConfig = Boolean(
    configuration &&
      (configuration.pricingValidThrough ||
        (Array.isArray(configuration.customerChoiceGroups) &&
          configuration.customerChoiceGroups.length) ||
        (Array.isArray(configuration.allowedOptionKeys) &&
          configuration.allowedOptionKeys.length))
  );
  /** @type {"saved_valid"|"unsaved"|"invalid"} */
  let publicationConfigurationStatus = "saved_valid";
  if (configBlockers.length) {
    publicationConfigurationStatus = "invalid";
  } else if (configurationDirty || (hasLocalConfig && !publishedEnvelopeFp && !activePublication)) {
    // Only mark unsaved when fingerprints diverge, or there is no publication yet
    // and the UI is editing draft settings. Permission-only edits after publish
    // set configurationDirty via envelope fingerprint.
    publicationConfigurationStatus = configurationDirty ? "unsaved" : "saved_valid";
  } else if (configurationDirty) {
    publicationConfigurationStatus = "unsaved";
  }

  const pricingBlockers = filterBlockers(blockers, PRICING_BLOCKER_CODES);
  const pricingReady =
    calculationStatus === "calculated_current" &&
    approvalStatus === "approved_current" &&
    pricingBlockers.length === 0;

  /** @type {"not_published"|"ready_to_publish"|"published_current"|"published_stale"|"blocked"} */
  let publicationStatus = "not_published";
  const pubOk =
    activePublication &&
    String(activePublication.status || "").toLowerCase() === "active" &&
    !activePublication.revokedAt &&
    !activePublication.revoked_at;
  if (!pricingReady || publicationConfigurationStatus === "invalid") {
    publicationStatus = "blocked";
  } else if (publicationConfigurationStatus === "unsaved") {
    publicationStatus = pubOk ? "published_stale" : "blocked";
  } else if (pricingReady && publicationConfigurationStatus === "saved_valid") {
    publicationStatus = pubOk ? "published_current" : "ready_to_publish";
  }

  const availableActions = [];
  if (calculationStatus === "not_calculated" || calculationStatus === "calculated_stale") {
    availableActions.push("calculate_estimate");
  }
  if (
    calculationStatus === "calculated_current" &&
    (approvalStatus === "not_approved" || approvalStatus === "approved_stale")
  ) {
    availableActions.push("approve_estimate");
  }
  if (
    publicationConfigurationStatus === "unsaved" &&
    publicationConfigurationStatus !== "invalid"
  ) {
    availableActions.push("save_publication_settings");
  }
  if (publicationStatus === "ready_to_publish" || publicationStatus === "published_stale") {
    if (publicationConfigurationStatus === "saved_valid" && pricingReady) {
      availableActions.push("publish_digital_estimate");
    }
  }
  if (publicationStatus === "ready_to_publish" && pricingReady) {
    if (!availableActions.includes("publish_digital_estimate")) {
      availableActions.push("publish_digital_estimate");
    }
  }

  const primaryMessage = resolvePrimaryReadinessMessage({
    calculationStatus,
    approvalStatus,
    publicationConfigurationStatus,
    publicationStatus,
    pricingBlockers,
    configBlockers
  });

  return {
    pricing: {
      calculationStatus,
      approvalStatus,
      approvedCalculationFingerprint: approvalFp,
      currentCalculationFingerprint: calcFp,
      approvedAt,
      approvedTotalCents:
        estimate.approval?.customerDisplayTotal != null
          ? Math.round(Number(estimate.approval.customerDisplayTotal) * 100)
          : null,
      blockingReasons: pricingBlockers
    },
    publicationConfiguration: {
      status: publicationConfigurationStatus,
      savedVersion: publishedEnvelopeFp,
      currentVersion: currentEnvelopeFp,
      configurationDirty,
      valid: publicationConfigurationStatus !== "invalid",
      blockingReasons: configBlockers
    },
    publication: {
      status: publicationStatus,
      ready:
        publicationStatus === "ready_to_publish" ||
        (publicationStatus === "published_current" && pricingReady),
      activePublication: activePublication
        ? {
            id: activePublication.id || activePublication.publicationId || null,
            status: activePublication.status || null,
            publishedAt: activePublication.publishedAt || activePublication.published_at || null
          }
        : null,
      blockingReasons: blockers.filter(
        (b) =>
          !PRICING_BLOCKER_CODES.has(String(b?.code || "")) &&
          !PUBLICATION_CONFIG_BLOCKER_CODES.has(String(b?.code || ""))
      ),
      availableActions
    },
    primaryMessage,
    // Flat eligible kept for backward compatibility consumers.
    eligible: Boolean(readiness.eligible) && publicationStatus !== "blocked"
  };
}

/**
 * @param {{
 *   calculationStatus: string,
 *   approvalStatus: string,
 *   publicationConfigurationStatus: string,
 *   publicationStatus: string,
 *   pricingBlockers: object[],
 *   configBlockers: object[]
 * }} s
 */
export function resolvePrimaryReadinessMessage(s) {
  if (s.approvalStatus === "approved_stale" || s.calculationStatus === "calculated_stale") {
    return {
      code: "pricing_stale",
      message: "The estimate changed after approval. Recalculate and approve it again."
    };
  }
  if (s.approvalStatus === "not_approved") {
    if (s.calculationStatus === "not_calculated") {
      return {
        code: "not_calculated",
        message: "Calculate the estimate before approving and publishing."
      };
    }
    return {
      code: "not_approved",
      message: "Approve the calculated estimate before publishing."
    };
  }
  if (s.publicationConfigurationStatus === "invalid") {
    const first = s.configBlockers[0];
    return {
      code: first?.code || "publication_config_invalid",
      message:
        first?.message || "Resolve the publication-setting issues before publishing."
    };
  }
  if (s.publicationConfigurationStatus === "unsaved") {
    return {
      code: "publication_settings_unsaved",
      message: "Estimate approved. Save publication settings before publishing."
    };
  }
  if (s.approvalStatus === "approved_current") {
    if (s.publicationStatus === "ready_to_publish" || s.publicationStatus === "published_current") {
      return {
        code: "ready",
        message: "Estimate approved. Ready to publish the Digital Estimate."
      };
    }
  }
  const pricingFirst = s.pricingBlockers[0];
  if (pricingFirst?.message) {
    return { code: pricingFirst.code || "blocked", message: pricingFirst.message };
  }
  return {
    code: "blocked",
    message: "Resolve the remaining blockers before publishing."
  };
}

/**
 * Codes that indicate a price-bearing change (stale calculation/approval).
 * Permission-only / presentation settings must NOT be in this set.
 */
export const PRICE_BEARING_SCOPE_FIELDS = Object.freeze([
  "rooms",
  "pieces",
  "countertopSqft",
  "backsplashSqft",
  "edgeLinearFeet",
  "edgeProfileToken",
  "edgeMode",
  "pricingBasis",
  "materialGroup",
  "colorName",
  "addOns",
  "customLineItems",
  "edgeScopeAdjustment",
  "physicalScopeSource"
]);

/**
 * Publication-configuration-only fields (do not stale approval).
 */
export const PUBLICATION_ONLY_FIELDS = Object.freeze([
  "customerCatalogPermissions",
  "pricingValidThrough",
  "roomLocks",
  "customerChoiceGroups",
  "allowedOptionKeys",
  "estimatorNotes"
]);
