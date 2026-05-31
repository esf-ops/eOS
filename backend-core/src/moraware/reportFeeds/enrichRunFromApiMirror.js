/**
 * Post-hoc API mirror identity enrichment for a persisted report-feed run.
 *
 * Resolves moraware_report_raw_rows that are still "needs_identity_review" after
 * HTML-based enrichment, using the existing brain_moraware_jobs mirror as the
 * full-coverage identity source.
 *
 * Safe defaults:
 * - Default behavior is dry-run (no writes).
 * - Only updates rows with identity_status = "needs_identity_review".
 * - Never downgrades existing "matched" or "ambiguous_identity" rows.
 * - Never updates row_hash, raw_row, row_number, report_run_id, or organization_id.
 * - Never writes to moraware_prepared_sales_worksheet_facts.
 * - Refuses to enrich a run that is already "promoted".
 */

import { buildApiMirrorIdentityMap } from "./buildApiMirrorIdentityMap.js";
import { planApiMirrorEnrichment } from "./planApiMirrorEnrichment.js";

const JOBS_PAGE_SIZE = 1000;
const RAW_ROWS_PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 500;
const IDENTITY_LINKS_BATCH_SIZE = 500;

/** Wrap a bare Supabase/PostgREST error object so it has a usable .stack. */
function toError(err) {
  if (!err) return new Error("unknown error");
  if (err instanceof Error) return err;
  const parts = [
    err.message,
    err.code && `[code=${err.code}]`,
    err.details && `[details=${err.details}]`,
    err.hint && `[hint=${err.hint}]`
  ].filter(Boolean);
  const e = new Error(parts.join(" ") || JSON.stringify(err));
  e.supabaseError = err;
  return e;
}

/**
 * Fetch all pages from a Supabase table with simple equality filters.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} table
 * @param {Record<string, string>} filters - equality filters applied with .eq()
 * @param {string} select - column list
 * @param {number} pageSize
 * @returns {Promise<Array>}
 */
async function fetchAllPages(db, table, filters, select, pageSize) {
  const all = [];
  let from = 0;
  while (true) {
    let q = db.from(table).select(select);
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw toError(error);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Enrich a report-feed run's raw rows using the brain_moraware_jobs API mirror.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ runId: string, organizationId: string, dryRun?: boolean }} params
 *   dryRun defaults to true — pass dryRun: false only after reviewing the dry-run summary.
 *
 * @returns {Promise<object>} Result summary (counts, applied flag, etc.)
 */
export async function enrichRunFromApiMirror(db, { runId, organizationId, dryRun = true }) {
  // Step 1: Load and validate the run
  const { data: run, error: runErr } = await db
    .from("moraware_report_runs")
    .select("id, organization_id, status, matched_identity_count, unmatched_identity_count, ambiguous_identity_count, summary")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw toError(runErr);
  if (!run) throw new Error(`enrichRunFromApiMirror: run not found: ${runId}`);
  if (run.organization_id !== organizationId) {
    throw new Error(
      `enrichRunFromApiMirror: organization_id mismatch — ` +
        `run belongs to ${run.organization_id}, caller passed ${organizationId}`
    );
  }
  if (run.status === "promoted") {
    throw new Error(
      `enrichRunFromApiMirror: run ${runId} is already promoted — ` +
        `re-enriching a promoted run is not allowed`
    );
  }

  // Step 2: Fetch brain_moraware_jobs for this org (all pages)
  const jobRows = await fetchAllPages(
    db,
    "brain_moraware_jobs",
    { organization_id: organizationId },
    "source_job_id, source_account_id, account_name, job_name",
    JOBS_PAGE_SIZE
  );

  // Step 3: Build identity map (pure)
  const { identityMap, duplicateKeys, summary: mapSummary } =
    buildApiMirrorIdentityMap(jobRows);

  // Step 4: Fetch only needs_identity_review raw rows for this run (all pages)
  const stagedRawRows = await fetchAllPages(
    db,
    "moraware_report_raw_rows",
    { organization_id: organizationId, report_run_id: runId, identity_status: "needs_identity_review" },
    "id, account_name, job_name, identity_status",
    RAW_ROWS_PAGE_SIZE
  );

  // Step 5: Build enrichment plan (pure)
  const plan = planApiMirrorEnrichment(stagedRawRows, identityMap, duplicateKeys);

  // Step 6: Dry-run — return summary with no writes
  if (dryRun) {
    return {
      runId,
      organizationId,
      runStatus: run.status,
      dryRun: true,
      applied: false,
      mapSummary,
      plan: plan.summary,
      currentCounts: {
        matched: run.matched_identity_count ?? 0,
        unmatched: run.unmatched_identity_count ?? 0,
        ambiguous: run.ambiguous_identity_count ?? 0
      }
    };
  }

  // Step 7: Apply — write matched updates, grouped by (account_id, job_id) for efficiency
  const matchGroups = new Map();
  for (const entry of plan.toMatch) {
    const gKey = `${entry.account_id}||${entry.job_id}`;
    if (!matchGroups.has(gKey)) {
      matchGroups.set(gKey, { account_id: entry.account_id, job_id: entry.job_id, ids: [] });
    }
    matchGroups.get(gKey).ids.push(entry.id);
  }
  for (const { account_id, job_id, ids } of matchGroups.values()) {
    for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
      const chunk = ids.slice(i, i + UPDATE_BATCH_SIZE);
      const { error } = await db
        .from("moraware_report_raw_rows")
        .update({
          account_id,
          job_id,
          identity_status: "matched",
          identity_reason: "api_mirror_exact_account_job"
        })
        .in("id", chunk);
      if (error) throw toError(error);
    }
  }

  // Apply — write ambiguous updates (all get the same field values)
  const ambiguousIds = plan.toAmbiguous.map((r) => r.id);
  for (let i = 0; i < ambiguousIds.length; i += UPDATE_BATCH_SIZE) {
    const chunk = ambiguousIds.slice(i, i + UPDATE_BATCH_SIZE);
    const { error } = await db
      .from("moraware_report_raw_rows")
      .update({
        account_id: null,
        job_id: null,
        identity_status: "ambiguous_identity",
        identity_reason: "api_mirror_ambiguous_key"
      })
      .in("id", chunk);
    if (error) throw toError(error);
  }

  // Apply — insert identity link rows (one per unique match key)
  // Use upsert with ignoreDuplicates to skip keys already inserted by HTML enrichment.
  const matchedLinksByKey = new Map();
  for (const entry of plan.toMatch) {
    if (!matchedLinksByKey.has(entry.matchKey)) {
      const identity = identityMap.get(entry.matchKey);
      matchedLinksByKey.set(entry.matchKey, {
        organization_id: organizationId,
        report_run_id: runId,
        match_key: entry.matchKey,
        account_id: identity?.accountId ?? null,
        account_name: identity?.accountName ?? null,
        job_id: identity?.jobId ?? null,
        job_name: identity?.jobName ?? null,
        source: "api_mirror",
        is_ambiguous: false
      });
    }
  }

  const ambiguousLinksByKey = new Map();
  for (const entry of plan.toAmbiguous) {
    if (!ambiguousLinksByKey.has(entry.matchKey)) {
      const firstSeen = identityMap.get(entry.matchKey);
      ambiguousLinksByKey.set(entry.matchKey, {
        organization_id: organizationId,
        report_run_id: runId,
        match_key: entry.matchKey,
        account_id: firstSeen?.accountId ?? null,
        account_name: firstSeen?.accountName ?? null,
        job_id: firstSeen?.jobId ?? null,
        job_name: firstSeen?.jobName ?? null,
        source: "api_mirror",
        is_ambiguous: true
      });
    }
  }

  const allLinks = [...matchedLinksByKey.values(), ...ambiguousLinksByKey.values()];
  for (let i = 0; i < allLinks.length; i += IDENTITY_LINKS_BATCH_SIZE) {
    const chunk = allLinks.slice(i, i + IDENTITY_LINKS_BATCH_SIZE);
    const { error } = await db
      .from("moraware_report_identity_links")
      .upsert(chunk, { onConflict: "report_run_id,match_key", ignoreDuplicates: true });
    if (error) throw toError(error);
  }

  // Apply — update run counts and append enrichment summary
  const newMatchedCount = (run.matched_identity_count ?? 0) + plan.toMatch.length;
  const newAmbiguousCount = (run.ambiguous_identity_count ?? 0) + plan.toAmbiguous.length;
  const newUnmatchedCount = Math.max(
    0,
    (run.unmatched_identity_count ?? 0) - plan.toMatch.length - plan.toAmbiguous.length
  );

  const enrichmentEntry = {
    source: "api_mirror",
    runAt: new Date().toISOString(),
    matched: plan.toMatch.length,
    ambiguous: plan.toAmbiguous.length,
    eligible: plan.summary.eligible,
    apiMirrorJobs: mapSummary.usableJobs,
    duplicateKeyCount: mapSummary.duplicateKeyCount
  };
  const existingSummary = run.summary ?? {};
  const updatedSummary = {
    ...existingSummary,
    apiMirrorEnrichments: [
      ...(existingSummary.apiMirrorEnrichments ?? []),
      enrichmentEntry
    ]
  };

  const { error: runUpdateErr } = await db
    .from("moraware_report_runs")
    .update({
      matched_identity_count: newMatchedCount,
      unmatched_identity_count: newUnmatchedCount,
      ambiguous_identity_count: newAmbiguousCount,
      summary: updatedSummary
    })
    .eq("id", runId);
  if (runUpdateErr) throw toError(runUpdateErr);

  return {
    runId,
    organizationId,
    runStatus: run.status,
    dryRun: false,
    applied: true,
    mapSummary,
    plan: plan.summary,
    previousCounts: {
      matched: run.matched_identity_count ?? 0,
      unmatched: run.unmatched_identity_count ?? 0,
      ambiguous: run.ambiguous_identity_count ?? 0
    },
    newCounts: {
      matched: newMatchedCount,
      unmatched: newUnmatchedCount,
      ambiguous: newAmbiguousCount
    }
  };
}
