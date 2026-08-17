/**
 * Incremental Brain Moraware upsert under parent FULL epoch A.
 *
 * census_scope=incremental — does NOT create epoch B, does NOT establish global
 * absence, does NOT advance FULL watermark. Upserts only exact candidate jobs
 * (and their activities when present). last_seen_at is stamped so new jobs join
 * CURRENT_MORAWARE_JOB_SET (last_seen_at >= FULL started_at).
 */

import { CENSUS_SCOPE_INCREMENTAL, canAdvanceFullCensusWatermark } from "./morawareCurrentPopulation.mjs";
import { guardLiveMorawarePopulationWrite } from "./morawarePopulationLock.mjs";
import { withMorawareMirrorObservationTimestamps } from "./morawareSyncApi.js";
import { MORAWARE_INCREMENTAL_STRATEGY } from "./morawareIncrementalStrategy.mjs";

const SOURCE_SYSTEM = "moraware";

/**
 * Authoritative writable columns for brain_moraware_job_activities
 * (eliteos_moraware_sync_foundation_v1.sql + canonical normalizeActivities /
 * withMorawareMirrorObservationTimestamps).
 * Do not emit invented columns (activity_name, activity_status, start_date, …).
 * first_seen_at / created_at / id are DB defaults — omitted on upsert.
 */
export const BRAIN_MORAWARE_JOB_ACTIVITY_WRITE_COLUMNS = Object.freeze([
  "organization_id",
  "sync_run_id",
  "source_system",
  "source_activity_id",
  "source_job_id",
  "activity_type_name",
  "activity_status_name",
  "phase_name",
  "scheduled_date",
  "scheduled_time",
  "duration_minutes",
  "raw_payload",
  "last_seen_at",
  "updated_at"
]);

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function firstNonempty(...values) {
  for (const v of values) {
    const s = pickStr(v);
    if (s) return s;
  }
  return "";
}

function toIsoOrNull(raw) {
  const s = pickStr(raw);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function toDateOrNull(raw) {
  const iso = toIsoOrNull(raw);
  return iso ? iso.slice(0, 10) : null;
}

function toNumberOrNull(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function rawPayloadOf(row) {
  if (row?.raw_payload && typeof row.raw_payload === "object") return row.raw_payload;
  if (row?.raw && typeof row.raw === "object") return row.raw;
  return row && typeof row === "object" ? row : {};
}

/** Sanitize sync-run error text — no credentials / giant dumps. */
export function sanitizeMorawareSyncRunErrorMessage(raw, { maxLen = 500 } = {}) {
  let s = String(raw ?? "")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key|token|password|secret|service_role)(=+|:\s*)([^\s&]+)/gi, "$1$2[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .slice(0, Math.max(1, Number(maxLen) || 500));
  return s || "unknown_error";
}

/**
 * Build brain_moraware_jobs rows for incremental upsert (omits first_seen_at).
 */
export function buildIncrementalBrainJobRows(
  jobs = [],
  { organizationId, syncRunId, seenAt = new Date().toISOString() } = {}
) {
  const org = pickStr(organizationId);
  const runId = pickStr(syncRunId) || null;
  const now = seenAt;
  const rows = [];
  for (const job of jobs || []) {
    const sourceJobId = pickStr(job?.source_job_id);
    if (!org || !sourceJobId) continue;
    const raw =
      job?.raw_payload && typeof job.raw_payload === "object"
        ? job.raw_payload
        : { forms: job?.forms || [], activities: job?.activities || [] };
    rows.push(
      withMorawareMirrorObservationTimestamps(
        {
          organization_id: org,
          sync_run_id: runId,
          source_system: SOURCE_SYSTEM,
          source_job_id: sourceJobId,
          source_account_id: pickStr(job?.source_account_id) || null,
          account_name: pickStr(job?.account_name) || null,
          job_name: pickStr(job?.name || job?.job_name) || null,
          status_name: pickStr(job?.status_name) || null,
          salesperson_name: pickStr(job?.salesperson_name) || null,
          created_at_source: pickStr(job?.created_at_source) || null,
          modified_at_source: pickStr(job?.modified_at_source) || null,
          raw_payload: raw
        },
        now
      )
    );
  }
  return rows;
}

/**
 * Build brain_moraware_job_activities rows from exact job payloads.
 * Matches canonical normalizeActivities / foundation schema columns.
 */
export function buildIncrementalBrainActivityRows(
  jobs = [],
  { organizationId, syncRunId, seenAt = new Date().toISOString() } = {}
) {
  const org = pickStr(organizationId);
  const runId = pickStr(syncRunId) || null;
  const now = seenAt;
  const rows = [];
  for (const job of jobs || []) {
    const sourceJobId = pickStr(job?.source_job_id);
    const activities = Array.isArray(job?.raw_payload?.activities)
      ? job.raw_payload.activities
      : Array.isArray(job?.activities)
        ? job.activities
        : [];
    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i] || {};
      const raw = rawPayloadOf(a);
      const sourceActivityId =
        firstNonempty(
          a.source_activity_id,
          a.source_record_id,
          a.activity_id,
          a.activityId,
          a.id,
          sourceJobId ? `${sourceJobId}:activity:${a.activityIndex ?? i}` : ""
        ) || `${sourceJobId || "job"}:activity:${i}`;
      rows.push(
        withMorawareMirrorObservationTimestamps(
          {
            organization_id: org,
            sync_run_id: runId,
            source_system: SOURCE_SYSTEM,
            source_activity_id: sourceActivityId,
            source_job_id: firstNonempty(a.source_job_id, a.job_id, a.jobId, raw.jobId, sourceJobId) || null,
            activity_type_name:
              firstNonempty(
                a.activity_type_name,
                a.activity_type,
                a.activityTypeName,
                a.activityType,
                a.type,
                a.name,
                a.activityName,
                raw.activityType,
                raw.activity_type_name
              ) || null,
            activity_status_name:
              firstNonempty(
                a.activity_status_name,
                a.activity_status,
                a.activityStatusName,
                a.activityStatus,
                a.status,
                raw.status,
                raw.activity_status_name
              ) || null,
            phase_name: firstNonempty(a.phase_name, a.phaseName, raw.phaseName) || null,
            scheduled_date: toDateOrNull(
              a.scheduled_date ?? a.start_date ?? a.startDate ?? a.date ?? raw.scheduled_date ?? raw.startDate
            ),
            scheduled_time: firstNonempty(a.scheduled_time, a.sched_time, a.schedTime, raw.schedTime) || null,
            duration_minutes: toNumberOrNull(a.duration_minutes ?? a.duration ?? raw.duration),
            raw_payload: raw
          },
          now
        )
      );
    }
  }
  return rows;
}

function emptyStageCounts(extra = {}) {
  return {
    jobs_attempted: 0,
    jobs_written: 0,
    activities_attempted: 0,
    activities_written: 0,
    forms_attempted: 0,
    forms_written: 0,
    failed_stage: null,
    ...extra
  };
}

/**
 * Finalize a moraware_sync_runs row on failure using real columns only.
 * Never writes error_summary. Never masks the original pipeline error.
 */
export async function finalizeMorawareSyncRunFailure(
  supabase,
  { syncRunId, startedAt, errorMessage, clock = null } = {}
) {
  const id = pickStr(syncRunId);
  if (!id || !supabase) {
    return { ok: false, skipped: true, reason: "missing_sync_run_id" };
  }
  // Lifecycle wall-clock at failure finalize — never frozen window_end
  const finishedAt =
    typeof clock === "function"
      ? new Date(clock()).toISOString()
      : new Date().toISOString();
  const startedMs = Date.parse(String(startedAt || ""));
  const finishedMs = Date.parse(finishedAt);
  // duration from actual lifecycle clocks only — never window_end / frozen run now
  const durationMs =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : null;
  const patch = {
    status: "failed",
    finished_at: finishedAt,
    error_message: sanitizeMorawareSyncRunErrorMessage(errorMessage)
  };
  if (durationMs != null) patch.duration_ms = durationMs;

  try {
    const { error } = await supabase.from("moraware_sync_runs").update(patch).eq("id", id);
    if (error) {
      return {
        ok: false,
        status: "finalize_failed",
        error: String(error.message || error),
        attempted_columns: Object.keys(patch)
      };
    }
    return { ok: true, status: "failed", finished_at: finishedAt, duration_ms: durationMs };
  } catch (e) {
    return {
      ok: false,
      status: "finalize_threw",
      error: String(e?.message || e),
      attempted_columns: Object.keys(patch)
    };
  }
}

/**
 * Governed incremental Brain write. Requires held moraware_population owner.
 */
export async function importIncrementalMorawareBrainJobs(
  supabase,
  {
    organizationId,
    parentFullEpochId,
    jobs = [],
    metadata = {},
    ownerToken,
    liveWrite = false,
    allowLivePopulation = false,
    mode = "incremental-worker-import",
    runner = "moraware-incremental"
  } = {}
) {
  if (liveWrite !== true || allowLivePopulation !== true) {
    return { ok: false, status: "live_population_not_enabled", ...emptyStageCounts() };
  }
  const org = pickStr(organizationId);
  const token = pickStr(ownerToken);
  const parentEpoch = pickStr(parentFullEpochId);
  if (!org) return { ok: false, status: "organization_required", ...emptyStageCounts() };
  if (!token) return { ok: false, status: "population_lock_required", ...emptyStageCounts() };
  if (!parentEpoch) return { ok: false, status: "parent_full_epoch_required", ...emptyStageCounts() };

  const guard = await guardLiveMorawarePopulationWrite(supabase, {
    ownerToken: token,
    censusScope: CENSUS_SCOPE_INCREMENTAL,
    requireCensusScope: true
  });
  if (!guard.ok) {
    return {
      ok: false,
      status: guard.code || "population_lock_denied",
      error: guard.error,
      ...emptyStageCounts()
    };
  }

  const intendedIds = (jobs || []).map((j) => pickStr(j?.source_job_id)).filter(Boolean);
  const runMeta = {
    ...metadata,
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    parent_full_epoch_id: parentEpoch,
    import_group_id: parentEpoch,
    incremental_strategy: metadata.incremental_strategy || MORAWARE_INCREMENTAL_STRATEGY,
    absence_establishes_global_absence: false,
    creates_new_full_epoch: false,
    view222_used: false,
    fuzzy_matching_used: false
  };

  const startedAt = new Date().toISOString();
  let syncRunId = null;
  const counts = emptyStageCounts();

  try {
    const runInsert = await supabase
      .from("moraware_sync_runs")
      .insert({
        organization_id: org,
        source_system: SOURCE_SYSTEM,
        mode,
        runner,
        status: "running",
        started_at: startedAt,
        row_counts: { jobs: intendedIds.length },
        metadata: runMeta
      })
      .select("id")
      .limit(1);
    if (runInsert.error) throw new Error(runInsert.error.message || String(runInsert.error));
    syncRunId = runInsert.data?.[0]?.id ?? null;
    if (!syncRunId) throw new Error("Could not create moraware_sync_runs row");

    const seenAt = new Date().toISOString();
    const jobRows = buildIncrementalBrainJobRows(jobs, { organizationId: org, syncRunId, seenAt });
    const activityRows = buildIncrementalBrainActivityRows(jobs, {
      organizationId: org,
      syncRunId,
      seenAt
    });

    counts.jobs_attempted = jobRows.length;
    if (jobRows.length) {
      counts.failed_stage = "brain_jobs";
      const { error } = await supabase
        .from("brain_moraware_jobs")
        .upsert(jobRows, { onConflict: "organization_id,source_job_id" });
      if (error) throw new Error(error.message || String(error));
      counts.jobs_written = jobRows.length;
    }

    counts.activities_attempted = activityRows.length;
    if (activityRows.length) {
      counts.failed_stage = "brain_activities";
      const { error } = await supabase
        .from("brain_moraware_job_activities")
        .upsert(activityRows, { onConflict: "organization_id,source_activity_id" });
      if (error) throw new Error(error.message || String(error));
      counts.activities_written = activityRows.length;
    }

    counts.failed_stage = null;

    // Lifecycle completion wall-clock — not frozen incremental window_end
    const finishedAt = new Date().toISOString();
    const startedMs = Date.parse(String(startedAt || ""));
    const finishedMs = Date.parse(finishedAt);
    const durationMs =
      Number.isFinite(startedMs) && Number.isFinite(finishedMs)
        ? Math.max(0, finishedMs - startedMs)
        : null;
    await supabase
      .from("moraware_sync_runs")
      .update({
        status: "success",
        finished_at: finishedAt,
        ...(durationMs != null ? { duration_ms: durationMs } : {}),
        row_counts: { jobs: jobRows.length, job_activities: activityRows.length }
      })
      .eq("id", syncRunId);

    const watermarkWouldAdvance = canAdvanceFullCensusWatermark({
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      complete: true,
      uncapped: true,
      importSucceeded: true
    });

    return {
      ok: true,
      status: "brain_incremental_upserted",
      ...counts,
      source_job_ids_written: jobRows.map((r) => String(r.source_job_id)),
      intended_source_job_ids: intendedIds,
      sync_run_id: syncRunId,
      census_scope: CENSUS_SCOPE_INCREMENTAL,
      parent_full_epoch_id: parentEpoch,
      creates_new_full_epoch: false,
      watermark_advanced: false,
      watermark_advancement_forbidden: watermarkWouldAdvance === false,
      unrelated_jobs_touched: 0,
      absence_establishes_deletion: false
    };
  } catch (e) {
    const originalError = String(e?.message || e);
    const finalize = await finalizeMorawareSyncRunFailure(supabase, {
      syncRunId,
      startedAt,
      errorMessage: originalError
    });
    return {
      ok: false,
      status: "brain_import_failed",
      error: originalError,
      ...counts,
      failed_stage: counts.failed_stage || "brain_import",
      sync_run_id: syncRunId,
      sync_run_finalize: finalize,
      creates_new_full_epoch: false,
      watermark_advanced: false
    };
  }
}
