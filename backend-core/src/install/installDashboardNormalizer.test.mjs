/**
 * Install Dashboard normalizer / schema-compat tests.
 *
 * Run: npm run eos:test:install-dashboard
 */
import assert from "node:assert/strict";

import {
  BRAIN_JOB_ACTIVITIES_SELECT,
  BRAIN_JOB_ACTIVITIES_CREWS_SELECT
} from "./installDashboardBrainRead.js";
import {
  isInstallLikeActivity,
  normalizeActivityStatus,
  normalizeActivityType,
  normalizeInstallJobRow
} from "./installDashboardNormalizer.js";

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
  ["install-like uses normalized type", testIsInstallLikeActivityUsesNormalizedType]
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
console.log(`installDashboard: all ${tests.length} tests passed`);
