/**
 * Studio review-request loop — resolve / revise / republish.
 * Reuses amendment review-request records + Studio estimate revision + DE publish.
 * Does not create a second review, revision, or publication system.
 */

import {
  AMENDMENT_STATUS,
  REVIEW_STATUS
} from "../digitalEstimate/configuration/amendmentConfig.mjs";
import {
  buildStructuredComparison,
  rejectAmendmentCallerAuthority
} from "../digitalEstimate/configuration/amendmentStudioService.mjs";
import {
  getElite100CustomerMaterial
} from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";
import { serverApprovedOptionCatalog } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";
import { collectUnresolvedItems } from "./studioEstimatePricing.mjs";
import { STUDIO_ESTIMATE_STATUSES, STUDIO_UNRESOLVED_ADDON_KEYS } from "./studioEstimateTypes.mjs";

/** Operator-facing labels mapped onto existing REVIEW_STATUS authority. */
export const STUDIO_REVIEW_OPERATOR_STATUS = Object.freeze({
  NEW: "new",
  IN_REVIEW: "in_review",
  REVISION_REQUIRED: "revision_required",
  RESOLVED_NO_CHANGE: "resolved_no_change",
  RESOLVED_REPUBLISHED: "resolved_republished",
  REJECTED: "rejected"
});

const RESOLUTION_KIND = Object.freeze({
  NO_CHANGE: "resolved_no_change",
  REJECTED: "rejected",
  REPUBLISHED: "resolved_republished"
});

function deError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function rejectCallerAuthority(body) {
  rejectAmendmentCallerAuthority(body || {});
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "priceDelta",
    "displayDelta",
    "requestedTotal",
    "baselineDisplayTotal",
    "configuredDisplayTotal",
    "revision",
    "revisionNumber",
    "actorId",
    "actorUserId",
    "organizationId",
    "organization_id",
    "publicationId",
    "studioEstimateId",
    "intakeCaseId",
    "approval",
    "status"
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null && body[key] !== "") {
      throw deError("Caller-controlled fields are not accepted", "forbidden_caller_authority", 400);
    }
  }
}

function requireNote(raw, label = "Estimator note") {
  const note = String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\0/g, "")
    .trim();
  if (!note) {
    throw deError(`${label} is required`, "resolution_note_required", 400);
  }
  if (note.length > 2000) {
    throw deError(`${label} is too long`, "resolution_note_too_long", 400);
  }
  return note;
}

/**
 * Map stored REVIEW_STATUS (+ closed_reason) → operator-facing status.
 * Authority remains REVIEW_STATUS — this is presentation only.
 */
export function toOperatorReviewStatus(request) {
  const status = String(request?.status || "");
  const reason = String(request?.closed_reason || "");
  if (status === REVIEW_STATUS.REQUESTED) return STUDIO_REVIEW_OPERATOR_STATUS.NEW;
  if (status === REVIEW_STATUS.REVIEWING || status === REVIEW_STATUS.CLARIFICATION) {
    return STUDIO_REVIEW_OPERATOR_STATUS.IN_REVIEW;
  }
  if (status === REVIEW_STATUS.AMENDMENT_PREPARED) {
    return STUDIO_REVIEW_OPERATOR_STATUS.REVISION_REQUIRED;
  }
  if (status === REVIEW_STATUS.PUBLISHED) {
    return STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_REPUBLISHED;
  }
  if (status === REVIEW_STATUS.CLOSED) {
    if (reason.startsWith(RESOLUTION_KIND.REJECTED)) {
      return STUDIO_REVIEW_OPERATOR_STATUS.REJECTED;
    }
    if (reason.startsWith(RESOLUTION_KIND.NO_CHANGE)) {
      return STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_NO_CHANGE;
    }
    return STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_NO_CHANGE;
  }
  return status || STUDIO_REVIEW_OPERATOR_STATUS.NEW;
}

export function parseResolutionReason(closedReason) {
  const raw = String(closedReason || "");
  const kinds = Object.values(RESOLUTION_KIND);
  for (const kind of kinds) {
    if (raw === kind) return { kind, note: "" };
    if (raw.startsWith(`${kind}|`)) {
      return { kind, note: raw.slice(kind.length + 1) };
    }
  }
  return { kind: raw || null, note: "" };
}

function encodeResolutionReason(kind, note) {
  return `${kind}|${note}`;
}

/**
 * Extract Studio linkage from publication + amendment evidence.
 */
export function extractStudioLinkage({ publication, events = [], amendments = [], estimateRow = null }) {
  const metaEvent = (events || []).find(
    (e) => e.event_type === "published" && (e.metadata?.studioEstimateId || e.metadata?.intakeCaseId)
  );
  const evidence = (amendments || [])
    .map((a) => a.internal_evidence_json?.studioReview || null)
    .find(Boolean);

  const studioEstimateId =
    evidence?.sourceEstimateId ||
    metaEvent?.metadata?.studioEstimateId ||
    publication?.source_quote_id ||
    estimateRow?.id ||
    null;

  return {
    studioEstimateId,
    intakeCaseId:
      evidence?.intakeCaseId ||
      metaEvent?.metadata?.intakeCaseId ||
      estimateRow?.intakeCaseId ||
      null,
    takeoffJobId:
      evidence?.takeoffJobId ||
      metaEvent?.metadata?.takeoffJobId ||
      estimateRow?.takeoffJobId ||
      null,
    revisedEstimateId: evidence?.revisedEstimateId || null,
    replacementPublicationId:
      evidence?.replacementPublicationId ||
      (amendments || []).find((a) => a.replacement_publication_id)?.replacement_publication_id ||
      null,
    sourceEstimateRevision: evidence?.sourceEstimateRevision || publication?.revision_number || null
  };
}

/**
 * Server-side unsupported selection detection from request snapshot.
 */
export function detectUnsupportedSelections(request) {
  const snap = request?.request_snapshot_json || {};
  const selected = Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [];
  const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
  /** @type {Array<{ optionKey: string, code: string, message: string }>} */
  const blockers = [];
  for (const opt of selected) {
    const key = String(opt.optionKey || opt.key || "");
    if (!key) continue;
    if (key.startsWith("material:")) {
      const token = key.split(":")[2];
      const mat = getElite100CustomerMaterial(token);
      if (!mat || !mat.customerVisible) {
        blockers.push({
          optionKey: key,
          code: "unknown_material",
          message: `Material selection is not customer-visible: ${token || key}`
        });
      }
      continue;
    }
    if (STUDIO_UNRESOLVED_ADDON_KEYS.includes(key) || key.includes("faucet") || key.includes("accessory")) {
      blockers.push({
        optionKey: key,
        code: "unsupported_customer_option",
        message: `Option "${key}" is unsupported or unpriced for customer requests`
      });
      continue;
    }
    if (!catalog.has(key)) {
      blockers.push({
        optionKey: key,
        code: "unknown_option",
        message: `Option not in server-approved catalog: ${key}`
      });
    }
  }
  return blockers;
}

/**
 * Optionally apply validated customer selections onto a Studio estimate scope copy.
 * Unsupported keys become blockers and are not applied.
 */
export function applyCustomerSelectionsToScope(scope, request) {
  const next = structuredClone(scope || {});
  const addOns = { ...(next.addOns || {}) };
  const blockers = detectUnsupportedSelections(request);
  const blockerKeys = new Set(blockers.map((b) => b.optionKey));
  const snap = request?.request_snapshot_json || {};
  const selected = Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [];

  let colorName = next.colorName || "";
  let materialGroup = next.materialGroup || "Group Promo";

  for (const opt of selected) {
    const key = String(opt.optionKey || "");
    if (!key || blockerKeys.has(key)) continue;
    const qty = Math.max(0, Math.floor(Number(opt.quantity) || 0));
    if (key.startsWith("material:")) {
      const materialId = key.split(":")[2];
      const mat = getElite100CustomerMaterial(materialId);
      if (mat) {
        colorName = mat.displayName;
        const code = mat.pricingGroupCode;
        const labelMap = {
          promo: "Group Promo",
          group_a: "Group A",
          group_b: "Group B",
          group_c: "Group C",
          group_d: "Group D",
          group_e: "Group E",
          group_f: "Group F",
          remnant: "Remnant"
        };
        materialGroup = labelMap[code] || materialGroup;
      }
      continue;
    }
    addOns[key] = qty;
  }

  next.addOns = addOns;
  next.colorName = colorName;
  next.materialGroup = materialGroup;
  next.colorTbd = false;
  return { scope: next, blockers };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   amendmentRepository: any,
 *   deRepository: any,
 *   configurationRepository?: any,
 *   studioEstimateService: any,
 *   studioDigitalEstimateService: any,
 *   amendmentStudioService?: any
 * }} deps
 */
export function createStudioReviewRequestService(deps) {
  const env = deps.env ?? process.env;
  const amendmentRepository = deps.amendmentRepository;
  const deRepository = deps.deRepository;
  const configurationRepository = deps.configurationRepository || null;
  const studioEstimateService = deps.studioEstimateService;
  const studioDigitalEstimateService = deps.studioDigitalEstimateService;

  async function loadEstimateById(organizationId, estimateId) {
    const repo = studioEstimateService.repository;
    if (!repo?.getById || !estimateId) return null;
    return repo.getById(organizationId, estimateId);
  }

  async function resolveEstimateForPublication(organizationId, publication) {
    if (!publication?.source_quote_id) return null;
    return loadEstimateById(organizationId, publication.source_quote_id);
  }

  async function buildEnrichedDetail(organizationId, requestId) {
    const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
    if (!request) throw deError("Review request not found", "not_found", 404);

    const publication = await deRepository.getPublication(organizationId, request.publication_id);
    if (!publication) throw deError("Publication not found", "not_found", 404);

    const snap = await deRepository.getSnapshotByPublicationId(
      organizationId,
      request.publication_id
    );
    let envelopeOptions = [];
    if (configurationRepository?.getEnvelopeGraph) {
      try {
        const graph = await configurationRepository.getEnvelopeGraph(
          organizationId,
          request.envelope_id
        );
        envelopeOptions = graph?.options || [];
      } catch {
        envelopeOptions = [];
      }
    }

    const comparison = buildStructuredComparison({
      request,
      sourceCustomerSnapshot: snap?.customer_snapshot_json,
      envelopeOptions
    });
    // Totals always from stored request (server authority) — never browser.
    comparison.internalTotals = {
      baselineDisplay: request.baseline_display_total,
      requestedDisplay: request.configured_display_total,
      displayDelta: request.display_delta,
      baselineExact: request.baseline_display_total,
      requestedExact: request.configured_display_total,
      exactDelta: request.display_delta
    };
    comparison.customerSafeTotals = {
      baselineDisplay: request.baseline_display_total,
      requestedDisplay: request.configured_display_total,
      displayDelta: request.display_delta,
      selectedOptions: Array.isArray(request.request_snapshot_json?.selectedOptions)
        ? request.request_snapshot_json.selectedOptions
        : []
    };

    const amendments = await amendmentRepository.listAmendmentsForRequest(
      organizationId,
      requestId
    );
    const events =
      typeof amendmentRepository.listEvents === "function"
        ? await Promise.resolve(
            amendmentRepository.listEvents(organizationId, { reviewRequestId: requestId })
          )
        : [];

    const estimateRow = await resolveEstimateForPublication(organizationId, publication);
    const linkage = extractStudioLinkage({
      publication,
      events,
      amendments,
      estimateRow
    });
    const revised =
      linkage.revisedEstimateId != null
        ? await loadEstimateById(organizationId, linkage.revisedEstimateId)
        : null;

    const unsupported = detectUnsupportedSelections(request);
    const unresolvedCommercial = estimateRow
      ? collectUnresolvedItems(estimateRow.scope || {})
      : [];
    const resolution = parseResolutionReason(request.closed_reason);

    const project = snap?.customer_snapshot_json?.project || {};

    return {
      ok: true,
      reviewRequest: {
        id: request.id,
        status: request.status,
        operatorStatus: toOperatorReviewStatus(request),
        publicationId: request.publication_id,
        publicationStatus: publication.status,
        envelopeId: request.envelope_id,
        requestedAt: request.created_at,
        pricingValidThrough: request.pricing_valid_through,
        customerNote: request.customer_note,
        closedAt: request.closed_at || null,
        closedReason: request.closed_reason || null,
        resolutionKind: resolution.kind,
        resolutionNote: resolution.note || null,
        immutable: true,
        estimateIdentity: {
          quoteNumber: publication.quote_number,
          revisionLabel: publication.revision_label,
          revisionNumber: publication.revision_number,
          customerName: project.customerName || null,
          projectName: project.projectName || null,
          projectAddress: project.projectAddress || null
        }
      },
      linkage: {
        ...linkage,
        sourceEstimateStatus: estimateRow?.status || null,
        sourceEstimateRevision: estimateRow?.revision ?? linkage.sourceEstimateRevision,
        revisedEstimateStatus: revised?.status || null,
        revisedEstimateRevision: revised?.revision ?? null,
        revisedApproved: revised?.status === STUDIO_ESTIMATE_STATUSES.APPROVED
      },
      comparison,
      pricingComparison: {
        currentPublishedTotal: request.baseline_display_total,
        requestedConfiguredTotal: request.configured_display_total,
        delta: request.display_delta,
        currency: "USD"
      },
      blockers: {
        unsupportedSelections: unsupported,
        unresolvedCommercial,
        canRepublish:
          Boolean(revised) &&
          revised.status === STUDIO_ESTIMATE_STATUSES.APPROVED &&
          !unsupported.length
      },
      amendments: amendments.map((amd) => ({
        id: amd.id,
        status: amd.status,
        amendmentVersion: amd.amendment_version,
        replacementPublicationId: amd.replacement_publication_id,
        internalEvidence: amd.internal_evidence_json?.studioReview
          ? {
              revisedEstimateId: amd.internal_evidence_json.studioReview.revisedEstimateId,
              sourceEstimateId: amd.internal_evidence_json.studioReview.sourceEstimateId,
              replacementPublicationId:
                amd.internal_evidence_json.studioReview.replacementPublicationId || null
            }
          : null,
        createdAt: amd.created_at,
        updatedAt: amd.updated_at
      })),
      timeline: (Array.isArray(events) ? events : []).map((ev) => ({
        id: ev.id,
        eventType: ev.event_type,
        actorType: ev.actor_type,
        createdAt: ev.created_at,
        metadata: sanitizeTimelineMetadata(ev.metadata)
      }))
    };
  }

  function sanitizeTimelineMetadata(meta) {
    if (!meta || typeof meta !== "object") return {};
    const out = { ...meta };
    delete out.token;
    delete out.accessToken;
    delete out.rawToken;
    delete out.markup;
    delete out.wholesale;
    return out;
  }

  async function ensureDraftAmendment(organizationId, requestId, actorUserId, seed = {}) {
    const existing = await amendmentRepository.listAmendmentsForRequest(
      organizationId,
      requestId
    );
    const open = existing.find((a) =>
      [AMENDMENT_STATUS.DRAFT, AMENDMENT_STATUS.READY, AMENDMENT_STATUS.VALIDATING].includes(
        a.status
      )
    );
    if (open) return open;
    const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
    const snap = request.request_snapshot_json || {};
    const selections = {};
    for (const o of snap.selectedOptions || []) {
      if (o.optionKey) selections[o.optionKey] = Number(o.quantity) || 0;
    }
    return amendmentRepository.createAmendmentDraft({
      organizationId,
      reviewRequestId: requestId,
      actorUserId,
      draftSelectionsJson: { selections, ...seed },
      sourceSelectionFingerprint: request.selection_hash
    });
  }

  return {
    toOperatorReviewStatus,

    async list(organizationId, query = {}) {
      const rows = await amendmentRepository.listReviewRequests(organizationId, {
        status: query.status || null,
        limit: Number(query.limit) || 50
      });
      const out = [];
      for (const r of rows) {
        const publication = await deRepository.getPublication(organizationId, r.publication_id);
        const estimateRow = publication
          ? await resolveEstimateForPublication(organizationId, publication)
          : null;
        const amendments = await amendmentRepository.listAmendmentsForRequest(
          organizationId,
          r.id
        );
        const linkage = extractStudioLinkage({
          publication,
          amendments,
          estimateRow
        });
        const snap = r.request_snapshot_json || {};
        const project = {};
        try {
          const pubSnap = await deRepository.getSnapshotByPublicationId(
            organizationId,
            r.publication_id
          );
          Object.assign(project, pubSnap?.customer_snapshot_json?.project || {});
        } catch {
          // ignore
        }
        out.push({
          id: r.id,
          status: r.status,
          operatorStatus: toOperatorReviewStatus(r),
          publicationId: r.publication_id,
          publicationStatus: publication?.status || null,
          quoteNumber: snap.estimateIdentity?.quoteNumber || publication?.quote_number || null,
          customerName: project.customerName || null,
          projectName: project.projectName || null,
          requestedAt: r.created_at,
          baselineDisplayTotal: r.baseline_display_total,
          requestedDisplayTotal: r.configured_display_total,
          displayDelta: r.display_delta,
          changedSelectionCount: Array.isArray(snap.selectedOptions)
            ? snap.selectedOptions.length
            : 0,
          hasCustomerNote: Boolean(r.customer_note),
          intakeCaseId: linkage.intakeCaseId,
          studioEstimateId: linkage.studioEstimateId,
          revisedEstimateId: linkage.revisedEstimateId,
          linkedEstimateRevision:
            estimateRow?.revision ?? linkage.sourceEstimateRevision ?? null,
          resolutionState: toOperatorReviewStatus(r)
        });
      }
      return { ok: true, reviewRequests: out };
    },

    async getDetail(organizationId, requestId) {
      return buildEnrichedDetail(organizationId, requestId);
    },

    async startReview(organizationId, requestId, actorUserId) {
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
      if (
        ![REVIEW_STATUS.REQUESTED, REVIEW_STATUS.CLARIFICATION].includes(request.status) &&
        request.status !== REVIEW_STATUS.REVIEWING
      ) {
        if (request.status === REVIEW_STATUS.REVIEWING) {
          return { ok: true, status: REVIEW_STATUS.REVIEWING, operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.IN_REVIEW };
        }
      }
      await amendmentRepository.updateReviewRequestStatus(
        organizationId,
        requestId,
        REVIEW_STATUS.REVIEWING
      );
      if (typeof amendmentRepository.appendEvent === "function") {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          review_request_id: requestId,
          event_type: "review_opened",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: { operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.IN_REVIEW }
        });
      }
      return {
        ok: true,
        status: REVIEW_STATUS.REVIEWING,
        operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.IN_REVIEW
      };
    },

    async resolveNoChange(organizationId, requestId, body, actorUserId) {
      rejectCallerAuthority(body);
      const note = requireNote(body?.note ?? body?.resolutionNote, "Estimator note");
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
      if (
        [REVIEW_STATUS.PUBLISHED, REVIEW_STATUS.CLOSED, REVIEW_STATUS.SUPERSEDED].includes(
          request.status
        )
      ) {
        throw deError("Review request is already resolved", "already_resolved", 409);
      }

      const closed = await amendmentRepository.closeReviewRequest(
        organizationId,
        requestId,
        encodeResolutionReason(RESOLUTION_KIND.NO_CHANGE, note),
        actorUserId
      );
      if (typeof amendmentRepository.appendEvent === "function") {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          review_request_id: requestId,
          event_type: "resolved_no_change",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: { hasNote: true }
        });
      }
      return {
        ok: true,
        status: closed.status,
        operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_NO_CHANGE,
        published: false,
        resolutionNote: note
      };
    },

    async reject(organizationId, requestId, body, actorUserId) {
      rejectCallerAuthority(body);
      const note = requireNote(body?.note ?? body?.resolutionNote, "Rejection note");
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
      if (
        [REVIEW_STATUS.PUBLISHED, REVIEW_STATUS.CLOSED, REVIEW_STATUS.SUPERSEDED].includes(
          request.status
        )
      ) {
        throw deError("Review request is already resolved", "already_resolved", 409);
      }

      const closed = await amendmentRepository.closeReviewRequest(
        organizationId,
        requestId,
        encodeResolutionReason(RESOLUTION_KIND.REJECTED, note),
        actorUserId
      );
      if (typeof amendmentRepository.appendEvent === "function") {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          review_request_id: requestId,
          event_type: "review_rejected",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: { hasNote: true }
        });
      }
      return {
        ok: true,
        status: closed.status,
        operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.REJECTED,
        published: false,
        resolutionNote: note
      };
    },

    async reviseEstimate(organizationId, requestId, body, actorUserId) {
      rejectCallerAuthority(body);
      const applySelections = body?.applyCustomerSelections === true;
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
      if (
        [REVIEW_STATUS.PUBLISHED, REVIEW_STATUS.CLOSED, REVIEW_STATUS.SUPERSEDED].includes(
          request.status
        )
      ) {
        throw deError("Review request is already resolved", "already_resolved", 409);
      }

      const publication = await deRepository.getPublication(organizationId, request.publication_id);
      if (!publication) throw deError("Publication not found", "not_found", 404);

      const sourceEstimate = await resolveEstimateForPublication(organizationId, publication);
      if (!sourceEstimate) {
        throw deError(
          "Source Studio estimate not found for this publication",
          "studio_estimate_not_found",
          404
        );
      }

      // Prefer active approved estimate for the intake case; fall back to publication source.
      let active = sourceEstimate;
      if (sourceEstimate.intakeCaseId && studioEstimateService.repository?.getActiveByIntakeCase) {
        const current = await studioEstimateService.repository.getActiveByIntakeCase(
          organizationId,
          sourceEstimate.intakeCaseId
        );
        if (current) active = current;
      }

      if (active.status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
        throw deError(
          "Cannot revise from a superseded estimate — open the active revision",
          "estimate_superseded",
          409
        );
      }

      const priorApproval = active.approval ? structuredClone(active.approval) : null;
      const priorCalc = active.calculationSnapshot
        ? structuredClone(active.calculationSnapshot)
        : null;

      let nextScope = active.scope;
      let selectionBlockers = [];
      if (applySelections) {
        const applied = applyCustomerSelectionsToScope(active.scope, request);
        nextScope = applied.scope;
        selectionBlockers = applied.blockers;
        if (selectionBlockers.length) {
          throw deError(
            selectionBlockers.map((b) => b.message).join("; "),
            "unsupported_customer_option",
            422
          );
        }
      } else {
        selectionBlockers = detectUnsupportedSelections(request);
      }

      const revised = await studioEstimateService.repository.createRevisionFrom(
        organizationId,
        active.id,
        {
          status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
          scope: nextScope,
          staleReason: "Opened from customer review request — recalculate and reapprove",
          takeoffJobId: active.takeoffJobId,
          sourceTakeoffResultId: active.sourceTakeoffResultId
        },
        actorUserId
      );

      // Preserve prior row approval snapshot (createRevisionFrom already supersedes prior).
      const superseded = await loadEstimateById(organizationId, active.id);
      if (superseded && priorApproval && !superseded.approval) {
        // Defensive: ensure superseded row still holds approval if repo cleared it.
        await studioEstimateService.repository.update(
          organizationId,
          active.id,
          {
            status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED,
            approval: priorApproval,
            calculationSnapshot: priorCalc
          },
          actorUserId
        );
      }

      const amd = await ensureDraftAmendment(organizationId, requestId, actorUserId);
      const studioEvidence = {
        studioReview: {
          sourceEstimateId: active.id,
          sourceEstimateRevision: active.revision,
          revisedEstimateId: revised.id,
          revisedEstimateRevision: revised.revision,
          intakeCaseId: active.intakeCaseId,
          takeoffJobId: active.takeoffJobId,
          applyCustomerSelections: applySelections,
          at: new Date().toISOString(),
          actorUserId: actorUserId || null
        }
      };
      await amendmentRepository.updateAmendmentDraft(
        organizationId,
        amd.id,
        {
          internal_evidence_json: {
            ...(amd.internal_evidence_json || {}),
            ...studioEvidence
          },
          internal_notes_json: [
            ...(Array.isArray(amd.internal_notes_json) ? amd.internal_notes_json : []),
            {
              type: "studio_revision_opened",
              text: `Opened Studio estimate revision R${revised.revision} from customer review request`,
              at: new Date().toISOString(),
              actorUserId: actorUserId || null,
              revisedEstimateId: revised.id
            }
          ]
        },
        { actorUserId }
      );

      await amendmentRepository.updateReviewRequestStatus(
        organizationId,
        requestId,
        REVIEW_STATUS.AMENDMENT_PREPARED
      );
      if (typeof amendmentRepository.appendEvent === "function") {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          review_request_id: requestId,
          amendment_id: amd.id,
          event_type: "studio_revision_opened",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: {
            sourceEstimateId: active.id,
            revisedEstimateId: revised.id,
            revision: revised.revision
          }
        });
      }

      return {
        ok: true,
        status: REVIEW_STATUS.AMENDMENT_PREPARED,
        operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.REVISION_REQUIRED,
        sourceEstimate: {
          id: active.id,
          revision: active.revision,
          status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED,
          approvalPreserved: Boolean(priorApproval)
        },
        revisedEstimate: studioEstimateService.safeEstimateView(revised),
        selectionBlockers,
        notice:
          "New Studio estimate revision created. Recalculate and approve before republishing. Prior approval snapshot is preserved on the superseded revision."
      };
    },

    async republish(organizationId, requestId, body, actorUserId) {
      rejectCallerAuthority(body);
      if (body?.confirm !== true && body?.confirm !== "true") {
        throw deError("Explicit republish confirmation required", "confirm_required", 400);
      }

      const detail = await buildEnrichedDetail(organizationId, requestId);
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);

      if (request.status === REVIEW_STATUS.PUBLISHED) {
        const amd = (detail.amendments || []).find((a) => a.replacementPublicationId);
        return {
          ok: true,
          reused: true,
          status: REVIEW_STATUS.PUBLISHED,
          operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_REPUBLISHED,
          publication: amd?.replacementPublicationId
            ? { id: amd.replacementPublicationId }
            : detail.linkage.replacementPublicationId
              ? { id: detail.linkage.replacementPublicationId }
              : null,
          accessToken: null,
          customerUrl: null,
          notice: "Already republished — raw token is not re-issued. Use Replace Link if needed."
        };
      }

      if (request.status === REVIEW_STATUS.CLOSED || request.status === REVIEW_STATUS.SUPERSEDED) {
        throw deError("Review request is closed", "already_resolved", 409);
      }

      const revisedId = detail.linkage.revisedEstimateId;
      if (!revisedId) {
        throw deError(
          "Open a Studio estimate revision before republishing",
          "revision_required",
          422
        );
      }

      const unsupported = detectUnsupportedSelections(request);
      if (unsupported.length) {
        throw deError(
          unsupported.map((b) => b.message).join("; "),
          "unsupported_customer_option",
          422
        );
      }

      const revised = await loadEstimateById(organizationId, revisedId);
      if (!revised) throw deError("Revised estimate not found", "estimate_not_found", 404);
      if (revised.status !== STUDIO_ESTIMATE_STATUSES.APPROVED) {
        throw deError(
          "Approve the revised Studio estimate before republishing",
          "estimate_not_approved",
          422
        );
      }

      // Publish FIRST — only mark resolved after success.
      let published;
      try {
        published = await studioDigitalEstimateService.publish({
          organizationId,
          estimateId: revisedId,
          actorUserId,
          body: {
            confirm: true,
            idempotencyKey:
              body?.idempotencyKey ||
              `review-republish:${requestId}:${revisedId}:${revised.revision}`,
            configuration: body?.configuration && typeof body.configuration === "object"
              ? body.configuration
              : {}
          }
        });
      } catch (e) {
        if (typeof amendmentRepository.appendEvent === "function") {
          await amendmentRepository.appendEvent({
            organization_id: organizationId,
            review_request_id: requestId,
            event_type: "studio_republish_failed",
            actor_type: "user",
            actor_user_id: actorUserId ?? null,
            metadata: { code: e?.code || "publish_failed" }
          });
        }
        throw e;
      }

      const publicationId = published.publication?.id;
      const amendments = await amendmentRepository.listAmendmentsForRequest(
        organizationId,
        requestId
      );
      const amd =
        amendments.find((a) =>
          [AMENDMENT_STATUS.DRAFT, AMENDMENT_STATUS.READY, AMENDMENT_STATUS.VALIDATING].includes(
            a.status
          )
        ) || amendments[0];

      if (amd) {
        const evidence = {
          ...(amd.internal_evidence_json || {}),
          studioReview: {
            ...((amd.internal_evidence_json && amd.internal_evidence_json.studioReview) || {}),
            replacementPublicationId: publicationId,
            republishedAt: new Date().toISOString(),
            republishedByUserId: actorUserId || null
          }
        };
        // Mark amendment published + link replacement (memory + supabase may differ).
        if (typeof amendmentRepository.updateAmendmentDraft === "function") {
          try {
            await amendmentRepository.updateAmendmentDraft(
              organizationId,
              amd.id,
              {
                status: AMENDMENT_STATUS.PUBLISHED,
                internal_evidence_json: evidence,
                replacement_publication_id: publicationId,
                published_at: new Date().toISOString(),
                published_by_user_id: actorUserId || null
              },
              { actorUserId }
            );
          } catch {
            // If draft update rejects published status, patch evidence only via direct row when memory
            if (amd.internal_evidence_json !== undefined) {
              amd.internal_evidence_json = evidence;
              amd.replacement_publication_id = publicationId;
              amd.status = AMENDMENT_STATUS.PUBLISHED;
            }
          }
        }
      }

      await amendmentRepository.updateReviewRequestStatus(
        organizationId,
        requestId,
        REVIEW_STATUS.PUBLISHED,
        {
          closed_reason: encodeResolutionReason(
            RESOLUTION_KIND.REPUBLISHED,
            body?.note ? String(body.note).slice(0, 500) : "republished"
          ),
          closed_at: new Date().toISOString()
        }
      );

      if (typeof amendmentRepository.appendEvent === "function") {
        await amendmentRepository.appendEvent({
          organization_id: organizationId,
          review_request_id: requestId,
          amendment_id: amd?.id || null,
          publication_id: publicationId,
          event_type: "studio_republished",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: {
            revisedEstimateId: revisedId,
            publicationId,
            reused: Boolean(published.reused)
          }
        });
      }

      return {
        ok: true,
        reused: Boolean(published.reused),
        status: REVIEW_STATUS.PUBLISHED,
        operatorStatus: STUDIO_REVIEW_OPERATOR_STATUS.RESOLVED_REPUBLISHED,
        publication: published.publication,
        accessToken: published.accessToken || null,
        customerUrl: published.customerUrl || null,
        revisedEstimateId: revisedId,
        supersededCount: published.supersededCount ?? null,
        staffNotice: published.staffNotice || null
      };
    }
  };
}
