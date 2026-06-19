/**
 * Promote moraware_report_raw_rows from a calendar_schedule_rows feed into
 * moraware_calendar_schedule_rows. Backend-only; dry-run by default.
 *
 * View 222 is the schedule source of truth. Promotion does NOT require HTML/API
 * identity matching (identity_status=matched). Rows promote when Activity Date
 * and Job Name are present; worksheet lines aggregate into one Install stop.
 */

import { CALENDAR_SCHEDULE_REPORT_TYPE } from "./calendarScheduleConstants.js";
import {
  aggregateCalendarScheduleRows,
  isCalendarScheduleRowPromotable,
  mapCalendarScheduleRow
} from "./mapCalendarScheduleRow.js";
import { isSchemaDriftBlocking } from "./schemaDriftPolicy.js";

function isMissingRelationError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("does not exist") || String(err?.code ?? "") === "42P01";
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

  const { data: rawRows, error: rawErr } = await supabase
    .from("moraware_report_raw_rows")
    .select("id, row_number, row_hash, raw_row, account_id, job_id, account_name, job_name, identity_status")
    .eq("report_run_id", reportRunId)
    .order("row_number", { ascending: true });
  if (rawErr) throw rawErr;

  const calendarRawRowsRead = rawRows?.length ?? 0;
  let skippedMissingRequired = 0;
  const lineMapped = [];

  for (const row of rawRows ?? []) {
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

  const mapped = aggregateCalendarScheduleRows(lineMapped);
  const scheduleStopsPlanned = mapped.length;

  const baseResult = {
    calendarRawRowsRead,
    promotableLineCount: lineMapped.length,
    scheduleStopsPlanned,
    skippedMissingRequired,
    warnings: []
  };

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

  if (!apply) {
    return {
      ok: true,
      dryRun: true,
      wouldPromote: scheduleStopsPlanned,
      sample: mapped.slice(0, 3),
      ...baseResult
    };
  }

  if (scheduleStopsPlanned === 0 && allowEmpty) {
    return {
      ok: true,
      dryRun: false,
      promoted: 0,
      runStatusUpdated: false,
      ...baseResult
    };
  }

  let promoted = 0;
  for (const row of mapped) {
    const { data: existing } = await supabase
      .from("moraware_calendar_schedule_rows")
      .select("id")
      .eq("organization_id", row.organization_id)
      .eq("row_hash", row.row_hash)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("moraware_calendar_schedule_rows")
        .update({ is_active: false, superseded_at: new Date().toISOString() })
        .eq("id", existing.id);
    }

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
    ...baseResult
  };
}
