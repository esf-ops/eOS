import assert from "node:assert/strict";
import {
  buildCategoryBreakdown,
  computeDowntimeHoursGrade,
  computeLeadTimeMedianGrade,
  computeLetterGrade,
  computeOverallCompanyGrade,
  computeProductionWeeklyGrade,
  computeSectionCountGrade,
  computeZeroGoalCountGrade,
  formatScorecardReportLine,
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

assert.equal(computeZeroGoalCountGrade(0), "A");
assert.equal(computeZeroGoalCountGrade(1), "B");
assert.equal(computeZeroGoalCountGrade(2), "C");
assert.equal(computeZeroGoalCountGrade(3), "D");
assert.equal(computeZeroGoalCountGrade(4), "F");
assert.equal(computeZeroGoalCountGrade(13), "F");

assert.equal(computeLeadTimeMedianGrade(14), "A");
assert.equal(computeLeadTimeMedianGrade(15), "C");
assert.equal(computeLeadTimeMedianGrade(17), "F");

assert.equal(computeProductionWeeklyGrade(9250), "A");
assert.equal(computeProductionWeeklyGrade(8801), "B");
assert.equal(computeProductionWeeklyGrade(8000), "F");

assert.equal(computeDowntimeHoursGrade(0), "A");
assert.equal(computeDowntimeHoursGrade(2), "A");
assert.equal(computeDowntimeHoursGrade(2.1), "B");
assert.equal(computeDowntimeHoursGrade(4), "B");
assert.equal(computeDowntimeHoursGrade(5), "C");
assert.equal(computeDowntimeHoursGrade(6), "C");
assert.equal(computeDowntimeHoursGrade(7), "D");
assert.equal(computeDowntimeHoursGrade(8), "D");
assert.equal(computeDowntimeHoursGrade(9), "F");

assert.equal(computeSectionCountGrade(1), "B");
assert.equal(computeSectionCountGrade(3), "D");
assert.equal(computeSectionCountGrade(4), "F");

const productionSection = {
  metricKind: "production",
  goalNumeric: 9250,
  gradingEnabled: true,
  goalDisplay: "9,250sf weekly / 1,850sf daily"
};
assert.ok(formatSectionActualDisplay(productionSection, 0, {
  valuePayload: { weekly_sf: 8801, daily_sf: 1760 }
}).includes("8,801"));

assert.equal(
  formatScorecardReportLine(
    { name: "Office induced service calls/remakes", metricKind: "count", goalDisplay: "0" },
    { actualDisplay: "0", letterGrade: "A" }
  ),
  "Office induced service calls/remakes = 0 *Goal = 0 Grade = A"
);

assert.equal(computeOverallCompanyGrade([{ letterGrade: "A" }, { letterGrade: "F" }]), "C");

assert.equal(weekStartForIsoDate("2026-07-01"), "2026-06-29");
assert.equal(weekEndForWeekStart("2026-06-29"), "2026-07-05");

const weighted = sumWeightedMistakes([{ severity: "minor" }, { severity: "major" }]);
assert.equal(weighted, 4);

const breakdown = buildCategoryBreakdown([{ category_label: "Takeoff" }, { category_label: "Other" }]);
assert.deepEqual(breakdown, { Takeoff: 1, Other: 1 });

assert.equal(gradeTrend("A", "B"), "up");
assert.ok(formatWeekLabel("2026-06-30", "2026-07-06").includes("Jun"));

assert.ok(MANAGER_ROLES instanceof Set);
assert.equal(isManagerRole("admin"), true);
assert.equal(isWorkforceManager({ role: "viewer" }), false);

console.log("workforceGradeEngine.test.mjs: ok");
