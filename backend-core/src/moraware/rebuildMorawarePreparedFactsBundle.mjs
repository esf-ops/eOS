/**
 * Governed prepared-facts rebuild bundle:
 *   sales_moraware_job_facts (+ account rollups)
 *   then sales_moraware_job_worksheet_facts
 *
 * Must run while the caller already holds moraware_population (outerOwnerToken).
 * Worksheet refresh failure → overall ok:false (pipeline must not report full success).
 */

import { rebuildSalesMorawarePreparedFacts } from "../sales/salesHead.js";
import { populateMorawareJobWorksheetPreparedFacts } from "./morawareJobWorksheetPreparedFacts.mjs";

/**
 * @param {object} supabase
 * @param {string} organizationId
 * @param {{ ownerToken: string, includeWorksheetFacts?: boolean, worksheetControlMode?: "reconcile"|"foundation" }} options
 */
export async function rebuildMorawarePreparedFactsBundle(supabase, organizationId, options = {}) {
  const ownerToken = String(options.ownerToken ?? "").trim();
  const includeWorksheetFacts = options.includeWorksheetFacts !== false;
  const worksheetControlMode = options.worksheetControlMode === "foundation" ? "foundation" : "reconcile";

  if (!ownerToken) {
    return {
      ok: false,
      status: "population_lock_required",
      code: "population_lock_required",
      error: "Prepared-facts bundle requires an active moraware_population owner token.",
      job_facts: null,
      worksheet_facts: null
    };
  }

  const jobFacts = await rebuildSalesMorawarePreparedFacts(supabase, organizationId);
  if (!jobFacts?.ok) {
    return {
      ok: false,
      status: "job_facts_failed",
      ...(jobFacts && typeof jobFacts === "object" ? jobFacts : {}),
      job_facts: jobFacts,
      worksheet_facts: null
    };
  }

  if (!includeWorksheetFacts) {
    return {
      ok: true,
      ...jobFacts,
      job_facts: jobFacts,
      worksheet_facts: { skipped: true }
    };
  }

  const worksheet = await populateMorawareJobWorksheetPreparedFacts(supabase, organizationId, {
    liveWrite: true,
    allowLivePopulation: true,
    outerOwnerToken: ownerToken,
    controlMode: worksheetControlMode,
    verifyAfterWrite: options.verifyWorksheetAfterWrite !== false,
    pageSize: options.pageSize,
    chunkSize: options.chunkSize
  });

  if (!worksheet?.ok) {
    return {
      ok: false,
      status: "worksheet_facts_failed",
      // Preserve job-fact counters for diagnostics / pipeline logs.
      import_group_id: jobFacts.import_group_id,
      jobs_scanned: jobFacts.jobs_scanned,
      facts_upserted: jobFacts.facts_upserted,
      account_rollups_upserted: jobFacts.account_rollups_upserted,
      query_page_count: jobFacts.query_page_count,
      compute_ms: jobFacts.compute_ms,
      job_facts: jobFacts,
      worksheet_facts: worksheet,
      error: worksheet?.error || worksheet?.status || "worksheet_facts_failed",
      code: worksheet?.code || "worksheet_facts_failed"
    };
  }

  return {
    ok: true,
    status: "built",
    import_group_id: jobFacts.import_group_id,
    jobs_scanned: jobFacts.jobs_scanned,
    facts_upserted: jobFacts.facts_upserted,
    account_rollups_upserted: jobFacts.account_rollups_upserted,
    query_page_count: jobFacts.query_page_count,
    compute_ms: jobFacts.compute_ms,
    job_facts: jobFacts,
    worksheet_facts: {
      status: worksheet.status,
      lock_mode: worksheet.lock_mode,
      control_mode: worksheet.control_mode,
      import_group_id: worksheet.summary?.import_group_id ?? null,
      worksheet_fact_count: worksheet.summary?.worksheet_fact_count ?? null,
      unique_key_count: worksheet.summary?.unique_key_count ?? null,
      duplicate_key_count: worksheet.summary?.duplicate_key_count ?? null,
      sqft: worksheet.summary?.sqft ?? null,
      jobs_without_worksheet: worksheet.summary?.jobs_without_worksheet ?? null,
      writes: worksheet.writes,
      verification: worksheet.verification
        ? {
            ok: worksheet.verification.ok,
            row_count: worksheet.verification.row_count,
            unique_key_count: worksheet.verification.unique_key_count,
            duplicate_key_count: worksheet.verification.duplicate_key_count,
            sqft: worksheet.verification.sqft
          }
        : null,
      released_standalone_lock: worksheet.released_standalone_lock === true,
      event_log: worksheet.event_log
    }
  };
}
