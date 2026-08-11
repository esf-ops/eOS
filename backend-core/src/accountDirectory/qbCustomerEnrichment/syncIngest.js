/**
 * Validate + persist Account Directory QB customer prepared facts.
 * Never writes account_directory_* identity tables or external_links.
 */

import { createHash } from "node:crypto";
import { runAdQbCustomerReconciliation } from "./reconcile.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const QB_AD_CUSTOMER_SYNC_MAX_CUSTOMERS = 500;
export const QB_AD_CUSTOMER_SYNC_WORKER_VERSION_DEFAULT = "1.0.0";

function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

function pickStr(v, max = 500) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

/**
 * @param {object} row
 */
export function computeCustomerFactHash(row) {
  const payload = [
    row.qb_list_id,
    row.parent_list_id ?? "",
    row.is_job ? "1" : "0",
    row.name ?? "",
    row.full_name ?? "",
    row.is_active ? "1" : "0",
    row.bill_city ?? "",
    row.bill_state ?? ""
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

/**
 * @param {unknown} body
 */
export function validateBeginPayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  const workerVersion = pickStr(body?.worker_version, 64) || QB_AD_CUSTOMER_SYNC_WORKER_VERSION_DEFAULT;
  const companyName = pickStr(body?.company_name, 200);
  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, workerVersion, companyName }
  };
}

/**
 * @param {unknown} body
 */
export function validateCustomerChunk(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  const rowsIn = Array.isArray(body?.customers) ? body.customers : null;
  if (!rowsIn) errors.push("customers must be an array");
  if (rowsIn && rowsIn.length > QB_AD_CUSTOMER_SYNC_MAX_CUSTOMERS) {
    errors.push(`customers exceeds max ${QB_AD_CUSTOMER_SYNC_MAX_CUSTOMERS}`);
  }

  /** @type {Array<object>} */
  const customers = [];
  if (rowsIn) {
    for (let i = 0; i < rowsIn.length; i += 1) {
      const row = rowsIn[i];
      const qbListId = pickStr(row?.qb_list_id ?? row?.list_id ?? row?.Id, 200);
      if (!qbListId) {
        errors.push(`customers[${i}].qb_list_id required`);
        continue;
      }
      const parentListId = pickStr(row?.parent_list_id ?? row?.ParentId, 200);
      const isJob = toBool(row?.is_job ?? row?.Job, Boolean(parentListId));
      // Jobs must carry parent; roots must not invent a parent.
      if (isJob && !parentListId) {
        errors.push(`customers[${i}].parent_list_id required for jobs`);
        continue;
      }
      const fact = {
        organization_id: organizationId,
        qb_list_id: qbListId,
        parent_list_id: isJob ? parentListId : null,
        is_job: isJob,
        name: pickStr(row?.name ?? row?.Name, 300),
        full_name: pickStr(row?.full_name ?? row?.FullName, 500),
        is_active: toBool(row?.is_active ?? row?.IsActive, true),
        bill_city: pickStr(row?.bill_city ?? row?.BillAddress_City, 120),
        bill_state: pickStr(row?.bill_state ?? row?.BillAddress_State, 64),
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      fact.raw_hash = computeCustomerFactHash(fact);
      customers.push(fact);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, customers }
  };
}

/**
 * @param {unknown} body
 */
export function validateCompletePayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  const statusRaw = pickStr(body?.status, 32) || "success";
  const status = ["success", "partial", "failed"].includes(statusRaw) ? statusRaw : null;
  if (!status) errors.push("status must be success|partial|failed");
  const customersCount = body?.customers_count == null ? null : Number(body.customers_count);
  const jobsCount = body?.jobs_count == null ? null : Number(body.jobs_count);
  const rootsCount = body?.roots_count == null ? null : Number(body.roots_count);
  if (customersCount != null && !Number.isFinite(customersCount)) errors.push("customers_count invalid");
  if (jobsCount != null && !Number.isFinite(jobsCount)) errors.push("jobs_count invalid");
  if (rootsCount != null && !Number.isFinite(rootsCount)) errors.push("roots_count invalid");
  const errorSummary = pickStr(body?.error_summary, 400);
  const warnings = Array.isArray(body?.warnings) ? body.warnings.slice(0, 50) : [];
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      syncRunId,
      status,
      customersCount,
      jobsCount,
      rootsCount,
      errorSummary,
      warnings,
      runReconciliation: body?.run_reconciliation !== false
    }
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ organizationId: string, workerVersion: string, companyName: string|null }} value
 */
export async function beginSyncRun(supabase, value) {
  const { data, error } = await supabase
    .from("ad_qb_customer_sync_runs")
    .insert({
      organization_id: value.organizationId,
      status: "running",
      worker_version: value.workerVersion,
      company_name: value.companyName,
      started_at: new Date().toISOString()
    })
    .select("id,started_at,status")
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} customers
 */
export async function upsertCustomerFacts(supabase, customers) {
  if (!customers.length) return { upserted: 0 };
  const { error } = await supabase.from("ad_qb_customer_facts").upsert(customers, {
    onConflict: "organization_id,qb_list_id"
  });
  if (error) throw error;
  return { upserted: customers.length };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} value
 * @param {{ accountDirectoryStore?: any }} [opts]
 */
export async function completeSyncRun(supabase, value, opts = {}) {
  const patch = {
    status: value.status,
    completed_at: new Date().toISOString(),
    customers_count: value.customersCount,
    jobs_count: value.jobsCount,
    roots_count: value.rootsCount,
    error_summary: value.errorSummary,
    warnings: value.warnings,
    updated_at: new Date().toISOString()
  };

  let reconcileResult = null;
  if (value.runReconciliation && value.status !== "failed") {
    reconcileResult = await runAdQbCustomerReconciliation(supabase, {
      organizationId: value.organizationId,
      syncRunId: value.syncRunId,
      accountDirectoryStore: opts.accountDirectoryStore
    });
    patch.suggestions_open_count = reconcileResult.openCount;
  }

  const { data, error } = await supabase
    .from("ad_qb_customer_sync_runs")
    .update(patch)
    .eq("id", value.syncRunId)
    .eq("organization_id", value.organizationId)
    .select("id,status,completed_at,suggestions_open_count")
    .single();
  if (error) throw error;
  return { run: data, reconcile: reconcileResult };
}
