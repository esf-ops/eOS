/**
 * Quote Flow Estimates — Activity tab (read-only status / timeline).
 * Does not accept, mark sold, create handoff, or send email.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import {
  mapQuoteFlowEstimateStatus,
  presentQuoteFlowEstimateListItem,
  resolveEstimateDisplayName
} from "./quoteFlowEstimatesPresenter.mjs";
import { assessQuoteFlowReviewReadiness } from "./quoteFlowReview.mjs";
import { assessQuoteFlowDigitalEstimateReadiness } from "./quoteFlowDigitalEstimate.mjs";
import { selectOfficialQuoteFlowLibraryRows } from "./quoteFlowLibraryRows.mjs";

export { selectOfficialQuoteFlowLibraryRows };

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  refreshScopeFromTakeoff: false,
  estimateApproved: false,
  emailed: false,
  handoffCreated: false,
  mutated: false
});

/**
 * @param {string} type
 * @param {string} label
 * @param {string|null} at
 * @param {string} [detail]
 * @param {Record<string, unknown>} [meta]
 */
function timelineEvent(type, label, at, detail = "", meta = {}) {
  return {
    id: `${type}:${at || "unknown"}:${label}`,
    type,
    label,
    at: at || null,
    detail: detail || null,
    tracked: Boolean(at),
    meta
  };
}

/**
 * Build Activity payload from estimate row + optional publication listing.
 * @param {object} row
 * @param {{
 *   publications?: object[],
 *   activePublication?: object|null,
 *   reviewRequests?: object[],
 *   publicationEvents?: object[],
 *   actorUserId?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   organizationId?: string
 * }} [opts]
 */
export function buildQuoteFlowActivityPayload(row, opts = {}) {
  const env = opts.env || process.env;
  const scope = row?.scope && typeof row.scope === "object" ? row.scope : {};
  const qfReview =
    scope.quoteFlowReview && typeof scope.quoteFlowReview === "object" ? scope.quoteFlowReview : null;
  const qfDe =
    scope.quoteFlowDigitalEstimate && typeof scope.quoteFlowDigitalEstimate === "object"
      ? scope.quoteFlowDigitalEstimate
      : null;
  const listItem = presentQuoteFlowEstimateListItem(row);
  const estimateStatus = mapQuoteFlowEstimateStatus(row, scope);
  const review = assessQuoteFlowReviewReadiness(row, {
    actorUserId: opts.actorUserId || null,
    env
  });
  const digital = assessQuoteFlowDigitalEstimateReadiness(row, {
    actorUserId: opts.actorUserId || null,
    env,
    organizationId: opts.organizationId,
    studioPublishAvailable: true,
    activePublication: opts.activePublication || null
  });

  const publications = Array.isArray(opts.publications) ? opts.publications : [];
  const reviewRequests = Array.isArray(opts.reviewRequests) ? opts.reviewRequests : [];
  const publicationEvents = Array.isArray(opts.publicationEvents) ? opts.publicationEvents : [];

  /** @type {ReturnType<typeof timelineEvent>[]} */
  const timeline = [];

  if (row.createdAt) {
    timeline.push(
      timelineEvent("estimate_created", "Estimate opened", row.createdAt, "Official Quote Flow estimate record.")
    );
  }
  if (row.intakeCaseId) {
    timeline.push(
      timelineEvent(
        "intake_linked",
        "Intake case linked",
        row.createdAt || null,
        `Case ${row.intakeCaseId}`,
        { intakeCaseId: row.intakeCaseId }
      )
    );
  }
  if (row.takeoffJobId) {
    timeline.push(
      timelineEvent(
        "takeoff_linked",
        "AI Takeoff linked",
        row.createdAt || null,
        `Takeoff job ${row.takeoffJobId}`,
        { takeoffJobId: row.takeoffJobId }
      )
    );
  }
  if (scope.quoteFlowScopeEdited === true || scope.quoteFlowManualEdits === true) {
    timeline.push(
      timelineEvent(
        "scope_edited",
        "Official scope edited",
        row.updatedAt || null,
        "Manual edits on official scope."
      )
    );
  } else if (isOfficialScopeSet(row)) {
    timeline.push(
      timelineEvent(
        "scope_set",
        "Official scope set",
        row.createdAt || row.updatedAt || null,
        "Scoped estimate ready for pricing."
      )
    );
  }
  const calculatedAt = row.calculationSnapshot?.calculatedAt || null;
  if (calculatedAt) {
    timeline.push(
      timelineEvent(
        "pricing_calculated",
        "Pricing calculated",
        calculatedAt,
        row.calculationSnapshot?.totals?.customerDisplayTotal != null
          ? `Customer total $${Number(row.calculationSnapshot.totals.customerDisplayTotal).toFixed(2)}`
          : null
      )
    );
  }
  if (qfReview?.approvedAt || row.approval?.approvedAt) {
    timeline.push(
      timelineEvent(
        "review_approved",
        "Review approved",
        qfReview?.approvedAt || row.approval?.approvedAt,
        qfReview?.approvedByUserId || row.approval?.approvedByUserId
          ? `By ${qfReview?.approvedByUserId || row.approval?.approvedByUserId}`
          : "Internal Quote Flow approval."
      )
    );
  }
  if (qfReview?.status === "stale" || qfReview?.staleAt) {
    timeline.push(
      timelineEvent(
        "review_stale",
        "Re-review required",
        qfReview?.staleAt || row.updatedAt || null,
        qfReview?.staleReason || "Scope or pricing changed after approval."
      )
    );
  }
  if (qfReview?.status === "reopened") {
    timeline.push(
      timelineEvent(
        "review_reopened",
        "Review reopened",
        row.updatedAt || null,
        "Internal approval cleared."
      )
    );
  }

  const sortedPubs = [...publications].sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || a.published_at || "")) || 0;
    const tb = Date.parse(String(b.publishedAt || b.published_at || "")) || 0;
    return ta - tb;
  });
  for (const pub of sortedPubs) {
    const at = pub.publishedAt || pub.published_at || null;
    const status = String(pub.status || "").toLowerCase();
    const superseded = Boolean(pub.supersededAt || pub.superseded_at) || status === "superseded";
    const label = superseded
      ? "Digital Estimate republished (prior revision)"
      : status === "revoked"
        ? "Digital Estimate publication revoked"
        : "Digital Estimate published";
    timeline.push(
      timelineEvent(
        superseded ? "de_republished" : "de_published",
        label,
        at,
        pub.revisionLabel || pub.revision_label || pub.revisionNumber || pub.revision_number
          ? `Revision ${pub.revisionLabel || pub.revision_label || pub.revisionNumber || pub.revision_number}`
          : null,
        {
          publicationId: pub.id || pub.publicationId || null,
          status: pub.status || null,
          customerUrl: pub.customerUrl || null
        }
      )
    );
  }
  if (!sortedPubs.length && qfDe?.publishedAt) {
    timeline.push(
      timelineEvent(
        "de_published",
        "Digital Estimate published",
        qfDe.publishedAt,
        qfDe.publicationId ? `Publication ${qfDe.publicationId}` : null,
        { publicationId: qfDe.publicationId || null, customerUrl: qfDe.customerUrl || null }
      )
    );
  }
  if (qfDe?.status === "stale" || qfDe?.staleAt) {
    timeline.push(
      timelineEvent(
        "de_stale",
        "Needs republish",
        qfDe?.staleAt || row.updatedAt || null,
        qfDe?.staleReason || "Scope or pricing changed after publish."
      )
    );
  }

  for (const ev of publicationEvents) {
    const t = String(ev.event_type || ev.eventType || "").toLowerCase();
    const at = ev.created_at || ev.createdAt || null;
    if (t === "first_viewed" || t === "viewed" || t === "customer_viewed") {
      timeline.push(
        timelineEvent("customer_link_opened", "Customer link opened", at, "Tracked from Digital Estimate events.")
      );
    } else if (t === "configuration_updated" || t === "selection_saved") {
      timeline.push(
        timelineEvent(
          "customer_selections_changed",
          "Customer selections changed",
          at,
          "Tracked from Digital Estimate configuration events."
        )
      );
    } else if (t === "link_copied") {
      timeline.push(timelineEvent("link_copied", "Staff copied customer link", at));
    }
  }

  for (const req of reviewRequests) {
    timeline.push(
      timelineEvent(
        "customer_review_request",
        "Customer revision / review request",
        req.requestedAt || req.created_at || req.createdAt || null,
        req.status ? `Status: ${req.status}` : null,
        { reviewRequestId: req.id || null, status: req.status || null }
      )
    );
  }

  timeline.sort((a, b) => {
    const ta = Date.parse(String(a.at || "")) || 0;
    const tb = Date.parse(String(b.at || "")) || 0;
    return ta - tb;
  });

  const activePublication =
    opts.activePublication ||
    sortedPubs.find((p) => String(p.status || "").toLowerCase() === "active") ||
    null;
  const latestLink =
    activePublication?.customerUrl ||
    qfDe?.customerUrl ||
    null;

  /** @type {{ key: string, label: string, detail: string|null }} */
  let customerSelections = {
    key: "none",
    label: "No customer activity yet",
    detail: null
  };
  const hasView = timeline.some((e) => e.type === "customer_link_opened");
  const hasSelection = timeline.some((e) => e.type === "customer_selections_changed");
  const openRequest = reviewRequests.find((r) => {
    const s = String(r.status || "").toLowerCase();
    return s && s !== "closed" && s !== "resolved" && s !== "cancelled";
  });
  if (openRequest) {
    customerSelections = {
      key: "revision_requested",
      label: "Revision requested / changes pending",
      detail: openRequest.status ? `Request status: ${openRequest.status}` : null
    };
  } else if (hasSelection) {
    customerSelections = {
      key: "selections_saved",
      label: "Customer selections saved",
      detail: "From Digital Estimate configuration activity."
    };
  } else if (hasView) {
    customerSelections = {
      key: "link_opened",
      label: "Customer opened link",
      detail: "Selections not tracked yet."
    };
  } else if (!latestLink) {
    customerSelections = {
      key: "not_published",
      label: "Not tracked yet",
      detail: "Publish a Digital Estimate to track customer activity."
    };
  } else if (!publicationEvents.length && !reviewRequests.length) {
    customerSelections = {
      key: "not_tracked",
      label: "Not tracked yet",
      detail: "No customer view or selection events are available for this publication."
    };
  }

  const publicationHistory = sortedPubs
    .slice()
    .reverse()
    .map((pub) => {
      const status = String(pub.status || "").toLowerCase();
      const superseded = Boolean(pub.supersededAt || pub.superseded_at) || status === "superseded";
      const revoked = Boolean(pub.revokedAt || pub.revoked_at) || status === "revoked";
      let state = "current";
      if (revoked) state = "revoked";
      else if (superseded) state = "superseded";
      else if (qfDe?.status === "stale" && (pub.id || pub.publicationId) === qfDe.publicationId) {
        state = "stale";
      } else if (status === "active") state = "current";
      return {
        publicationId: pub.id || pub.publicationId || null,
        publishedAt: pub.publishedAt || pub.published_at || null,
        publishedByUserId: pub.publishedByUserId || pub.published_by || null,
        revisionLabel: pub.revisionLabel || pub.revision_label || null,
        revisionNumber: pub.revisionNumber ?? pub.revision_number ?? null,
        status: pub.status || null,
        state,
        customerUrl: pub.customerUrl || null,
        linkStatus: pub.linkStatus || null,
        sourceApprovalFingerprint: qfDe?.sourceApprovalFingerprint || null,
        sourceCalculationFingerprint: qfDe?.sourceCalculationFingerprint || null
      };
    });

  if (!publicationHistory.length && qfDe?.publicationId) {
    publicationHistory.push({
      publicationId: qfDe.publicationId,
      publishedAt: qfDe.publishedAt || null,
      publishedByUserId: qfDe.publishedByUserId || null,
      revisionLabel: null,
      revisionNumber: row.revision ?? null,
      status: qfDe.status || null,
      state: qfDe.status === "stale" ? "stale" : "current",
      customerUrl: qfDe.customerUrl || null,
      linkStatus: qfDe.linkStatus || null,
      sourceApprovalFingerprint: qfDe.sourceApprovalFingerprint || null,
      sourceCalculationFingerprint: qfDe.sourceCalculationFingerprint || null
    });
  }

  return {
    ok: true,
    estimateId: row.id || null,
    revision: row.revision ?? null,
    intakeCaseId: row.intakeCaseId || null,
    estimateName: resolveEstimateDisplayName(listItem) || listItem.estimateName || null,
    summary: {
      officialStatus: estimateStatus,
      reviewStatus: {
        key: review.reviewStatusKey,
        label: review.reviewStatusLabel
      },
      publishStatus: {
        key: digital.publishStatusKey,
        label: digital.publishStatusLabel
      },
      latestPublication: publicationHistory[0] || null,
      customerLinkAvailable: Boolean(latestLink),
      customerUrl: latestLink,
      customerSelections,
      needsRereview: review.reReviewRequired === true,
      needsRepublish:
        digital.publishStatusKey === "needs_republish" || qfDe?.status === "stale",
      workflowState: estimateStatus.label
    },
    timeline,
    publicationHistory,
    customerSelections,
    unavailableNotes: [
      !row.takeoffJobId ? "AI Takeoff start/return detail: Not tracked yet." : null,
      !publicationEvents.length
        ? "Detailed customer view/selection events: Not tracked yet (or none recorded)."
        : null
    ].filter(Boolean),
    sideEffects: { ...NO_SIDE_EFFECTS }
  };
}

/**
 * @param {{
 *   estimateRepository?: { getById?: Function }|null,
 *   studioEstimateService?: { getById?: Function, repository?: object }|null,
 *   studioDigitalEstimateService?: {
 *     listPublications?: Function,
 *     assessReadiness?: Function
 *   }|null,
 *   digitalEstimateRepository?: {
 *     listEventsForPublication?: Function
 *   }|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowActivityService(deps = {}) {
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
  const studioDigitalEstimateService = deps.studioDigitalEstimateService || null;
  const digitalEstimateRepository = deps.digitalEstimateRepository || null;
  const env = deps.env || process.env;

  async function loadEstimateRow(organizationId, estimateId) {
    const id = String(estimateId || "").trim();
    if (!id) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    let row = null;
    if (estimateRepository?.getById) {
      row = await estimateRepository.getById(organizationId, id);
    } else if (studioEstimateService?.getById) {
      row = await studioEstimateService.getById(organizationId, id);
    }
    if (!row) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    return row;
  }

  async function getActivity({ organizationId, estimateId, actorUserId = null } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    if (!isOfficialScopeSet(row)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }

    /** @type {object[]} */
    let publications = [];
    /** @type {object|null} */
    let activePublication = null;
    /** @type {object[]} */
    let reviewRequests = [];
    /** @type {object[]} */
    let publicationEvents = [];

    if (studioDigitalEstimateService?.listPublications) {
      try {
        const listed = await studioDigitalEstimateService.listPublications(
          organizationId,
          row.id || estimateId
        );
        publications = Array.isArray(listed?.publications) ? listed.publications : [];
        activePublication = listed?.activePublication || null;
      } catch {
        publications = [];
        activePublication = null;
      }
    }

    if (studioDigitalEstimateService?.assessReadiness) {
      try {
        const readiness = await studioDigitalEstimateService.assessReadiness(
          organizationId,
          row.id || estimateId,
          {},
          {
            skipLegacyTakeoffApprovalGate: true,
            approvedSnapshotAuthority: true,
            source: "quote_flow_activity"
          }
        );
        if (Array.isArray(readiness?.reviewRequests)) {
          reviewRequests = readiness.reviewRequests;
        }
        if (!publications.length && Array.isArray(readiness?.publications)) {
          publications = readiness.publications;
        }
        if (!activePublication && readiness?.activePublication) {
          activePublication = readiness.activePublication;
        }
      } catch {
        /* optional enrichment */
      }
    }

    const activeId =
      activePublication?.id ||
      activePublication?.publicationId ||
      row.scope?.quoteFlowDigitalEstimate?.publicationId ||
      null;
    if (
      activeId &&
      digitalEstimateRepository?.listEventsForPublication
    ) {
      try {
        publicationEvents =
          (await digitalEstimateRepository.listEventsForPublication(
            organizationId,
            activeId,
            40
          )) || [];
      } catch {
        publicationEvents = [];
      }
    }

    return buildQuoteFlowActivityPayload(row, {
      publications,
      activePublication,
      reviewRequests,
      publicationEvents,
      actorUserId,
      env,
      organizationId
    });
  }

  return {
    getActivity,
    buildQuoteFlowActivityPayload,
    selectOfficialQuoteFlowLibraryRows
  };
}
