/**
 * Scoped prepared job-fact refresh for incremental overlays.
 *
 * Upserts sales_moraware_job_facts for exact source_job_ids under the parent
 * FULL census epoch. Does not scan all CURRENT jobs.
 *
 * Account rollups: optional. Full rollup rebuild remains available via
 * rebuildSalesMorawarePreparedFacts — reported as remaining optimization when skipped.
 */

import { extractJobWorksheetCensusSqft } from "../sales/morawareSqftActuals.js";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

/**
 * Build a single sales_moraware_job_facts row for an incremental refresh.
 * Kept local so incremental path does not require exporting salesHead internals.
 */
export function buildIncrementalPreparedJobFactRow(job, { organizationId, importGroupId } = {}) {
  const org = pickStr(organizationId);
  const epoch = pickStr(importGroupId);
  const sourceJobId = pickStr(job?.source_job_id);
  if (!org || !epoch || !sourceJobId) return null;

  let totalSqft = 0;
  let hasSqft = false;
  try {
    if (typeof extractJobWorksheetCensusSqft === "function") {
      const extracted = extractJobWorksheetCensusSqft(job);
      totalSqft = Number(extracted?.totalSqft) || 0;
      hasSqft = totalSqft > 0;
    }
  } catch {
    totalSqft = 0;
    hasSqft = false;
  }

  return {
    organization_id: org,
    import_group_id: epoch,
    sync_run_id: job?.sync_run_id ?? null,
    source_job_id: sourceJobId,
    source_account_id: job?.source_account_id ?? null,
    account_name: job?.account_name ?? null,
    status_name: job?.status_name ?? null,
    process_name: job?.process_name ?? null,
    salesperson_name: job?.salesperson_name ?? null,
    created_at_source: job?.created_at_source ?? null,
    modified_at_source: job?.modified_at_source ?? null,
    scheduled_at_source: job?.scheduled_at_source ?? null,
    completed_at_source: job?.completed_at_source ?? null,
    install_at_source: job?.install_at_source ?? null,
    worksheet_sqft: hasSqft ? totalSqft : 0,
    sqft_found: hasSqft,
    updated_at: new Date().toISOString()
  };
}

/**
 * Plan scoped job-fact upserts (no I/O).
 */
export function planIncrementalPreparedJobFactsRefresh({
  organizationId,
  importGroupId,
  jobs = [],
  unchangedSourceJobIds = []
} = {}) {
  const org = pickStr(organizationId);
  const epoch = pickStr(importGroupId);
  if (!org || !epoch) {
    return {
      ok: false,
      status: "epoch_required",
      error: "Incremental job-fact refresh requires parent FULL import_group_id.",
      rows: [],
      source_job_ids: [],
      untouched_source_job_ids: unchangedSourceJobIds,
      scope: "exact_jobs_only",
      account_rollups: "deferred_remaining_optimization"
    };
  }
  const rows = [];
  const ids = [];
  for (const job of jobs || []) {
    const row = buildIncrementalPreparedJobFactRow(job, { organizationId: org, importGroupId: epoch });
    if (!row) continue;
    rows.push(row);
    ids.push(row.source_job_id);
  }
  return {
    ok: true,
    status: "planned",
    import_group_id: epoch,
    rows,
    source_job_ids: ids,
    untouched_source_job_ids: (unchangedSourceJobIds || []).filter((id) => !ids.includes(String(id))),
    scope: "exact_jobs_only",
    account_rollups: "deferred_remaining_optimization",
    note: "Only refreshed jobs are rewritten. Untouched CURRENT jobs keep existing prepared facts under epoch A."
  };
}

/**
 * Live scoped upsert. Requires population lock owner. Does not rebuild all 4073 facts.
 */
export async function refreshSalesMorawareJobFactsForExactJobs(
  supabase,
  {
    organizationId,
    importGroupId,
    jobs = [],
    ownerToken,
    liveWrite = false,
    allowLivePopulation = false,
    assertOwner = null
  } = {}
) {
  if (liveWrite !== true || allowLivePopulation !== true) {
    return { ok: false, status: "live_population_not_enabled", facts_upserted: 0 };
  }
  const token = pickStr(ownerToken);
  if (!token) {
    return { ok: false, status: "population_lock_required", facts_upserted: 0 };
  }
  if (typeof assertOwner === "function") {
    const asserted = await assertOwner({ ownerToken: token });
    if (!asserted?.ok) {
      return {
        ok: false,
        status: asserted?.code || "population_lock_denied",
        facts_upserted: 0,
        error: asserted?.error
      };
    }
  }

  const plan = planIncrementalPreparedJobFactsRefresh({
    organizationId,
    importGroupId,
    jobs
  });
  if (!plan.ok) return { ...plan, facts_upserted: 0 };
  if (!plan.rows.length) {
    return {
      ok: true,
      status: "nothing_to_upsert",
      facts_upserted: 0,
      import_group_id: plan.import_group_id,
      scope: plan.scope,
      account_rollups: plan.account_rollups
    };
  }

  const { error } = await supabase.from("sales_moraware_job_facts").upsert(plan.rows, {
    onConflict: "organization_id,import_group_id,source_job_id"
  });
  if (error) {
    return {
      ok: false,
      status: "upsert_failed",
      error: error.message || String(error),
      facts_upserted: 0
    };
  }
  return {
    ok: true,
    status: "upserted",
    facts_upserted: plan.rows.length,
    import_group_id: plan.import_group_id,
    source_job_ids: plan.source_job_ids,
    scope: plan.scope,
    account_rollups: plan.account_rollups,
    remaining_optimization: "sales_moraware_account_rollups still use full rebuild when needed"
  };
}
