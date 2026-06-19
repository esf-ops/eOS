/**
 * Calendar schedule promotion tests.
 *
 * Run: npm run eos:test:moraware-report-feed (bundled)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CALENDAR_SCHEDULE_REPORT_TYPE } from "./calendarScheduleConstants.js";
import { parseCsvReportRows } from "./parseCsv.js";
import {
  aggregateCalendarScheduleRows,
  buildCalendarScheduleGroupKey,
  dedupePlannedScheduleStops,
  mapCalendarScheduleRow
} from "./mapCalendarScheduleRow.js";
import {
  deactivateCalendarScheduleRowsForPromotion,
  fetchAllReportRawRowsForRun,
  promoteCalendarScheduleRowsFromRun
} from "./promoteCalendarScheduleRows.js";
import { shouldPromoteReportRun } from "./shouldPromoteReportRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const calendarScheduleFixtureCsv = readFileSync(join(fixtureDir, "calendar-schedule.sample.csv"), "utf8");

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";
const FAKE_FEED = "feed-00000000-0000-0000-0000-000000000001";

function calendarRawRowFromFixture(index, identityStatus, rowNumber = index + 1) {
  const parsed = parseCsvReportRows(calendarScheduleFixtureCsv);
  const rawRow = parsed.rows[index % parsed.rows.length];
  return {
    id: `raw-${rowNumber}`,
    row_number: rowNumber,
    row_hash: `hash-${rowNumber}`,
    raw_row: rawRow,
    account_id: null,
    job_id: null,
    account_name: rawRow["Account Name"] ?? null,
    job_name: rawRow["Job Name"] ?? null,
    identity_status: identityStatus
  };
}

function makePromotionSupabase(rawRows, opts = {}) {
  let runUpdatePayload = null;
  let insertCount = 0;
  let deactivateCount = 0;
  const rangeCalls = [];
  const activeRows = [...(opts.initialActiveRows ?? [])];

  const supabase = {
    from(table) {
      const state = { table, filters: {}, inFilters: {} };
      const api = {
        select(_cols, optsSelect) {
          state.countMode = optsSelect?.count === "exact" && optsSelect?.head;
          state.selectCols = _cols;
          return api;
        },
        eq(col, val) {
          state.filters[col] = val;
          return api;
        },
        in(col, vals) {
          state.inFilters[col] = vals;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        range(from, to) {
          if (table === "moraware_report_raw_rows") {
            rangeCalls.push({ from, to });
            const data = rawRows.slice(from, to + 1);
            return Promise.resolve({ data, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        update(payload) {
          if (table === "moraware_calendar_schedule_rows") {
            return {
              eq(col, val) {
                state.filters[col] = val;
                return {
                  eq(col2, val2) {
                    state.filters[col2] = val2;
                    return {
                      eq(col3, val3) {
                        state.filters[col3] = val3;
                        return {
                          in(col4, vals) {
                            state.inFilters[col4] = vals;
                            return {
                              select() {
                                const matched = activeRows.filter((row) => {
                                  if (!row.is_active) return false;
                                  for (const [k, v] of Object.entries(state.filters)) {
                                    if (row[k] !== v) return false;
                                  }
                                  for (const [k, valsIn] of Object.entries(state.inFilters)) {
                                    if (!valsIn.includes(row[k])) return false;
                                  }
                                  return true;
                                });
                                for (const row of matched) {
                                  row.is_active = false;
                                  row.superseded_at = payload.superseded_at;
                                  deactivateCount += 1;
                                }
                                return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
                              }
                            };
                          }
                        };
                      }
                    };
                  }
                };
              }
            };
          }
          if (table === "moraware_report_runs") {
            runUpdatePayload = payload;
          }
          return {
            eq() {
              return Promise.resolve({ error: null });
            }
          };
        },
        insert(row) {
          if (table === "moraware_calendar_schedule_rows") {
            insertCount += 1;
            activeRows.push({ ...row, id: `active-${insertCount}` });
          }
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          if (table === "moraware_report_runs") {
            return Promise.resolve({
              data: {
                id: opts.runId ?? "run-1",
                organization_id: FAKE_ORG,
                report_feed_id: FAKE_FEED,
                status: opts.runStatus ?? "needs_review",
                schema_drift: opts.schemaDrift ?? { detected: false }
              },
              error: null
            });
          }
          if (table === "moraware_report_feeds") {
            return Promise.resolve({
              data: {
                id: FAKE_FEED,
                report_type: CALENDAR_SCHEDULE_REPORT_TYPE,
                moraware_view_id: 222,
                is_active: true
              },
              error: null
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled, onRejected) {
          if (table === "moraware_calendar_schedule_rows" && state.countMode) {
            const matched = activeRows.filter((row) => {
              if (!row.is_active) return false;
              for (const [k, v] of Object.entries(state.filters)) {
                if (row[k] !== v) return false;
              }
              for (const [k, vals] of Object.entries(state.inFilters)) {
                if (!vals.includes(row[k])) return false;
              }
              return true;
            });
            return Promise.resolve({ count: matched.length, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
      };
      return api;
    },
    getRunUpdatePayload: () => runUpdatePayload,
    getInsertCount: () => insertCount,
    getDeactivateCount: () => deactivateCount,
    getActiveRows: () => activeRows.filter((r) => r.is_active),
    getRangeCalls: () => rangeCalls
  };

  return supabase;
}

async function testPromotesUnmatchedIdentityRows() {
  const rawRows = [
    calendarRawRowFromFixture(0, "needs_identity_review"),
    calendarRawRowFromFixture(1, "needs_identity_review")
  ];
  const supabase = makePromotionSupabase(rawRows);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: false });
  assert.equal(result.ok, true);
  assert.equal(result.calendarRawRowsRead, 2);
  assert.equal(result.promotableLineCount, 2);
  assert.equal(result.scheduleStopsPlanned, 1, "duplicate worksheet lines aggregate to one stop");
}

async function testPromotesAmbiguousIdentityRows() {
  const rawRows = [calendarRawRowFromFixture(2, "ambiguous_identity")];
  const supabase = makePromotionSupabase(rawRows);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: false });
  assert.equal(result.ok, true);
  assert.equal(result.promotableLineCount, 1);
  assert.equal(result.scheduleStopsPlanned, 1);
}

async function testAggregatesByScheduleGroupKey() {
  const rawRows = [
    calendarRawRowFromFixture(0, "needs_identity_review"),
    calendarRawRowFromFixture(1, "needs_identity_review")
  ];
  const supabase = makePromotionSupabase(rawRows);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: false });
  const sample = result.sample?.[0];
  assert.ok(sample);
  assert.equal(sample.job_name, "Sample Kitchen Job");
  assert.equal(sample.sqft, 42.5);
}

async function testPlannedStopsDedupedBeforeWrite() {
  const row = mapCalendarScheduleRow({
    rawRow: parseCsvReportRows(calendarScheduleFixtureCsv).rows[0],
    organizationId: FAKE_ORG
  });
  const dupes = dedupePlannedScheduleStops([row, { ...row, sqft: 99 }]);
  assert.equal(dupes.length, 1);
}

async function testZeroStopsApplyDoesNotMarkRunPromoted() {
  const supabase = makePromotionSupabase([]);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: true });
  assert.equal(result.ok, false);
  assert.equal(result.error, "zero_stops_promoted");
  assert.equal(supabase.getRunUpdatePayload(), null);
  assert.equal(supabase.getInsertCount(), 0);
}

async function testZeroStopsApplyAllowEmptyDoesNotMarkPromoted() {
  const supabase = makePromotionSupabase([]);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", {
    apply: true,
    allowEmpty: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.promoted, 0);
  assert.equal(result.runStatusUpdated, false);
  assert.equal(supabase.getRunUpdatePayload(), null);
}

async function testApplyPromotesRowsWithoutMatchedIdentity() {
  const rawRows = [calendarRawRowFromFixture(2, "needs_identity_review")];
  const supabase = makePromotionSupabase(rawRows);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: true });
  assert.equal(result.ok, true);
  assert.equal(result.scheduleStopsPromoted, 1);
  assert.equal(result.runStatusUpdated, true);
  assert.equal(supabase.getInsertCount(), 1);
  assert.equal(supabase.getActiveRows().length, 1);
}

async function testFetchAllReportRawRowsPaginatesBeyondOneThousand() {
  const rawRows = Array.from({ length: 1500 }, (_, i) =>
    calendarRawRowFromFixture(i % 3, "needs_identity_review", i + 1)
  );
  const supabase = makePromotionSupabase(rawRows);

  const fetched = await fetchAllReportRawRowsForRun(supabase, "run-1");
  assert.equal(fetched.rows.length, 1500);
  assert.equal(fetched.pages, 2);
}

async function testPromotionReadsMoreThanOneThousandRawRows() {
  const rawRows = Array.from({ length: 1500 }, (_, i) =>
    calendarRawRowFromFixture(i % 3, "needs_identity_review", i + 1)
  );
  const supabase = makePromotionSupabase(rawRows);
  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: false });

  assert.equal(result.ok, true);
  assert.equal(result.calendarRawRowsRead, 1500);
  assert.equal(result.rawRowFetchPages, 2);
  assert.equal(result.promotableLineCount, 1500);
  assert.ok(result.scheduleStopsPlanned > 0);
}

async function testApplyingSameRunTwiceDoesNotDoubleActiveRows() {
  const rawRows = [
    calendarRawRowFromFixture(0, "needs_identity_review"),
    calendarRawRowFromFixture(1, "needs_identity_review")
  ];
  const supabase = makePromotionSupabase(rawRows);

  const first = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: true });
  assert.equal(first.ok, true);
  assert.equal(first.scheduleStopsPromoted, 1);
  assert.equal(supabase.getActiveRows().length, 1);

  const second = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: true });
  assert.equal(second.ok, true);
  assert.equal(second.scheduleStopsPromoted, 1);
  assert.equal(supabase.getActiveRows().length, 1, "second apply replaces instead of duplicating");
  assert.ok(second.replacedExistingActiveRows >= 1);
}

async function testExistingRowsForSameDateRangeAreReplaced() {
  const existing = mapCalendarScheduleRow({
    rawRow: parseCsvReportRows(calendarScheduleFixtureCsv).rows[0],
    organizationId: FAKE_ORG,
    reportFeedId: FAKE_FEED
  });
  existing.id = "old-1";
  existing.is_active = true;
  existing.report_feed_id = FAKE_FEED;

  const rawRows = [calendarRawRowFromFixture(0, "needs_identity_review")];
  const supabase = makePromotionSupabase(rawRows, { initialActiveRows: [existing] });

  const result = await promoteCalendarScheduleRowsFromRun(supabase, "run-1", { apply: true });
  assert.equal(result.ok, true);
  assert.equal(result.replacedExistingActiveRows, 1);
  assert.equal(supabase.getActiveRows().length, 1);
  assert.notEqual(supabase.getActiveRows()[0].id, "old-1");
}

async function testDeactivateCalendarScheduleRowsDryRunCountsExisting() {
  const existing = mapCalendarScheduleRow({
    rawRow: parseCsvReportRows(calendarScheduleFixtureCsv).rows[0],
    organizationId: FAKE_ORG,
    reportFeedId: FAKE_FEED
  });
  existing.id = "old-1";
  existing.is_active = true;
  existing.report_feed_id = FAKE_FEED;

  const supabase = makePromotionSupabase([], { initialActiveRows: [existing] });
  const result = await deactivateCalendarScheduleRowsForPromotion(supabase, {
    organizationId: FAKE_ORG,
    reportFeedId: FAKE_FEED,
    calendarDates: [existing.calendar_date],
    dryRun: true
  });
  assert.equal(result.existingActiveRows, 1);
  assert.equal(supabase.getActiveRows().length, 1);
}

function testSalesWorksheetPromotionStillRequiresValidatedStatus() {
  const gate = shouldPromoteReportRun({
    runStatus: "needs_review",
    schemaDrift: { detected: false },
    enrichment: { counts: { ambiguous_identity: 0 }, duplicatePreparedFacts: [] },
    profile: { rowCount: 5 }
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "run_not_validated");
}

const tests = [
  ["promotes unmatched identity rows", testPromotesUnmatchedIdentityRows],
  ["promotes ambiguous identity rows", testPromotesAmbiguousIdentityRows],
  ["aggregates by schedule group key", testAggregatesByScheduleGroupKey],
  ["planned stops deduped before write", testPlannedStopsDedupedBeforeWrite],
  ["zero stops apply does not mark run promoted", testZeroStopsApplyDoesNotMarkRunPromoted],
  ["zero stops apply allow-empty leaves status unchanged", testZeroStopsApplyAllowEmptyDoesNotMarkPromoted],
  ["apply promotes rows without matched identity", testApplyPromotesRowsWithoutMatchedIdentity],
  ["fetchAllReportRawRows paginates beyond 1000", testFetchAllReportRawRowsPaginatesBeyondOneThousand],
  ["promotion reads more than 1000 raw rows", testPromotionReadsMoreThanOneThousandRawRows],
  ["applying same run twice does not double active rows", testApplyingSameRunTwiceDoesNotDoubleActiveRows],
  ["existing rows for same date range are replaced", testExistingRowsForSameDateRangeAreReplaced],
  ["deactivate dry-run counts existing rows", testDeactivateCalendarScheduleRowsDryRunCountsExisting],
  ["sales worksheet promotion still requires validated status", testSalesWorksheetPromotionStillRequiresValidatedStatus]
];

let failed = 0;
(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${name}:`, e?.message || e);
    }
  }
  if (failed) process.exit(1);
  console.log(`promoteCalendarScheduleRows: all ${tests.length} tests passed`);
})();
