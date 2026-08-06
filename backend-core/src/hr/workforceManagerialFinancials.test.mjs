/**
 * Managerial Financial Metrics helpers.
 * Run: npm run eos:test:hr-workforce
 */

import assert from "node:assert/strict";
import {
  MANAGERIAL_AP_OVER_30_SECTION_ID,
  MANAGERIAL_AR_OVER_45_SECTION_ID,
  MANAGERIAL_FINANCIAL_SECTIONS,
  MANAGERIAL_FINANCIAL_SECTION_IDS,
  MANAGERIAL_FINANCIALS_SLUG,
  MANAGERIAL_LOC_SECTION_ID,
  buildCurrencyWeekComparison,
  buildManagerialFinancialReportHtml,
  buildManagerialFinancialReportText,
  formatUsdCurrency,
  hasManagerialFinancialsAssignment,
  isManagerialFinancialSectionId,
  isManagerialFinancialsSlug,
  partitionScorecardRows
} from "./workforceManagerialFinancials.js";

assert.equal(MANAGERIAL_FINANCIALS_SLUG, "managerial_financials");
assert.equal(MANAGERIAL_FINANCIAL_SECTIONS.length, 3);
assert.equal(MANAGERIAL_FINANCIAL_SECTION_IDS.size, 3);
assert.ok(MANAGERIAL_FINANCIAL_SECTION_IDS.has(MANAGERIAL_LOC_SECTION_ID));
assert.ok(MANAGERIAL_FINANCIAL_SECTION_IDS.has(MANAGERIAL_AR_OVER_45_SECTION_ID));
assert.ok(MANAGERIAL_FINANCIAL_SECTION_IDS.has(MANAGERIAL_AP_OVER_30_SECTION_ID));

for (const section of MANAGERIAL_FINANCIAL_SECTIONS) {
  assert.equal(section.metricKind, "currency");
  assert.equal(section.gradingEnabled, false);
  assert.equal(isManagerialFinancialSectionId(section.id), true);
}

assert.equal(isManagerialFinancialSectionId("b2000001-0001-4001-8001-000000000007"), false);
assert.equal(isManagerialFinancialsSlug("managerial_financials"), true);
assert.equal(hasManagerialFinancialsAssignment([{ slug: "managerial_financials" }]), true);
assert.equal(hasManagerialFinancialsAssignment([{ slug: "plumbing" }]), false);
assert.equal(
  hasManagerialFinancialsAssignment([{ slug: "managerial_financials", is_active: false }]),
  false
);

assert.equal(formatUsdCurrency(799198), "$799,198.00");
assert.equal(formatUsdCurrency(null), null);

const noPrior = buildCurrencyWeekComparison(1000, null, { priorWeekExists: false });
assert.equal(noPrior.trendText, "No prior week");
assert.equal(noPrior.direction, "none");
assert.equal(noPrior.percentChange, null);

const up = buildCurrencyWeekComparison(125000, 100000, { priorWeekExists: true });
assert.equal(up.direction, "up");
assert.equal(up.dollarChange, 25000);
assert.ok(up.dollarChangeText.includes("Up"));
assert.ok(up.percentChangeText.includes("Up"));
assert.ok(Math.abs((up.percentChange ?? 0) - 25) < 0.001);

const down = buildCurrencyWeekComparison(92000, 100000, { priorWeekExists: true });
assert.equal(down.direction, "down");
assert.ok(down.dollarChangeText.includes("Down"));
assert.ok(down.percentChangeText?.includes("8.0%"));

const zeroPrior = buildCurrencyWeekComparison(500, 0, { priorWeekExists: true });
assert.equal(zeroPrior.percentChange, null, "zero prior avoids invalid percentage");
assert.ok(zeroPrior.dollarChangeText.includes("Up"));

const same = buildCurrencyWeekComparison(50, 50, { priorWeekExists: true });
assert.equal(same.direction, "same");
assert.ok(same.dollarChangeText.toLowerCase().includes("unchanged"));

const partitioned = partitionScorecardRows([
  { sectionId: "b2000001-0001-4001-8001-000000000007", name: "Weekly quoting value" },
  { sectionId: MANAGERIAL_LOC_SECTION_ID, name: "Line of Credit Balance" }
]);
assert.equal(partitioned.operationalRows.length, 1);
assert.equal(partitioned.managerialRows.length, 1);

const metrics = [
  {
    name: "Line of Credit Balance",
    currentDisplay: "$100.00",
    priorDisplay: "$90.00",
    dollarChangeText: "Up $10.00 from last week",
    percentChangeText: "Up 11.1% from last week",
    trendText: "Up $10.00 from last week · Up 11.1% from last week"
  }
];
const text = buildManagerialFinancialReportText(metrics, {
  weekLabel: "Test week",
  weekStart: "2026-06-25",
  weekEnd: "2026-07-01",
  generatedAt: "2026-07-02T12:00:00.000Z"
});
assert.ok(text.includes("Managerial Financial Report"));
assert.ok(text.includes("Line of Credit Balance"));
assert.equal(text.includes("Office induced"), false);
assert.ok(text.includes("does not include operational grades, mistakes"), "disclaimer only; no operational content");
assert.equal(text.includes("overall grade"), false);
assert.equal(text.includes("Weekly Operations"), false);

const html = buildManagerialFinancialReportHtml(metrics, {
  weekLabel: "Test week",
  weekStart: "2026-06-25",
  weekEnd: "2026-07-01",
  generatedAt: "2026-07-02T12:00:00.000Z"
});
assert.ok(html.includes("Managerial Financial Report"));
assert.ok(html.includes("Line of Credit Balance"));
assert.equal(html.includes("overall grade"), false);

console.log("workforceManagerialFinancials.test.mjs: ok");
