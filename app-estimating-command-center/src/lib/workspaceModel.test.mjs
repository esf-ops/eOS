import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDataset } from "../fixtures/eccFixture.mjs";
import { classifyFreshness, computeMetrics } from "./eccModel.mjs";
import { FIELD_OWNERSHIP, SYSTEMS, buildCustomers, customerKey, projectDetail, projectFinancials, workspaceMetrics } from "./workspaceModel.mjs";

const AS_OF = fixtureDataset.asOf;
const opps = fixtureDataset.opportunities;
const customers = buildCustomers(opps, fixtureDataset.customers, AS_OF);
const byName = (name) => customers.find((c) => c.name === name);
const freshnessByKey = Object.fromEntries(fixtureDataset.sources.map((s) => [s.key, classifyFreshness(s, AS_OF)]));
const metricsFor = (from, to) => Object.fromEntries(workspaceMetrics(opps, customers, { from, to, freshnessByKey }).map((m) => [m.key, m]));

test("customer A/R includes project invoices and invoices not filed under a job", () => {
  const c = byName("Fixture Homes LLC");
  assert.equal(c.openAr, 5575 + 1200);
  assert.equal(c.unfiledOpenAr, 1200);
  assert.equal(c.aging.aging.current.balance, 5575);
  assert.equal(c.aging.aging.days61to90.balance, 1200, "INV6900 due Jul 30 is 67 days past due on Oct 5");
  assert.equal(c.aging.overdueBalance, 1200);
});

test("missing due date is unknown, never overdue and never zero", () => {
  const c = byName("Example Kitchens Inc");
  assert.equal(c.openAr, 900);
  assert.equal(c.aging.overdueBalance, 0);
  assert.equal(c.aging.unknownDueCount, 1);
  assert.equal(c.aging.aging.unknown.balance, 900);
});

test("unlinked QuickBooks customers stay separate and visible", () => {
  const c = byName("Unlinked Customer Example");
  assert.equal(c.linked, false);
  assert.equal(c.key, customerKey({ accountId: null, qbRootListId: "FIX-CUST-UNLI" }));
  assert.equal(c.openAr, 640);
});

test("A/R metrics reconcile: total = sum of customers; drill targets are customers", () => {
  const m = metricsFor("2026-09-01", "2026-09-30");
  assert.equal(m.open_ar.value, 6775 + 5575 + 900 + 640);
  assert.equal(m.open_ar.value, customers.reduce((s, c) => s + c.openAr, 0));
  assert.equal(m.overdue_ar.value, 1200 + 5575 + 640);
  assert.equal(m.ar_unlinked.value, 640);
  assert.equal(m.ar_unfiled.value, 1200 + 640);
  assert.equal(m.open_ar.drillKind, "customers");
  assert.equal(m.open_ar.state, "stale", "A/R feed stopped Sep 10");
  assert.ok(m.open_ar.reason.includes("no QuickBooks due date"));
});

test("sales orders ($) counts change orders in the period they were written", () => {
  const sep = Object.fromEntries(computeMetrics(opps, { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey }).map((m) => [m.key, m]));
  const oct = Object.fromEntries(computeMetrics(opps, { from: "2026-10-01", to: "2026-10-31", asOf: AS_OF, freshnessByKey }).map((m) => [m.key, m]));
  assert.equal(sep.sold_value.value, 9850 + 1850 + 7450);
  assert.equal(oct.sold_value.value, 650 + 6400);
  assert.equal(oct.sold_count.value, 1, "the change order does not make opp-01 a new sold job");
  assert.equal(metricsFor("2026-10-01", "2026-10-31").change_orders.value, 1);
});

test("project detail connects revisions, orders, invoices, payments and the explicit Moraware link", () => {
  const opp = opps.find((o) => o.id === "opp-01");
  const d = projectDetail(opp, customers, AS_OF);
  assert.equal(d.customer.name, "Fixture Homes LLC");
  assert.equal(d.revisions.length, 2);
  assert.equal(d.fin.salesOrders.length, 2);
  assert.equal(d.fin.soldTotal.value, 9850 + 650);
  assert.equal(d.fin.openAr, 5575);
  assert.equal(d.fin.collectedTotal.value, 4925);
  assert.equal(d.production.linked.sourceJobId, "FIX-MW-88121");
  assert.deepEqual(d.production.customerJobsNotLinked.map((j) => j.sourceJobId), ["FIX-MW-87990"], "other customer jobs are never auto-attached");
});

test("project without invoices has zero open A/R only because QuickBooks has no invoice", () => {
  const d = projectFinancials(opps.find((o) => o.id === "opp-02"), AS_OF);
  assert.equal(d.invoices.length, 0);
  assert.equal(d.openAr, 0);
});

test("every ownership entry names a known system, derived, or explicitly unknown", () => {
  for (const [field, owner] of Object.entries(FIELD_OWNERSHIP)) {
    assert.ok(owner === null || owner === "derived" || owner in SYSTEMS, `${field} → ${owner}`);
  }
  assert.equal(FIELD_OWNERSHIP["project.stage"], "derived", "stage is computed from source records, never a stored status");
});
