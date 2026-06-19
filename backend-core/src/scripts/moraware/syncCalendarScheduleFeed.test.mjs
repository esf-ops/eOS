/**
 * syncCalendarScheduleFeed helper tests (no live Moraware/Supabase).
 */
import assert from "node:assert/strict";
import path from "node:path";

import {
  buildCalendarScheduleArtifactDir,
  buildSyncLogSummary
} from "../../scripts/moraware/syncCalendarScheduleFeed.js";

function testBuildArtifactDir() {
  const dir = buildCalendarScheduleArtifactDir("/tmp/calendar", new Date("2026-06-22T04:30:00.000Z"));
  assert.match(dir, /calendar-schedule-2026-06-22T04-30-00/);
  assert.equal(path.basename(path.dirname(dir)), "calendar");
}

function testBuildSyncLogSummary() {
  const summary = buildSyncLogSummary({
    startedAt: "2026-06-22T04:30:00.000Z",
    finishedAt: "2026-06-22T04:31:00.000Z",
    morawareViewId: 222,
    organizationId: "org-1",
    runId: "run-1",
    runStatus: "promoted",
    rawRowCount: 12234,
    rawRowFetchPages: 13,
    scheduleStopsPlanned: 40,
    scheduleStopsPromoted: 40,
    replacedExistingActiveRows: 38,
    artifactDir: "/tmp/x",
    finalStatus: "promoted"
  });
  assert.equal(summary.reportType, "calendar_schedule_rows");
  assert.equal(summary.scheduleStopsPromoted, 40);
  assert.equal(summary.replacedExistingActiveRows, 38);
}

const tests = [
  ["build artifact dir", testBuildArtifactDir],
  ["build sync log summary", testBuildSyncLogSummary]
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}:`, e?.message || e);
  }
}
if (failed) process.exit(1);
console.log(`syncCalendarScheduleFeed: all ${tests.length} tests passed`);
