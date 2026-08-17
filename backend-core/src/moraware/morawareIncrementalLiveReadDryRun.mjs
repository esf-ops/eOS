/**
 * Live-read dry-run orchestrator for hybrid incremental population.
 *
 * READS: Moraware (canonical) + Supabase (population/cursor/worksheet facts).
 * WRITES: none — mutation adapters are absent (not merely disabled).
 */

import {
  buildAdvancedCursorState,
  createMemoryIncrementalCursorStore,
  normalizeIncrementalCursor,
  resolveIncrementalCreationWindowBootstrap,
  summarizeIncrementalCursorHealth
} from "./morawareIncrementalCursor.mjs";
import { planIncrementalDiscovery } from "./morawareIncrementalDiscovery.mjs";
import {
  planMorawareIncrementalPopulation,
  buildIncrementalImportMetadata
} from "./morawareIncrementalPopulation.mjs";
import { planIncrementalPreparedJobFactsRefresh } from "./morawareIncrementalPreparedFacts.mjs";
import {
  createMorawareIncrementalReadClient,
  fetchExactJobsViaCanonicalReads,
  listCandidateRowsViaCanonicalProcessPagedQuery,
  MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP
} from "./morawareIncrementalReadAdapter.mjs";
import {
  describeMorawareIncrementalStrategy,
  MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE,
  resolveRollingBatchSize
} from "./morawareIncrementalStrategy.mjs";
import {
  planIncrementalWorksheetFactRefresh,
  isAuthoritativeCompleteFormsPayload
} from "./morawareJobWorksheetPreparedFacts.mjs";
import { CENSUS_SCOPE_INCREMENTAL } from "./morawareCurrentPopulation.mjs";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function refuseMutation(name) {
  return async () => {
    throw new Error(`DRY_RUN_MUTATION_REFUSED: ${name} is not available in live-read dry-run`);
  };
}

/**
 * Build a deps object that has NO mutation capabilities.
 */
export function createLiveReadDryRunDeps({
  listCandidateRows,
  fetchExactJobs,
  resolvePopulation,
  listCurrentSourceJobIds = null,
  loadExistingWorksheetRowsByJobId = null,
  readCursor = null
} = {}) {
  return {
    mode: "live_read_dry_run",
    listCandidateRows,
    fetchExactJobs,
    resolvePopulation,
    listCurrentSourceJobIds,
    loadExistingWorksheetRowsByJobId,
    readCursor,
    // Explicit absences — calling these must throw
    importBrain: refuseMutation("importBrain"),
    refreshPreparedJobFacts: refuseMutation("refreshPreparedJobFacts"),
    refreshWorksheetFacts: refuseMutation("refreshWorksheetFacts"),
    writeCursor: refuseMutation("writeCursor"),
    acquireLock: refuseMutation("acquireLock"),
    releaseLock: refuseMutation("releaseLock"),
    assertOwner: refuseMutation("assertOwner"),
    cursorStore: {
      readCursor: readCursor || (async () => normalizeIncrementalCursor({})),
      writeCursor: refuseMutation("cursorStore.writeCursor")
    },
    morawareCallsMade: () => null
  };
}

/**
 * Enforce candidate cap BEFORE exact fetch.
 */
export function enforceDryRunCandidateCap(deduplicatedCount, cap = MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP) {
  const n = Number(deduplicatedCount) || 0;
  const limit = Number(cap) || MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP;
  if (n > limit) {
    return {
      ok: false,
      status: "DRY_RUN_CANDIDATE_CAP_EXCEEDED",
      deduplicated_candidates: n,
      cap: limit,
      exact_fetch_started: false,
      note: `Deduplicated candidates ${n} exceed hard cap ${limit}. Exact Moraware refresh was not started.`
    };
  }
  return { ok: true, status: "within_cap", deduplicated_candidates: n, cap: limit };
}

/**
 * Run live-read dry-run (projection only).
 *
 * @param {object} options
 * @param {boolean} options.allowMorawareRead — must be true to contact Moraware
 */
export async function runMorawareIncrementalLiveReadDryRun(options = {}) {
  const startedAt = Date.now();
  const strategy = describeMorawareIncrementalStrategy();
  const organizationId = pickStr(options.organizationId);
  const now = options.now || new Date();
  const wallClock =
    typeof options.clock === "function" ? options.clock : () => new Date();
  const eventLog = [];
  const allowMorawareRead = options.allowMorawareRead === true;
  const rollingBatchSize = resolveRollingBatchSize(
    options.rollingBatchSize,
    MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE
  );
  const candidateCap = MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP;

  if (!allowMorawareRead) {
    return {
      ok: false,
      status: "moraware_read_refused",
      strategy: strategy.strategy,
      note: "Pass allowMorawareRead:true / --allow-moraware-read for canonical Moraware READS only.",
      exact_fetch_started: false,
      actual_writes: {
        supabase: 0,
        cursor: 0,
        brain: 0,
        prepared_facts: 0,
        worksheet_facts: 0,
        population_lock: 0,
        moraware: 0
      },
      compute_ms: Date.now() - startedAt
    };
  }

  const resolvePopulation = options.resolvePopulation;
  const readCursor = options.readCursor;
  if (typeof resolvePopulation !== "function") {
    return {
      ok: false,
      status: "FIXES_REQUIRED",
      error: "resolvePopulation reader required",
      compute_ms: Date.now() - startedAt
    };
  }

  eventLog.push({ step: "resolve_population_readonly" });
  const population = await resolvePopulation(organizationId);
  if (!population?.available || !population?.full_census_import_group_id) {
    return {
      ok: false,
      status: "full_census_not_ready",
      strategy: strategy.strategy,
      event_log: eventLog,
      compute_ms: Date.now() - startedAt
    };
  }

  const parentFullEpochId = String(population.full_census_import_group_id);
  const cursorRaw =
    typeof readCursor === "function" ? await readCursor(organizationId) : options.cursor || {};
  const cursor = normalizeIncrementalCursor(cursorRaw);

  const bootstrap = resolveIncrementalCreationWindowBootstrap({
    cursor,
    parentFullStartedAt: population.full_census_started_at,
    parentFullEpochId,
    now,
    overlapMs: options.overlapMs
  });
  if (!bootstrap.ok) {
    return {
      ok: false,
      status: "BOOTSTRAP_CURSOR_UNRESOLVED",
      strategy: strategy.strategy,
      error: bootstrap.error,
      cursor_before: summarizeIncrementalCursorHealth(cursor, { now }),
      event_log: eventLog,
      exact_fetch_started: false,
      actual_writes: zeroWrites(),
      compute_ms: Date.now() - startedAt
    };
  }

  const window = {
    ok: true,
    cursor_start: bootstrap.cursor_start,
    cursor_end: bootstrap.cursor_end,
    overlap_ms: bootstrap.overlap_ms,
    prior_advanced_to: bootstrap.prior_advanced_to,
    parent_full_epoch_id: parentFullEpochId,
    bootstrap: bootstrap.bootstrap,
    projected_advanced_to_after_success: bootstrap.projected_advanced_to_after_success,
    status: bootstrap.status,
    note: bootstrap.note
  };
  eventLog.push({ step: "window_resolved", window });

  // --- Moraware list READ (complete traversal required) ---
  const client =
    options.client ||
    createMorawareIncrementalReadClient({ clientFactory: options.clientFactory || null });
  eventLog.push({ step: "list_candidate_rows_start" });
  const creationWindowStartMs = Date.parse(window.cursor_start);
  const creationWindowEndMs = Date.parse(window.cursor_end);
  const listed = await (options.listCandidateRows
    ? options.listCandidateRows({
        window,
        client,
        creationWindowStartMs,
        creationWindowEndMs
      })
    : listCandidateRowsViaCanonicalProcessPagedQuery({
        client,
        listImpl: options.listImpl || null,
        fetchPage: options.fetchPage || null,
        processIds: options.processIds || null,
        creationWindowStartMs: Number.isFinite(creationWindowStartMs) ? creationWindowStartMs : null,
        creationWindowEndMs: Number.isFinite(creationWindowEndMs) ? creationWindowEndMs : null,
        safetyMaxPagesPerProcess: options.safetyMaxPagesPerProcess ?? null,
        safetyMaxRowsScanned: options.safetyMaxRowsScanned ?? null
      }));

  const listComplete =
    listed?.ok === true &&
    listed?.pagination_complete !== false &&
    listed?.status !== "CREATION_DISCOVERY_INCOMPLETE";

  if (!listComplete) {
    eventLog.push({
      step: "list_candidate_rows_incomplete",
      status: listed?.status || "CREATION_DISCOVERY_INCOMPLETE",
      termination_reason: listed?.termination_reason || null,
      diagnostics: listed?.diagnostics || null
    });
    return {
      ok: false,
      status: "CREATION_DISCOVERY_INCOMPLETE",
      strategy: strategy.strategy,
      parent_full_epoch_id: parentFullEpochId,
      window,
      cursor_before: summarizeIncrementalCursorHealth(cursor, { now }),
      list_discovery: {
        status: listed?.status || "CREATION_DISCOVERY_INCOMPLETE",
        pagination_complete: false,
        termination_reason: listed?.termination_reason || null,
        diagnostics: listed?.diagnostics || null,
        canonical_path: listed?.canonical_path || null
      },
      exact_fetch_started: false,
      projected_creation_cursor_after_success: null,
      note: "Partial list traversal is not authoritative creation discovery. No exact refresh. No cursor advance.",
      actual_writes: zeroWrites(),
      event_log: eventLog,
      compute_ms: Date.now() - startedAt
    };
  }

  const listRows = listed.list_rows || [];
  eventLog.push({
    step: "list_candidate_rows_ok",
    status: listed.status || "COMPLETE_LIST_DISCOVERY",
    rows: listRows.length,
    rows_scanned: listed.diagnostics?.rows_scanned ?? null,
    pages_fetched: listed.diagnostics?.pages_fetched ?? null,
    pagination_complete: true,
    termination_reason: listed.termination_reason || listed.diagnostics?.termination_reason || null
  });

  const currentIds =
    population.current_source_job_ids ||
    (typeof options.listCurrentSourceJobIds === "function"
      ? await options.listCurrentSourceJobIds(organizationId)
      : []) ||
    [];

  const discovery = planIncrementalDiscovery({
    window,
    listRows,
    extraSourceJobIds: options.extraSourceJobIds || [],
    currentSourceJobIds: currentIds,
    rollingAfterSourceJobId: cursor.rolling.after_source_job_id,
    rollingBatchSize
  });
  if (!discovery.ok) {
    return {
      ok: false,
      status: discovery.status || "discovery_failed",
      discovery,
      event_log: eventLog,
      exact_fetch_started: false,
      actual_writes: zeroWrites(),
      compute_ms: Date.now() - startedAt
    };
  }

  const creationSet = new Set(discovery.creation_window_job_ids || []);
  const explicitSet = new Set(discovery.explicit_job_ids || []);
  const rollingSet = new Set(discovery.rolling_job_ids || []);
  const unionBefore = creationSet.size + explicitSet.size + rollingSet.size;
  const deduped = discovery.candidates.length;
  const duplicateCandidatesRemoved = Math.max(0, unionBefore - deduped);

  const capCheck = enforceDryRunCandidateCap(deduped, candidateCap);
  if (!capCheck.ok) {
    return {
      ok: false,
      status: "DRY_RUN_CANDIDATE_CAP_EXCEEDED",
      strategy: strategy.strategy,
      parent_full_epoch_id: parentFullEpochId,
      window,
      rolling: discovery.rolling,
      counts: {
        ...discovery.counts,
        duplicate_candidates_removed: duplicateCandidatesRemoved,
        existing_current_candidates: discovery.classification.existing_job_updates.length,
        newly_discovered_candidates: discovery.classification.new_job_additions.length
      },
      creation_window_candidates: discovery.counts.creation_window_candidates,
      explicit_candidates: discovery.counts.explicit_candidates,
      rolling_candidates: discovery.counts.rolling_candidates,
      deduplicated_candidates: deduped,
      cap: candidateCap,
      exact_fetch_started: false,
      cursor_before: summarizeIncrementalCursorHealth(cursor, { now }),
      projected_creation_cursor_after_success: bootstrap.projected_advanced_to_after_success,
      projected_rolling_cursor_after_success: discovery.rolling?.next_after_source_job_id ?? null,
      actual_writes: zeroWrites(),
      event_log: eventLog,
      compute_ms: Date.now() - startedAt
    };
  }

  // --- Exact fetch (only when <= cap) ---
  eventLog.push({ step: "exact_fetch_start", candidates: deduped });
  const exact =
    typeof options.fetchExactJobs === "function"
      ? await options.fetchExactJobs({
          client,
          sourceJobIds: discovery.candidates.map((c) => c.source_job_id)
        })
      : await fetchExactJobsViaCanonicalReads({
          client,
          sourceJobIds: discovery.candidates.map((c) => c.source_job_id)
        });
  eventLog.push({
    step: "exact_fetch_done",
    fetched: exact.exact_jobs_fetched ?? exact.jobs?.length ?? 0,
    failures: exact.failures?.length ?? 0
  });

  const exactJobs = exact.jobs || [];
  const existingWorksheetRowsByJobId =
    typeof options.loadExistingWorksheetRowsByJobId === "function"
      ? await options.loadExistingWorksheetRowsByJobId({
          organizationId,
          importGroupId: parentFullEpochId,
          sourceJobIds: exactJobs.map((j) => j.source_job_id)
        })
      : options.existingWorksheetRowsByJobId || new Map();

  const worksheetPlan = planIncrementalWorksheetFactRefresh({
    organizationId,
    importGroupId: parentFullEpochId,
    jobs: exactJobs,
    existingRowsByJobId: existingWorksheetRowsByJobId
  });

  const preparedPlan = planIncrementalPreparedJobFactsRefresh({
    organizationId,
    importGroupId: parentFullEpochId,
    jobs: exactJobs,
    unchangedSourceJobIds: discovery.classification.current_jobs_absent_from_incremental
  });

  const projectedRemovals = (worksheetPlan.removal_plans || []).flatMap((p) =>
    (p.remove_source_form_ids || []).map((formId) => ({
      organization_id: p.organization_id,
      import_group_id: p.import_group_id,
      source_job_id: p.source_job_id,
      source_form_id: formId
    }))
  );
  const crossJobRemovals = projectedRemovals.filter((r) => {
    const touched = new Set(worksheetPlan.jobs_touched || []);
    return !touched.has(String(r.source_job_id));
  });

  const projectedRollingAfter = buildAdvancedCursorState({
    previousCursor: cursor,
    window,
    parentFullEpochId,
    rollingBatch: discovery.rolling,
    // Projected completion wall-clock — not frozen window_end (advanced_to still uses window)
    successAt: wallClock(),
    jobsRefreshed: exactJobs.length
  });

  // Prove mutation deps refuse if someone tries
  const dryDeps = createLiveReadDryRunDeps({
    listCandidateRows: async () => listRows,
    fetchExactJobs: async () => exact,
    resolvePopulation: async () => population,
    readCursor: async () => cursor
  });

  return {
    ok: true,
    status: "LIVE_READ_DRY_RUN_PLANNED",
    dry_run: true,
    allow_moraware_read: true,
    strategy: strategy.strategy,
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    parent_full_epoch_id: parentFullEpochId,
    creates_new_full_epoch: false,
    window,
    rolling: discovery.rolling,
    cursor_before: summarizeIncrementalCursorHealth(cursor, { now }),
    projected_creation_cursor_after_success: bootstrap.projected_advanced_to_after_success,
    projected_rolling_cursor_after_success: projectedRollingAfter.rolling.after_source_job_id,
    projected_cursor_after_if_success: summarizeIncrementalCursorHealth(projectedRollingAfter, { now }),
    counts: {
      creation_window_candidates: discovery.counts.creation_window_candidates,
      explicit_candidates: discovery.counts.explicit_candidates,
      rolling_candidates: discovery.counts.rolling_candidates,
      duplicate_candidates_removed: duplicateCandidatesRemoved,
      deduplicated_candidates: deduped,
      existing_current_candidates: discovery.classification.existing_job_updates.length,
      newly_discovered_candidates: discovery.classification.new_job_additions.length,
      current_population_size: discovery.counts.current_population_size
    },
    discovery,
    exact: {
      exact_jobs_fetched: exact.exact_jobs_fetched ?? exactJobs.length,
      exact_fetch_failures: exact.failures || [],
      forms_fetched: exact.forms_fetched ?? null,
      activities_fetched: exact.activities_fetched ?? null,
      jobs_with_complete_authoritative_forms: exact.jobs_with_complete_authoritative_forms ?? null,
      jobs_with_incomplete_forms: exact.jobs_with_incomplete_forms ?? null,
      canonical_paths: exact.jobs?.[0] ? undefined : null
    },
    new_jobs_discovered: discovery.classification.new_job_additions,
    existing_jobs_refreshed: discovery.classification.existing_job_updates,
    projected: {
      brain_job_upserts: exactJobs.length,
      brain_new_jobs: discovery.classification.new_job_additions.length,
      brain_existing_refreshes: discovery.classification.existing_job_updates.filter((id) =>
        exactJobs.some((j) => String(j.source_job_id) === String(id))
      ).length,
      unrelated_jobs_affected: 0,
      jobs_removed_from_current: 0,
      absence_establishes_deletion: false,
      prepared_job_fact_upserts: preparedPlan.rows?.length || 0,
      account_rollups: preparedPlan.account_rollups,
      full_prepared_rebuild_required: false,
      worksheet_upserts: worksheetPlan.upsert_rows?.length || 0,
      worksheet_projected_removals: projectedRemovals,
      cross_job_worksheet_removals: crossJobRemovals,
      metadata: buildIncrementalImportMetadata({
        parentFullEpochId,
        window,
        discovery
      })
    },
    worksheet_plan: {
      jobs_touched: worksheetPlan.jobs_touched,
      jobs_skipped_incomplete_forms: worksheetPlan.jobs_skipped_incomplete_forms,
      import_group_id: worksheetPlan.import_group_id
    },
    mutation_guards: {
      importBrain_throws: true,
      writeCursor_throws: true,
      acquireLock_throws: true,
      deps_mode: dryDeps.mode
    },
    exact_fetch_started: true,
    actual_writes: zeroWrites(),
    event_log: eventLog,
    view222_used: false,
    compute_ms: Date.now() - startedAt
  };
}

function zeroWrites() {
  return {
    supabase: 0,
    cursor: 0,
    brain: 0,
    prepared_facts: 0,
    worksheet_facts: 0,
    population_lock: 0,
    moraware: 0
  };
}

export {
  MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP,
  isAuthoritativeCompleteFormsPayload,
  planMorawareIncrementalPopulation,
  createMemoryIncrementalCursorStore
};
