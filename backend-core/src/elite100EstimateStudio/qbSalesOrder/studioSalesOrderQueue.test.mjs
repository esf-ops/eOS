/**
 * Studio → QuickBooks SALES ORDER queue against a stateful fake QuickBooks.
 * No network; no real QuickBooks writes.
 *
 * Run: node backend-core/src/elite100EstimateStudio/qbSalesOrder/studioSalesOrderQueue.test.mjs
 */
import assert from "node:assert/strict";

import { createQuickBooksSimulator } from "./qbSalesOrderSimulator.mjs";
import {
  createInMemorySalesOrderJobRepository,
  createStudioSalesOrderQueue,
  presentSalesOrderJob,
  SALES_ORDER_JOB_STATUSES as S
} from "./studioSalesOrderQueue.mjs";
import { buildStudioSalesOrderPlan } from "./studioSalesOrderPlan.mjs";
import { buildSalesOrderAddRq } from "./studioSalesOrderQbxml.mjs";
import { createStudioSalesOrderService } from "./studioSalesOrderRoutes.js";

console.log("\nstudioSalesOrderQueue.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const TEST_COMPANY = "Elite Stone TEST";
const WRITE_ENV = {
  QB_SALES_ORDER_WRITE_ENABLED: "1",
  QB_SALES_ORDER_WRITE_ENVIRONMENT: "test",
  QB_SALES_ORDER_COMPANY_ALLOWLIST: TEST_COMPANY
};

const MAPPING = {
  companyIdentity: TEST_COMPANY,
  termsFullName: "Due on receipt",
  classFullName: "Residential",
  items: {
    room_material: { itemFullName: "Countertops:Installed", salesTaxCodeFullName: "Non" },
    "addon:sink_cutout": { itemFullName: "Fabrication:Sink Cutout", salesTaxCodeFullName: "Non" },
    "addon:sink": { itemFullName: "Products:Sink", salesTaxCodeFullName: "Tax" },
    "addon:*": { itemFullName: "Fabrication:Other", salesTaxCodeFullName: "Non" },
    credit: { itemFullName: "Adjustments:Credit", salesTaxCodeFullName: "Non" },
    "project:*": { itemFullName: "Services:Project", salesTaxCodeFullName: "Non" }
  }
};

function room(name, material, ct, bs, addOns) {
  const addCents = addOns.reduce((s, a) => s + a.amountCents, 0);
  return {
    roomName: name,
    selectedMaterial: material,
    countertop: { amountCents: ct },
    backsplash: { amountCents: bs, label: bs ? "4 in backsplash" : "No backsplash" },
    addOns: { amountCents: addCents, lines: addOns },
    roomTotalDetail: { amountCents: ct + bs + addCents }
  };
}

function fixture({ acceptanceId = "acc-1", org = ORG } = {}) {
  const rooms = [
    room("Kitchen", "Taj Mahal", 416363, 0, [
      { categoryKey: "sink_cutout", label: "Kitchen sink cutout", amountCents: 20000 },
      { categoryKey: "sink", label: "ESF undermount sink", amountCents: 32500 },
      { categoryKey: "faucet_hole", label: "Faucet hole (included)", amountCents: 0 }
    ]),
    room("Hall Bath", "Group Promo", 36000, 720, [
      { categoryKey: "courtesy", label: "Returning-customer credit", amountCents: -5000 }
    ])
  ];
  const projectAddOns = [{ categoryKey: "tearout", label: "Tear-out", amount: 150 }];
  const totalCents =
    rooms.reduce((s, r) => s + r.roomTotalDetail.amountCents, 0) + 15000;
  const acceptance = {
    id: acceptanceId,
    organization_id: org,
    publication_id: "pub-1",
    customer_display_total: totalCents / 100,
    customer_safe_snapshot_json: {
      acceptedAsPublished: true,
      acceptedRoomPricing: { kind: "original", rooms, projectAddOns, reconciliationStatus: "reconciled" }
    }
  };
  const soldSnapshot = {
    id: "sold-1",
    organization_id: org,
    studio_estimate_id: "est-1",
    acceptance_id: acceptanceId,
    publication_id: "pub-1",
    estimate_revision: 1
  };
  return { acceptance, soldSnapshot, totalCents };
}

const fakeQuickBooks = ({ companyName = TEST_COMPANY } = {}) => createQuickBooksSimulator({ companyName });

function harness({ env = WRITE_ENV, mapping = MAPPING, customerJob = { fullName: "Acme Homes:Smith Kitchen" } } = {}) {
  let t = Date.parse("2026-09-29T20:00:00Z");
  const clock = { now: () => new Date(t), advance: (ms) => (t += ms) };
  const repository = createInMemorySalesOrderJobRepository();
  const queue = createStudioSalesOrderQueue({
    repository,
    env,
    now: clock.now,
    loadMapping: async (org) => (org === ORG ? mapping : null),
    resolveCustomerJob: async () => customerJob
  });
  return { queue, repository, clock };
}

const addCount = (qb) => qb.state.requests.filter((x) => x.includes("<SalesOrderAddRq")).length;

{
  const { acceptance, soldSnapshot, totalCents } = fixture();
  const plan = buildStudioSalesOrderPlan({ organizationId: ORG, soldSnapshot, acceptance, mapping: MAPPING, customerJob: { fullName: "Acme Homes:Smith Kitchen" }, quoteNumber: "SE-1-R1" });
  assert.equal(plan.ok, true, JSON.stringify(plan.blockers));
  assert.equal(plan.totalCents, totalCents);
  assert.deepEqual(
    plan.lines.map((l) => [l.itemFullName, l.amountCents, l.salesTaxCodeFullName]),
    [
      ["Countertops:Installed", 416363, "Non"],
      ["Fabrication:Sink Cutout", 20000, "Non"],
      ["Products:Sink", 32500, "Tax"],
      ["Fabrication:Other", 0, "Non"],
      ["Countertops:Installed", 36720, "Non"],
      ["Adjustments:Credit", -5000, "Non"],
      ["Services:Project", 15000, "Non"]
    ],
    "room package, extras, visible $0 item, credit, project item; mixed tax codes from central mapping"
  );
  assert.match(plan.lines[4].description, /Hall Bath — Group Promo installed countertops and 4 in backsplash/);
  const xml = buildSalesOrderAddRq(plan, { requestId: "r1" });
  assert.match(xml, /<SalesOrderAddRq requestID="r1"><SalesOrderAdd><CustomerRef><FullName>Acme Homes:Smith Kitchen<\/FullName><\/CustomerRef><ClassRef>/);
  assert.match(xml, /<Amount>-50\.00<\/Amount>/);
  assert.match(xml, /<Amount>0\.00<\/Amount>/);
  assert.match(xml, /<ExternalGUID>\{[0-9A-F-]{36}\}<\/ExternalGUID>/);
  assert.doesNotMatch(xml, /InvoiceAdd|ItemSalesTaxRef/, "sales order only; no invented tax item");
  console.log("ok: 1 plan from accepted breakdown — exact cents, $0 item, credit, mixed tax codes");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  const { acceptance, soldSnapshot } = fixture();
  const first = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance, quoteNumber: "SE-1-R1" });
  const again = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance, quoteNumber: "SE-1-R1" });
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.job.jobId, first.job.jobId, "double click → same job");
  assert.equal(first.job.synced, false);
  assert.equal(first.job.statusLabel, "Queued", "queued is not Synced");

  const [a, b] = await Promise.allSettled([
    h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport }),
    h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport })
  ]);
  const done = await h.queue.getJob(ORG, first.job.jobId);
  assert.equal(done.status, S.SYNCED, JSON.stringify(done.lastError));
  assert.equal(done.statusLabel, "Synced");
  assert.equal(done.qbTxnId, "SIM-1000");
  assert.equal(done.qbRefNumber, "1000");
  assert.equal(done.reconciliation.ok, true);
  assert.equal(addCount(qb), 1, "concurrent workers add exactly once");
  assert.equal(qb.state.salesOrders.length, 1);
  assert.ok([a, b].some((r) => r.status === "fulfilled"));

  const replay = await h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport });
  assert.equal(replay.status, S.SYNCED);
  assert.equal(addCount(qb), 1, "processing a synced job never re-adds");
  await assert.rejects(h.queue.retry({ organizationId: ORG, jobId: first.job.jobId }), (e) => e.code === "sales_order_already_synced");
  assert.equal(await h.queue.getJob(OTHER_ORG, first.job.jobId), null, "cross-org read denied");
  console.log("ok: 2 enqueue idempotent; concurrent claim adds once; synced only after read-back; cross-org denied");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  qb.state.downNext = 1;
  const down = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(down.status, S.RETRY_WAIT);
  assert.equal(addCount(qb), 0, "VM offline before send → nothing written");
  const early = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(early.status, S.RETRY_WAIT, "backoff respected");
  h.clock.advance(2 * 60_000);
  const up = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(up.status, S.SYNCED);
  assert.equal(qb.state.salesOrders.length, 1);
  console.log("ok: 3 VM downtime → retry with backoff → synced once");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  qb.state.dropAckNext = 1;
  const lost = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(lost.status, S.OUTCOME_UNKNOWN);
  assert.equal(lost.synced, false);
  assert.equal(qb.state.salesOrders.length, 1, "QuickBooks created it even though the ack was lost");
  h.clock.advance(2 * 60_000);
  const recovered = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(recovered.status, S.SYNCED);
  assert.equal(recovered.qbTxnId, "SIM-1000");
  assert.equal(addCount(qb), 1, "lost ack → lookup adopts existing sales order; no duplicate");
  assert.equal(qb.state.salesOrders.length, 1);
  console.log("ok: 4 lost acknowledgment → query-before-add adopts existing sales order");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  qb.state.addStatus = { code: 3140, message: "There is an invalid reference to QuickBooks Item &quot;Products:Sink&quot;." };
  const bad = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(bad.status, S.NEEDS_ATTENTION);
  assert.equal(bad.lastError.code, "qb_status_3140");
  assert.match(bad.lastError.message, /central QuickBooks mapping/);
  assert.equal(bad.canRetry, true);
  const retried = await h.queue.retry({ organizationId: ORG, jobId: job.jobId });
  assert.equal(retried.status, S.QUEUED);
  const ok = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(ok.status, S.SYNCED);
  assert.equal(qb.state.salesOrders.length, 1);
  console.log("ok: 5 QuickBooks reference error → actionable needs-attention → safe retry → synced");
}

{
  const { acceptance, soldSnapshot } = fixture();
  for (const [label, env, companyName, code] of [
    ["writes disabled", {}, TEST_COMPANY, "qb_write_not_enabled"],
    ["production env", { ...WRITE_ENV, QB_SALES_ORDER_WRITE_ENVIRONMENT: "production" }, TEST_COMPANY, "qb_write_env_not_test"],
    ["wrong company open", WRITE_ENV, "Elite Stone Fabrication", "qb_company_not_allowlisted"]
  ]) {
    const h = harness({ env });
    const qb = fakeQuickBooks({ companyName });
    const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
    const r = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
    assert.equal(r.status, S.BLOCKED, label);
    assert.equal(r.lastError.code, code, label);
    assert.equal(addCount(qb), 0, `${label}: no SalesOrderAdd sent`);
  }
  console.log("ok: 6 write gate — disabled / non-test / wrong company → blocked with zero writes");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  qb.state.taxCents = 2681;
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  const r = await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
  assert.equal(r.status, S.NEEDS_ATTENTION);
  assert.equal(r.synced, false);
  assert.ok(r.reconciliation.mismatches.some((m) => m.code === "sales_tax_added"));
  assert.equal(r.qbTxnId, "SIM-1000", "TxnID kept for operator follow-up");
  console.log("ok: 7 QuickBooks-added sales tax → needs attention (tax policy unresolved), never Synced");
}

{
  const { acceptance, soldSnapshot } = fixture();
  const noTax = { ...MAPPING, items: { ...MAPPING.items, "addon:sink": { itemFullName: "Products:Sink" } } };
  const noItem = { ...MAPPING, items: { room_material: MAPPING.items.room_material } };
  for (const [label, opts, code] of [
    ["tax code missing", { mapping: noTax }, "sales_tax_code_unmapped"],
    ["item unmapped", { mapping: noItem }, "qb_item_mapping_missing"],
    ["no customer job", { customerJob: null }, "qb_customer_job_unresolved"],
    ["no mapping", { mapping: null }, "qb_mapping_missing"]
  ]) {
    const h = harness(opts);
    const qb = fakeQuickBooks();
    const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
    assert.equal(job.status, S.BLOCKED, label);
    assert.ok(job.blockers.some((b) => b.code === code), `${label}: ${JSON.stringify(job.blockers)}`);
    await h.queue.processJob({ organizationId: ORG, jobId: job.jobId, transport: qb.transport });
    assert.equal(qb.state.requests.length, 0, `${label}: blocked plan never contacts QuickBooks`);
  }
  const legacy = structuredClone(acceptance);
  delete legacy.customer_safe_snapshot_json.acceptedRoomPricing;
  const h = harness();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance: legacy });
  assert.ok(job.blockers.some((b) => b.code === "accepted_breakdown_unavailable"));
  const off = structuredClone(acceptance);
  off.customer_display_total = Number(off.customer_display_total) + 0.01;
  const h2 = harness();
  const offJob = await h2.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance: off });
  assert.ok(offJob.job.blockers.some((b) => b.code === "accepted_total_mismatch"), "one cent off blocks");
  console.log("ok: 8 blockers — tax code, item, customer:job, mapping, legacy acceptance, 1¢ mismatch");
}

{
  const h = harness({ mapping: { ...MAPPING, items: { room_material: MAPPING.items.room_material } } });
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  assert.equal(job.status, S.BLOCKED);
  const changed = fixture({ acceptanceId: "acc-2" });
  await assert.rejects(
    h.queue.retry({ organizationId: ORG, jobId: job.jobId, soldSnapshot: changed.soldSnapshot, acceptance: changed.acceptance }),
    (e) => e.code === "sales_order_source_changed",
    "a different acceptance cannot be pushed through an existing job"
  );
  await assert.rejects(
    h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot: { ...soldSnapshot, organization_id: OTHER_ORG }, acceptance }),
    (e) => e.code === "cross_org_denied"
  );
  console.log("ok: 9 accepted scope change / cross-org source rejected");
}

{
  const job = { id: "j1", status: S.BLOCKED, plan: { blockers: [], totalCents: 100 } };
  assert.equal(presentSalesOrderJob(job).typedCustomerJobAllowed, false, "production default: pick from list");
  assert.equal(presentSalesOrderJob(job, { typedCustomerJobAllowed: true }).typedCustomerJobAllowed, true);
  console.log("ok: 10 typed customer:job offered only when Brain allows it (TEST company)");
}

{
  // Production today: no quickbooks_sales_order config row. Mark Sold records the sale; no job, never "Synced".
  const configQuery = { select: () => configQuery, eq: () => configQuery, maybeSingle: async () => ({ data: null, error: null }) };
  const db = { from: (table) => {
    if (table !== "organization_integration_configs") throw new Error(`unexpected read of ${table}`);
    return configQuery;
  } };
  const svc = createStudioSalesOrderService({ getSupabase: () => db, env: {}, repository: createInMemorySalesOrderJobRepository() });
  const enq = await svc.enqueueForSoldSnapshot({ organizationId: ORG, soldSnapshotId: "s1" });
  assert.deepEqual(enq, { status: "not_configured", job: null });
  const status = await svc.statusForEstimate(ORG, "e1");
  assert.deepEqual(status, { status: "not_configured" }, "staff see 'not connected', not an empty or synced state");
  assert.equal(status.jobId, undefined, "retry / customer:job routes require a real job id");
  console.log("ok: 11 unconfigured organization → not_configured status, no job, item mappings never read");
}

console.log("\nstudioSalesOrderQueue.test.mjs: ok\n");
