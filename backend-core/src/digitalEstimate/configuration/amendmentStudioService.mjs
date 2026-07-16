/**
 * DE.2F — Studio review queue + amendment draft + atomic re-publication.
 * Never writes quote_headers. Never calls calculateQuote(). Never emails.
 */

import {
  AMENDMENT_STATUS,
  isDigitalEstimateAmendmentStudioRuntimeEnabled,
  REVIEW_STATUS
} from "./amendmentConfig.mjs";
import { calculateElite100ConfigDelta, ELITE100_CONFIG_DELTA_ENGINE_ID } from "./elite100ConfigDeltaEngine.mjs";
import {
  buildTrustedConfigurationContext,
  rejectClientAuthoritativeEconomics,
  serverApprovedOptionCatalog
} from "./configurationTrustedContext.mjs";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import {
  DIGITAL_ESTIMATE_ENGINE_VERSION,
  DIGITAL_ESTIMATE_TERMS_VERSION,
  isDigitalEstimatePublishEnabled,
  readDigitalEstimateAccessTtlDays,
  readDigitalEstimatePricingValidDays,
  readDigitalEstimatePublicBaseUrl
} from "../digitalEstimateConfig.mjs";
import { sanitizeDigitalEstimateEventMetadata } from "../digitalEstimateEvents.mjs";
import { generateDigitalEstimateAccessToken, sha256CanonicalJson } from "../digitalEstimateToken.mjs";
import {
  assertPublicDtoHasNoForbiddenContent,
  buildPublicDigitalEstimateDto
} from "../digitalEstimatePublicSerializer.mjs";
import { describeSyntheticPublicAccessibility } from "../syntheticPilotGuard.mjs";

function deError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function addDaysIso(days, now = new Date()) {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function addDaysDateOnly(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FORBIDDEN_AMENDMENT_KEYS = [
  "organizationId",
  "organization_id",
  "token",
  "accessToken",
  "publicationId",
  "quoteId",
  "chargeableCounterSf",
  "countertopSqft",
  "lockedMeasurement",
  "Wholesale",
  "Direct",
  "watts",
  "spahn",
  "accepted",
  "sold",
  "customLinePrice",
  "materialRate",
  "markupAuthority"
];

export function rejectAmendmentCallerAuthority(body) {
  rejectClientAuthoritativeEconomics(body);
  if (!body || typeof body !== "object") return;
  for (const f of FORBIDDEN_AMENDMENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw deError("Caller-controlled fields are not accepted", "forbidden_caller_authority", 400);
    }
  }
}

/**
 * Build structured baseline-vs-requested comparison from immutable request snapshot + source snap.
 */
export function buildStructuredComparison({ request, sourceCustomerSnapshot = null, envelopeOptions = [] }) {
  const snap = request.request_snapshot_json || {};
  const requested = Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [];
  const baselineRooms = Array.isArray(sourceCustomerSnapshot?.rooms)
    ? sourceCustomerSnapshot.rooms
    : [];

  const rows = [];
  for (const opt of requested) {
    const key = opt.optionKey || opt.key;
    const envOpt = envelopeOptions.find((o) => (o.option_key || o.optionKey) === key);
    const isMaterial = String(key || "").startsWith("material:");
    const roomKey = isMaterial ? String(key).split(":")[1] : envOpt?.compatibility_json?.roomKey;
    const baselineRoom = baselineRooms.find(
      (r) => String(r.name || "").toLowerCase() === String(roomKey || "").toLowerCase()
    );
    rows.push({
      optionKey: key,
      displayLabel: opt.displayLabel || envOpt?.display_label || key,
      groupKey: envOpt?.group_key || null,
      roomKey: roomKey || null,
      changeType: isMaterial ? "material" : "option",
      baselineSelection: baselineRoom
        ? { materialLabel: baselineRoom.materialLabel, colorLabel: baselineRoom.colorLabel }
        : null,
      requestedSelection: {
        optionKey: key,
        displayLabel: opt.displayLabel || key,
        quantity: Number(opt.quantity) || 0
      },
      lockedProfessionalQuantity: null,
      customerSafeDisplay: {
        label: opt.displayLabel || key,
        quantity: Number(opt.quantity) || 0
      },
      warnings: [],
      compatibility: envOpt?.compatibility_json || envOpt?.compatibilityJson || null,
      reviewState: "pending"
    });
  }

  const internalTotals = {
    baselineDisplay: request.baseline_display_total,
    requestedDisplay: request.configured_display_total,
    displayDelta: request.display_delta,
    baselineExact: request.baseline_display_total,
    requestedExact: request.configured_display_total,
    exactDelta: request.display_delta
  };
  const customerSafeTotals = {
    baselineDisplay: request.baseline_display_total,
    requestedDisplay: request.configured_display_total,
    displayDelta: request.display_delta,
    selectedOptions: requested
  };

  return {
    rows,
    changedSelectionCount: rows.length,
    internalTotals,
    customerSafeTotals
  };
}

function staffAmendmentView(amd) {
  return {
    id: amd.id,
    reviewRequestId: amd.review_request_id,
    sourcePublicationId: amd.source_publication_id,
    amendmentVersion: amd.amendment_version,
    status: amd.status,
    rowVersion: amd.row_version,
    draftSelections: amd.draft_selections_json,
    customerSafeExplanation: amd.customer_safe_explanation,
    internalNotes: amd.internal_notes_json,
    clarificationMessageCustomer: amd.clarification_message_customer,
    baselineDisplayTotal: amd.baseline_display_total,
    configuredDisplayTotal: amd.configured_display_total,
    displayDelta: amd.display_delta,
    pricingValidThrough: amd.pricing_valid_through,
    replacementPublicationId: amd.replacement_publication_id,
    calculation: amd.amendment_calculation_json?.public || null,
    publishedAt: amd.published_at,
    createdAt: amd.created_at,
    updatedAt: amd.updated_at
  };
}

function customerSafeAmendmentSerializer(amd) {
  const calc = amd.amendment_calculation_json?.public || amd.customer_snapshot_json || {};
  const dto = {
    documentTitle: "Digital Estimate",
    publishedAt: amd.published_at,
    pricingValidThrough: amd.pricing_valid_through,
    totals: {
      estimatedProjectTotal: amd.configured_display_total,
      currency: "USD",
      rounding: "integer_usd"
    },
    baselineDisplayTotal: amd.baseline_display_total,
    configuredDisplayTotal: amd.configured_display_total,
    displayDelta: amd.display_delta,
    selectedOptions: calc.selectedOptions || [],
    explanatoryNote: amd.customer_safe_explanation,
    nonbindingDisclaimer:
      "This updated digital estimate is provided for planning and review. It is not an order or acceptance."
  };
  assertPublicConfigurationHasNoForbiddenContent(dto);
  return dto;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   deRepository: any,
 *   configurationRepository: any,
 *   pricingPolicyRepository?: any,
 *   amendmentRepository: any
 * }} deps
 */
export function createAmendmentStudioService(deps) {
  const env = deps.env || process.env;
  const {
    deRepository,
    configurationRepository,
    pricingPolicyRepository,
    amendmentRepository
  } = deps;

  function assertStudioRuntime() {
    if (!isDigitalEstimateAmendmentStudioRuntimeEnabled(env)) {
      throw deError("Amendments unavailable", "amendments_disabled", 404);
    }
  }

  async function runDe2cForSelections({
    organizationId,
    publication,
    snap,
    envelope,
    selectionsMap,
    markupBps = 0
  }) {
    if (typeof configurationRepository.seedPublication === "function") {
      configurationRepository.seedPublication(publication);
      configurationRepository.seedSnapshot(snap);
    }
    const ctx = await buildTrustedConfigurationContext({
      organizationId,
      publicationId: publication.id,
      deRepository,
      pricingPolicyRepository
    });
    if (!ctx.canConfigure) {
      throw deError("Configuration unavailable", "configuration_unavailable", 400);
    }
    const graph = await configurationRepository.getEnvelopeGraph(organizationId, envelope.id);
    const options = graph?.options || [];
    const normalized = normalizeSelectionPayload({ selections: selectionsMap }, options);

    const rooms = (ctx.rooms || []).map((r) => {
      let selected = r.baselineMaterialGroup;
      for (const [key, qty] of Object.entries(normalized.selections)) {
        if (Number(qty) <= 0) continue;
        if (key.startsWith(`material:${r.roomKey}:`)) {
          selected = key.split(":")[2] || selected;
        } else {
          const opt = options.find((o) => (o.option_key || o.optionKey) === key);
          const compat = opt?.compatibility_json || opt?.compatibilityJson || {};
          if (compat.roomKey === r.roomKey && compat.materialGroup) {
            selected = compat.materialGroup;
          }
        }
      }
      return {
        roomKey: r.roomKey,
        displayName: r.displayName,
        chargeableCounterSf: r.chargeableCounterSf,
        selectedMaterialGroup: selected,
        baselineMaterialGroup: r.baselineMaterialGroup
      };
    });

    const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
    const calcOptions = [];
    for (const [key, qtyRaw] of Object.entries(normalized.selections)) {
      if (key.startsWith("material:")) continue;
      const qty = Number(qtyRaw) || 0;
      if (qty <= 0) continue;
      const cat = catalog.get(key);
      const envOpt = options.find((o) => (o.option_key || o.optionKey) === key);
      if (!cat && !envOpt) throw deError("That selection is unavailable", "unknown_option", 400);
      const sellPrice =
        cat?.sellPrice != null ? cat.sellPrice : envOpt?.sell_price ?? envOpt?.sellPrice;
      if (sellPrice == null) throw deError("That selection is unavailable", "unresolved_product", 422);
      calcOptions.push({
        optionKey: key,
        displayLabel: cat?.displayLabel || envOpt?.display_label || key,
        quantity: qty,
        sellPrice,
        pricingMode: cat?.pricingMode || envOpt?.pricing_mode || "fixed",
        customerPriceTreatment:
          cat?.customerPriceTreatment || envOpt?.customer_price_treatment || "absolute",
        minQty: cat?.minQty ?? envOpt?.min_qty ?? 0,
        maxQty: cat?.maxQty ?? envOpt?.max_qty ?? null,
        availabilityState: "active"
      });
    }

    const result = calculateElite100ConfigDelta({
      organizationId,
      publication: {
        id: publication.id,
        snapshotId: snap.id,
        status: "active",
        quoteFamilyRootId: publication.quote_family_root_id
      },
      envelope: {
        id: envelope.id,
        version: envelope.envelope_version,
        status: "active",
        publicationId: publication.id
      },
      pricingPolicyFingerprint: ctx.pricingPolicyFingerprint,
      catalogFingerprint: ctx.catalogFingerprint,
      engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
      pricingBasis: ctx.pricingBasis || "direct",
      partnerAccountId: ctx.partnerAccountId,
      accountMemberships: ctx.accountMemberships,
      materialRateOverrides: ctx.materialRateOverrides,
      estimateAdjustments: ctx.estimateAdjustments,
      rooms,
      frozenBaseRates: ctx.frozenBaseRates,
      authorizedMaterialMarkup: { bps: markupBps },
      materialTaxPolicy: { bps: 200 },
      options: calcOptions,
      baseline: {
        exactTotal: ctx.baselineDisplayTotal,
        displayTotal: ctx.baselineDisplayTotal,
        rooms: (ctx.rooms || []).map((r) => ({
          roomKey: r.roomKey,
          materialGroup: r.baselineMaterialGroup
        }))
      },
      pricingValidThrough: ctx.pricingValidThrough,
      materialProgram: "elite_100",
      actor: { type: "estimator" }
    });
    assertPublicConfigurationHasNoForbiddenContent(result.public);
    return { result, normalized, ctx };
  }

  return {
    async listReviewRequests(organizationId, query = {}) {
      assertStudioRuntime();
      const rows = await amendmentRepository.listReviewRequests(organizationId, {
        status: query.status || null,
        limit: Number(query.limit) || 50
      });
      return {
        ok: true,
        reviewRequests: rows.map((r) => {
          const snap = r.request_snapshot_json || {};
          return {
            id: r.id,
            status: r.status,
            publicationId: r.publication_id,
            quoteNumber: snap.estimateIdentity?.quoteNumber || null,
            requestedAt: r.created_at,
            baselineDisplayTotal: r.baseline_display_total,
            requestedDisplayTotal: r.configured_display_total,
            displayDelta: r.display_delta,
            changedSelectionCount: Array.isArray(snap.selectedOptions)
              ? snap.selectedOptions.length
              : 0,
            pricingValidThrough: r.pricing_valid_through,
            hasCustomerNote: Boolean(r.customer_note),
            clarificationRequired: r.status === REVIEW_STATUS.CLARIFICATION
          };
        })
      };
    },

    async getReviewRequestDetail(organizationId, requestId) {
      assertStudioRuntime();
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);

      const publication = await deRepository.getPublication(organizationId, request.publication_id);
      const snap = await deRepository.getSnapshotByPublicationId(
        organizationId,
        request.publication_id
      );
      let envelopeOptions = [];
      try {
        const graph = await configurationRepository.getEnvelopeGraph(
          organizationId,
          request.envelope_id
        );
        envelopeOptions = graph?.options || [];
      } catch {
        envelopeOptions = [];
      }

      const comparison = buildStructuredComparison({
        request,
        sourceCustomerSnapshot: snap?.customer_snapshot_json,
        envelopeOptions
      });

      const amendments = await amendmentRepository.listAmendmentsForRequest(
        organizationId,
        requestId
      );

      return {
        ok: true,
        reviewRequest: {
          id: request.id,
          status: request.status,
          publicationId: request.publication_id,
          envelopeId: request.envelope_id,
          envelopeVersion: request.envelope_version,
          requestedAt: request.created_at,
          pricingValidThrough: request.pricing_valid_through,
          customerNote: request.customer_note,
          immutable: true,
          estimateIdentity: {
            quoteNumber: publication?.quote_number,
            revisionLabel: publication?.revision_label,
            revisionNumber: publication?.revision_number,
            customerName: snap?.customer_snapshot_json?.project?.customerName,
            projectName: snap?.customer_snapshot_json?.project?.projectName
          }
        },
        comparison,
        customerSafe: comparison.customerSafeTotals,
        amendments: amendments.map(staffAmendmentView),
        events: amendmentRepository.listEvents(organizationId, { reviewRequestId: requestId })
      };
    },

    async startReview(organizationId, requestId, actorUserId) {
      assertStudioRuntime();
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
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
          metadata: {}
        });
      }
      return { ok: true, status: REVIEW_STATUS.REVIEWING };
    },

    async setClarification(organizationId, requestId, message, actorUserId) {
      assertStudioRuntime();
      rejectAmendmentCallerAuthority({ message });
      const safe = String(message || "")
        .replace(/<[^>]*>/g, "")
        .slice(0, 1000);
      const req = await amendmentRepository.setClarificationRequired(
        organizationId,
        requestId,
        safe,
        actorUserId
      );
      return { ok: true, status: req.status, clarificationMessageCustomer: safe };
    },

    async closeReview(organizationId, requestId, reason, actorUserId) {
      assertStudioRuntime();
      const req = await amendmentRepository.closeReviewRequest(
        organizationId,
        requestId,
        reason || "closed_without_amendment",
        actorUserId
      );
      return { ok: true, status: req.status };
    },

    async createAmendmentDraft(organizationId, requestId, actorUserId) {
      assertStudioRuntime();
      const request = await amendmentRepository.getReviewRequest(organizationId, requestId);
      if (!request) throw deError("Review request not found", "not_found", 404);
      const snap = request.request_snapshot_json || {};
      const selections = {};
      for (const o of snap.selectedOptions || []) {
        if (o.optionKey) selections[o.optionKey] = Number(o.quantity) || 0;
      }
      const amd = await amendmentRepository.createAmendmentDraft({
        organizationId,
        reviewRequestId: requestId,
        actorUserId,
        draftSelectionsJson: { selections },
        sourceSelectionFingerprint: request.selection_hash
      });
      return { ok: true, amendment: staffAmendmentView(amd) };
    },

    async updateAmendmentDraft(organizationId, amendmentId, body, actorUserId) {
      assertStudioRuntime();
      rejectAmendmentCallerAuthority(body || {});
      const expectedRowVersion = body?.expectedRowVersion ?? body?.expected_row_version;
      const patch = {};
      if (body.selections != null || body.draftSelections != null) {
        const sel = body.selections || body.draftSelections || {};
        if (sel.chargeableCounterSf != null || sel.lockedMeasurement != null) {
          throw deError("Locked measurements cannot be edited", "forbidden_caller_authority", 400);
        }
        patch.draft_selections_json = { selections: sel.selections || sel };
      }
      if (body.customerSafeExplanation != null) {
        patch.customer_safe_explanation = String(body.customerSafeExplanation)
          .replace(/<[^>]*>/g, "")
          .slice(0, 2000);
      }
      if (body.internalNote != null) {
        const existing = (
          await amendmentRepository.getAmendment(organizationId, amendmentId)
        )?.internal_notes_json;
        const notes = Array.isArray(existing) ? [...existing] : [];
        notes.push({
          text: String(body.internalNote).replace(/<[^>]*>/g, "").slice(0, 2000),
          at: new Date().toISOString(),
          actorUserId: actorUserId || null
        });
        patch.internal_notes_json = notes;
      }
      const amd = await amendmentRepository.updateAmendmentDraft(
        organizationId,
        amendmentId,
        patch,
        { expectedRowVersion, actorUserId }
      );
      return { ok: true, amendment: staffAmendmentView(amd) };
    },

    async validateAmendment(organizationId, amendmentId, body, actorUserId) {
      assertStudioRuntime();
      rejectAmendmentCallerAuthority(body || {});
      const amd = await amendmentRepository.getAmendment(organizationId, amendmentId);
      if (!amd) throw deError("Amendment not found", "not_found", 404);
      const request = await amendmentRepository.getReviewRequest(
        organizationId,
        amd.review_request_id
      );
      const publication = await deRepository.getPublication(
        organizationId,
        amd.source_publication_id
      );
      if (!publication) throw deError("Publication not found", "not_found", 404);
      const snap = await deRepository.getSnapshotByPublicationId(
        organizationId,
        amd.source_publication_id
      );
      const envelope = await configurationRepository.getEnvelope(
        organizationId,
        request.envelope_id
      );
      if (!envelope) throw deError("Envelope not found", "not_found", 404);

      const selectionsMap =
        amd.draft_selections_json?.selections || amd.draft_selections_json || {};
      let markupBps = 0;
      if (body?.authorizedMaterialMarkupBps != null) {
        // Only accept when explicitly provided with reason — still server-bounded
        const reason = String(body.authorizedMarkupReason || "").trim();
        if (!reason) {
          throw deError("Markup reason required", "markup_reason_required", 400);
        }
        markupBps = Math.min(5000, Math.max(0, Number(body.authorizedMaterialMarkupBps) || 0));
      }

      const { result, normalized, ctx } = await runDe2cForSelections({
        organizationId,
        publication,
        snap,
        envelope,
        selectionsMap,
        markupBps
      });

      const updated = await amendmentRepository.updateAmendmentDraft(
        organizationId,
        amendmentId,
        {
          status: AMENDMENT_STATUS.READY,
          amendment_calculation_json: {
            public: result.public,
            internal: result.internal,
            totals: result.totals
          },
          pricing_policy_fingerprint: ctx.pricingPolicyFingerprint,
          catalog_fingerprint: ctx.catalogFingerprint,
          engine_version: ELITE100_CONFIG_DELTA_ENGINE_ID,
          final_calculation_fingerprint: result.calculationFingerprint,
          baseline_display_total: result.totals.baselineExactTotal,
          configured_display_total: result.totals.configuredExactTotal,
          display_delta:
            Number(result.totals.configuredExactTotal) - Number(result.totals.baselineExactTotal),
          pricing_valid_through: ctx.pricingValidThrough,
          draft_selections_json: { selections: normalized.selections }
        },
        {
          expectedRowVersion: body?.expectedRowVersion ?? body?.expected_row_version ?? amd.row_version,
          actorUserId
        }
      );

      // Append validated event via list (update already logged amendment_updated)
      return {
        ok: true,
        amendment: staffAmendmentView(updated),
        calculation: result.public,
        customerSafe: customerSafeAmendmentSerializer(updated)
      };
    },

    /**
     * Atomic re-publication from validated amendment. Returns raw token once.
     */
    async publishAmendment(organizationId, amendmentId, body, actorUserId) {
      assertStudioRuntime();
      if (!isDigitalEstimatePublishEnabled(env)) {
        throw deError("Digital Estimate publish disabled", "digital_estimate_disabled", 404);
      }
      rejectAmendmentCallerAuthority(body || {});
      if (body?.confirm !== true && body?.confirm !== "true") {
        throw deError("Explicit publish confirmation required", "confirm_required", 400);
      }

      const amd = await amendmentRepository.getAmendment(organizationId, amendmentId);
      if (!amd) throw deError("Amendment not found", "not_found", 404);
      if (
        amd.status !== AMENDMENT_STATUS.READY &&
        amd.status !== AMENDMENT_STATUS.DRAFT &&
        amd.status !== AMENDMENT_STATUS.VALIDATING
      ) {
        if (amd.status === AMENDMENT_STATUS.PUBLISHED && amd.replacement_publication_id) {
          return {
            ok: true,
            reused: true,
            publication: { id: amd.replacement_publication_id },
            accessToken: null,
            customerUrl: null,
            notice: "Amendment already published; raw token is not re-issued."
          };
        }
        throw deError("Amendment not publishable", "amendment_not_publishable", 400);
      }
      if (!amd.amendment_calculation_json?.public) {
        throw deError("Validate amendment before publishing", "amendment_not_validated", 400);
      }

      const srcPub = await deRepository.getPublication(organizationId, amd.source_publication_id);
      if (!srcPub) throw deError("Source publication not found", "not_found", 404);
      const srcSnap = await deRepository.getSnapshotByPublicationId(
        organizationId,
        amd.source_publication_id
      );

      const now = new Date();
      const publishedAt = now.toISOString();
      const accessExpiresAt = addDaysIso(readDigitalEstimateAccessTtlDays(env), now);
      const pricingValidThrough =
        amd.pricing_valid_through || addDaysDateOnly(readDigitalEstimatePricingValidDays(env), now);

      const priorCustomer = srcSnap?.customer_snapshot_json || {};
      const calcPublic = amd.amendment_calculation_json.public;
      const configuredTotal =
        amd.configured_display_total ??
        calcPublic.totals?.configuredDisplayTotal ??
        calcPublic.totals?.configuredExactTotal;

      const customerSnapshotJson = {
        ...priorCustomer,
        documentTitle: priorCustomer.documentTitle || "Digital Estimate",
        publishedAt,
        pricingValidThrough,
        totals: {
          estimatedProjectTotal: Math.round(Number(configuredTotal)),
          currency: "USD",
          rounding: "integer_usd"
        },
        notes: [
          ...(Array.isArray(priorCustomer.notes) ? priorCustomer.notes : []),
          ...(amd.customer_safe_explanation ? [amd.customer_safe_explanation] : [])
        ],
        disclosures: {
          version: DIGITAL_ESTIMATE_TERMS_VERSION,
          text:
            "This updated digital estimate is provided for planning and review. It is not an order or acceptance. Totals are frozen at publication."
        },
        amendment: {
          sourceType: "digital_estimate_amendment",
          nonAcceptance: true
        },
        selectedOptions: calcPublic.selectedOptions || []
      };

      const publicDto = buildPublicDigitalEstimateDto(customerSnapshotJson);
      assertPublicDtoHasNoForbiddenContent(publicDto);

      const pricingEvidenceJson = {
        ...(srcSnap?.pricing_evidence_json || {}),
        sourceType: "digital_estimate_amendment",
        amendmentId,
        reviewRequestId: amd.review_request_id,
        priorPublicationId: amd.source_publication_id,
        amendmentCalculationFingerprint: amd.final_calculation_fingerprint,
        customerDisplayTotal: Math.round(Number(configuredTotal)),
        // Do not include internal rates in customer path; keep internal evidence server-side only
        internalEvidenceRef: true
      };

      const customerSnapshotHash = sha256CanonicalJson(customerSnapshotJson);
      const pricingEvidenceHash = sha256CanonicalJson(pricingEvidenceJson);
      const sourceQuoteFingerprint =
        srcPub.source_quote_fingerprint ||
        sha256CanonicalJson({
          sourceQuoteId: srcPub.source_quote_id,
          revision: srcPub.revision_number
        });

      const { rawToken, tokenHash } = generateDigitalEstimateAccessToken();
      const idempotencyKey = String(body?.idempotencyKey || body?.idempotency_key || "").trim() || null;

      const atomic = await amendmentRepository.publishAmendmentAtomic({
        organizationId,
        amendmentId,
        actorUserId,
        tokenHash,
        customerSnapshotJson,
        pricingEvidenceJson,
        customerSnapshotHash,
        pricingEvidenceHash,
        sourceQuoteFingerprint,
        accessExpiresAt,
        pricingValidThrough,
        termsDisclosureVersion: DIGITAL_ESTIMATE_TERMS_VERSION,
        calculationEngineVersion: DIGITAL_ESTIMATE_ENGINE_VERSION,
        expectedRowVersion: body?.expectedRowVersion ?? body?.expected_row_version ?? null,
        idempotencyKey
      });

      if (atomic.reused) {
        return {
          ok: true,
          reused: true,
          publication: { id: atomic.publicationId },
          accessToken: null,
          customerUrl: null,
          notice: "Amendment already published; raw token is not re-issued."
        };
      }

      const base = readDigitalEstimatePublicBaseUrl(env);
      const customerUrl = `${base}/e#${rawToken}`;
      const syntheticAccess = describeSyntheticPublicAccessibility(atomic.publicationId, env);

      return {
        ok: true,
        reused: false,
        amendment: staffAmendmentView(atomic.amendment),
        publication: {
          id: atomic.publicationId,
          status: "active",
          sourceType: "digital_estimate_amendment",
          priorPublicationId: amd.source_publication_id
        },
        // Raw token ONE TIME — never log.
        accessToken: rawToken,
        customerUrl,
        supersededCount: atomic.supersededCount ?? 0,
        syntheticPilot: syntheticAccess,
        staffNotice: syntheticAccess.awaitingSyntheticAllowlist
          ? "Replacement publication awaiting synthetic allowlist"
          : null
      };
    },

    async recordReplacementLinkCopied(organizationId, publicationId, actorUserId) {
      assertStudioRuntime();
      if (typeof deRepository.appendEvent === "function") {
        await deRepository.appendEvent({
          organization_id: organizationId,
          publication_id: publicationId,
          event_type: "link_copied",
          actor_type: "user",
          actor_user_id: actorUserId ?? null,
          metadata: sanitizeDigitalEstimateEventMetadata({ source: "amendment_replacement" })
        });
      }
      if (typeof amendmentRepository.recordReplacementLinkCopied === "function") {
        await amendmentRepository.recordReplacementLinkCopied(
          organizationId,
          publicationId,
          actorUserId
        );
      }
      return { ok: true };
    }
  };
}
