/**
 * Phase 1.1 — QuickBooks EstimateAdd dry-run tests.
 * Proves: Quantity+Rate (no Amount), no claimed leftover, TEST item/customer validation,
 * no ProcessRequest transmit of EstimateAdd.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQuantityRateAmountConsistent,
  buildEstimateAddQbXml,
  buildQbtest0001EstimateAdd,
  expectedLineAmount,
  qbXmlContainsWriteRequest,
  QBTEST_0001_CONCEPT_KEYS,
  QBTEST_CUSTOMER_FULL_NAME,
  QBTEST_IDEMPOTENCY_KEY,
  QBTEST_REF_NUMBER
} from "./quoteQbCatalog/quoteQbEstimateAddBuilder.js";
import { requireMappedConcepts } from "./quoteQbCatalog/quoteQbItemMappingStore.js";
import {
  assertCompanyAllowlisted,
  loadQbWriteConfig,
  validateQbWriteConfig
} from "./quoteQbCatalog/quoteQbWriteConfig.js";
import { validateQbWriteSafetyGate } from "./quoteQbCatalog/quoteQbWriteSafety.js";
import {
  buildCompanyQueryQbXml,
  buildCustomerQueryByFullNameQbXml,
  parseCompanyIdentity,
  parseCustomerQueryListId,
  processQbXmlSafely,
  resolveExactlyOneActiveTestCustomer,
  transmitEstimateAdd
} from "./quoteQbCatalog/quoteQbWriteTransport.js";
import {
  QBTEST_0001_EXPECTED_ITEMS,
  buildItemQueryByListIdQbXml,
  parseItemQueryRet,
  validateExpectedTestItems
} from "./quoteQbCatalog/quoteQbTestItemValidation.js";
import { runQbEstimateDryRun } from "./quoteQbCatalog/quoteQbEstimateDryRun.js";
import { QUOTE_QB_STRONG_MATCH_SEEDS } from "./quoteQbCatalog/quoteQbItemMappingCatalog.js";
import {
  claimSinglePendingQueueRow,
  restoreClaimedQbtest0001QueueRowToPending
} from "./quoteQbCatalog/quoteQbWriteQueueStore.js";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const TEST_COMPANY = "EliteOS QuickBooks TEST";
const PROD_COMPANY = "Elite Stone Fabrications";
const CUSTOMER_LIST_ID = "8000TEST-CUSTOMER-0001";

const LIVE_MAPPINGS = QUOTE_QB_STRONG_MATCH_SEEDS.map((s) => ({
  eliteos_concept_key: s.eliteos_concept_key,
  qb_list_id: s.qb_list_id,
  qb_full_name: s.qb_full_name,
  pricing_source: s.pricing_source,
  is_active: true
}));

function mockDb(opts = {}) {
  const state = {
    mappings: opts.mappings ?? LIVE_MAPPINGS,
    queue: opts.queue ?? [],
    processRequestCalls: []
  };

  return {
    state,
    from(table) {
      if (table === "quote_qb_item_mappings") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return Promise.resolve({ data: state.mappings, error: null });
          }
        };
      }
      if (table === "quote_qb_write_queue") {
        const ctx = {
          filters: /** @type {Record<string, unknown>} */ ({}),
          payload: null,
          op: "select",
          inserted: /** @type {object|null} */ (null)
        };
        const matchRow = (r) =>
          Object.entries(ctx.filters).every(([col, val]) => r[col] === val);
        const api = {
          select() {
            // After insert/update, .select() is for returning the row — keep op.
            if (ctx.op !== "insert" && ctx.op !== "update") {
              ctx.op = "select";
              ctx.filters = {};
            }
            return api;
          },
          insert(row) {
            ctx.op = "insert";
            ctx.payload = row;
            ctx.filters = {};
            ctx.inserted = null;
            return api;
          },
          update(row) {
            ctx.op = "update";
            ctx.payload = row;
            ctx.filters = {};
            return api;
          },
          eq(col, val) {
            ctx.filters[col] = val;
            return api;
          },
          maybeSingle: async () => {
            if (ctx.op === "insert") {
              const row = {
                id: "queue-1",
                ...ctx.payload,
                attempt_count: ctx.payload.attempt_count ?? 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              state.queue.push(row);
              ctx.inserted = row;
              return { data: { ...row }, error: null };
            }
            if (ctx.op === "update") {
              const row = state.queue.find(matchRow);
              if (!row) return { data: null, error: null };
              Object.assign(row, ctx.payload);
              return { data: { ...row }, error: null };
            }
            const row = state.queue.find(matchRow) || null;
            return { data: row ? { ...row } : null, error: null };
          }
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

function baseEnv(overrides = {}) {
  return {
    QB_WRITE_ENABLED: "true",
    QB_WRITE_ENV: "test",
    QB_WRITE_DRY_RUN: "true",
    QB_WRITE_ORGANIZATION_ID: ORG,
    QB_WRITE_TEST_COMPANY_ALLOWLIST: TEST_COMPANY,
    QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES: PROD_COMPANY,
    ...overrides
  };
}

test("production environment rejected by config", () => {
  const cfg = loadQbWriteConfig(baseEnv({ QB_WRITE_ENV: "production" }));
  const v = validateQbWriteConfig(cfg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === "QB_WRITE_ENV_NOT_TEST"));
});

test("dry-run false rejected in Phase 1", () => {
  const v = validateQbWriteConfig(loadQbWriteConfig(baseEnv({ QB_WRITE_DRY_RUN: "false" })));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === "QB_WRITE_DRY_RUN_REQUIRED"));
});

test("unknown company rejected; production company rejected", () => {
  assert.equal(assertCompanyAllowlisted("Unknown Co", [TEST_COMPANY], [PROD_COMPANY]).ok, false);
  assert.equal(assertCompanyAllowlisted(PROD_COMPANY, [TEST_COMPANY], [PROD_COMPANY]).ok, false);
  assert.equal(assertCompanyAllowlisted(TEST_COMPANY, [TEST_COMPANY], [PROD_COMPANY]).ok, true);
});

test("production company cannot sit on TEST allowlist", () => {
  const v = validateQbWriteConfig(
    loadQbWriteConfig(
      baseEnv({
        QB_WRITE_TEST_COMPANY_ALLOWLIST: PROD_COMPANY,
        QB_WRITE_FORBIDDEN_COMPANY_IDENTITIES: PROD_COMPANY
      })
    )
  );
  assert.equal(v.ok, false);
});

test("non-QBTEST reference rejected", () => {
  const r = validateQbWriteSafetyGate({
    writeEnvironment: "test",
    quoteNumber: "DYR-0001",
    companyIdentity: TEST_COMPANY,
    allowedCompanyIdentities: [TEST_COMPANY],
    idempotencyKey: "k",
    existingQueueStatus: null
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "QB_TEST_QUOTE_PREFIX_REQUIRED"));
});

test("missing mapping / ListID rejected", () => {
  const missing = requireMappedConcepts([], QBTEST_0001_CONCEPT_KEYS);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.every((e) => e.code === "QB_MAPPING_MISSING"));

  const partial = requireMappedConcepts(
    [{ eliteos_concept_key: "tear_out", qb_list_id: "", pricing_source: "eliteos_pricing_admin" }],
    ["tear_out"]
  );
  assert.equal(partial.ok, false);
});

test("succeeded idempotency key rejected", () => {
  const r = validateQbWriteSafetyGate({
    writeEnvironment: "test",
    quoteNumber: QBTEST_REF_NUMBER,
    companyIdentity: TEST_COMPANY,
    allowedCompanyIdentities: [TEST_COMPANY],
    idempotencyKey: QBTEST_IDEMPOTENCY_KEY,
    existingQueueStatus: "succeeded"
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.code === "QB_QUEUE_ALREADY_SUCCEEDED"));
});

test("CustomerQuery / CompanyQuery parsers + read-only xml", () => {
  const companyXml = buildCompanyQueryQbXml({ qbXmlVersion: "13.0" });
  assert.equal(qbXmlContainsWriteRequest(companyXml), false);
  assert.equal(
    parseCompanyIdentity(`<CompanyQueryRs><CompanyRet><CompanyName>${TEST_COMPANY}</CompanyName></CompanyRet></CompanyQueryRs>`),
    TEST_COMPANY
  );

  const custXml = buildCustomerQueryByFullNameQbXml({ fullName: QBTEST_CUSTOMER_FULL_NAME });
  assert.equal(qbXmlContainsWriteRequest(custXml), false);
  assert.match(custXml, /ELITEOS TEST CUSTOMER/);
  const parsed = parseCustomerQueryListId(
    `<CustomerQueryRs><CustomerRet><ListID>${CUSTOMER_LIST_ID}</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName></CustomerRet></CustomerQueryRs>`
  );
  assert.equal(parsed.listId, CUSTOMER_LIST_ID);
  assert.equal(parseCustomerQueryListId("<CustomerQueryRs></CustomerQueryRs>").listId, null);
});

test("resolveExactlyOneActiveTestCustomer requires unique active match", () => {
  const one = resolveExactlyOneActiveTestCustomer(
    `<CustomerQueryRs><CustomerRet><ListID>${CUSTOMER_LIST_ID}</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName><IsActive>true</IsActive></CustomerRet></CustomerQueryRs>`,
    QBTEST_CUSTOMER_FULL_NAME
  );
  assert.equal(one.ok, true);
  assert.equal(one.listId, CUSTOMER_LIST_ID);

  const none = resolveExactlyOneActiveTestCustomer("<CustomerQueryRs></CustomerQueryRs>", QBTEST_CUSTOMER_FULL_NAME);
  assert.equal(none.ok, false);
  assert.ok(none.errors.some((e) => e.code === "QB_TEST_CUSTOMER_MISSING"));

  const multi = resolveExactlyOneActiveTestCustomer(
    `<CustomerQueryRs>` +
      `<CustomerRet><ListID>A</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName><IsActive>true</IsActive></CustomerRet>` +
      `<CustomerRet><ListID>B</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName><IsActive>true</IsActive></CustomerRet>` +
      `</CustomerQueryRs>`,
    QBTEST_CUSTOMER_FULL_NAME
  );
  assert.equal(multi.ok, false);
  assert.ok(multi.errors.some((e) => e.code === "QB_TEST_CUSTOMER_NOT_UNIQUE"));

  const inactive = resolveExactlyOneActiveTestCustomer(
    `<CustomerQueryRs><CustomerRet><ListID>${CUSTOMER_LIST_ID}</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName><IsActive>false</IsActive></CustomerRet></CustomerQueryRs>`,
    QBTEST_CUSTOMER_FULL_NAME
  );
  assert.equal(inactive.ok, false);
  assert.ok(inactive.errors.some((e) => e.code === "QB_TEST_CUSTOMER_INACTIVE"));
});

test("quantity*rate expected_amount validation before line build", () => {
  const ok = assertQuantityRateAmountConsistent({ quantity: 1, rate: 750, amount: 750 });
  assert.equal(ok.expectedAmount, 750);
  assert.equal(expectedLineAmount(2, 150.555), 301.11);
  assert.throws(
    () => assertQuantityRateAmountConsistent({ quantity: 1, rate: 100, amount: 99 }),
    /amount 99 != quantity\*rate 100/
  );
});

test("EstimateLineAdd emits Quantity+Rate and does NOT contain Amount", () => {
  const built = buildEstimateAddQbXml({
    customerListId: CUSTOMER_LIST_ID,
    refNumber: QBTEST_REF_NUMBER,
    txnDate: "2026-09-23",
    lines: [{ itemListId: "8000005C-1327168522", desc: "Tear Out", quantity: 1, rate: 750, amount: 750 }]
  });
  assert.match(built.qbXml, /<Quantity>1<\/Quantity>/);
  assert.match(built.qbXml, /<Rate>750<\/Rate>/);
  assert.equal(/<Amount>/i.test(built.qbXml), false);
  assert.equal(built.validatedAmounts[0].expectedAmount, 750);

  // Every EstimateLineAdd block: has Qty+Rate, no Amount
  const lines = [...built.qbXml.matchAll(/<EstimateLineAdd>[\s\S]*?<\/EstimateLineAdd>/g)].map((m) => m[0]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /<Quantity>/);
  assert.match(lines[0], /<Rate>/);
  assert.equal(/<Amount>/i.test(lines[0]), false);
});

test("EstimateAdd qbXML contains mapped ListIDs, customer ListID, QBTEST-0001; no Amount on lines", () => {
  const required = requireMappedConcepts(LIVE_MAPPINGS, QBTEST_0001_CONCEPT_KEYS);
  assert.equal(required.ok, true);
  const built = buildQbtest0001EstimateAdd(required.mappings, {
    customerListId: CUSTOMER_LIST_ID,
    txnDate: "2026-09-23",
    qbXmlVersion: "13.0"
  });
  assert.equal(qbXmlContainsWriteRequest(built.qbXml), true);
  assert.match(built.qbXml, /<EstimateAddRq[\s>]/);
  assert.match(built.qbXml, new RegExp(`<RefNumber>${QBTEST_REF_NUMBER}</RefNumber>`));
  assert.match(built.qbXml, new RegExp(`<ListID>${CUSTOMER_LIST_ID}</ListID>`));
  assert.match(built.qbXml, /8000005C-1327168522/); // tear_out
  assert.match(built.qbXml, /80000023-1327168507/); // cooktop
  assert.match(built.qbXml, /8000006D-1327168526/); // kitchen sink cutout
  assert.match(built.qbXml, /8000023B-1652221291/); // waterfall
  assert.match(built.qbXml, /QBTEST fake line/);
  assert.match(built.qbXml, /<\?qbxml version="13\.0"\?>/);

  const lineBlocks = [...built.qbXml.matchAll(/<EstimateLineAdd>[\s\S]*?<\/EstimateLineAdd>/g)].map((m) => m[0]);
  assert.equal(lineBlocks.length, 4);
  for (const block of lineBlocks) {
    assert.match(block, /<ItemRef><ListID>/);
    assert.match(block, /<Desc>/);
    assert.match(block, /<Quantity>/);
    assert.match(block, /<Rate>/);
    assert.equal(/<Amount>/i.test(block), false);
  }
  assert.deepEqual(
    built.lines.map((l) => l.expectedAmount),
    [750, 150, 200, 600]
  );
});

test("TEST item validation fails on missing / inactive / FullName mismatch", () => {
  const expected = QBTEST_0001_EXPECTED_ITEMS;
  const good = validateExpectedTestItems(
    expected,
    expected.map((e) => ({ listId: e.listId, fullName: e.fullName, isActive: true, found: true }))
  );
  assert.equal(good.ok, true);

  const missing = validateExpectedTestItems(expected, [
    { listId: null, fullName: null, isActive: null, found: false },
    ...expected.slice(1).map((e) => ({ listId: e.listId, fullName: e.fullName, isActive: true, found: true }))
  ]);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.code === "QB_TEST_ITEM_MISSING"));

  const inactive = validateExpectedTestItems(expected, [
    { listId: expected[0].listId, fullName: expected[0].fullName, isActive: false, found: true },
    ...expected.slice(1).map((e) => ({ listId: e.listId, fullName: e.fullName, isActive: true, found: true }))
  ]);
  assert.equal(inactive.ok, false);
  assert.ok(inactive.errors.some((e) => e.code === "QB_TEST_ITEM_INACTIVE"));

  const wrongName = validateExpectedTestItems(expected, [
    { listId: expected[0].listId, fullName: "WRONG NAME", isActive: true, found: true },
    ...expected.slice(1).map((e) => ({ listId: e.listId, fullName: e.fullName, isActive: true, found: true }))
  ]);
  assert.equal(wrongName.ok, false);
  assert.ok(wrongName.errors.some((e) => e.code === "QB_TEST_ITEM_FULLNAME_MISMATCH"));

  const itemXml = buildItemQueryByListIdQbXml({ listId: "8000005C-1327168522" });
  assert.equal(qbXmlContainsWriteRequest(itemXml), false);
  const parsed = parseItemQueryRet(
    `<ItemQueryRs><ItemServiceRet><ListID>8000005C-1327168522</ListID><FullName>Tear Out</FullName><IsActive>true</IsActive></ItemServiceRet></ItemQueryRs>`
  );
  assert.equal(parsed.listId, "8000005C-1327168522");
  assert.equal(parsed.fullName, "Tear Out");
  assert.equal(parsed.isActive, true);
});

test("dry run never calls ProcessRequest for EstimateAdd; transmitEstimateAdd throws", async () => {
  let processCalls = 0;
  const transport = {
    processRequest: async () => {
      processCalls += 1;
      throw new Error("should not be called for Add");
    }
  };
  const built = buildEstimateAddQbXml({
    customerListId: CUSTOMER_LIST_ID,
    refNumber: QBTEST_REF_NUMBER,
    txnDate: "2026-09-23",
    lines: [{ itemListId: "8000005C-1327168522", desc: "x", quantity: 1, rate: 1 }]
  });
  const guarded = await processQbXmlSafely(transport, built.qbXml, { dryRun: true, purpose: "EstimateAdd" });
  assert.equal(guarded.transmitted, false);
  assert.equal(guarded.blocked, true);
  assert.equal(processCalls, 0);
  assert.throws(() => transmitEstimateAdd({ qbXml: built.qbXml }), /Phase 1|disabled|DRY RUN/i);
});

test("processQbXmlSafely allows CustomerQuery ProcessRequest", async () => {
  let seen = null;
  const transport = {
    processRequest: async (xml) => {
      seen = xml;
      return `<CustomerQueryRs><CustomerRet><ListID>${CUSTOMER_LIST_ID}</ListID><FullName>${QBTEST_CUSTOMER_FULL_NAME}</FullName></CustomerRet></CustomerQueryRs>`;
    }
  };
  const xml = buildCustomerQueryByFullNameQbXml({ fullName: QBTEST_CUSTOMER_FULL_NAME });
  const res = await processQbXmlSafely(transport, xml, { dryRun: true, purpose: "CustomerQuery" });
  assert.equal(res.transmitted, true);
  assert.ok(seen.includes("CustomerQueryRq"));
  assert.equal(parseCustomerQueryListId(res.responseXml).listId, CUSTOMER_LIST_ID);
});

test("runQbEstimateDryRun happy path builds XML, leaves queue pending (not claimed), no Amount", async () => {
  const db = mockDb();
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db,
    skipSdkQueries: true,
    companyIdentityOverride: TEST_COMPANY,
    customerListIdOverride: CUSTOMER_LIST_ID,
    persistQueue: true,
    claimQueue: true // ignored — dry-run must never claim
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.dryRunBanner, "DRY RUN — NOTHING SENT TO QUICKBOOKS");
  assert.equal(result.refNumber, QBTEST_REF_NUMBER);
  assert.equal(result.customerListId, CUSTOMER_LIST_ID);
  assert.match(result.estimateAddQbXml, /EstimateAddRq/);
  assert.match(result.estimateAddQbXml, /8000005C-1327168522/);
  assert.equal(/<Amount>/i.test(result.estimateAddQbXml), false);
  assert.equal(result.addGuard.transmitted, false);
  assert.equal(result.addGuard.blocked, true);
  assert.ok(result.transmitBlocked);
  assert.equal(result.queueRow.status, "pending");
  assert.notEqual(result.queueRow.status, "claimed");
  assert.equal(db.state.queue.length, 1);
  assert.equal(db.state.queue[0].status, "pending");
  assert.equal(result.itemValidation.ok, true);
});

test("dry-run completion never leaves claimed even if prior Phase 1 left claimed", async () => {
  const db = mockDb({
    queue: [
      {
        id: "queue-1",
        organization_id: ORG,
        idempotency_key: QBTEST_IDEMPOTENCY_KEY,
        status: "claimed",
        environment: "test",
        attempt_count: 1,
        operation_type: "EstimateAdd"
      }
    ]
  });
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db,
    skipSdkQueries: true,
    companyIdentityOverride: TEST_COMPANY,
    customerListIdOverride: CUSTOMER_LIST_ID,
    persistQueue: true
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.queueRow.status, "pending");
  assert.equal(db.state.queue[0].status, "pending");
});

test("dry-run failure path cannot leave a claimed queue row", async () => {
  const db = mockDb({
    queue: [
      {
        id: "queue-1",
        organization_id: ORG,
        idempotency_key: QBTEST_IDEMPOTENCY_KEY,
        status: "claimed",
        environment: "test",
        attempt_count: 1,
        operation_type: "EstimateAdd"
      }
    ]
  });
  // Fail at item validation after restore-from-claimed runs.
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db,
    skipSdkQueries: true,
    companyIdentityOverride: TEST_COMPANY,
    customerListIdOverride: CUSTOMER_LIST_ID,
    persistQueue: true,
    itemValidationOverride: [
      { listId: null, fullName: null, isActive: null, found: false },
      { listId: "80000023-1327168507", fullName: "Cooktop Cutout", isActive: true, found: true },
      { listId: "8000006D-1327168526", fullName: "Undermount Sink Cutout", isActive: true, found: true },
      { listId: "8000023B-1652221291", fullName: "Edge:Waterfall End Panels", isActive: true, found: true }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "item_validation");
  assert.equal(db.state.queue[0].status, "pending");
  assert.notEqual(db.state.queue[0].status, "claimed");
});

test("restoreClaimedQbtest0001QueueRowToPending is a no-op for pending", async () => {
  const db = mockDb({
    queue: [
      {
        id: "queue-1",
        organization_id: ORG,
        idempotency_key: QBTEST_IDEMPOTENCY_KEY,
        status: "pending",
        environment: "test"
      }
    ]
  });
  const r = await restoreClaimedQbtest0001QueueRowToPending(db, { organizationId: ORG });
  assert.equal(r.restored, false);
  assert.equal(db.state.queue[0].status, "pending");
});

test("claimSinglePendingQueueRow exists for future worker but dry-run does not rely on claim", async () => {
  const db = mockDb({
    queue: [
      {
        id: "queue-1",
        organization_id: ORG,
        idempotency_key: QBTEST_IDEMPOTENCY_KEY,
        status: "pending",
        environment: "test",
        attempt_count: 0
      }
    ]
  });
  const claimed = await claimSinglePendingQueueRow(db, { organizationId: ORG, queueRowId: "queue-1" });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.row.status, "claimed");
  // Dry-run restore undoes worker-style claim leftovers.
  const restored = await restoreClaimedQbtest0001QueueRowToPending(db, { organizationId: ORG });
  assert.equal(restored.restored, true);
  assert.equal(db.state.queue[0].status, "pending");
});

test("runQbEstimateDryRun rejects missing customer override", async () => {
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db: mockDb(),
    skipSdkQueries: true,
    companyIdentityOverride: TEST_COMPANY,
    customerListIdOverride: null,
    persistQueue: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === "QB_TEST_CUSTOMER_MISSING"));
});

test("runQbEstimateDryRun rejects unknown company", async () => {
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db: mockDb(),
    skipSdkQueries: true,
    companyIdentityOverride: "Totally Unknown Company",
    customerListIdOverride: CUSTOMER_LIST_ID,
    persistQueue: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === "QB_COMPANY_NOT_ALLOWLISTED"));
});

test("only one queue item — second succeeded key blocked", async () => {
  const db = mockDb({
    queue: [
      {
        id: "queue-1",
        organization_id: ORG,
        idempotency_key: QBTEST_IDEMPOTENCY_KEY,
        status: "succeeded",
        environment: "test",
        attempt_count: 1
      }
    ]
  });
  const result = await runQbEstimateDryRun({
    env: baseEnv(),
    db,
    skipSdkQueries: true,
    companyIdentityOverride: TEST_COMPANY,
    customerListIdOverride: CUSTOMER_LIST_ID,
    persistQueue: true,
    claimQueue: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === "QB_QUEUE_ALREADY_SUCCEEDED"));
});
