import {
  crewFromAssignedLabel,
  filterInstallDashboardCalendarRows,
  sortInstallDashboardCrews
} from "./installDashboardNormalizer.js";
import {
  calendarScheduleRowToInstallJob,
  computeMissingFieldCounts
} from "../moraware/reportFeeds/mapCalendarScheduleRow.js";
import { CALENDAR_SCHEDULE_REPORT_TYPE } from "../moraware/reportFeeds/calendarScheduleConstants.js";

export const CALENDAR_SCHEDULE_SELECT =
  "id, organization_id, calendar_date, scheduled_start_time, scheduled_end_time, duration, truck_or_crew_name, assigned_resource_name, activity_type, activity_type_name, activity_status, job_id, moraware_job_id, job_name, account_name, customer_name, address_line1, city, state, postal_code, sqft, material, color, install_type, notes, raw_payload, synced_at";

function isMissingRelationError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("does not exist") || String(err?.code ?? "") === "42P01";
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string|null|undefined} organizationId
 */
export async function isCalendarScheduleFeedConfigured(supabase, organizationId) {
  if (!organizationId) return false;
  try {
    const { data, error } = await supabase
      .from("moraware_report_feeds")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("report_type", CALENDAR_SCHEDULE_REPORT_TYPE)
      .eq("is_active", true)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId?: string|null, date: string }} opts
 */
export async function countCalendarScheduleRowsForDate(supabase, opts) {
  if (!opts.organizationId) return { ok: false, count: 0, tableInstalled: false };
  try {
    let q = supabase
      .from("moraware_calendar_schedule_rows")
      .select("id", { count: "exact", head: true })
      .eq("calendar_date", opts.date)
      .eq("is_active", true);
    q = q.eq("organization_id", opts.organizationId);
    const { count, error } = await q;
    if (error) {
      if (isMissingRelationError(error)) return { ok: false, count: 0, tableInstalled: false };
      return { ok: false, count: 0, tableInstalled: true, error: error.message };
    }
    return { ok: true, count: count ?? 0, tableInstalled: true };
  } catch {
    return { ok: false, count: 0, tableInstalled: false };
  }
}

function bucketJobsByCrew(rows, crewId) {
  /** @type {Map<string, ReturnType<typeof calendarScheduleRowToInstallJob>[]>} */
  const buckets = new Map();
  for (const row of rows) {
    const label = String(row.truck_or_crew_name ?? "").trim() || "Unassigned";
    const list = buckets.get(label) ?? [];
    list.push(calendarScheduleRowToInstallJob(row, list.length + 1));
    buckets.set(label, list);
  }

  let crewEntries = [...buckets.entries()].map(([label, jobs]) => ({
    crew: crewFromAssignedLabel(label),
    jobs
  }));
  crewEntries = sortInstallDashboardCrews(crewEntries.map((entry) => entry.crew))
    .map((crew) => crewEntries.find((entry) => entry.crew.id === crew.id))
    .filter(Boolean);

  let selected = crewEntries[0] ?? null;
  if (crewId) selected = crewEntries.find((e) => e.crew.id === crewId) ?? selected;
  return { crewEntries, selected };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId?: string|null, date: string, crewId?: string|null }} opts
 */
export async function loadInstallDayFromCalendarSchedule(supabase, opts) {
  const feedConfigured = await isCalendarScheduleFeedConfigured(supabase, opts.organizationId ?? null);
  const countInfo = await countCalendarScheduleRowsForDate(supabase, opts);

  const baseMeta = {
    selectedDate: opts.date,
    calendarFeedConfigured: feedConfigured,
    calendarTableInstalled: countInfo.tableInstalled,
    calendarRowCount: countInfo.count ?? 0,
    brainActivityCount: 0,
    missingFieldCounts: {}
  };

  if (!countInfo.tableInstalled) {
    return {
      ok: false,
      used: false,
      warnings: ["Calendar schedule feed table not installed — apply eliteos_moraware_calendar_schedule.sql"],
      meta: baseMeta
    };
  }

  if (!feedConfigured) {
    return {
      ok: false,
      used: false,
      warnings: ["Calendar schedule feed not configured"],
      meta: baseMeta
    };
  }

  if (!opts.organizationId) {
    return {
      ok: false,
      used: false,
      warnings: ["Organization context unavailable for calendar schedule read"],
      meta: baseMeta
    };
  }

  const { data, error } = await supabase
    .from("moraware_calendar_schedule_rows")
    .select(CALENDAR_SCHEDULE_SELECT)
    .eq("organization_id", opts.organizationId)
    .eq("calendar_date", opts.date)
    .eq("is_active", true)
    .order("scheduled_start_time", { ascending: true, nullsFirst: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        ok: false,
        used: false,
        warnings: ["Calendar schedule feed table not installed"],
        meta: baseMeta
      };
    }
    return {
      ok: false,
      used: false,
      warnings: [`Calendar schedule read failed: ${error.message}`],
      meta: baseMeta
    };
  }

  const rows = data ?? [];
  const filtered = filterInstallDashboardCalendarRows(rows);
  baseMeta.calendarRowCount = filtered.totalRowCount;
  baseMeta.installDashboardRowCount = filtered.rows.length;
  baseMeta.excludedRowCount = filtered.excludedRowCount;

  if (!filtered.rows.length) {
    const warnings =
      filtered.totalRowCount > 0
        ? ["No allowed install/template crew rows for selected date"]
        : ["Calendar schedule rows not available for selected date"];
    return {
      ok: true,
      used: false,
      warnings,
      meta: baseMeta
    };
  }

  const { crewEntries, selected } = bucketJobsByCrew(filtered.rows, opts.crewId ?? null);
  if (!selected) {
    return {
      ok: true,
      used: false,
      warnings: ["Calendar schedule rows exist but no crew bucket could be built"],
      meta: { ...baseMeta, availableCrewCount: crewEntries.length }
    };
  }

  const dayWarnings = [];
  if (crewEntries.length > 1 && !opts.crewId) {
    dayWarnings.push("Multiple crews/trucks scheduled — select a crew to narrow the route");
  }

  const missingFieldCounts = computeMissingFieldCounts(selected.jobs);

  return {
    ok: true,
    used: true,
    date: opts.date,
    crew: selected.crew,
    jobs: selected.jobs,
    warnings: dayWarnings,
    meta: {
      ...baseMeta,
      source: "calendar_schedule_feed",
      fixtureMode: false,
      availableCrewCount: crewEntries.length,
      allowedCrewCount: crewEntries.length,
      missingFieldCounts
    }
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId?: string|null, date: string }} opts
 */
export async function loadCalendarScheduleCrews(supabase, opts) {
  const feedConfigured = await isCalendarScheduleFeedConfigured(supabase, opts.organizationId ?? null);
  if (!opts.organizationId || !feedConfigured) {
    return {
      date: opts.date,
      crews: [],
      meta: { source: "calendar_schedule_feed", calendarFeedConfigured: feedConfigured }
    };
  }

  const { data, error } = await supabase
    .from("moraware_calendar_schedule_rows")
    .select("truck_or_crew_name, sqft")
    .eq("organization_id", opts.organizationId)
    .eq("calendar_date", opts.date)
    .eq("is_active", true);

  if (error || !data?.length) {
    return {
      date: opts.date,
      crews: [],
      meta: { source: "calendar_schedule_feed", calendarFeedConfigured: feedConfigured }
    };
  }

  const filtered = filterInstallDashboardCalendarRows(data);
  /** @type {Map<string, { stopCount: number, totalSqft: number }>} */
  const crewStats = new Map();
  for (const row of filtered.rows) {
    const label = String(row.truck_or_crew_name ?? "").trim() || "Unassigned";
    const stat = crewStats.get(label) ?? { stopCount: 0, totalSqft: 0 };
    stat.stopCount += 1;
    const sqft = row.sqft != null ? Number(row.sqft) : 0;
    if (Number.isFinite(sqft) && sqft > 0) stat.totalSqft += sqft;
    crewStats.set(label, stat);
  }
  const labels = new Set();
  for (const row of filtered.rows) {
    labels.add(String(row.truck_or_crew_name ?? "").trim() || "Unassigned");
  }
  const crews = sortInstallDashboardCrews([...labels].map((label) => crewFromAssignedLabel(label))).map(
    (crew) => {
      const stat = crewStats.get(crew.name) ?? { stopCount: 0, totalSqft: 0 };
      return {
        ...crew,
        stopCount: stat.stopCount,
        totalSqft: stat.totalSqft > 0 ? stat.totalSqft : null
      };
    }
  );
  return {
    date: opts.date,
    crews,
    meta: {
      source: "calendar_schedule_feed",
      calendarFeedConfigured: true,
      calendarRowCount: filtered.totalRowCount,
      installDashboardRowCount: filtered.rows.length,
      excludedRowCount: filtered.excludedRowCount
    }
  };
}
