/**
 * Durable incremental cursor: creation-window position + rolling CURRENT refresh.
 *
 * Stored in organization_integration_configs.config (existing table — no migration).
 *
 * A. creation discovery: advanced_to + overlap_ms
 * B. rolling refresh: last completed source_job_id + cycle metadata
 *
 * creationDate advanced_to does NOT imply existing-job refresh is complete.
 * Both positions advance ONLY after complete governed success.
 */

import {
  MORAWARE_INCREMENTAL_CURSOR_INTEGRATION_KEY,
  MORAWARE_INCREMENTAL_CURSOR_KIND,
  MORAWARE_INCREMENTAL_DEFAULT_OVERLAP_MS,
  MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE,
  MORAWARE_INCREMENTAL_STRATEGY,
  MORAWARE_INCREMENTAL_STRATEGY_LEGACY_CREATION_ONLY,
  resolveRollingBatchSize
} from "./morawareIncrementalStrategy.mjs";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function toIsoOrNull(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeStrategyName(raw) {
  const s = pickStr(raw);
  if (!s || s === MORAWARE_INCREMENTAL_STRATEGY_LEGACY_CREATION_ONLY) {
    return MORAWARE_INCREMENTAL_STRATEGY;
  }
  return s;
}

/**
 * Normalize cursor record. Empty / missing rolling fields bootstrap at start of CURRENT set.
 */
export function normalizeIncrementalCursor(raw = {}) {
  const rolling =
    raw.rolling && typeof raw.rolling === "object"
      ? raw.rolling
      : {
          after_source_job_id: raw.rolling_after_source_job_id,
          cycle_count: raw.rolling_cycle_count,
          last_batch_size: raw.rolling_last_batch_size,
          last_batch_start_source_job_id: raw.rolling_last_batch_start_source_job_id,
          last_batch_end_source_job_id: raw.rolling_last_batch_end_source_job_id,
          last_success_at: raw.rolling_last_success_at,
          last_wrapped: raw.rolling_last_wrapped
        };

  return {
    strategy: normalizeStrategyName(raw.strategy),
    cursor_kind: pickStr(raw.cursor_kind) || MORAWARE_INCREMENTAL_CURSOR_KIND,
    parent_full_epoch_id: pickStr(raw.parent_full_epoch_id) || null,
    /** Creation-window high-water (ISO). Not proof that existing jobs are fresh. */
    advanced_to: toIsoOrNull(raw.advanced_to),
    last_success_at: toIsoOrNull(raw.last_success_at),
    last_attempt_at: toIsoOrNull(raw.last_attempt_at),
    last_failure_at: toIsoOrNull(raw.last_failure_at),
    last_failure_reason: pickStr(raw.last_failure_reason) || null,
    last_run_id: pickStr(raw.last_run_id) || null,
    jobs_refreshed_last_success: Number.isFinite(Number(raw.jobs_refreshed_last_success))
      ? Number(raw.jobs_refreshed_last_success)
      : null,
    overlap_ms: Number.isFinite(Number(raw.overlap_ms))
      ? Math.max(0, Number(raw.overlap_ms))
      : MORAWARE_INCREMENTAL_DEFAULT_OVERLAP_MS,
    rolling: {
      /** Exclusive resume token: next batch starts after this source_job_id in sorted CURRENT. */
      after_source_job_id: pickStr(rolling.after_source_job_id) || null,
      cycle_count: Number.isFinite(Number(rolling.cycle_count)) ? Number(rolling.cycle_count) : 0,
      last_batch_size: Number.isFinite(Number(rolling.last_batch_size))
        ? Number(rolling.last_batch_size)
        : null,
      last_batch_start_source_job_id: pickStr(rolling.last_batch_start_source_job_id) || null,
      last_batch_end_source_job_id: pickStr(rolling.last_batch_end_source_job_id) || null,
      last_success_at: toIsoOrNull(rolling.last_success_at),
      last_wrapped: rolling.last_wrapped === true
    },
    version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1
  };
}

/**
 * Resolve the creation-window bootstrap anchor when advanced_to is null.
 *
 * Preferred: latest successful complete FULL census started_at − overlap.
 * Never: beginning of history / all jobs.
 * If FULL boundary missing → BOOTSTRAP_CURSOR_UNRESOLVED.
 */
export function resolveIncrementalCreationWindowBootstrap({
  cursor,
  parentFullStartedAt = null,
  parentFullEpochId = null,
  now = new Date(),
  overlapMs = null
} = {}) {
  const c = normalizeIncrementalCursor(cursor || {});
  const overlap =
    overlapMs != null && Number.isFinite(Number(overlapMs))
      ? Math.max(0, Number(overlapMs))
      : c.overlap_ms;
  const nowIso = toIsoOrNull(now) || new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  if (c.advanced_to) {
    const advancedMs = Date.parse(c.advanced_to);
    if (!Number.isFinite(advancedMs)) {
      return {
        ok: false,
        status: "BOOTSTRAP_CURSOR_UNRESOLVED",
        error: "cursor.advanced_to is present but not a valid timestamp"
      };
    }
    let startMs = advancedMs - overlap;
    if (startMs > nowMs) startMs = nowMs;
    return {
      ok: true,
      status: "from_advanced_to",
      bootstrap: false,
      cursor_start: new Date(startMs).toISOString(),
      cursor_end: nowIso,
      overlap_ms: overlap,
      prior_advanced_to: c.advanced_to,
      parent_full_epoch_id: pickStr(parentFullEpochId) || c.parent_full_epoch_id,
      projected_advanced_to_after_success: nowIso,
      note: "Creation window from durable advanced_to − overlap (not modification detection)."
    };
  }

  const parentStartMs = parentFullStartedAt ? Date.parse(String(parentFullStartedAt)) : NaN;
  if (!Number.isFinite(parentStartMs)) {
    return {
      ok: false,
      status: "BOOTSTRAP_CURSOR_UNRESOLVED",
      error:
        "advanced_to is null and latest complete FULL census started_at is unavailable — refusing all-history bootstrap.",
      parent_full_epoch_id: pickStr(parentFullEpochId) || c.parent_full_epoch_id || null
    };
  }

  let startMs = parentStartMs - overlap;
  if (startMs > nowMs) startMs = nowMs;
  return {
    ok: true,
    status: "bootstrap_from_full_census",
    bootstrap: true,
    cursor_start: new Date(startMs).toISOString(),
    cursor_end: nowIso,
    overlap_ms: overlap,
    prior_advanced_to: null,
    full_census_started_at: new Date(parentStartMs).toISOString(),
    parent_full_epoch_id: pickStr(parentFullEpochId) || c.parent_full_epoch_id,
    projected_advanced_to_after_success: nowIso,
    note:
      "Bootstrap: FULL census started_at − overlap. Not beginning of history. creationDate is not modification detection."
  };
}

/**
 * Build the creation-date discovery window for a run.
 * Fail closed when advanced_to is null and FULL census boundary is missing.
 */
export function buildIncrementalDiscoveryWindow({
  cursor,
  now = new Date(),
  parentFullEpochId = null,
  parentFullStartedAt = null,
  overlapMs = null
} = {}) {
  const resolved = resolveIncrementalCreationWindowBootstrap({
    cursor,
    parentFullStartedAt,
    parentFullEpochId,
    now,
    overlapMs
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      error: resolved.error,
      strategy: MORAWARE_INCREMENTAL_STRATEGY,
      cursor_kind: MORAWARE_INCREMENTAL_CURSOR_KIND,
      parent_full_epoch_id: resolved.parent_full_epoch_id || null,
      prior_advanced_to: null,
      note: "BOOTSTRAP_CURSOR_UNRESOLVED — refusing all-history exact refresh."
    };
  }

  return {
    ok: true,
    strategy: MORAWARE_INCREMENTAL_STRATEGY,
    cursor_kind: MORAWARE_INCREMENTAL_CURSOR_KIND,
    parent_full_epoch_id: resolved.parent_full_epoch_id || null,
    cursor_start: resolved.cursor_start,
    cursor_end: resolved.cursor_end,
    overlap_ms: resolved.overlap_ms,
    prior_advanced_to: resolved.prior_advanced_to,
    bootstrap: Boolean(resolved.bootstrap),
    projected_advanced_to_after_success: resolved.projected_advanced_to_after_success,
    replay_tolerant: resolved.overlap_ms > 0,
    status: resolved.status,
    note: resolved.note
  };
}

/**
 * Decide whether creation + rolling cursors may advance.
 * Fail closed on ANY stage failure — neither position moves.
 */
export function shouldAdvanceIncrementalCursor({
  discoveryOk = false,
  populationResolutionOk = true,
  exactFetchOk = false,
  brainImportOk = false,
  preparedFactsOk = false,
  worksheetFactsOk = false,
  validationOk = false,
  lockOwned = false,
  dryRun = false
} = {}) {
  if (dryRun) {
    return { advance: false, reason: "dry_run_never_advances_cursor" };
  }
  if (!lockOwned) return { advance: false, reason: "population_lock_not_owned" };
  if (!populationResolutionOk) return { advance: false, reason: "current_population_resolution_failed" };
  if (!discoveryOk) return { advance: false, reason: "candidate_discovery_failed" };
  if (!exactFetchOk) return { advance: false, reason: "exact_job_fetch_failed" };
  if (!brainImportOk) return { advance: false, reason: "brain_import_failed" };
  if (!preparedFactsOk) return { advance: false, reason: "prepared_facts_failed" };
  if (!worksheetFactsOk) return { advance: false, reason: "worksheet_facts_failed" };
  if (!validationOk) return { advance: false, reason: "validation_failed" };
  return { advance: true, reason: "complete_governed_success" };
}

/**
 * Advance both creation-window and rolling positions after total success.
 */
export function buildAdvancedCursorState({
  previousCursor,
  window,
  parentFullEpochId,
  rollingBatch = null,
  successAt = new Date(),
  runId = null,
  jobsRefreshed = 0
} = {}) {
  const prev = normalizeIncrementalCursor(previousCursor || {});
  const cycleBump = rollingBatch?.wrapped ? 1 : 0;
  return normalizeIncrementalCursor({
    ...prev,
    strategy: MORAWARE_INCREMENTAL_STRATEGY,
    cursor_kind: MORAWARE_INCREMENTAL_CURSOR_KIND,
    parent_full_epoch_id: pickStr(parentFullEpochId) || window?.parent_full_epoch_id || prev.parent_full_epoch_id,
    advanced_to: window?.cursor_end || prev.advanced_to,
    last_success_at: toIsoOrNull(successAt),
    last_attempt_at: toIsoOrNull(successAt),
    last_failure_at: null,
    last_failure_reason: null,
    last_run_id: pickStr(runId) || prev.last_run_id,
    jobs_refreshed_last_success: jobsRefreshed,
    overlap_ms: window?.overlap_ms ?? prev.overlap_ms,
    rolling: {
      after_source_job_id:
        rollingBatch?.next_after_source_job_id != null
          ? pickStr(rollingBatch.next_after_source_job_id) || null
          : prev.rolling.after_source_job_id,
      cycle_count: (prev.rolling.cycle_count || 0) + cycleBump,
      last_batch_size: rollingBatch?.batch_size_selected ?? prev.rolling.last_batch_size,
      last_batch_start_source_job_id:
        rollingBatch?.start_source_job_id ?? prev.rolling.last_batch_start_source_job_id,
      last_batch_end_source_job_id:
        rollingBatch?.end_source_job_id ?? prev.rolling.last_batch_end_source_job_id,
      last_success_at: toIsoOrNull(successAt),
      last_wrapped: Boolean(rollingBatch?.wrapped)
    },
    version: (prev.version || 1) + 1
  });
}

export function buildFailedCursorAttemptState({
  previousCursor,
  failureReason,
  attemptAt = new Date()
} = {}) {
  const prev = normalizeIncrementalCursor(previousCursor || {});
  return normalizeIncrementalCursor({
    ...prev,
    last_attempt_at: toIsoOrNull(attemptAt),
    last_failure_at: toIsoOrNull(attemptAt),
    last_failure_reason: pickStr(failureReason) || "unknown_failure"
    // advanced_to AND rolling.after_source_job_id intentionally unchanged
  });
}

/**
 * In-memory cursor store for tests / dry-run planning without Supabase.
 */
export function createMemoryIncrementalCursorStore(seedByOrg = {}) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const [org, cur] of Object.entries(seedByOrg || {})) {
    map.set(String(org), normalizeIncrementalCursor(cur));
  }
  return {
    mode: "memory",
    async readCursor(organizationId) {
      const org = pickStr(organizationId) || "_";
      return normalizeIncrementalCursor(map.get(org) || {});
    },
    async writeCursor(organizationId, next, { advance = false } = {}) {
      const org = pickStr(organizationId) || "_";
      const normalized = normalizeIncrementalCursor(next);
      if (!advance) {
        const prev = normalizeIncrementalCursor(map.get(org) || {});
        map.set(
          org,
          normalizeIncrementalCursor({
            ...prev,
            last_attempt_at: normalized.last_attempt_at,
            last_failure_at: normalized.last_failure_at,
            last_failure_reason: normalized.last_failure_reason
            // preserve creation + rolling positions
          })
        );
        return { ok: true, advanced: false, cursor: map.get(org) };
      }
      map.set(org, normalized);
      return { ok: true, advanced: true, cursor: normalized };
    }
  };
}

/**
 * Supabase-backed cursor using existing organization_integration_configs.
 * No migration required — rolling fields live inside config JSON.
 */
export function createSupabaseIncrementalCursorStore(supabase) {
  if (!supabase) throw new Error("createSupabaseIncrementalCursorStore: supabase required");
  return {
    mode: "supabase",
    async readCursor(organizationId) {
      const org = pickStr(organizationId);
      if (!org) return normalizeIncrementalCursor({});
      const res = await supabase
        .from("organization_integration_configs")
        .select("config,metadata,updated_at")
        .eq("organization_id", org)
        .eq("integration_key", MORAWARE_INCREMENTAL_CURSOR_INTEGRATION_KEY)
        .limit(1);
      if (res.error) throw new Error(res.error.message || String(res.error));
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      const cfg = row?.config && typeof row.config === "object" ? row.config : {};
      return normalizeIncrementalCursor(cfg.cursor || cfg);
    },
    async writeCursor(organizationId, next, { advance = false } = {}) {
      const org = pickStr(organizationId);
      if (!org) throw new Error("writeCursor: organizationId required");
      const normalized = normalizeIncrementalCursor(next);
      if (!advance) {
        const prev = await this.readCursor(org);
        const merged = buildFailedCursorAttemptState({
          previousCursor: prev,
          failureReason: normalized.last_failure_reason,
          attemptAt: normalized.last_failure_at || new Date()
        });
        return upsertCursorRow(supabase, org, merged, false);
      }
      return upsertCursorRow(supabase, org, normalized, true);
    }
  };
}

async function upsertCursorRow(supabase, organizationId, cursor, advanced) {
  const payload = {
    organization_id: organizationId,
    integration_key: MORAWARE_INCREMENTAL_CURSOR_INTEGRATION_KEY,
    display_name: "Moraware incremental population cursor",
    is_enabled: true,
    config: {
      cursor,
      strategy: MORAWARE_INCREMENTAL_STRATEGY,
      cursor_kind: MORAWARE_INCREMENTAL_CURSOR_KIND
    },
    metadata: {
      last_write_advanced: Boolean(advanced),
      updated_by: "moraware_incremental_population"
    },
    updated_at: new Date().toISOString()
  };
  const res = await supabase
    .from("organization_integration_configs")
    .upsert(payload, { onConflict: "organization_id,integration_key" })
    .select("config")
    .limit(1);
  if (res.error) throw new Error(res.error.message || String(res.error));
  return { ok: true, advanced: Boolean(advanced), cursor };
}

/**
 * Health-facing cursor summary (no secrets).
 */
export function summarizeIncrementalCursorHealth(cursor, { now = new Date() } = {}) {
  const c = normalizeIncrementalCursor(cursor || {});
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const advancedMs = c.advanced_to ? Date.parse(c.advanced_to) : NaN;
  const ageSeconds =
    Number.isFinite(advancedMs) && Number.isFinite(nowMs)
      ? Math.max(0, Math.round((nowMs - advancedMs) / 1000))
      : null;
  return {
    strategy: c.strategy,
    cursor_kind: c.cursor_kind,
    parent_full_epoch_id: c.parent_full_epoch_id,
    creation_cursor: {
      advanced_to: c.advanced_to,
      cursor_age_seconds: ageSeconds,
      overlap_ms: c.overlap_ms
    },
    /** @deprecated use creation_cursor.advanced_to — kept for older readers */
    advanced_to: c.advanced_to,
    cursor_age_seconds: ageSeconds,
    rolling_cursor: {
      after_source_job_id: c.rolling.after_source_job_id,
      cycle_count: c.rolling.cycle_count,
      last_batch_size: c.rolling.last_batch_size,
      last_batch_start_source_job_id: c.rolling.last_batch_start_source_job_id,
      last_batch_end_source_job_id: c.rolling.last_batch_end_source_job_id,
      last_success_at: c.rolling.last_success_at,
      last_wrapped: c.rolling.last_wrapped
    },
    last_success_at: c.last_success_at,
    last_failure_at: c.last_failure_at,
    last_failure_reason: c.last_failure_reason,
    jobs_refreshed_last_success: c.jobs_refreshed_last_success,
    overlap_ms: c.overlap_ms,
    default_rolling_batch_size: MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE
  };
}

export { resolveRollingBatchSize };
