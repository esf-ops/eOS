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
  crewFromAssignedLabel,
  INSTALL_DASHBOARD_ALLOWED_CREW_LABELS,
  isInstallDashboardAllowedCrew,
  filterInstallDashboardCalendarRows,
  sortInstallDashboardCrews
} from "./installDashboardNormalizer.js";
import {
  mapCalendarScheduleRow,
  calendarScheduleRowToInstallJob,
  computeMissingFieldCounts,
  aggregateCalendarScheduleRows,
  buildCalendarScheduleGroupKey,
  normalizeCalendarRawRow,
  pickCalendarField
} from "../moraware/reportFeeds/mapCalendarScheduleRow.js";
import {
  CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
  CALENDAR_SCHEDULE_CORE_COLUMN_HASH,
  CALENDAR_SCHEDULE_VIEW_ID
} from "../moraware/reportFeeds/calendarScheduleConstants.js";
import { parseCsvReportRows } from "../moraware/reportFeeds/parseCsv.js";
import { profileReportColumns, validateHeaderContract } from "../moraware/reportFeeds/profileColumns.js";

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
  assert.ok(row.warnings.includes("Address missing"));
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

function testView222ExpectedHeadersMatchFixture() {
  const parsed = parseCsvReportRows(calendarCsv);
  assert.equal(parsed.headers.length, CALENDAR_SCHEDULE_EXPECTED_COLUMNS.length);
  for (const expected of CALENDAR_SCHEDULE_EXPECTED_COLUMNS) {
    assert.ok(parsed.headers.includes(expected), `missing header: ${expected}`);
  }
  const profile = profileReportColumns(parsed);
  const validation = validateHeaderContract(
    profile,
    CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
    CALENDAR_SCHEDULE_CORE_COLUMN_HASH
  );
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal(CALENDAR_SCHEDULE_VIEW_ID, 222);
}

function testNbspHeaderNormalizationMatchesExpectedContract() {
  const parsed = parseCsvReportRows(calendarCsv);
  const dirtyHeaders = parsed.headers.map((h, i) =>
    i === 0 ? `${h}\u00A0 ` : h
  );
  const dirtyRow = {};
  for (let i = 0; i < dirtyHeaders.length; i++) {
    dirtyRow[dirtyHeaders[i]] = parsed.rows[0][parsed.headers[i]];
  }
  const normalized = normalizeCalendarRawRow(dirtyRow);
  assert.equal(
    pickCalendarField(normalized, ["Job Activity"]),
    pickCalendarField(parsed.rows[0], ["Job Activity"])
  );
}

function mapAllFixtureLines() {
  const parsed = parseCsvReportRows(calendarCsv);
  return parsed.rows.map((rawRow, i) =>
    mapCalendarScheduleRow({
      rawRow,
      organizationId: FAKE_ORG,
      jobId: `job-${i}`,
      sourceViewId: CALENDAR_SCHEDULE_VIEW_ID
    })
  );
}

function testCalendarScheduleRowMapsToInstallJobCard() {
  const [mapped] = aggregateCalendarScheduleRows(mapAllFixtureLines());
  assert.equal(mapped.calendar_date, "2026-06-19");
  assert.equal(mapped.truck_or_crew_name, "Truck A");
  assert.equal(mapped.job_name, "Sample Kitchen Job");
  assert.equal(mapped.sqft, 42.5);

  const job = calendarScheduleRowToInstallJob(mapped, 1);
  assert.equal(job.displayStopName, "Sample Kitchen Job");
  assert.equal(job.stopName, "Sample Kitchen Job");
  assert.equal(job.jobName, "Sample Kitchen Job");
  assert.notEqual(job.displayStopName, job.contactName);
  assert.equal(job.contactName, "Jane Sample");
  assert.equal(job.customerName, "Sample Builders LLC");
  assert.equal(job.accountName, "Sample Builders LLC");
  assert.equal(job.address.line1, "123 Oak St");
  assert.equal(job.address.line2, "Unit 2");
  assert.equal(job.primaryPhone, "319-555-0101");
  assert.deepEqual(job.allPhones, ["319-555-0101", "319-555-0100"]);
  assert.equal(job.contact.phone, "319-555-0101");
  assert.equal(job.contact.email, "jane@example.com");
  assert.equal(job.scope.sqft, 42.5);
  assert.deepEqual(job.scope.rooms, ["Kitchen", "Island"]);
  assert.ok(job.scope.color.includes("Cloud White"));
  assert.ok(job.scope.color.includes("Midnight Black"));
  assert.match(job.scheduledStart ?? "", /2026-06-19T08:00:00/);
  assert.ok(job.formattedAddress.includes("123 Oak St"));
}

function testDuplicateWorksheetRowsAggregateToOneStop() {
  const lines = mapAllFixtureLines();
  assert.equal(lines.length, 3);
  const aggregated = aggregateCalendarScheduleRows(lines);
  assert.equal(aggregated.length, 2);
  const kitchen = aggregated.find((r) => r.job_name === "Sample Kitchen Job");
  assert.ok(kitchen);
  assert.equal(
    buildCalendarScheduleGroupKey(kitchen),
    buildCalendarScheduleGroupKey(lines[0])
  );
  assert.equal(kitchen.raw_payload?.aggregated?.sourceRowCount, 2);
}

function testSqftSumsAcrossWorksheetLines() {
  const aggregated = aggregateCalendarScheduleRows(mapAllFixtureLines());
  const kitchen = aggregated.find((r) => r.job_name === "Sample Kitchen Job");
  assert.equal(kitchen?.sqft, 42.5);
  assert.equal(kitchen?.raw_payload?.aggregated?.worksheetSqftTotal, 42.5);
}

function testMultipleColorsAndRoomsCollected() {
  const kitchen = aggregateCalendarScheduleRows(mapAllFixtureLines()).find(
    (r) => r.job_name === "Sample Kitchen Job"
  );
  assert.deepEqual(kitchen?.raw_payload?.aggregated?.rooms, ["Kitchen", "Island"]);
  assert.deepEqual(kitchen?.raw_payload?.aggregated?.colors, ["Cloud White", "Midnight Black"]);
  const job = calendarScheduleRowToInstallJob(kitchen, 1);
  assert.deepEqual(job.scope.rooms, ["Kitchen", "Island"]);
}

function testMultipleTrucksAppearInCrewPicker() {
  const aggregated = aggregateCalendarScheduleRows(mapAllFixtureLines());
  const labels = new Set(aggregated.map((r) => r.truck_or_crew_name));
  assert.equal(labels.size, 2);
  assert.ok(labels.has("Truck A"));
  assert.ok(labels.has("Truck B"));
  const crews = [...labels].map((label) => crewFromAssignedLabel(label));
  assert.equal(crews.length, 2);
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

function testAllowedCrewFilterIncludesOnlyFieldCrews() {
  for (const crew of INSTALL_DASHBOARD_ALLOWED_CREW_LABELS) {
    assert.equal(isInstallDashboardAllowedCrew(crew), true, crew);
  }
  assert.equal(isInstallDashboardAllowedCrew("Brayden / Saw Program"), false);
  assert.equal(isInstallDashboardAllowedCrew("Saw Program"), false);
  assert.equal(isInstallDashboardAllowedCrew("Shop Production"), false);
}

function testAllowedCrewFilterExcludesNonAllowlistedRows() {
  const rows = [
    { truck_or_crew_name: "Truck A" },
    { truck_or_crew_name: "Truck B" },
    { truck_or_crew_name: "Brayden / Saw Program" },
    { truck_or_crew_name: "Template - Dyersville" }
  ];
  const filtered = filterInstallDashboardCalendarRows(rows);
  assert.equal(filtered.totalRowCount, 4);
  assert.equal(filtered.rows.length, 3);
  assert.equal(filtered.excludedRowCount, 1);
}

function testAllowedCrewsSortInConfiguredOrder() {
  const crews = sortInstallDashboardCrews([
    crewFromAssignedLabel("Template - Dyersville"),
    crewFromAssignedLabel("Truck C"),
    crewFromAssignedLabel("Truck A")
  ]);
  assert.deepEqual(
    crews.map((c) => c.name),
    ["Truck A", "Truck C", "Template - Dyersville"]
  );
}

function testJobNameIsPrimaryStopTitleNotContactName() {
  const job = calendarScheduleRowToInstallJob(
    {
      calendar_date: "2026-06-22",
      scheduled_start_time: "08:00",
      truck_or_crew_name: "Truck A",
      job_name: "Meyer, Bill##",
      customer_name: "Bill Meyer",
      account_name: "Meyer, Bill##",
      address_line1: "310 Palisades Rd",
      city: "Mt. Vernon",
      state: "IA",
      postal_code: "52314",
      activity_status: "Confirmed",
      activity_type_name: "Install - Quartz Basic",
      sqft: 12,
      material: "Quartz",
      color: "Moonflakes",
      raw_payload: { phone1: "319-555-0100" }
    },
    1
  );
  assert.equal(job.displayStopName, "Meyer, Bill##");
  assert.equal(job.contactName, "Bill Meyer");
  assert.notEqual(job.displayStopName, job.contactName);
}

function testMissingPhoneAndAddressWarnings() {
  const job = calendarScheduleRowToInstallJob(
    {
      calendar_date: "2026-06-22",
      scheduled_start_time: "08:00",
      truck_or_crew_name: "Truck A",
      job_name: "No Contact Job",
      customer_name: "",
      account_name: "",
      address_line1: "",
      city: "",
      activity_status: "Confirmed",
      activity_type_name: "Install",
      sqft: 10,
      material: "Quartz",
      color: "White",
      raw_payload: {}
    },
    1
  );
  assert.ok(job.warnings.some((w) => /address/i.test(w)));
  assert.ok(job.warnings.some((w) => /phone/i.test(w)));
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
  ["view 222 expected headers match fixture", testView222ExpectedHeadersMatchFixture],
  ["NBSP header normalization matches contract", testNbspHeaderNormalizationMatchesExpectedContract],
  ["calendar schedule row maps to install job card", testCalendarScheduleRowMapsToInstallJobCard],
  ["duplicate worksheet rows aggregate to one stop", testDuplicateWorksheetRowsAggregateToOneStop],
  ["sqft sums across worksheet lines", testSqftSumsAcrossWorksheetLines],
  ["multiple colors and rooms collected", testMultipleColorsAndRoomsCollected],
  ["multiple trucks appear in crew picker", testMultipleTrucksAppearInCrewPicker],
  ["no calendar rows returns warning not crash", testCalendarReadReturnsWarningWhenNoRowsForDate],
  ["fallback to brain_job_activities still works", testFallbackToBrainActivitiesWhenCalendarUnavailable],
  ["allowed crew filter includes only field crews", testAllowedCrewFilterIncludesOnlyFieldCrews],
  ["allowed crew filter excludes non-allowlisted rows", testAllowedCrewFilterExcludesNonAllowlistedRows],
  ["allowed crews sort in configured order", testAllowedCrewsSortInConfiguredOrder],
  ["job_name is primary stop title not contact name", testJobNameIsPrimaryStopTitleNotContactName],
  ["missing phone and address warnings", testMissingPhoneAndAddressWarnings],
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
