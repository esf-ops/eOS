import assert from "node:assert/strict";
import {
  agingOver60,
  buildArInsights,
  buildPnlInsights,
  concentrationShare,
  normalizeFinanceLabel,
  percentagePointChange,
} from "./financeInsights.mjs";

assert.equal(normalizeFinanceLabel("4790 \uFFFD Sales"), "4790 Sales");
assert.equal(normalizeFinanceLabel("4790  \uFFFD   Sales"), "4790 Sales");
assert.equal(normalizeFinanceLabel("Name\uFFFD"), "Name\uFFFD");
assert.equal(normalizeFinanceLabel("  4790   Sales  "), "4790 Sales");

assert.equal(percentagePointChange(30.1, 33.7), -3.6);
assert.equal(percentagePointChange(null, 33.7), null);

assert.equal(
  concentrationShare(
    [
      { open_amount: 50 },
      { open_amount: 30 },
      { open_amount: 10 },
      { open_amount: 5 },
      { open_amount: 3 },
      { open_amount: 2 },
    ],
    100,
    5
  ),
  98
);
assert.equal(concentrationShare([], 100, 5), null);
assert.equal(agingOver60({ days_61_90: 125, days_90_plus: 75 }), 200);
assert.equal(agingOver60({ days_61_90: 125 }), null);

const pnlInsights = buildPnlInsights(
  {
    period_start: "2026-08-01",
    headline: { gross_margin_pct: 30.1, net_income: -100, revenue: 900 },
  },
  {
    period_start: "2026-07-01",
    headline: { gross_margin_pct: 33.7, net_income: 100, revenue: 1000 },
  }
);
assert.ok(pnlInsights.includes("Aug gross margin decreased 3.6 percentage points from Jul."));
assert.ok(pnlInsights.includes("Aug net income is negative while Jul was positive."));
assert.ok(pnlInsights.some((line) => line.includes("Aug revenue is lower than Jul")));
assert.deepEqual(buildPnlInsights({ headline: {} }, null), []);

const arInsights = buildArInsights({
  total: { value: 100 },
  customers: [{ open_amount: 60 }, { open_amount: 20 }],
  aging: {
    state: "available",
    buckets: { days_61_90: 10, days_90_plus: 5 },
  },
});
assert.ok(arInsights.includes("The five largest receivable balances represent 80.0% of open A/R."));
assert.ok(arInsights.includes("$15.00 of receivables is more than 60 days overdue."));
assert.deepEqual(buildArInsights({ aging: { state: "unavailable" } }), []);

console.log("financeInsights.test.mjs: ok");
