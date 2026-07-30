/**
 * Elite 100 Studio V2 Slice A — additive working-draft / calculate / publish wrappers.
 *
 * Hard rules:
 * - Does not create estimates or acquire drafts.
 * - Does not call ensure-editable-draft, open-measurement-revision, or simplified-publish.
 * - Calculate wraps calculateStudioEstimateV4 without refresh-from-takeoff or scope mutation.
 * - Publish is strict (approved only) via existing digital-estimate publish service.
 */

import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";
import { createStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  createStudioV2Error,
  mapPublishBlockerCode,
  sanitizePublishBlockers,
  STUDIO_V2_ERROR_CODES,
  studioV2UserMessage
} from "./studioV2Errors.mjs";
import {
  buildStudioV2CalculationResult,
  buildStudioV2ProjectHeader,
  buildStudioV2ScopeSummary,
  isStudioV2CalculationPersistable,
  isStudioV2OriginUnsupported,
  resolveStudioV2OriginType
} from "./studioV2WorkingDraft.mjs";
import {
  buildSafeStudioPublicationSummary,
  isCurrentActivePublicationForEstimate,
  isHistoricalPublicationForEstimate,
  normalizePublicationStatus
} from "./studioPublicationSummary.mjs";

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: () => any,
 *   repository?: any,
 *   studioEstimateService?: any,
 *   studioDigitalEstimateService?: any,
 *   lifecycleRepository?: any,
 *   calculateStudioEstimateImpl?: Function
 * }} [deps]
 */
export function createStudioV2Service(deps = {}) {
  const env = deps.env ?? process.env;
  const calculateImpl = deps.calculateStudioEstimateImpl || calculateStudioEstimateV4;

  const repoBundle = deps.repository
    ? { repository: deps.repository, mode: "injected" }
    : createStudioEstimateRepository({
        env,
        getSupabase: deps.getSupabase,
        db: deps.getSupabase?.()
      });
  const repository = repoBundle.repository;

  const studioEstimateService =
    deps.studioEstimateService ||
    createStudioEstimateService({
      repository,
      env,
      getSupabase: deps.getSupabase,
      calculateStudioEstimateImpl: calculateImpl
    });

  const studioDigitalEstimateService = deps.studioDigitalEstimateService || null;
  const lifecycleRepository = deps.lifecycleRepository || null;

  function safeView(row, extras = {}) {
    if (typeof studioEstimateService.safeEstimateView === "function") {
      return studioEstimateService.safeEstimateView(row, extras);
    }
    return row;
  }

  /**
   * Read-only active estimate for a case. Never creates.
   * @param {string} organizationId
   * @param {string} intakeCaseId
   */
  async function loadActiveEstimateOrNull(organizationId, intakeCaseId) {
    const caseId = String(intakeCaseId || "").trim();
    if (!caseId) return null;
    return repository.getActiveByIntakeCase(organizationId, caseId);
  }

  async function loadPublicationBundle(organizationId, estimate) {
    if (!estimate?.id || !studioDigitalEstimateService) {
      return {
        publicationSummary: buildSafeStudioPublicationSummary({ estimate }),
        publications: [],
        activePublication: null,
        reviewRequests: [],
        readiness: null
      };
    }

    /** Prefer assessReadiness — includes publications + staff-safe URLs. */
    try {
      if (typeof studioDigitalEstimateService.assessReadiness === "function") {
        const readiness = await studioDigitalEstimateService.assessReadiness(
          organizationId,
          estimate.id,
          null
        );
        return {
          publicationSummary:
            readiness?.publicationSummary ||
            buildSafeStudioPublicationSummary({
              estimate,
              activePublication: readiness?.activePublication,
              publications: readiness?.publications,
              reviewRequests: readiness?.reviewRequests,
              customerViewed: readiness?.customerViewed
            }),
          publications: Array.isArray(readiness?.publications) ? readiness.publications : [],
          activePublication: readiness?.activePublication || null,
          reviewRequests: Array.isArray(readiness?.reviewRequests) ? readiness.reviewRequests : [],
          readiness: readiness?.readiness || null
        };
      }
    } catch {
      /* fall through */
    }

    try {
      if (typeof studioDigitalEstimateService.getWorkspacePublicationSummary === "function") {
        const pub = await studioDigitalEstimateService.getWorkspacePublicationSummary(
          organizationId,
          estimate.id
        );
        let publications = Array.isArray(pub?.publications) ? pub.publications : [];
        if (
          !publications.length &&
          typeof studioDigitalEstimateService.listPublications === "function"
        ) {
          try {
            const listed = await studioDigitalEstimateService.listPublications(
              organizationId,
              estimate.id
            );
            publications = Array.isArray(listed?.publications)
              ? listed.publications
              : Array.isArray(listed)
                ? listed
                : [];
          } catch {
            publications = [];
          }
        }
        return {
          publicationSummary:
            pub?.publicationSummary || buildSafeStudioPublicationSummary({ estimate }),
          publications,
          activePublication: pub?.activePublication || null,
          reviewRequests: Array.isArray(pub?.reviewRequests) ? pub.reviewRequests : [],
          readiness: null
        };
      }
    } catch {
      /* non-fatal */
    }

    return {
      publicationSummary: buildSafeStudioPublicationSummary({ estimate }),
      publications: [],
      activePublication: null,
      reviewRequests: [],
      readiness: null
    };
  }

  function buildApprovedPublishedPointers(estimate, pubBundle) {
    const approved =
      String(estimate?.status || "").toLowerCase() === STUDIO_ESTIMATE_STATUSES.APPROVED;
    const summary = pubBundle?.publicationSummary || null;
    return {
      approved,
      approvedAt: estimate?.approvedAt || estimate?.approval?.approvedAt || null,
      published: Boolean(summary?.active),
      publicationId: summary?.publicationId || null,
      customerUrl: summary?.customerUrl || null,
      publicationState: summary?.state || "not_published",
      statusLabel: summary?.statusLabel || "Not published"
    };
  }

  /**
   * GET working-draft — read-only shell payload.
   */
  async function getWorkingDraft({ organizationId, intakeCaseId }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      return {
        ok: true,
        code: STUDIO_V2_ERROR_CODES.NO_ESTIMATE,
        message: studioV2UserMessage(STUDIO_V2_ERROR_CODES.NO_ESTIMATE),
        empty: true,
        projectHeader: buildStudioV2ProjectHeader(null),
        scopeSummary: buildStudioV2ScopeSummary(null),
        lastCalculation: buildStudioV2CalculationResult(null),
        approvedPublished: {
          approved: false,
          approvedAt: null,
          published: false,
          publicationId: null,
          customerUrl: null,
          publicationState: "not_published",
          statusLabel: "Not published"
        },
        publicationSummary: buildSafeStudioPublicationSummary({}),
        originType: "unknown"
      };
    }

    if (isStudioV2OriginUnsupported(row)) {
      const estimate = safeView(row);
      return {
        ok: true,
        code: STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN,
        message: studioV2UserMessage(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN),
        empty: false,
        projectHeader: buildStudioV2ProjectHeader(estimate),
        scopeSummary: buildStudioV2ScopeSummary(estimate),
        lastCalculation: buildStudioV2CalculationResult(estimate),
        approvedPublished: buildApprovedPublishedPointers(estimate, null),
        publicationSummary: buildSafeStudioPublicationSummary({ estimate }),
        originType: resolveStudioV2OriginType(estimate),
        estimateId: estimate.id,
        status: estimate.status,
        revision: estimate.revision
      };
    }

    const estimate = safeView(row);
    const pubBundle = await loadPublicationBundle(organizationId, estimate);
    const estimateWithPub = safeView(row, { publication: pubBundle.publicationSummary });

    return {
      ok: true,
      code: null,
      message: null,
      empty: false,
      projectHeader: buildStudioV2ProjectHeader(estimateWithPub),
      scopeSummary: buildStudioV2ScopeSummary(estimateWithPub),
      lastCalculation: buildStudioV2CalculationResult(estimateWithPub),
      approvedPublished: buildApprovedPublishedPointers(estimateWithPub, pubBundle),
      publicationSummary: pubBundle.publicationSummary,
      originType: resolveStudioV2OriginType(estimateWithPub),
      estimateId: estimateWithPub.id,
      status: estimateWithPub.status,
      revision: estimateWithPub.revision
    };
  }

  /**
   * POST calculate — v4 only; no ensure-editable-draft; no refresh-from-takeoff.
   */
  async function calculateWorkingDraft({ organizationId, intakeCaseId, actorUserId }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }
    if (String(row.status || "").toLowerCase() === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        details: { estimateId: row.id }
      });
    }

    const scope = row.scope && typeof row.scope === "object" ? row.scope : {};
    let calc;
    try {
      calc = await calculateImpl({
        scope,
        actorUserId: actorUserId || null,
        env
      });
    } catch (e) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CALCULATE_FAILED, {
        message: e?.message || undefined,
        details: { causeCode: e?.code || null }
      });
    }

    let persisted = false;
    let nextRow = row;
    if (isStudioV2CalculationPersistable(row.status)) {
      nextRow = await repository.update(
        organizationId,
        row.id,
        {
          calculationSnapshot: calc,
          status: STUDIO_ESTIMATE_STATUSES.PRICED,
          staleReason: null
        },
        actorUserId || null
      );
      persisted = true;
    }

    const estimate = safeView(nextRow);
    return {
      ok: true,
      persisted,
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      calculation: buildStudioV2CalculationResult(estimate, calc),
      // Explicit contract for tests: these side-effect services were not invoked.
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        autoFork: false,
        scopeMutated: false
      }
    };
  }

  /**
   * POST publish — strict approved publish only. Never simplified-publish.
   */
  async function publishApproved({ organizationId, estimateId, actorUserId, body }) {
    if (!studioDigitalEstimateService || typeof studioDigitalEstimateService.publish !== "function") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNAVAILABLE, {
        message: "Digital Estimate publish is unavailable."
      });
    }

    const id = String(estimateId || "").trim();
    const row = await repository.getById(organizationId, id);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE, {
        statusCode: 404,
        message: "Estimate not found."
      });
    }

    const status = String(row.status || "").toLowerCase();
    if (status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        details: { estimateId: row.id }
      });
    }
    if (status !== STUDIO_ESTIMATE_STATUSES.APPROVED) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED);
    }

    const confirmBody = {
      ...(body && typeof body === "object" ? body : {}),
      confirm: true
    };
    // Strip simplified-publish orchestration hooks if a client sends them.
    delete confirmBody.autoConfirm;
    delete confirmBody.autoCalculate;
    delete confirmBody.autoApprove;
    delete confirmBody.simplified;

    try {
      const result = await studioDigitalEstimateService.publish({
        organizationId,
        estimateId: row.id,
        actorUserId: actorUserId || null,
        body: confirmBody
      });
      return {
        ok: true,
        publication: result?.publication || null,
        customerUrl: result?.customerUrl || result?.publication?.customerUrl || null,
        linkStatus: result?.linkStatus || result?.publication?.linkStatus || null,
        reused: Boolean(result?.reused),
        staffNotice: result?.staffNotice || null,
        sideEffects: {
          simplifiedPublish: false,
          autoConfirm: false,
          autoCalculate: false,
          autoApprove: false
        }
      };
    } catch (e) {
      const rawCode = e?.code || null;
      const mapped = mapPublishBlockerCode(rawCode);
      if (mapped === STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED) {
        throw createStudioV2Error(STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED);
      }
      const blockers = sanitizePublishBlockers(e?.blockers || e?.blockingReasons);
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED, {
        message: e?.message && Number(e?.statusCode) < 500 ? e.message : undefined,
        statusCode: Number(e?.statusCode) >= 400 && Number(e?.statusCode) < 500 ? e.statusCode : 409,
        blockers,
        details: { causeCode: rawCode }
      });
    }
  }

  /**
   * GET customer-activity — read-only aggregation.
   */
  async function getCustomerActivity({ organizationId, intakeCaseId }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    const estimate = safeView(row);
    const pubBundle = await loadPublicationBundle(organizationId, estimate);
    const publications = Array.isArray(pubBundle.publications) ? pubBundle.publications : [];

    const classified = publications.map((p) => {
      const active = isCurrentActivePublicationForEstimate(estimate, p);
      const historical = !active && isHistoricalPublicationForEstimate(estimate, p);
      const norm = normalizePublicationStatus(p);
      return {
        publicationId: p.id || p.publicationId || null,
        status: norm,
        active,
        historical,
        revision: Number(p.revisionNumber ?? p.revision_number ?? p.revision) || null,
        publishedAt: p.publishedAt || p.published_at || null,
        customerUrl: typeof p.customerUrl === "string" ? p.customerUrl : null,
        linkStatus: p.linkStatus != null ? String(p.linkStatus) : null
      };
    });

    const reviewRequests = (pubBundle.reviewRequests || []).map((r) => ({
      id: r.id || null,
      status: r.status || null,
      publicationId: r.publicationId || r.publication_id || null,
      requestedAt: r.requestedAt || r.created_at || null,
      open: ["open", "new", "pending", "submitted"].includes(
        String(r.status || "").toLowerCase()
      )
    }));

    let acceptance = null;
    if (lifecycleRepository && typeof lifecycleRepository.getAcceptanceForEstimate === "function") {
      try {
        const a = await lifecycleRepository.getAcceptanceForEstimate(organizationId, estimate.id);
        if (a) {
          acceptance = {
            id: a.id,
            acceptedAt: a.accepted_at || a.acceptedAt || null,
            estimateRevision: a.estimate_revision ?? a.estimateRevision ?? null,
            publicationId: a.publication_id || a.publicationId || null,
            customerDisplayTotal: a.customer_display_total ?? a.customerDisplayTotal ?? null
          };
        }
      } catch {
        acceptance = null;
      }
    }

    const summary = pubBundle.publicationSummary || buildSafeStudioPublicationSummary({ estimate });
    const activityFlags = {
      viewed: Boolean(
        summary.customerActivityState === "customer_viewed" ||
          /viewed/i.test(String(summary.customerActivityState || ""))
      ),
      savedSelections: Boolean(
        /saved|configured|selection/i.test(String(summary.customerActivityState || ""))
      ),
      reviewRequested: Boolean(summary.reviewRequestOpen),
      accepted: Boolean(acceptance)
    };

    return {
      ok: true,
      estimateId: estimate.id,
      revision: estimate.revision,
      publicationSummary: summary,
      publications: classified,
      activePublication: classified.find((p) => p.active) || null,
      historicalPublications: classified.filter((p) => p.historical),
      reviewRequests,
      acceptance,
      activity: activityFlags
    };
  }

  return {
    getWorkingDraft,
    calculateWorkingDraft,
    publishApproved,
    getCustomerActivity,
    // Exposed for tests — prove wrappers never reference forbidden services.
    _internals: {
      calculateImpl,
      repository,
      studioEstimateService,
      studioDigitalEstimateService
    }
  };
}
