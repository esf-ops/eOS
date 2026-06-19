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
  buildCalendarScheduleGroupKey,
  mapCalendarScheduleRow
} from "./mapCalendarScheduleRow.js";
import { promoteCalendarScheduleRowsFromRun } from "./promoteCalendarScheduleRows.js";
import { shouldPromoteReportRun } from "./shouldPromoteReportRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const calendarScheduleFixtureCsv = readFileSync(join(fixtureDir, "calendar-schedule.sample.csv"), "utf8");

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";

function calendarRawRowFromFixture(index, identityStatus) {
  const parsed = parseCsvReportRows(calendarScheduleFixtureCsv);
  const rawRow = parsed.rows[index];
  return {
    id: `raw-${index}`,
    row_number: index + 1,
    row_hash: `hash-${index}`,
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

  const supabase = {
    from(table) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        update(payload) {
          if (table === "moraware_report_runs") {
            runUpdatePayload = payload;
          }
          return {
            eq() {
              return Promise.resolve({ error: null });
            }
          };
        },
        insert() {
          if (table === "moraware_calendar_schedule_rows") {
            insertCount += 1;
          }
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          if (table === "moraware_report_runs") {
            return Promise.resolve({
              data: {
                id: opts.runId ?? "run-1",
                organization_id: FAKE_ORG,
                report_feed_id: "feed-1",
                status: opts.runStatus ?? "needs_review",
                schema_drift: opts.schemaDrift ?? { detected: false }
              },
              error: null
            });
          }
          if (table === "moraware_report_feeds") {
            return Promise.resolve({
              data: {
                id: "feed-1",
                report_type: CALENDAR_SCHEDULE_REPORT_TYPE,
                moraware_view_id: 222,
                is_active: true
              },
              error: null
            });
          }
          if (table === "moraware_calendar_schedule_rows") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled, onRejected) {
          if (table === "moraware_report_raw_rows") {
            return Promise.resolve({ data: rawRows, error: null }).then(onFulfilled, onRejected);
          }
          if (table === "moraware_report_runs" && runUpdatePayload) {
            return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
      };
      return api;
    },
    getRunUpdatePayload: () => runUpdatePayload,
    getInsertCount: () => insertCount
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
  assert.equal(
    buildCalendarScheduleGroupKey(sample),
    buildCalendarScheduleGroupKey(
      mapCalendarScheduleRow({
        rawRow: parseCsvReportRows(calendarScheduleFixtureCsv).rows[0],
        organizationId: FAKE_ORG
      })
    )
  );
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
  assert.equal(supabase.getRunUpdatePayload()?.status, "promoted");
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
  ["zero stops apply does not mark run promoted", testZeroStopsApplyDoesNotMarkRunPromoted],
  ["zero stops apply allow-empty leaves status unchanged", testZeroStopsApplyAllowEmptyDoesNotMarkPromoted],
  ["apply promotes rows without matched identity", testApplyPromotesRowsWithoutMatchedIdentity],
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
