/**
 * Quote Flow Estimates — Digital Estimate tab (customer-facing publish).
 * Publishes from internally approved, current estimates only.
 * Does not accept, mark sold, create handoff, or send email.
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
import { assessQuoteFlowReviewReadiness } from "./quoteFlowReview.mjs";
import {
  buildPublicationFreezePayloads
} from "../digitalEstimate/digitalEstimateSnapshot.mjs";
import {
  assertPublicDtoHasNoForbiddenContent,
  buildPublicDigitalEstimateDto
} from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";
import { readDigitalEstimatePricingValidDays } from "../digitalEstimate/digitalEstimateConfig.mjs";
import {
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import { defaultSimplifiedPublishConfiguration } from "../elite100EstimateStudio/studioCustomerChoiceOptions.mjs";

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
  handoffCreated: false
});

const QUOTE_FLOW_PUBLISH_CONTEXT = Object.freeze({
  source: "quote_flow_approved_snapshot",
  approvedSnapshotAuthority: true,
  skipLegacyTakeoffApprovalGate: true
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

function addDaysDateOnly(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readQuoteFlowDigitalEstimateMeta(scope) {
  return scope?.quoteFlowDigitalEstimate && typeof scope.quoteFlowDigitalEstimate === "object"
    ? scope.quoteFlowDigitalEstimate
    : null;
}

/**
 * Build a customer-facing freeze preview for checklist / staff UI.
 * Never includes internal-only named lines or internal economics.
 * @param {object} row
 * @param {{ organizationId?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function buildQuoteFlowCustomerPublishPreview(row, opts = {}) {
  const organizationId = opts.organizationId || row?.organizationId || null;
  const env = opts.env || process.env;
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(row, { organizationId });
  const freeze = buildPublicationFreezePayloads({
    header,
    publishedAt: new Date().toISOString(),
    pricingValidThrough: addDaysDateOnly(readDigitalEstimatePricingValidDays(env))
  });
  const publicDto = buildPublicDigitalEstimateDto(freeze.customerSnapshot, {
    accessExpiresAt: null
  });
  assertPublicDtoHasNoForbiddenContent(publicDto);

  const snapJson = JSON.stringify(freeze.customerSnapshot || {}).toLowerCase();
  const dtoJson = JSON.stringify(publicDto || {}).toLowerCase();
  if (
    snapJson.includes("exactinternaltotal") ||
    snapJson.includes("internalmarkup") ||
    dtoJson.includes("exactinternaltotal") ||
    dtoJson.includes("internalmarkup")
  ) {
    throw createQuoteFlowError("publish_not_ready", {
      message: "Customer publish preview leaked internal economics.",
      statusCode: 500
    });
  }

  const customerLines = Array.isArray(publicDto?.lineItems) ? publicDto.lineItems : [];
  const customLines = readQuoteFlowCustomLineItems(row?.scope || {});
  const internalLabels = customLines
    .filter((l) => l.visibility === "internal" && l.type !== "note")
    .map((l) => String(l.label || "").trim().toLowerCase())
    .filter(Boolean);
  for (const label of internalLabels) {
    if (customerLines.some((li) => String(li?.label || "").trim().toLowerCase() === label)) {
      throw createQuoteFlowError("publish_not_ready", {
        message: "Internal-only line items must not appear in the customer payload.",
        statusCode: 500
      });
    }
  }

  return {
    customerDisplayTotal:
      publicDto?.totals?.customerDisplayTotal ??
      freeze.customerSnapshot?.totals?.customerDisplayTotal ??
      null,
    lineItems: customerLines,
    roomCount: Array.isArray(publicDto?.rooms) ? publicDto.rooms.length : 0,
    sourceQuoteFingerprint: freeze.sourceQuoteFingerprint || null
  };
}

/**
 * Assess Quote Flow Digital Estimate publish readiness.
 * @param {object} row
 * @param {{
 *   actorUserId?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   organizationId?: string,
 *   studioPublishAvailable?: boolean,
 *   activePublication?: object|null
 * }} [opts]
 */
export function assessQuoteFlowDigitalEstimateReadiness(row, opts = {}) {
  /** @type {ReturnType<typeof checkItem>[]} */
  const checklist = [];
  const env = opts.env || process.env;
  const scope = row?.scope && typeof row.scope === "object" ? row.scope : {};
  const summary = summarizeOfficialScope(scope);
  const review = assessQuoteFlowReviewReadiness(row, {
    actorUserId: opts.actorUserId || null,
    env
  });
  const pricingResult = presentQuoteFlowPricingResult(row);
  const customLines = readQuoteFlowCustomLineItems(scope);
  const customSummary = summarizeQuoteFlowCustomLineItems(customLines);
  const deMeta = readQuoteFlowDigitalEstimateMeta(scope);
  const edgeStatus = presentQuoteFlowEdgeStatus(scope, {
    openEdgeLf: summary.openEdgeLf,
    edgeLf: pricingResult.breakdown?.edgeLf ?? null,
    openEdgeAmount: pricingResult.openEdgeAmount ?? null,
    edgeTier: row?.calculationSnapshot?.fabrication?.edge?.tier || null,
    edgeProfileToken:
      row?.calculationSnapshot?.fabrication?.edge?.profileToken || scope.edgeProfileToken || null,
    edgeProfileLabel: row?.calculationSnapshot?.fabrication?.edge?.profileLabel || null
  });

  if (isOfficialScopeSet(row) && summary.roomCount > 0) {
    checklist.push(checkItem("passed", "official_scope", "Official scope exists"));
  } else {
    checklist.push(
      checkItem("blocker", "official_scope", "Official scope exists", "Set official scope before publish.")
    );
  }

  if (pricingResult.available === true && row?.calculationSnapshot) {
    checklist.push(
      checkItem(
        "passed",
        "pricing_calculation",
        "Pricing calculation exists",
        pricingResult.calculatedAt ? `Calculated ${pricingResult.calculatedAt}` : null
      )
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "pricing_calculation",
        "Pricing calculation exists",
        "Calculate pricing before publish."
      )
    );
  }

  if (review.reviewStatusKey === "approved") {
    checklist.push(
      checkItem(
        "passed",
        "review_approval",
        "Review approval exists",
        review.approval?.approvedAt ? `Approved ${review.approval.approvedAt}` : null
      )
    );
    checklist.push(checkItem("passed", "review_current", "Review approval is current"));
  } else if (review.reReviewRequired) {
    checklist.push(
      checkItem(
        "blocker",
        "review_approval",
        "Review approval exists",
        review.reReviewMessage || "Re-review required before publish."
      )
    );
    checklist.push(
      checkItem(
        "blocker",
        "review_current",
        "Review approval is current",
        review.reReviewMessage || "Scope or pricing changed after approval."
      )
    );
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "review_approval",
        "Review approval exists",
        "Approve the estimate on Review before publish."
      )
    );
    checklist.push(
      checkItem(
        "blocker",
        "review_current",
        "Review approval is current",
        "Approve a current review before publish."
      )
    );
  }

  const customerTotal =
    pricingResult.customerDisplayTotal ?? pricingResult.estimatedTotal ?? null;
  if (customerTotal != null && Number.isFinite(Number(customerTotal)) && Number(customerTotal) > 0) {
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
        "Customer estimate total must be greater than zero."
      )
    );
  }

  const invalidCustomer = customLines.filter(
    (l) =>
      l.visibility === "customer" &&
      (!String(l.label || "").trim() ||
        (l.type !== "note" && !(Number(l.amount) >= 0 && Number.isFinite(Number(l.unitAmount)))))
  );
  if (invalidCustomer.length) {
    checklist.push(
      checkItem(
        "blocker",
        "customer_lines",
        "Customer-facing line items valid",
        "Fix customer-facing line labels/amounts on Pricing."
      )
    );
  } else {
    checklist.push(
      checkItem(
        "passed",
        "customer_lines",
        "Customer-facing line items valid",
        `${customSummary.customerFacing.length} item(s)`
      )
    );
  }

  /** @type {ReturnType<typeof buildQuoteFlowCustomerPublishPreview>|null} */
  let customerPreview = null;
  let previewError = null;
  if (
    review.reviewStatusKey === "approved" &&
    pricingResult.available === true &&
    !invalidCustomer.length
  ) {
    try {
      customerPreview = buildQuoteFlowCustomerPublishPreview(row, {
        organizationId: opts.organizationId,
        env
      });
      checklist.push(
        checkItem(
          "passed",
          "internal_excluded",
          "Internal-only line items excluded from customer payload",
          `${customSummary.internalOnly.length} internal-only item(s) stay in Quote Flow only`
        )
      );
      checklist.push(
        checkItem(
          "passed",
          "publish_target",
          "Digital Estimate publish target can be created safely",
          "Customer snapshot preview passed safety checks."
        )
      );
    } catch (e) {
      previewError = e?.message || "Customer publish preview failed.";
      checklist.push(
        checkItem(
          "blocker",
          "internal_excluded",
          "Internal-only line items excluded from customer payload",
          previewError
        )
      );
      checklist.push(
        checkItem(
          "blocker",
          "publish_target",
          "Digital Estimate publish target can be created safely",
          previewError
        )
      );
    }
  } else {
    checklist.push(
      checkItem(
        "blocker",
        "internal_excluded",
        "Internal-only line items excluded from customer payload",
        "Complete approval and valid customer-facing lines first."
      )
    );
    checklist.push(
      checkItem(
        "blocker",
        "publish_target",
        "Digital Estimate publish target can be created safely",
        opts.studioPublishAvailable === false
          ? "Digital Estimate publish service is unavailable."
          : "Complete approval and current pricing before publish."
      )
    );
  }

  if (opts.studioPublishAvailable === false) {
    const existing = checklist.find((c) => c.id === "publish_target");
    if (existing && existing.severity === "passed") {
      existing.severity = "blocker";
      existing.passed = false;
      existing.detail = "Digital Estimate publish service is unavailable.";
    }
  }

  if (edgeStatus.chargeStatus === "pending") {
    checklist.push(
      checkItem(
        "warning",
        "open_edge",
        "Open edge LF state",
        `${Number(edgeStatus.openEdgeLf || 0).toFixed(1)} LF open edge — edge profile not selected (Pending). Customer may choose later.`
      )
    );
  }

  const contactName =
    row?.customerIdentitySnapshot?.contactName ||
    scope.customerName ||
    scope.customerIdentitySnapshot?.contactName ||
    null;
  const contactEmail =
    row?.customerIdentitySnapshot?.contactEmail ||
    scope.customerEmail ||
    scope.customerIdentitySnapshot?.contactEmail ||
    null;
  if (!String(contactName || "").trim() && !String(contactEmail || "").trim()) {
    checklist.push(
      checkItem(
        "warning",
        "customer_contact",
        "Optional customer contact info",
        "Customer name/email not set — publish still allowed."
      )
    );
  }

  const blockers = checklist.filter((c) => c.severity === "blocker");
  const warnings = checklist.filter((c) => c.severity === "warning");
  const canPublish = blockers.length === 0;

  const activePublication = opts.activePublication || null;
  const hasPublishedLink =
    Boolean(activePublication?.customerUrl) ||
    Boolean(deMeta?.customerUrl) ||
    Boolean(deMeta?.publicationId) ||
    deMeta?.status === "published" ||
    deMeta?.status === "stale";

  let publishStatusKey = "not_ready";
  let publishStatusLabel = "Not ready to publish";
  if (hasPublishedLink && (deMeta?.status === "stale" || review.reReviewRequired)) {
    publishStatusKey = "needs_republish";
    publishStatusLabel = "Publish stale / needs republish";
  } else if (review.reReviewRequired) {
    publishStatusKey = "needs_rereview";
    publishStatusLabel = "Needs re-review";
  } else if (hasPublishedLink && deMeta?.status === "published" && !review.reReviewRequired) {
    publishStatusKey = "published";
    publishStatusLabel = "Published";
  } else if (canPublish) {
    publishStatusKey = "ready_to_publish";
    publishStatusLabel = "Ready to publish";
  }

  const listItem = presentQuoteFlowEstimateListItem(row);
  const customerFacingLines = customSummary.customerFacing.map((l) => ({
    id: l.id,
    label: l.label,
    type: l.type,
    amount: l.amount,
    visibility: "customer"
  }));
  const internalOnlyLines = customSummary.internalOnly.map((l) => ({
    id: l.id,
    label: l.label,
    type: l.type,
    amount: l.amount,
    visibility: "internal"
  }));

  return {
    checklist,
    blockers,
    warnings,
    canPublish,
    publishStatusKey,
    publishStatusLabel,
    reviewStatus: {
      key: review.reviewStatusKey,
      label: review.reviewStatusLabel
    },
    reReviewRequired: review.reReviewRequired,
    reReviewMessage: review.reReviewMessage,
    publishSummary: {
      estimateName: resolveEstimateDisplayName(listItem) || listItem.estimateName || null,
      source: listItem.scopeSource || null,
      rooms: summary.roomCount,
      pieces: summary.pieceCount,
      countertopSf: summary.countertopSf,
      backsplashSf: summary.backsplashSf,
      openEdgeLf: summary.openEdgeLf,
      customerEstimateTotal: customerTotal,
      customerFacingLineCount: customerFacingLines.length,
      internalOnlyLineCount: internalOnlyLines.length,
      calculatedAt: pricingResult.calculatedAt || null,
      approvedAt: review.approval?.approvedAt || null,
      edgeStatus
    },
    customerFacingLines,
    internalOnlyLines,
    customerPreview,
    quoteFlowDigitalEstimate: deMeta,
    activePublication
  };
}

/**
 * @param {{
 *   estimateRepository?: { getById?: Function, update?: Function }|null,
 *   studioEstimateService?: { getById?: Function, repository?: object, repositoryMode?: string }|null,
 *   studioDigitalEstimateService?: {
 *     publish?: Function,
 *     listPublications?: Function,
 *     assessReadiness?: Function
 *   }|null,
 *   env?: NodeJS.ProcessEnv,
 *   preferInteractiveConfiguration?: boolean
 * }} deps
 */
export function createQuoteFlowDigitalEstimateService(deps = {}) {
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
  const studioDigitalEstimateService = deps.studioDigitalEstimateService || null;
  const env = deps.env || process.env;
  const preferInteractive = deps.preferInteractiveConfiguration !== false;

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

  async function loadActivePublication(organizationId, estimateId) {
    if (!studioDigitalEstimateService?.listPublications) return null;
    try {
      const listed = await studioDigitalEstimateService.listPublications(
        organizationId,
        estimateId
      );
      return listed?.activePublication || null;
    } catch {
      return null;
    }
  }

  function resolvePublishConfiguration(body) {
    const raw =
      body?.configuration && typeof body.configuration === "object" ? body.configuration : null;
    if (raw) return raw;
    if (preferInteractive) {
      return defaultSimplifiedPublishConfiguration();
    }
    return {
      enableConfiguration: false,
      configurationMode: "document",
      customerChoiceGroups: []
    };
  }

  async function getDigitalEstimate({ organizationId, estimateId, actorUserId = null } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);
    const activePublication = await loadActivePublication(organizationId, estimateId);
    const assessed = assessQuoteFlowDigitalEstimateReadiness(row, {
      actorUserId,
      env,
      organizationId,
      studioPublishAvailable: Boolean(studioDigitalEstimateService?.publish),
      activePublication
    });

    return {
      ok: true,
      estimateId: row.id || estimateId,
      revision: row.revision ?? null,
      status: row.status || null,
      publishStatus: {
        key: assessed.publishStatusKey,
        label: assessed.publishStatusLabel
      },
      canPublish: assessed.canPublish,
      checklist: assessed.checklist,
      blockers: assessed.blockers.map((b) => b.detail || b.label),
      warnings: assessed.warnings.map((w) => w.detail || w.label),
      publishSummary: assessed.publishSummary,
      reviewStatus: assessed.reviewStatus,
      reReviewRequired: assessed.reReviewRequired,
      reReviewMessage: assessed.reReviewMessage,
      customerFacingLines: assessed.customerFacingLines,
      internalOnlyLines: assessed.internalOnlyLines,
      internalOnlyExcluded: true,
      customerPreview: assessed.customerPreview
        ? {
            customerDisplayTotal: assessed.customerPreview.customerDisplayTotal,
            lineItems: assessed.customerPreview.lineItems,
            roomCount: assessed.customerPreview.roomCount
          }
        : null,
      publication: activePublication
        ? {
            publicationId: activePublication.id || activePublication.publicationId || null,
            customerUrl: activePublication.customerUrl || null,
            linkStatus: activePublication.linkStatus || null,
            publishedAt: activePublication.publishedAt || null,
            status: activePublication.status || null
          }
        : assessed.quoteFlowDigitalEstimate
          ? {
              publicationId: assessed.quoteFlowDigitalEstimate.publicationId || null,
              customerUrl: assessed.quoteFlowDigitalEstimate.customerUrl || null,
              linkStatus: assessed.quoteFlowDigitalEstimate.linkStatus || null,
              publishedAt: assessed.quoteFlowDigitalEstimate.publishedAt || null,
              status: assessed.quoteFlowDigitalEstimate.status || null
            }
          : null,
      quoteFlowDigitalEstimate: assessed.quoteFlowDigitalEstimate,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function publishDigitalEstimate({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!studioDigitalEstimateService?.publish) {
      throw createQuoteFlowError("publish_unavailable", {
        message: "Digital Estimate publish is unavailable.",
        statusCode: 503
      });
    }
    if (body?.confirm !== true) {
      throw createQuoteFlowError("publish_confirm_required", {
        message: "Confirm Publish Digital Estimate to continue.",
        statusCode: 400
      });
    }

    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);
    const activeBefore = await loadActivePublication(organizationId, estimateId);
    const assessed = assessQuoteFlowDigitalEstimateReadiness(row, {
      actorUserId,
      env,
      organizationId,
      studioPublishAvailable: true,
      activePublication: activeBefore
    });

    if (!assessed.canPublish) {
      const first = assessed.blockers[0];
      throw createQuoteFlowError("publish_not_ready", {
        message: first?.detail || first?.label || "Estimate is not ready to publish.",
        statusCode: 422,
        diagnostic: { blockers: assessed.blockers, checklist: assessed.checklist }
      });
    }

    const configuration = resolvePublishConfiguration(body);
    let result;
    try {
      result = await studioDigitalEstimateService.publish({
        organizationId,
        estimateId: row.id || estimateId,
        actorUserId: actorUserId || null,
        body: {
          confirm: true,
          configuration,
          ...(body?.pricingValidThrough ? { pricingValidThrough: body.pricingValidThrough } : {}),
          ...(body?.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {})
        },
        publishContext: { ...QUOTE_FLOW_PUBLISH_CONTEXT }
      });
    } catch (e) {
      const code = String(e?.code || "");
      if (
        code === "estimate_not_approved" ||
        code === "estimate_stale" ||
        code === "calculation_fingerprint_mismatch" ||
        code === "not_eligible"
      ) {
        throw createQuoteFlowError("publish_not_ready", {
          message: e?.message || "Estimate is not ready to publish.",
          statusCode: 422,
          diagnostic: { code }
        });
      }
      throw createQuoteFlowError("publish_unavailable", {
        message: e?.message || "Unable to publish Digital Estimate.",
        statusCode: Number(e?.statusCode) || 503,
        diagnostic: { code: code || null }
      });
    }

    const publication = result?.publication || null;
    const customerUrl =
      result?.customerUrl ||
      publication?.customerUrl ||
      null;
    const publicationId = publication?.id || publication?.publicationId || null;
    const publishedAt =
      publication?.publishedAt || publication?.published_at || new Date().toISOString();
    const calc = row.calculationSnapshot || {};
    const approval = row.approval || {};
    const priorScope = row.scope && typeof row.scope === "object" ? row.scope : {};
    const quoteFlowDigitalEstimate = {
      status: "published",
      publishedAt,
      publishedByUserId: actorUserId || null,
      publicationId,
      customerUrl,
      linkStatus: result?.linkStatus || publication?.linkStatus || "active",
      sourceApprovalFingerprint: approval.calculationFingerprint || null,
      sourceCalculationFingerprint: calc.fingerprint || null,
      sourceScopeFingerprint: approval.scopeFingerprint || null,
      estimateRevision: row.revision ?? null,
      customerDisplayTotal:
        calc.totals?.customerDisplayTotal ?? approval.customerDisplayTotal ?? null,
      reused: result?.reused === true,
      staleReason: null,
      staleAt: null
    };

    if (estimateRepository?.update) {
      await estimateRepository.update(
        organizationId,
        row.id || estimateId,
        {
          scope: {
            ...priorScope,
            quoteFlowDigitalEstimate
          }
        },
        actorUserId || null
      );
    }

    const presented = await getDigitalEstimate({
      organizationId,
      estimateId: row.id || estimateId,
      actorUserId
    });

    return {
      ...presented,
      message:
        result?.staffNotice ||
        (result?.reused ? "Digital Estimate already published." : "Digital Estimate published."),
      reused: result?.reused === true,
      accessToken: result?.accessToken || null,
      customerUrl: presented.publication?.customerUrl || customerUrl,
      publication: {
        ...(presented.publication || {}),
        publicationId: presented.publication?.publicationId || publicationId,
        customerUrl: presented.publication?.customerUrl || customerUrl,
        publishedAt: presented.publication?.publishedAt || publishedAt
      },
      sideEffects: {
        ...NO_SIDE_EFFECTS,
        digitalEstimateCreated: true,
        published: true,
        sold: false,
        accepted: false,
        emailed: false,
        handoffCreated: false
      }
    };
  }

  return {
    getDigitalEstimate,
    publishDigitalEstimate,
    assessQuoteFlowDigitalEstimateReadiness
  };
}
