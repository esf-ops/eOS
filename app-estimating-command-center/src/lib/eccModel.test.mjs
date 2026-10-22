import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDataset } from "../fixtures/eccFixture.mjs";
import {
  attentionQueue,
  classifyFreshness,
  colorReport,
  computeMetrics,
  currentRevision,
  filterJobRows,
  handoffQueue,
  handoffStage,
  jobRow,
  knownSum,
  opportunityColors,
} from "./eccModel.mjs";

const AS_OF = "2026-10-05T16:48:00Z";
const fresh = (keys) => Object.fromEntries(keys.map((k) => [k, { state: "fresh" }]));
const ALL_FRESH = fresh(["qb_estimates", "qb_sales_orders", "moraware_jobs"]);

const opp = (over) => ({
  id: over.id ?? "o",
  customer: { accountId: "a", name: "C" },
  branch: { qbClassName: "ESF - X", branchKey: "X" },
  salesRep: { qbSalesRepListId: "R", initials: "R" },
  revisions: [],
  ...over,
});
const rev = (txnId, txnDate, total, lines = []) => ({ txnId, txnDate, total, isActive: true, editSequence: txnDate, lines });

const byKey = (metrics) => Object.fromEntries(metrics.map((m) => [m.key, m]));

test("revisions count once per opportunity and quoted value uses the current revision only", () => {
  const o = opp({ id: "o1", revisions: [rev("e1", "2026-09-01", 1000), rev("e2", "2026-09-05", 1200), rev("e3", "2026-09-09", 1100)] });
  const m = byKey(computeMetrics([o], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: ALL_FRESH }));
  assert.equal(m.opportunities_quoted.value, 1);
  assert.equal(m.estimate_revisions.value, 3);
  assert.equal(m.quoted_value.value, 1100);
  assert.equal(currentRevision(o).txnId, "e3");
});

test("inactive revisions are ignored", () => {
  const o = opp({ revisions: [rev("e1", "2026-09-01", 1000), { ...rev("e2", "2026-09-05", 9999), isActive: false }] });
  assert.equal(currentRevision(o).txnId, "e1");
});

test("an opportunity first quoted before the period does not count as quoted in the period", () => {
  const o = opp({ revisions: [rev("e1", "2026-08-20", 1000), rev("e2", "2026-09-05", 1200)] });
  const m = byKey(computeMetrics([o], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: ALL_FRESH }));
  assert.equal(m.opportunities_quoted.value, 0);
  assert.equal(m.estimate_revisions.value, 1);
});

test("unknown totals are excluded and flagged, never summed as zero", () => {
  const a = opp({ id: "a", revisions: [rev("e1", "2026-09-02", 500)] });
  const b = opp({ id: "b", revisions: [rev("e2", "2026-09-03", null)] });
  const m = byKey(computeMetrics([a, b], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: ALL_FRESH }));
  assert.equal(m.quoted_value.value, 500);
  assert.equal(m.quoted_value.state, "partial");

  const onlyUnknown = byKey(computeMetrics([b], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: ALL_FRESH }));
  assert.equal(onlyUnknown.quoted_value.value, null);
  assert.equal(onlyUnknown.quoted_value.state, "unknown");
});

test("close rate is unknown (not 0%) when nothing was quoted, and zero is a real measured value", () => {
  const none = byKey(computeMetrics([], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: ALL_FRESH }));
  assert.equal(none.cohort_close_rate.value, null);
  assert.equal(none.cohort_close_rate.state, "unknown");
  assert.equal(none.opportunities_quoted.value, 0);
  assert.equal(none.opportunities_quoted.state, "ok");
  assert.equal(knownSum([]).value, 0);
  assert.equal(knownSum([null]).value, null);
});

test("metrics inherit stale state from their source feeds", () => {
  const o = opp({ revisions: [rev("e1", "2026-09-02", 500)] });
  const m = byKey(computeMetrics([o], { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey: { ...ALL_FRESH, qb_estimates: { state: "stale" } } }));
  assert.equal(m.opportunities_quoted.state, "stale");
  assert.equal(m.opportunities_quoted.value, 1);
});

test("freshness classification distinguishes stale, snapshot, static and unknown", () => {
  assert.equal(classifyFreshness({ lastSuccessAt: "2026-10-05T15:00:00Z", staleAfterHours: 4 }, AS_OF).state, "fresh");
  assert.equal(classifyFreshness({ lastSuccessAt: "2026-09-10T05:12:43Z", staleAfterHours: 4 }, AS_OF).state, "stale");
  assert.equal(classifyFreshness({ lastSuccessAt: "2026-07-10T18:30:23Z", staleAfterHours: null, kind: "snapshot" }, AS_OF).state, "snapshot");
  assert.equal(classifyFreshness({ lastSuccessAt: null, staleAfterHours: 4 }, AS_OF).state, "unknown");
  assert.equal(classifyFreshness({ lastSuccessAt: null, staleAfterHours: null, kind: "static" }, AS_OF).state, "static");
});

test("multi-color job counts once in totals and once per color in the color report", () => {
  const o = opp({
    id: "mc",
    revisions: [
      rev("e1", "2026-09-02", 5000, [
        { isMaterial: true, colorKey: "a", colorLabel: "A", sqft: 40 },
        { isMaterial: true, colorKey: "b", colorLabel: "B", sqft: 10 },
        { isMaterial: false, desc: "Fabrication" },
      ]),
    ],
  });
  const r = colorReport([o], { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(r.totals.jobs, 1);
  assert.equal(r.totals.colorAppearances, 2);
  assert.equal(r.totals.multiColorJobs, 1);
  assert.deepEqual(r.rows.map((x) => [x.key, x.jobs, x.sqft]), [["a", 1, 40], ["b", 1, 10]]);
});

test("missing line detail is unknown color, distinct from unmatched color text", () => {
  const noLines = opp({ id: "n", revisions: [rev("e1", "2026-09-02", 100, null)] });
  const text = opp({ id: "t", revisions: [rev("e2", "2026-09-02", 100, [{ isMaterial: true, colorKey: null, desc: "Color TBD" }])] });
  assert.equal(opportunityColors(noLines), null);
  assert.deepEqual(opportunityColors(text).unmatchedText, ["Color TBD"]);
  const r = colorReport([noLines, text], { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(r.totals.unknownColorJobs, 1);
  assert.equal(r.totals.unmatchedTextJobs, 1);
});

test("color report uses the sold revision, not a later re-quote", () => {
  const o = opp({
    revisions: [
      rev("e1", "2026-09-01", 1000, [{ isMaterial: true, colorKey: "sold", colorLabel: "Sold" }]),
      rev("e2", "2026-09-10", 1100, [{ isMaterial: true, colorKey: "later", colorLabel: "Later" }]),
    ],
    sold: { soldAt: "2026-09-05", amount: 1000, estimateTxnId: "e1" },
  });
  assert.deepEqual(opportunityColors(o).colors.map((c) => c.key), ["sold"]);
});

test("handoff stages and Tanya queue ordering", () => {
  const sold = { soldAt: "2026-09-20", amount: 1 };
  const a = opp({ id: "a", sold });
  const b = opp({ id: "b", sold, handoff: { state: "awaiting_tanya", receivedAt: "2026-09-21" } });
  const c = opp({ id: "c", sold, handoff: { state: "initiated", receivedAt: "2026-09-21", morawareJobId: "MW1" } });
  assert.equal(handoffStage(a), "awaiting_handoff");
  assert.equal(handoffStage(b), "awaiting_tanya");
  assert.equal(handoffStage(c), "initiated");
  assert.equal(handoffStage(opp({})), "not_sold");
  assert.deepEqual(handoffQueue([c, b, a], AS_OF).map((x) => x.id), ["a", "b", "c"]);
});

test("attention queue flags missing handoff, overdue Moraware, unknown follow-up and data gaps", () => {
  const items = attentionQueue(fixtureDataset.opportunities, AS_OF);
  const kinds = (id) => items.filter((i) => i.oppId === id).map((i) => i.kind);
  assert.ok(kinds("opp-02").includes("handoff_missing"));
  assert.ok(kinds("opp-03").includes("moraware_overdue"));
  assert.ok(kinds("opp-05").includes("follow_up_unknown"));
  assert.ok(kinds("opp-05").includes("data_missing_rep"));
  assert.ok(kinds("opp-05").includes("data_unlinked_customer"));
  assert.ok(kinds("opp-05").includes("data_unmapped_branch"));
  assert.ok(!kinds("opp-07").includes("follow_up_due"), "lost opportunities need no follow-up");
  assert.equal(items[0].severity, "high");
});

test("job table filters by branch, unknown rep, color and drill-down ids", () => {
  const rows = fixtureDataset.opportunities.map((o) => jobRow(o, AS_OF));
  assert.ok(filterJobRows(rows, { branch: "Lisbon" }).every((r) => r.branch === "Lisbon"));
  assert.deepEqual(filterJobRows(rows, { salesRep: "__unknown" }).map((r) => r.id), ["opp-05"]);
  assert.ok(filterJobRows(rows, { color: "calacatta-laza" }).every((r) => r.colorKeys.includes("calacatta-laza")));
  assert.deepEqual(filterJobRows(rows, { ids: ["opp-01", "opp-04"] }).map((r) => r.id), ["opp-01", "opp-04"]);
  assert.equal(rows.find((r) => r.id === "opp-06").colors, null, "no line detail stays unknown");
});

test("fixture metrics for September are labeled stale against real source freshness", () => {
  const freshnessByKey = Object.fromEntries(fixtureDataset.sources.map((s) => [s.key, classifyFreshness(s, AS_OF)]));
  const m = byKey(computeMetrics(fixtureDataset.opportunities, { from: "2026-09-01", to: "2026-09-30", asOf: AS_OF, freshnessByKey }));
  assert.equal(m.opportunities_quoted.state, "stale");
  assert.equal(m.sold_value.state, "stale");
  assert.equal(m.sold_value.value, 9850 + 1850 + 7450, "opp-10 has an unknown sold amount and is excluded");
});
