/**
 * Staff Sold Review + explicit Mark Sold.
 * Distinct from customer Final Acceptance. No email / QB / Moraware / publish.
 */

import {
  assertNoInternalEconomicsLeak,
  emptySoldReviewChecklist,
  isSoldReviewChecklistComplete,
  normalizeSoldReviewChecklist,
  SOLD_REVIEW_CHECKLIST_KEYS,
  SOLD_REVIEW_CHECKLIST_LABELS,
  STUDIO_LIFECYCLE_VERSION,
  STUDIO_LIFECYCLE_STATUSES
} from "./studioLifecycleTypes.mjs";

function fail(code, message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) e[k] = v;
  }
  return e;
}

/**
 * Privileged Mark Sold — admin / super_admin or env allowlist emails.
 * Studio pilot alone is insufficient.
 */
export function canMarkStudioEstimateSold(user, env = process.env) {
  const role = String(user?.role || "").toLowerCase();
  if (role === "admin" || role === "super_admin") return true;
  const allow = String(env.ELITE100_STUDIO_MARK_SOLD_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = String(user?.email || "").trim().toLowerCase();
  if (email && allow.includes(email)) return true;
  const id = String(user?.id || "").trim().toLowerCase();
  if (id && allow.includes(id)) return true;
  return false;
}

function staffSafeAcceptanceSummary(acceptance) {
  if (!acceptance) return null;
  return {
    acceptanceId: acceptance.id,
    acceptedAt: acceptance.accepted_at,
    estimateRevision: acceptance.estimate_revision,
    publicationId: acceptance.publication_id,
    customerDisplayTotal: acceptance.customer_display_total,
    termsVersion: acceptance.terms_version,
    materialSummary: acceptance.material_summary_json || [],
    configuration: acceptance.customer_configuration_json || null,
    customerSafeSnapshot: acceptance.customer_safe_snapshot_json || null
  };
}

/**
 * @param {{
 *   lifecycleRepository: any,
 *   studioEstimateRepository?: any,
 *   listOpenReviewRequests?: (orgId: string, estimateId: string) => Promise<object[]>,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createStudioSoldReviewService(deps) {
  const { lifecycleRepository, studioEstimateRepository } = deps;
  const env = deps.env || process.env;
  const listOpenReviewRequests = deps.listOpenReviewRequests || (async () => []);

  if (!lifecycleRepository) throw new Error("lifecycleRepository required");

  async function loadEstimate(organizationId, estimateId) {
    if (!studioEstimateRepository?.getById) {
      throw fail("estimate_unavailable", "Estimate repository unavailable", 503);
    }
    const estimate = await studioEstimateRepository.getById(organizationId, estimateId);
    if (!estimate) throw fail("estimate_not_found", "Estimate not found", 404);
    return estimate;
  }

  async function requireActiveAcceptance(organizationId, estimateId) {
    const acceptance = await lifecycleRepository.getAcceptanceForEstimate(
      organizationId,
      estimateId
    );
    if (!acceptance) {
      throw fail(
        "acceptance_required",
        "Customer Final Acceptance is required before sold review",
        409
      );
    }
    return acceptance;
  }

  return {
    checklistKeys: SOLD_REVIEW_CHECKLIST_KEYS,
    checklistLabels: SOLD_REVIEW_CHECKLIST_LABELS,
    emptyChecklist: emptySoldReviewChecklist,
    canMarkSold: (user) => canMarkStudioEstimateSold(user, env),

    async getSoldReviewWorkspace(organizationId, estimateId) {
      const estimate = await loadEstimate(organizationId, estimateId);
      const acceptance = await lifecycleRepository.getAcceptanceForEstimate(
        organizationId,
        estimateId
      );
      const soldReview = await lifecycleRepository.getSoldReviewForEstimate(
        organizationId,
        estimateId
      );
      const soldSnapshot = await lifecycleRepository.getSoldSnapshotForEstimate(
        organizationId,
        estimateId
      );
      const events = await lifecycleRepository.listLifecycleEvents(organizationId, {
        estimateId
      });
      const openReviews = await listOpenReviewRequests(organizationId, estimateId);
      const calc = estimate.calculationSnapshot || {};
      const scope = estimate.scope || {};

      // Staff-only internal summary (never returned on public routes)
      const customLines = Array.isArray(calc?.fabrication?.customLineItems)
        ? calc.fabrication.customLineItems
        : Array.isArray(scope.customLineItems)
          ? scope.customLineItems
          : [];
      const internalSummary = {
        internalOnlyCount: customLines.filter((l) => l?.commercialRole === "internal_only")
          .length,
        absorbedCount: customLines.filter((l) => l?.commercialRole === "absorbed").length,
        exactInternalTotal: calc?.totals?.exactInternalTotal ?? null
      };

      return {
        ok: true,
        estimate: {
          id: estimate.id,
          intakeCaseId: estimate.intakeCaseId,
          revision: estimate.revision,
          status: estimate.status,
          customerName: scope.customerName || null,
          projectName: scope.projectName || null,
          accountDirectoryAccountId: estimate.accountDirectoryAccountId || null,
          customerDisplayTotal: calc?.totals?.customerDisplayTotal ?? null,
          lifecycleStatus: soldSnapshot
            ? STUDIO_LIFECYCLE_STATUSES.SOLD
            : acceptance
              ? STUDIO_LIFECYCLE_STATUSES.ACCEPTED_AWAITING_SOLD_REVIEW
              : null
        },
        acceptance: staffSafeAcceptanceSummary(acceptance),
        soldReview: soldReview
          ? {
              id: soldReview.id,
              checklist: normalizeSoldReviewChecklist(soldReview.checklist_json),
              checklistComplete: Boolean(soldReview.checklist_complete),
              notes: soldReview.notes,
              updatedAt: soldReview.updated_at,
              updatedByUserId: soldReview.updated_by_user_id
            }
          : {
              id: null,
              checklist: emptySoldReviewChecklist(),
              checklistComplete: false,
              notes: null,
              updatedAt: null,
              updatedByUserId: null
            },
        soldSnapshot: soldSnapshot
          ? {
              id: soldSnapshot.id,
              soldAt: soldSnapshot.sold_at,
              soldByUserId: soldSnapshot.sold_by_user_id,
              customerDisplayTotal: soldSnapshot.customer_display_total,
              estimateRevision: soldSnapshot.estimate_revision,
              acceptanceId: soldSnapshot.acceptance_id,
              publicationId: soldSnapshot.publication_id
            }
          : null,
        internalSummary,
        openReviewRequestCount: Array.isArray(openReviews) ? openReviews.length : 0,
        checklistLabels: SOLD_REVIEW_CHECKLIST_LABELS,
        lifecycleEvents: events.map((e) => ({
          id: e.id,
          eventType: e.event_type,
          at: e.created_at,
          actorType: e.actor_type,
          sourceAction: e.source_action
        })),
        lifecycleVersion: STUDIO_LIFECYCLE_VERSION
      };
    },

    async upsertSoldReviewChecklist({
      organizationId,
      estimateId,
      checklist,
      notes = null,
      updatedByUserId = null
    }) {
      const estimate = await loadEstimate(organizationId, estimateId);
      const acceptance = await requireActiveAcceptance(organizationId, estimateId);
      const sold = await lifecycleRepository.getSoldSnapshotForEstimate(
        organizationId,
        estimateId
      );
      if (sold) {
        throw fail("already_sold", "Estimate is already marked sold", 409);
      }

      const row = await lifecycleRepository.upsertSoldReview({
        organizationId,
        intakeCaseId: estimate.intakeCaseId,
        studioEstimateId: estimateId,
        acceptanceId: acceptance.id,
        checklist,
        notes,
        updatedByUserId
      });

      return {
        ok: true,
        soldReview: {
          id: row.id,
          checklist: normalizeSoldReviewChecklist(row.checklist_json),
          checklistComplete: Boolean(row.checklist_complete),
          notes: row.notes,
          updatedAt: row.updated_at
        }
      };
    },

    /**
     * Explicit Mark Sold. Idempotent. Privileged.
     */
    async markSold({
      organizationId,
      estimateId,
      actorUser,
      acceptanceId = null
    }) {
      if (!canMarkStudioEstimateSold(actorUser, env)) {
        throw fail("forbidden_mark_sold", "Mark Sold requires a privileged role", 403);
      }

      const estimate = await loadEstimate(organizationId, estimateId);
      const acceptance = await requireActiveAcceptance(organizationId, estimateId);

      if (acceptanceId && String(acceptanceId) !== String(acceptance.id)) {
        throw fail("stale_acceptance", "Acceptance is no longer current for this estimate", 409);
      }

      // Active revision must match acceptance revision
      if (studioEstimateRepository?.getActiveByIntakeCase) {
        const active = await studioEstimateRepository.getActiveByIntakeCase(
          organizationId,
          estimate.intakeCaseId
        );
        if (active && String(active.id) !== String(estimate.id)) {
          throw fail(
            "stale_revision",
            "A newer estimate revision exists — cannot mark this acceptance sold",
            409
          );
        }
        if (
          active &&
          Number(active.revision) !== Number(acceptance.estimate_revision)
        ) {
          throw fail(
            "stale_acceptance",
            "Acceptance belongs to a superseded revision",
            409
          );
        }
      }

      const existingSold = await lifecycleRepository.getSoldSnapshotForEstimate(
        organizationId,
        estimateId
      );
      if (existingSold) {
        return {
          ok: true,
          reused: true,
          created: false,
          soldSnapshot: {
            id: existingSold.id,
            soldAt: existingSold.sold_at,
            estimateId: existingSold.studio_estimate_id,
            acceptanceId: existingSold.acceptance_id,
            customerDisplayTotal: existingSold.customer_display_total,
            lifecycleVersion: existingSold.lifecycle_version
          },
          sideEffects: {
            emailSent: false,
            publicationChanged: false,
            quickbooksWritten: false,
            morawareWritten: false
          }
        };
      }

      const soldReview = await lifecycleRepository.getSoldReviewForEstimate(
        organizationId,
        estimateId
      );
      const checklist = normalizeSoldReviewChecklist(soldReview?.checklist_json);
      if (!isSoldReviewChecklistComplete(checklist)) {
        throw fail(
          "sold_review_incomplete",
          "Complete the sold-review checklist before Mark Sold",
          409,
          { checklist }
        );
      }

      const openReviews = await listOpenReviewRequests(organizationId, estimateId);
      if (Array.isArray(openReviews) && openReviews.length > 0) {
        throw fail(
          "unresolved_review_request",
          "Resolve open Review Requests before Mark Sold",
          409
        );
      }

      const calc = estimate.calculationSnapshot || {};
      const scope = estimate.scope || {};
      const soldSnapshotPayload = {
        lifecycleVersion: STUDIO_LIFECYCLE_VERSION,
        estimateId: estimate.id,
        intakeCaseId: estimate.intakeCaseId,
        estimateRevision: Number(estimate.revision) || 1,
        acceptanceId: acceptance.id,
        publicationId: acceptance.publication_id,
        accountDirectoryAccountId: estimate.accountDirectoryAccountId || null,
        customerIdentitySnapshot: estimate.customerIdentitySnapshot || null,
        scope: {
          customerName: scope.customerName || null,
          projectName: scope.projectName || null,
          materialGroup: scope.materialGroup || null,
          rooms: Array.isArray(scope.rooms) ? scope.rooms : []
        },
        commercialLines: Array.isArray(calc?.fabrication?.customLineItems)
          ? calc.fabrication.customLineItems
          : Array.isArray(scope.customLineItems)
            ? scope.customLineItems
            : [],
        totals: calc?.totals || {},
        pricingVersion: calc?.pricingVersion ?? estimate.pricingVersion ?? null,
        termsVersion: acceptance.terms_version,
        acceptedCustomerSafeSnapshot: acceptance.customer_safe_snapshot_json,
        checklist
      };

      // Sold snapshot may retain internal economics for authorized staff — do not assert public leak here.
      const { soldSnapshot, created } = await lifecycleRepository.createSoldSnapshot({
        organizationId,
        intakeCaseId: estimate.intakeCaseId,
        studioEstimateId: estimate.id,
        estimateRevision: Number(estimate.revision) || 1,
        acceptanceId: acceptance.id,
        soldReviewId: soldReview?.id || null,
        publicationId: acceptance.publication_id,
        soldSnapshot: soldSnapshotPayload,
        customerDisplayTotal: acceptance.customer_display_total,
        checklistSnapshot: checklist,
        soldByUserId: actorUser?.id || null
      });

      if (!soldSnapshot?.id) {
        throw fail("sold_persist_failed", "Unable to record sold snapshot", 500);
      }

      return {
        ok: true,
        reused: !created,
        created,
        soldSnapshot: {
          id: soldSnapshot.id,
          soldAt: soldSnapshot.sold_at,
          estimateId: soldSnapshot.studio_estimate_id,
          acceptanceId: soldSnapshot.acceptance_id,
          customerDisplayTotal: soldSnapshot.customer_display_total,
          lifecycleVersion: soldSnapshot.lifecycle_version
        },
        sideEffects: {
          emailSent: false,
          publicationChanged: false,
          quickbooksWritten: false,
          morawareWritten: false
        }
      };
    }
  };
}

/** Pure helper for tests — ensure public views never receive sold-review internals. */
export function assertPublicPayloadOmitsSoldReview(payload) {
  assertNoInternalEconomicsLeak(payload);
  const json = JSON.stringify(payload);
  if (json.includes("soldReview") || json.includes("checklistComplete")) {
    const err = new Error("Sold review leaked into public payload");
    err.code = "internal_data_leak";
    throw err;
  }
}
