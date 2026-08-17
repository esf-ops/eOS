/**
 * Incremental population health summary (no UI).
 * Prefers existing sync-run + cursor config surfaces — no migration.
 */

import {
  CENSUS_SCOPE_FULL,
  CENSUS_SCOPE_INCREMENTAL,
  pickCensusScope,
  resolveCurrentMorawarePopulation
} from "./morawareCurrentPopulation.mjs";
import {
  createSupabaseIncrementalCursorStore,
  summarizeIncrementalCursorHealth
} from "./morawareIncrementalCursor.mjs";
import { describeMorawareIncrementalStrategy } from "./morawareIncrementalStrategy.mjs";
import { MORAWARE_POPULATION_LOCK_NAME } from "./morawarePopulationLock.mjs";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function metaOf(run) {
  return run?.metadata && typeof run.metadata === "object" ? run.metadata : {};
}

/**
 * Summarize last FULL / last incremental from recent successful sync runs.
 */
export function summarizeIncrementalRunsFromSyncRows(runs = []) {
  let lastFull = null;
  let lastIncremental = null;
  for (const run of Array.isArray(runs) ? runs : []) {
    if (String(run?.status || "").toLowerCase() !== "success") continue;
    const scope = pickCensusScope(metaOf(run).census_scope);
    if (scope === CENSUS_SCOPE_FULL && !lastFull) lastFull = run;
    if (scope === CENSUS_SCOPE_INCREMENTAL && !lastIncremental) lastIncremental = run;
    if (lastFull && lastIncremental) break;
  }
  return {
    last_successful_full: lastFull
      ? {
          sync_run_id: lastFull.id || null,
          finished_at: lastFull.finished_at || null,
          import_group_id: metaOf(lastFull).import_group_id || null,
          census_scope: CENSUS_SCOPE_FULL
        }
      : null,
    last_successful_incremental: lastIncremental
      ? {
          sync_run_id: lastIncremental.id || null,
          finished_at: lastIncremental.finished_at || null,
          import_group_id: metaOf(lastIncremental).import_group_id || null,
          parent_full_epoch_id: metaOf(lastIncremental).parent_full_epoch_id || null,
          jobs_discovered: metaOf(lastIncremental).jobs_discovered ?? null,
          jobs_refreshed: metaOf(lastIncremental).jobs_classified_updates ?? null,
          census_scope: CENSUS_SCOPE_INCREMENTAL,
          incremental_failure: false
        }
      : null
  };
}

export async function loadMorawarePopulationLockStatus(db) {
  if (!db) return { lock_name: MORAWARE_POPULATION_LOCK_NAME, present: false, active: false };
  const res = await db
    .from("eos_sync_locks")
    .select("lock_name,locked_at,locked_by,expires_at,metadata")
    .eq("lock_name", MORAWARE_POPULATION_LOCK_NAME)
    .limit(1);
  if (res.error) throw new Error(res.error.message || String(res.error));
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!row) return { lock_name: MORAWARE_POPULATION_LOCK_NAME, present: false, active: false };
  const exp = row.expires_at ? Date.parse(String(row.expires_at)) : NaN;
  const active = Number.isFinite(exp) && exp > Date.now();
  const owner = pickStr(row.locked_by);
  return {
    lock_name: MORAWARE_POPULATION_LOCK_NAME,
    present: true,
    active,
    locked_at: row.locked_at || null,
    expires_at: row.expires_at || null,
    locked_by_redacted: owner ? `${owner.slice(0, 8)}…` : null,
    locked_by_label: row.metadata?.locked_by_label || null
  };
}

/**
 * Compose incremental health block for admin/status surfaces.
 */
export async function buildMorawareIncrementalHealth(db, organizationId, { recentRuns = null } = {}) {
  const strategy = describeMorawareIncrementalStrategy();
  const org = pickStr(organizationId);
  let population = null;
  let cursorHealth = summarizeIncrementalCursorHealth({});
  let lock = { lock_name: MORAWARE_POPULATION_LOCK_NAME, present: false, active: false };
  let runs = { last_successful_full: null, last_successful_incremental: null };

  if (db && org) {
    try {
      population = await resolveCurrentMorawarePopulation(db, org);
    } catch {
      population = null;
    }
    try {
      const store = createSupabaseIncrementalCursorStore(db);
      cursorHealth = summarizeIncrementalCursorHealth(await store.readCursor(org));
    } catch {
      /* cursor row may not exist yet */
    }
    try {
      lock = await loadMorawarePopulationLockStatus(db);
    } catch {
      /* ignore */
    }
    if (!recentRuns) {
      try {
        let q = db
          .from("moraware_sync_runs")
          .select("id,status,finished_at,mode,metadata")
          .eq("status", "success")
          .order("finished_at", { ascending: false })
          .limit(40);
        q = q.eq("organization_id", org);
        const res = await q;
        if (!res.error) recentRuns = res.data || [];
      } catch {
        recentRuns = [];
      }
    }
    runs = summarizeIncrementalRunsFromSyncRows(recentRuns || []);
  }

  return {
    strategy: strategy.strategy,
    strategy_limits: strategy.limits,
    not_claimed: strategy.not_claimed,
    current_full_epoch_id: population?.full_census_import_group_id || null,
    current_full_started_at: population?.full_census_started_at || null,
    last_successful_full: runs.last_successful_full,
    last_successful_incremental: runs.last_successful_incremental,
    incremental_cursor: cursorHealth,
    creation_cursor_age_seconds: cursorHealth.creation_cursor?.cursor_age_seconds ?? cursorHealth.cursor_age_seconds,
    incremental_cursor_age_seconds: cursorHealth.cursor_age_seconds,
    rolling_cursor_position: cursorHealth.rolling_cursor?.after_source_job_id ?? null,
    rolling_batch_size: cursorHealth.rolling_cursor?.last_batch_size ?? strategy.default_rolling_batch_size,
    rolling_cycle_count: cursorHealth.rolling_cursor?.cycle_count ?? 0,
    rolling_last_wrapped: cursorHealth.rolling_cursor?.last_wrapped ?? false,
    last_successful_rolling_refresh: cursorHealth.rolling_cursor?.last_success_at ?? null,
    jobs_refreshed_last_incremental: cursorHealth.jobs_refreshed_last_success,
    last_worksheet_refresh_hint:
      runs.last_successful_incremental?.finished_at || cursorHealth.last_success_at || null,
    incremental_failure: Boolean(cursorHealth.last_failure_at && !cursorHealth.last_success_at) ||
      Boolean(
        cursorHealth.last_failure_at &&
          cursorHealth.last_success_at &&
          Date.parse(cursorHealth.last_failure_at) > Date.parse(cursorHealth.last_success_at)
      ),
    last_failure_reason: cursorHealth.last_failure_reason,
    lock_status: lock,
    population_available: Boolean(population?.available)
  };
}
