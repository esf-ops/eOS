import assert from "node:assert/strict";
import {
  buildCategoryBreakdown,
  computeLetterGrade,
  computeSectionCountGrade,
  computeSectionDaysGrade,
  computeSectionProductionGrade,
  formatSectionActualDisplay,
  formatWeekLabel,
  gradeTrend,
  isManagerRole,
  isWorkforceManager,
  MANAGER_ROLES,
  sumWeightedMistakes,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";

assert.equal(computeLetterGrade(0), "A");
assert.equal(computeLetterGrade(1), "A");
assert.equal(computeLetterGrade(2), "B");
assert.equal(computeLetterGrade(4), "C");
assert.equal(computeLetterGrade(8), "D");
assert.equal(computeLetterGrade(11), "F");

assert.equal(computeSectionCountGrade(0), "A");
assert.equal(computeSectionCountGrade(1), "B");
assert.equal(computeSectionCountGrade(2), "C");
assert.equal(computeSectionCountGrade(5), "F");
assert.equal(computeSectionCountGrade(13), "F");

assert.equal(computeSectionDaysGrade(14, 14), "A");
assert.equal(computeSectionDaysGrade(15, 14), "B");
assert.equal(computeSectionDaysGrade(17, 14), "C");

assert.equal(computeSectionProductionGrade(9250, 9250), "A");
assert.equal(computeSectionProductionGrade(8801, 9250), "B");
assert.equal(computeSectionProductionGrade(8000, 9250), "C");

const productionSection = {
  metricKind: "production",
  goalNumeric: 9250,
  gradingEnabled: true,
  goalDisplay: "9,250sf weekly"
};
assert.ok(formatSectionActualDisplay(productionSection, 0, { actualNumeric: 8801 }).includes("8,801"));

assert.equal(weekStartForIsoDate("2026-07-01"), "2026-06-29"); // Wed → Mon
assert.equal(weekStartForIsoDate("2026-06-30"), "2026-06-29"); // Tue → Mon
assert.equal(weekStartForIsoDate("2026-06-29"), "2026-06-29"); // Mon
assert.equal(weekEndForWeekStart("2026-06-30"), "2026-07-06");

const weighted = sumWeightedMistakes([
  { severity: "minor" },
  { severity: "major" },
  { severity: "moderate" }
]);
assert.equal(weighted, 6);

const breakdown = buildCategoryBreakdown([
  { category_label: "Takeoff" },
  { category_label: "Takeoff" },
  { category_label: "Other" }
]);
assert.deepEqual(breakdown, { Takeoff: 2, Other: 1 });

assert.equal(gradeTrend("A", "B"), "up");
assert.equal(gradeTrend("C", "A"), "down");
assert.equal(gradeTrend("B", "B"), "flat");

assert.ok(formatWeekLabel("2026-06-30", "2026-07-06").includes("Jun"));

assert.ok(MANAGER_ROLES instanceof Set);
assert.equal(isManagerRole("admin"), true);
assert.equal(isManagerRole("executive"), true);
assert.equal(isManagerRole("hr"), true);
assert.equal(isManagerRole("super_admin"), true);
assert.equal(isManagerRole("viewer"), false);
assert.equal(isManagerRole("sales"), false);
assert.equal(isManagerRole(undefined), false);
assert.equal(isManagerRole(null), false);
assert.equal(isManagerRole(""), false);

assert.equal(isWorkforceManager({ role: "admin" }), true);
assert.equal(isWorkforceManager({ role: "viewer" }), false);
assert.equal(isWorkforceManager(undefined), false);
assert.equal(isWorkforceManager(null), false);
assert.equal(isWorkforceManager({}), false);
assert.doesNotThrow(() => isWorkforceManager({ role: undefined }));

console.log("workforceGradeEngine.test.mjs: ok");
