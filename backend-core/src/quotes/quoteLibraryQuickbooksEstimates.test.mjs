import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  attachQuoteLibraryQuickbooksRoutes,
  buildContainerSummary,
  buildReportingStatus,
  classifySnapshotLines,
  csvCell,
  QB_ESTIMATES_REPORTING_SIGNED_OFF,
  estimatesToCsv,
  extractEstimateLines,
  parseEstimateFilters,
  sanitizeSearch,
  splitCustomerJob
} from "./quoteLibraryQuickbooksEstimates.mjs";

import { ACCT, fakeSupabase, fixtureTables, ID_LEAK, ORG } from "./quoteLibraryQuickbooksEstimates.testFixtures.mjs";

async function withServer({ deny = false, org = ORG, auditLog = [], delayMs = 0 } = {}, fn) {
  const app = express();
  const stack = [
    (req, res, next) => {
      if (deny) return res.status(403).json({ ok: false, code: "head_access_denied" });
      req.user = { id: String(req.headers["x-test-user"] || "user-1") };
      next();
    }
  ];
  attachQuoteLibraryQuickbooksRoutes(app, {
    stack,
    getSupabase: () => fakeSupabase({ ...fixtureTables(), __delayMs: delayMs }),
    logAction: async (a) => { auditLog.push(a); },
    resolveOrganizationId: async () => org,
    now: () => new Date("2026-10-05T12:00:00Z")
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test("filters: validation and sanitising", () => {
  assert.equal(parseEstimateFilters({ from: "2026/01/01" }).error, "from must be YYYY-MM-DD");
  assert.equal(parseEstimateFilters({ account: "not-a-uuid" }).error, "account must be an Account Directory id");
  assert.equal(parseEstimateFilters({ min_amount: "abc" }).error, "amount filters must be numbers");
  assert.equal(parseEstimateFilters({ sort: "drop table" }).error, "unsupported sort");
  assert.equal(sanitizeSearch('a,b) or(id.eq.1)*%"\\'), "a b or id.eq.1");
  assert.equal(parseEstimateFilters({ q: "Acme Homes:Lot" }).filters.q, "Acme Homes:Lot");
});

test("Customer:Job split is display-only", () => {
  assert.deepEqual(splitCustomerJob("Acme:Lot 1:Kitchen"), { customerName: "Acme", jobName: "Lot 1:Kitchen" });
  assert.deepEqual(splitCustomerJob("Walk In"), { customerName: "Walk In", jobName: null });
});

test("line extraction drops QuickBooks ids and handles groups / single objects", () => {
  const lines = extractEstimateLines({
    EstimateLineRet: [
      { TxnLineID: "X", ItemRef: { ListID: "Y", FullName: "Edge" }, Desc: "Ogee", Quantity: "10", Rate: "12.5", Amount: "125" },
      { TxnLineID: "spacer" }
    ],
    EstimateLineGroupRet: { ItemGroupRef: { FullName: "Kit" }, TotalAmount: "50", EstimateLineRet: [{ ItemRef: { FullName: "Sink" }, Amount: "50" }] }
  });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], { kind: "item", item: "Edge", description: "Ogee", quantity: 10, rate: 12.5, amount: 125, className: null, inGroup: false });
  assert.equal(lines[1].kind, "group");
  assert.equal(lines[2].inGroup, true);
  assert.doesNotMatch(JSON.stringify(lines), /TxnLineID|ListID|"X"|"Y"/);
});

test("container summary separates estimates and sales orders and never links sales orders", () => {
  const s = buildContainerSummary(
    [
      { id: "e1", txn_type: "Estimate", reference_number: "1", txn_date: "2026-01-01", amount: 10 },
      { id: "e2", txn_type: "Estimate", reference_number: "2", txn_date: "2026-01-02", amount: 20 },
      { id: "s1", txn_type: "SalesOrder", reference_number: "S1", txn_date: "2026-01-03", amount: 15 }
    ],
    "e1"
  );
  assert.deepEqual(s.estimates, { count: 1, value: 20 });
  assert.deepEqual(s.salesOrders, { count: 1, value: 15 });
  assert.equal(s.rows.find((r) => r.type === "sales_order").id, null);
});

test("csv escapes quotes and neutralises formula prefixes", () => {
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-12.50"), "-12.50");
  const csv = estimatesToCsv([
    { estimateNumber: "26-1", date: "2026-01-01", customerName: "A", jobName: null, customerJob: "A", amount: 5, account: null, syncedAt: "2026-09-09T06:00:00Z" }
  ]);
  assert.equal(csv.split("\r\n")[0], "Estimate #,Date,Customer,Job,Customer:Job,Amount,Account Directory account,Last synced from QuickBooks");
  assert.equal(csv.split("\r\n")[1], "26-1,2026-01-01,A,,A,5.00,,2026-09-09T06:00:00Z");
});

test("snapshot line status compares totals only and never claims the details are current", () => {
  assert.equal(classifySnapshotLines({ snapshotPresent: false, headerAmount: 10, snapshotTotal: null }), "not_in_snapshot");
  assert.equal(classifySnapshotLines({ snapshotPresent: true, headerAmount: 10, snapshotTotal: 10.004 }), "snapshot_total_matches");
  assert.equal(classifySnapshotLines({ snapshotPresent: true, headerAmount: 10, snapshotTotal: 10.5 }), "snapshot_total_differs");
  assert.equal(classifySnapshotLines({ snapshotPresent: true, headerAmount: 10, snapshotTotal: null }), "snapshot_total_differs");
});

test("reporting status stays 'Not current reporting' until signed off and every feed is fresh", () => {
  const fresh = [{ key: "qb_finance_sync", label: "QuickBooks finance", state: "fresh", lastSuccessAt: "2026-10-05T01:00:00Z" }];
  const stale = [{ key: "qb_finance_sync", label: "QuickBooks finance", state: "stale", lastSuccessAt: "2026-09-10T01:00:00Z" }];
  const unsigned = buildReportingStatus({ feeds: fresh });
  assert.equal(QB_ESTIMATES_REPORTING_SIGNED_OFF, false);
  assert.equal(unsigned.current, false);
  assert.equal(unsigned.label, "Not current reporting");
  assert.match(unsigned.reasons.join(" "), /not been signed off/);
  const staleSigned = buildReportingStatus({ feeds: stale, signedOff: true });
  assert.equal(staleSigned.current, false);
  assert.match(staleSigned.reasons.join(" "), /has not succeeded since 2026-09-10 01:00 UTC/);
  assert.equal(buildReportingStatus({ feeds: [], signedOff: true }).current, false);
  const window = buildReportingStatus({ feeds: fresh, signedOff: true, refreshWindowStart: "2026-07-11", olderRowsLastRefreshedAt: "2026-08-14T03:00:00Z" });
  assert.equal(window.current, true);
  assert.match(window.reasons.join(" "), /before 2026-07-11 .*last refreshed 2026-08-14 03:00 UTC.*not reflected/);
});

test("routes require the injected auth stack", () => {
  assert.throws(() => attachQuoteLibraryQuickbooksRoutes(express(), { stack: [], getSupabase: () => null }), /auth stack/);
});

test("denied stack blocks every QuickBooks estimate route", async () => {
  await withServer({ deny: true }, async (base) => {
    for (const p of [
      "/api/quote-library/quickbooks/estimates",
      "/api/quote-library/quickbooks/estimates/export",
      "/api/quote-library/quickbooks/freshness",
      "/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000001"
    ]) {
      const r = await fetch(base + p);
      assert.equal(r.status, 403, p);
    }
  });
});

test("missing organization context is refused", async () => {
  await withServer({ org: null }, async (base) => {
    const r = await fetch(`${base}/api/quote-library/quickbooks/estimates`);
    assert.equal(r.status, 403);
  });
});

test("list is org-scoped, links customers exactly and leaks no QuickBooks ids", async () => {
  await withServer({}, async (base) => {
    const r = await fetch(`${base}/api/quote-library/quickbooks/estimates`);
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.summary.value, 2700);
    assert.equal(body.summary.syncedFrom, "2026-08-14T03:00:00Z", "totals are labelled with the oldest row sync");
    assert.equal(body.summary.syncedThrough, "2026-09-09T06:00:00Z");
    assert.ok(!body.rows.some((x) => x.estimateNumber === "26-300"), "other org row excluded");
    assert.ok(!body.rows.some((x) => x.estimateNumber === "SO-9"), "sales orders are not estimates");
    const acme = body.rows.find((x) => x.estimateNumber === "26-101");
    assert.deepEqual(acme.account, { id: ACCT, name: "Acme Homes" });
    assert.equal(acme.customerName, "Acme Homes");
    assert.equal(acme.jobName, "Lot 1");
    assert.equal(body.rows.find((x) => x.estimateNumber === "26-200").account, null, "unlinked root stays unlinked");
    assert.doesNotMatch(JSON.stringify(body.rows), ID_LEAK);
  });
});

test("search, date and account filters", async () => {
  await withServer({}, async (base) => {
    let body = await (await fetch(`${base}/api/quote-library/quickbooks/estimates?q=26-200`)).json();
    assert.deepEqual(body.rows.map((x) => x.estimateNumber), ["26-200"]);
    body = await (await fetch(`${base}/api/quote-library/quickbooks/estimates?from=2026-04-01&to=2026-04-30`)).json();
    assert.deepEqual(body.rows.map((x) => x.estimateNumber), ["26-101"]);
    body = await (await fetch(`${base}/api/quote-library/quickbooks/estimates?account=${ACCT}`)).json();
    assert.deepEqual(body.rows.map((x) => x.estimateNumber).sort(), ["26-100", "26-101"]);
    assert.equal(body.summary.value, 2200);
    assert.deepEqual([body.summary.syncedFrom, body.summary.syncedThrough], ["2026-09-09T06:00:00Z", "2026-09-09T06:00:00Z"]);
    const bad = await fetch(`${base}/api/quote-library/quickbooks/estimates?from=yesterday`);
    assert.equal(bad.status, 400);
  });
});

test("detail returns snapshot lines, container rows and no ids; other-org ids are 404", async () => {
  await withServer({}, async (base) => {
    const r = await fetch(`${base}/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000001`);
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.linesStatus, "snapshot_total_matches");
    assert.equal(body.snapshot.capturedAt, "2026-07-10T21:00:00Z");
    assert.equal(body.snapshot.qbModifiedAt, "2026-03-02T09:15:00-06:00");
    assert.equal(body.estimate.syncedAt, "2026-09-09T06:00:00Z");
    assert.deepEqual(body.snapshot.lines[0], {
      kind: "item", item: "Quartz Install", description: "Kitchen tops", quantity: 40, rate: 25, amount: 1000, className: null, inGroup: false
    });
    assert.equal(body.snapshot.total, 1000);
    assert.deepEqual(body.container.estimates, { count: 1, value: 1200 });
    assert.deepEqual(body.container.salesOrders, { count: 1, value: 1150 });
    assert.doesNotMatch(JSON.stringify(body), ID_LEAK);

    const later = await (await fetch(`${base}/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000002`)).json();
    assert.equal(later.linesStatus, "not_in_snapshot");
    assert.equal(later.snapshot, null);

    const edited = await (await fetch(`${base}/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000004`)).json();
    assert.equal(edited.linesStatus, "snapshot_total_differs");
    assert.equal(edited.snapshot.total, 450);
    assert.equal(edited.snapshot.capturedAt, "2026-07-10T21:00:00Z");

    const other = await fetch(`${base}/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000005`);
    assert.equal(other.status, 404);
    const salesOrder = await fetch(`${base}/api/quote-library/quickbooks/estimates/aaaaaaaa-0000-4000-8000-000000000003`);
    assert.equal(salesOrder.status, 404);
  });
});

test("export returns CSV, audits counts only, and stays org-scoped", async () => {
  const auditLog = [];
  await withServer({ auditLog }, async (base) => {
    const r = await fetch(`${base}/api/quote-library/quickbooks/estimates/export`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/csv/);
    assert.equal(r.headers.get("x-export-row-count"), "3");
    assert.equal(r.headers.get("x-data-synced-from"), "2026-08-14T03:00:00Z");
    assert.equal(r.headers.get("x-data-synced-through"), "2026-09-09T06:00:00Z");
    assert.match(r.headers.get("access-control-expose-headers") || "", /X-Data-Synced-From.*X-Data-Synced-Through/);
    assert.match(r.headers.get("content-disposition"), /quickbooks-estimates-synced-2026-08-14-to-2026-09-09-exported-2026-10-05\.csv/);
    const csv = await r.text();
    assert.ok(!csv.includes("26-300"));
    assert.doesNotMatch(csv, ID_LEAK);
    assert.equal(auditLog.length, 1);
    assert.equal(auditLog[0].actionType, "quickbooks_estimates_export");
    assert.equal(auditLog[0].metadata.row_count, 3);
  });
});

test("freshness reports QuickBooks feeds and dated coverage", async () => {
  await withServer({}, async (base) => {
    const body = await (await fetch(`${base}/api/quote-library/quickbooks/freshness`)).json();
    assert.deepEqual(body.feeds.map((f) => f.key).sort(), ["qb_customer_sync", "qb_finance_sync"]);
    assert.ok(body.feeds.every((f) => f.state === "stale"));
    assert.deepEqual(body.estimates, {
      from: "2026-03-01",
      through: "2026-05-01",
      lastSyncedAt: "2026-09-09T06:00:00Z",
      refreshWindowStart: "2026-07-11",
      olderRowsLastRefreshedAt: "2026-08-14T03:00:00Z"
    });
    assert.deepEqual(body.lineItems, { snapshotAt: "2026-07-10T21:00:00Z", through: "2026-03-01" });
    assert.equal(body.reporting.current, false);
    assert.equal(body.reporting.label, "Not current reporting");
    assert.match(body.reporting.reasons.join(" "), /rolling refresh window/);
    assert.match(body.reporting.reasons.join(" "), /not been signed off/);
  });
});

test("a second export from the same user while one runs is refused with 409; other users are unaffected", async () => {
  await withServer({ delayMs: 150 }, async (base) => {
    const url = `${base}/api/quote-library/quickbooks/estimates/export`;
    const first = fetch(url, { headers: { "x-test-user": "user-1" } });
    await new Promise((r) => setTimeout(r, 30));
    const [dup, otherUser] = await Promise.all([
      fetch(url, { headers: { "x-test-user": "user-1" } }),
      fetch(url, { headers: { "x-test-user": "user-2" } })
    ]);
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).code, "export_in_progress");
    assert.equal(otherUser.status, 200);
    await otherUser.text();
    const done = await first;
    assert.equal(done.status, 200);
    await done.text();
    const again = await fetch(url, { headers: { "x-test-user": "user-1" } });
    assert.equal(again.status, 200, "guard is released after completion");
    await again.text();
  });
});

test("export guard is released after a failure", async () => {
  await withServer({}, async (base) => {
    const bad = await fetch(`${base}/api/quote-library/quickbooks/estimates/export?from=nope`);
    assert.equal(bad.status, 400);
    const ok = await fetch(`${base}/api/quote-library/quickbooks/estimates/export`);
    assert.equal(ok.status, 200);
    await ok.text();
  });
});
