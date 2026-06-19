/**
 * Install Dashboard Smart Stop Brief tests.
 */
import assert from "node:assert/strict";

import {
  buildInstallDaySmartSummary,
  buildInstallSmartBrief
} from "./installDashboardSmartBrief.js";
import { finalizeInstallJobCard } from "./installDashboardNormalizer.js";

function baseJob(overrides = {}) {
  return finalizeInstallJobCard({
    id: "job-1",
    jobName: "Smith Kitchen Install",
    accountName: "Smith",
    scheduledStart: "2026-06-22T08:00:00-06:00",
    address: {
      line1: "123 Main St",
      line2: "",
      city: "Dubuque",
      state: "IA",
      postalCode: "52001"
    },
    contact: { name: "Jane Smith", phone: "563-555-0100", email: "", allPhones: ["563-555-0100"] },
    scope: { sqft: 45, material: "Quartz", color: "White", edge: "Eased" },
    notes: [],
    warnings: [],
    riskFlags: [],
    ...overrides
  });
}

function testMissingPhoneBadge() {
  const job = baseJob({ contact: { name: "Jane", phone: "", allPhones: [] }, primaryPhone: "", allPhones: [] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Missing phone"));
  assert.equal(job.smartBrief.severity, "warning");
}

function testMissingAddressCritical() {
  const job = baseJob({
    address: { line1: "", city: "", state: "", postalCode: "" },
    formattedAddress: ""
  });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Missing address"));
  assert.equal(job.smartBrief.severity, "critical");
  assert.ok(job.smartBrief.missingFields.includes("address"));
}

function testCallAheadDetection() {
  const job = baseJob({ notes: ["Please call when in route — 30 minutes out"] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Call ahead"));
}

function testAccessNoteDetection() {
  const job = baseJob({ notes: ["Garage code 4455 · lockbox on gate"] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Access note"));
}

function testSiteAccessDetection() {
  const job = baseJob({ notes: ["Use alley parking · stairs to 3rd floor · hard hat required"] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Site access"));
}

function testTearOutDetection() {
  const job = baseJob({ activityType: "Tear out and Install", notes: [] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Tear out"));
}

function testWaterfallDetection() {
  const job = baseJob({ scope: { sqft: 40, material: "Quartz waterfall edge", color: "Gray", edge: "" } });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Waterfall"));
}

function testFullHeightBacksplashDetection() {
  const job = baseJob({ notes: ["Full Hgt backsplash on sink wall"] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Full-height backsplash"));
}

function testLargeJobDetection() {
  const job = baseJob({ scope: { sqft: 120, material: "Quartz", color: "White", edge: "" } });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Large job"));
  const huge = baseJob({ scope: { sqft: 180, material: "Quartz", color: "White", edge: "" } });
  assert.ok(huge.smartBrief.badges.some((b) => b.label === "Very large job"));
}

function testLaborNoteDetection() {
  const job = baseJob({ notes: ["Need 3rd guy and brace support for heavy island"] });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Labor note"));
}

function testPremiumMaterialDetection() {
  const job = baseJob({ scope: { sqft: 50, material: "Quartzite", color: "Taj Mahal", edge: "" } });
  assert.ok(job.smartBrief.badges.some((b) => b.label === "Premium/fragile material"));
}

function testNormalJobIsClean() {
  const job = baseJob();
  assert.equal(job.smartBrief.severity, "ok");
  assert.equal(job.smartBrief.badges.length, 0);
  assert.equal(job.smartBrief.missingFields.length, 0);
}

function testJobNamePrimaryTitle() {
  const job = baseJob({ jobName: "Anderson Full Kitchen", contact: { name: "Bob Anderson", phone: "563-555-0100" } });
  assert.equal(job.displayStopName, "Anderson Full Kitchen");
}

function testDaySummaryCounts() {
  const jobs = [
    baseJob({ notes: ["Call when on way"] }),
    baseJob({ id: "job-2", notes: ["Gate code 1234"], contact: { phone: "", allPhones: [] } }),
    baseJob({ id: "job-3", activityType: "Waterfall install", scope: { sqft: 170, material: "Quartz", color: "X", edge: "" } })
  ];
  const summary = buildInstallDaySmartSummary(jobs);
  assert.equal(summary.callAheadCount, 1);
  assert.equal(summary.accessNoteCount, 1);
  assert.equal(summary.missingPhoneCount, 1);
  assert.equal(summary.totalStops, 3);
  assert.ok(summary.totalSqft >= 170);
}

const tests = [
  ["missing phone badge", testMissingPhoneBadge],
  ["missing address critical severity", testMissingAddressCritical],
  ["call-ahead detection", testCallAheadDetection],
  ["access note detection", testAccessNoteDetection],
  ["site access detection", testSiteAccessDetection],
  ["tear-out detection", testTearOutDetection],
  ["waterfall detection", testWaterfallDetection],
  ["full-height backsplash detection", testFullHeightBacksplashDetection],
  ["large job detection", testLargeJobDetection],
  ["labor note detection", testLaborNoteDetection],
  ["premium material detection", testPremiumMaterialDetection],
  ["no false critical on normal job", testNormalJobIsClean],
  ["job_name primary stop title", testJobNamePrimaryTitle],
  ["day-level summary counts", testDaySummaryCounts]
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
console.log(`installDashboardSmartBrief: all ${tests.length} tests passed`);
