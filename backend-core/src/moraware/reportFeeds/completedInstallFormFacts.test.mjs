/**
 * View 219 completed-install form facts — crediting rules and holdouts.
 */
import assert from "node:assert/strict";

import {
  extractEarliestQualifyingFirstInstall,
  isQualifyingFirstInstallStatus,
  FORM_IDENTITY_MATCHED,
  FORM_IDENTITY_UNRESOLVED,
  JOB_IDENTITY_UNRESOLVED
} from "./extractFirstInstall.js";
import {
  buildFormIdentityLookup,
  planCompletedInstallFormFacts
} from "./resolveCompletedInstallFormIdentity.js";
import {
  observationKeyForFact,
  planCompletedInstallSupersede,
  toCompletedInstallInsertRow
} from "./promoteCompletedInstallFormFacts.js";

function raw(statusByType, extra = {}) {
  const row = {
    "Job Worksheet - Form Name": extra.formName ?? "Kitchen",
    "Total Job Worksheet - Sq.Ft. by Job Creation Date": extra.sqft ?? "10"
  };
  for (const [type, spec] of Object.entries(statusByType)) {
    row[`First Install - ${type} in Job Status`] = spec.status ?? "";
    row[`First Install - ${type} in Job Date`] = spec.date ?? "";
  }
  return row;
}

function testQualifyingStatuses() {
  assert.equal(isQualifyingFirstInstallStatus("Complete"), true);
  assert.equal(isQualifyingFirstInstallStatus("Installed"), true);
  assert.equal(isQualifyingFirstInstallStatus("completed"), true);
  assert.equal(isQualifyingFirstInstallStatus("Scheduled"), false);
  assert.equal(isQualifyingFirstInstallStatus("Confirmed"), false);
  assert.equal(isQualifyingFirstInstallStatus("Estimate"), false);
  assert.equal(isQualifyingFirstInstallStatus("Cancelled"), false);
}

function testEarliestQualifyingDate() {
  const hit = extractEarliestQualifyingFirstInstall(
    raw({
      "Quartz Basic": { status: "Scheduled", date: "5/1/2026" },
      "Granite Basic": { status: "Complete", date: "6/15/2026" },
      "Waterfalls": { status: "Installed", date: "6/10/2026" },
      "Quartz Challenging": { status: "Confirmed", date: "4/1/2026" },
      "Granite Challenging": { status: "Estimate", date: "3/1/2026" }
    })
  );
  assert.equal(hit.date, "2026-06-10");
  assert.equal(hit.status, "Installed");
  assert.equal(hit.activityType, "Waterfalls");
}

function testFormHoldoutAndUniqueJoin() {
  const lookup = buildFormIdentityLookup([
    { source_job_id: "10", source_form_id: "f1", form_name_raw: "Kitchen", source_account_id: "a1" },
    { source_job_id: "20", source_form_id: "f2", form_name_raw: "Bath", source_account_id: "a2" },
    { source_job_id: "20", source_form_id: "f3", form_name_raw: "Bath", source_account_id: "a2" }
  ]);
  assert.equal(lookup.summary.uniqueGroups, 1);
  assert.equal(lookup.summary.ambiguousGroups, 1);

  const planned = planCompletedInstallFormFacts({
    organizationId: "org",
    reportFeedId: "feed",
    reportRunId: "run",
    formLookup: lookup.lookup,
    rawRows: [
      {
        id: "r1",
        row_hash: "h1",
        job_id: "10",
        account_id: "a1",
        raw_row: raw({ "Quartz Basic": { status: "Complete", date: "5/2/2026" } }, { formName: "Kitchen", sqft: "12.5" })
      },
      {
        id: "r2",
        row_hash: "h2",
        job_id: "10",
        account_id: "a1",
        raw_row: raw({ "Quartz Basic": { status: "Complete", date: "5/2/2026" } }, { formName: "Kitchen", sqft: "7.5" })
      },
      {
        id: "r3",
        row_hash: "h3",
        job_id: "20",
        account_id: "a2",
        raw_row: raw({ "Quartz Basic": { status: "Complete", date: "5/2/2026" } }, { formName: "Bath", sqft: "40" })
      },
      {
        id: "r4",
        row_hash: "h4",
        job_id: "",
        raw_row: raw({ "Quartz Basic": { status: "Complete", date: "5/2/2026" } }, { formName: "Other", sqft: "9" })
      }
    ]
  });

  const kitchen = planned.facts.find((f) => f.source_form_id === "f1");
  assert.equal(kitchen.sqft, 20);
  assert.equal(kitchen.completed_install_date, "2026-05-02");
  assert.equal(kitchen.form_identity_status, FORM_IDENTITY_MATCHED);
  assert.equal(kitchen.creditable, true);

  const bath = planned.facts.find((f) => f.source_job_id === "20");
  assert.equal(bath.form_identity_status, FORM_IDENTITY_UNRESOLVED);
  assert.equal(bath.source_form_id, null);
  assert.equal(bath.creditable, false);

  const noJob = planned.facts.find((f) => f.form_identity_status === JOB_IDENTITY_UNRESOLVED);
  assert.ok(noJob);
  assert.equal(noJob.creditable, false);
  assert.equal(planned.counts.formUnresolved, 1);
  assert.equal(planned.counts.jobUnresolved, 1);
  assert.equal(planned.counts.matched, 1);
}

function testSupersedeDoesNotDoubleCount() {
  const fact = {
    organization_id: "org",
    report_feed_id: "feed",
    report_run_id: "run-2",
    source_job_id: "10",
    source_form_id: "f1",
    source_account_id: "a1",
    form_name_raw: "Kitchen",
    form_identity_status: FORM_IDENTITY_MATCHED,
    completed_install_status: "Complete",
    completed_install_activity_type: "Quartz Basic",
    completed_install_date: "2026-05-02",
    sqft: 20,
    source_row_hashes: ["h1", "h2"],
    creditable: true
  };
  const incoming = [toCompletedInstallInsertRow(fact, { promotedAt: "2026-08-28T00:00:00.000Z", sourceUpdatedAt: "2026-08-28T00:00:00.000Z" })];
  const existing = [{ id: "old", observation_key: incoming[0].observation_key, source_job_id: "10", source_form_id: "f1" }];
  const plan = planCompletedInstallSupersede({ existingActiveFacts: existing, incomingFacts: incoming });
  assert.equal(plan.safe, true);
  assert.equal(plan.deactivateCount, 1);
  assert.equal(plan.insertCount, 1);
  assert.equal(observationKeyForFact(fact), incoming[0].observation_key);

  const empty = planCompletedInstallSupersede({ existingActiveFacts: existing, incomingFacts: [] });
  assert.equal(empty.safe, false);
}

const tests = [
  ["qualifying statuses", testQualifyingStatuses],
  ["earliest qualifying date", testEarliestQualifyingDate],
  ["unique form join and holdout", testFormHoldoutAndUniqueJoin],
  ["supersede replaces rather than doubles", testSupersedeDoesNotDoubleCount]
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
console.log(`completedInstallFormFacts.test.mjs: all ${tests.length} tests passed`);
