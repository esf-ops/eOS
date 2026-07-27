/**
 * In-memory Studio lifecycle repository (acceptance / sold review / sold / events).
 * Production path: Supabase tables from eliteos_studio_estimate_lifecycle_closeout_v1.sql
 */

import { randomUUID } from "node:crypto";
import {
  STUDIO_LIFECYCLE_VERSION,
  emptySoldReviewChecklist,
  isSoldReviewChecklistComplete,
  normalizeSoldReviewChecklist
} from "./studioLifecycleTypes.mjs";

function createAsyncMutex() {
  let chain = Promise.resolve();
  return {
    runExclusive(fn) {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}

function err(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function normOrg(organizationId) {
  return String(organizationId || "").trim().toLowerCase();
}

/**
 * @param {{ studioEstimateRepository?: any }} [opts]
 */
export function createInMemoryStudioLifecycleRepository(opts = {}) {
  /** @type {Map<string, object>} */
  const acceptances = new Map();
  /** @type {Map<string, object>} */
  const soldReviews = new Map();
  /** @type {Map<string, object>} */
  const soldSnapshots = new Map();
  /** @type {Array<object>} */
  const events = [];
  /** @type {Map<string, object>} org|estimateId → lifecycle columns */
  const estimateLifecycle = new Map();
  const locks = new Map();
  const studioEstimateRepository = opts.studioEstimateRepository || null;

  function lockFor(key) {
    if (!locks.has(key)) locks.set(key, createAsyncMutex());
    return locks.get(key);
  }

  function lifecycleKey(organizationId, estimateId) {
    return `${normOrg(organizationId)}|${String(estimateId)}`;
  }

  function pubKey(organizationId, publicationId) {
    return `${normOrg(organizationId)}|pub:${String(publicationId)}`;
  }

  async function appendEvent(row) {
    const full = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      lifecycle_version: STUDIO_LIFECYCLE_VERSION,
      metadata: {},
      ...row
    };
    events.push(full);
    return structuredClone(full);
  }

  /** Generic rejection — do not reveal whether the foreign record exists. */
  function crossOrgReject() {
    throw err("not_found", "Not found", 404);
  }

  function assertAcceptanceOrg(organizationId, acceptanceId) {
    if (!acceptanceId) return null;
    for (const row of acceptances.values()) {
      if (row.id === String(acceptanceId)) {
        if (row.organization_id !== normOrg(organizationId)) crossOrgReject();
        return row;
      }
    }
    crossOrgReject();
  }

  function assertSoldReviewUnlocked(organizationId, estimateId, reviewId = null) {
    const org = normOrg(organizationId);
    for (const snap of soldSnapshots.values()) {
      if (
        (reviewId && snap.sold_review_id === String(reviewId)) ||
        (snap.organization_id === org && snap.studio_estimate_id === String(estimateId))
      ) {
        throw err(
          "sold_review_locked",
          "Sold review is locked after Mark Sold",
          409
        );
      }
    }
  }

  return {
    mode: "memory",

    async getAcceptanceByPublication(organizationId, publicationId) {
      const row = acceptances.get(pubKey(organizationId, publicationId));
      return row ? structuredClone(row) : null;
    },

    async getAcceptanceById(organizationId, acceptanceId) {
      for (const row of acceptances.values()) {
        if (
          row.organization_id === normOrg(organizationId) &&
          row.id === String(acceptanceId)
        ) {
          return structuredClone(row);
        }
      }
      return null;
    },

    async getAcceptanceForEstimate(organizationId, estimateId) {
      for (const row of acceptances.values()) {
        if (
          row.organization_id === normOrg(organizationId) &&
          row.studio_estimate_id === String(estimateId)
        ) {
          return structuredClone(row);
        }
      }
      return null;
    },

    async listAcceptancesForCase(organizationId, intakeCaseId) {
      return [...acceptances.values()]
        .filter(
          (r) =>
            r.organization_id === normOrg(organizationId) &&
            r.intake_case_id === String(intakeCaseId)
        )
        .sort((a, b) => String(b.accepted_at).localeCompare(String(a.accepted_at)))
        .map((r) => structuredClone(r));
    },

    /**
     * Idempotent create — unique on (org, publication_id).
     */
    async createAcceptance(input) {
      const organizationId = normOrg(input.organizationId);
      const publicationId = String(input.publicationId || "").trim();
      if (!organizationId || !publicationId) {
        throw err("invalid_acceptance", "organizationId and publicationId required");
      }
      // Optional cross-org guards when callers supply authoritative linked orgs
      // (mirrors DB org-match triggers). Generic 404 — no existence leak.
      if (
        input.estimateOrganizationId != null &&
        normOrg(input.estimateOrganizationId) !== organizationId
      ) {
        crossOrgReject();
      }
      if (
        input.publicationOrganizationId != null &&
        normOrg(input.publicationOrganizationId) !== organizationId
      ) {
        crossOrgReject();
      }
      if (studioEstimateRepository?.getById && input.studioEstimateId) {
        const estimate = await studioEstimateRepository.getById(
          organizationId,
          input.studioEstimateId
        );
        if (!estimate) crossOrgReject();
      }
      return lockFor(pubKey(organizationId, publicationId)).runExclusive(async () => {
        const existing = acceptances.get(pubKey(organizationId, publicationId));
        if (existing) {
          return { acceptance: structuredClone(existing), created: false };
        }
        const now = new Date().toISOString();
        const row = {
          id: input.id || randomUUID(),
          organization_id: organizationId,
          intake_case_id: String(input.intakeCaseId || ""),
          studio_estimate_id: String(input.studioEstimateId || ""),
          estimate_revision: Number(input.estimateRevision) || 1,
          publication_id: publicationId,
          publication_snapshot_id: input.publicationSnapshotId || null,
          configuration_session_id: input.configurationSessionId || null,
          session_secret_hash: input.sessionSecretHash || null,
          customer_safe_snapshot_json: structuredClone(
            input.customerSafeSnapshot || {}
          ),
          customer_display_total: input.customerDisplayTotal ?? null,
          customer_configuration_json: structuredClone(
            input.customerConfiguration || {}
          ),
          material_summary_json: structuredClone(input.materialSummary || []),
          terms_version: input.termsVersion || null,
          publication_snapshot_hash: input.publicationSnapshotHash || null,
          lifecycle_version: STUDIO_LIFECYCLE_VERSION,
          actor_type: "customer",
          accepted_at: now,
          created_at: now
        };
        acceptances.set(pubKey(organizationId, publicationId), row);
        estimateLifecycle.set(
          lifecycleKey(organizationId, row.studio_estimate_id),
          {
            lifecycle_status: "accepted_awaiting_sold_review",
            accepted_at: now,
            sold_at: null,
            archived_at: null
          }
        );
        if (studioEstimateRepository?.patchLifecycle) {
          await studioEstimateRepository.patchLifecycle(
            organizationId,
            row.studio_estimate_id,
            {
              lifecycleStatus: "accepted_awaiting_sold_review",
              acceptedAt: now
            }
          );
        }
        await appendEvent({
          organization_id: organizationId,
          intake_case_id: row.intake_case_id,
          studio_estimate_id: row.studio_estimate_id,
          estimate_revision: row.estimate_revision,
          publication_id: publicationId,
          acceptance_id: row.id,
          event_type: "customer_accepted",
          actor_type: "customer",
          source_action: "customer_final_acceptance",
          metadata: {
            customerDisplayTotal: row.customer_display_total
          }
        });
        return { acceptance: structuredClone(row), created: true };
      });
    },

    async getSoldReviewForEstimate(organizationId, estimateId) {
      const key = `${normOrg(organizationId)}|sr:${String(estimateId)}`;
      const row = soldReviews.get(key);
      return row ? structuredClone(row) : null;
    },

    async upsertSoldReview(input) {
      const organizationId = normOrg(input.organizationId);
      const estimateId = String(input.studioEstimateId || "").trim();
      const key = `${organizationId}|sr:${estimateId}`;
      return lockFor(key).runExclusive(async () => {
        const existing = soldReviews.get(key);
        assertSoldReviewUnlocked(organizationId, estimateId, existing?.id || null);
        const acceptanceId = String(input.acceptanceId || existing?.acceptance_id || "");
        if (acceptanceId) assertAcceptanceOrg(organizationId, acceptanceId);
        if (
          input.acceptanceOrganizationId != null &&
          normOrg(input.acceptanceOrganizationId) !== organizationId
        ) {
          crossOrgReject();
        }
        const checklist = normalizeSoldReviewChecklist(input.checklist);
        const complete = isSoldReviewChecklistComplete(checklist);
        const now = new Date().toISOString();
        const row = {
          id: existing?.id || randomUUID(),
          organization_id: organizationId,
          intake_case_id: String(input.intakeCaseId || existing?.intake_case_id || ""),
          studio_estimate_id: estimateId,
          acceptance_id: acceptanceId,
          checklist_json: checklist,
          checklist_complete: complete,
          notes: input.notes != null ? String(input.notes) : existing?.notes || null,
          updated_by_user_id: input.updatedByUserId || null,
          created_at: existing?.created_at || now,
          updated_at: now
        };
        soldReviews.set(key, row);
        await appendEvent({
          organization_id: organizationId,
          intake_case_id: row.intake_case_id,
          studio_estimate_id: estimateId,
          acceptance_id: row.acceptance_id,
          event_type: complete ? "sold_review_completed" : "sold_review_updated",
          actor_type: "staff",
          actor_user_id: input.updatedByUserId || null,
          source_action: "sold_review_upsert",
          metadata: { checklistComplete: complete }
        });
        return structuredClone(row);
      });
    },

    /**
     * Direct delete — blocked after Mark Sold (mirrors DB trigger).
     */
    async deleteSoldReview(organizationId, estimateId) {
      const org = normOrg(organizationId);
      const id = String(estimateId || "").trim();
      const key = `${org}|sr:${id}`;
      return lockFor(key).runExclusive(async () => {
        const existing = soldReviews.get(key);
        if (!existing) return { deleted: false };
        assertSoldReviewUnlocked(org, id, existing.id);
        soldReviews.delete(key);
        return { deleted: true };
      });
    },

    async getSoldSnapshotForEstimate(organizationId, estimateId) {
      const key = `${normOrg(organizationId)}|sold:${String(estimateId)}`;
      const row = soldSnapshots.get(key);
      return row ? structuredClone(row) : null;
    },

    async getSoldSnapshotByAcceptance(organizationId, acceptanceId) {
      for (const row of soldSnapshots.values()) {
        if (
          row.organization_id === normOrg(organizationId) &&
          row.acceptance_id === String(acceptanceId)
        ) {
          return structuredClone(row);
        }
      }
      return null;
    },

    /**
     * Idempotent Mark Sold — unique on estimate and acceptance.
     */
    async createSoldSnapshot(input) {
      const organizationId = normOrg(input.organizationId);
      const estimateId = String(input.studioEstimateId || "").trim();
      const acceptanceId = String(input.acceptanceId || "").trim();
      const key = `${organizationId}|sold:${estimateId}`;
      return lockFor(key).runExclusive(async () => {
        const existing = soldSnapshots.get(key);
        if (existing) {
          return { soldSnapshot: structuredClone(existing), created: false };
        }
        const byAcceptance = await this.getSoldSnapshotByAcceptance(
          organizationId,
          acceptanceId
        );
        if (byAcceptance) {
          return { soldSnapshot: byAcceptance, created: false };
        }
        if (acceptanceId) assertAcceptanceOrg(organizationId, acceptanceId);
        if (
          input.acceptanceOrganizationId != null &&
          normOrg(input.acceptanceOrganizationId) !== organizationId
        ) {
          crossOrgReject();
        }
        if (
          input.estimateOrganizationId != null &&
          normOrg(input.estimateOrganizationId) !== organizationId
        ) {
          crossOrgReject();
        }
        if (
          input.soldReviewOrganizationId != null &&
          normOrg(input.soldReviewOrganizationId) !== organizationId
        ) {
          crossOrgReject();
        }
        const now = new Date().toISOString();
        const row = {
          id: input.id || randomUUID(),
          organization_id: organizationId,
          intake_case_id: String(input.intakeCaseId || ""),
          studio_estimate_id: estimateId,
          estimate_revision: Number(input.estimateRevision) || 1,
          acceptance_id: acceptanceId,
          sold_review_id: input.soldReviewId || null,
          publication_id: input.publicationId || null,
          sold_snapshot_json: structuredClone(input.soldSnapshot || {}),
          customer_display_total: input.customerDisplayTotal ?? null,
          checklist_snapshot_json: structuredClone(input.checklistSnapshot || {}),
          lifecycle_version: STUDIO_LIFECYCLE_VERSION,
          sold_by_user_id: input.soldByUserId || null,
          sold_at: now,
          created_at: now
        };
        soldSnapshots.set(key, row);
        estimateLifecycle.set(lifecycleKey(organizationId, estimateId), {
          lifecycle_status: "sold",
          accepted_at:
            estimateLifecycle.get(lifecycleKey(organizationId, estimateId))
              ?.accepted_at || now,
          sold_at: now,
          archived_at: null
        });
        if (studioEstimateRepository?.patchLifecycle) {
          await studioEstimateRepository.patchLifecycle(organizationId, estimateId, {
            lifecycleStatus: "sold",
            soldAt: now
          });
        }
        await appendEvent({
          organization_id: organizationId,
          intake_case_id: row.intake_case_id,
          studio_estimate_id: estimateId,
          estimate_revision: row.estimate_revision,
          publication_id: row.publication_id,
          acceptance_id: acceptanceId,
          sold_snapshot_id: row.id,
          event_type: "marked_sold",
          actor_type: "staff",
          actor_user_id: input.soldByUserId || null,
          source_action: "mark_sold",
          metadata: { customerDisplayTotal: row.customer_display_total }
        });
        return { soldSnapshot: structuredClone(row), created: true };
      });
    },

    async listLifecycleEvents(organizationId, { estimateId = null, intakeCaseId = null } = {}) {
      const org = normOrg(organizationId);
      return events
        .filter((e) => {
          if (e.organization_id !== org) return false;
          if (estimateId && e.studio_estimate_id !== String(estimateId)) return false;
          if (intakeCaseId && e.intake_case_id !== String(intakeCaseId)) return false;
          return true;
        })
        .map((e) => structuredClone(e));
    },

    async appendLifecycleEvent(row) {
      return appendEvent({
        organization_id: normOrg(row.organizationId),
        intake_case_id: row.intakeCaseId || null,
        studio_estimate_id: row.studioEstimateId || null,
        estimate_revision: row.estimateRevision ?? null,
        publication_id: row.publicationId || null,
        acceptance_id: row.acceptanceId || null,
        sold_snapshot_id: row.soldSnapshotId || null,
        event_type: row.eventType,
        actor_type: row.actorType || "system",
        actor_user_id: row.actorUserId || null,
        source_action: row.sourceAction || null,
        metadata: row.metadata || {}
      });
    },

    async getEstimateLifecycle(organizationId, estimateId) {
      return (
        structuredClone(
          estimateLifecycle.get(lifecycleKey(organizationId, estimateId))
        ) || null
      );
    },

    /** Test helper */
    _dump() {
      return {
        acceptances: [...acceptances.entries()],
        soldReviews: [...soldReviews.entries()],
        soldSnapshots: [...soldSnapshots.entries()],
        events: structuredClone(events),
        estimateLifecycle: [...estimateLifecycle.entries()]
      };
    },

    emptySoldReviewChecklist
  };
}
