/**
 * Quote Flow Estimates — Review tab (internal approval gate only).
 * Approves scoped + priced estimates for later customer-quote prep.
 * Does not publish Digital Estimate, accept, or mark sold.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import {
  presentQuoteFlowEstimateListItem,
  resolveEstimateDisplayName,
  summarizeOfficialScope
} from "./quoteFlowEstimatesPresenter.mjs";
import {
  presentQuoteFlowEdgeStatus,
  readQuoteFlowCustomLineItems,
  summarizeQuoteFlowCustomLineItems
} from "./quoteFlowCustomLineItems.mjs";
import { presentQuoteFlowPricingResult } from "./quoteFlowPricing.mjs";
import { buildStudioV2EditablePricing } from "../elite100EstimateStudio/studioV2Pricing.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "../elite100EstimateStudio/studioEstimateTypes.mjs";
import { scopeFingerprint } from "../elite100EstimateStudio/studioEstimatePricing.mjs";

export { markQuoteFlowReviewStaleOnScope } from "./quoteFlowReviewMeta.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  refreshScopeFromTakeoff: false,
  estimateApproved: false
});

/**
 * @param {'passed'|'warning'|'blocker'} severity
 * @param {string} id
 * @param {string} label
 * @param {string} [detail]
 */
function checkItem(severity, id, label, detail = "") {
  return { id, label, severity, detail: detail || null, passed: severity === "passed" };
}

/**
 * Assess whether an estimate is ready for internal Quote Flow approval.
 * @param {object} row
 * @param {{ actorUserId?: string|null, env?: NodeJS.ProcessEnv }} [opts]
 */
export function assessQuoteFlowReviewReadiness(row, opts = {}) {
  /** @type {ReturnType<typeof checkItem>[]} */
  const checklist = [];
  const scope = row?.scope && typeof row.scope === "object" ? row.scope : {};
  const summary = summarizeOfficialScope(scope);
  const calc = row?.calculationSnapshot && typeof row.calculationSnapshot === "object"
    ? row.calculationSnapshot
    : null;
  const pricingResult = presentQuoteFlowPricingResult(row);
  const editablePricing = buildStudioV2EditablePricing(row, {
    actorUserId: opts.actorUserId || null,
    env: opts.env
  });
  const staleReason = String(row?.staleReason || "").trim();
  const customLines = readQuoteFlowCustomLineItems(scope);
  const customSummary = summarizeQuoteFlowCustomLineItems(customLines);
  const edgeStatus = presentQuoteFlowEdgeStatus(scope, {
    openEdgeLf: summary.openEdgeLf,
    edgeLf: pricingResult.breakdown?.edgeLf ?? null,
    openEdgeAmount: pricingResult.openEdgeAmount ?? null,
    edgeTier: calc?.fabrication?.edge?.tier || null,
    edgeProfileToken: calc?.fabrication?.edge?.profileToken || scope.edgeProfileToken || null,
    edgeProfileLabel: calc?.fabrication?.edge?.profileLabel || null
  });

  // 1. Official scope
  if (isOfficialScopeSet(row) && summary.roomCount > 0) {
    checklist.push(checkItem("passed", "official_scope", "Official scope exists"));
  } else {
    checklist.push(
      checkItem("blocker", "official_scope", "Official scope exists", "Set official scope before review.")
    );
  }

  // 2. Included pieces
  if (summary.pieceCount > 0) {
    checklist.push(
      checkItem("passed", "included_pieces", "At least one included piece exists", `${summary.pieceCount} piece(s)`)
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "included_pieces",
        "At least one included piece exists",
        "Include at least one piece on Scope."
      )
    );
  }

  // 3. Pricing draft
  if (editablePricing?.pricingBasis && editablePricing?.materialGroup) {
    checklist.push(
      checkItem(
        "passed",
        "pricing_draft",
        "Pricing draft exists",
        `${editablePricing.pricingBasis} · ${editablePricing.materialGroupLabel || editablePricing.materialGroup}`
      )
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "pricing_draft",
        "Pricing draft exists",
        "Save pricing basis and price group before review."
      )
    );
  }

  // 4. Latest calculation
  if (pricingResult.available === true && calc) {
    checklist.push(
      checkItem(
        "passed",
        "pricing_calculation",
        "Latest pricing calculation exists",
        pricingResult.calculatedAt ? `Calculated ${pricingResult.calculatedAt}` : null
      )
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "pricing_calculation",
        "Latest pricing calculation exists",
        "Calculate pricing before approval."
      )
    );
  }

  // 5. Not stale
  if (staleReason) {
    checklist.push(
      checkItem(
        "blocker",
        "pricing_current",
        "Pricing calculation is not stale",
        staleReason
      )
    );
  } else if (pricingResult.available === true) {
    checklist.push(checkItem("passed", "pricing_current", "Pricing calculation is not stale"));
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "pricing_current",
        "Pricing calculation is not stale",
        "Calculate pricing before approval."
      )
    );
  }

  // 6. Customer total
  const customerTotal =
    pricingResult.customerDisplayTotal ?? pricingResult.estimatedTotal ?? null;
  if (customerTotal != null && Number.isFinite(Number(customerTotal)) && Number(customerTotal) >= 0) {
    checklist.push(
      checkItem(
        "passed",
        "customer_total",
        "Customer estimate total exists",
        `$${Number(customerTotal).toFixed(2)}`
      )
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "customer_total",
        "Customer estimate total exists",
        "Calculate pricing to produce a customer estimate total."
      )
    );
  }

  // 7. Open edge
  if (edgeStatus.chargeStatus === "pending") {
    checklist.push(
      checkItem(
        "warning",
        "open_edge",
        "Open edge LF state is valid",
        `${Number(edgeStatus.openEdgeLf || 0).toFixed(1)} LF open edge — edge profile not selected (Pending).`
      )
    );
  } else if (summary.openEdgeLf > 0) {
    checklist.push(
      checkItem(
        "passed",
        "open_edge",
        "Open edge LF state is valid",
        `${Number(summary.openEdgeLf).toFixed(1)} LF · ${edgeStatus.profileDisplay || "profile set"}`
      )
    );
  } else {
    checklist.push(
      checkItem("passed", "open_edge", "Open edge LF state is valid", "0.0 LF open edge")
    );
  }

  // 8–9. Custom line items
  const invalidCustomer = customLines.filter(
    (l) =>
      l.visibility === "customer" &&
      (!String(l.label || "").trim() ||
        (l.type !== "note" && !(Number(l.amount) >= 0 && Number.isFinite(Number(l.unitAmount)))))
  );
  const invalidInternal = customLines.filter(
    (l) =>
      l.visibility === "internal" &&
      (!String(l.label || "").trim() ||
        (l.type !== "note" && !(Number(l.amount) >= 0 && Number.isFinite(Number(l.unitAmount)))))
  );

  if (invalidCustomer.length) {
    checklist.push(
      checkItem(
        "blocker",
        "customer_lines",
        "Customer-facing custom line items valid",
        "Fix customer-facing line labels/amounts on Pricing."
      )
    );
  } else {
    checklist.push(
      checkItem(
        "passed",
        "customer_lines",
        "Customer-facing custom line items valid",
        `${customSummary.customerFacing.length} item(s)`
      )
    );
  }

  if (invalidInternal.length) {
    checklist.push(
      checkItem(
        "blocker",
        "internal_lines",
        "Internal-only custom line items valid",
        "Fix internal-only line labels/amounts on Pricing."
      )
    );
  } else {
    checklist.push(
      checkItem(
        "passed",
        "internal_lines",
        "Internal-only custom line items valid",
        `${customSummary.internalOnly.length} item(s)`
      )
    );
  }

  const blockers = checklist.filter((c) => c.severity === "blocker");
  const warnings = checklist.filter((c) => c.severity === "warning");
  const canApprove = blockers.length === 0;

  const approval = row?.approval && typeof row.approval === "object" ? row.approval : null;
  const qfReview =
    scope.quoteFlowReview && typeof scope.quoteFlowReview === "object" ? scope.quoteFlowReview : null;
  const status = String(row?.status || "").toLowerCase();
  const fingerprintMatches =
    approval?.calculationFingerprint &&
    calc?.fingerprint &&
    approval.calculationFingerprint === calc.fingerprint;

  let reviewStatusKey = "not_ready";
  let reviewStatusLabel = "Not ready for review";
  if (status === "approved" && fingerprintMatches && !staleReason) {
    reviewStatusKey = "approved";
    reviewStatusLabel = "Approved";
  } else if (status === "approved" && (!fingerprintMatches || staleReason)) {
    reviewStatusKey = "needs_recalculation";
    reviewStatusLabel = "Needs recalculation";
  } else if (qfReview?.status === "stale" || (approval && !fingerprintMatches)) {
    reviewStatusKey = "needs_updates";
    reviewStatusLabel = "Needs scope/pricing updates";
  } else if (staleReason && pricingResult.available) {
    reviewStatusKey = "needs_recalculation";
    reviewStatusLabel = "Needs recalculation";
  } else if (canApprove) {
    reviewStatusKey = "ready_for_review";
    reviewStatusLabel = "Ready for review";
  } else if (!pricingResult.available || staleReason) {
    reviewStatusKey = "not_ready";
    reviewStatusLabel = "Not ready for review";
  } else {
    reviewStatusKey = "needs_updates";
    reviewStatusLabel = "Needs scope/pricing updates";
  }

  const listItem = presentQuoteFlowEstimateListItem(row);
  const reviewSummary = {
    estimateName: resolveEstimateDisplayName(listItem) || listItem.estimateName || null,
    source: listItem.scopeSource || null,
    rooms: summary.roomCount,
    pieces: summary.pieceCount,
    countertopSf: summary.countertopSf,
    backsplashSf: summary.backsplashSf,
    openEdgeLf: summary.openEdgeLf,
    pricingBasis: editablePricing?.pricingBasis || null,
    priceGroup: editablePricing?.materialGroup || null,
    priceGroupLabel: editablePricing?.materialGroupLabel || null,
    customerEstimateTotal: customerTotal,
    customerFacingAdjustments: customSummary.customerFacingChargesTotal - customSummary.customerFacingCreditsTotal,
    customerFacingChargesTotal: customSummary.customerFacingChargesTotal,
    customerFacingCreditsTotal: customSummary.customerFacingCreditsTotal,
    internalOnlyAdjustments: customSummary.internalOnlyChargesTotal - customSummary.internalOnlyCreditsTotal,
    internalOnlyChargesTotal: customSummary.internalOnlyChargesTotal,
    internalOnlyCreditsTotal: customSummary.internalOnlyCreditsTotal,
    exactInternalTotal: pricingResult.exactInternalTotal,
    calculatedAt: pricingResult.calculatedAt || null,
    edgeStatus
  };

  return {
    checklist,
    blockers,
    warnings,
    canApprove,
    reviewStatusKey,
    reviewStatusLabel,
    reviewSummary,
    approval: approval
      ? {
          approvedAt: approval.approvedAt || qfReview?.approvedAt || null,
          approvedByUserId: approval.approvedByUserId || qfReview?.approvedByUserId || null,
          calculationFingerprint: approval.calculationFingerprint || null,
          customerDisplayTotal: approval.customerDisplayTotal ?? null,
          exactInternalTotal: approval.exactInternalTotal ?? null,
          scopeFingerprint: approval.scopeFingerprint || null
        }
      : null,
    quoteFlowReview: qfReview,
    reReviewRequired:
      reviewStatusKey === "needs_recalculation" || reviewStatusKey === "needs_updates",
    reReviewMessage: reviewStatusKey === "needs_recalculation" || reviewStatusKey === "needs_updates"
      ? "Scope or pricing changed after approval. Re-review required."
      : null
  };
}

/**
 * @param {{
 *   estimateRepository?: { getById?: Function, update?: Function }|null,
 *   studioEstimateService?: { getById?: Function, repository?: object }|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowReviewService(deps = {}) {
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
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

  function assertScoped(row) {
    if (!isOfficialScopeSet(row)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }
  }

  async function getReview({ organizationId, estimateId, actorUserId = null } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);
    const assessed = assessQuoteFlowReviewReadiness(row, { actorUserId, env });
    return {
      ok: true,
      estimateId: row.id || estimateId,
      revision: row.revision ?? null,
      status: row.status || null,
      reviewStatus: {
        key: assessed.reviewStatusKey,
        label: assessed.reviewStatusLabel
      },
      canApprove: assessed.canApprove,
      checklist: assessed.checklist,
      blockers: assessed.blockers.map((b) => b.detail || b.label),
      warnings: assessed.warnings.map((w) => w.detail || w.label),
      reviewSummary: assessed.reviewSummary,
      approval: assessed.approval,
      reReviewRequired: assessed.reReviewRequired,
      reReviewMessage: assessed.reReviewMessage,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function approveReview({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!estimateRepository?.update) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to approve estimate.",
        statusCode: 503
      });
    }
    if (body?.confirm !== true) {
      throw createQuoteFlowError("review_confirm_required", {
        message: "Confirm Approve estimate to continue.",
        statusCode: 400
      });
    }

    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);
    const assessed = assessQuoteFlowReviewReadiness(row, { actorUserId, env });

    if (!assessed.canApprove) {
      const first = assessed.blockers[0];
      throw createQuoteFlowError("review_not_ready", {
        message: first?.detail || first?.label || "Estimate is not ready for approval.",
        statusCode: 422,
        diagnostic: { blockers: assessed.blockers, checklist: assessed.checklist }
      });
    }

    const calc = row.calculationSnapshot;
    // Idempotent: already approved for same fingerprint.
    if (
      String(row.status || "").toLowerCase() === STUDIO_ESTIMATE_STATUSES.APPROVED &&
      row.approval?.calculationFingerprint &&
      calc?.fingerprint === row.approval.calculationFingerprint
    ) {
      const again = await getReview({ organizationId, estimateId, actorUserId });
      return {
        ...again,
        message: "Estimate already approved.",
        reused: true,
        sideEffects: { ...NO_SIDE_EFFECTS }
      };
    }

    const approvedAt = new Date().toISOString();
    const approval = {
      approvedAt,
      approvedByUserId: actorUserId || null,
      calculationFingerprint: calc.fingerprint,
      sourceTakeoffResultId: row.sourceTakeoffResultId || null,
      scopeFingerprint: scopeFingerprint(row.scope || {}),
      exactInternalTotal: calc.totals?.exactInternalTotal ?? null,
      customerDisplayTotal: calc.totals?.customerDisplayTotal ?? null,
      quoteFlowInternalApproval: true
    };
    const priorScope = row.scope && typeof row.scope === "object" ? row.scope : {};
    const quoteFlowReview = {
      status: "approved",
      approvedAt,
      approvedByUserId: actorUserId || null,
      calculationFingerprint: calc.fingerprint,
      calculatedAt: calc.calculatedAt || null,
      estimateRevision: row.revision ?? null,
      customerDisplayTotal: calc.totals?.customerDisplayTotal ?? null,
      exactInternalTotal: calc.totals?.exactInternalTotal ?? null,
      scopeFingerprint: approval.scopeFingerprint,
      staleReason: null,
      staleAt: null
    };

    const updated = await estimateRepository.update(
      organizationId,
      row.id || estimateId,
      {
        status: STUDIO_ESTIMATE_STATUSES.APPROVED,
        approval,
        staleReason: null,
        scope: {
          ...priorScope,
          quoteFlowReview
        }
      },
      actorUserId || null
    );

    const presented = await getReview({
      organizationId,
      estimateId: updated.id || estimateId,
      actorUserId
    });
    return {
      ...presented,
      message: "Estimate approved.",
      reused: false,
      sideEffects: {
        ...NO_SIDE_EFFECTS,
        // Internal Quote Flow approval only — not Digital Estimate publish.
        estimateApproved: true,
        approved: false
      }
    };
  }

  async function reopenReview({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!estimateRepository?.update) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to reopen review.",
        statusCode: 503
      });
    }
    if (body?.confirm !== true) {
      throw createQuoteFlowError("review_confirm_required", {
        message: "Confirm Reopen review to continue.",
        statusCode: 400
      });
    }

    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);

    const hasCalc =
      row.calculationSnapshot &&
      typeof row.calculationSnapshot === "object" &&
      row.calculationSnapshot.fingerprint;
    const priorScope = row.scope && typeof row.scope === "object" ? row.scope : {};
    const priorReview =
      priorScope.quoteFlowReview && typeof priorScope.quoteFlowReview === "object"
        ? priorScope.quoteFlowReview
        : {};

    const updated = await estimateRepository.update(
      organizationId,
      row.id || estimateId,
      {
        status: hasCalc ? STUDIO_ESTIMATE_STATUSES.PRICED : STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
        approval: null,
        staleReason: null,
        scope: {
          ...priorScope,
          quoteFlowReview: {
            ...priorReview,
            status: "reopened",
            reopenedAt: new Date().toISOString(),
            reopenedByUserId: actorUserId || null,
            approvedAt: null,
            calculationFingerprint: null,
            staleReason: null,
            staleAt: null
          }
        }
      },
      actorUserId || null
    );

    const presented = await getReview({
      organizationId,
      estimateId: updated.id || estimateId,
      actorUserId
    });
    return {
      ...presented,
      message: "Review reopened.",
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  return {
    getReview,
    approveReview,
    reopenReview,
    assessQuoteFlowReviewReadiness,
    NO_SIDE_EFFECTS
  };
}
