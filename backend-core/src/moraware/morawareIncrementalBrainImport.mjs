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

function pickStr(v) {
  return v != null ? String(v).trim() : "";
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
      const sourceActivityId =
        pickStr(a.source_activity_id || a.id || a.activityId) || `${sourceJobId}:activity:${i}`;
      rows.push(
        withMorawareMirrorObservationTimestamps(
          {
            organization_id: org,
            sync_run_id: runId,
            source_system: SOURCE_SYSTEM,
            source_activity_id: sourceActivityId,
            source_job_id: sourceJobId,
            activity_name: pickStr(a.activity_name || a.name || a.activityName) || null,
            activity_status: pickStr(a.activity_status || a.status || a.activityStatus) || null,
            start_date: pickStr(a.startDate || a.start_date || a.scheduled_date) || null,
            raw_payload: a
          },
          now
        )
      );
    }
  }
  return rows;
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
    return { ok: false, status: "live_population_not_enabled", jobs_written: 0 };
  }
  const org = pickStr(organizationId);
  const token = pickStr(ownerToken);
  const parentEpoch = pickStr(parentFullEpochId);
  if (!org) return { ok: false, status: "organization_required", jobs_written: 0 };
  if (!token) return { ok: false, status: "population_lock_required", jobs_written: 0 };
  if (!parentEpoch) return { ok: false, status: "parent_full_epoch_required", jobs_written: 0 };

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
      jobs_written: 0
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

    if (jobRows.length) {
      const { error } = await supabase
        .from("brain_moraware_jobs")
        .upsert(jobRows, { onConflict: "organization_id,source_job_id" });
      if (error) throw new Error(error.message || String(error));
    }
    if (activityRows.length) {
      const { error } = await supabase
        .from("brain_moraware_job_activities")
        .upsert(activityRows, { onConflict: "organization_id,source_activity_id" });
      if (error) throw new Error(error.message || String(error));
    }

    const finishedAt = new Date().toISOString();
    await supabase
      .from("moraware_sync_runs")
      .update({
        status: "success",
        finished_at: finishedAt,
        duration_ms: Date.parse(finishedAt) - Date.parse(startedAt),
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
      jobs_written: jobRows.length,
      activities_written: activityRows.length,
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
    if (syncRunId) {
      try {
        await supabase
          .from("moraware_sync_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_summary: String(e?.message || e).slice(0, 500)
          })
          .eq("id", syncRunId);
      } catch {
        /* ignore secondary */
      }
    }
    return {
      ok: false,
      status: "brain_import_failed",
      error: String(e?.message || e),
      jobs_written: 0,
      sync_run_id: syncRunId,
      creates_new_full_epoch: false,
      watermark_advanced: false
    };
  }
}
