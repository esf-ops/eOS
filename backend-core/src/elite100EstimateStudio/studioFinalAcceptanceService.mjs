/**
 * Customer Final Acceptance — distinct from Review Request and Mark Sold.
 * Bound to active publication + public session. Creates immutable acceptance.
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
    "payment"
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw safeFail("forbidden_caller_authority", "Please refresh and try again", 400);
    }
  }
}

function customerSafeAcceptanceView(acceptance) {
  const snap = acceptance.customer_safe_snapshot_json || {};
  assertNoInternalEconomicsLeak(snap);
  return {
    acceptanceId: acceptance.id,
    status: "accepted",
    statusLabel: "Accepted",
    acceptedAt: acceptance.accepted_at,
    estimateRevision: acceptance.estimate_revision,
    publicationId: acceptance.publication_id,
    customerDisplayTotal: acceptance.customer_display_total,
    termsVersion: acceptance.terms_version,
    configuration: acceptance.customer_configuration_json || null,
    materialSummary: acceptance.material_summary_json || [],
    customerVisibleLines: snap.customerVisibleLines || [],
    totals: snap.totals || { customerDisplayTotal: acceptance.customer_display_total },
    lifecycleVersion: acceptance.lifecycle_version || STUDIO_LIFECYCLE_VERSION,
    notice:
      "You have accepted this estimate. Selections are locked. Contact your estimator for any changes.",
    emailSent: false,
    markedSold: false
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   lifecycleRepository: import('./studioLifecycleRepository.mjs').createInMemoryStudioLifecycleRepository extends Function ? any : any,
 *   deRepository?: any,
 *   configurationRepository?: any,
 *   studioEstimateRepository?: any,
 *   listOpenReviewRequests?: (orgId: string, publicationId: string) => Promise<object[]>,
 * }} deps
 */
export function createStudioFinalAcceptanceService(deps) {
  const env = deps.env || process.env;
  const {
    lifecycleRepository,
    deRepository,
    configurationRepository,
    studioEstimateRepository
  } = deps;

  if (!lifecycleRepository) {
    throw new Error("lifecycleRepository required");
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
        "A newer estimate is available. Please use the latest link."
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
          "A newer estimate is available. Please use the latest link."
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
          "A newer estimate is available. Please use the latest link."
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
          publicationChanged: false
        }
      };
    }

    const calc = estimate.calculationSnapshot || estimate.calculation || null;
    const scope = estimate.scope || {};
    const customerSafeSnapshot = buildCustomerSafeAcceptanceSnapshot({
      calc,
      scope,
      configuration,
      publication,
      estimate
    });
    assertNoInternalEconomicsLeak(customerSafeSnapshot);

    const customerDisplayTotal =
      customerSafeSnapshot.totals?.customerDisplayTotal ??
      calc?.totals?.customerDisplayTotal ??
      null;

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
        publicationChanged: false
      }
    };
  }

  return {
    rejectFinalAcceptanceAuthority,

    customerSafeAcceptanceView,

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
      if (configurationRepository?.getLatestSelectionForSession) {
        const selection = await configurationRepository.getLatestSelectionForSession(
          session.organization_id,
          session.id
        );
        if (selection) {
          configuration =
            selection.selection_payload_json || selection.selections || selection.customer_configuration_json || {};
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
        confirm
      });
    },

    /** Test / staff-assisted harness entry (still requires confirm). */
    acceptResolvedContext
  };
}
