/**
 * Governed TRUE INCREMENTAL Moraware population orchestrator.
 *
 * Strategy: creation_window_plus_rolling_exact_refresh
 *   (creation window ∪ explicit IDs ∪ rolling CURRENT exact refresh)
 *
 * Lifecycle:
 *   acquire moraware_population
 *   → establish creation window from durable cursor (+ overlap)
 *   → resolve CURRENT_MORAWARE_JOB_SET
 *   → discover candidate UNION (creation + explicit + rolling)
 *   → exact refresh jobs (deduped)
 *   → Brain import (census_scope=incremental, parent FULL epoch)
 *   → scoped prepared job facts
 *   → per-job worksheet facts under epoch A
 *   → verify
 *   → advance creation + rolling cursors ONLY on total success
 *   → release lock in finally
 *
 * Dry-run never acquires lock, never writes Brain/facts, never advances cursor.
 * Live requires explicit gates (same philosophy as worksheet populate).
 */

import { CENSUS_SCOPE_FULL, CENSUS_SCOPE_INCREMENTAL, canAdvanceFullCensusWatermark } from "./morawareCurrentPopulation.mjs";
import {
  acquireMorawarePopulationLock,
  assertMorawarePopulationLockOwner,
  createMorawarePopulationLockOwnerToken,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_NAME,
  releaseMorawarePopulationLock,
  renewMorawarePopulationLock,
  startMorawarePopulationLockHeartbeat
} from "./morawarePopulationLock.mjs";
import {
  buildAdvancedCursorState,
  buildFailedCursorAttemptState,
  buildIncrementalDiscoveryWindow,
  createMemoryIncrementalCursorStore,
  normalizeIncrementalCursor,
  resolveRollingBatchSize,
  shouldAdvanceIncrementalCursor,
  summarizeIncrementalCursorHealth
} from "./morawareIncrementalCursor.mjs";
import { planIncrementalDiscovery } from "./morawareIncrementalDiscovery.mjs";
import { planIncrementalPreparedJobFactsRefresh } from "./morawareIncrementalPreparedFacts.mjs";
import {
  describeMorawareIncrementalStrategy,
  MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE,
  MORAWARE_INCREMENTAL_STRATEGY
} from "./morawareIncrementalStrategy.mjs";
import { planIncrementalWorksheetFactRefresh } from "./morawareJobWorksheetPreparedFacts.mjs";

/** Conservative first-production live ceiling (distinct from dry-run hard cap of 100). */
export const MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT = 150;

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function stageFail(status, extra = {}) {
  return { ok: false, status, ...extra };
}

function pickRollingBatchSize(options = {}) {
  return resolveRollingBatchSize(
    options.rollingBatchSize ?? options.rolling_batch_size ?? process.env.MORAWARE_INCREMENTAL_ROLLING_BATCH_SIZE,
    MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE
  );
}

export function resolveLiveIncrementalCandidateCeiling(raw, fallback = MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING_DEFAULT) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  const envN = Number(process.env.MORAWARE_INCREMENTAL_LIVE_CANDIDATE_CEILING);
  if (Number.isFinite(envN) && envN >= 1) return Math.floor(envN);
  return fallback;
}

/**
 * Normalize listCandidateRows return value.
 * Incomplete complete-discovery objects fail closed.
 * Plain arrays (tests / fixtures) are treated as already-complete list rows.
 */
export function normalizeIncrementalListDiscoveryResult(listed) {
  if (Array.isArray(listed)) {
    return {
      ok: true,
      status: "COMPLETE_LIST_DISCOVERY",
      pagination_complete: true,
      list_rows: listed,
      termination_reason: "injected_array_assumed_complete"
    };
  }
  if (!listed || typeof listed !== "object") {
    return {
      ok: false,
      status: "CREATION_DISCOVERY_INCOMPLETE",
      pagination_complete: false,
      list_rows: [],
      termination_reason: "list_result_missing"
    };
  }
  if (
    listed.ok === false ||
    listed.pagination_complete === false ||
    listed.status === "CREATION_DISCOVERY_INCOMPLETE"
  ) {
    return {
      ok: false,
      status: listed.status || "CREATION_DISCOVERY_INCOMPLETE",
      pagination_complete: false,
      list_rows: [],
      termination_reason: listed.termination_reason || "incomplete_list_discovery",
      diagnostics: listed.diagnostics || null
    };
  }
  const rows = listed.list_rows || listed.candidate_rows || [];
  return {
    ok: true,
    status: listed.status || "COMPLETE_LIST_DISCOVERY",
    pagination_complete: listed.pagination_complete !== false,
    list_rows: Array.isArray(rows) ? rows : [],
    termination_reason: listed.termination_reason || null,
    diagnostics: listed.diagnostics || null
  };
}

/**
 * Post-write validation before cursor advance.
 */
export async function validateIncrementalLiveWriteResult({
  population,
  parentFullEpochId,
  discovery,
  exactJobs,
  brain,
  prepared,
  worksheet,
  ownerToken,
  assertOwner = null
} = {}) {
  if (typeof assertOwner === "function") {
    const owned = await assertOwner({ token: ownerToken, renew: true });
    if (!owned?.ok) {
      return { ok: false, status: owned?.code || "population_lock_lost", reason: "lock_lost_at_validation" };
    }
  }

  const parent = pickStr(parentFullEpochId);
  const currentParent = pickStr(population?.full_census_import_group_id);
  if (!parent || parent !== currentParent) {
    return {
      ok: false,
      status: "parent_full_epoch_mismatch",
      parent_full_epoch_id: parent,
      resolved_full_epoch_id: currentParent || null
    };
  }

  const expected = (discovery?.candidates || []).map((c) => String(c.source_job_id));
  const exactOkJobs = Array.isArray(exactJobs?.jobs) ? exactJobs.jobs : [];
  const failures = Array.isArray(exactJobs?.failures) ? exactJobs.failures : [];
  if (failures.length) {
    return { ok: false, status: "exact_fetch_had_failures", failures };
  }
  if (exactOkJobs.length !== expected.length) {
    return {
      ok: false,
      status: "exact_job_count_mismatch",
      expected: expected.length,
      fetched: exactOkJobs.length
    };
  }

  const writtenIds = new Set(
    (brain?.source_job_ids_written || exactOkJobs.map((j) => String(j.source_job_id))).map(String)
  );
  for (const id of expected) {
    if (!writtenIds.has(id) && Number(brain?.jobs_written) !== expected.length) {
      // Prefer explicit id list; fall back to count match when adapters only return count.
      if (!brain?.source_job_ids_written) {
        if (Number(brain?.jobs_written) !== expected.length) {
          return { ok: false, status: "brain_candidate_write_incomplete", missing: id };
        }
      } else {
        return { ok: false, status: "brain_candidate_write_incomplete", missing: id };
      }
    }
  }
  if (Array.isArray(brain?.source_job_ids_written)) {
    for (const id of expected) {
      if (!writtenIds.has(id)) {
        return { ok: false, status: "brain_candidate_write_incomplete", missing: id };
      }
    }
  }

  if (!prepared?.ok) return { ok: false, status: "prepared_facts_not_ok" };
  if (!worksheet?.ok) return { ok: false, status: "worksheet_facts_not_ok" };

  const cross =
    worksheet?.cross_job_removals ||
    worksheet?.writes?.cross_job_removals ||
    worksheet?.projected?.cross_job_worksheet_removals ||
    [];
  if (Array.isArray(cross) && cross.length > 0) {
    return { ok: false, status: "cross_job_worksheet_deletion", cross_job_removals: cross };
  }

  const currentRemovals =
    brain?.jobs_removed_from_current ??
    brain?.current_removals ??
    discovery?.classification?.jobs_removed_from_current?.length ??
    0;
  if (Number(currentRemovals) > 0) {
    return { ok: false, status: "incremental_current_removals_nonzero", current_removals: currentRemovals };
  }

  if (brain?.creates_new_full_epoch === true || brain?.watermark_advanced === true) {
    return { ok: false, status: "full_epoch_or_watermark_mutated" };
  }

  const watermarkForbidden = canAdvanceFullCensusWatermark({
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    complete: true,
    uncapped: true,
    importSucceeded: true
  });
  if (watermarkForbidden !== false) {
    return { ok: false, status: "watermark_gate_misconfigured" };
  }

  return {
    ok: true,
    status: "validated",
    parent_full_epoch_id: parent,
    current_removals: 0,
    cross_job_removals: 0,
    full_epoch_unchanged: true,
    full_watermark_advanced: false,
    account_rollups: prepared?.account_rollups || "deferred_remaining_optimization"
  };
}

/**
 * Build incremental import metadata for Brain (no migration).
 */
export function buildIncrementalImportMetadata({
  parentFullEpochId,
  window,
  discovery,
  runId = null
} = {}) {
  return {
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    parent_full_epoch_id: pickStr(parentFullEpochId) || null,
    incremental_strategy: MORAWARE_INCREMENTAL_STRATEGY,
    incremental_cursor_start: window?.cursor_start || null,
    incremental_cursor_end: window?.cursor_end || null,
    incremental_overlap_ms: window?.overlap_ms ?? null,
    jobs_discovered: discovery?.candidates?.length ?? 0,
    creation_window_candidates: discovery?.counts?.creation_window_candidates ?? null,
    explicit_candidates: discovery?.counts?.explicit_candidates ?? null,
    rolling_candidates: discovery?.counts?.rolling_candidates ?? null,
    deduplicated_candidates: discovery?.counts?.deduplicated_candidates ?? null,
    rolling_batch_size_selected: discovery?.rolling?.batch_size_selected ?? null,
    rolling_wrapped: discovery?.rolling?.wrapped ?? null,
    jobs_classified_updates: discovery?.classification?.existing_job_updates?.length ?? 0,
    jobs_classified_additions: discovery?.classification?.new_job_additions?.length ?? 0,
    absence_establishes_global_absence: false,
    creates_new_full_epoch: false,
    run_id: pickStr(runId) || null,
    view222_used: false,
    fuzzy_matching_used: false
  };
}

/**
 * Pure plan for dry-run / tests (no lock, no I/O beyond provided listRows).
 */
export function planMorawareIncrementalPopulation({
  population,
  cursor,
  listRows = [],
  extraSourceJobIds = [],
  exactJobs = [],
  existingWorksheetRowsByJobId = new Map(),
  now = new Date(),
  overlapMs = null,
  rollingBatchSize = null
} = {}) {
  const strategy = describeMorawareIncrementalStrategy();
  if (!population?.available || !population?.full_census_import_group_id) {
    return stageFail("full_census_not_ready", {
      strategy,
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      note: "Incremental requires an established FULL epoch (CURRENT_MORAWARE_JOB_SET authority)."
    });
  }

  const parentFullEpochId = String(population.full_census_import_group_id);
  const normalizedCursor = normalizeIncrementalCursor(cursor || {});
  const window = buildIncrementalDiscoveryWindow({
    cursor: normalizedCursor,
    now,
    parentFullEpochId,
    parentFullStartedAt: population.full_census_started_at,
    overlapMs
  });
  if (window?.ok === false || window?.status === "BOOTSTRAP_CURSOR_UNRESOLVED") {
    return stageFail(window?.status || "BOOTSTRAP_CURSOR_UNRESOLVED", {
      strategy,
      window,
      error: window?.error || null
    });
  }

  const currentIds = (population.current_source_job_ids || []).map(String);
  const batchSize = pickRollingBatchSize({ rollingBatchSize });
  const discovery = planIncrementalDiscovery({
    window,
    listRows,
    extraSourceJobIds,
    currentSourceJobIds: currentIds,
    rollingAfterSourceJobId: normalizedCursor.rolling.after_source_job_id,
    rollingBatchSize: batchSize
  });
  if (!discovery.ok) {
    return stageFail(discovery.status || "discovery_failed", { strategy, window, discovery });
  }

  const exactById = new Map(
    (exactJobs || []).map((j) => [String(j.source_job_id || ""), j]).filter(([id]) => id)
  );
  const jobsForRefresh = discovery.candidates
    .map((c) => exactById.get(c.source_job_id))
    .filter(Boolean);

  const jobFactsPlan = planIncrementalPreparedJobFactsRefresh({
    organizationId: population.organization_id,
    importGroupId: parentFullEpochId,
    jobs: jobsForRefresh,
    unchangedSourceJobIds: discovery.classification.current_jobs_absent_from_incremental
  });

  const worksheetPlan = planIncrementalWorksheetFactRefresh({
    organizationId: population.organization_id,
    importGroupId: parentFullEpochId,
    jobs: jobsForRefresh,
    existingRowsByJobId: existingWorksheetRowsByJobId
  });

  const metadata = buildIncrementalImportMetadata({
    parentFullEpochId,
    window,
    discovery
  });

  const cursorBefore = summarizeIncrementalCursorHealth(normalizedCursor, { now });
  const wouldAdvance = shouldAdvanceIncrementalCursor({ dryRun: true });
  const cursorAfterIfSuccess = wouldAdvance.advance
    ? summarizeIncrementalCursorHealth(
        buildAdvancedCursorState({
          previousCursor: normalizedCursor,
          window,
          parentFullEpochId,
          rollingBatch: discovery.rolling,
          successAt: now,
          jobsRefreshed: discovery.candidates.length
        }),
        { now }
      )
    : cursorBefore;

  return {
    ok: true,
    status: "planned",
    strategy: strategy.strategy,
    strategy_detail: strategy,
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    parent_full_epoch_id: parentFullEpochId,
    parent_full_started_at: population.full_census_started_at,
    full_census_scope_preserved: CENSUS_SCOPE_FULL,
    creates_new_full_epoch: false,
    window,
    rolling: discovery.rolling,
    counts: discovery.counts,
    creation_window_candidates: discovery.counts.creation_window_candidates,
    explicit_candidates: discovery.counts.explicit_candidates,
    rolling_candidates: discovery.counts.rolling_candidates,
    deduplicated_candidates: discovery.counts.deduplicated_candidates,
    discovery,
    metadata,
    brain: {
      would_write_jobs: jobsForRefresh.length,
      would_touch_source_job_ids: jobsForRefresh.map((j) => j.source_job_id),
      would_not_remove_absent_jobs: true,
      census_scope: CENSUS_SCOPE_INCREMENTAL
    },
    prepared_job_facts: jobFactsPlan,
    worksheet_facts: worksheetPlan,
    cursor_before: cursorBefore,
    cursor_after_if_success: cursorAfterIfSuccess,
    cursor_advance: wouldAdvance,
    estimated_writes: {
      brain_jobs: jobsForRefresh.length,
      prepared_job_facts: jobFactsPlan.rows?.length || 0,
      worksheet_upserts: worksheetPlan.upsert_rows?.length || 0,
      worksheet_deletes: (worksheetPlan.removal_plans || []).reduce(
        (n, p) => n + (p.remove_source_form_ids?.length || 0),
        0
      ),
      actual_writes: 0
    }
  };
}

/**
 * Run governed incremental population with injectable dependencies (testable).
 *
 * @param {object} options
 * @param {boolean} options.dryRun
 * @param {boolean} options.allowLivePopulation
 * @param {boolean} options.liveWrite
 * @param {object} options.deps injectable collaborators
 */
export async function runMorawareIncrementalPopulation(options = {}) {
  const startedAt = Date.now();
  const dryRun = options.dryRun === true;
  const liveWrite = options.liveWrite === true;
  const allowLivePopulation = options.allowLivePopulation === true;
  const organizationId = pickStr(options.organizationId);
  const now = options.now || new Date();
  const eventLog = [];
  const deps = options.deps || {};

  const strategy = describeMorawareIncrementalStrategy();

  if (!dryRun && !(liveWrite && allowLivePopulation)) {
    return {
      ok: false,
      status: "live_population_not_enabled",
      strategy: strategy.strategy,
      note: "Live incremental requires dryRun:false + liveWrite:true + allowLivePopulation:true (+ CLI/env gates).",
      event_log: eventLog,
      compute_ms: Date.now() - startedAt
    };
  }

  let ownerToken = pickStr(options.outerOwnerToken) || null;
  let acquiredLock = false;
  let stopHeartbeat = null;
  let cursorStore = deps.cursorStore || createMemoryIncrementalCursorStore();
  let previousCursor = null;
  let window = null;
  let stages = {
    discoveryOk: false,
    populationResolutionOk: false,
    exactFetchOk: false,
    brainImportOk: false,
    preparedFactsOk: false,
    worksheetFactsOk: false,
    validationOk: false,
    lockOwned: false
  };

  const acquire =
    deps.acquireLock ||
    (async ({ token, lockedBy, metadata }) =>
      acquireMorawarePopulationLock(deps.db, {
        ownerToken: token,
        lockedBy,
        ttlMs: MORAWARE_POPULATION_LOCK_LEASE_MS,
        metadata
      }));
  const release =
    deps.releaseLock ||
    (async ({ token }) => releaseMorawarePopulationLock(deps.db, { ownerToken: token }));
  const assertOwner =
    deps.assertOwner ||
    (async ({ token, renew = true }) =>
      assertMorawarePopulationLockOwner(deps.db, { ownerToken: token, renew }));

  try {
    // --- DRY RUN: plan only ---
    if (dryRun) {
      eventLog.push({ step: "dry_run_start" });
      previousCursor = await cursorStore.readCursor(organizationId);
      const population = await deps.resolvePopulation(organizationId);
      const listRows = (await deps.listCandidateRows?.({ window: null, dryRun: true })) || options.listRows || [];
      const plan = planMorawareIncrementalPopulation({
        population: {
          ...population,
          organization_id: organizationId || population?.organization_id,
          current_source_job_ids:
            population?.current_source_job_ids ||
            (await deps.listCurrentSourceJobIds?.(organizationId)) ||
            []
        },
        cursor: previousCursor,
        listRows,
        extraSourceJobIds: options.extraSourceJobIds || [],
        exactJobs: options.exactJobs || [],
        existingWorksheetRowsByJobId: options.existingWorksheetRowsByJobId || new Map(),
        now,
        overlapMs: options.overlapMs,
        rollingBatchSize: pickRollingBatchSize(options)
      });
      eventLog.push({ step: "dry_run_planned", ok: plan.ok });
      return {
        ...plan,
        dry_run: true,
        actual_writes: 0,
        moraware_calls: deps.morawareCallsMade?.() ?? 0,
        cursor: summarizeIncrementalCursorHealth(previousCursor, { now }),
        cursor_before: plan.cursor_before,
        cursor_after: plan.cursor_before,
        event_log: eventLog,
        lock: { acquired: false, released: false, name: MORAWARE_POPULATION_LOCK_NAME },
        compute_ms: Date.now() - startedAt
      };
    }

    // --- LIVE: lock BEFORE discovery/mutation ---
    eventLog.push({ step: "acquire_lock_before_discovery" });
    if (!ownerToken) {
      ownerToken = createMorawarePopulationLockOwnerToken();
      const acq = await acquire({
        token: ownerToken,
        lockedBy: options.lockedBy || `incremental@${pickStr(options.hostname) || "worker"}`,
        metadata: {
          purpose: "moraware_incremental_population",
          strategy: MORAWARE_INCREMENTAL_STRATEGY,
          organization_id: organizationId
        }
      });
      if (!acq?.acquired) {
        return {
          ok: false,
          status: "population_lock_busy",
          strategy: strategy.strategy,
          lock: acq?.lock || null,
          event_log: eventLog,
          compute_ms: Date.now() - startedAt
        };
      }
      acquiredLock = true;
      eventLog.push({ step: "lock_acquired", already_owned: Boolean(acq.already_owned) });
    } else {
      const asserted = await assertOwner({ token: ownerToken, renew: true });
      if (!asserted?.ok) {
        return {
          ok: false,
          status: asserted.code || "population_lock_denied",
          strategy: strategy.strategy,
          event_log: eventLog,
          compute_ms: Date.now() - startedAt
        };
      }
      eventLog.push({ step: "outer_owner_verified" });
    }
    stages.lockOwned = true;

    if (typeof deps.startHeartbeat === "function") {
      stopHeartbeat = deps.startHeartbeat({ ownerToken });
    } else if (deps.lockHeartbeatUrl && deps.lockSecret) {
      stopHeartbeat = startMorawarePopulationLockHeartbeat({
        url: deps.lockHeartbeatUrl,
        secret: deps.lockSecret,
        ownerToken,
        intervalMs: MORAWARE_POPULATION_LOCK_HEARTBEAT_MS
      });
    } else if (deps.db) {
      const id = setInterval(() => {
        renewMorawarePopulationLock(deps.db, { ownerToken }).catch(() => {});
      }, MORAWARE_POPULATION_LOCK_HEARTBEAT_MS);
      if (typeof id.unref === "function") id.unref();
      stopHeartbeat = () => clearInterval(id);
    }

    previousCursor = await cursorStore.readCursor(organizationId);
    const population = await deps.resolvePopulation(organizationId);
    if (!population?.available || !population?.full_census_import_group_id) {
      return finishFailure("full_census_not_ready");
    }
    stages.populationResolutionOk = true;
    const parentFullEpochId = String(population.full_census_import_group_id);
    window = buildIncrementalDiscoveryWindow({
      cursor: previousCursor,
      now,
      parentFullEpochId,
      parentFullStartedAt: population.full_census_started_at,
      overlapMs: options.overlapMs
    });
    if (window?.ok === false || window?.status === "BOOTSTRAP_CURSOR_UNRESOLVED") {
      return finishFailure(window?.status || "BOOTSTRAP_CURSOR_UNRESOLVED", { window });
    }
    eventLog.push({ step: "window_established", window });

    // Ownership check before source discovery
    {
      const owned = await assertOwner({ token: ownerToken, renew: true });
      if (!owned?.ok) {
        stages.lockOwned = false;
        return finishFailure(owned.code || "population_lock_lost");
      }
    }

    const listedRaw = await deps.listCandidateRows({ window, dryRun: false });
    const listed = normalizeIncrementalListDiscoveryResult(listedRaw);
    if (!listed.ok || listed.pagination_complete !== true) {
      return finishFailure(listed.status || "CREATION_DISCOVERY_INCOMPLETE", {
        list_discovery: listed,
        exact_fetch_started: false,
        mutation_started: false
      });
    }
    const listRows = listed.list_rows;
    eventLog.push({
      step: "list_discovery_complete",
      status: listed.status,
      rows: listRows.length,
      termination_reason: listed.termination_reason,
      rows_scanned: listed.diagnostics?.rows_scanned ?? null,
      pages_fetched: listed.diagnostics?.pages_fetched ?? null
    });

    const currentIds =
      population.current_source_job_ids ||
      (await deps.listCurrentSourceJobIds?.(organizationId)) ||
      [];
    const rollingBatchSize = pickRollingBatchSize(options);
    const discovery = planIncrementalDiscovery({
      window,
      listRows,
      extraSourceJobIds: options.extraSourceJobIds || [],
      currentSourceJobIds: currentIds,
      rollingAfterSourceJobId: normalizeIncrementalCursor(previousCursor).rolling.after_source_job_id,
      rollingBatchSize
    });
    if (!discovery.ok) return finishFailure(discovery.status || "discovery_failed", { discovery });
    stages.discoveryOk = true;
    eventLog.push({
      step: "discovery_ok",
      candidates: discovery.candidates.length,
      creation: discovery.counts.creation_window_candidates,
      explicit: discovery.counts.explicit_candidates,
      rolling: discovery.counts.rolling_candidates,
      additions: discovery.classification.new_job_additions.length
    });

    const liveCeiling = resolveLiveIncrementalCandidateCeiling(
      options.liveCandidateCeiling ?? options.live_candidate_ceiling
    );
    if (discovery.candidates.length > liveCeiling) {
      return finishFailure("LIVE_CANDIDATE_CEILING_EXCEEDED", {
        discovery,
        live_candidate_ceiling: liveCeiling,
        deduplicated_candidates: discovery.candidates.length,
        exact_fetch_started: false,
        mutation_started: false,
        note: "Deduplicated candidates exceed configured live safety ceiling. No silent truncation."
      });
    }
    eventLog.push({
      step: "live_candidate_ceiling_ok",
      candidates: discovery.candidates.length,
      ceiling: liveCeiling
    });

    const exactJobs = await deps.fetchExactJobs({
      sourceJobIds: discovery.candidates.map((c) => c.source_job_id),
      ownerToken
    });
    if (!exactJobs?.ok) return finishFailure(exactJobs?.status || "exact_fetch_failed", { exactJobs });
    stages.exactFetchOk = true;
    eventLog.push({ step: "exact_fetch_ok", jobs: exactJobs.jobs?.length || 0 });

    const metadata = buildIncrementalImportMetadata({
      parentFullEpochId,
      window,
      discovery,
      runId: options.runId || null
    });

    // Ownership check before Brain mutation
    {
      const owned = await assertOwner({ token: ownerToken, renew: true });
      if (!owned?.ok) {
        stages.lockOwned = false;
        return finishFailure(owned.code || "population_lock_lost");
      }
    }
    eventLog.push({ step: "assert_owner_before_brain" });

    const brain = await deps.importBrain({
      jobs: exactJobs.jobs,
      metadata,
      ownerToken,
      censusScope: CENSUS_SCOPE_INCREMENTAL,
      parentFullEpochId
    });
    if (!brain?.ok) return finishFailure(brain?.status || "brain_import_failed", { brain });
    stages.brainImportOk = true;
    eventLog.push({ step: "brain_import_ok", jobs: brain.jobs_written ?? exactJobs.jobs?.length });

    const prepared = await deps.refreshPreparedJobFacts({
      organizationId,
      importGroupId: parentFullEpochId,
      jobs: exactJobs.jobs,
      ownerToken
    });
    if (!prepared?.ok) return finishFailure(prepared?.status || "prepared_facts_failed", { prepared });
    stages.preparedFactsOk = true;
    eventLog.push({ step: "prepared_facts_ok", facts: prepared.facts_upserted ?? null });

    const worksheet = await deps.refreshWorksheetFacts({
      organizationId,
      importGroupId: parentFullEpochId,
      jobs: exactJobs.jobs,
      ownerToken
    });
    if (!worksheet?.ok) return finishFailure(worksheet?.status || "worksheet_facts_failed", { worksheet });
    stages.worksheetFactsOk = true;
    eventLog.push({
      step: "worksheet_facts_ok",
      upserts: worksheet.writes?.upserts ?? null,
      deletes: worksheet.writes?.deletes ?? null
    });

    const validation = deps.validate
      ? await deps.validate({
          population,
          parentFullEpochId,
          discovery,
          exactJobs,
          brain,
          prepared,
          worksheet,
          ownerToken,
          assertOwner: ({ token, renew }) => assertOwner({ token, renew })
        })
      : await validateIncrementalLiveWriteResult({
          population,
          parentFullEpochId,
          discovery,
          exactJobs,
          brain,
          prepared,
          worksheet,
          ownerToken,
          assertOwner: ({ token, renew }) => assertOwner({ token, renew })
        });
    if (!validation?.ok) return finishFailure(validation?.status || "validation_failed", { validation });
    stages.validationOk = true;
    eventLog.push({ step: "validation_ok", validation_status: validation.status || "validated" });

    const advanceDecision = shouldAdvanceIncrementalCursor({
      ...stages,
      dryRun: false
    });
    let cursorWrite = null;
    if (advanceDecision.advance) {
      const nextCursor = buildAdvancedCursorState({
        previousCursor,
        window,
        parentFullEpochId,
        rollingBatch: discovery.rolling,
        successAt: now,
        runId: options.runId || null,
        jobsRefreshed: exactJobs.jobs?.length || 0
      });
      cursorWrite = await cursorStore.writeCursor(organizationId, nextCursor, { advance: true });
      eventLog.push({
        step: "cursor_advanced",
        advanced_to: nextCursor.advanced_to,
        rolling_after_source_job_id: nextCursor.rolling.after_source_job_id,
        rolling_wrapped: Boolean(discovery.rolling?.wrapped),
        rolling_cycle_count: nextCursor.rolling.cycle_count
      });
    } else {
      eventLog.push({ step: "cursor_not_advanced", reason: advanceDecision.reason });
    }

    return {
      ok: true,
      status: "incremental_success",
      strategy: strategy.strategy,
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      parent_full_epoch_id: parentFullEpochId,
      creates_new_full_epoch: false,
      window,
      rolling: discovery.rolling,
      counts: discovery.counts,
      discovery,
      metadata,
      brain,
      prepared,
      worksheet,
      validation,
      cursor_advance: advanceDecision,
      cursor: summarizeIncrementalCursorHealth(cursorWrite?.cursor || previousCursor, { now }),
      cursor_before: summarizeIncrementalCursorHealth(previousCursor, { now }),
      owner_token_redacted: redactToken(ownerToken),
      lock: {
        name: MORAWARE_POPULATION_LOCK_NAME,
        acquired: acquiredLock,
        owned: true
      },
      event_log: eventLog,
      stages,
      compute_ms: Date.now() - startedAt
    };
  } catch (e) {
    eventLog.push({ step: "exception", error: String(e?.message || e) });
    return finishFailure("exception", { error: String(e?.message || e) });
  } finally {
    try {
      stopHeartbeat?.();
    } catch {
      /* ignore */
    }
    if (acquiredLock && ownerToken) {
      try {
        const rel = await release({ token: ownerToken });
        eventLog.push({ step: "lock_released", released: Boolean(rel?.released), reason: rel?.reason || null });
      } catch (e) {
        eventLog.push({ step: "lock_release_error", error: String(e?.message || e) });
      }
    } else if (ownerToken && !acquiredLock) {
      eventLog.push({
        step: "outer_lock_not_released",
        note: "Outer caller remains responsible for releasing moraware_population."
      });
    }
  }

  async function finishFailure(status, extra = {}) {
    stages.lockOwned = stages.lockOwned && Boolean(ownerToken);
    const decision = shouldAdvanceIncrementalCursor({ ...stages, dryRun: false });
    try {
      if (previousCursor || organizationId) {
        const failed = buildFailedCursorAttemptState({
          previousCursor: previousCursor || {},
          failureReason: status,
          attemptAt: now
        });
        await cursorStore.writeCursor(organizationId, failed, { advance: false });
      }
    } catch (e) {
      eventLog.push({ step: "cursor_failure_annotate_error", error: String(e?.message || e) });
    }
    eventLog.push({ step: "failed", status, cursor_advance: decision });
    return {
      ok: false,
      status,
      strategy: strategy.strategy,
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      window,
      cursor_advance: decision,
      cursor: summarizeIncrementalCursorHealth(previousCursor, { now }),
      owner_token_redacted: redactToken(ownerToken),
      lock: {
        name: MORAWARE_POPULATION_LOCK_NAME,
        acquired: acquiredLock,
        owned: stages.lockOwned
      },
      event_log: eventLog,
      stages,
      compute_ms: Date.now() - startedAt,
      ...extra
    };
  }
}

function redactToken(token) {
  const s = pickStr(token);
  if (!s) return null;
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export {
  MORAWARE_POPULATION_LOCK_NAME,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS,
  CENSUS_SCOPE_INCREMENTAL,
  CENSUS_SCOPE_FULL
};
