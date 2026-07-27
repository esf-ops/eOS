/**
 * Safe internal read model for future All Estimates / Quote Library consumers.
 * Does not write quote_headers. Studio remains authority for Studio estimates.
 */

import { normalizeStudioCommercialLines, commercialRoleIsPublicNamed } from "./studioCommercialLines.mjs";
import { resolveRoomMaterialGroup } from "./studioMaterialInheritance.mjs";
import { studioEstimateQuoteNumber } from "./studioEstimatePublicationAdapter.mjs";

/**
 * @param {object} estimate
 * @returns {object}
 */
export function buildStudioEstimatingParityReadModel(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calc = estimate?.calculationSnapshot || estimate?.calculation || null;
  const lines = normalizeStudioCommercialLines(scope);
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const materialSummary = rooms
    .filter((r) => r && r.included !== false)
    .map((r) => {
      const mat = resolveRoomMaterialGroup(scope, r);
      return {
        roomId: r.id,
        roomName: r.name || null,
        materialGroup: mat.group,
        materialSource: mat.source
      };
    });

  return {
    estimateId: estimate?.id || null,
    estimateFamilyId: estimate?.intakeCaseId || null,
    intakeCaseId: estimate?.intakeCaseId || null,
    revision: Number(estimate?.revision) || 1,
    status: estimate?.status || null,
    quoteNumber: studioEstimateQuoteNumber(estimate),
    accountDirectoryAccountId: estimate?.accountDirectoryAccountId || scope.accountDirectoryAccountId || null,
    customerName: scope.customerName || null,
    projectName: scope.projectName || null,
    customerTotal: calc?.totals?.customerDisplayTotal ?? null,
    exactInternalTotal: calc?.totals?.exactInternalTotal ?? null,
    materialSummary,
    customLineSummary: {
      totalLines: lines.length,
      publicNamedCount: lines.filter((l) => commercialRoleIsPublicNamed(l.commercialRole)).length,
      internalOnlyCount: lines.filter((l) => l.commercialRole === "internal_only").length,
      absorbedCount: lines.filter((l) => l.commercialRole === "absorbed").length
    },
    publicationState: estimate?.publicationSummary?.status || estimate?.publicationStatus || null,
    calculatedAt: calc?.calculatedAt || null,
    approvedAt: estimate?.approvedAt || estimate?.approval?.approvedAt || null,
    calculationFingerprint: calc?.fingerprint || estimate?.calculationFingerprint || null,
    pricingVersion: calc?.pricingVersion ?? estimate?.pricingVersion ?? null,
    commercialLineModelVersion: calc?.commercialLineModelVersion || null
  };
}
