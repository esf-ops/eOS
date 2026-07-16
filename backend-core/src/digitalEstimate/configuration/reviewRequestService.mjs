/**
 * DE.2F — Public customer review-request service (nonbinding; not acceptance).
 */

import {
  CUSTOMER_NOTE_MAX_CHARS,
  isDigitalEstimateReviewRequestRuntimeEnabled,
  REVIEW_STATUS
} from "./amendmentConfig.mjs";
import { rejectClientAuthoritativeEconomics } from "./configurationTrustedContext.mjs";
import {
  constantTimeEqualSessionHash,
  hashConfigurationSessionSecret
} from "./publicConfigurationSession.mjs";
import {
  assertSyntheticPublicationPublicAccess,
  rejectSyntheticCallerAuthority
} from "../syntheticPilotGuard.mjs";

function unavailable(message = "Estimate unavailable") {
  const e = new Error(message);
  e.code = "not_found";
  e.statusCode = 404;
  return e;
}

function configUnavailable(message = "Configuration unavailable") {
  const e = new Error(message);
  e.code = "configuration_unavailable";
  e.statusCode = 404;
  return e;
}

function safeFail(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function isPricingExpired(pricingValidThrough, now = new Date()) {
  if (!pricingValidThrough) return false;
  const d = new Date(`${String(pricingValidThrough).slice(0, 10)}T23:59:59.999Z`);
  return Number.isFinite(d.getTime()) && now.getTime() > d.getTime();
}

const CUSTOMER_SAFE_STATUS = Object.freeze({
  [REVIEW_STATUS.REQUESTED]: "Sent for review",
  [REVIEW_STATUS.REVIEWING]: "Estimator reviewing",
  [REVIEW_STATUS.CLARIFICATION]: "Clarification requested",
  [REVIEW_STATUS.AMENDMENT_PREPARED]: "Estimator reviewing",
  [REVIEW_STATUS.PUBLISHED]: "Updated estimate available",
  [REVIEW_STATUS.CLOSED]: "Request closed",
  [REVIEW_STATUS.SUPERSEDED]: "Request closed"
});

/**
 * Reject spoofed review-request authority claims.
 */
export function rejectReviewRequestAuthority(body) {
  rejectClientAuthoritativeEconomics(body);
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "organizationId",
    "organization_id",
    "publicationId",
    "quoteId",
    "revisionNumber",
    "baselineDisplayTotal",
    "configuredDisplayTotal",
    "displayDelta",
    "exactDelta",
    "calculationResult",
    "selectionHash",
    "calculationId",
    "sessionId",
    "actor",
    "approverUserId",
    "accepted",
    "sold",
    "signature",
    "payment",
    "accountGroup",
    "markup",
    "Wholesale",
    "Direct",
    "watts",
    "spahn"
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw safeFail("forbidden_caller_authority", "Please refresh and try again", 400);
    }
  }
}

function sanitizeCustomerNote(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).replace(/\0/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  // Strip tags / angle brackets for plain-text-only storage
  s = s.replace(/<[^>]*>/g, "").trim();
  if (s.length > CUSTOMER_NOTE_MAX_CHARS) {
    throw safeFail("note_too_long", "Please shorten your note", 400);
  }
  return s || null;
}

function customerSafeRequestView(request, { currentSelectionHash = null } = {}) {
  const snap = request.request_snapshot_json || {};
  const submittedHash = request.selection_hash;
  const selectionsDiffer =
    currentSelectionHash != null &&
    submittedHash != null &&
    String(currentSelectionHash) !== String(submittedHash);
  return {
    requestReference: String(request.id).slice(0, 8).toUpperCase(),
    status: request.status,
    statusLabel: CUSTOMER_SAFE_STATUS[request.status] || "Sent for review",
    requestedAt: request.created_at,
    pricingValidThrough: request.pricing_valid_through,
    baselineDisplayTotal: request.baseline_display_total,
    configuredDisplayTotal: request.configured_display_total,
    displayDelta: request.display_delta,
    selectedOptions: Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [],
    customerNote: request.customer_note,
    nonAcceptanceNotice:
      "This is not an order or acceptance. Pricing and availability remain subject to estimator review.",
    currentSelectionsDifferFromSubmitted: selectionsDiffer,
    emailSent: false
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   deRepository: any,
 *   configurationRepository: any,
 *   amendmentRepository: any
 * }} deps
 */
export function createReviewRequestService(deps) {
  const env = deps.env || process.env;
  const { deRepository, configurationRepository, amendmentRepository } = deps;

  async function resolveSession(rawSecret) {
    const secret = String(rawSecret ?? "").trim();
    if (!secret) throw unavailable();
    const secretHash = hashConfigurationSessionSecret(secret);
    const session = await configurationRepository.getSessionBySecretHash(secretHash);
    if (!session || !constantTimeEqualSessionHash(session.session_secret_hash, secretHash)) {
      throw unavailable();
    }
    if (["revoked", "blocked"].includes(session.status)) throw unavailable();
    return session;
  }

  return {
    async createReviewRequest({ rawSecret, body }) {
      if (!isDigitalEstimateReviewRequestRuntimeEnabled(env)) {
        throw unavailable();
      }
      rejectSyntheticCallerAuthority(body || {});
      rejectReviewRequestAuthority(body || {});

      const expectedRowVersion = body?.expectedRowVersion ?? body?.expected_row_version;
      const expectedSelectionHash = body?.expectedSelectionHash ?? body?.expected_selection_hash;
      const idempotencyKey = String(body?.idempotencyKey || body?.idempotency_key || "").trim();
      if (!idempotencyKey) {
        throw safeFail("idempotency_required", "Please refresh and try again", 400);
      }
      if (expectedRowVersion == null) {
        throw safeFail("concurrency_required", "Please refresh and try again", 400);
      }

      const customerNote = sanitizeCustomerNote(body?.customerNote ?? body?.customer_note ?? null);
      const session = await resolveSession(rawSecret);
      if (!["active", "configuring", "saved"].includes(session.status)) {
        throw configUnavailable();
      }
      if (Number(session.row_version) !== Number(expectedRowVersion)) {
        throw safeFail("row_version_conflict", "Please refresh and try again", 409);
      }

      const publication = await deRepository.getPublication(
        session.organization_id,
        session.publication_id
      );
      if (!publication || publication.status !== "active") throw unavailable();
      assertSyntheticPublicationPublicAccess(publication.id, env);
      if (isPricingExpired(publication.pricing_valid_through)) {
        throw configUnavailable("Pricing has expired");
      }

      const activeEnvelope = await configurationRepository.getActiveEnvelope(
        session.organization_id,
        session.publication_id
      );
      if (!activeEnvelope) throw configUnavailable("Your estimate options were updated");
      if (session.envelope_id && session.envelope_id !== activeEnvelope.id) {
        throw configUnavailable("Your estimate options were updated");
      }

      const selection = await configurationRepository.getLatestSelectionForSession(
        session.organization_id,
        session.id
      );
      if (!selection) {
        throw safeFail("incomplete_configuration", "Please save your selections first", 400);
      }
      if (expectedSelectionHash && String(expectedSelectionHash) !== String(selection.selection_hash)) {
        throw safeFail("stale_selection", "Please save your selections first", 409);
      }

      const calcId = session.latest_calculation_id || selection.latest_calculation_id;
      let calculation = null;
      if (calcId) {
        calculation = await configurationRepository.getCalculation(
          session.organization_id,
          calcId
        );
      }
      if (!calculation && typeof configurationRepository.getCalculationBySelectionId === "function") {
        calculation = await configurationRepository.getCalculationBySelectionId(
          session.organization_id,
          selection.id
        );
      }
      if (!calculation) {
        throw safeFail("incomplete_configuration", "Please save your selections first", 400);
      }
      if (String(calculation.selection_id) !== String(selection.id)) {
        throw safeFail("stale_calculation", "Please save your selections first", 409);
      }

      const customerResult = calculation.customer_result_json || {};
      const totals = {
        baselineDisplayTotal:
          customerResult.baselineDisplayTotal ?? customerResult.totals?.baselineDisplayTotal ?? null,
        configuredDisplayTotal:
          customerResult.configuredDisplayTotal ?? customerResult.totals?.configuredDisplayTotal ?? calculation.configured_total ?? null,
        displayDelta:
          customerResult.displayTotalDelta ??
          customerResult.displayDelta ??
          customerResult.totals?.displayDelta ??
          null
      };
      const fromCalc = Array.isArray(customerResult.selectedOptions)
        ? customerResult.selectedOptions
        : Array.isArray(customerResult.options)
          ? customerResult.options.map((o) => ({
              optionKey: o.optionKey || o.key,
              displayLabel: o.displayLabel || o.label,
              quantity: o.quantity ?? o.qty ?? 1
            }))
          : [];
      const fromSelection = Object.entries(
        selection.selection_payload_json || selection.selections || {}
      ).map(([optionKey, quantity]) => ({
        optionKey,
        displayLabel: optionKey,
        quantity: Number(quantity) || 0
      }));
      const selectedOptions = (fromCalc.length ? fromCalc : fromSelection).filter(
        (o) => Number(o.quantity) > 0
      );

      // Completeness: at least one positive selection
      if (!selectedOptions.length) {
        throw safeFail("incomplete_configuration", "Please save your selections first", 400);
      }

      const snap = await deRepository.getSnapshotByPublicationId(
        session.organization_id,
        session.publication_id
      );

      const requestSnapshotJson = {
        version: 1,
        nonAcceptance: true,
        publicationId: publication.id,
        envelopeId: activeEnvelope.id,
        envelopeVersion: activeEnvelope.envelope_version,
        selectionId: selection.id,
        calculationId: calculation.id,
        selectionHash: selection.selection_hash,
        calculationInputFingerprint: calculation.calculation_input_fingerprint,
        selectedOptions: selectedOptions.filter((o) => Number(o.quantity) > 0),
        baselineDisplayTotal: totals.baselineDisplayTotal,
        configuredDisplayTotal: totals.configuredDisplayTotal,
        displayDelta: totals.displayDelta,
        pricingValidThrough: publication.pricing_valid_through,
        estimateIdentity: {
          quoteNumber: publication.quote_number,
          revisionLabel: publication.revision_label
        },
        customerFacingNote: customerNote
      };

      const created = await amendmentRepository.createReviewRequest({
        organizationId: session.organization_id,
        publicationId: publication.id,
        publicationSnapshotId: snap?.id ?? null,
        envelopeId: activeEnvelope.id,
        envelopeVersion: activeEnvelope.envelope_version,
        sessionId: session.id,
        selectionId: selection.id,
        calculationId: calculation.id,
        selectionHash: selection.selection_hash,
        calculationInputFingerprint: calculation.calculation_input_fingerprint,
        clientIdempotencyKey: idempotencyKey,
        customerNote,
        requestSnapshotJson,
        baselineDisplayTotal: requestSnapshotJson.baselineDisplayTotal,
        configuredDisplayTotal: requestSnapshotJson.configuredDisplayTotal,
        displayDelta: requestSnapshotJson.displayDelta,
        pricingValidThrough: publication.pricing_valid_through
      });

      return {
        ok: true,
        reused: created.reused,
        reviewRequest: customerSafeRequestView(created.request, {
          currentSelectionHash: selection.selection_hash
        }),
        disclaimer:
          "Your selections were sent to your estimator. This is not an order or acceptance. Pricing and availability remain subject to estimator review."
      };
    },

    async getCurrentReviewRequest({ rawSecret }) {
      if (!isDigitalEstimateReviewRequestRuntimeEnabled(env)) {
        throw unavailable();
      }
      const session = await resolveSession(rawSecret);
      assertSyntheticPublicationPublicAccess(session.publication_id, env);
      const request = await amendmentRepository.getCurrentReviewRequestForSession(
        session.organization_id,
        session.id
      );
      if (!request) {
        return { ok: true, reviewRequest: null };
      }
      const selection = await configurationRepository.getLatestSelectionForSession(
        session.organization_id,
        session.id
      );
      return {
        ok: true,
        reviewRequest: customerSafeRequestView(request, {
          currentSelectionHash: selection?.selection_hash ?? null
        })
      };
    }
  };
}
