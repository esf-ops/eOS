/**
 * Install Dashboard normalizer / schema-compat / calendar schedule tests.
 *
 * Run: npm run eos:test:install-dashboard
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRAIN_JOB_ACTIVITIES_SELECT,
  BRAIN_JOB_ACTIVITIES_CREWS_SELECT,
  loadInstallDayPayload
} from "./installDashboardBrainRead.js";
import { loadInstallDayFromCalendarSchedule } from "./installDashboardCalendarRead.js";
import {
  isInstallLikeActivity,
  normalizeActivityStatus,
  normalizeActivityType,
  normalizeInstallJobRow,
  crewFromAssignedLabel
} from "./installDashboardNormalizer.js";
import {
  mapCalendarScheduleRow,
  calendarScheduleRowToInstallJob,
  computeMissingFieldCounts
} from "../moraware/reportFeeds/mapCalendarScheduleRow.js";
import { parseCsvReportRows } from "../moraware/reportFeeds/parseCsv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../test/fixtures/moraware-report-feeds");
const calendarCsv = readFileSync(join(fixtureDir, "calendar-schedule.sample.csv"), "utf8");

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";

function makeSupabaseMock(tableHandlers) {
  function buildQuery(table) {
    const state = { table, filters: [], countMode: false, head: false, limit: null };
    const api = {
      select(_cols, opts) {
        if (opts?.count === "exact") state.countMode = true;
        if (opts?.head) state.head = true;
        return api;
      },
      eq(col, val) {
        state.filters.push({ col, val });
        return api;
      },
      order() {
        return api;
      },
      in() {
        return api;
      },
      limit(n) {
        state.limit = n;
        return api;
      },
      maybeSingle() {
        const handler = tableHandlers[table];
        return Promise.resolve(handler ? handler(state) : { data: null, error: null });
      },
      then(onFulfilled, onRejected) {
        const handler = tableHandlers[table];
        return Promise.resolve(handler ? handler(state) : { data: [], error: null }).then(
          onFulfilled,
          onRejected
        );
      }
    };
    return api;
  }

  return { from: (table) => buildQuery(table) };
}

function testSelectColumnsMatchProductionSchema() {
  assert.doesNotMatch(BRAIN_JOB_ACTIVITIES_SELECT, /activity_status_name/);
  assert.match(BRAIN_JOB_ACTIVITIES_SELECT, /status_name/);
  assert.match(BRAIN_JOB_ACTIVITIES_SELECT, /activity_status/);
  assert.match(BRAIN_JOB_ACTIVITIES_SELECT, /activity_type_name/);
  assert.doesNotMatch(BRAIN_JOB_ACTIVITIES_CREWS_SELECT, /activity_status_name/);
}

function testNormalizeActivityStatusPrefersStatusName() {
  const activity = {
    status_name: "Confirmed",
    activity_status: "Open",
    raw_json: { status: "Draft" }
  };
  assert.equal(normalizeActivityStatus(activity), "Confirmed");
}

function testNormalizeActivityStatusFallsBackToActivityStatus() {
  assert.equal(normalizeActivityStatus({ activity_status: "Scheduled" }), "Scheduled");
}

function testNormalizeActivityStatusFallsBackToRawJson() {
  assert.equal(
    normalizeActivityStatus({ raw_json: { Status: "In Progress" } }),
    "In Progress"
  );
}

function testNormalizeActivityStatusFallsBackToJobStatus() {
  assert.equal(
    normalizeActivityStatus({}, { job_status: "Active" }),
    "Active"
  );
}

function testNormalizeActivityStatusReturnsNullWhenMissing() {
  assert.equal(normalizeActivityStatus({}), null);
}

function testNormalizeActivityTypePrefersTypeName() {
  assert.equal(
    normalizeActivityType({
      activity_type_name: "Install - Granite",
      activity_type: "install"
    }),
    "Install - Granite"
  );
}

function testNormalizeActivityTypeFallsBackToRawJson() {
  assert.equal(
    normalizeActivityType({ raw_json: { "Activity Type": "Install Day" } }),
    "Install Day"
  );
}

function testNormalizeActivityTypeReturnsNullWhenMissing() {
  assert.equal(normalizeActivityType({}), null);
}

function testNormalizeInstallJobRowMissingOptionalFieldsDoNotThrow() {
  const row = normalizeInstallJobRow({
    activity: {
      id: 99,
      job_id: "job-1",
      start_date: "2026-06-11",
      sched_time: "09:30",
      description: "Install kitchen counters",
      raw_json: null
    },
    job: null,
    address: null,
    summary: null,
    scopeSignals: null,
    sequence: 1
  });
  assert.equal(row.status, null);
  assert.equal(row.activityType, null);
  assert.ok(row.warnings.includes("Missing activity status"));
  assert.ok(row.warnings.includes("Missing activity type"));
  assert.ok(row.warnings.includes("Missing address"));
}

function testIsInstallLikeActivityUsesNormalizedType() {
  assert.equal(
    isInstallLikeActivity({
      raw_json: { "Activity Type Name": "Install - Quartz" },
      description: "countertops"
    }),
    true
  );
}

function testCalendarScheduleRowMapsToInstallJobCard() {
  const parsed = parseCsvReportRows(calendarCsv);
  const rawRow = parsed.rows[0];
  const mapped = mapCalendarScheduleRow({
    rawRow,
    organizationId: FAKE_ORG,
    jobId: "37780",
    sourceViewId: 146
  });
  assert.equal(mapped.calendar_date, "2026-06-19");
  assert.equal(mapped.truck_or_crew_name, "Truck A");
  assert.equal(mapped.job_name, "Skogman Kitchen");

  const job = calendarScheduleRowToInstallJob(mapped, 1);
  assert.equal(job.truckOrCrewName, "Truck A");
  assert.equal(job.customerName, "Skogman Homes");
  assert.equal(job.address.line1, "123 Oak St");
  assert.equal(job.scope.sqft, 42.5);
  assert.match(job.scheduledStart ?? "", /2026-06-19T08:00:00/);
}

function testMultipleTrucksAppearInCrewPicker() {
  const parsed = parseCsvReportRows(calendarCsv);
  const rows = parsed.rows.map((rawRow, i) =>
    mapCalendarScheduleRow({
      rawRow,
      organizationId: FAKE_ORG,
      jobId: `job-${i}`,
      sourceViewId: 146
    })
  );

  const labels = new Set(rows.map((r) => r.truck_or_crew_name));
  assert.equal(labels.size, 3);
  assert.ok(labels.has("Truck A"));
  assert.ok(labels.has("Truck B"));
  assert.ok(labels.has("Truck D"));

  const crews = [...labels].map((label) => crewFromAssignedLabel(label));
  assert.equal(crews.length, 3);
}

function testCalendarReadReturnsWarningWhenNoRowsForDate() {
  const supabase = makeSupabaseMock({
    moraware_report_feeds: () => ({ data: [{ id: "feed-1" }], error: null }),
    moraware_calendar_schedule_rows: (state) => {
      if (state.countMode) return { count: 0, error: null };
      return { data: [], error: null };
    }
  });

  return loadInstallDayFromCalendarSchedule(supabase, {
    organizationId: FAKE_ORG,
    date: "2026-06-19"
  }).then((result) => {
    assert.equal(result.used, false);
    assert.ok(result.warnings.some((w) => w.includes("not available for selected date")));
  });
}

function testFallbackToBrainActivitiesWhenCalendarUnavailable() {
  const prevFixture = process.env.INSTALL_DASHBOARD_USE_FIXTURES;
  process.env.INSTALL_DASHBOARD_USE_FIXTURES = "0";
  process.env.INSTALL_DASHBOARD_FIXTURE_FALLBACK = "0";
  process.env.NODE_ENV = "test";

  const supabase = makeSupabaseMock({
    moraware_report_feeds: () => ({ data: [], error: null }),
    moraware_calendar_schedule_rows: (state) => {
      if (state.countMode) return { count: 0, error: null };
      return { data: [], error: null };
    },
    brain_job_activities: () => ({
      data: [
        {
          id: 1,
          job_id: "job-1",
          activity_type_name: "Install - Granite",
          activity_status: "Confirmed",
          status_name: "Confirmed",
          start_date: "2026-06-19",
          sched_time: "09:00",
          raw_json: { "Assigned To": "Truck A" },
          description: "Install"
        }
      ],
      error: null
    }),
    brain_jobs: () => ({ data: [], error: null }),
    brain_job_addresses: () => ({ data: [], error: null }),
    brain_job_operational_summary: () => ({ data: [], error: null }),
    brain_job_notes_scope_signals: () => ({ data: [], error: null })
  });

  return loadInstallDayPayload(supabase, {
    organizationId: FAKE_ORG,
    date: "2026-06-19"
  }).then((payload) => {
    assert.equal(payload.meta?.source, "brain_job_activities");
    assert.ok(payload.warnings.some((w) => w.includes("Falling back to generic brain_job_activities")));
    assert.ok(payload.warnings.some((w) => w.includes("Calendar schedule feed not configured")));
    assert.equal(payload.jobs.length, 1);
    assert.equal(payload.crew?.truckName, "Truck A");
  }).finally(() => {
    if (prevFixture == null) delete process.env.INSTALL_DASHBOARD_USE_FIXTURES;
    else process.env.INSTALL_DASHBOARD_USE_FIXTURES = prevFixture;
  });
}

function testMissingFieldCountsForCalendarJobs() {
  const job = calendarScheduleRowToInstallJob(
    {
      calendar_date: "",
      scheduled_start_time: null,
      truck_or_crew_name: null,
      activity_status: null,
      activity_type_name: null,
      job_name: "Test",
      address_line1: "",
      city: "",
      customer_name: "",
      material: "",
      color: "",
      sqft: null
    },
    1
  );
  const counts = computeMissingFieldCounts([job]);
  assert.ok(counts.address >= 1);
  assert.ok(counts.scheduledTime >= 1);
  assert.ok(counts.crewTruck >= 1);
}

const tests = [
  ["select columns match production schema", testSelectColumnsMatchProductionSchema],
  ["status prefers status_name", testNormalizeActivityStatusPrefersStatusName],
  ["status falls back to activity_status", testNormalizeActivityStatusFallsBackToActivityStatus],
  ["status falls back to raw_json", testNormalizeActivityStatusFallsBackToRawJson],
  ["status falls back to job_status", testNormalizeActivityStatusFallsBackToJobStatus],
  ["status null when missing", testNormalizeActivityStatusReturnsNullWhenMissing],
  ["type prefers activity_type_name", testNormalizeActivityTypePrefersTypeName],
  ["type falls back to raw_json", testNormalizeActivityTypeFallsBackToRawJson],
  ["type null when missing", testNormalizeActivityTypeReturnsNullWhenMissing],
  ["normalize row tolerates missing optional fields", testNormalizeInstallJobRowMissingOptionalFieldsDoNotThrow],
  ["install-like uses normalized type", testIsInstallLikeActivityUsesNormalizedType],
  ["calendar schedule row maps to install job card", testCalendarScheduleRowMapsToInstallJobCard],
  ["multiple trucks appear in crew picker", testMultipleTrucksAppearInCrewPicker],
  ["no calendar rows returns warning not crash", testCalendarReadReturnsWarningWhenNoRowsForDate],
  ["fallback to brain_job_activities still works", testFallbackToBrainActivitiesWhenCalendarUnavailable],
  ["missing field counts for calendar jobs", testMissingFieldCountsForCalendarJobs]
];

let failed = 0;
(async () => {
  for (const [name, fn] of tests) {
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        await result;
      }
      console.log(`ok ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${name}:`, e?.message || e);
    }
  }

  if (failed) process.exit(1);
  console.log(`installDashboard: all ${tests.length} tests passed`);
})();
