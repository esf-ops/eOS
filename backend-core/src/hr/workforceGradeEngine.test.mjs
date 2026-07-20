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
  formatGradeTrendDisplay,
  formatScorecardReportLine,
  formatSectionActualDisplay,
  formatWeekLabel,
  formatWeekOptionLabel,
  gradeTrend,
  isManagerRole,
  isWorkforceManager,
  MANAGER_ROLES,
  SCORECARD_WEEK_START_DAY,
  shiftWeekStart,
  sumWeightedMistakes,
  weekEndForWeekStart,
  weekStartForIsoDate
} from "./workforceGradeEngine.js";

assert.equal(SCORECARD_WEEK_START_DAY, 4, "scorecard weeks start on Thursday");

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

// Thursday–Wednesday week boundaries
assert.equal(weekStartForIsoDate("2026-07-09"), "2026-07-09"); // Thursday
assert.equal(weekStartForIsoDate("2026-07-10"), "2026-07-09"); // Friday → prior Thursday
assert.equal(weekStartForIsoDate("2026-07-15"), "2026-07-09"); // Wednesday → week start Thu
assert.equal(weekStartForIsoDate("2026-07-16"), "2026-07-16"); // next Thursday
assert.equal(weekEndForWeekStart("2026-07-09"), "2026-07-15");
assert.equal(shiftWeekStart("2026-07-16", -1), "2026-07-09");

// Month / year boundary labels
assert.equal(formatWeekLabel("2026-07-09", "2026-07-15"), "July 9–15");
assert.equal(formatWeekLabel("2026-07-30", "2026-08-05"), "July 30–August 5");
assert.equal(formatWeekLabel("2026-12-31", "2027-01-06"), "December 31, 2026–January 6, 2027");

assert.equal(
  formatWeekOptionLabel("2026-07-16", "2026-07-22", {
    currentWeekStart: "2026-07-16",
    lastWeekStart: "2026-07-09"
  }),
  "Current week · July 16–22"
);
assert.equal(
  formatWeekOptionLabel("2026-07-09", "2026-07-15", {
    currentWeekStart: "2026-07-16",
    lastWeekStart: "2026-07-09"
  }),
  "Last week · July 9–15"
);

assert.equal(formatGradeTrendDisplay("Plumbing accessories non billable service calls", "A", "B", "up"), "A ↑ last week B");
assert.equal(formatGradeTrendDisplay("Office", "F", "C", "down"), "F ↓ last week C");
assert.equal(formatGradeTrendDisplay("Office", "A", "A", "flat"), "A → last week A");
assert.equal(formatGradeTrendDisplay("Office", "A", null, "neutral"), "No prior week");
assert.equal(formatGradeTrendDisplay("Long name that would truncate", "A", "B", "up").includes("…"), false);

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

const weighted = sumWeightedMistakes([{ severity: "minor" }, { severity: "major" }]);
assert.equal(weighted, 4);

const breakdown = buildCategoryBreakdown([{ category_label: "Takeoff" }, { category_label: "Other" }]);
assert.deepEqual(breakdown, { Takeoff: 1, Other: 1 });

assert.equal(gradeTrend("A", "B"), "up");

assert.ok(MANAGER_ROLES instanceof Set);
assert.equal(isManagerRole("admin"), true);
assert.equal(isWorkforceManager({ role: "viewer" }), false);
assert.equal(isWorkforceManager({ role: "executive" }), true);

console.log("workforceGradeEngine.test.mjs: ok");
