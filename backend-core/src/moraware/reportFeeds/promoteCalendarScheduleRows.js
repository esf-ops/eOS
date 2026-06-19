/**
 * Promote moraware_report_raw_rows from a calendar_schedule_rows feed into
 * moraware_calendar_schedule_rows. Backend-only; dry-run by default.
 *
 * View 222 is the schedule source of truth. Promotion does NOT require HTML/API
 * identity matching (identity_status=matched). Rows promote when Activity Date
 * and Job Name are present; worksheet lines aggregate into one Install stop.
 *
 * Idempotency: before insert, deactivate existing active rows for the same
 * organization_id + report_feed_id + affected calendar_date values, then insert
 * freshly planned stops. Re-applying the same run replaces rows instead of duplicating.
 */

import { CALENDAR_SCHEDULE_REPORT_TYPE } from "./calendarScheduleConstants.js";
import {
  aggregateCalendarScheduleRows,
  collectCalendarDatesFromStops,
  dedupePlannedScheduleStops,
  isCalendarScheduleRowPromotable,
  mapCalendarScheduleRow
} from "./mapCalendarScheduleRow.js";
import { isSchemaDriftBlocking } from "./schemaDriftPolicy.js";

const RAW_ROWS_PAGE_SIZE = 1000;
const CALENDAR_DATE_CHUNK_SIZE = 100;

const RAW_ROW_SELECT =
  "id, row_number, row_hash, raw_row, account_id, job_id, account_name, job_name, identity_status";

function isMissingRelationError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("does not exist") || String(err?.code ?? "") === "42P01";
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Fetch all moraware_report_raw_rows for a run (Supabase/PostgREST default limit is 1,000).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} reportRunId
 */
export async function fetchAllReportRawRowsForRun(supabase, reportRunId) {
  const all = [];
  let from = 0;
  let pages = 0;

  while (true) {
    const { data, error } = await supabase
      .from("moraware_report_raw_rows")
      .select(RAW_ROW_SELECT)
      .eq("report_run_id", reportRunId)
      .order("row_number", { ascending: true })
      .range(from, from + RAW_ROWS_PAGE_SIZE - 1);
    if (error) throw error;
    pages += 1;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < RAW_ROWS_PAGE_SIZE) break;
    from += RAW_ROWS_PAGE_SIZE;
  }

  return { rows: all, pages };
}

/**
 * Deactivate existing active schedule rows for org/feed on affected calendar dates.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ organizationId: string, reportFeedId: string, calendarDates: string[], dryRun?: boolean }} params
 */
export async function deactivateCalendarScheduleRowsForPromotion(supabase, params) {
  const { organizationId, reportFeedId, calendarDates, dryRun = false } = params;
  if (!calendarDates.length) {
    return { deactivated: 0, calendarDatesAffected: [] };
  }

  if (dryRun) {
    let existingCount = 0;
    for (const chunk of chunkArray(calendarDates, CALENDAR_DATE_CHUNK_SIZE)) {
      const { count, error } = await supabase
        .from("moraware_calendar_schedule_rows")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("report_feed_id", reportFeedId)
        .eq("is_active", true)
        .in("calendar_date", chunk);
      if (error) throw error;
      existingCount += count ?? 0;
    }
    return {
      deactivated: 0,
      existingActiveRows: existingCount,
      calendarDatesAffected: calendarDates
    };
  }

  let deactivated = 0;
  const now = new Date().toISOString();
  for (const chunk of chunkArray(calendarDates, CALENDAR_DATE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("moraware_calendar_schedule_rows")
      .update({ is_active: false, superseded_at: now, updated_at: now })
      .eq("organization_id", organizationId)
      .eq("report_feed_id", reportFeedId)
      .eq("is_active", true)
      .in("calendar_date", chunk)
      .select("id");
    if (error) {
      if (isMissingRelationError(error)) {
        return { deactivated: 0, calendarDatesAffected: calendarDates, tableMissing: true };
      }
      throw error;
    }
    deactivated += data?.length ?? 0;
  }

  return { deactivated, calendarDatesAffected: calendarDates };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} reportRunId
 * @param {{ apply?: boolean, allowEmpty?: boolean }} [opts]
 */
export async function promoteCalendarScheduleRowsFromRun(supabase, reportRunId, opts = {}) {
  const apply = opts.apply === true;
  const allowEmpty = opts.allowEmpty === true;

  const { data: run, error: runErr } = await supabase
    .from("moraware_report_runs")
    .select("id, organization_id, report_feed_id, status, schema_drift")
    .eq("id", reportRunId)
    .limit(1)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!run) return { ok: false, error: "report_run_not_found" };

  const { data: feed, error: feedErr } = await supabase
    .from("moraware_report_feeds")
    .select("id, report_type, moraware_view_id, is_active")
    .eq("id", run.report_feed_id)
    .limit(1)
    .maybeSingle();
  if (feedErr) throw feedErr;
  if (!feed || feed.report_type !== CALENDAR_SCHEDULE_REPORT_TYPE) {
    return { ok: false, error: "not_calendar_schedule_feed" };
  }
  if (isSchemaDriftBlocking(run.schema_drift)) {
    return { ok: false, error: "schema_drift_blocks_promotion", detail: run.schema_drift };
  }

  const { rows: rawRows, pages: rawRowFetchPages } = await fetchAllReportRawRowsForRun(
    supabase,
    reportRunId
  );

  const calendarRawRowsRead = rawRows.length;
  let skippedMissingRequired = 0;
  const lineMapped = [];

  for (const row of rawRows) {
    const payload = mapCalendarScheduleRow({
      rawRow: row.raw_row ?? {},
      organizationId: run.organization_id,
      reportFeedId: run.report_feed_id,
      reportRunId: run.id,
      sourceViewId: feed.moraware_view_id ?? null,
      jobId: row.job_id,
      accountId: row.account_id,
      identityStatus: row.identity_status ?? "needs_identity_review"
    });
    if (!isCalendarScheduleRowPromotable(payload)) {
      skippedMissingRequired += 1;
      continue;
    }
    lineMapped.push(payload);
  }

  const aggregated = aggregateCalendarScheduleRows(lineMapped);
  const plannedStops = dedupePlannedScheduleStops(aggregated);
  const scheduleStopsPlanned = plannedStops.length;
  const calendarDatesAffected = collectCalendarDatesFromStops(plannedStops);
  const duplicatePlannedStopKeys = aggregated.length - plannedStops.length;

  const baseResult = {
    calendarRawRowsRead,
    rawRowFetchPages,
    promotableLineCount: lineMapped.length,
    scheduleStopsPlanned,
    calendarDatesAffected: calendarDatesAffected.length,
    duplicatePlannedStopKeys,
    skippedMissingRequired,
    warnings: []
  };

  if (duplicatePlannedStopKeys > 0) {
    baseResult.warnings.push(
      `Removed ${duplicatePlannedStopKeys} duplicate planned stop key(s) before write.`
    );
  }

  if (scheduleStopsPlanned === 0) {
    baseResult.warnings.push("No schedule stops planned — check Activity Date and Job Name on raw rows.");
    if (apply && !allowEmpty) {
      return {
        ok: false,
        error: "zero_stops_promoted",
        ...baseResult
      };
    }
  }

  const replacePlan = await deactivateCalendarScheduleRowsForPromotion(supabase, {
    organizationId: run.organization_id,
    reportFeedId: run.report_feed_id,
    calendarDates: calendarDatesAffected,
    dryRun: true
  });

  if (!apply) {
    return {
      ok: true,
      dryRun: true,
      wouldPromote: scheduleStopsPlanned,
      wouldReplaceExistingActiveRows: replacePlan.existingActiveRows ?? 0,
      sample: plannedStops.slice(0, 3),
      ...baseResult,
      ...replacePlan
    };
  }

  if (scheduleStopsPlanned === 0 && allowEmpty) {
    return {
      ok: true,
      dryRun: false,
      promoted: 0,
      runStatusUpdated: false,
      replacedExistingActiveRows: 0,
      ...baseResult
    };
  }

  const replaceResult = await deactivateCalendarScheduleRowsForPromotion(supabase, {
    organizationId: run.organization_id,
    reportFeedId: run.report_feed_id,
    calendarDates: calendarDatesAffected,
    dryRun: false
  });

  if (replaceResult.tableMissing) {
    return {
      ok: false,
      error: "calendar_schedule_table_not_installed",
      detail: "moraware_calendar_schedule_rows"
    };
  }

  let promoted = 0;
  for (const row of plannedStops) {
    const { error: insErr } = await supabase.from("moraware_calendar_schedule_rows").insert(row);
    if (insErr) {
      if (isMissingRelationError(insErr)) {
        return { ok: false, error: "calendar_schedule_table_not_installed", detail: insErr.message };
      }
      throw insErr;
    }
    promoted += 1;
  }

  if (promoted === 0 && !allowEmpty) {
    return {
      ok: false,
      error: "zero_stops_promoted",
      promoted: 0,
      runStatusUpdated: false,
      replacedExistingActiveRows: replaceResult.deactivated ?? 0,
      ...baseResult
    };
  }

  await supabase
    .from("moraware_report_runs")
    .update({ status: "promoted", finished_at: new Date().toISOString() })
    .eq("id", reportRunId);

  return {
    ok: true,
    dryRun: false,
    promoted,
    scheduleStopsPromoted: promoted,
    runStatusUpdated: true,
    replacedExistingActiveRows: replaceResult.deactivated ?? 0,
    ...baseResult
  };
}
