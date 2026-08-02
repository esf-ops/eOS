/**
 * Customer Final Acceptance — distinct from Review Request and Mark Sold.
 * Bound to active publication + public session. Creates immutable acceptance.
 * Supports:
 *   - acceptedAsPublished (unchanged estimate)
 *   - acceptedAsConfigured (allowed selection-only changes, server-derived total)
 * Does not email, mark sold, publish, or write QB/Moraware.
 */

import {
  assertNoInternalEconomicsLeak,
  buildCustomerSafeAcceptanceSnapshot,
  STUDIO_LIFECYCLE_VERSION
} from "./studioLifecycleTypes.mjs";
import {
  constantTimeEqualSessionHash,
  hashConfigurationSessionSecret
} from "../digitalEstimate/configuration/publicConfigurationSession.mjs";
import {
  assertSyntheticPublicationPublicAccess,
  rejectSyntheticCallerAuthority
} from "../digitalEstimate/syntheticPilotGuard.mjs";
import { rejectClientAuthoritativeEconomics } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";
import {
  isOpenDigitalEstimateReviewRequestStatus,
  OPEN_REVIEW_REQUEST_STATUSES,
  REVIEW_STATUS
} from "../digitalEstimate/configuration/amendmentConfig.mjs";
import {
  buildPublicCustomerConfigurationReadModel,
  classifyCustomerConfigurationForReview,
  classifyReviewRequestForEliteReview
} from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import {
  applyBaselineParityToCustomerCalculation,
  publicCalcDivergesFromBaseline,
  resolvePricedSelectionTotal
} from "../digitalEstimate/configuration/baselineParityGuardrails.mjs";
import { splitSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";

function unavailable(message = "Estimate unavailable", code = "not_found") {
  const e = new Error(message);
  e.code = code;
  e.statusCode = 404;
  return e;
}

function publicationLifecycle(code, message, statusCode = 410) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  e.lifecycleFatal = true;
  return e;
}

function safeFail(code, message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) e[k] = v;
  }
  return e;
}

function isPricingExpired(pricingValidThrough, now = new Date()) {
  if (!pricingValidThrough) return false;
  const d = new Date(`${String(pricingValidThrough).slice(0, 10)}T23:59:59.999Z`);
  return Number.isFinite(d.getTime()) && now.getTime() > d.getTime();
}

/**
 * Reject spoofed acceptance authority claims (mirrors review-request discipline).
 */
export function rejectFinalAcceptanceAuthority(body) {
  rejectClientAuthoritativeEconomics(body);
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "organizationId",
    "organization_id",
    "publicationId",
    "quoteId",
    "revisionNumber",
    "exactInternalTotal",
    "internalMarkup",
    "sold",
    "markSold",
    "soldSnapshot",
    "checklist",
    "margin",
    "wholesale",
    "accountGroup",
    "actor",
    "approverUserId",
    "signature",
    "payment",
    // Never accept client-supplied acceptance economics / mode.
    "configuredDisplayTotal",
    "customerDisplayTotal",
    "acceptedAsConfigured",
    "acceptedAsPublished",
    "pricedSelectionTotal",
    "baselineDisplayTotal"
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw safeFail("forbidden_caller_authority", "Please refresh and try again", 400);
    }
  }
}

function finiteMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function customerSafeAcceptanceView(acceptance) {
  const snap = acceptance.customer_safe_snapshot_json || {};
  assertNoInternalEconomicsLeak(snap);
  const acceptedAsConfigured = snap.acceptedAsConfigured === true;
  const snapTotals = snap.totals && typeof snap.totals === "object" ? snap.totals : {};
  // For configured accept, prefer snapshot configured total over a stale column
  // that may have been written from a baseline-aligned pricedSelectionTotal.
  const configuredTotal =
    finiteMoney(snapTotals.acceptedConfiguredTotal) ??
    finiteMoney(snapTotals.customerDisplayTotal) ??
    finiteMoney(acceptance.customer_display_total);
  const publishedTotal = finiteMoney(acceptance.customer_display_total);
  const customerDisplayTotal = acceptedAsConfigured
    ? configuredTotal ?? publishedTotal
    : publishedTotal;
  return {
    acceptanceId: acceptance.id,
    status: "accepted",
    statusLabel: "Estimate accepted",
    acceptedAt: acceptance.accepted_at,
    estimateRevision: acceptance.estimate_revision,
    publicationId: acceptance.publication_id,
    customerDisplayTotal,
    termsVersion: acceptance.terms_version,
    acceptedAsPublished: acceptedAsConfigured ? false : snap.acceptedAsPublished !== false,
    acceptedAsConfigured,
    acceptedSelectionId: snap.acceptedSelectionId || null,
    acceptedPublicationId: snap.acceptedPublicationId || acceptance.publication_id || null,
    acceptedSelectionSummary: Array.isArray(snap.acceptedSelectionSummary)
      ? snap.acceptedSelectionSummary
      : [],
    configuration: acceptance.customer_configuration_json || null,
    materialSummary: acceptance.material_summary_json || [],
    customerVisibleLines: snap.customerVisibleLines || [],
    totals: {
      ...snapTotals,
      customerDisplayTotal:
        customerDisplayTotal ?? finiteMoney(snapTotals.customerDisplayTotal) ?? null,
      ...(acceptedAsConfigured && customerDisplayTotal != null
        ? { acceptedConfiguredTotal: customerDisplayTotal }
        : {})
    },
    lifecycleVersion: acceptance.lifecycle_version || STUDIO_LIFECYCLE_VERSION,
    notice:
      "Elite has received your acceptance. This is not a scheduling confirmation.",
    emailSent: false,
    markedSold: false
  };
}

function publishedEstimateTotal(estimate, publication) {
  const calc = estimate?.calculationSnapshot || estimate?.calculation || null;
  const fromCalc = Number(calc?.totals?.customerDisplayTotal);
  if (Number.isFinite(fromCalc)) return Math.round(fromCalc * 100) / 100;
  const fromApproval = Number(estimate?.approval?.customerDisplayTotal);
  if (Number.isFinite(fromApproval)) return Math.round(fromApproval * 100) / 100;
  const fromPub = Number(
    publication?.customer_display_total ?? publication?.customerDisplayTotal
  );
  if (Number.isFinite(fromPub)) return Math.round(fromPub * 100) / 100;
  return null;
}

/**
 * Server-owned configured total only. Never reads request body.
 * Returns null when missing, fail-closed, or not authoritative.
 *
 * Aligns with the public Digital Estimate "Your estimate" fields when
 * pricedSelectionTotal is stale/baseline-aligned but totals.configuredDisplayTotal
 * (or roomPricing.projectTotal) still carries the customer-visible configured total.
 */
export function resolveServerConfiguredAcceptanceTotal(customerCalc) {
  if (!customerCalc || typeof customerCalc !== "object") return null;
  const authority = String(customerCalc.pricingAuthority || "").trim();
  if (
    authority === "published_baseline_frozen" ||
    authority === "fail_closed" ||
    authority === "unsafe" ||
    customerCalc.failClosed === true ||
    customerCalc.pricingFrozen === true
  ) {
    return null;
  }
  const guarded = applyBaselineParityToCustomerCalculation(customerCalc, {
    baselineDisplayTotal:
      customerCalc.publishedBaselineTotal ?? customerCalc.baselineDisplayTotal ?? null,
    scopeReviewRequired: Boolean(customerCalc.scopeReviewRequired)
  });
  const guardedAuthority = String(guarded?.pricingAuthority || authority || "").trim();
  if (
    guardedAuthority === "published_baseline_frozen" ||
    guarded?.failClosed === true ||
    guarded?.pricingFrozen === true
  ) {
    return null;
  }
  const source = guarded || customerCalc;
  const baseline =
    finiteMoney(source.publishedBaselineTotal) ??
    finiteMoney(source.baselineDisplayTotal) ??
    finiteMoney(source.totals?.baselineDisplayTotal);
  const candidates = [
    // Public UI calcTotals prefers totals.configuredDisplayTotal first.
    finiteMoney(source.totals?.configuredDisplayTotal),
    finiteMoney(source.configuredDisplayTotal),
    source.configuredDisplayTotalCents != null
      ? finiteMoney(Number(source.configuredDisplayTotalCents) / 100)
      : null,
    finiteMoney(source.pricedSelectionTotal),
    finiteMoney(source.roomPricing?.projectTotal)
  ].filter((n) => n != null);

  if (!candidates.length) {
    const priced = resolvePricedSelectionTotal(source);
    return finiteMoney(priced);
  }

  if (baseline != null) {
    const diverged = candidates.find((n) => Math.abs(n - baseline) >= 0.005);
    if (diverged != null) return diverged;
  }

  const priced = resolvePricedSelectionTotal(source);
  return finiteMoney(priced) ?? candidates[0];
}

function isSelectionOnlyClassification(classification) {
  if (!classification) return false;
  if (classification.requiresEliteReview === true) return false;
  if (classification.hasPhysicalScopeRequests === true) return false;
  return (
    classification.reviewKind === "selection_only" ||
    classification.hasSelectionOnlyChanges === true
  );
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   lifecycleRepository: any,
 *   deRepository?: any,
 *   configurationRepository?: any,
 *   studioEstimateRepository?: any,
 *   amendmentRepository?: any,
 *   listOpenReviewRequests?: (orgId: string, publicationId: string) => Promise<object[]>,
 * }} deps
 */
export function createStudioFinalAcceptanceService(deps) {
  const env = deps.env || process.env;
  const {
    lifecycleRepository,
    deRepository,
    configurationRepository,
    studioEstimateRepository,
    amendmentRepository = null,
    listOpenReviewRequests = null
  } = deps;

  if (!lifecycleRepository) {
    throw new Error("lifecycleRepository required");
  }

  async function listOpenReviewsForPublication(organizationId, publicationId) {
    /** @type {object[]} */
    let rows = [];
    if (typeof listOpenReviewRequests === "function") {
      try {
        rows = (await listOpenReviewRequests(organizationId, publicationId)) || [];
      } catch {
        rows = [];
      }
    } else if (amendmentRepository && typeof amendmentRepository.listReviewRequests === "function") {
      try {
        const all = await amendmentRepository.listReviewRequests(organizationId, { limit: 80 });
        rows = (all || []).filter(
          (r) =>
            String(r.publication_id || r.publicationId || "") === String(publicationId)
        );
      } catch {
        rows = [];
      }
    }
    return rows.filter((r) =>
      isOpenDigitalEstimateReviewRequestStatus(r?.status || r?.operator_status || r?.operatorStatus)
    );
  }

  /**
   * Block accepting the original published estimate when the customer has
   * priced selection changes or physical scope requests pending.
   */
  function assertAcceptableAsPublished({ configuration, customerCalc }) {
    const foundation = buildPublicCustomerConfigurationReadModel(configuration || null, {});
    if (foundation.requiresEstimatorReview || Number(foundation.scopeChangeRequests?.count) > 0) {
      throw safeFail(
        "acceptance_blocked_scope_review",
        "Elite review is required before this estimate can be accepted.",
        409
      );
    }
    if (Number(foundation.selectionChanges?.count) > 0) {
      throw safeFail(
        "acceptance_blocked_selection_changes",
        "Please send your selections to Elite for review before accepting.",
        409
      );
    }
    if (customerCalc && typeof customerCalc === "object") {
      const guarded = applyBaselineParityToCustomerCalculation(customerCalc, {
        baselineDisplayTotal:
          customerCalc.publishedBaselineTotal ?? customerCalc.baselineDisplayTotal ?? null,
        scopeReviewRequired: Boolean(foundation.requiresEstimatorReview)
      });
      const baseline =
        guarded?.publishedBaselineTotal ?? guarded?.baselineDisplayTotal ?? null;
      const priced = resolvePricedSelectionTotal(guarded);
      if (
        publicCalcDivergesFromBaseline(
          { ...guarded, pricedSelectionTotal: priced, configuredDisplayTotal: priced },
          baseline
        )
      ) {
        throw safeFail(
          "acceptance_blocked_selection_changes",
          "Please send your selections to Elite for review before accepting.",
          409
        );
      }
    }
  }

  function assertAcceptableAsConfigured({
    classification,
    configuredTotal,
    customerCalc
  }) {
    if (
      classification?.requiresEliteReview === true ||
      classification?.hasPhysicalScopeRequests === true
    ) {
      throw safeFail(
        "acceptance_blocked_scope_review",
        "Elite review is required before this estimate can be accepted.",
        409
      );
    }
    if (!isSelectionOnlyClassification(classification)) {
      throw safeFail(
        "acceptance_blocked_selection_changes",
        "This estimate cannot be accepted with the current selections yet.",
        409
      );
    }
    if (configuredTotal == null || !Number.isFinite(Number(configuredTotal))) {
      throw safeFail(
        "acceptance_blocked_configured_total_unavailable",
        "Your selected estimate total is not ready yet. Please save your selections and try again.",
        409
      );
    }
    if (
      !customerCalc ||
      typeof customerCalc !== "object" ||
      String(customerCalc.pricingAuthority || "") === "published_baseline_frozen" ||
      customerCalc.failClosed === true ||
      customerCalc.pricingFrozen === true
    ) {
      throw safeFail(
        "acceptance_blocked_configured_total_unavailable",
        "Your selected estimate total is not ready yet. Please save your selections and try again.",
        409
      );
    }
  }

  async function closeSelectionOnlyReviewRequests(organizationId, openReviews) {
    if (!amendmentRepository) return;
    for (const review of openReviews || []) {
      const classification = classifyReviewRequestForEliteReview(review);
      if (!isSelectionOnlyClassification(classification)) continue;
      const requestId = review.id || review.reviewRequestId;
      if (!requestId) continue;
      try {
        if (typeof amendmentRepository.claimReviewRequestStatus === "function") {
          await amendmentRepository.claimReviewRequestStatus(
            organizationId,
            requestId,
            OPEN_REVIEW_REQUEST_STATUSES,
            REVIEW_STATUS.CLOSED
          );
        } else if (typeof amendmentRepository.updateReviewRequestStatus === "function") {
          await amendmentRepository.updateReviewRequestStatus(
            organizationId,
            requestId,
            REVIEW_STATUS.CLOSED,
            {
              closed_at: new Date().toISOString(),
              closed_reason: "accepted_as_configured"
            }
          );
        } else if (typeof amendmentRepository.closeReviewRequest === "function") {
          await amendmentRepository.closeReviewRequest(
            organizationId,
            requestId,
            "accepted_as_configured",
            null
          );
        }
        if (typeof amendmentRepository.appendEvent === "function") {
          try {
            await amendmentRepository.appendEvent({
              organization_id: organizationId,
              publication_id: review.publication_id || review.publicationId || null,
              review_request_id: requestId,
              event_type: "studio_final_acceptance_closed_selection_only_review",
              actor_type: "public",
              metadata: {
                reason: "accepted_as_configured",
                reviewKind: classification.reviewKind || "selection_only"
              }
            });
          } catch {
            // Status is authoritative; event history is best-effort.
          }
        }
      } catch {
        // Acceptance already persisted; review closure is best-effort and
        // must never reopen or mutate physical-scope requests.
      }
    }
  }

  async function resolveSession(rawSecret) {
    if (!configurationRepository?.getSessionBySecretHash) {
      throw unavailable();
    }
    const secret = String(rawSecret ?? "").trim();
    if (!secret) throw unavailable();
    const secretHash = hashConfigurationSessionSecret(secret);
    const session = await configurationRepository.getSessionBySecretHash(secretHash);
    if (!session || !constantTimeEqualSessionHash(session.session_secret_hash, secretHash)) {
      throw unavailable();
    }
    if (["revoked", "blocked"].includes(session.status)) throw unavailable();
    return { session, secretHash };
  }

  async function assertPublicationAcceptable(organizationId, publication) {
    if (!publication) {
      throw publicationLifecycle(
        "publication_unavailable",
        "This estimate link is no longer active. Please contact Elite.",
        404
      );
    }
    if (publication.status === "revoked") {
      throw publicationLifecycle(
        "publication_revoked",
        "This estimate link is no longer active. Please contact Elite."
      );
    }
    if (publication.status === "superseded" || publication.status === "replaced") {
      throw publicationLifecycle(
        "publication_superseded",
        "A newer estimate is available. Please use the latest estimate link from Elite."
      );
    }
    if (publication.status !== "active") {
      throw publicationLifecycle(
        "publication_unavailable",
        "This estimate link is no longer active. Please contact Elite.",
        404
      );
    }
    try {
      assertSyntheticPublicationPublicAccess(publication.id, env);
    } catch {
      throw publicationLifecycle(
        "publication_unavailable",
        "This estimate link is no longer active. Please contact Elite.",
        404
      );
    }
    if (isPricingExpired(publication.pricing_valid_through)) {
      throw publicationLifecycle(
        "publication_expired",
        "This estimate link is no longer active. Please contact Elite."
      );
    }
  }

  /**
   * Core accept — used by public route and tests.
   * Idempotent on publication_id.
   */
  async function acceptResolvedContext(ctx) {
    const {
      organizationId,
      publication,
      estimate,
      session = null,
      secretHash = null,
      configuration = null,
      customerCalc = null,
      selection = null,
      selectionPayload = null,
      confirm = false
    } = ctx;

    if (!confirm) {
      throw safeFail(
        "confirmation_required",
        "Please confirm you are accepting this final estimate",
        400
      );
    }

    await assertPublicationAcceptable(organizationId, publication);

    if (!estimate) {
      throw safeFail("estimate_unavailable", "Estimate unavailable", 404);
    }

    // Must be the active customer-facing revision for the family
    if (studioEstimateRepository?.getActiveByIntakeCase && estimate.intakeCaseId) {
      const active = await studioEstimateRepository.getActiveByIntakeCase(
        organizationId,
        estimate.intakeCaseId
      );
      if (active && String(active.id) !== String(estimate.id)) {
        throw publicationLifecycle(
          "publication_superseded",
          "A newer estimate is available. Please use the latest estimate link from Elite."
        );
      }
      // Publication revision must match active estimate revision when present
      const pubRev =
        publication.revision_number ??
        publication.revisionNumber ??
        publication.estimate_revision;
      if (pubRev != null && Number(pubRev) !== Number(active?.revision ?? estimate.revision)) {
        throw publicationLifecycle(
          "publication_superseded",
          "A newer estimate is available. Please use the latest estimate link from Elite."
        );
      }
    }

    const existing = await lifecycleRepository.getAcceptanceByPublication(
      organizationId,
      publication.id
    );
    if (existing) {
      return {
        ok: true,
        reused: true,
        created: false,
        acceptance: customerSafeAcceptanceView(existing),
        sideEffects: {
          emailSent: false,
          markedSold: false,
          quickbooksWritten: false,
          morawareWritten: false,
          publicationChanged: false,
          revisionCreated: false,
          autoApproved: false,
          autoPublished: false,
          autoCalculated: false
        }
      };
    }

    const openReviews = await listOpenReviewsForPublication(organizationId, publication.id);
    const openReviewClassifications = openReviews.map((request) => ({
      request,
      classification: classifyReviewRequestForEliteReview(request)
    }));

    if (
      openReviewClassifications.some(
        (row) => row.classification.requiresEliteReview === true
      )
    ) {
      throw safeFail(
        "acceptance_blocked_scope_review",
        "Elite review is required before this estimate can be accepted.",
        409
      );
    }

    const payload =
      selectionPayload ||
      selection?.selection_payload_json ||
      selection?.selections ||
      null;
    const split = payload ? splitSelectionPayloadMeta(payload) : { quantities: {}, roomNotes: {}, projectNote: null };
    const localClassification = classifyCustomerConfigurationForReview({
      foundation: configuration || split.customerConfiguration || null,
      selectionPayload: payload,
      quantities: split.quantities || {},
      roomNotes: split.roomNotes || {},
      projectNote: split.projectNote || null
    });

    if (localClassification.requiresEliteReview) {
      throw safeFail(
        "acceptance_blocked_scope_review",
        "Elite review is required before this estimate can be accepted.",
        409
      );
    }

    const selectionOnlyOpenReviews = openReviewClassifications.filter((row) =>
      isSelectionOnlyClassification(row.classification)
    );
    const unknownOpenReviews = openReviewClassifications.filter(
      (row) =>
        !isSelectionOnlyClassification(row.classification) &&
        row.classification.requiresEliteReview !== true
    );
    const wantsConfigured =
      isSelectionOnlyClassification(localClassification) ||
      selectionOnlyOpenReviews.length > 0;

    const calc = estimate.calculationSnapshot || estimate.calculation || null;
    const scope = estimate.scope || {};
    const publishedTotal = publishedEstimateTotal(estimate, publication);
    const customerSafeSnapshot = buildCustomerSafeAcceptanceSnapshot({
      calc,
      scope,
      configuration: configuration || {},
      publication,
      estimate
    });

    let customerDisplayTotal = null;
    /** @type {object[]} */
    let reviewsToClose = [];

    if (wantsConfigured) {
      const configuredTotal = resolveServerConfiguredAcceptanceTotal(customerCalc);
      assertAcceptableAsConfigured({
        classification:
          isSelectionOnlyClassification(localClassification)
            ? localClassification
            : selectionOnlyOpenReviews[0]?.classification || localClassification,
        configuredTotal,
        customerCalc
      });
      if (unknownOpenReviews.length) {
        // Fail closed: an open non-classified review must not be silently closed
        // or bypassed by the configured path.
        throw safeFail(
          "acceptance_blocked_review_requested",
          "Your selections were already sent for review. Elite will confirm the next steps.",
          409
        );
      }
      customerDisplayTotal = configuredTotal;
      customerSafeSnapshot.acceptedAsPublished = false;
      customerSafeSnapshot.acceptedAsConfigured = true;
      customerSafeSnapshot.acceptedSelectionId =
        selection?.id ||
        selectionOnlyOpenReviews[0]?.request?.selection_id ||
        selectionOnlyOpenReviews[0]?.request?.selectionId ||
        null;
      customerSafeSnapshot.acceptedPublicationId = publication.id;
      customerSafeSnapshot.acceptedSelectionSummary = Array.isArray(
        localClassification.selectionSummary
      )
        ? localClassification.selectionSummary
        : [];
      customerSafeSnapshot.totals = {
        ...(customerSafeSnapshot.totals || {}),
        customerDisplayTotal: configuredTotal,
        acceptedConfiguredTotal: configuredTotal,
        publishedBaselineTotal:
          Number(customerCalc?.publishedBaselineTotal ?? customerCalc?.baselineDisplayTotal) ||
          publishedTotal
      };
      reviewsToClose = selectionOnlyOpenReviews.map((row) => row.request);
    } else {
      if (openReviews.length) {
        throw safeFail(
          "acceptance_blocked_review_requested",
          "Your selections were already sent for review. Elite will confirm the next steps.",
          409
        );
      }
      assertAcceptableAsPublished({ configuration, customerCalc });
      customerDisplayTotal = publishedTotal;
      customerSafeSnapshot.acceptedAsPublished = true;
      customerSafeSnapshot.acceptedAsConfigured = false;
      customerSafeSnapshot.acceptedPublicationId = publication.id;
      customerSafeSnapshot.acceptedSelectionId = selection?.id || null;
      customerSafeSnapshot.totals = {
        ...(customerSafeSnapshot.totals || {}),
        customerDisplayTotal: publishedTotal
      };
    }

    assertNoInternalEconomicsLeak(customerSafeSnapshot);

    const { acceptance, created } = await lifecycleRepository.createAcceptance({
      organizationId,
      intakeCaseId: estimate.intakeCaseId,
      studioEstimateId: estimate.id,
      estimateRevision: Number(estimate.revision) || 1,
      publicationId: publication.id,
      publicationSnapshotId: publication.snapshot_id || publication.snapshotId || null,
      configurationSessionId: session?.id || null,
      sessionSecretHash: secretHash || null,
      customerSafeSnapshot,
      customerDisplayTotal,
      customerConfiguration: configuration || {},
      materialSummary: customerSafeSnapshot.materialSummary || [],
      termsVersion: publication.terms_version || publication.termsVersion || null,
      publicationSnapshotHash:
        publication.snapshot_hash || publication.snapshotHash || null
    });

    if (!acceptance?.id) {
      throw safeFail("acceptance_persist_failed", "Unable to record acceptance", 500);
    }

    if (created && reviewsToClose.length) {
      await closeSelectionOnlyReviewRequests(organizationId, reviewsToClose);
    }

    return {
      ok: true,
      reused: !created,
      created,
      acceptance: customerSafeAcceptanceView(acceptance),
      sideEffects: {
        emailSent: false,
        markedSold: false,
        quickbooksWritten: false,
        morawareWritten: false,
        publicationChanged: false,
        revisionCreated: false,
        autoApproved: false,
        autoPublished: false,
        autoCalculated: false
      }
    };
  }

  return {
    rejectFinalAcceptanceAuthority,

    customerSafeAcceptanceView,
    resolveServerConfiguredAcceptanceTotal,

    /** Whether customer configuration may still be mutated. */
    async isConfigurationLocked(organizationId, publicationId) {
      const a = await lifecycleRepository.getAcceptanceByPublication(
        organizationId,
        publicationId
      );
      return Boolean(a);
    },

    async getAcceptanceForPublication(organizationId, publicationId) {
      const a = await lifecycleRepository.getAcceptanceByPublication(
        organizationId,
        publicationId
      );
      return a ? customerSafeAcceptanceView(a) : null;
    },

    /**
     * Public path: session cookie → publication → estimate → accept.
     */
    async acceptFinalEstimate({ rawSecret, body }) {
      rejectSyntheticCallerAuthority(body || {});
      rejectFinalAcceptanceAuthority(body || {});

      const confirm =
        body?.confirm === true ||
        body?.confirmed === true ||
        String(body?.confirmation || "").toLowerCase() === "accept_final_estimate";

      const { session, secretHash } = await resolveSession(rawSecret);
      if (session.status === "revoked" || session.status === "blocked" || session.status === "superseded") {
        throw safeFail("session_invalid", "Please refresh and try again", 401);
      }
      if (!["active", "configuring", "saved"].includes(session.status)) {
        throw safeFail("session_invalid", "Please refresh and try again", 401);
      }

      if (!deRepository?.getPublication) {
        throw unavailable();
      }

      const publication = await deRepository.getPublication(
        session.organization_id,
        session.publication_id
      );
      await assertPublicationAcceptable(session.organization_id, publication);

      if (configurationRepository?.getActiveEnvelope) {
        const activeEnvelope = await configurationRepository.getActiveEnvelope(
          session.organization_id,
          session.publication_id
        );
        if (!activeEnvelope) {
          throw safeFail("session_invalid", "Please refresh and try again", 401);
        }
        if (!session.envelope_id || String(session.envelope_id) !== String(activeEnvelope.id)) {
          throw safeFail("stale_configuration", "Please refresh and try again", 409);
        }
      }

      let configuration = null;
      let customerCalc = null;
      let selection = null;
      let selectionPayload = null;
      if (configurationRepository?.getLatestSelectionForSession) {
        selection = await configurationRepository.getLatestSelectionForSession(
          session.organization_id,
          session.id
        );
        if (selection) {
          selectionPayload =
            selection.selection_payload_json ||
            selection.selections ||
            selection.customer_configuration_json ||
            {};
          const meta = splitSelectionPayloadMeta(selectionPayload);
          configuration = meta.customerConfiguration || selectionPayload;
          if (typeof configurationRepository.getCalculationBySelectionId === "function") {
            try {
              const calcRow = await configurationRepository.getCalculationBySelectionId(
                session.organization_id,
                selection.id
              );
              customerCalc = calcRow?.customer_result_json || null;
            } catch {
              customerCalc = null;
            }
          }
        }
      }

      let estimate = null;
      const estimateId =
        publication.studio_estimate_id ||
        publication.studioEstimateId ||
        publication.metadata?.studioEstimateId ||
        null;
      const intakeCaseId =
        publication.intake_case_id ||
        publication.intakeCaseId ||
        publication.quote_family_root_id ||
        null;

      if (studioEstimateRepository) {
        if (estimateId) {
          estimate = await studioEstimateRepository.getById(
            session.organization_id,
            estimateId
          );
        }
        if (!estimate && intakeCaseId) {
          estimate = await studioEstimateRepository.getActiveByIntakeCase(
            session.organization_id,
            intakeCaseId
          );
        }
      }

      return acceptResolvedContext({
        organizationId: session.organization_id,
        publication,
        estimate,
        session,
        secretHash,
        configuration,
        customerCalc,
        selection,
        selectionPayload,
        confirm
      });
    },

    /** Test / staff-assisted harness entry (still requires confirm). */
    acceptResolvedContext
  };
}
