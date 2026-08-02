/**
 * Elite 100 Studio V2 — additive working-draft / calculate / publish / scope / options / approve wrappers.
 *
 * Hard rules:
 * - Does not call ensure-editable-draft, open-measurement-revision, or simplified-publish.
 * - Create-revision uses repository.createSiblingRevisionFrom only (no Takeoff reopen).
 * - Calculate wraps calculateStudioEstimateV4 without refresh-from-takeoff or scope mutation.
 * - Scope / options PATCH / takeoff apply / approve persist via repository.update only.
 * - Does not call V1 studioEstimateService.approve (refreshTakeoffGate side effects).
 * - Publish is strict (approved only) via existing digital-estimate publish service.
 * - Approval never publishes. Publish never auto-approves / auto-calculates.
 * - Create-revision never auto-publishes / auto-approves / auto-calculates.
 */

import { calculateStudioEstimateV4 } from "./elite100RoomPricingStudioAdapter.mjs";
import { createStudioEstimateRepository } from "./studioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  getLatestTakeoffResult,
  getTakeoffWorkspace
} from "../takeoff/takeoffWorkspaceService.mjs";
import {
  createStudioV2Error,
  mapPublishBlockerCode,
  sanitizePublishBlockers,
  STUDIO_V2_ERROR_CODES,
  studioV2UserMessage
} from "./studioV2Errors.mjs";
import {
  isOpenDigitalEstimateReviewRequestStatus,
  OPEN_REVIEW_REQUEST_STATUSES,
  REVIEW_STATUS
} from "../digitalEstimate/configuration/amendmentConfig.mjs";
import {
  buildStudioV2CalculationResult,
  buildStudioV2ProjectHeader,
  buildStudioV2ScopeSummary,
  isStudioV2CalculationPersistable,
  isStudioV2OriginUnsupported,
  needsStudioV2TakeoffImport,
  resolveStudioV2OriginType
} from "./studioV2WorkingDraft.mjs";
import {
  assessStudioV2ScopeEditability,
  buildStudioV2EditableScope,
  normalizeStudioV2ScopePatch
} from "./studioV2ScopeEditor.mjs";
import {
  buildStudioV2TakeoffImportPreviewDto,
  currentScopeIsEmpty,
  mapTakeoffPayloadToStudioV2Scope,
  resolveStudioV2TakeoffImportPayload
} from "./studioV2TakeoffImport.mjs";
import {
  buildStudioV2EditableOptions,
  normalizeStudioV2OptionsPatch
} from "./studioV2EstimateOptions.mjs";
import {
  assessStudioV2ApprovalReadiness,
  buildStudioV2ApprovalPayload,
  buildStudioV2ApprovedSummary
} from "./studioV2Approval.mjs";
import {
  assessStudioV2PublishReadiness,
  assertStudioV2InteractivePublishResult,
  buildStudioV2PublicationResult,
  sanitizeStudioV2PublishBody
} from "./studioV2Publish.mjs";
import {
  buildStudioV2EditablePricing,
  normalizeStudioV2PricingPatch
} from "./studioV2Pricing.mjs";
import {
  buildSafeStudioPublicationSummary,
  isCurrentActivePublicationForEstimate,
  isHistoricalPublicationForEstimate,
  normalizePublicationStatus
} from "./studioPublicationSummary.mjs";
import {
  buildEmptyCustomerSelectionReview,
  buildStudioCustomerSelectionReview
} from "./studioCustomerSelectionReview.mjs";
import {
  buildStudioV2RevisionAffordance,
  buildStudioV2RevisionSummary,
  deepCloneStudioV2Json,
  isStudioV2ApprovedSnapshot,
  isStudioV2EditableWorkingDraft
} from "./studioV2Revision.mjs";
import {
  buildCustomerSelectionRevisionInfo,
  customerSelectionRevisionEstimateId,
  mapCustomerConfigurationToStudioV2DraftPatch,
  matchesCustomerSelectionRevision
} from "./studioV2CustomerSelectionRevision.mjs";

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: () => any,
 *   repository?: any,
 *   studioEstimateService?: any,
 *   studioDigitalEstimateService?: any,
 *   lifecycleRepository?: any,
 *   amendmentRepository?: any,
 *   configurationRepository?: any,
 *   configurationStudioService?: any,
 *   calculateStudioEstimateImpl?: Function,
 *   loadTakeoffWorkspace?: Function,
 *   loadLatestTakeoffResult?: Function
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
  const amendmentRepository = deps.amendmentRepository || null;

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
  const configurationRepository = deps.configurationRepository || null;
  const configurationStudioService = deps.configurationStudioService || null;

  const loadWorkspace =
    deps.loadTakeoffWorkspace ||
    (async ({ organizationId, takeoffJobId }) => {
      const supabase = deps.getSupabase?.();
      if (!supabase) {
        const err = new Error("Takeoff workspace unavailable");
        err.statusCode = 503;
        err.code = STUDIO_V2_ERROR_CODES.UNAVAILABLE;
        throw err;
      }
      return getTakeoffWorkspace({ supabase, organizationId, takeoffJobId });
    });

  const loadLatestResult =
    deps.loadLatestTakeoffResult ||
    (async ({ organizationId, takeoffJobId }) => {
      const supabase = deps.getSupabase?.();
      if (!supabase) return null;
      return getLatestTakeoffResult({ supabase, organizationId, takeoffJobId });
    });

  function safeView(row, extras = {}) {
    if (typeof studioEstimateService.safeEstimateView === "function") {
      return studioEstimateService.safeEstimateView(row, extras);
    }
    return row;
  }

  function assertEditableWorkingDraft(row) {
    const editability = assessStudioV2ScopeEditability(row);
    if (!editability.editable) {
      const code =
        editability.code === "approved_snapshot_readonly"
          ? STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
          : editability.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED;
      throw createStudioV2Error(code, {
        message: editability.message || undefined,
        details: { estimateId: row.id, status: row.status, revision: row.revision }
      });
    }
    return editability;
  }

  async function loadTakeoffSources(row) {
    const takeoffJobId = row.takeoffJobId ? String(row.takeoffJobId).trim() : "";
    if (!takeoffJobId) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_TAKEOFF_AVAILABLE);
    }
    let workspace = null;
    let latest = null;
    try {
      workspace = await loadWorkspace({
        organizationId: row.organizationId,
        takeoffJobId
      });
    } catch (e) {
      if (e?.statusCode === 404 || e?.code === "takeoff_unavailable") {
        throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_TAKEOFF_AVAILABLE);
      }
      throw e;
    }
    try {
      latest = await loadLatestResult({
        organizationId: row.organizationId,
        takeoffJobId
      });
    } catch {
      latest = null;
    }
    return { takeoffJobId, workspace, latest };
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

  function publicationIsActive(pubBundle) {
    const summary = pubBundle?.publicationSummary;
    if (summary?.active) return true;
    if (pubBundle?.activePublication) return true;
    const state = String(summary?.state || "").toLowerCase();
    return state.includes("published") && !state.includes("not_published");
  }

  function extractRevisionOrigin(scope) {
    const origin = scope?.studioV2RevisionOrigin;
    if (!origin || typeof origin !== "object") return null;
    return {
      estimateId: origin.basedOnEstimateId || null,
      revision: origin.basedOnRevision != null ? Number(origin.basedOnRevision) : null
    };
  }

  /**
   * GET working-draft — read-only shell payload.
   */
  async function getWorkingDraft({ organizationId, intakeCaseId, actorUserId = null }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      return {
        ok: true,
        code: STUDIO_V2_ERROR_CODES.NO_ESTIMATE,
        message: studioV2UserMessage(STUDIO_V2_ERROR_CODES.NO_ESTIMATE),
        empty: true,
        projectHeader: buildStudioV2ProjectHeader(null),
        scopeSummary: buildStudioV2ScopeSummary(null),
        editableScope: buildStudioV2EditableScope(null),
        editableOptions: buildStudioV2EditableOptions(null),
        editablePricing: buildStudioV2EditablePricing(null, { env }),
        scopeEditable: false,
        optionsEditable: false,
        pricingEditable: false,
        scopeEditability: {
          editable: false,
          code: STUDIO_V2_ERROR_CODES.NO_ESTIMATE,
          message: studioV2UserMessage(STUDIO_V2_ERROR_CODES.NO_ESTIMATE)
        },
        lastCalculation: buildStudioV2CalculationResult(null),
        approvalReadiness: assessStudioV2ApprovalReadiness(null),
        approvedSummary: buildStudioV2ApprovedSummary(null),
        revisionAffordance: buildStudioV2RevisionAffordance(null),
        customerSelectionRevision: null,
        publishReadiness: assessStudioV2PublishReadiness(null),
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
      const editability = assessStudioV2ScopeEditability(row);
      return {
        ok: true,
        code: STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN,
        message: studioV2UserMessage(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN),
        empty: false,
        projectHeader: buildStudioV2ProjectHeader(estimate),
        scopeSummary: buildStudioV2ScopeSummary(estimate),
        editableScope: buildStudioV2EditableScope(estimate),
        editableOptions: buildStudioV2EditableOptions(estimate),
        editablePricing: buildStudioV2EditablePricing(estimate, {
          actorUserId: actorUserId || null,
          env
        }),
        scopeEditable: false,
        optionsEditable: false,
        pricingEditable: false,
        scopeEditability: editability,
        takeoffImportNeeded: needsStudioV2TakeoffImport(row),
        takeoffJobId: row.takeoffJobId || null,
        lastCalculation: buildStudioV2CalculationResult(estimate),
        approvalReadiness: assessStudioV2ApprovalReadiness(row),
        approvedSummary: buildStudioV2ApprovedSummary(estimate),
        revisionAffordance: buildStudioV2RevisionAffordance(estimate),
        customerSelectionRevision: buildCustomerSelectionRevisionInfo(row.scope, {
          status: row.status,
          needsRecalculation: !row.calculationSnapshot
        }),
        publishReadiness: assessStudioV2PublishReadiness(row),
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
    const editability = assessStudioV2ScopeEditability(row);
    const basedOn = extractRevisionOrigin(row.scope);
    let priorPublished = publicationIsActive(pubBundle);
    // Sibling draft may not own the customer publication — check source if known.
    if (!priorPublished && basedOn?.estimateId && basedOn.estimateId !== row.id) {
      try {
        const source = await repository.getById(organizationId, basedOn.estimateId);
        if (source) {
          const sourcePub = await loadPublicationBundle(organizationId, source);
          priorPublished = publicationIsActive(sourcePub);
        }
      } catch {
        /* non-fatal */
      }
    }
    const revisionOpts = { priorPublished, basedOn };
    const revisionAffordance = buildStudioV2RevisionAffordance(estimateWithPub, revisionOpts);

    return {
      ok: true,
      code: null,
      message: null,
      empty: false,
      projectHeader: buildStudioV2ProjectHeader(estimateWithPub),
      scopeSummary: buildStudioV2ScopeSummary(estimateWithPub),
      editableScope: buildStudioV2EditableScope(estimateWithPub),
      editableOptions: buildStudioV2EditableOptions(estimateWithPub),
      editablePricing: buildStudioV2EditablePricing(estimateWithPub, {
        actorUserId: actorUserId || null,
        env
      }),
      scopeEditable: editability.editable,
      optionsEditable: editability.editable,
      pricingEditable: editability.editable,
      scopeEditability: editability,
      takeoffImportNeeded: needsStudioV2TakeoffImport(row),
      takeoffJobId: row.takeoffJobId || null,
      lastCalculation: buildStudioV2CalculationResult(estimateWithPub),
      approvalReadiness: assessStudioV2ApprovalReadiness(row),
      approvedSummary: buildStudioV2ApprovedSummary(estimateWithPub, revisionOpts),
      revisionAffordance,
      customerSelectionRevision: buildCustomerSelectionRevisionInfo(row.scope, {
        status: row.status,
        published: (pubBundle.publications || []).some((publication) =>
          isCurrentActivePublicationForEstimate(row, publication)
        ),
        needsRecalculation: !row.calculationSnapshot
      }),
      publishReadiness: assessStudioV2PublishReadiness(row),
      approvedPublished: buildApprovedPublishedPointers(estimateWithPub, pubBundle),
      publicationSummary: pubBundle.publicationSummary,
      originType: resolveStudioV2OriginType(estimateWithPub),
      estimateId: estimateWithPub.id,
      status: estimateWithPub.status,
      revision: estimateWithPub.revision,
      updatedAt: estimateWithPub.updatedAt || null
    };
  }

  /**
   * GET takeoff-import-preview — read-only mapped scope. Never mutates.
   */
  async function previewTakeoffImport({ organizationId, intakeCaseId }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const { takeoffJobId, workspace, latest } = await loadTakeoffSources(row);
    const resolved = resolveStudioV2TakeoffImportPayload({
      takeoffJobId,
      workspace,
      latest
    });
    if (!resolved.ok) {
      throw createStudioV2Error(resolved.code, { message: resolved.message });
    }

    let mappedScope;
    try {
      mappedScope = mapTakeoffPayloadToStudioV2Scope(resolved.payload, row.scope);
    } catch (e) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.TAKEOFF_MAPPING_FAILED, {
        message: e?.message || undefined
      });
    }

    const estimate = safeView(row);
    return buildStudioV2TakeoffImportPreviewDto({
      estimate,
      mappedScope,
      reviewStatus: resolved.reviewStatus,
      takeoffJobId,
      resultId: resolved.resultId
    });
  }

  /**
   * POST takeoff-import-apply — explicit estimator import into Working Draft.
   * Never calls refresh-from-takeoff / ensure-editable-draft / approve / publish.
   */
  async function applyTakeoffImport({ organizationId, intakeCaseId, actorUserId, body }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }
    assertEditableWorkingDraft(row);

    const mode = String(body?.mode || "").trim();
    const confirmed = body?.confirmed === true || body?.confirmed === "true";
    if (!confirmed) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "Explicit confirmation is required to apply Takeoff import.",
        details: { issues: [{ field: "confirmed", message: "confirmed: true is required" }] }
      });
    }
    if (mode !== "replace_empty" && mode !== "replace_all") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "Import mode must be replace_empty or replace_all.",
        details: { issues: [{ field: "mode", message: "Invalid mode" }] }
      });
    }

    const scopeEmpty = currentScopeIsEmpty(row.scope);
    if (!scopeEmpty && mode !== "replace_all") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.EXISTING_SCOPE_CONFIRMATION_REQUIRED, {
        details: {
          currentScopeEmpty: false,
          allowedModes: ["replace_all"]
        }
      });
    }
    if (scopeEmpty && mode === "replace_empty") {
      // ok
    } else if (mode === "replace_all" && confirmed) {
      // ok
    } else if (!scopeEmpty && mode === "replace_empty") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.EXISTING_SCOPE_CONFIRMATION_REQUIRED);
    }

    const { takeoffJobId, workspace, latest } = await loadTakeoffSources(row);
    const resolved = resolveStudioV2TakeoffImportPayload({
      takeoffJobId,
      workspace,
      latest
    });
    if (!resolved.ok) {
      throw createStudioV2Error(resolved.code, { message: resolved.message });
    }

    let mappedScope;
    try {
      mappedScope = mapTakeoffPayloadToStudioV2Scope(resolved.payload, row.scope);
    } catch (e) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.TAKEOFF_MAPPING_FAILED, {
        message: e?.message || undefined
      });
    }

    if (!Array.isArray(mappedScope.rooms) || mappedScope.rooms.length === 0) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.TAKEOFF_MAPPING_FAILED, {
        message: "Takeoff mapped to an empty scope."
      });
    }

    // Preserve server identity authority markers from the existing scope.
    mappedScope.estimateOrigin =
      row.scope?.estimateOrigin || mappedScope.estimateOrigin || "email_ai_takeoff";
    mappedScope.physicalScopeSource = "takeoff";

    const statusBefore = String(row.status || "").toLowerCase();
    /** @type {Record<string, unknown>} */
    const patch = {
      scope: mappedScope,
      sourceTakeoffResultId: resolved.resultId || row.sourceTakeoffResultId || null,
      staleReason: "Scope changed — recalculate"
    };
    if (statusBefore === STUDIO_ESTIMATE_STATUSES.PRICED) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      patch.calculationSnapshot = null;
    } else if (statusBefore !== STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL) {
      patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
    } else {
      // Empty takeoff drafts often sit in needs_takeoff_approval — after import,
      // scope is present so move to draft for estimator review/calculate.
      patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
    }

    const updated = await repository.update(
      organizationId,
      row.id,
      patch,
      actorUserId || null
    );
    const estimate = safeView(updated);
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      caseId: String(intakeCaseId),
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      mode,
      takeoffJobId,
      resultId: resolved.resultId,
      scopeSummary: buildStudioV2ScopeSummary(estimate),
      editableScope: buildStudioV2EditableScope(estimate),
      scopeEditable: true,
      takeoffImportNeeded: false,
      updatedAt: estimate.updatedAt || null,
      clientMutationId,
      lastCalculation: buildStudioV2CalculationResult(estimate),
      warnings: [
        "Takeoff scope applied to Working Draft. Recalculate to update total."
      ],
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        autoFork: false,
        updateScope: false,
        approve: false,
        publish: false
      }
    };
  }

  /**
   * PATCH working-draft scope — physical measurements only.
   * Persists via repository.update. Never calls updateScope / ensure-editable-draft /
   * refresh-from-takeoff / approve / publish.
   */
  async function patchWorkingDraftScope({
    organizationId,
    intakeCaseId,
    actorUserId,
    body
  }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const editability = assessStudioV2ScopeEditability(row);
    if (!editability.editable) {
      const code =
        editability.code === "approved_snapshot_readonly"
          ? STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
          : editability.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED;
      throw createStudioV2Error(code, {
        message: editability.message || undefined,
        details: { estimateId: row.id, status: row.status, revision: row.revision }
      });
    }

    const expectedRevision =
      body?.expectedRevision != null ? Number(body.expectedRevision) : null;
    if (
      expectedRevision != null &&
      Number.isFinite(expectedRevision) &&
      Number(row.revision) !== expectedRevision
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "This working draft changed. Reload before saving scope.",
        details: {
          estimateId: row.id,
          revision: row.revision,
          expectedRevision
        }
      });
    }

    const incomingScope =
      body?.scope && typeof body.scope === "object"
        ? body.scope
        : body && typeof body === "object"
          ? body
          : {};
    const normalized = normalizeStudioV2ScopePatch({
      existingScope: row.scope && typeof row.scope === "object" ? row.scope : {},
      incomingScope,
      originType: resolveStudioV2OriginType(row)
    });
    if (!normalized.ok) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        details: { issues: normalized.issues },
        statusCode: 422
      });
    }

    const statusBefore = String(row.status || "").toLowerCase();
    /** @type {Record<string, unknown>} */
    const patch = {
      scope: normalized.scope,
      staleReason: "Scope changed — recalculate"
    };
    if (statusBefore === STUDIO_ESTIMATE_STATUSES.PRICED) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      patch.calculationSnapshot = null;
    } else if (statusBefore !== STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL) {
      patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
    }

    const updated = await repository.update(
      organizationId,
      row.id,
      patch,
      actorUserId || null
    );
    const estimate = safeView(updated);
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      caseId: String(intakeCaseId),
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      scopeSummary: buildStudioV2ScopeSummary(estimate),
      editableScope: buildStudioV2EditableScope(estimate),
      scopeEditable: true,
      updatedAt: estimate.updatedAt || null,
      clientMutationId,
      warnings: normalized.warnings || [],
      lastCalculation: buildStudioV2CalculationResult(estimate),
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        autoFork: false,
        updateScope: false,
        approve: false,
        publish: false
      }
    };
  }

  /**
   * PATCH working-draft options — estimator commercial lines only.
   * Persists scope.customLineItems via repository.update. Never auto-forks /
   * ensure-editable-draft / refresh-from-takeoff / approve / publish.
   */
  async function patchWorkingDraftOptions({
    organizationId,
    intakeCaseId,
    actorUserId,
    body
  }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const editability = assessStudioV2ScopeEditability(row);
    if (!editability.editable) {
      const code =
        editability.code === "approved_snapshot_readonly"
          ? STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
          : editability.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED;
      throw createStudioV2Error(code, {
        message: editability.message || undefined,
        details: { estimateId: row.id, status: row.status, revision: row.revision }
      });
    }

    const expectedRevision =
      body?.expectedRevision != null ? Number(body.expectedRevision) : null;
    if (
      expectedRevision != null &&
      Number.isFinite(expectedRevision) &&
      Number(row.revision) !== expectedRevision
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "This working draft changed. Reload before saving options.",
        details: {
          estimateId: row.id,
          revision: row.revision,
          expectedRevision
        }
      });
    }

    const optionsPayload =
      body?.options && typeof body.options === "object"
        ? body.options
        : body && typeof body === "object"
          ? body
          : {};
    const normalized = normalizeStudioV2OptionsPatch({
      existingScope: row.scope && typeof row.scope === "object" ? row.scope : {},
      options: optionsPayload
    });
    if (!normalized.ok) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "Estimate options could not be saved. Check the fields and try again.",
        details: { issues: normalized.issues },
        statusCode: 422
      });
    }

    const statusBefore = String(row.status || "").toLowerCase();
    /** @type {Record<string, unknown>} */
    const patch = {
      scope: normalized.scope,
      staleReason: "Estimate options changed — recalculate"
    };
    if (statusBefore === STUDIO_ESTIMATE_STATUSES.PRICED) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      patch.calculationSnapshot = null;
    } else if (statusBefore !== STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL) {
      patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
    }

    const updated = await repository.update(
      organizationId,
      row.id,
      patch,
      actorUserId || null
    );
    const estimate = safeView(updated);
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      caseId: String(intakeCaseId),
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      editableOptions: buildStudioV2EditableOptions(estimate),
      optionsEditable: true,
      scopeSummary: buildStudioV2ScopeSummary(estimate),
      updatedAt: estimate.updatedAt || null,
      clientMutationId,
      warnings: normalized.warnings || [],
      lastCalculation: buildStudioV2CalculationResult(estimate),
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        openMeasurementRevision: false,
        autoFork: false,
        updateScope: false,
        approve: false,
        publish: false
      }
    };
  }

  /**
   * PATCH working-draft pricing — basis / material group / optional adjustments.
   * Persists via repository.update. Never auto-forks / ensure-editable-draft /
   * refresh-from-takeoff / approve / publish / simplified-publish.
   */
  async function patchWorkingDraftPricing({
    organizationId,
    intakeCaseId,
    actorUserId,
    body
  }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const editability = assessStudioV2ScopeEditability(row);
    if (!editability.editable) {
      const code =
        editability.code === "approved_snapshot_readonly"
          ? STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
          : editability.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED;
      throw createStudioV2Error(code, {
        message: editability.message || undefined,
        details: { estimateId: row.id, status: row.status, revision: row.revision }
      });
    }

    const expectedRevision =
      body?.expectedRevision != null ? Number(body.expectedRevision) : null;
    if (
      expectedRevision != null &&
      Number.isFinite(expectedRevision) &&
      Number(row.revision) !== expectedRevision
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "This working draft changed. Reload before saving pricing.",
        details: {
          estimateId: row.id,
          revision: row.revision,
          expectedRevision
        }
      });
    }

    const pricingPayload =
      body?.pricing && typeof body.pricing === "object"
        ? body.pricing
        : body && typeof body === "object"
          ? body
          : {};
    const normalized = normalizeStudioV2PricingPatch({
      existingScope: row.scope && typeof row.scope === "object" ? row.scope : {},
      pricing: pricingPayload,
      actorUserId: actorUserId || null,
      env
    });
    if (!normalized.ok) {
      const markupForbidden = (normalized.issues || []).some(
        (i) =>
          i.field === "pricing.internalMarkupPercent" &&
          /not authorized/i.test(String(i.message || ""))
      );
      throw createStudioV2Error(
        markupForbidden ? STUDIO_V2_ERROR_CODES.FORBIDDEN : STUDIO_V2_ERROR_CODES.VALIDATION_FAILED,
        {
          message: markupForbidden
            ? "Not authorized to apply internal material markup."
            : "Pricing settings could not be saved. Check the fields and try again.",
          details: { issues: normalized.issues },
          statusCode: markupForbidden ? 403 : 422
        }
      );
    }

    const statusBefore = String(row.status || "").toLowerCase();
    /** @type {Record<string, unknown>} */
    const patch = {
      scope: normalized.scope,
      staleReason: "Pricing settings changed — recalculate"
    };
    if (statusBefore === STUDIO_ESTIMATE_STATUSES.PRICED) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      patch.calculationSnapshot = null;
    } else if (statusBefore !== STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL) {
      patch.status = STUDIO_ESTIMATE_STATUSES.DRAFT;
    }

    const updated = await repository.update(
      organizationId,
      row.id,
      patch,
      actorUserId || null
    );
    const estimate = safeView(updated);
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      caseId: String(intakeCaseId),
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      editablePricing: buildStudioV2EditablePricing(estimate, {
        actorUserId: actorUserId || null,
        env
      }),
      pricingEditable: true,
      projectHeader: buildStudioV2ProjectHeader(estimate),
      scopeSummary: buildStudioV2ScopeSummary(estimate),
      updatedAt: estimate.updatedAt || null,
      clientMutationId,
      warnings: normalized.warnings || [],
      lastCalculation: buildStudioV2CalculationResult(estimate),
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        openMeasurementRevision: false,
        autoFork: false,
        updateScope: false,
        approve: false,
        publish: false,
        simplifiedPublish: false
      }
    };
  }

  /**
   * POST working-draft/approve — freeze Working Draft into approved snapshot.
   * Persists via repository.update with V1-compatible approval payload.
   * Never calls V1 approve (refreshTakeoffGate), ensure-editable-draft,
   * open-measurement-revision, refresh-from-takeoff, simplified-publish, or publish.
   */
  async function approveWorkingDraft({
    organizationId,
    intakeCaseId,
    actorUserId,
    body
  }) {
    const row = await loadActiveEstimateOrNull(organizationId, intakeCaseId);
    if (!row) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    }
    if (isStudioV2OriginUnsupported(row)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const confirmed = body?.confirmed === true || body?.confirm === true;
    if (!confirmed) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "confirmed: true is required to approve.",
        statusCode: 400,
        details: { field: "confirmed" }
      });
    }

    const expectedRevision =
      body?.expectedRevision != null ? Number(body.expectedRevision) : null;
    if (
      expectedRevision != null &&
      Number.isFinite(expectedRevision) &&
      Number(row.revision) !== expectedRevision
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "This working draft changed. Reload before approving.",
        details: {
          estimateId: row.id,
          revision: row.revision,
          expectedRevision
        }
      });
    }

    const readiness = assessStudioV2ApprovalReadiness(row);
    if (!readiness.allowed) {
      const code =
        readiness.code === "approved_snapshot_readonly"
          ? STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY
          : readiness.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : readiness.code === "not_priced"
              ? STUDIO_V2_ERROR_CODES.NOT_PRICED
              : readiness.code === "calculation_stale"
                ? STUDIO_V2_ERROR_CODES.CALCULATION_STALE
                : readiness.code === "approval_blocked"
                  ? STUDIO_V2_ERROR_CODES.APPROVAL_BLOCKED
                  : readiness.code === "no_estimate"
                    ? STUDIO_V2_ERROR_CODES.NO_ESTIMATE
                    : STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED;
      throw createStudioV2Error(code, {
        message: readiness.message || undefined,
        blockers: readiness.blockers,
        details: {
          estimateId: row.id,
          status: row.status,
          revision: row.revision,
          blockers: readiness.blockers
        }
      });
    }

    const approvalNote =
      typeof body?.approvalNote === "string" ? body.approvalNote.trim().slice(0, 500) : "";
    const approval = buildStudioV2ApprovalPayload(row, {
      actorUserId: actorUserId || null,
      approvalNote: approvalNote || null
    });

    const updated = await repository.update(
      organizationId,
      row.id,
      {
        status: STUDIO_ESTIMATE_STATUSES.APPROVED,
        approval,
        staleReason: null
      },
      actorUserId || null
    );

    const estimate = safeView(updated);
    const pubBundle = await loadPublicationBundle(organizationId, estimate);
    const estimateWithPub = safeView(updated, { publication: pubBundle.publicationSummary });
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      caseId: String(intakeCaseId),
      estimateId: estimate.id,
      status: estimate.status,
      revision: estimate.revision,
      approvedAt: approval.approvedAt,
      approvedBy: approval.approvedByUserId,
      calculation: buildStudioV2CalculationResult(estimateWithPub),
      approvedSummary: buildStudioV2ApprovedSummary(estimateWithPub),
      approvalReadiness: assessStudioV2ApprovalReadiness(updated),
      scopeEditable: false,
      optionsEditable: false,
      scopeEditability: assessStudioV2ScopeEditability(updated),
      approvedPublished: buildApprovedPublishedPointers(estimateWithPub, pubBundle),
      publication: pubBundle.publicationSummary,
      publicationSummary: pubBundle.publicationSummary,
      clientMutationId,
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        openMeasurementRevision: false,
        autoFork: false,
        v1Approve: false,
        publish: false,
        simplifiedPublish: false
      }
    };
  }

  /**
   * POST approved/:estimateId/create-revision — fork editable Working Draft from
   * an approved snapshot via repository.createSiblingRevisionFrom.
   * Never mutates the approved source scope/approval/calculation.
   * Never calls ensure-editable-draft / open-measurement-revision /
   * refresh-from-takeoff / Takeoff reopen / publish / auto-approve / auto-calculate.
   */
  async function createEditableSiblingFromApproved({
    organizationId,
    source,
    scope,
    actorUserId,
    staleReason,
    revisionId = null
  }) {
    if (typeof repository.createSiblingRevisionFrom !== "function") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNAVAILABLE, {
        message: "Revision creation is unavailable for this repository."
      });
    }
    return repository.createSiblingRevisionFrom(
      organizationId,
      source.id,
      {
        ...(revisionId ? { id: revisionId } : {}),
        status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
        scope,
        takeoffJobId: source.takeoffJobId,
        sourceTakeoffResultId: source.sourceTakeoffResultId,
        staleReason
      },
      actorUserId || null
    );
  }

  async function createRevisionFromApproved({
    organizationId,
    intakeCaseId,
    estimateId,
    actorUserId,
    body
  }) {
    const caseId = String(intakeCaseId || "").trim();
    const sourceId = String(estimateId || "").trim();
    if (!caseId || !sourceId) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "caseId and estimateId are required.",
        statusCode: 400
      });
    }

    const confirmed = body?.confirmed === true || body?.confirm === true;
    if (!confirmed) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "confirmed: true is required to create a revision.",
        statusCode: 400,
        details: { field: "confirmed" }
      });
    }

    const source = await repository.getById(organizationId, sourceId);
    if (!source) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE, {
        message: "Approved estimate not found.",
        statusCode: 404
      });
    }
    if (String(source.intakeCaseId || "") !== caseId) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.FORBIDDEN, {
        message: "Estimate does not belong to this case.",
        statusCode: 403,
        details: { estimateId: source.id, intakeCaseId: caseId }
      });
    }
    if (String(source.status || "").toLowerCase() === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        details: { estimateId: source.id, revision: source.revision }
      });
    }
    if (!isStudioV2ApprovedSnapshot(source)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.REVISION_REQUIRES_APPROVED, {
        details: { estimateId: source.id, status: source.status, revision: source.revision }
      });
    }
    if (isStudioV2OriginUnsupported(source)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const sourcePub = await loadPublicationBundle(organizationId, source);
    const priorPublished = publicationIsActive(sourcePub);
    const reason =
      typeof body?.reason === "string"
        ? body.reason.trim().slice(0, 500)
        : typeof body?.note === "string"
          ? body.note.trim().slice(0, 500)
          : "";

    // Idempotent: reuse an existing editable sibling draft for this case.
    if (typeof repository.listByIntakeCase === "function") {
      const siblings = await repository.listByIntakeCase(organizationId, caseId);
      const drafts = (siblings || [])
        .filter((s) => s && s.id !== source.id && isStudioV2EditableWorkingDraft(s))
        .sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1));
      const existing = drafts[0] || null;
      if (existing) {
        const estimate = safeView(existing);
        const editability = assessStudioV2ScopeEditability(existing);
        const revisionSummary = buildStudioV2RevisionSummary(source, existing, {
          priorPublished,
          reason: reason || null
        });
        return {
          ok: true,
          created: false,
          reused: true,
          caseId,
          estimateId: estimate.id,
          revision: estimate.revision,
          status: estimate.status,
          basedOnEstimateId: source.id,
          basedOnRevision: source.revision,
          scopeEditable: editability.editable,
          optionsEditable: editability.editable,
          pricingEditable: editability.editable,
          scopeEditability: editability,
          scopeSummary: buildStudioV2ScopeSummary(estimate),
          editableScope: buildStudioV2EditableScope(estimate),
          editableOptions: buildStudioV2EditableOptions(estimate),
          editablePricing: buildStudioV2EditablePricing(estimate, {
            actorUserId: actorUserId || null,
            env
          }),
          lastCalculation: buildStudioV2CalculationResult(estimate),
          revisionSummary,
          revisionAffordance: buildStudioV2RevisionAffordance(estimate, {
            priorPublished,
            basedOn: { estimateId: source.id, revision: source.revision }
          }),
          priorEstimate: {
            id: source.id,
            revision: source.revision,
            status: source.status,
            approvedAt: source.approval?.approvedAt || source.approvedAt || null
          },
          sideEffects: {
            ensureEditableDraft: false,
            refreshFromTakeoff: false,
            openMeasurementRevision: false,
            autoFork: false,
            takeoffReopen: false,
            v1Approve: false,
            publish: false,
            simplifiedPublish: false,
            autoApprove: false,
            autoCalculate: false,
            sourceMutated: false
          }
        };
      }
    }

    const clonedScope = deepCloneStudioV2Json(
      source.scope && typeof source.scope === "object" ? source.scope : {}
    );
    // A manual revision is not the direct customer-selection revision that its
    // source may have been. Do not inherit stale submitted-selection identity.
    delete clonedScope.studioV2CustomerSelectionRevision;
    clonedScope.studioV2RevisionOrigin = {
      basedOnEstimateId: source.id,
      basedOnRevision: Number(source.revision) || 1,
      reason: reason || null,
      createdAt: new Date().toISOString(),
      createdByUserId: actorUserId || null
    };

    const next = await createEditableSiblingFromApproved({
      organizationId,
      source,
      scope: clonedScope,
      actorUserId,
      staleReason: `Editable revision from approved R${Number(source.revision) || 1} — recalculate before approving`
    });

    const sourceAfter = await repository.getById(organizationId, source.id);

    const estimate = safeView(next);
    const editability = assessStudioV2ScopeEditability(next);
    const prior = sourceAfter || source;
    const revisionSummary = buildStudioV2RevisionSummary(prior, next, {
      priorPublished,
      reason: reason || null
    });
    const clientMutationId =
      typeof body?.clientMutationId === "string" ? body.clientMutationId.trim().slice(0, 120) : null;

    return {
      ok: true,
      created: true,
      reused: false,
      caseId,
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      basedOnEstimateId: source.id,
      basedOnRevision: source.revision,
      scopeEditable: editability.editable,
      optionsEditable: editability.editable,
      pricingEditable: editability.editable,
      scopeEditability: editability,
      scopeSummary: buildStudioV2ScopeSummary(estimate),
      editableScope: buildStudioV2EditableScope(estimate),
      editableOptions: buildStudioV2EditableOptions(estimate),
      editablePricing: buildStudioV2EditablePricing(estimate, {
        actorUserId: actorUserId || null,
        env
      }),
      lastCalculation: buildStudioV2CalculationResult(estimate),
      revisionSummary,
      revisionAffordance: buildStudioV2RevisionAffordance(estimate, {
        priorPublished,
        basedOn: { estimateId: source.id, revision: source.revision }
      }),
      priorEstimate: {
        id: prior.id,
        revision: prior.revision,
        status: prior.status,
        approvedAt: prior.approval?.approvedAt || prior.approvedAt || null
      },
      clientMutationId,
      sideEffects: {
        ensureEditableDraft: false,
        refreshFromTakeoff: false,
        openMeasurementRevision: false,
        autoFork: false,
        takeoffReopen: false,
        v1Approve: false,
        publish: false,
        simplifiedPublish: false,
        autoApprove: false,
        autoCalculate: false,
        sourceMutated: false
      }
    };
  }

  /**
   * POST customer-selections/create-revision — resolve the immutable submitted
   * review request server-side and fork an editable sibling from its approved
   * publication source. Design selections are mapped conservatively; physical
   * scope requests remain persisted review metadata.
   */
  async function createRevisionFromCustomerSelections({
    organizationId,
    intakeCaseId,
    actorUserId,
    body
  }) {
    const caseId = String(intakeCaseId || "").trim();
    if (!caseId) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "caseId is required.",
        statusCode: 400
      });
    }
    if (body?.confirmed !== true) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "confirmed: true is required to create a revision.",
        statusCode: 400
      });
    }
    const allowedBodyFields = new Set([
      "confirmed",
      "clientMutationId",
      "publicationId",
      "reviewRequestId"
    ]);
    const rejectedBodyFields = Object.keys(
      body && typeof body === "object" ? body : {}
    ).filter((key) => !allowedBodyFields.has(key));
    if (rejectedBodyFields.length) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "Only safe revision identifiers are accepted.",
        statusCode: 400,
        details: { rejectedFields: rejectedBodyFields.slice(0, 20) }
      });
    }
    if (
      !amendmentRepository ||
      typeof amendmentRepository.getReviewRequest !== "function" ||
      typeof amendmentRepository.claimReviewRequestStatus !== "function" ||
      !configurationRepository ||
      typeof configurationRepository.getSelectionById !== "function" ||
      !lifecycleRepository ||
      typeof lifecycleRepository.getAcceptanceForEstimate !== "function"
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNAVAILABLE, {
        message: "Customer selection revision service is unavailable."
      });
    }

    const finishExisting = async (existing, requestId = null) => {
      const info = buildCustomerSelectionRevisionInfo(existing.scope, {
        status: existing.status,
        needsRecalculation: !existing.calculationSnapshot
      });
      const resolvedRequestId = requestId || info?.sourceReviewRequestId || null;
      if (
        resolvedRequestId &&
        typeof amendmentRepository.claimReviewRequestStatus === "function"
      ) {
        // Recover a crash after revision insert but before status advancement.
        // Do not overwrite clarification or any resolved staff/customer state
        // when an already-created revision is merely replayed.
        await amendmentRepository.claimReviewRequestStatus(
          organizationId,
          resolvedRequestId,
          [
            REVIEW_STATUS.REQUESTED,
            REVIEW_STATUS.REVIEWING,
            "open",
            "new",
            "triaged",
            "customer_replied"
          ],
          REVIEW_STATUS.AMENDMENT_PREPARED
        );
      }
      const estimate = safeView(existing);
      return {
        ok: true,
        created: false,
        reused: true,
        alreadyCreated: true,
        caseId,
        estimateId: estimate.id,
        revision: estimate.revision,
        status: estimate.status,
        customerSelectionRevision: info,
        notice: "Revision already created from these customer selections.",
        sideEffects: {
          sourceMutated: false,
          publicationMutated: false,
          calculate: false,
          approve: false,
          publish: false,
          accept: false,
          sold: false
        }
      };
    };

    const source = await loadActiveEstimateOrNull(organizationId, caseId);
    if (!source) throw createStudioV2Error(STUDIO_V2_ERROR_CODES.NO_ESTIMATE);
    const activeCustomerRevision = buildCustomerSelectionRevisionInfo(source.scope, {
      status: source.status,
      needsRecalculation: !source.calculationSnapshot
    });
    if (activeCustomerRevision && isStudioV2EditableWorkingDraft(source)) {
      if (
        body?.reviewRequestId &&
        String(body.reviewRequestId) !==
          String(activeCustomerRevision.sourceReviewRequestId || "")
      ) {
        throw createStudioV2Error(
          STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_REVISION_CONFLICT
        );
      }
      return finishExisting(source, activeCustomerRevision.sourceReviewRequestId);
    }
    if (!isStudioV2ApprovedSnapshot(source)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.REVISION_REQUIRES_APPROVED, {
        details: { estimateId: source.id, status: source.status, revision: source.revision }
      });
    }
    if (isStudioV2OriginUnsupported(source)) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN);
    }

    const acceptance = await lifecycleRepository.getAcceptanceForEstimate(
      organizationId,
      source.id
    );
    if (acceptance) {
      throw createStudioV2Error(
        STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTIONS_ALREADY_ACCEPTED,
        {
          details: { estimateId: source.id }
        }
      );
    }

    const pubBundle = await loadPublicationBundle(organizationId, source);
    const publications = Array.isArray(pubBundle.publications) ? pubBundle.publications : [];
    const activePublication =
      publications.find((publication) =>
        isCurrentActivePublicationForEstimate(source, publication)
      ) ||
      pubBundle.activePublication ||
      null;
    const publicationId =
      activePublication?.id || activePublication?.publicationId || null;
    if (!publicationId) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTIONS_NOT_SENT, {
        message: "No active published estimate is available for submitted customer selections."
      });
    }
    if (
      body?.publicationId &&
      String(body.publicationId) !== String(publicationId)
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "The selected publication is no longer active. Reload customer activity."
      });
    }

    const openSummaries = (pubBundle.reviewRequests || [])
      .filter(
        (request) =>
          String(request.publicationId || request.publication_id || "") ===
            String(publicationId) &&
          isOpenDigitalEstimateReviewRequestStatus(request.status)
      )
      .sort((a, b) =>
        String(b.requestedAt || b.created_at || "").localeCompare(
          String(a.requestedAt || a.created_at || "")
        )
      );
    const latestSummary = openSummaries[0] || null;
    if (!latestSummary?.id) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTIONS_NOT_SENT);
    }
    if (
      body?.reviewRequestId &&
      String(body.reviewRequestId) !== String(latestSummary.id)
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION, {
        message: "A newer customer selection request exists. Reload before creating a revision."
      });
    }

    const reviewRequest = await amendmentRepository.getReviewRequest(
      organizationId,
      latestSummary.id
    );
    if (
      !reviewRequest ||
      String(reviewRequest.publication_id || "") !== String(publicationId) ||
      !isOpenDigitalEstimateReviewRequestStatus(reviewRequest.status)
    ) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTIONS_NOT_SENT);
    }
    if (!reviewRequest.selection_id) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_SOURCE_UNAVAILABLE);
    }

    const selection = await configurationRepository.getSelectionById(
      organizationId,
      reviewRequest.selection_id
    );
    const selectionMatchesRequest =
      selection &&
      String(selection.id || "") === String(reviewRequest.selection_id) &&
      (!reviewRequest.envelope_id ||
        String(selection.envelope_id || "") === String(reviewRequest.envelope_id)) &&
      (!reviewRequest.session_id ||
        String(selection.session_id || "") === String(reviewRequest.session_id)) &&
      (!reviewRequest.selection_hash ||
        String(selection.selection_hash || "") === String(reviewRequest.selection_hash));
    if (!selectionMatchesRequest) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_SOURCE_UNAVAILABLE);
    }

    const revisionId = customerSelectionRevisionEstimateId({
      organizationId,
      intakeCaseId: caseId,
      sourceApprovedEstimateId: source.id,
      reviewRequest
    });
    const revisionByIdentity =
      typeof repository.getById === "function"
        ? await repository.getById(organizationId, revisionId)
        : null;
    if (revisionByIdentity) {
      if (matchesCustomerSelectionRevision(revisionByIdentity.scope, reviewRequest)) {
        return finishExisting(revisionByIdentity, reviewRequest.id);
      }
      throw createStudioV2Error(
        STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_REVISION_CONFLICT
      );
    }

    const siblings =
      typeof repository.listByIntakeCase === "function"
        ? await repository.listByIntakeCase(organizationId, caseId)
        : [];
    const matching = (siblings || [])
      .filter(
        (row) =>
          row &&
          row.id !== source.id &&
          matchesCustomerSelectionRevision(row.scope, reviewRequest)
      )
      .sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1))[0];

    if (matching) return finishExisting(matching, reviewRequest.id);

    const otherEditable = (siblings || [])
      .filter(
        (row) =>
          row &&
          row.id !== source.id &&
          isStudioV2EditableWorkingDraft(row) &&
          !matchesCustomerSelectionRevision(row.scope, reviewRequest)
      )
      .sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1))[0];
    if (otherEditable) {
      throw createStudioV2Error(
        STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_REVISION_CONFLICT,
        {
          details: {
            activeEstimateId: otherEditable.id,
            activeRevision: otherEditable.revision
          }
        }
      );
    }

    const mapped = mapCustomerConfigurationToStudioV2DraftPatch({
      sourceScope: source.scope,
      reviewRequest,
      selection,
      actorUserId
    });
    if (!mapped.classification?.requiresEliteReview) {
      throw createStudioV2Error(
        STUDIO_V2_ERROR_CODES.CUSTOMER_SELECTION_REVISION_NOT_REQUIRED,
        {
          message:
            "No Studio V2 revision is required for selection-only customer choices.",
          statusCode: 409,
          details: {
            reviewKind: mapped.classification?.reviewKind || "selection_only",
            hasPhysicalScopeRequests: false,
            hasSelectionOnlyChanges: Boolean(
              mapped.classification?.hasSelectionOnlyChanges
            )
          }
        }
      );
    }
    const createdAt = new Date().toISOString();
    const clientMutationId =
      typeof body?.clientMutationId === "string"
        ? body.clientMutationId.trim().slice(0, 120)
        : null;
    const nextScope = mapped.scope;
    nextScope.studioV2RevisionOrigin = {
      basedOnEstimateId: source.id,
      basedOnRevision: Number(source.revision) || 1,
      reason: "Customer selections review",
      kind: "customer_selections",
      createdAt,
      createdByUserId: actorUserId || null
    };
    nextScope.studioV2CustomerSelectionRevision = {
      createdFromCustomerSelections: true,
      createdFromCustomerSelectionsAt: createdAt,
      createdByUserId: actorUserId || null,
      clientMutationId,
      sourcePublicationId: mapped.source.publicationId || publicationId,
      sourceReviewRequestId: mapped.source.reviewRequestId,
      sourceSelectionId: mapped.source.selectionId,
      sourceSelectionHash: mapped.source.selectionHash,
      sourceApprovedEstimateId: source.id,
      sourceApprovedRevision: Number(source.revision) || 1,
      appliedSelectionsSummary: mapped.appliedSummary,
      notAppliedScopeRequests: mapped.notAppliedRequests,
      warnings: mapped.warnings
    };

    let revised;
    try {
      revised = await createEditableSiblingFromApproved({
        organizationId,
        source,
        scope: nextScope,
        actorUserId,
        revisionId,
        staleReason:
          "Revision created from customer selections — review scope and recalculate before approving"
      });
    } catch (error) {
      const racedByIdentity =
        typeof repository.getById === "function"
          ? await repository.getById(organizationId, revisionId)
          : null;
      if (
        racedByIdentity &&
        matchesCustomerSelectionRevision(racedByIdentity.scope, reviewRequest)
      ) {
        return finishExisting(racedByIdentity, reviewRequest.id);
      }
      if (typeof repository.listByIntakeCase === "function") {
        const after = await repository.listByIntakeCase(organizationId, caseId);
        const raced = (after || []).find((row) =>
          matchesCustomerSelectionRevision(row?.scope, reviewRequest)
        );
        if (raced) return finishExisting(raced, reviewRequest.id);
      }
      throw error;
    }

    const preparedRequest =
      typeof amendmentRepository.claimReviewRequestStatus === "function"
        ? await amendmentRepository.claimReviewRequestStatus(
            organizationId,
            reviewRequest.id,
            OPEN_REVIEW_REQUEST_STATUSES.filter(
              (status) => status !== REVIEW_STATUS.AMENDMENT_PREPARED
            ),
            REVIEW_STATUS.AMENDMENT_PREPARED
          )
        : null;

    let auditEventRecorded = false;
    if (typeof amendmentRepository.appendEvent === "function") {
      try {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          publication_id: publicationId,
          review_request_id: reviewRequest.id,
          event_type: "studio_v2_customer_selection_revision_created",
          actor_type: "user",
          actor_user_id: actorUserId || null,
          metadata: {
            sourceEstimateId: source.id,
            revisedEstimateId: revised.id,
            revision: revised.revision,
            selectionId: reviewRequest.selection_id,
            physicalScopeRequestsNotApplied: mapped.notAppliedRequests.length
          }
        });
        auditEventRecorded = true;
      } catch {
        // scope_json carries the durable audit marker; event history is best-effort.
      }
    }

    const estimate = safeView(revised);
    return {
      ok: true,
      created: true,
      reused: false,
      alreadyCreated: false,
      caseId,
      estimateId: estimate.id,
      revision: estimate.revision,
      status: estimate.status,
      basedOnEstimateId: source.id,
      basedOnRevision: source.revision,
      customerSelectionRevision: buildCustomerSelectionRevisionInfo(revised.scope, {
        status: revised.status,
        needsRecalculation: !revised.calculationSnapshot
      }),
      appliedSelectionsSummary: mapped.appliedSummary,
      notAppliedScopeRequests: mapped.notAppliedRequests,
      warnings: mapped.warnings,
      reviewRequestStatus:
        preparedRequest?.status ||
        (reviewRequest.status === REVIEW_STATUS.AMENDMENT_PREPARED
          ? REVIEW_STATUS.AMENDMENT_PREPARED
          : reviewRequest.status),
      auditEventRecorded,
      clientMutationId,
      notice:
        "Revision created from customer selections. Review scope, recalculate, approve, then republish.",
      sideEffects: {
        sourceMutated: false,
        publicationMutated: false,
        calculate: false,
        approve: false,
        publish: false,
        accept: false,
        sold: false
      }
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
   * POST publish — strict approved → Digital Estimate only.
   * Never simplified-publish / auto-approve / auto-calculate / ensure-editable-draft /
   * open-measurement-revision / refresh-from-takeoff / scope mutation.
   */
  async function publishApproved({ organizationId, estimateId, actorUserId, body }) {
    if (!studioDigitalEstimateService || typeof studioDigitalEstimateService.publish !== "function") {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.UNAVAILABLE, {
        message: "Digital Estimate publish is unavailable."
      });
    }

    const sanitized = sanitizeStudioV2PublishBody(body);
    if (!sanitized.confirmed) {
      throw createStudioV2Error(STUDIO_V2_ERROR_CODES.VALIDATION_FAILED, {
        message: "confirmed: true is required to publish.",
        statusCode: 400,
        details: { field: "confirmed" }
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

    const readiness = assessStudioV2PublishReadiness(row);
    if (!readiness.allowed) {
      const code =
        readiness.code === "approve_required"
          ? STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED
          : readiness.code === "superseded_revision"
            ? STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION
            : readiness.code === "not_priced"
              ? STUDIO_V2_ERROR_CODES.NOT_PRICED
              : readiness.code === "calculation_stale"
                ? STUDIO_V2_ERROR_CODES.CALCULATION_STALE
                : readiness.code === "no_estimate"
                  ? STUDIO_V2_ERROR_CODES.NO_ESTIMATE
                  : STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED;
      throw createStudioV2Error(code, {
        message: readiness.message || undefined,
        blockers: readiness.blockers,
        details: { estimateId: row.id, status: row.status, blockers: readiness.blockers }
      });
    }

    try {
      // After V2 assessStudioV2PublishReadiness (approved + current calculation),
      // AI Takeoff is not an authority gate — approved Studio V2 snapshot is.
      const result = await studioDigitalEstimateService.publish({
        organizationId,
        estimateId: row.id,
        actorUserId: actorUserId || null,
        body: sanitized.body,
        publishContext: {
          source: "studio_v2_approved_snapshot",
          approvedSnapshotAuthority: true,
          skipLegacyTakeoffApprovalGate: true
        }
      });

      // V2 always attaches interactive configuration defaults. Refuse silent
      // document-only success so customer links cannot land on configuration_absent.
      let interactiveEnvelope;
      try {
        interactiveEnvelope = assertStudioV2InteractivePublishResult(
          result,
          sanitized.body.configuration
        );
      } catch (guardErr) {
        throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CONFIGURATION_ENVELOPE_REQUIRED, {
          message: guardErr?.message,
          statusCode: guardErr?.statusCode || 422,
          details: guardErr?.details || null
        });
      }

      const estimate = safeView(row);
      const publication = buildStudioV2PublicationResult(result, estimate);
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
          customerUrl: typeof p.customerUrl === "string" ? p.customerUrl : null
        };
      });

      const activeFromResult = {
        publicationId: publication.publicationId,
        status: publication.status,
        active: true,
        historical: false,
        publishedAt: publication.publishedAt,
        customerUrl: publication.customerUrl
      };
      const activePublication =
        classified.find((p) => p.active) ||
        (publication.publicationId || publication.customerUrl ? activeFromResult : null);

      let customerSelectionReviewStatusUpdated = false;
      let customerSelectionReviewStatusResolved = false;
      const customerRevision = buildCustomerSelectionRevisionInfo(row.scope, {
        status: row.status,
        published: Boolean(activePublication),
        needsRecalculation: false
      });
      if (
        customerRevision?.sourceReviewRequestId &&
        amendmentRepository &&
        typeof amendmentRepository.getReviewRequest === "function" &&
        typeof amendmentRepository.claimReviewRequestStatus === "function"
      ) {
        try {
          const request = await amendmentRepository.getReviewRequest(
            organizationId,
            customerRevision.sourceReviewRequestId
          );
          if (
            request &&
            [
              REVIEW_STATUS.PUBLISHED,
              REVIEW_STATUS.CLOSED,
              REVIEW_STATUS.SUPERSEDED
            ].includes(request.status)
          ) {
            customerSelectionReviewStatusResolved = true;
          }
          if (request && isOpenDigitalEstimateReviewRequestStatus(request.status)) {
            const resolvedRequest =
              await amendmentRepository.claimReviewRequestStatus(
                organizationId,
                request.id,
                OPEN_REVIEW_REQUEST_STATUSES,
                REVIEW_STATUS.PUBLISHED
              );
            customerSelectionReviewStatusUpdated = Boolean(resolvedRequest);
            customerSelectionReviewStatusResolved = Boolean(resolvedRequest);
            if (
              !resolvedRequest &&
              typeof amendmentRepository.getReviewRequest === "function"
            ) {
              const afterClaim = await amendmentRepository.getReviewRequest(
                organizationId,
                request.id
              );
              customerSelectionReviewStatusResolved = Boolean(
                afterClaim &&
                  [
                    REVIEW_STATUS.PUBLISHED,
                    REVIEW_STATUS.CLOSED,
                    REVIEW_STATUS.SUPERSEDED
                  ].includes(afterClaim.status)
              );
            }
            if (
              resolvedRequest &&
              typeof amendmentRepository.appendEvent === "function"
            ) {
              try {
                await amendmentRepository.appendEvent({
                  organization_id: organizationId,
                  publication_id: publication.publicationId || null,
                  review_request_id: request.id,
                  event_type: "studio_v2_customer_selection_revision_published",
                  actor_type: "user",
                  actor_user_id: actorUserId || null,
                  metadata: {
                    estimateId: row.id,
                    revision: row.revision,
                    replacementPublicationId: publication.publicationId || null
                  }
                });
              } catch {
                // Status is authoritative; event history is best-effort.
              }
            }
          }
        } catch {
          // Publish already succeeded. A safe idempotent publish retry can repair
          // review status without rolling back or duplicating the publication.
        }
      }

      const clientMutationId =
        typeof body?.clientMutationId === "string"
          ? body.clientMutationId.trim().slice(0, 120)
          : null;

      return {
        ok: true,
        caseId: row.intakeCaseId || null,
        estimateId: row.id,
        revision: row.revision,
        status: row.status,
        publication: {
          publicationId: publication.publicationId,
          status: publication.status,
          active: publication.active,
          customerUrl: publication.customerUrl,
          publishedAt: publication.publishedAt,
          linkStatus: publication.linkStatus
        },
        customerUrl: publication.customerUrl,
        linkStatus: publication.linkStatus,
        reused: publication.reused,
        configurationUpdated: publication.configurationUpdated,
        envelope: publication.envelope || {
          configured: interactiveEnvelope.configured,
          reason: interactiveEnvelope.reason,
          repaired: interactiveEnvelope.repaired,
          updated: interactiveEnvelope.updated
        },
        publishedConfiguration: publication.publishedConfiguration,
        staffNotice:
          customerRevision &&
          customerRevision.sourceReviewRequestId &&
          !customerSelectionReviewStatusResolved
            ? `${publication.staffNotice || "Published."} Customer review status could not be closed automatically; retry publish or contact support.`
            : publication.staffNotice,
        publicationSummary: pubBundle.publicationSummary || publication.summary,
        activePublication,
        historicalPublications: classified.filter((p) => p.historical),
        publishReadiness: { ...readiness, published: Boolean(activePublication) },
        customerSelectionReviewStatusUpdated,
        customerSelectionReviewStatusResolved,
        clientMutationId,
        sideEffects: {
          simplifiedPublish: false,
          autoConfirm: false,
          autoCalculate: false,
          autoApprove: false,
          ensureEditableDraft: false,
          refreshFromTakeoff: false,
          openMeasurementRevision: false,
          calculate: false,
          approve: false,
          scopeMutated: false,
          optionsMutated: false
        }
      };
    } catch (e) {
      if (e?.code && Object.values(STUDIO_V2_ERROR_CODES).includes(e.code)) throw e;
      const rawCode = e?.code || null;
      if (
        rawCode === "DE-ENVELOPE-ACTIVATION-FAILED" ||
        rawCode === "DE-CONFIGURATION-UNAVAILABLE" ||
        rawCode === "configuration_envelope_required"
      ) {
        throw createStudioV2Error(STUDIO_V2_ERROR_CODES.CONFIGURATION_ENVELOPE_REQUIRED, {
          message: e?.message,
          statusCode:
            Number(e?.statusCode) ||
            (rawCode === "DE-CONFIGURATION-UNAVAILABLE" ? 503 : 422),
          details: { causeCode: rawCode }
        });
      }
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
   * Load latest saved Digital Estimate selection for the active publication.
   * Staff-safe — never invents selections when configuration stack is absent.
   */
  async function loadCustomerSelectionReview({
    organizationId,
    estimate,
    activePublication,
    reviewRequested
  }) {
    const publicationId =
      activePublication?.publicationId ||
      activePublication?.id ||
      null;
    const empty = buildEmptyCustomerSelectionReview({
      publicationId,
      envelopeId: null
    });
    empty.reviewRequested = Boolean(reviewRequested);

    if (!publicationId) return empty;
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
      return empty;
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
      return empty;
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
      return empty;
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

  /**
   * GET customer-activity — read-only aggregation + selection review.
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
      // Align with public DE "Sent for review" (status `review_requested`, …).
      open: isOpenDigitalEstimateReviewRequestStatus(r.status)
    }));

    let acceptance = null;
    if (lifecycleRepository && typeof lifecycleRepository.getAcceptanceForEstimate === "function") {
      try {
        const a = await lifecycleRepository.getAcceptanceForEstimate(organizationId, estimate.id);
        if (a) {
          const snap = a.customer_safe_snapshot_json || a.customerSafeSnapshot || {};
          const acceptedAsConfigured = snap.acceptedAsConfigured === true;
          const snapTotals =
            snap.totals && typeof snap.totals === "object" ? snap.totals : {};
          const moneyOrNull = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const columnTotal = moneyOrNull(
            a.customer_display_total ?? a.customerDisplayTotal
          );
          const configuredTotal =
            moneyOrNull(snapTotals.acceptedConfiguredTotal) ??
            moneyOrNull(snapTotals.customerDisplayTotal) ??
            columnTotal;
          acceptance = {
            id: a.id,
            acceptedAt: a.accepted_at || a.acceptedAt || null,
            estimateRevision: a.estimate_revision ?? a.estimateRevision ?? null,
            publicationId: a.publication_id || a.publicationId || null,
            customerDisplayTotal: acceptedAsConfigured
              ? configuredTotal ?? columnTotal
              : columnTotal,
            acceptedAsConfigured,
            acceptedAsPublished: acceptedAsConfigured
              ? false
              : snap.acceptedAsPublished !== false
          };
        }
      } catch {
        acceptance = null;
      }
    }

    const summary = pubBundle.publicationSummary || buildSafeStudioPublicationSummary({ estimate });
    const reviewRequested = Boolean(
      summary.reviewRequestOpen || reviewRequests.some((r) => r.open)
    );
    const activePublication =
      classified.find((p) => p.active) ||
      (pubBundle.activePublication
        ? {
            publicationId:
              pubBundle.activePublication.id ||
              pubBundle.activePublication.publicationId ||
              null,
            active: true
          }
        : null);

    const selectionReview = await loadCustomerSelectionReview({
      organizationId,
      estimate,
      activePublication,
      reviewRequested
    });

    const activityFlags = {
      viewed: Boolean(
        summary.customerActivityState === "customer_viewed" ||
          /viewed/i.test(String(summary.customerActivityState || ""))
      ),
      // Authoritative: latest DE configuration selection with a calculation exists.
      // Do NOT infer from customerActivityState — that string never includes "saved".
      savedSelections: Boolean(selectionReview?.hasSavedSelections),
      reviewRequested,
      accepted: Boolean(acceptance),
      lastSavedAt: selectionReview?.lastSavedAt || null
    };

    return {
      ok: true,
      estimateId: estimate.id,
      revision: estimate.revision,
      publicationSummary: summary,
      publications: classified,
      activePublication,
      historicalPublications: classified.filter((p) => p.historical),
      reviewRequests,
      acceptance,
      activity: activityFlags,
      selectionReview,
      customerSelectionRevision: buildCustomerSelectionRevisionInfo(row.scope, {
        status: row.status,
        published: publications.some((publication) =>
          isCurrentActivePublicationForEstimate(row, publication)
        ),
        needsRecalculation: !row.calculationSnapshot
      })
    };
  }

  return {
    getWorkingDraft,
    patchWorkingDraftScope,
    patchWorkingDraftOptions,
    patchWorkingDraftPricing,
    approveWorkingDraft,
    createRevisionFromApproved,
    createRevisionFromCustomerSelections,
    previewTakeoffImport,
    applyTakeoffImport,
    calculateWorkingDraft,
    publishApproved,
    getCustomerActivity,
    // Exposed for tests — prove wrappers never reference forbidden services.
    _internals: {
      calculateImpl,
      repository,
      studioEstimateService,
      studioDigitalEstimateService,
      loadWorkspace,
      loadLatestResult
    }
  };
}
