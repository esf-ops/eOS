/**
 * Supabase-backed Studio lifecycle repository.
 * Fail-closed when lifecycle tables are missing — never falls back to memory.
 */

import { randomUUID } from "node:crypto";
import {
  STUDIO_LIFECYCLE_VERSION,
  emptySoldReviewChecklist,
  isSoldReviewChecklistComplete,
  normalizeSoldReviewChecklist
} from "./studioLifecycleTypes.mjs";

const ACCEPTANCES = "studio_estimate_acceptances";
const SOLD_REVIEWS = "studio_estimate_sold_reviews";
const SOLD_SNAPSHOTS = "studio_estimate_sold_snapshots";
const EVENTS = "studio_estimate_lifecycle_events";

function persistenceUnavailable(message, cause) {
  const err = new Error(
    message ||
      "Studio lifecycle persistence unavailable — apply eliteos_studio_estimate_lifecycle_closeout_v1.sql"
  );
  err.statusCode = 503;
  err.code = "studio_lifecycle_persistence_unavailable";
  err.cause = cause;
  return err;
}

function isUniqueViolation(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate") || msg.includes("unique");
}

function isMissingTable(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

function normOrg(organizationId) {
  return String(organizationId || "").trim().toLowerCase();
}

function safeDbCode(error) {
  return String(error?.code || error?.hint || "db_error").slice(0, 64);
}

function logLifecyclePersist(operation, detail = {}) {
  console.error(
    "[studio-lifecycle-persist]",
    JSON.stringify({
      operation,
      organizationId: detail.organizationId || null,
      estimateId: detail.estimateId || null,
      publicationId: detail.publicationId || null,
      dbCode: detail.dbCode || null,
      at: new Date().toISOString()
    })
  );
}

/**
 * @param {{
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   studioEstimateRepository?: any
 * }} opts
 */
export function createSupabaseStudioLifecycleRepository(opts) {
  if (!opts?.db) {
    throw persistenceUnavailable("Supabase client required for studio lifecycle persistence");
  }
  const db = opts.db;
  const studioEstimateRepository = opts.studioEstimateRepository || null;
  let ready = null;

  async function assertReady() {
    if (ready === true) return;
    const { error } = await db.from(ACCEPTANCES).select("id").limit(1);
    if (error) {
      if (isMissingTable(error)) {
        ready = false;
        logLifecyclePersist("assert_ready_missing_table", { dbCode: safeDbCode(error) });
        throw persistenceUnavailable(
          "Studio lifecycle tables unavailable — apply eliteos_studio_estimate_lifecycle_closeout_v1.sql",
          error
        );
      }
      logLifecyclePersist("assert_ready_failed", { dbCode: safeDbCode(error) });
      throw persistenceUnavailable("Studio lifecycle persistence check failed", error);
    }
    ready = true;
  }

  async function appendEvent(row) {
    const insert = {
      id: randomUUID(),
      organization_id: row.organization_id,
      intake_case_id: row.intake_case_id || null,
      studio_estimate_id: row.studio_estimate_id || null,
      estimate_revision: row.estimate_revision ?? null,
      publication_id: row.publication_id || null,
      acceptance_id: row.acceptance_id || null,
      sold_snapshot_id: row.sold_snapshot_id || null,
      event_type: row.event_type,
      actor_type: row.actor_type || "system",
      actor_user_id: row.actor_user_id || null,
      source_action: row.source_action || null,
      metadata: row.metadata || {},
      lifecycle_version: STUDIO_LIFECYCLE_VERSION,
      created_at: new Date().toISOString()
    };
    const { data, error } = await db.from(EVENTS).insert(insert).select("*").limit(1);
    if (error) {
      if (isMissingTable(error)) {
        ready = false;
        throw persistenceUnavailable(undefined, error);
      }
      // Events are audit — fail closed so callers do not claim success without audit
      logLifecyclePersist("append_event_failed", {
        organizationId: insert.organization_id,
        estimateId: insert.studio_estimate_id,
        publicationId: insert.publication_id,
        dbCode: safeDbCode(error)
      });
      throw persistenceUnavailable("Failed to append lifecycle event", error);
    }
    return data?.[0] || insert;
  }

  return {
    mode: "supabase",

    async getAcceptanceByPublication(organizationId, publicationId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(ACCEPTANCES)
        .select("*")
        .eq("organization_id", org)
        .eq("publication_id", String(publicationId))
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load acceptance", error);
      }
      return data?.[0] || null;
    },

    async getAcceptanceById(organizationId, acceptanceId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(ACCEPTANCES)
        .select("*")
        .eq("organization_id", org)
        .eq("id", String(acceptanceId))
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load acceptance", error);
      }
      return data?.[0] || null;
    },

    async getAcceptanceForEstimate(organizationId, estimateId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(ACCEPTANCES)
        .select("*")
        .eq("organization_id", org)
        .eq("studio_estimate_id", String(estimateId))
        .order("accepted_at", { ascending: false })
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load acceptance", error);
      }
      return data?.[0] || null;
    },

    async listAcceptancesForCase(organizationId, intakeCaseId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(ACCEPTANCES)
        .select("*")
        .eq("organization_id", org)
        .eq("intake_case_id", String(intakeCaseId))
        .order("accepted_at", { ascending: false });
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to list acceptances", error);
      }
      return data || [];
    },

    async createAcceptance(input) {
      await assertReady();
      const organizationId = normOrg(input.organizationId);
      const publicationId = String(input.publicationId || "").trim();
      if (!organizationId || !publicationId) {
        const e = new Error("organizationId and publicationId required");
        e.statusCode = 400;
        e.code = "invalid_acceptance";
        throw e;
      }

      const existing = await this.getAcceptanceByPublication(organizationId, publicationId);
      if (existing) {
        return { acceptance: existing, created: false };
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
        customer_safe_snapshot_json: input.customerSafeSnapshot || {},
        customer_display_total: input.customerDisplayTotal ?? null,
        customer_configuration_json: input.customerConfiguration || {},
        material_summary_json: input.materialSummary || [],
        terms_version: input.termsVersion || null,
        publication_snapshot_hash: input.publicationSnapshotHash || null,
        lifecycle_version: STUDIO_LIFECYCLE_VERSION,
        actor_type: "customer",
        accepted_at: now,
        created_at: now
      };

      const { data, error } = await db.from(ACCEPTANCES).insert(row).select("*").limit(1);
      if (error) {
        if (isUniqueViolation(error)) {
          const raced = await this.getAcceptanceByPublication(organizationId, publicationId);
          if (raced) return { acceptance: raced, created: false };
        }
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        logLifecyclePersist("create_acceptance_failed", {
          organizationId,
          estimateId: row.studio_estimate_id,
          publicationId,
          dbCode: safeDbCode(error)
        });
        throw persistenceUnavailable("Failed to persist acceptance", error);
      }
      const acceptance = data?.[0];
      if (!acceptance?.id) {
        throw persistenceUnavailable("Acceptance insert returned no row");
      }

      if (studioEstimateRepository?.patchLifecycle) {
        try {
          await studioEstimateRepository.patchLifecycle(
            organizationId,
            acceptance.studio_estimate_id,
            {
              lifecycleStatus: "accepted_awaiting_sold_review",
              acceptedAt: acceptance.accepted_at
            }
          );
        } catch (patchErr) {
          // Column may be absent until migration — acceptance row is source of truth
          logLifecyclePersist("patch_lifecycle_soft_fail", {
            organizationId,
            estimateId: acceptance.studio_estimate_id,
            dbCode: safeDbCode(patchErr)
          });
        }
      }

      await appendEvent({
        organization_id: organizationId,
        intake_case_id: acceptance.intake_case_id,
        studio_estimate_id: acceptance.studio_estimate_id,
        estimate_revision: acceptance.estimate_revision,
        publication_id: publicationId,
        acceptance_id: acceptance.id,
        event_type: "customer_accepted",
        actor_type: "customer",
        source_action: "customer_final_acceptance",
        metadata: { customerDisplayTotal: acceptance.customer_display_total }
      });

      return { acceptance, created: true };
    },

    async getSoldReviewForEstimate(organizationId, estimateId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(SOLD_REVIEWS)
        .select("*")
        .eq("organization_id", org)
        .eq("studio_estimate_id", String(estimateId))
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load sold review", error);
      }
      return data?.[0] || null;
    },

    async upsertSoldReview(input) {
      await assertReady();
      const organizationId = normOrg(input.organizationId);
      const estimateId = String(input.studioEstimateId || "").trim();
      const checklist = normalizeSoldReviewChecklist(input.checklist);
      const complete = isSoldReviewChecklistComplete(checklist);
      const now = new Date().toISOString();
      const existing = await this.getSoldReviewForEstimate(organizationId, estimateId);
      const row = {
        id: existing?.id || randomUUID(),
        organization_id: organizationId,
        intake_case_id: String(input.intakeCaseId || existing?.intake_case_id || ""),
        studio_estimate_id: estimateId,
        acceptance_id: String(input.acceptanceId || existing?.acceptance_id || ""),
        checklist_json: checklist,
        checklist_complete: complete,
        notes: input.notes != null ? String(input.notes) : existing?.notes || null,
        updated_by_user_id: input.updatedByUserId || null,
        created_at: existing?.created_at || now,
        updated_at: now
      };

      const { data, error } = existing
        ? await db
            .from(SOLD_REVIEWS)
            .update({
              checklist_json: row.checklist_json,
              checklist_complete: row.checklist_complete,
              notes: row.notes,
              updated_by_user_id: row.updated_by_user_id,
              updated_at: row.updated_at,
              acceptance_id: row.acceptance_id
            })
            .eq("organization_id", organizationId)
            .eq("id", existing.id)
            .select("*")
            .limit(1)
        : await db.from(SOLD_REVIEWS).insert(row).select("*").limit(1);

      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        logLifecyclePersist("upsert_sold_review_failed", {
          organizationId,
          estimateId,
          dbCode: safeDbCode(error)
        });
        throw persistenceUnavailable("Failed to persist sold review", error);
      }
      const saved = data?.[0];
      if (!saved?.id) {
        throw persistenceUnavailable("Sold review upsert returned no row");
      }

      await appendEvent({
        organization_id: organizationId,
        intake_case_id: saved.intake_case_id,
        studio_estimate_id: estimateId,
        acceptance_id: saved.acceptance_id,
        event_type: complete ? "sold_review_completed" : "sold_review_updated",
        actor_type: "staff",
        actor_user_id: input.updatedByUserId || null,
        source_action: "sold_review_upsert",
        metadata: { checklistComplete: complete }
      });
      return saved;
    },

    async getSoldSnapshotForEstimate(organizationId, estimateId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(SOLD_SNAPSHOTS)
        .select("*")
        .eq("organization_id", org)
        .eq("studio_estimate_id", String(estimateId))
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load sold snapshot", error);
      }
      return data?.[0] || null;
    },

    async getSoldSnapshotByAcceptance(organizationId, acceptanceId) {
      await assertReady();
      const org = normOrg(organizationId);
      const { data, error } = await db
        .from(SOLD_SNAPSHOTS)
        .select("*")
        .eq("organization_id", org)
        .eq("acceptance_id", String(acceptanceId))
        .limit(1);
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to load sold snapshot", error);
      }
      return data?.[0] || null;
    },

    async createSoldSnapshot(input) {
      await assertReady();
      const organizationId = normOrg(input.organizationId);
      const estimateId = String(input.studioEstimateId || "").trim();
      const acceptanceId = String(input.acceptanceId || "").trim();

      const existing = await this.getSoldSnapshotForEstimate(organizationId, estimateId);
      if (existing) return { soldSnapshot: existing, created: false };
      const byAcceptance = await this.getSoldSnapshotByAcceptance(organizationId, acceptanceId);
      if (byAcceptance) return { soldSnapshot: byAcceptance, created: false };

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
        sold_snapshot_json: input.soldSnapshot || {},
        customer_display_total: input.customerDisplayTotal ?? null,
        checklist_snapshot_json: input.checklistSnapshot || {},
        lifecycle_version: STUDIO_LIFECYCLE_VERSION,
        sold_by_user_id: input.soldByUserId || null,
        sold_at: now,
        created_at: now
      };

      const { data, error } = await db.from(SOLD_SNAPSHOTS).insert(row).select("*").limit(1);
      if (error) {
        if (isUniqueViolation(error)) {
          const raced =
            (await this.getSoldSnapshotForEstimate(organizationId, estimateId)) ||
            (await this.getSoldSnapshotByAcceptance(organizationId, acceptanceId));
          if (raced) return { soldSnapshot: raced, created: false };
        }
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        logLifecyclePersist("create_sold_snapshot_failed", {
          organizationId,
          estimateId,
          publicationId: row.publication_id,
          dbCode: safeDbCode(error)
        });
        throw persistenceUnavailable("Failed to persist sold snapshot", error);
      }
      const soldSnapshot = data?.[0];
      if (!soldSnapshot?.id) {
        throw persistenceUnavailable("Sold snapshot insert returned no row");
      }

      if (studioEstimateRepository?.patchLifecycle) {
        try {
          await studioEstimateRepository.patchLifecycle(organizationId, estimateId, {
            lifecycleStatus: "sold",
            soldAt: soldSnapshot.sold_at
          });
        } catch (patchErr) {
          logLifecyclePersist("patch_lifecycle_soft_fail", {
            organizationId,
            estimateId,
            dbCode: safeDbCode(patchErr)
          });
        }
      }

      await appendEvent({
        organization_id: organizationId,
        intake_case_id: soldSnapshot.intake_case_id,
        studio_estimate_id: estimateId,
        estimate_revision: soldSnapshot.estimate_revision,
        publication_id: soldSnapshot.publication_id,
        acceptance_id: acceptanceId,
        sold_snapshot_id: soldSnapshot.id,
        event_type: "marked_sold",
        actor_type: "staff",
        actor_user_id: input.soldByUserId || null,
        source_action: "mark_sold",
        metadata: { customerDisplayTotal: soldSnapshot.customer_display_total }
      });

      return { soldSnapshot, created: true };
    },

    async listLifecycleEvents(organizationId, { estimateId = null, intakeCaseId = null } = {}) {
      await assertReady();
      const org = normOrg(organizationId);
      let qb = db
        .from(EVENTS)
        .select("*")
        .eq("organization_id", org)
        .order("created_at", { ascending: false })
        .limit(200);
      if (estimateId) qb = qb.eq("studio_estimate_id", String(estimateId));
      if (intakeCaseId) qb = qb.eq("intake_case_id", String(intakeCaseId));
      const { data, error } = await qb;
      if (error) {
        if (isMissingTable(error)) {
          ready = false;
          throw persistenceUnavailable(undefined, error);
        }
        throw persistenceUnavailable("Failed to list lifecycle events", error);
      }
      return data || [];
    },

    async appendLifecycleEvent(row) {
      await assertReady();
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
      // Prefer estimate row columns when present; acceptance/sold tables are authority.
      const [acceptance, sold] = await Promise.all([
        this.getAcceptanceForEstimate(organizationId, estimateId),
        this.getSoldSnapshotForEstimate(organizationId, estimateId)
      ]);
      if (!acceptance && !sold) return null;
      return {
        lifecycle_status: sold
          ? "sold"
          : acceptance
            ? "accepted_awaiting_sold_review"
            : null,
        accepted_at: acceptance?.accepted_at || null,
        sold_at: sold?.sold_at || null,
        archived_at: null
      };
    },

    emptySoldReviewChecklist
  };
}

export { persistenceUnavailable as studioLifecyclePersistenceUnavailable };
