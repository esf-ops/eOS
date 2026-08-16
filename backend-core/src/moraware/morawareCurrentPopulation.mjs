/**
 * CURRENT_MORAWARE_JOB_SET authority (Option D).
 *
 * Latest successful, complete, uncapped FULL census = membership baseline.
 * Incremental runs overlay updates/additions only and never advance the watermark.
 * Absence from an incremental run is not deletion.
 * Raw brain_moraware_jobs rows are preserved; membership is last_seen_at >= census start.
 *
 * Does not infer "full" from chunk_count. Does not hardcode production import_group_id.
 */

import {
  formatImportGroupForApi,
  summarizeImportGroupRows
} from "./morawareSyncHealth.js";

export const CENSUS_SCOPE_FULL = "full";
export const CENSUS_SCOPE_INCREMENTAL = "incremental";

export const BLOCKING_CENSUS_CAP_KEYS = Object.freeze(["jobs", "job_activities", "job_forms"]);

/** Verified 2026-08-15 Foundation (documentation / regression labels only — not used as a hardcoded group id). */
export const VERIFIED_FOUNDATION_2026_JOB_COUNT = 4073;
export const VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT = 271432.5;

export function pickCensusScope(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === CENSUS_SCOPE_INCREMENTAL) return CENSUS_SCOPE_INCREMENTAL;
  if (s === CENSUS_SCOPE_FULL) return CENSUS_SCOPE_FULL;
  return "";
}

function metaOf(run) {
  return run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
}

/**
 * Explicit census_scope wins. Legacy complete Foundation groups used
 * mode/snapshot_mode baseline_2026 without census_scope — treat those as full.
 * Never infer from chunk_count.
 */
export function resolveCensusScopeFromRun(run) {
  const meta = metaOf(run);
  const explicit = pickCensusScope(meta.census_scope);
  if (explicit) return explicit;
  const rawScope = meta.census_scope;
  if (rawScope != null && String(rawScope).trim() !== "") return "";
  const snapshotMode = String(meta.snapshot_mode ?? "").toLowerCase();
  const mode = String(run?.mode ?? "").toLowerCase();
  if (snapshotMode.includes("baseline_2026") || mode.includes("baseline_2026")) return CENSUS_SCOPE_FULL;
  return "";
}

export function blockingCapWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [];
  return list.filter((w) => {
    const text = String(w ?? "");
    return BLOCKING_CENSUS_CAP_KEYS.some((key) => text.startsWith(`${key} reached cap`));
  });
}

export function isUncappedCensusMetadata(runOrMeta) {
  const meta = runOrMeta?.metadata && typeof runOrMeta.metadata === "object" ? runOrMeta.metadata : runOrMeta || {};
  if (meta.uncapped === false) return false;
  if (meta.uncapped === true) return true;
  const blocking = blockingCapWarnings(meta.cap_warnings);
  return blocking.length === 0;
}

/**
 * A full census may become the new membership baseline only when all are true.
 * Incremental never advances the watermark.
 */
export function canAdvanceFullCensusWatermark({
  census_scope,
  complete,
  uncapped,
  importSucceeded = true
} = {}) {
  if (census_scope === CENSUS_SCOPE_INCREMENTAL) return false;
  if (census_scope !== CENSUS_SCOPE_FULL) return false;
  if (!complete) return false;
  if (!uncapped) return false;
  if (!importSucceeded) return false;
  return true;
}

export function buildMorawareCensusImportMetadata({
  censusScope = CENSUS_SCOPE_FULL,
  snapshotMode = null,
  capWarnings = [],
  baselineStartDate = null,
  baselineEndDate = null
} = {}) {
  const scope = pickCensusScope(censusScope) || CENSUS_SCOPE_FULL;
  const warnings = Array.isArray(capWarnings) ? capWarnings : [];
  const uncapped = blockingCapWarnings(warnings).length === 0;
  return {
    census_scope: scope,
    snapshot_mode: snapshotMode || null,
    cap_warnings: warnings,
    uncapped,
    baseline_start_date: baselineStartDate || null,
    baseline_end_date: baselineEndDate || null
  };
}

export function jobInCurrentMorawareSet(job, population) {
  const watermark = population?.full_census_started_at;
  if (!watermark) return false;
  const seenMs = Date.parse(job?.last_seen_at ?? "");
  const markMs = Date.parse(watermark);
  if (!Number.isFinite(seenMs) || !Number.isFinite(markMs)) return false;
  return seenMs >= markMs;
}

export function filterCurrentMorawareJobSet(jobs, population) {
  return (Array.isArray(jobs) ? jobs : []).filter((job) => jobInCurrentMorawareSet(job, population));
}

/**
 * Prepared facts represent CURRENT_MORAWARE_JOB_SET, keyed by the last full-census
 * import_group_id (stable epoch). Latest complete group may be a 17-job incremental
 * and must not define the fact universe.
 */
export function planPreparedFactsRebuild({ jobs, population, latestCompleteGroup = null }) {
  const epochId = String(population?.full_census_import_group_id ?? "").trim();
  const currentJobs = filterCurrentMorawareJobSet(jobs, population);
  const latestGroupId = String(latestCompleteGroup?.import_group_id ?? "").trim();
  const latestRunIds = new Set(
    (Array.isArray(latestCompleteGroup?.successful_sync_run_ids)
      ? latestCompleteGroup.successful_sync_run_ids
      : []
    ).map(String)
  );
  const collapsedIfLatestGroupOnly = latestRunIds.size
    ? currentJobs.filter((j) => latestRunIds.has(String(j.sync_run_id))).length
    : 0;
  return {
    import_group_id: epochId,
    jobs: currentJobs,
    fact_count: currentJobs.length,
    latest_complete_group_id: latestGroupId || null,
    would_collapse_to_latest_group_count: collapsedIfLatestGroupOnly,
    uses_latest_complete_group_as_universe: false,
    requires_held_population_lock: true
  };
}

function representativeRun(groupRows = []) {
  const withMeta = [...groupRows].reverse().find((r) => r?.metadata && typeof r.metadata === "object") || groupRows[groupRows.length - 1];
  return withMeta || null;
}

export function evaluateImportGroupAsFullCensus(importGroupId, groupRows, latestRun) {
  const summary = summarizeImportGroupRows(groupRows, latestRun);
  const run = latestRun || representativeRun(groupRows);
  const census_scope = resolveCensusScopeFromRun(run);
  const uncapped = isUncappedCensusMetadata(run);
  const complete = Boolean(summary.complete);
  const importSucceeded =
    complete &&
    (summary.failedChunks || 0) === 0 &&
    (summary.missingChunkIndices || []).length === 0;
  const eligible = canAdvanceFullCensusWatermark({
    census_scope,
    complete,
    uncapped,
    importSucceeded
  });
  const meta = metaOf(run);
  return {
    census_scope: census_scope || null,
    full_census_import_group_id: eligible ? importGroupId : null,
    full_census_started_at: eligible ? summary.started_at : null,
    full_census_completed_at: eligible ? summary.finished_at : null,
    source_start_date: meta.baseline_start_date || null,
    source_end_date: meta.baseline_end_date || null,
    complete,
    uncapped,
    eligible,
    expected_chunk_count: summary.expectedChunkCount,
    successful_chunks: summary.successfulChunks,
    failed_chunks: summary.failedChunks,
    missing_chunk_indices: summary.missingChunkIndices,
    snapshot_mode: meta.snapshot_mode || null,
    mode: run?.mode || null
  };
}

function emptyPopulation(extra = {}) {
  return {
    census_scope: null,
    full_census_import_group_id: null,
    full_census_started_at: null,
    full_census_completed_at: null,
    source_start_date: null,
    source_end_date: null,
    complete: false,
    uncapped: false,
    available: false,
    ...extra
  };
}

const RUN_PAGE = 200;

function uniqueGroupIdsNewestFirst(rows) {
  const seen = new Set();
  const ids = [];
  for (const row of rows || []) {
    const gid = String(row?.metadata?.import_group_id ?? "").trim();
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    ids.push(gid);
  }
  return ids;
}

async function pageMorawareSyncRuns(db, organizationId, { apply = null, orderColumn = "finished_at", ascending = false } = {}) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = db
      .from("moraware_sync_runs")
      .select("id,metadata,finished_at,started_at,status,mode,runner")
      .eq("status", "success")
      .not("metadata->>import_group_id", "is", null)
      .eq("organization_id", organizationId);
    if (apply) q = apply(q);
    const { data, error } = await q.order(orderColumn, { ascending }).range(from, from + RUN_PAGE - 1);
    if (error) return { error, rows };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < RUN_PAGE) break;
    from += RUN_PAGE;
  }
  return { error: null, rows };
}

async function loadAllImportGroupRows(db, organizationId, importGroupId) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("moraware_sync_runs")
      .select("id,status,started_at,finished_at,duration_ms,row_counts,data_quality_counts,metadata,mode,runner")
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: true })
      .range(from, from + RUN_PAGE - 1);
    if (error) return { error, rows };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < RUN_PAGE) break;
    from += RUN_PAGE;
  }
  return { error: null, rows };
}

async function firstEligibleFullCensus(db, organizationId, groupIds) {
  for (const gid of groupIds) {
    const detail = await loadAllImportGroupRows(db, organizationId, gid);
    if (detail.error) return { error: detail.error };
    const groupRows = detail.rows || [];
    const latestRun = groupRows[groupRows.length - 1] ?? null;
    const evaluated = evaluateImportGroupAsFullCensus(gid, groupRows, latestRun);
    if (!evaluated.eligible) continue;
    return {
      error: null,
      population: {
        census_scope: CENSUS_SCOPE_FULL,
        full_census_import_group_id: gid,
        full_census_started_at: evaluated.full_census_started_at,
        full_census_completed_at: evaluated.full_census_completed_at,
        source_start_date: evaluated.source_start_date,
        source_end_date: evaluated.source_end_date,
        complete: true,
        uncapped: true,
        available: true,
        import_group: formatImportGroupForApi(gid, summarizeImportGroupRows(groupRows, latestRun))
      }
    };
  }
  return { error: null, population: null };
}

/**
 * Resolve the current Moraware population boundary for an organization.
 * Watermark = START of the latest successful complete uncapped FULL census.
 * Explicit census_scope=full is searched without a bounded recent-run cutoff.
 * Legacy baseline_2026 groups are used only when no explicit full census exists.
 */
export async function resolveCurrentMorawarePopulation(db, organizationId) {
  if (!db || !organizationId) return emptyPopulation({ error: "missing_db_or_org" });

  const explicit = await pageMorawareSyncRuns(db, organizationId, {
    apply: (q) => q.eq("metadata->>census_scope", CENSUS_SCOPE_FULL)
  });
  if (explicit.error) return emptyPopulation({ error: explicit.error.message, available: false });
  const explicitHit = await firstEligibleFullCensus(db, organizationId, uniqueGroupIdsNewestFirst(explicit.rows));
  if (explicitHit.error) return emptyPopulation({ error: explicitHit.error.message, available: false });
  if (explicitHit.population) return explicitHit.population;

  const legacy = await pageMorawareSyncRuns(db, organizationId, {
    apply: (q) => q.or("mode.ilike.%baseline_2026%,metadata->>snapshot_mode.ilike.%baseline_2026%")
  });
  if (legacy.error) return emptyPopulation({ error: legacy.error.message, available: false });
  const legacyRows = (legacy.rows || []).filter((row) => !pickCensusScope(row?.metadata?.census_scope));
  const legacyHit = await firstEligibleFullCensus(db, organizationId, uniqueGroupIdsNewestFirst(legacyRows));
  if (legacyHit.error) return emptyPopulation({ error: legacyHit.error.message, available: false });
  if (legacyHit.population) return legacyHit.population;

  return emptyPopulation();
}
