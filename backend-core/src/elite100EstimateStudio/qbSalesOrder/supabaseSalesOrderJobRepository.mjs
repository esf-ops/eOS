/**
 * Supabase-backed persistence for the Studio QuickBooks sales order queue
 * (`studio_qb_sales_order_jobs`). Same contract as
 * createInMemorySalesOrderJobRepository. Fail-closed when the table is missing.
 *
 * Duplicate prevention is enforced by the database: UNIQUE (organization_id,
 * idempotency_key) on insert and compare-and-set on row_version for every update,
 * so concurrent workers or restarted processes cannot both claim a job.
 */

import { STUDIO_SALES_ORDER_PLAN_VERSION } from "./studioSalesOrderPlan.mjs";

const TABLE = "studio_qb_sales_order_jobs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIMABLE = ["queued", "retry_wait", "outcome_unknown"];

function unavailable(message, cause) {
  const e = new Error(message || "Sales order queue persistence unavailable — apply eliteos_studio_qb_sales_order_jobs_v1.sql");
  e.statusCode = 503;
  e.code = "sales_order_persistence_unavailable";
  e.cause = cause;
  return e;
}

function isMissingTable(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("could not find the table");
}

function isUniqueViolation(error) {
  return String(error?.code ?? "") === "23505";
}

function raise(error, what) {
  if (isMissingTable(error)) throw unavailable(undefined, error);
  const e = new Error(`Sales order queue ${what} failed: ${error?.message || error}`);
  e.statusCode = 500;
  e.code = "sales_order_persistence_error";
  e.cause = error;
  throw e;
}

/** @param {Record<string, any>} r */
export function rowToSalesOrderJob(r) {
  if (!r) return null;
  return {
    id: r.id,
    organizationId: r.organization_id,
    studioEstimateId: r.studio_estimate_id,
    soldSnapshotId: r.sold_snapshot_id,
    acceptanceId: r.acceptance_id,
    publicationId: r.publication_id,
    quoteNumber: r.quote_number,
    idempotencyKey: r.idempotency_key,
    companyIdentity: r.company_identity,
    status: r.status,
    plan: r.plan_json,
    attempts: r.attempts,
    leaseUntil: r.lease_until,
    nextAttemptAt: r.next_attempt_at,
    possiblyInQuickBooks: r.possibly_in_quickbooks === true,
    customerJob: r.customer_job_json || null,
    attempt: r.attempt_json || null,
    lastError: r.last_error_json,
    qbTxnId: r.qb_txn_id,
    qbRefNumber: r.qb_ref_number,
    reconciliation: r.reconciliation_json,
    events: Array.isArray(r.events_json) ? r.events_json : [],
    rowVersion: r.row_version,
    createdByUserId: r.created_by_user_id,
    submittedAt: r.submitted_at,
    syncedAt: r.synced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

const FIELD_TO_COLUMN = {
  status: "status",
  plan: "plan_json",
  attempts: "attempts",
  leaseUntil: "lease_until",
  nextAttemptAt: "next_attempt_at",
  possiblyInQuickBooks: "possibly_in_quickbooks",
  customerJob: "customer_job_json",
  attempt: "attempt_json",
  lastError: "last_error_json",
  qbTxnId: "qb_txn_id",
  qbRefNumber: "qb_ref_number",
  reconciliation: "reconciliation_json",
  events: "events_json",
  submittedAt: "submitted_at",
  syncedAt: "synced_at",
  updatedAt: "updated_at"
};

function patchToColumns(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = FIELD_TO_COLUMN[k];
    if (!col) {
      const e = new Error(`Sales order job field "${k}" is not updatable`);
      e.code = "sales_order_job_field_immutable";
      throw e;
    }
    out[col] = v === undefined ? null : v;
  }
  if (patch.plan) {
    out.blockers_json = patch.plan.blockers || [];
    out.plan_version = patch.plan.planVersion || STUDIO_SALES_ORDER_PLAN_VERSION;
  }
  return out;
}

/**
 * @param {{ db: import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function createSupabaseSalesOrderJobRepository({ db }) {
  if (!db) throw unavailable("Supabase client unavailable for sales order queue");

  return {
    mode: "supabase",

    async getByIdempotencyKey(organizationId, key) {
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", key)
        .maybeSingle();
      if (error) raise(error, "lookup");
      return rowToSalesOrderJob(data);
    },

    async getById(organizationId, id) {
      if (!UUID_RE.test(String(id ?? ""))) return null;
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      if (error) raise(error, "read");
      return rowToSalesOrderJob(data);
    },

    async getLatestForEstimate(organizationId, studioEstimateId) {
      if (!UUID_RE.test(String(studioEstimateId ?? ""))) return null;
      const { data, error } = await db
        .from(TABLE)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("studio_estimate_id", studioEstimateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) raise(error, "read");
      return rowToSalesOrderJob(data);
    },

    async insert(job) {
      const row = {
        id: job.id,
        organization_id: job.organizationId,
        studio_estimate_id: job.studioEstimateId,
        sold_snapshot_id: job.soldSnapshotId,
        acceptance_id: job.acceptanceId,
        publication_id: job.publicationId || null,
        quote_number: job.quoteNumber || null,
        idempotency_key: job.idempotencyKey,
        external_guid: job.plan?.externalGuid || job.idempotencyKey,
        company_identity: job.companyIdentity || null,
        status: job.status,
        plan_json: job.plan || {},
        plan_version: job.plan?.planVersion || STUDIO_SALES_ORDER_PLAN_VERSION,
        blockers_json: job.plan?.blockers || [],
        attempts: job.attempts || 0,
        possibly_in_quickbooks: false,
        events_json: job.events || [],
        row_version: 1,
        created_by_user_id: UUID_RE.test(String(job.createdByUserId ?? "")) ? job.createdByUserId : null,
        created_at: job.createdAt,
        updated_at: job.updatedAt
      };
      const { data, error } = await db.from(TABLE).insert(row).select("*").single();
      if (error) {
        if (isUniqueViolation(error)) {
          const existing = await this.getByIdempotencyKey(job.organizationId, job.idempotencyKey);
          if (existing) return { job: existing, created: false };
        }
        raise(error, "insert");
      }
      return { job: rowToSalesOrderJob(data), created: true };
    },

    /** Compare-and-set on row_version; null when another worker changed the row first. */
    async update(organizationId, id, expectedRowVersion, patch) {
      const cols = { ...patchToColumns(patch), row_version: expectedRowVersion + 1 };
      const { data, error } = await db
        .from(TABLE)
        .update(cols)
        .eq("organization_id", organizationId)
        .eq("id", id)
        .eq("row_version", expectedRowVersion)
        .select("*")
        .maybeSingle();
      if (error) raise(error, "update");
      return rowToSalesOrderJob(data);
    },

    async listDue(nowIso, { organizationId = null, limit = 25 } = {}) {
      let query = db.from(TABLE).select("*");
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query
        .or(
          `and(status.in.(${CLAIMABLE.join(",")}),or(next_attempt_at.is.null,next_attempt_at.lte.${nowIso})),` +
            `and(status.eq.in_progress,lease_until.lte.${nowIso})`
        )
        .order("next_attempt_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) raise(error, "due list");
      return (data || []).map(rowToSalesOrderJob);
    }
  };
}
