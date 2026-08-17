/**
 * CURRENT_MORAWARE_JOB_SET authority (Option D).
 *
 * Latest successful, complete, uncapped FULL census = membership baseline.
 * Incremental runs overlay updates/additions only and never advance the watermark.
 * Absence from an incremental run is not deletion.
 * Raw brain_moraware_jobs rows are preserved; membership is last_seen_at >= census start.
 *
 * Does not infer "full" from chunk_count. Does not hardcode production import_group_id.
 *
 * Resolver performance: newest-first early exit + short in-process TTL cache.
 * Membership semantics are unchanged — only how the qualifying census is located.
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

/**
 * In-process cache of the resolved population authority (not membership rows).
 * Available hits: 60s. Unavailable hits: 10s. Expiry re-resolves authoritatively.
 * A new FULL census may lag at most one TTL before becoming visible — not a permanent stale state.
 */
export const CURRENT_MORAWARE_POPULATION_CACHE_TTL_MS = 60_000;
export const CURRENT_MORAWARE_POPULATION_UNAVAILABLE_CACHE_TTL_MS = 10_000;

/** @type {Map<string, { expiresAt: number, population: object }>} */
const populationCache = new Map();

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

/** True when this sync run is an incremental overlay (never FULL census authority). */
export function isIncrementalCensusAuthorityRun(run) {
  return resolveCensusScopeFromRun(run) === CENSUS_SCOPE_INCREMENTAL;
}

/** True when this sync run participates in FULL census completeness / watermark. */
export function isFullCensusAuthorityRun(run) {
  return resolveCensusScopeFromRun(run) === CENSUS_SCOPE_FULL;
}

/**
 * FULL epoch completeness must ignore incremental overlay runs that share
 * parent FULL import_group_id (running / failed / successful).
 */
export function filterFullCensusAuthorityRuns(groupRows = []) {
  return (Array.isArray(groupRows) ? groupRows : []).filter((r) => isFullCensusAuthorityRun(r));
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

/**
 * Evaluate whether import_group_id is a qualifying FULL census epoch.
 *
 * Incremental overlay runs that reuse parent FULL import_group_id are excluded
 * from completeness, census_scope, and watermark eligibility — whether running,
 * failed, or successful. They cannot poison or replace FULL A.
 */
export function evaluateImportGroupAsFullCensus(importGroupId, groupRows, latestRun) {
  const allRows = Array.isArray(groupRows) ? groupRows : [];
  const fullRows = filterFullCensusAuthorityRuns(allRows);
  const overlayCount = allRows.length - fullRows.length;

  if (!fullRows.length) {
    const anyInc = allRows.some((r) => isIncrementalCensusAuthorityRun(r));
    return {
      census_scope: anyInc ? CENSUS_SCOPE_INCREMENTAL : null,
      full_census_import_group_id: null,
      full_census_started_at: null,
      full_census_completed_at: null,
      source_start_date: null,
      source_end_date: null,
      complete: false,
      uncapped: false,
      eligible: false,
      expected_chunk_count: null,
      successful_chunks: 0,
      failed_chunks: 0,
      missing_chunk_indices: [],
      snapshot_mode: null,
      mode: allRows[allRows.length - 1]?.mode || null,
      incremental_overlay_runs: overlayCount,
      full_census_authority_runs: 0
    };
  }

  const authorityLatest =
    (latestRun && isFullCensusAuthorityRun(latestRun) ? latestRun : null) ||
    representativeRun(fullRows) ||
    fullRows[fullRows.length - 1] ||
    null;

  const summary = summarizeImportGroupRows(fullRows, authorityLatest);
  const census_scope = resolveCensusScopeFromRun(authorityLatest);
  const uncapped = isUncappedCensusMetadata(authorityLatest);
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
  const meta = metaOf(authorityLatest);
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
    mode: authorityLatest?.mode || null,
    incremental_overlay_runs: overlayCount,
    full_census_authority_runs: fullRows.length
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
const DISCOVERY_SELECT = "id,metadata,finished_at,started_at,status,mode,runner";
const GROUP_DETAIL_SELECT =
  "id,status,started_at,finished_at,duration_ms,row_counts,data_quality_counts,metadata,mode,runner";

function clonePopulation(population) {
  if (!population || typeof population !== "object") return population;
  return {
    ...population,
    import_group: population.import_group ? { ...population.import_group } : population.import_group,
    missing_chunk_indices: Array.isArray(population.missing_chunk_indices)
      ? [...population.missing_chunk_indices]
      : population.missing_chunk_indices
  };
}

/**
 * Drop cached population authority for one org, or all orgs when omitted.
 * Call after a successful complete uncapped FULL census lands (optional; TTL also bounds staleness).
 */
export function invalidateCurrentMorawarePopulationCache(organizationId = null) {
  if (organizationId == null || organizationId === "") {
    populationCache.clear();
    return;
  }
  populationCache.delete(String(organizationId));
}

/** Test helper — clears the in-process cache. */
export function clearCurrentMorawarePopulationCacheForTests() {
  populationCache.clear();
}

function readPopulationCache(organizationId, nowMs) {
  const key = String(organizationId);
  const hit = populationCache.get(key);
  if (!hit) return null;
  if (nowMs >= hit.expiresAt) {
    populationCache.delete(key);
    return null;
  }
  return clonePopulation(hit.population);
}

function writePopulationCache(organizationId, population, nowMs) {
  const ttl = population?.available
    ? CURRENT_MORAWARE_POPULATION_CACHE_TTL_MS
    : CURRENT_MORAWARE_POPULATION_UNAVAILABLE_CACHE_TTL_MS;
  populationCache.set(String(organizationId), {
    expiresAt: nowMs + ttl,
    population: clonePopulation(population)
  });
}

function populationFromEvaluation(importGroupId, groupRows, evaluated, latestRun) {
  const fullRows = filterFullCensusAuthorityRuns(groupRows);
  const authorityLatest =
    (latestRun && isFullCensusAuthorityRun(latestRun) ? latestRun : null) ||
    fullRows[fullRows.length - 1] ||
    null;
  return {
    census_scope: CENSUS_SCOPE_FULL,
    full_census_import_group_id: importGroupId,
    full_census_started_at: evaluated.full_census_started_at,
    full_census_completed_at: evaluated.full_census_completed_at,
    source_start_date: evaluated.source_start_date,
    source_end_date: evaluated.source_end_date,
    complete: true,
    uncapped: true,
    available: true,
    import_group: formatImportGroupForApi(importGroupId, summarizeImportGroupRows(fullRows, authorityLatest), {
      incremental_overlay_runs: evaluated.incremental_overlay_runs ?? 0,
      full_census_authority_runs: evaluated.full_census_authority_runs ?? fullRows.length
    })
  };
}

async function loadAllImportGroupRows(db, organizationId, importGroupId) {
  const rows = [];
  let from = 0;
  let pages = 0;
  for (;;) {
    const { data, error } = await db
      .from("moraware_sync_runs")
      .select(GROUP_DETAIL_SELECT)
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: true })
      .range(from, from + RUN_PAGE - 1);
    pages += 1;
    if (error) return { error, rows, pages };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < RUN_PAGE) break;
    from += RUN_PAGE;
  }
  return { error: null, rows, pages };
}

/**
 * Newest-first discovery: page successful runs, evaluate each previously unseen
 * import_group_id immediately, return on first qualifying FULL census.
 * Does not preload the entire matching history.
 */
async function findNewestEligibleFullCensus(db, organizationId, { apply = null, acceptDiscoveryRow = null } = {}) {
  const seenGroups = new Set();
  let from = 0;
  let discoveryPages = 0;
  let groupDetailPages = 0;
  let groupsEvaluated = 0;

  for (;;) {
    let q = db
      .from("moraware_sync_runs")
      .select(DISCOVERY_SELECT)
      .eq("status", "success")
      .not("metadata->>import_group_id", "is", null)
      .eq("organization_id", organizationId);
    if (apply) q = apply(q);
    const { data, error } = await q.order("finished_at", { ascending: false }).range(from, from + RUN_PAGE - 1);
    discoveryPages += 1;
    if (error) {
      return {
        error,
        population: null,
        stats: { discoveryPages, groupDetailPages, groupsEvaluated, groupsSeen: seenGroups.size }
      };
    }
    const batch = data || [];
    if (!batch.length) break;

    for (const row of batch) {
      const gid = String(row?.metadata?.import_group_id ?? "").trim();
      if (!gid || seenGroups.has(gid)) continue;
      seenGroups.add(gid);
      if (acceptDiscoveryRow && !acceptDiscoveryRow(row)) continue;

      const detail = await loadAllImportGroupRows(db, organizationId, gid);
      groupDetailPages += detail.pages || 0;
      if (detail.error) {
        return {
          error: detail.error,
          population: null,
          stats: { discoveryPages, groupDetailPages, groupsEvaluated, groupsSeen: seenGroups.size }
        };
      }
      groupsEvaluated += 1;
      const groupRows = detail.rows || [];
      const latestRun = groupRows[groupRows.length - 1] ?? null;
      const evaluated = evaluateImportGroupAsFullCensus(gid, groupRows, latestRun);
      if (!evaluated.eligible) continue;

      return {
        error: null,
        population: populationFromEvaluation(gid, groupRows, evaluated, latestRun),
        stats: {
          discoveryPages,
          groupDetailPages,
          groupsEvaluated,
          groupsSeen: seenGroups.size,
          qualifyingGroupId: gid,
          qualifyingChunkRows: groupRows.length
        }
      };
    }

    if (batch.length < RUN_PAGE) break;
    from += RUN_PAGE;
  }

  return {
    error: null,
    population: null,
    stats: { discoveryPages, groupDetailPages, groupsEvaluated, groupsSeen: seenGroups.size }
  };
}

function emptyStats() {
  return {
    cacheHit: false,
    discoveryPages: 0,
    groupDetailPages: 0,
    groupsEvaluated: 0,
    groupsSeen: 0,
    path: null,
    queryEstimate: 0
  };
}

async function resolveCurrentMorawarePopulationUncached(db, organizationId) {
  const stats = emptyStats();

  const explicit = await findNewestEligibleFullCensus(db, organizationId, {
    apply: (q) => q.eq("metadata->>census_scope", CENSUS_SCOPE_FULL)
  });
  if (explicit.error) {
    return {
      population: emptyPopulation({ error: explicit.error.message, available: false }),
      stats: {
        ...stats,
        ...explicit.stats,
        path: "explicit_error",
        queryEstimate: (explicit.stats?.discoveryPages || 0) + (explicit.stats?.groupDetailPages || 0)
      }
    };
  }
  if (explicit.population) {
    return {
      population: explicit.population,
      stats: {
        ...stats,
        ...explicit.stats,
        path: "explicit_full",
        queryEstimate: (explicit.stats?.discoveryPages || 0) + (explicit.stats?.groupDetailPages || 0)
      }
    };
  }

  const legacy = await findNewestEligibleFullCensus(db, organizationId, {
    apply: (q) => q.or("mode.ilike.%baseline_2026%,metadata->>snapshot_mode.ilike.%baseline_2026%"),
    acceptDiscoveryRow: (row) => !pickCensusScope(row?.metadata?.census_scope)
  });
  if (legacy.error) {
    return {
      population: emptyPopulation({ error: legacy.error.message, available: false }),
      stats: {
        ...stats,
        discoveryPages: (explicit.stats?.discoveryPages || 0) + (legacy.stats?.discoveryPages || 0),
        groupDetailPages: (explicit.stats?.groupDetailPages || 0) + (legacy.stats?.groupDetailPages || 0),
        groupsEvaluated: (explicit.stats?.groupsEvaluated || 0) + (legacy.stats?.groupsEvaluated || 0),
        groupsSeen: (explicit.stats?.groupsSeen || 0) + (legacy.stats?.groupsSeen || 0),
        path: "legacy_error",
        queryEstimate:
          (explicit.stats?.discoveryPages || 0) +
          (explicit.stats?.groupDetailPages || 0) +
          (legacy.stats?.discoveryPages || 0) +
          (legacy.stats?.groupDetailPages || 0)
      }
    };
  }
  if (legacy.population) {
    return {
      population: legacy.population,
      stats: {
        ...stats,
        discoveryPages: (explicit.stats?.discoveryPages || 0) + (legacy.stats?.discoveryPages || 0),
        groupDetailPages: (explicit.stats?.groupDetailPages || 0) + (legacy.stats?.groupDetailPages || 0),
        groupsEvaluated: (explicit.stats?.groupsEvaluated || 0) + (legacy.stats?.groupsEvaluated || 0),
        groupsSeen: (explicit.stats?.groupsSeen || 0) + (legacy.stats?.groupsSeen || 0),
        qualifyingGroupId: legacy.stats?.qualifyingGroupId,
        qualifyingChunkRows: legacy.stats?.qualifyingChunkRows,
        path: "legacy_baseline_2026",
        queryEstimate:
          (explicit.stats?.discoveryPages || 0) +
          (explicit.stats?.groupDetailPages || 0) +
          (legacy.stats?.discoveryPages || 0) +
          (legacy.stats?.groupDetailPages || 0)
      }
    };
  }

  return {
    population: emptyPopulation(),
    stats: {
      ...stats,
      discoveryPages: (explicit.stats?.discoveryPages || 0) + (legacy.stats?.discoveryPages || 0),
      groupDetailPages: (explicit.stats?.groupDetailPages || 0) + (legacy.stats?.groupDetailPages || 0),
      groupsEvaluated: (explicit.stats?.groupsEvaluated || 0) + (legacy.stats?.groupsEvaluated || 0),
      groupsSeen: (explicit.stats?.groupsSeen || 0) + (legacy.stats?.groupsSeen || 0),
      path: "none",
      queryEstimate:
        (explicit.stats?.discoveryPages || 0) +
        (explicit.stats?.groupDetailPages || 0) +
        (legacy.stats?.discoveryPages || 0) +
        (legacy.stats?.groupDetailPages || 0)
    }
  };
}

/**
 * Resolve the current Moraware population boundary for an organization.
 * Watermark = START of the latest successful complete uncapped FULL census.
 * Explicit census_scope=full is searched newest-first with early exit.
 * Legacy baseline_2026 groups are used only when no explicit full census exists.
 *
 * @param {object} db
 * @param {string} organizationId
 * @param {{ skipCache?: boolean, nowMs?: number, includeStats?: boolean }} [options]
 */
export async function resolveCurrentMorawarePopulation(db, organizationId, options = {}) {
  if (!db || !organizationId) {
    const population = emptyPopulation({ error: "missing_db_or_org" });
    return options.includeStats ? { ...population, _resolveStats: emptyStats() } : population;
  }

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  if (!options.skipCache) {
    const cached = readPopulationCache(organizationId, nowMs);
    if (cached) {
      if (options.includeStats) {
        return {
          ...cached,
          _resolveStats: { ...emptyStats(), cacheHit: true, path: "cache" }
        };
      }
      return cached;
    }
  }

  const { population, stats } = await resolveCurrentMorawarePopulationUncached(db, organizationId);
  writePopulationCache(organizationId, population, nowMs);
  if (options.includeStats) return { ...population, _resolveStats: { ...stats, cacheHit: false } };
  return population;
}
