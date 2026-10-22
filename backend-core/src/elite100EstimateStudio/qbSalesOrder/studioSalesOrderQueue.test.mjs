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
import { buildStudioSalesOrderPlan, sinkModelFromLabel } from "./studioSalesOrderPlan.mjs";
import { buildSalesOrderAddRq, parseSalesOrderQueryRs, reconcileSalesOrder } from "./studioSalesOrderQbxml.mjs";
import { createStudioSalesOrderService } from "./studioSalesOrderRoutes.js";
import { salesOrderMappingFromConfig } from "./studioSalesOrderSources.mjs";

console.log("\nstudioSalesOrderQueue.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const TEST_COMPANY = "Elite Stone TEST";
const WRITE_ENV = {
  QB_SALES_ORDER_WRITE_ENABLED: "1",
  QB_SALES_ORDER_WRITE_ENVIRONMENT: "test",
  QB_SALES_ORDER_COMPANY_ALLOWLIST: TEST_COMPANY
};

const ref = (listId, fullName) => ({ listId, fullName });
const TAX = { listId: "TC-TAX", fullName: "Tax", taxable: true };
const NON = { listId: "TC-NON", fullName: "Non", taxable: false };

const MAPPING = {
  companyIdentity: TEST_COMPANY,
  timeZone: "America/Chicago",
  memoStyle: "estimate_prefix",
  template: ref("TPL-SO", "Custom Sales Order"),
  headerClass: ref("8000002E-1767737762", "Branch North"),
  terms: ref("TM-DUE", "Due on receipt"),
  lineClassByRole: { plumbing: ref("CL-PLUMB", "Plumbing") },
  material: { conceptByMaterialLine: { "Q Quartz": "material:q_quartz" }, conceptByPriceGroup: { promo: "material:promo" } },
  backsplash: { concept: "backsplash:standard" },
  sink: { conceptByModel: { "3018UM16": "sink_product:3018UM16" } },
  credit: { concept: "customer_credit" },
  taxPolicy: {
    status: "approved",
    itemSalesTax: { listId: "TI-NONTAX", fullName: "Non-taxable", ratePercent: 0 },
    customerSalesTaxCode: NON,
    lineSalesTaxCodeByRole: { material: NON, backsplash: NON, fabrication: NON, plumbing_product: NON, credit: NON, project_service: NON }
  },
  items: {
    "material:q_quartz": { listId: "8000021E-1635950935", itemFullName: "MSI Quartz" },
    "material:promo": { listId: "IT-PROMO", itemFullName: "Promo" },
    "backsplash:standard": { listId: "IT-BS", itemFullName: "Backsplash" },
    kitchen_sink_cutout: { listId: "IT-CUT", itemFullName: "Undermount Sink Cutout" },
    "sink_product:3018UM16": { listId: "IT-SINK", itemFullName: "Plumbing Materials/Parts" },
    faucet_hole: { listId: "IT-FH", itemFullName: "Faucet Hole" },
    customer_credit: { listId: "IT-DISC", itemFullName: "Discount" },
    tear_out: { listId: "IT-TEAR", itemFullName: "Tear Out" }
  }
};

const SINK_LABEL = "Sink — 3018UM16 Super Single Bowl 16 Gauge Undermount Stainless Steel Sink 16GA";

function room(name, material, ct, bs, addOns) {
  const addCents = addOns.reduce((s, a) => s + a.amountCents, 0);
  return {
    roomName: name,
    selectedMaterial: material,
    countertop: { amountCents: ct },
    backsplash: bs ? { mode: "standard", amountCents: bs, label: "4 in backsplash" } : { mode: "none", amountCents: 0, label: "No backsplash" },
    addOns: { amountCents: addCents, lines: addOns },
    roomTotalDetail: { amountCents: ct + bs + addCents }
  };
}

function fixture({ acceptanceId = "acc-1", org = ORG, kitchenGroup = "Group C" } = {}) {
  const rooms = [
    room("Kitchen", kitchenGroup, 416363, 0, [
      { categoryKey: "sink_cutout", label: "Kitchen sink cutout", amountCents: 20000 },
      { categoryKey: "sink", label: SINK_LABEL, amountCents: 32500 },
      { categoryKey: "faucet_hole", label: "Faucet hole (included)", amountCents: 0 }
    ]),
    room("Hall Bath", "Group Promo", 36000, 720, [
      { categoryKey: "courtesy", label: "Returning-customer credit", amountCents: -5000 }
    ])
  ];
  const projectAddOns = [
    { categoryKey: "tearout", label: "Tear-out", amount: 150 },
    { categoryKey: null, label: "Kitchen sink cutout", amount: 0 }
  ];
  const totalCents = rooms.reduce((s, r) => s + r.roomTotalDetail.amountCents, 0) + 15000;
  const acceptance = {
    id: acceptanceId,
    organization_id: org,
    publication_id: "pub-1",
    accepted_at: "2026-09-30T21:10:54.006Z",
    customer_display_total: totalCents / 100,
    customer_safe_snapshot_json: {
      acceptedAsPublished: true,
      configuration: {
        selectedMaterial: { roomId: "room-kitchen", colorId: "e100-calacatta-fioressa", colorName: "Calacatta Fioressa", materialGroup: "group_c" },
        selectedEdgeProfile: { roomId: "room-kitchen", profileName: "Eased", estimateWide: false }
      },
      acceptedRoomPricing: { kind: "original", rooms, projectAddOns, reconciliationStatus: "reconciled" }
    }
  };
  const soldSnapshot = {
    id: "sold-1",
    organization_id: org,
    studio_estimate_id: "est-1",
    acceptance_id: acceptanceId,
    publication_id: "pub-1",
    estimate_revision: 1,
    sold_snapshot_json: {
      scope: {
        materialGroup: "Group C",
        rooms: [
          { id: "room-kitchen", name: "Kitchen", included: true },
          { id: "room-hall", name: "Hall Bath", included: true, colorNameOverride: "India Black Pearl", materialGroupOverride: "Group Promo" }
        ]
      }
    }
  };
  return { acceptance, soldSnapshot, totalCents };
}

const fakeQuickBooks = ({ companyName = TEST_COMPANY, ...rest } = {}) => createQuickBooksSimulator({ companyName, ...rest });

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
const planFor = (opts = {}) => {
  const { acceptance, soldSnapshot } = opts.fixture || fixture();
  return buildStudioSalesOrderPlan({
    organizationId: ORG,
    soldSnapshot,
    acceptance,
    mapping: opts.mapping === undefined ? MAPPING : opts.mapping,
    customerJob: { fullName: "Acme Homes:Smith Kitchen" },
    quoteNumber: "SE-1-R1",
    allowTestOnlySelections: opts.allowTestOnlySelections === true,
    scenario: opts.scenario || null
  });
};
const codes = (plan) => plan.blockers.map((b) => b.code);

{
  const { totalCents } = fixture();
  const plan = planFor();
  assert.equal(plan.ok, true, JSON.stringify(plan.blockers));
  assert.equal(plan.kind, "accepted_sync");
  assert.equal(plan.syncEligible, true);
  assert.equal(plan.subtotalCents, totalCents);
  assert.equal(plan.expectedSalesTaxCents, 0);
  assert.equal(plan.expectedTotalCents, totalCents, "accepted total unchanged");
  assert.deepEqual(
    plan.lines.map((l) => [l.kind === "item" ? l.itemFullName : "(note)", l.amountCents ?? null, l.classFullName ?? null, l.salesTaxCodeFullName ?? null]),
    [
      ["MSI Quartz", 416363, "Branch North", "Non"],
      ["(note)", null, null, null],
      ["Undermount Sink Cutout", 20000, "Branch North", "Non"],
      ["Plumbing Materials/Parts", 32500, "Plumbing", "Non"],
      ["Faucet Hole", 0, "Branch North", "Non"],
      ["Promo", 36000, "Branch North", "Non"],
      ["Backsplash", 720, "Branch North", "Non"],
      ["Discount", -5000, "Branch North", "Non"],
      ["Tear Out", 15000, "Branch North", "Non"]
    ],
    "material by catalog line (not price group), separate backsplash, note line, $0 included item, plumbing class, credit item"
  );
  assert.equal(plan.lines[1].description, "Kitchen: Eased edges / No backsplash / Kitchen sink cutout");
  assert.equal(plan.lines[0].description, "Kitchen - Calacatta Fioressa countertops");
  assert.equal(plan.lines[5].description, "Hall Bath - India Black Pearl countertops");
  assert.equal(plan.lines[3].description, "3018UM16 Super Single Bowl 16 Gauge Undermount Stainless Steel Sink 16GA");
  assert.equal(plan.lines[4].included, true);
  assert.ok(plan.lines.every((l) => /^[\x20-\x7E\u00A0-\u00FF]*$/.test(l.description)), "descriptions survive the QuickBooks code page");
  assert.equal(plan.excludedLines.length, 1, "duplicate $0 cutout reported, not sent");
  assert.equal(plan.excludedLines[0].reason, "duplicate_of_room_line");
  assert.equal(plan.excludedLines[0].duplicateOf.roomName, "Kitchen");
  assert.ok(plan.warnings.some((w) => w.code === "duplicate_project_line_excluded"));
  assert.equal(plan.txnDate, "2026-09-30", "acceptance date in the organization's time zone");
  assert.match(plan.memo, /^Estimate SE-1-R1: Calacatta Fioressa, India Black Pearl accepted 2026-09-30 \[eos:[0-9a-f]{16}\]$/);

  const xml = buildSalesOrderAddRq(plan, { requestId: "r1" });
  assert.match(
    xml,
    /<SalesOrderAdd><CustomerRef><FullName>Acme Homes:Smith Kitchen<\/FullName><\/CustomerRef><ClassRef><ListID>8000002E-1767737762<\/ListID><\/ClassRef><TemplateRef><ListID>TPL-SO<\/ListID><\/TemplateRef><TxnDate>2026-09-30<\/TxnDate><TermsRef><ListID>TM-DUE<\/ListID><\/TermsRef><ItemSalesTaxRef><ListID>TI-NONTAX<\/ListID><\/ItemSalesTaxRef><Memo>/
  );
  assert.match(xml, /<\/Memo><CustomerSalesTaxCodeRef><ListID>TC-NON<\/ListID><\/CustomerSalesTaxCodeRef><ExternalGUID>\{[0-9A-F-]{36}\}<\/ExternalGUID>/);
  assert.match(xml, /<SalesOrderLineAdd><Desc>Kitchen: Eased edges \/ No backsplash \/ Kitchen sink cutout<\/Desc><\/SalesOrderLineAdd>/, "description-only line");
  assert.match(xml, /<ItemRef><ListID>IT-SINK<\/ListID><\/ItemRef>.*?<ClassRef><ListID>CL-PLUMB<\/ListID><\/ClassRef>/);
  assert.match(xml, /<Amount>-50\.00<\/Amount>/);
  assert.match(xml, /<Amount>0\.00<\/Amount>/);
  assert.doesNotMatch(xml, /InvoiceAdd|FullName>Kitchen sink cutout|Tear-out.*Kitchen sink cutout/, "no duplicate cutout line");
  assert.equal((xml.match(/<SalesOrderLineAdd>/g) || []).length, plan.lines.length);
  console.log("ok: 1 v2 plan — catalog material item, backsplash, note, $0 item, plumbing class, ListID refs, duplicate excluded");
}

{
  assert.equal(sinkModelFromLabel(SINK_LABEL), "3018UM16");
  assert.equal(sinkModelFromLabel("Sink — Customer-supplied sink"), null);
  const noModel = structuredClone(MAPPING);
  noModel.sink = { conceptByModel: {} };
  const p = planFor({ mapping: noModel });
  assert.ok(codes(p).includes("sink_item_unmapped"), "model-specific vs parent sink item is an explicit decision");
  console.log("ok: 2 sink model code parsed from the accepted label; unmapped model blocks");
}

{
  const cases = [
    ["tax policy pending", (m) => (m.taxPolicy = { status: "pending" }), "tax_policy_pending"],
    ["branch class undecided", (m) => delete m.headerClass, "branch_class_unresolved"],
    ["plumbing class undecided", (m) => delete m.lineClassByRole.plumbing, "plumbing_class_unresolved"],
    ["terms undecided", (m) => delete m.terms, "terms_unresolved"],
    ["template unmapped", (m) => delete m.template, "template_unmapped"],
    ["material line unmapped", (m) => (m.material.conceptByMaterialLine = {}), "material_line_unmapped"],
    ["credit item unmapped", (m) => delete m.credit, "credit_item_unmapped"],
    ["line tax code missing", (m) => delete m.taxPolicy.lineSalesTaxCodeByRole.plumbing_product, "line_tax_code_unmapped"]
  ];
  for (const [label, mutate, code] of cases) {
    const m = structuredClone(MAPPING);
    mutate(m);
    const p = planFor({ mapping: m });
    assert.equal(p.ok, false, label);
    assert.ok(codes(p).includes(code), `${label}: ${JSON.stringify(codes(p))}`);
  }
  const plumbingHeader = structuredClone(MAPPING);
  plumbingHeader.lineClassByRole.plumbing = "header";
  assert.equal(planFor({ mapping: plumbingHeader }).lines[3].classFullName, "Branch North", "explicit 'use header class' decision honored");
  console.log("ok: 3 unresolved business mappings stay explicit blockers (tax, branch, plumbing class, terms, template, material, credit)");
}

{
  const conflict = planFor({ fixture: fixture({ kitchenGroup: "Group Promo" }) });
  assert.ok(codes(conflict).includes("color_price_group_conflict"), "Group C color priced as Promo is not silently mapped");
  const f = fixture({ kitchenGroup: "Group Promo" });
  f.soldSnapshot.sold_snapshot_json.scope.rooms[0].priceGroupException = { group: "Group Promo", reason: "Builder program pricing", by: "u1" };
  const excepted = planFor({ fixture: f });
  assert.equal(codes(excepted).includes("color_price_group_conflict"), false);
  assert.ok(excepted.warnings.some((w) => w.code === "price_group_exception"));
  const noColor = fixture();
  delete noColor.acceptance.customer_safe_snapshot_json.configuration.selectedMaterial;
  assert.ok(codes(planFor({ fixture: noColor })).includes("room_color_unresolved"), "no published color → blocker, not a guess");
  const unknown = fixture();
  unknown.acceptance.customer_safe_snapshot_json.configuration.selectedMaterial = { roomId: "room-kitchen", colorName: "Not A Real Color" };
  assert.ok(codes(planFor({ fixture: unknown })).includes("color_not_in_catalog"));
  const renamed = fixture();
  renamed.soldSnapshot.sold_snapshot_json.scope.rooms[0].name = "Kitchen Island";
  assert.ok(codes(planFor({ fixture: renamed })).includes("room_identity_unresolved"), "rooms matched by id + name, never fuzzy");
  console.log("ok: 4 color → material line: group conflict, documented exception, missing / unknown color, room identity");
}

{
  const taxing = structuredClone(MAPPING);
  taxing.taxPolicy = {
    status: "approved",
    itemSalesTax: { listId: "TI-7", fullName: "7% IA", ratePercent: 7 },
    customerSalesTaxCode: TAX,
    lineSalesTaxCodeByRole: { material: TAX, backsplash: TAX, fabrication: TAX, plumbing_product: NON, credit: NON, project_service: NON }
  };
  const { totalCents } = fixture();
  const sync = planFor({ mapping: taxing });
  assert.equal(sync.ok, false);
  assert.ok(codes(sync).includes("tax_would_increase_accepted_total"), "accepted quote never silently increased by tax");
  const taxable = 416363 + 20000 + 0 + 36000 + 720;
  assert.equal(sync.expectedSalesTaxCents, Math.round(taxable * 0.07));

  const scenario = planFor({ mapping: taxing, scenario: { kind: "synthetic_tax_scenario", label: "option-b-7pct" } });
  assert.equal(scenario.ok, true, JSON.stringify(scenario.blockers));
  assert.equal(scenario.kind, "synthetic_tax_scenario");
  assert.equal(scenario.syncEligible, false, "synthetic scenario is never a sync");
  assert.equal(scenario.expectedTotalCents, totalCents + scenario.expectedSalesTaxCents);
  assert.notEqual(scenario.idempotencyKey, planFor().idempotencyKey, "separate idempotency key");
  assert.notEqual(scenario.externalGuid, planFor().externalGuid);
  assert.match(scenario.memo, /^SYNTHETIC TAX SCENARIO option-b-7pct - not an accepted-quote sync/);
  assert.ok(codes(planFor({ mapping: taxing, scenario: { kind: "synthetic_tax_scenario", label: "" } })).includes("synthetic_scenario_label_missing"));

  // QuickBooks computes the scenario's tax; read-back reconciles against the scenario's expected totals.
  const qb = fakeQuickBooks({ taxRatePercentByItem: { "TI-7": 7 }, taxableCodeListIds: ["TC-TAX"] });
  qb.handle(buildSalesOrderAddRq(scenario));
  const rb = parseSalesOrderQueryRs(qb.handle(`<?xml version="1.0"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><SalesOrderQueryRq><TxnID>SIM-1000</TxnID></SalesOrderQueryRq></QBXMLMsgsRq></QBXML>`)).rets[0];
  const rec = reconcileSalesOrder(scenario, rb);
  assert.equal(rec.ok, true, JSON.stringify(rec.mismatches));
  assert.equal(rb.salesTaxTotalCents, scenario.expectedSalesTaxCents);
  console.log("ok: 5 tax that would raise an accepted total blocks the sync; Option B only as a labeled synthetic scenario");
}

{
  const testOnly = salesOrderMappingFromConfig(
    {
      companyIdentity: TEST_COMPANY,
      timeZone: "America/Chicago",
      template: MAPPING.template,
      headerClass: { ...MAPPING.headerClass, source: "test_only_selection" },
      terms: MAPPING.terms,
      lineClassByRole: MAPPING.lineClassByRole,
      material: MAPPING.material,
      backsplash: MAPPING.backsplash,
      sink: MAPPING.sink,
      credit: MAPPING.credit,
      taxPolicy: { ...MAPPING.taxPolicy, status: "test_only", source: "test_only_selection" },
      testOnlyItems: { "sink_product:3018UM16": { listId: "IT-SINK", itemFullName: "Plumbing Materials/Parts" } }
    },
    Object.entries(MAPPING.items)
      .filter(([k]) => k !== "sink_product:3018UM16")
      .map(([k, v]) => ({ eliteos_concept_key: k, qb_list_id: v.listId, qb_full_name: v.itemFullName }))
  );
  const blocked = planFor({ mapping: testOnly });
  assert.ok(codes(blocked).includes("test_only_selection_not_allowed"));
  assert.deepEqual(blocked.testOnlySelections.map((t) => t.field).sort(), ["headerClass", "item.sink_product:3018UM16", "taxPolicy"]);
  const allowed = planFor({ mapping: testOnly, allowTestOnlySelections: true });
  assert.equal(allowed.ok, true, JSON.stringify(allowed.blockers));
  assert.equal(allowed.testOnlySelections.length, 3, "test-only choices stay listed on the plan");

  const prodEnv = harness({ env: { ...WRITE_ENV, QB_SALES_ORDER_WRITE_ENVIRONMENT: "production" }, mapping: testOnly });
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await prodEnv.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  assert.equal(job.status, S.BLOCKED);
  assert.ok(job.blockers.some((b) => b.code === "test_only_selection_not_allowed"), "queue outside TEST refuses test-only mapping");
  assert.equal(job.testOnlySelections.length, 3);
  const testEnv = harness({ mapping: testOnly });
  const ok = await testEnv.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  assert.equal(ok.job.status, S.QUEUED);
  console.log("ok: 6 test-only selections labeled; allowed only when the queue targets a TEST company");
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
  assert.equal(first.job.excludedLines.length, 1, "staff can see the excluded duplicate");

  const [a, b] = await Promise.allSettled([
    h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport }),
    h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport })
  ]);
  const done = await h.queue.getJob(ORG, first.job.jobId);
  assert.equal(done.status, S.SYNCED, JSON.stringify(done.lastError));
  assert.equal(done.statusLabel, "Synced");
  assert.equal(done.qbTxnId, "SIM-1000");
  assert.equal(done.qbRefNumber, "1000");
  assert.equal(done.reconciliation.ok, true, JSON.stringify(done.reconciliation.mismatches));
  assert.equal(addCount(qb), 1, "concurrent workers add exactly once");
  assert.equal(qb.state.salesOrders.length, 1);
  assert.ok([a, b].some((r) => r.status === "fulfilled"));

  const replay = await h.queue.processJob({ organizationId: ORG, jobId: first.job.jobId, transport: qb.transport });
  assert.equal(replay.status, S.SYNCED);
  assert.equal(addCount(qb), 1, "processing a synced job never re-adds");
  await assert.rejects(h.queue.retry({ organizationId: ORG, jobId: first.job.jobId }), (e) => e.code === "sales_order_already_synced");
  assert.equal(await h.queue.getJob(OTHER_ORG, first.job.jobId), null, "cross-org read denied");
  console.log("ok: 7 enqueue idempotent; concurrent claim adds once; synced only after full read-back; cross-org denied");
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
  console.log("ok: 8 VM downtime → retry with backoff → synced once");
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
  console.log("ok: 9 lost acknowledgment → query-before-add adopts existing sales order");
}

{
  const h = harness();
  const qb = fakeQuickBooks();
  const { acceptance, soldSnapshot } = fixture();
  const { job } = await h.queue.enqueueFromSold({ organizationId: ORG, soldSnapshot, acceptance });
  qb.state.addStatus = { code: 3140, message: "There is an invalid reference to QuickBooks Item &quot;IT-SINK&quot;." };
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
  console.log("ok: 10 QuickBooks reference error → actionable needs-attention → safe retry → synced");
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
  console.log("ok: 11 write gate — disabled / non-test / wrong company → blocked with zero writes");
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
  assert.ok(r.reconciliation.mismatches.some((m) => m.code === "accepted_total_exceeded"));
  assert.equal(r.qbTxnId, "SIM-1000", "TxnID kept for operator follow-up");
  console.log("ok: 12 QuickBooks-added sales tax → needs attention (accepted total exceeded), never Synced");
}

{
  // Read-back drift on any accounting field fails reconciliation.
  const plan = planFor();
  const qb = fakeQuickBooks();
  qb.handle(buildSalesOrderAddRq(plan));
  const so = qb.state.salesOrders[0];
  const readBack = () =>
    parseSalesOrderQueryRs(qb.handle(`<?xml version="1.0"?><QBXML><QBXMLMsgsRq><SalesOrderQueryRq><TxnID>${so.txnId}</TxnID></SalesOrderQueryRq></QBXMLMsgsRq></QBXML>`)).rets[0];
  assert.equal(readBack().lines[0].itemListId, "8000021E-1635950935", "ListIDs that look like scientific notation stay strings");
  assert.equal(readBack().headerClass.listId, "8000002E-1767737762");
  assert.equal(reconcileSalesOrder(plan, readBack()).ok, true);
  const drift = [
    ["header class", () => (so.header.ClassRef = { ListID: "CL-OTHER" }), "class"],
    ["template", () => (so.header.TemplateRef = null), "template"],
    ["terms", () => (so.header.TermsRef = { ListID: "TM-NET30" }), "terms"],
    ["tax item", () => (so.header.ItemSalesTaxRef = { ListID: "TI-7" }), "itemSalesTax"],
    ["customer tax code", () => (so.header.CustomerSalesTaxCodeRef = { ListID: "TC-TAX" }), "customerSalesTaxCode"],
    ["txn date", () => (so.header.TxnDate = "2026-10-01"), "txnDate"],
    ["memo", () => (so.memo = "edited"), "memo"],
    ["line class", () => (so.lines[3].classRef = null), "lines[3].class"],
    ["line tax code", () => (so.lines[0].salesTaxCodeRef = { ListID: "TC-TAX" }), "lines[0].salesTaxCode"],
    ["line item", () => (so.lines[2].listId = "IT-OTHER"), "lines[2].item"],
    ["note became item", () => Object.assign(so.lines[1], { descOnly: false, listId: "IT-X", item: "X", quantity: "1" }), "lines[1].item"]
  ];
  for (const [label, mutate, field] of drift) {
    const saved = structuredClone(so);
    mutate();
    const rec = reconcileSalesOrder(plan, readBack());
    assert.equal(rec.ok, false, label);
    assert.ok(rec.mismatches.some((m) => m.field === field), `${label}: ${JSON.stringify(rec.mismatches)}`);
    Object.assign(so, structuredClone(saved));
    so.lines = structuredClone(saved.lines);
  }
  console.log("ok: 13 read-back verifies every accounting field (header refs, date, memo, line item/class/tax, note lines)");
}

{
  const { acceptance, soldSnapshot } = fixture();
  const noItem = { ...MAPPING, items: { "material:q_quartz": MAPPING.items["material:q_quartz"] } };
  for (const [label, opts, code] of [
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
  console.log("ok: 14 blockers — item, customer:job, mapping, legacy acceptance, 1¢ mismatch");
}

{
  const h = harness({ mapping: { ...MAPPING, items: { "material:q_quartz": MAPPING.items["material:q_quartz"] } } });
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
  console.log("ok: 15 accepted scope change / cross-org source rejected");
}

{
  // A synthetic plan that somehow reaches the queue is never sent.
  const h = harness();
  const qb = fakeQuickBooks();
  const taxing = structuredClone(MAPPING);
  taxing.taxPolicy.itemSalesTax = { listId: "TI-7", fullName: "7% IA", ratePercent: 7 };
  const plan = planFor({ mapping: taxing, scenario: { kind: "synthetic_tax_scenario", label: "option-b" } });
  const nowIso = new Date(Date.parse("2026-09-29T20:00:00Z")).toISOString();
  const { job } = await h.repository.insert({
    id: "synthetic-1", organizationId: ORG, idempotencyKey: plan.idempotencyKey, soldSnapshotId: "sold-1", studioEstimateId: "est-1",
    acceptanceId: "acc-1", publicationId: "pub-1", companyIdentity: TEST_COMPANY, quoteNumber: null, status: S.QUEUED, plan,
    attempts: 0, nextAttemptAt: null, leaseUntil: null, lastError: null, possiblyInQuickBooks: false, customerJob: null,
    qbTxnId: null, qbRefNumber: null, reconciliation: null, createdByUserId: null, createdAt: nowIso, updatedAt: nowIso, events: []
  });
  const r = await h.queue.processJob({ organizationId: ORG, jobId: job.id, transport: qb.transport });
  assert.equal(r.status, S.BLOCKED);
  assert.equal(r.lastError.code, "sales_order_plan_not_syncable");
  assert.equal(addCount(qb), 0);
  console.log("ok: 16 synthetic tax scenario cannot be sent by the queue");
}

{
  const job = { id: "j1", status: S.BLOCKED, plan: { blockers: [], totalCents: 100 } };
  assert.equal(presentSalesOrderJob(job).typedCustomerJobAllowed, false, "production default: pick from list");
  assert.equal(presentSalesOrderJob(job, { typedCustomerJobAllowed: true }).typedCustomerJobAllowed, true);
  console.log("ok: 17 typed customer:job offered only when Brain allows it (TEST company)");
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
  console.log("ok: 18 unconfigured organization → not_configured status, no job, item mappings never read");
}

console.log("\nstudioSalesOrderQueue.test.mjs: ok\n");
