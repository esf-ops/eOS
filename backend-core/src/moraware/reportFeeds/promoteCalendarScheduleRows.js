/**
 * Promote moraware_report_raw_rows from a calendar_schedule_rows feed into
 * moraware_calendar_schedule_rows. Backend-only; dry-run by default.
 *
 * View 222 exports repeat worksheet lines for the same scheduled stop; this
 * module aggregates them before insert.
 */

import { CALENDAR_SCHEDULE_REPORT_TYPE } from "./calendarScheduleConstants.js";
import {
  aggregateCalendarScheduleRows,
  mapCalendarScheduleRow
} from "./mapCalendarScheduleRow.js";

function isMissingRelationError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("does not exist") || String(err?.code ?? "") === "42P01";
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} reportRunId
 * @param {{ apply?: boolean, matchedOnly?: boolean }} [opts]
 */
export async function promoteCalendarScheduleRowsFromRun(supabase, reportRunId, opts = {}) {
  const apply = opts.apply === true;
  const matchedOnly = opts.matchedOnly !== false;

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
  if (run.schema_drift?.detected) {
    return { ok: false, error: "schema_drift_blocks_promotion" };
  }

  let query = supabase
    .from("moraware_report_raw_rows")
    .select("id, row_number, row_hash, raw_row, account_id, job_id, account_name, job_name, identity_status")
    .eq("report_run_id", reportRunId)
    .order("row_number", { ascending: true });
  if (matchedOnly) query = query.eq("identity_status", "matched");

  const { data: rawRows, error: rawErr } = await query;
  if (rawErr) throw rawErr;

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
    if (!payload.calendar_date) continue;
    lineMapped.push(payload);
  }

  const mapped = aggregateCalendarScheduleRows(lineMapped);

  if (!apply) {
    return {
      ok: true,
      dryRun: true,
      rawWorksheetLineCount: lineMapped.length,
      wouldPromote: mapped.length,
      aggregatedFrom: lineMapped.length,
      sample: mapped.slice(0, 3)
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

  await supabase
    .from("moraware_report_runs")
    .update({ status: "promoted", finished_at: new Date().toISOString() })
    .eq("id", reportRunId);

  return {
    ok: true,
    dryRun: false,
    promoted,
    rawWorksheetLineCount: lineMapped.length,
    aggregatedFrom: lineMapped.length,
    skippedUnmappedDate: (rawRows?.length ?? 0) - lineMapped.length
  };
}
