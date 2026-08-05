/**
 * Quote Flow Activity — customer Digital Estimate selections (read-only).
 * Reuses Studio V2 `buildStudioCustomerSelectionReview` + DE roomPricingChanges.
 * Does not accept, mark sold, create jobs, or recalculate pricing.
 */

import {
  buildEmptyCustomerSelectionReview,
  buildStudioCustomerSelectionReview,
  scrubSelectionReviewDto
} from "../elite100EstimateStudio/studioCustomerSelectionReview.mjs";
import { isOpenDigitalEstimateReviewRequestStatus } from "../digitalEstimate/configuration/amendmentConfig.mjs";

/**
 * @param {object|null|undefined} selectionReview
 * @param {{
 *   hasView?: boolean,
 *   hasLink?: boolean,
 *   publicationEventsTracked?: boolean
 * }} [ctx]
 * @returns {{ key: string, label: string, detail: string|null, needsStaffReview: boolean }}
 */
export function mapQuoteFlowCustomerSelectionStatus(selectionReview, ctx = {}) {
  const review = selectionReview && typeof selectionReview === "object" ? selectionReview : null;
  const saved = Boolean(review?.hasSavedSelections);
  const submitted = Boolean(review?.reviewRequested || review?.selectionOnlySubmitted);
  const changeCount = Number(review?.pricedSelections?.selectionChangeCount) || 0;
  const comparisonRows = Array.isArray(review?.selectionComparison?.rows)
    ? review.selectionComparison.rows
    : [];
  const difference =
    review?.totals?.difference != null && Number.isFinite(Number(review.totals.difference))
      ? Number(review.totals.difference)
      : null;
  const differs =
    changeCount > 0 ||
    comparisonRows.length > 0 ||
    (difference != null && Math.abs(difference) >= 0.005) ||
    Boolean(review?.requiresEliteReview) ||
    Number(review?.scopeRequests?.count) > 0;

  if (submitted && differs) {
    return {
      key: "needs_staff_review",
      label: "Customer changes need staff review",
      detail: "Customer submitted Digital Estimate selections that differ from the published estimate.",
      needsStaffReview: true
    };
  }
  if (submitted) {
    return {
      key: "selections_submitted",
      label: "Customer selections submitted",
      detail: "Customer submitted selections for staff review.",
      needsStaffReview: Boolean(differs)
    };
  }
  if (saved && differs) {
    return {
      key: "needs_staff_review",
      label: "Customer changes need staff review",
      detail: "Customer saved Digital Estimate selections that differ from the published estimate.",
      needsStaffReview: true
    };
  }
  if (saved) {
    return {
      key: "selections_saved",
      label: "Customer selections saved",
      detail: review?.lastSavedAt
        ? `Last saved ${review.lastSavedAt}`
        : "From Digital Estimate configuration activity.",
      needsStaffReview: false
    };
  }
  if (ctx.hasView) {
    return {
      key: "link_opened",
      label: "Customer opened link, no changes yet",
      detail: "Customer opened the Digital Estimate link but has not saved selection changes.",
      needsStaffReview: false
    };
  }
  if (!ctx.hasLink) {
    return {
      key: "not_published",
      label: "Not tracked yet",
      detail: "Publish a Digital Estimate to track customer activity.",
      needsStaffReview: false
    };
  }
  if (!ctx.publicationEventsTracked && !saved) {
    return {
      key: "none",
      label: "No customer selections yet",
      detail: "No saved customer selections for this publication.",
      needsStaffReview: false
    };
  }
  return {
    key: "not_tracked",
    label: "Not tracked yet",
    detail: "No customer view or selection events are available for this publication.",
    needsStaffReview: false
  };
}

/**
 * Load staff-safe selection review for an official Quote Flow estimate publication.
 * Mirrors Studio V2 `loadCustomerSelectionReview` — read-only, no mutations.
 *
 * @param {{
 *   organizationId: string,
 *   estimate: object,
 *   activePublication?: object|null,
 *   reviewRequests?: object[],
 *   configurationRepository?: object|null,
 *   configurationStudioService?: object|null
 * }} input
 */
export async function loadQuoteFlowCustomerSelectionReview(input = {}) {
  const organizationId = input.organizationId;
  const estimate = input.estimate;
  const activePublication = input.activePublication || null;
  const reviewRequests = Array.isArray(input.reviewRequests) ? input.reviewRequests : [];
  const configurationRepository = input.configurationRepository || null;
  const configurationStudioService = input.configurationStudioService || null;

  const reviewRequested = reviewRequests.some((r) =>
    isOpenDigitalEstimateReviewRequestStatus(r?.status)
  );

  const publicationId =
    activePublication?.publicationId ||
    activePublication?.id ||
    estimate?.scope?.quoteFlowDigitalEstimate?.publicationId ||
    null;

  const empty = buildEmptyCustomerSelectionReview({
    publicationId,
    envelopeId: null
  });
  empty.reviewRequested = Boolean(reviewRequested);

  if (!publicationId) {
    return scrubSelectionReviewDto(empty);
  }

  if (
    !configurationRepository ||
    typeof configurationRepository.getLatestSelectionForPublicationEnvelope !== "function"
  ) {
    empty.staffDiagnostics = [
      {
        code: "configuration_stack_unavailable",
        message: "Configuration stack unavailable — cannot load saved customer selections."
      }
    ];
    return scrubSelectionReviewDto(empty);
  }

  let envelopeId = null;
  try {
    if (
      configurationStudioService &&
      typeof configurationStudioService.listEnvelopes === "function"
    ) {
      const envelopes = await configurationStudioService.listEnvelopes(
        organizationId,
        publicationId
      );
      const active = (envelopes || []).find((e) => String(e.status || "") === "active");
      envelopeId = active?.id || null;
    } else if (typeof configurationRepository.getActiveEnvelope === "function") {
      const active = await configurationRepository.getActiveEnvelope(
        organizationId,
        publicationId
      );
      envelopeId = active?.id || null;
    }
  } catch {
    envelopeId = null;
  }

  if (!envelopeId) {
    empty.publicationId = publicationId;
    return scrubSelectionReviewDto(empty);
  }

  let selection = null;
  let calculation = null;
  try {
    selection = await configurationRepository.getLatestSelectionForPublicationEnvelope(
      organizationId,
      publicationId,
      envelopeId
    );
    if (
      selection?.id &&
      typeof configurationRepository.getCalculationBySelectionId === "function"
    ) {
      calculation = await configurationRepository.getCalculationBySelectionId(
        organizationId,
        selection.id
      );
    }
  } catch {
    empty.publicationId = publicationId;
    empty.envelopeId = envelopeId;
    empty.staffDiagnostics = [
      {
        code: "selection_load_failed",
        message: "Unable to load saved customer selections for this publication."
      }
    ];
    return scrubSelectionReviewDto(empty);
  }

  const scopeRooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
  return buildStudioCustomerSelectionReview({
    selection,
    calculation,
    rooms: scopeRooms,
    publicationId,
    envelopeId,
    reviewRequested
  });
}
