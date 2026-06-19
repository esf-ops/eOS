import {
  crewFromAssignedLabel,
  extractAssignedLabel,
  isInstallLikeActivity,
  normalizeInstallJobRow
} from "./installDashboardNormalizer.js";
import { buildFixtureInstallDay, FIXTURE_CREWS } from "./installDashboardFixtures.js";
import {
  loadCalendarScheduleCrews,
  loadInstallDayFromCalendarSchedule
} from "./installDashboardCalendarRead.js";
import { computeMissingFieldCounts } from "../moraware/reportFeeds/mapCalendarScheduleRow.js";

/** Real Supabase columns for brain_job_activities — do not reference activity_status_name. */
export const BRAIN_JOB_ACTIVITIES_SELECT =
  "id, job_id, activity_index, activity_type, activity_type_name, activity_status, status_id, status_name, phase_name, phase_id, start_date, sched_time, duration, description, notes, raw_json";

export const BRAIN_JOB_ACTIVITIES_CREWS_SELECT =
  "raw_json, activity_type, activity_type_name, activity_status, status_name, description, phase_name";

function useFixtureMode() {
  const v = String(process.env.INSTALL_DASHBOARD_USE_FIXTURES ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function allowFixtureFallback() {
  if (useFixtureMode()) return true;
  const v = String(process.env.INSTALL_DASHBOARD_FIXTURE_FALLBACK ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return process.env.NODE_ENV !== "production";
}

async function fetchMapByJobIds(supabase, table, jobIds, columns) {
  if (!jobIds.length) return new Map();
  try {
    const { data, error } = await supabase.from(table).select(columns).in("job_id", jobIds);
    if (error) return new Map();
    const map = new Map();
    for (const row of data ?? []) {
      map.set(String(row.job_id), row);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ date: string, crewId?: string|null, organizationId?: string|null }} opts
 */
export async function loadInstallDayFromBrainActivities(supabase, opts) {
  const { data: activities, error: actErr } = await supabase
    .from("brain_job_activities")
    .select(BRAIN_JOB_ACTIVITIES_SELECT)
    .eq("start_date", opts.date)
    .order("sched_time", { ascending: true, nullsFirst: false });

  const brainActivityCount = activities?.length ?? 0;

  if (actErr) {
    if (allowFixtureFallback()) {
      const fixture = buildFixtureInstallDay(opts.date, opts.crewId ?? null);
      fixture.warnings = [`Brain read failed — showing fixture fallback: ${actErr.message}`];
      fixture.meta = {
        ...(fixture.meta ?? {}),
        source: "fixture",
        selectedDate: opts.date,
        brainActivityCount: 0
      };
      return fixture;
    }
    throw actErr;
  }

  const installActs = (activities ?? []).filter(isInstallLikeActivity);

  if (!installActs.length) {
    if (allowFixtureFallback()) {
      return buildFixtureInstallDay(opts.date, opts.crewId ?? null);
    }
    return {
      date: opts.date,
      crew: null,
      jobs: [],
      warnings: ["No install activities found for this date in Brain cache"],
      meta: {
        source: "brain_job_activities",
        fixtureMode: false,
        selectedDate: opts.date,
        brainActivityCount,
        calendarRowCount: 0,
        missingFieldCounts: {}
      }
    };
  }

  const jobIds = [...new Set(installActs.map((a) => String(a.job_id)).filter(Boolean))];

  const [jobsMap, addrMap, summaryMap, scopeMap] = await Promise.all([
    fetchMapByJobIds(
      supabase,
      "brain_jobs",
      jobIds,
      "job_id, job_name, account_name, job_status, worksheet_sqft, total_sqft, notes"
    ),
    fetchMapByJobIds(
      supabase,
      "brain_job_addresses",
      jobIds,
      "job_id, address_line1, city, state, zip, contact_name, cell, email, notes"
    ),
    fetchMapByJobIds(
      supabase,
      "brain_job_operational_summary",
      jobIds,
      "job_id, operational_notes_text, install_dates, has_install_activity"
    ),
    fetchMapByJobIds(
      supabase,
      "brain_job_notes_scope_signals",
      jobIds,
      "job_id, detected_sqft_line_count, has_scope_like_lines"
    )
  ]);

  /** @type {Map<string, { label: string, jobs: ReturnType<typeof normalizeInstallJobRow>[] }>} */
  const crewBuckets = new Map();

  for (const activity of installActs) {
    const jobId = String(activity.job_id ?? "");
    const assigned = extractAssignedLabel(activity.raw_json) || "Unassigned";
    const bucket = crewBuckets.get(assigned) ?? { label: assigned, jobs: [] };
    bucket.jobs.push(
      normalizeInstallJobRow({
        activity,
        job: jobsMap.get(jobId) ?? null,
        address: addrMap.get(jobId) ?? null,
        summary: summaryMap.get(jobId) ?? null,
        scopeSignals: scopeMap.get(jobId) ?? null,
        sequence: bucket.jobs.length + 1
      })
    );
    crewBuckets.set(assigned, bucket);
  }

  const crewEntries = [...crewBuckets.entries()].map(([label, bucket]) => ({
    crew: crewFromAssignedLabel(label),
    jobs: bucket.jobs
  }));

  let selected = crewEntries[0] ?? null;
  if (opts.crewId) {
    selected = crewEntries.find((e) => e.crew.id === opts.crewId) ?? selected;
  }

  if (!selected) {
    return {
      date: opts.date,
      crew: null,
      jobs: [],
      warnings: ["No crew buckets could be built from install activities"],
      meta: {
        source: "brain_job_activities",
        fixtureMode: false,
        selectedDate: opts.date,
        brainActivityCount,
        calendarRowCount: 0,
        missingFieldCounts: {}
      }
    };
  }

  const dayWarnings = [];
  if (crewEntries.length > 1 && !opts.crewId) {
    dayWarnings.push("Multiple crews/trucks scheduled — select a crew to narrow the route");
  }

  return {
    date: opts.date,
    crew: selected.crew,
    jobs: selected.jobs,
    warnings: dayWarnings,
    meta: {
      source: "brain_job_activities",
      fixtureMode: false,
      selectedDate: opts.date,
      brainActivityCount,
      calendarRowCount: 0,
      availableCrewCount: crewEntries.length,
      missingFieldCounts: computeMissingFieldCounts(selected.jobs)
    }
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ date: string, crewId?: string|null, organizationId?: string|null }} opts
 */
export async function loadInstallDayPayload(supabase, opts) {
  if (useFixtureMode()) {
    const fixture = buildFixtureInstallDay(opts.date, opts.crewId ?? null);
    fixture.meta = {
      ...(fixture.meta ?? {}),
      source: "fixture",
      selectedDate: opts.date,
      calendarFeedConfigured: false,
      calendarRowCount: 0,
      brainActivityCount: 0
    };
    return fixture;
  }

  const calendarAttempt = await loadInstallDayFromCalendarSchedule(supabase, opts);
  if (calendarAttempt.used) {
    return {
      date: calendarAttempt.date,
      crew: calendarAttempt.crew,
      jobs: calendarAttempt.jobs,
      warnings: calendarAttempt.warnings ?? [],
      meta: calendarAttempt.meta
    };
  }

  const brainPayload = await loadInstallDayFromBrainActivities(supabase, opts);
  const fallbackWarnings = [...(calendarAttempt.warnings ?? []), ...(brainPayload.warnings ?? [])];
  if (calendarAttempt.meta?.calendarFeedConfigured === false) {
    fallbackWarnings.unshift("Falling back to generic brain_job_activities");
  } else if ((calendarAttempt.meta?.calendarRowCount ?? 0) === 0) {
    fallbackWarnings.unshift("Falling back to generic brain_job_activities");
  }

  return {
    ...brainPayload,
    warnings: [...new Set(fallbackWarnings.filter(Boolean))],
    meta: {
      ...(brainPayload.meta ?? {}),
      ...(calendarAttempt.meta ?? {}),
      source: "brain_job_activities",
      fallbackFrom: "calendar_schedule_feed"
    }
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ date: string, organizationId?: string|null }} opts
 */
export async function loadInstallCrews(supabase, opts) {
  const date = opts.date;
  if (useFixtureMode()) {
    return { date, crews: FIXTURE_CREWS.map((c) => ({ ...c })), meta: { source: "fixture" } };
  }

  const calendarCrews = await loadCalendarScheduleCrews(supabase, opts);
  if (calendarCrews.crews.length) {
    return calendarCrews;
  }

  const { data: activities, error } = await supabase
    .from("brain_job_activities")
    .select(BRAIN_JOB_ACTIVITIES_CREWS_SELECT)
    .eq("start_date", date);

  if (error) {
    if (allowFixtureFallback()) {
      return { date, crews: FIXTURE_CREWS.map((c) => ({ ...c })), meta: { source: "fixture", note: error.message } };
    }
    throw error;
  }

  const labels = new Set();
  for (const row of activities ?? []) {
    if (!isInstallLikeActivity(row)) continue;
    labels.add(extractAssignedLabel(row.raw_json) || "Unassigned");
  }

  const crews = [...labels].map((label) => crewFromAssignedLabel(label));
  if (!crews.length && allowFixtureFallback()) {
    return { date, crews: FIXTURE_CREWS.map((c) => ({ ...c })), meta: { source: "fixture" } };
  }

  return {
    date,
    crews,
    meta: {
      source: "brain_job_activities",
      calendarFeedConfigured: calendarCrews.meta?.calendarFeedConfigured ?? false
    }
  };
}

export { useFixtureMode, allowFixtureFallback };
