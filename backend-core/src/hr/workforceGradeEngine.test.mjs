import assert from "node:assert/strict";
import {
  buildCategoryBreakdown,
  computeLetterGrade,
  formatWeekLabel,
  gradeTrend,
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

console.log("workforceGradeEngine.test.mjs: ok");
