/**
 * Quote Library ↔ Studio read-model bridge.
 * Labels Studio vs Legacy. Does not fabricate quote_headers for Studio.
 * Studio remains calculation/revision authority.
 */

import { buildAllEstimatesRow } from "./studioAllEstimatesService.mjs";
import { deriveStudioLifecycleStatus, studioLifecycleStatusLabel } from "./studioLifecycleTypes.mjs";

/**
 * Map a Studio All Estimates row into a Quote Library–compatible list row.
 * Safe lifecycle fields only — no internal economics.
 */
export function studioEstimateToQuoteLibraryBridgeRow(allEstimatesRow) {
  const r = allEstimatesRow || {};
  return {
    id: `studio:${r.estimateId}`,
    source: "studio_estimate",
    source_label: "Studio Estimate",
    lineage: "studio",
    quote_number: r.quoteNumber || null,
    quote_source: "elite100_studio",
    quote_status: mapLifecycleToQuoteStatusDisplay(r.lifecycleStatus),
    account_name: r.customerName || null,
    customer_name: r.customerName || null,
    project_name: r.projectName || null,
    grand_total: r.customerTotal,
    customer_display_total: r.customerTotal,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    estimate_family_id: r.estimateFamilyId || r.intakeCaseId,
    estimate_id: r.estimateId,
    intake_case_id: r.intakeCaseId,
    revision: r.revision,
    lifecycle_status: r.lifecycleStatus,
    lifecycle_status_label: r.lifecycleStatusLabel || studioLifecycleStatusLabel(r.lifecycleStatus),
    publication_status: r.publicationStatus,
    acceptance_status: r.acceptanceStatus,
    sold_status: r.soldStatus,
    archived: Boolean(r.archived),
    open_action: {
      key: "open_estimate_studio",
      label: "Open in Estimate Studio",
      href: `/elite100-estimate-studio?case=${encodeURIComponent(r.intakeCaseId || "")}`,
      intakeCaseId: r.intakeCaseId,
      estimateId: r.estimateId
    },
    // Explicitly omit exactInternalTotal / handoff docs
    handoff_status: "none",
    moraware_doc_status: "none",
    quickbooks_doc_status: "none",
    is_studio_bridge: true
  };
}

function mapLifecycleToQuoteStatusDisplay(lifecycleStatus) {
  switch (String(lifecycleStatus || "")) {
    case "sold":
      return "sold";
    case "accepted_awaiting_sold_review":
      return "accepted";
    case "published":
    case "changes_requested":
      return "sent";
    case "archived":
      return "archived";
    default:
      return "open";
  }
}

/**
 * Tag a legacy Quote Library list row.
 */
export function tagLegacyQuoteLibraryRow(row) {
  return {
    ...row,
    source: "legacy_quote",
    source_label: "Legacy Quote",
    lineage: "legacy",
    is_studio_bridge: false,
    open_action: {
      key: "open_legacy_quote",
      label: "Open quote",
      quoteId: row.id
    }
  };
}

/**
 * Merge legacy + Studio rows for discovery. Studio rows never invent quote_headers.
 * @param {object[]} legacyRows
 * @param {object[]} studioAllEstimatesRows
 * @param {{ includeStudio?: boolean, studioOnly?: boolean }} [opts]
 */
export function mergeQuoteLibraryWithStudioBridge(
  legacyRows,
  studioAllEstimatesRows,
  opts = {}
) {
  const includeStudio = opts.includeStudio !== false;
  const studioOnly = opts.studioOnly === true;
  const legacyTagged = studioOnly
    ? []
    : (legacyRows || []).map((r) => tagLegacyQuoteLibraryRow(r));
  const studioTagged = includeStudio
    ? (studioAllEstimatesRows || []).map((r) =>
        studioEstimateToQuoteLibraryBridgeRow(
          r.source === "studio_estimate" ? r : buildAllEstimatesRow(r)
        )
      )
    : [];

  const merged = [...legacyTagged, ...studioTagged];
  merged.sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(
      String(a.updated_at || a.created_at || "")
    )
  );
  return merged;
}

/**
 * Build Studio bridge rows from estimates + lifecycle overlays.
 */
export function buildStudioBridgeRowsFromEstimates(estimates, overlaysByEstimateId = {}) {
  return (estimates || []).map((estimate) => {
    const overlay = overlaysByEstimateId[estimate.id] || {};
    const lifecycleStatus =
      estimate.lifecycleStatus ||
      deriveStudioLifecycleStatus({
        estimateStatus: estimate.status,
        hasActivePublication: overlay.hasActivePublication,
        hasOpenReviewRequest: overlay.hasOpenReviewRequest,
        hasAcceptance: Boolean(overlay.acceptance),
        hasSoldSnapshot: Boolean(overlay.soldSnapshot),
        archived: Boolean(estimate.archivedAt)
      });
    const row = buildAllEstimatesRow(estimate, {
      ...overlay,
      hasAcceptance: Boolean(overlay.acceptance),
      hasSoldSnapshot: Boolean(overlay.soldSnapshot)
    });
    row.lifecycleStatus = lifecycleStatus;
    row.lifecycleStatusLabel = studioLifecycleStatusLabel(lifecycleStatus);
    return studioEstimateToQuoteLibraryBridgeRow(row);
  });
}
