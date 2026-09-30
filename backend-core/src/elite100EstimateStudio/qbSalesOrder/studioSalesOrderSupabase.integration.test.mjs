/**
 * Sales order queue against a real Postgres (local Supabase only) + QuickBooks simulator.
 * Proves: one job per sold snapshot under concurrent enqueue, one claim under concurrent
 * agents, no duplicate order after a lost acknowledgment + lease expiry + process restart,
 * stale agent reports are ignored, the sweep recreates missing jobs, and org isolation.
 *
 * Refuses any non-loopback URL. Seeds synthetic rows under fresh random org ids.
 *
 * Run (key passed via env only):
 *   SALES_ORDER_IT_SUPABASE_URL=http://127.0.0.1:54321 SALES_ORDER_IT_SERVICE_KEY=... \
 *     node backend-core/src/elite100EstimateStudio/qbSalesOrder/studioSalesOrderSupabase.integration.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createQuickBooksSimulator } from "./qbSalesOrderSimulator.mjs";
import { createStudioSalesOrderService } from "./studioSalesOrderRoutes.js";

console.log("\nstudioSalesOrderSupabase.integration.test.mjs\n");

const url = String(process.env.SALES_ORDER_IT_SUPABASE_URL || "");
const key = String(process.env.SALES_ORDER_IT_SERVICE_KEY || "");
if (!url || !key) {
  console.log("SKIP: SALES_ORDER_IT_SUPABASE_URL / SALES_ORDER_IT_SERVICE_KEY not set");
  process.exit(0);
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error(`REFUSED: ${host} is not a loopback host; this test only runs against local Supabase.`);
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const TEST_COMPANY = "Elite Stone TEST (simulated)";
const CUSTOMER_LIST_ID = `SIMCUST-${ORG.slice(0, 8)}`;
const WRITE_ENV = {
  QB_SALES_ORDER_WRITE_ENABLED: "1",
  QB_SALES_ORDER_WRITE_ENVIRONMENT: "test",
  QB_SALES_ORDER_COMPANY_ALLOWLIST: TEST_COMPANY
};
const ITEMS = [
  ["installed_countertop_package", "SIM-ITEM-CT", "Countertops:Installed"],
  ["kitchen_sink_cutout", "SIM-ITEM-SC", "Fabrication:Sink Cutout"],
  ["sink_product", "SIM-ITEM-SINK", "Products:Sink"],
  ["faucet_hole", "SIM-ITEM-FH", "Fabrication:Faucet Hole"],
  ["customer_credit", "SIM-ITEM-CR", "Adjustments:Credit"],
  ["tear_out", "SIM-ITEM-TO", "Services:Tear-out"],
  ["addon:*", "SIM-ITEM-ADD", "Fabrication:Other"],
  ["project:*", "SIM-ITEM-PRJ", "Services:Project"]
];

async function must(p, what) {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

function acceptedRoomPricing() {
  const kitchenAddOns = [
    { categoryKey: "sink_cutout", label: "Kitchen sink cutout", amountCents: 20000 },
    { categoryKey: "sink", label: "ESF undermount sink", amountCents: 32500 },
    { categoryKey: "faucet_hole", label: "Faucet hole (included)", amountCents: 0 }
  ];
  const rooms = [
    {
      roomName: "Kitchen",
      selectedMaterial: "Synthetic Quartz A",
      countertop: { amountCents: 416363 },
      backsplash: { amountCents: 0, label: "No backsplash" },
      addOns: { amountCents: 52500, lines: kitchenAddOns },
      roomTotalDetail: { amountCents: 468863 }
    }
  ];
  const projectAddOns = [{ categoryKey: "tearout", label: "Tear-out", amount: 150 }];
  return { rooms, projectAddOns, totalCents: 468863 + 15000 };
}

async function seedOrg(org, { configured }) {
  await must(db.from("organizations").insert({ id: org, organization_key: `it-${org.slice(0, 8)}`, display_name: `IT Synthetic ${org.slice(0, 8)}` }), "org");
  if (!configured) return;
  await must(
    db.from("organization_integration_configs").insert({
      organization_id: org,
      integration_key: "quickbooks_sales_order",
      is_enabled: true,
      config: { companyIdentity: TEST_COMPANY, termsFullName: "Due on receipt" }
    }),
    "integration config"
  );
  await must(
    db.from("quote_qb_item_mappings").insert(
      ITEMS.map(([concept, listId, fullName]) => ({
        organization_id: org,
        eliteos_concept_key: concept,
        qb_list_id: `${listId}-${org.slice(0, 4)}`,
        qb_full_name: fullName,
        pricing_source: "none",
        is_active: true
      }))
    ),
    "item mappings"
  );
}

async function seedSold(org, { accountId }) {
  const intakeCaseId = `it-case-${randomUUID().slice(0, 8)}`;
  const header = await must(
    db.from("quote_headers").insert({ organization_id: org, quote_number: `IT-${intakeCaseId}`, quote_source: "elite100_studio" }).select("id").single(),
    "quote header"
  );
  const estimate = await must(
    db.from("studio_estimates").insert({ organization_id: org, intake_case_id: intakeCaseId, status: "approved", revision: 1, account_directory_account_id: accountId }).select("id").single(),
    "estimate"
  );
  const pub = await must(
    db
      .from("quote_publications")
      .insert({
        organization_id: org,
        source_quote_id: header.id,
        quote_number: `IT-${intakeCaseId}`,
        quote_source: "elite100_studio",
        revision_number: 1,
        source_quote_fingerprint: "it",
        customer_snapshot_hash: "it",
        pricing_evidence_hash: "it",
        access_expires_at: new Date(Date.now() + 86400_000).toISOString()
      })
      .select("id")
      .single(),
    "publication"
  );
  const pricing = acceptedRoomPricing();
  const acceptance = await must(
    db
      .from("studio_estimate_acceptances")
      .insert({
        organization_id: org,
        intake_case_id: intakeCaseId,
        studio_estimate_id: estimate.id,
        publication_id: pub.id,
        estimate_revision: 1,
        customer_display_total: pricing.totalCents / 100,
        customer_safe_snapshot_json: {
          acceptedAsPublished: true,
          acceptedRoomPricing: { kind: "original", rooms: pricing.rooms, projectAddOns: pricing.projectAddOns, reconciliationStatus: "reconciled" }
        }
      })
      .select("id")
      .single(),
    "acceptance"
  );
  const sold = await must(
    db
      .from("studio_estimate_sold_snapshots")
      .insert({
        organization_id: org,
        intake_case_id: intakeCaseId,
        studio_estimate_id: estimate.id,
        acceptance_id: acceptance.id,
        publication_id: pub.id,
        estimate_revision: 1,
        customer_display_total: pricing.totalCents / 100,
        sold_snapshot_json: { accountDirectoryAccountId: accountId }
      })
      .select("id")
      .single(),
    "sold snapshot"
  );
  return { estimateId: estimate.id, soldSnapshotId: sold.id, totalCents: pricing.totalCents };
}

async function seedAccount(org) {
  const acct = await must(
    db.from("account_directory_accounts").insert({ organization_id: org, display_name: "Synthetic Homes LLC", status: "active" }).select("id").single(),
    "account"
  );
  await must(
    db.from("account_directory_external_links").insert({ organization_id: org, account_id: acct.id, external_system: "quickbooks_desktop", external_id: CUSTOMER_LIST_ID, is_active: true }),
    "external link"
  );
  await must(
    db.from("ad_qb_customer_facts").insert({ organization_id: org, qb_list_id: CUSTOMER_LIST_ID, full_name: "Synthetic Homes LLC", is_job: false, is_active: true }),
    "customer fact"
  );
  return acct.id;
}

/** Each call is a fresh "process": new repository, new queue, shared database. */
function processAt(clockRef) {
  return createStudioSalesOrderService({ getSupabase: () => db, env: WRITE_ENV, now: () => new Date(clockRef.t), logger: { warn() {}, error() {}, info() {} } });
}

async function jobRows(org) {
  return must(db.from("studio_qb_sales_order_jobs").select("*").eq("organization_id", org), "job rows");
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const clock = { t: Date.now() };
const qb = createQuickBooksSimulator({
  companyName: TEST_COMPANY,
  items: ITEMS.map(([, listId, fullName]) => ({ listId: `${listId}-${ORG.slice(0, 4)}`, fullName })),
  customers: [{ listId: CUSTOMER_LIST_ID, fullName: "Synthetic Homes LLC" }]
});

/** Run the agent protocol exactly like the Windows agent would. */
async function runAgent(svc, org, { crashOnAdd = false } = {}) {
  let { work } = await svc.queue.agentNext({ organizationId: org });
  while (work) {
    let responseXml = null;
    let transportError = null;
    try {
      responseXml = qb.handle(work.qbXml);
    } catch (e) {
      transportError = e.message;
    }
    if (crashOnAdd && work.step === "add") return { crashed: true };
    const r = await svc.queue.agentResult({ organizationId: org, jobId: work.jobId, attemptId: work.attemptId, step: work.step, responseXml, transportError });
    work = r.work;
  }
  return { crashed: false };
}

await seedOrg(ORG, { configured: true });
await seedOrg(OTHER_ORG, { configured: true });
const accountId = await seedAccount(ORG);
const first = await seedSold(ORG, { accountId });

await test("concurrent enqueue from two processes creates exactly one durable job", async () => {
  const [a, b] = await Promise.all([
    processAt(clock).enqueueForSoldSnapshot({ organizationId: ORG, soldSnapshotId: first.soldSnapshotId, quoteNumber: "SE-IT-R1" }),
    processAt(clock).enqueueForSoldSnapshot({ organizationId: ORG, soldSnapshotId: first.soldSnapshotId, quoteNumber: "SE-IT-R1" })
  ]);
  assert.equal(a.job.jobId, b.job.jobId);
  const rows = await jobRows(ORG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plan_json.customer.listId, CUSTOMER_LIST_ID);
  assert.equal(rows[0].plan_json.totalCents, first.totalCents);
});

await test("no configured sales-tax codes: job is blocked, nothing inferred from item defaults", async () => {
  const [row] = await jobRows(ORG);
  assert.equal(row.status, "blocked");
  assert.ok(row.blockers_json.some((b) => b.code === "sales_tax_code_unmapped"), JSON.stringify(row.blockers_json));
});

await test("explicit synthetic tax config + retry replans to queued", async () => {
  const salesTaxCodeByConcept = Object.fromEntries(ITEMS.map(([c]) => [c, "SIM-NON"]));
  await must(
    db
      .from("organization_integration_configs")
      .update({ config: { companyIdentity: TEST_COMPANY, termsFullName: "Due on receipt", salesTaxCodeByConcept } })
      .eq("organization_id", ORG)
      .eq("integration_key", "quickbooks_sales_order"),
    "tax config"
  );
  const [row] = await jobRows(ORG);
  const retried = await processAt(clock).queue.retry({ organizationId: ORG, jobId: row.id });
  assert.equal(retried.status, "queued", JSON.stringify(retried.blockers));
});

await test("other organization cannot see, claim or report on the job", async () => {
  const svc = processAt(clock);
  const [row] = await jobRows(ORG);
  assert.equal(await svc.queue.getJob(OTHER_ORG, row.id), null);
  assert.equal((await svc.queue.agentNext({ organizationId: OTHER_ORG })).work, null);
  await assert.rejects(
    svc.queue.agentResult({ organizationId: OTHER_ORG, jobId: row.id, attemptId: "x", step: "company", responseXml: "<x/>" }),
    (e) => e.code === "sales_order_job_not_found"
  );
});

await test("two agents polling at once: exactly one claims the job", async () => {
  const [a, b] = await Promise.all([processAt(clock).queue.agentNext({ organizationId: ORG }), processAt(clock).queue.agentNext({ organizationId: ORG })]);
  const claimed = [a.work, b.work].filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].step, "company");
  // stale report with a wrong attempt id is ignored
  const stale = await processAt(clock).queue.agentResult({ organizationId: ORG, jobId: claimed[0].jobId, attemptId: "not-the-attempt", step: "company", responseXml: qb.handle(claimed[0].qbXml) });
  assert.equal(stale.stale, true);
});

await test("lost acknowledgment + lease expiry + restart: looks up, never adds twice, then syncs", async () => {
  clock.t += 6 * 60 * 1000; // first claim's lease expires
  const crashed = await runAgent(processAt(clock), ORG, { crashOnAdd: true });
  assert.equal(crashed.crashed, true);
  assert.equal(qb.state.salesOrders.length, 1, "order reached QuickBooks but the agent died before reporting");

  clock.t += 6 * 60 * 1000;
  await runAgent(processAt(clock), ORG);
  assert.equal(qb.state.salesOrders.length, 1, "no duplicate order");
  const addCount = qb.state.requests.filter((x) => x.includes("<SalesOrderAddRq")).length;
  assert.equal(addCount, 1);

  const [row] = await jobRows(ORG);
  assert.equal(row.status, "synced");
  assert.equal(row.qb_txn_id, qb.state.salesOrders[0].txnId);
  const so = qb.state.salesOrders[0];
  assert.equal(so.subtotalCents, first.totalCents);
  assert.equal(so.customerListId, CUSTOMER_LIST_ID);

  const status = await processAt(clock).statusForEstimate(ORG, first.estimateId);
  assert.equal(status.synced, true);
  assert.equal(status.statusLabel, "Synced");
  assert.equal(status.qbRefNumber, so.refNumber);
});

await test("re-enqueue after sync is a no-op (same job, still synced)", async () => {
  const again = await processAt(clock).enqueueForSoldSnapshot({ organizationId: ORG, soldSnapshotId: first.soldSnapshotId });
  assert.equal(again.status, "synced");
  assert.equal((await jobRows(ORG)).length, 1);
});

await test("sweep recreates a job lost between Mark Sold and enqueue", async () => {
  const second = await seedSold(ORG, { accountId });
  const r = await processAt(clock).sweepMissingJobs(ORG);
  assert.equal(r.enqueued, 1);
  const rows = await jobRows(ORG);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((x) => x.sold_snapshot_id === second.soldSnapshotId && x.status === "queued"));
  assert.equal((await processAt(clock).sweepMissingJobs(ORG)).enqueued, 0);
});

await test("unconfigured organization: Mark Sold enqueue reports not_configured", async () => {
  const bare = randomUUID();
  await seedOrg(bare, { configured: false });
  const r = await processAt(clock).enqueueForSoldSnapshot({ organizationId: bare, soldSnapshotId: randomUUID() });
  assert.equal(r.status, "not_configured");
});

await test("database rejects a second job for the same idempotency key", async () => {
  const [row] = await jobRows(ORG);
  const { error } = await db.from("studio_qb_sales_order_jobs").insert({ ...row, id: randomUUID() });
  assert.ok(error && /duplicate|unique/i.test(error.message), error?.message);
});

console.log(`\n${passed} passed (synthetic org ${ORG.slice(0, 8)})\n`);
