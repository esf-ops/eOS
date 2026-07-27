/**
 * All Estimates — Studio-backed historical/operational registry read model.
 * Command Center remains the action queue. Does not write quote_headers.
 */

import { buildStudioEstimatingParityReadModel } from "./studioEstimatingParityReadModel.mjs";
import {
  deriveStudioLifecycleStatus,
  studioLifecycleStatusLabel,
  STUDIO_LIFECYCLE_STATUSES
} from "./studioLifecycleTypes.mjs";

/** Filter aliases used by All Estimates UI / API. */
export const ALL_ESTIMATES_FILTERS = Object.freeze({
  draft: "draft",
  needs_scope: "needs_scope",
  needs_pricing: "needs_pricing",
  needs_approval: "needs_approval",
  published: "published",
  changes_requested: "changes_requested",
  accepted_awaiting_sold_review: "accepted_awaiting_sold_review",
  sold: "sold",
  archived: "archived"
});

/**
 * @param {object} estimate
 * @param {{
 *   hasActivePublication?: boolean,
 *   hasOpenReviewRequest?: boolean,
 *   hasAcceptance?: boolean,
 *   hasSoldSnapshot?: boolean,
 *   acceptance?: object|null,
 *   soldSnapshot?: object|null,
 *   publicationStatus?: string|null,
 *   takeoffStatus?: string|null,
 *   reviewRequestStatus?: string|null
 * }} [overlay]
 */
export function buildAllEstimatesRow(estimate, overlay = {}) {
  const parity = buildStudioEstimatingParityReadModel(estimate);
  const archived = Boolean(estimate?.archivedAt || estimate?.archived_at || overlay.archived);
  const lifecycleStatus =
    estimate?.lifecycleStatus ||
    estimate?.lifecycle_status ||
    deriveStudioLifecycleStatus({
      estimateStatus: estimate?.status,
      manualScopeConfirmed: Boolean(estimate?.scope?.manualPhysicalScope?.confirmedAt),
      hasActivePublication: Boolean(overlay.hasActivePublication),
      hasOpenReviewRequest: Boolean(overlay.hasOpenReviewRequest),
      hasAcceptance: Boolean(overlay.hasAcceptance || overlay.acceptance),
      hasSoldSnapshot: Boolean(overlay.hasSoldSnapshot || overlay.soldSnapshot),
      archived
    });

  return {
    source: "studio_estimate",
    sourceLabel: "Studio Estimate",
    estimateId: parity.estimateId,
    estimateFamilyId: parity.estimateFamilyId || parity.intakeCaseId,
    intakeCaseId: parity.intakeCaseId,
    revision: parity.revision,
    quoteNumber: parity.quoteNumber,
    customerName: parity.customerName,
    projectName: parity.projectName,
    accountDirectoryAccountId: parity.accountDirectoryAccountId,
    salespersonUserId: estimate?.createdByUserId || estimate?.updatedByUserId || null,
    customerTotal: parity.customerTotal,
    commercialStatus: parity.status,
    lifecycleStatus,
    lifecycleStatusLabel: studioLifecycleStatusLabel(lifecycleStatus),
    takeoffStatus: overlay.takeoffStatus || estimate?.takeoffStatus || null,
    commercialApprovalStatus:
      estimate?.status === "approved"
        ? "approved"
        : estimate?.status === "priced"
          ? "needs_approval"
          : estimate?.status || null,
    publicationStatus:
      overlay.publicationStatus || parity.publicationState || (overlay.hasActivePublication ? "active" : "never_published"),
    reviewRequestStatus: overlay.reviewRequestStatus || (overlay.hasOpenReviewRequest ? "open" : "none"),
    acceptanceStatus: overlay.acceptance || overlay.hasAcceptance ? "accepted" : "none",
    acceptedAt: overlay.acceptance?.accepted_at || overlay.acceptance?.acceptedAt || estimate?.acceptedAt || null,
    soldStatus: overlay.soldSnapshot || overlay.hasSoldSnapshot ? "sold" : "none",
    soldAt: overlay.soldSnapshot?.sold_at || overlay.soldSnapshot?.soldAt || estimate?.soldAt || null,
    archived,
    createdAt: estimate?.createdAt || null,
    updatedAt: estimate?.updatedAt || null,
    primaryAction: {
      key: "open",
      label: "Open",
      openTarget: "estimate-studio",
      intakeCaseId: parity.intakeCaseId,
      estimateId: parity.estimateId
    },
    // Staff-only fields omitted from Quote Library bridge
    exactInternalTotal: parity.exactInternalTotal,
    materialSummary: parity.materialSummary,
    customLineSummary: parity.customLineSummary
  };
}

/**
 * Map lifecycle / coarse filter to predicate.
 * @param {string} filter
 * @param {ReturnType<typeof buildAllEstimatesRow>} row
 */
export function allEstimatesRowMatchesFilter(filter, row) {
  const f = String(filter || "").trim().toLowerCase();
  if (!f || f === "all") return true;
  switch (f) {
    case ALL_ESTIMATES_FILTERS.draft:
      return row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.DRAFT;
    case ALL_ESTIMATES_FILTERS.needs_scope:
      return (
        row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.DRAFT ||
        (row.commercialStatus === "needs_takeoff_approval" ||
          row.commercialStatus === "draft")
      );
    case ALL_ESTIMATES_FILTERS.needs_pricing:
      return (
        row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.SCOPE_CONFIRMED ||
        row.commercialStatus === "ready_to_price"
      );
    case ALL_ESTIMATES_FILTERS.needs_approval:
      return (
        row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.CALCULATED ||
        row.commercialStatus === "priced"
      );
    case ALL_ESTIMATES_FILTERS.published:
      return row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.PUBLISHED;
    case ALL_ESTIMATES_FILTERS.changes_requested:
      return row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.CHANGES_REQUESTED;
    case ALL_ESTIMATES_FILTERS.accepted_awaiting_sold_review:
      return (
        row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.ACCEPTED_AWAITING_SOLD_REVIEW
      );
    case ALL_ESTIMATES_FILTERS.sold:
      return row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.SOLD;
    case ALL_ESTIMATES_FILTERS.archived:
      return row.lifecycleStatus === STUDIO_LIFECYCLE_STATUSES.ARCHIVED || row.archived;
    default:
      return row.lifecycleStatus === f;
  }
}

/**
 * @param {ReturnType<typeof buildAllEstimatesRow>} row
 * @param {string} search
 */
export function allEstimatesRowMatchesSearch(row, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.customerName,
    row.projectName,
    row.quoteNumber,
    row.intakeCaseId,
    row.estimateId,
    row.estimateFamilyId,
    row.lifecycleStatusLabel,
    row.accountDirectoryAccountId
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/**
 * @param {{
 *   studioEstimateRepository: any,
 *   lifecycleRepository?: any,
 *   resolvePublicationOverlay?: (orgId: string, estimate: object) => Promise<object>,
 * }} deps
 */
export function createStudioAllEstimatesService(deps) {
  const { studioEstimateRepository, lifecycleRepository } = deps;
  const resolvePublicationOverlay =
    deps.resolvePublicationOverlay || (async () => ({}));

  if (!studioEstimateRepository) throw new Error("studioEstimateRepository required");

  return {
    /**
     * List active (non-superseded) Studio estimates for an organization.
     */
    async listAllEstimates(organizationId, query = {}) {
      const org = String(organizationId || "").trim().toLowerCase();
      if (!org) {
        const err = new Error("Organization required");
        err.statusCode = 403;
        err.code = "organization_required";
        throw err;
      }

      let estimates = [];
      if (typeof studioEstimateRepository.listActiveForOrganization === "function") {
        estimates = await studioEstimateRepository.listActiveForOrganization(org, {
          includeArchived: query.includeArchived === true || query.include_archived === "1"
        });
      } else if (typeof studioEstimateRepository.listByIdsForPortfolio === "function") {
        // Fallback: empty unless caller provides ids (tests seed listActiveForOrganization)
        estimates = [];
      }

      const rows = [];
      for (const estimate of estimates) {
        const acceptance = lifecycleRepository
          ? await lifecycleRepository.getAcceptanceForEstimate(org, estimate.id)
          : null;
        const soldSnapshot = lifecycleRepository
          ? await lifecycleRepository.getSoldSnapshotForEstimate(org, estimate.id)
          : null;
        const pubOverlay = await resolvePublicationOverlay(org, estimate);
        const row = buildAllEstimatesRow(estimate, {
          ...pubOverlay,
          acceptance,
          soldSnapshot,
          hasAcceptance: Boolean(acceptance),
          hasSoldSnapshot: Boolean(soldSnapshot)
        });
        rows.push(row);
      }

      const filter = query.filter || query.lifecycle || query.status || "all";
      const search = query.search || query.q || "";
      let filtered = rows.filter(
        (r) => allEstimatesRowMatchesFilter(filter, r) && allEstimatesRowMatchesSearch(r, search)
      );

      filtered.sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(
          String(a.updatedAt || a.createdAt || "")
        )
      );

      const limit = Math.min(500, Math.max(1, Number(query.limit) || 80));
      const offset = Math.max(0, Number(query.offset) || 0);
      const page = filtered.slice(offset, offset + limit);

      return {
        ok: true,
        source: "studio_all_estimates",
        rows: page,
        total_count: filtered.length,
        limit,
        offset,
        filters: ALL_ESTIMATES_FILTERS
      };
    },

    async getEstimateHistory(organizationId, estimateId) {
      const estimate = await studioEstimateRepository.getById(organizationId, estimateId);
      if (!estimate) {
        const err = new Error("Estimate not found");
        err.statusCode = 404;
        err.code = "estimate_not_found";
        throw err;
      }
      const revisions = studioEstimateRepository.listByIntakeCase
        ? await studioEstimateRepository.listByIntakeCase(
            organizationId,
            estimate.intakeCaseId
          )
        : [estimate];
      const acceptance = lifecycleRepository
        ? await lifecycleRepository.getAcceptanceForEstimate(organizationId, estimateId)
        : null;
      const soldSnapshot = lifecycleRepository
        ? await lifecycleRepository.getSoldSnapshotForEstimate(organizationId, estimateId)
        : null;
      const events = lifecycleRepository
        ? await lifecycleRepository.listLifecycleEvents(organizationId, { estimateId })
        : [];
      const acceptancesForCase = lifecycleRepository?.listAcceptancesForCase
        ? await lifecycleRepository.listAcceptancesForCase(
            organizationId,
            estimate.intakeCaseId
          )
        : acceptance
          ? [acceptance]
          : [];

      return {
        ok: true,
        estimate: buildAllEstimatesRow(estimate, {
          acceptance,
          soldSnapshot,
          hasAcceptance: Boolean(acceptance),
          hasSoldSnapshot: Boolean(soldSnapshot)
        }),
        revisions: revisions.map((r) => ({
          estimateId: r.id,
          revision: r.revision,
          status: r.status,
          updatedAt: r.updatedAt
        })),
        acceptances: acceptancesForCase.map((a) => ({
          id: a.id,
          estimateId: a.studio_estimate_id,
          revision: a.estimate_revision,
          publicationId: a.publication_id,
          acceptedAt: a.accepted_at,
          customerDisplayTotal: a.customer_display_total
        })),
        soldSnapshot: soldSnapshot
          ? {
              id: soldSnapshot.id,
              soldAt: soldSnapshot.sold_at,
              acceptanceId: soldSnapshot.acceptance_id
            }
          : null,
        lifecycleEvents: events
      };
    }
  };
}
