/**
 * Tests for promoteSalesWorksheetFacts.js — mock-DB only, no live Supabase.
 *
 * Run: npm run eos:test:moraware-report-feed-promote-persistence
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadActivePreparedFacts,
  promoteReportFeedFacts
} from "./promoteSalesWorksheetFacts.js";
import {
  computeExpectedColumnHash,
  processReportFeedLocal,
  SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS
} from "./processReportFeed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const csvFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.csv"), "utf8");
const htmlFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.html"), "utf8");

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";
const FAKE_FEED_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const FAKE_RUN_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const FAKE_EXISTING_FACT_ID = "cccccccc-0000-0000-0000-000000000001";
const NEW_FACT_ID = "dddddddd-0000-0000-0000-000000000001";

const FAKE_FEED = {
  id: FAKE_FEED_ID,
  organization_id: FAKE_ORG,
  name: "eliteOS - Sales Worksheet Facts",
  moraware_view_id: 219,
  report_type: "sales_worksheet_facts",
  expected_columns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
  expected_column_hash: computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS),
  is_active: true
};

function makeValidatedResult(overrides = {}) {
  return {
    ...processReportFeedLocal({
      csvText: csvFixture,
      htmlText: htmlFixture,
      organizationId: FAKE_ORG,
      reportType: "sales_worksheet_facts",
      expectedColumns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
      expectedColumnHash: FAKE_FEED.expected_column_hash,
      morawareViewId: 219
    }),
    ...overrides
  };
}

// ── Mock DB factory ───────────────────────────────────────────────────────────

/**
 * Builds a mock Supabase client that records operations.
 * @param {object} opts
 * @param {Array}  opts.activeFacts     - Rows returned by loadActivePreparedFacts query
 * @param {string} opts.newFactId       - ID returned from insert .select()
 * @param {Error|null} opts.insertError - Simulate insert failure
 * @param {Error|null} opts.deactivateError - Simulate deactivate failure
 */
function makeMockDb({
  activeFacts = [],
  newFactId = NEW_FACT_ID,
  insertError = null,
  deactivateError = null
} = {}) {
  const ops = [];
  let insertCallCount = 0;

  function makeChain(tableName, op, data) {
    ops.push({ op, table: tableName, data });
    const chain = {
      eq(col, val) { this._filters = { ...(this._filters ?? {}), [col]: val }; return this; },
      select() { return this; },
      limit() { return this; },
      then(resolve) {
        if (op === "insert" && insertError) { resolve({ data: null, error: insertError }); return; }
        if (op === "update" && deactivateError && data?.is_active === false) {
          resolve({ data: null, error: deactivateError }); return;
        }
        if (op === "select_active_facts") {
          resolve({ data: activeFacts, error: null }); return;
        }
        if (op === "insert") {
          insertCallCount++;
          resolve({ data: [{ id: newFactId, row_hash: data?.row_hash ?? "" }], error: null }); return;
        }
        resolve({ data: null, error: null });
      }
    };
    // Allow await directly on chain (thenable)
    chain[Symbol.toStringTag] = "Promise";
    return chain;
  }

  const db = {
    _ops: ops,
    from(tableName) {
      return {
        select(cols) {
          if (tableName === "moraware_prepared_sales_worksheet_facts") {
            const chain = makeChain(tableName, "select_active_facts", null);
            chain._eqFilters = {};
            chain.eq = function(col, val) { chain._eqFilters[col] = val; return chain; };
            chain.then = function(resolve) {
              ops.push({ op: "select_active_facts", table: tableName });
              resolve({ data: activeFacts, error: null });
            };
            return chain;
          }
          return makeChain(tableName, "select", cols);
        },
        insert(data) {
          const chain = makeChain(tableName, "insert", data);
          chain.select = function() { return chain; };
          chain.limit = function() { return chain; };
          return chain;
        },
        update(data) {
          const chain = makeChain(tableName, "update", data);
          chain.eq = function(col, val) {
            ops.push({ op: "update_eq", table: tableName, col, val });
            return chain;
          };
          return chain;
        },
        delete() {
          const chain = makeChain(tableName, "delete", null);
          chain.eq = function(col, val) {
            ops.push({ op: "delete_eq", table: tableName, col, val });
            return chain;
          };
          return chain;
        }
      };
    }
  };
  return db;
}

// ── Test: promotion blocked without promote flag ──────────────────────────────

{
  const result = makeValidatedResult();
  const db = makeMockDb();
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: false
  });
  assert.equal(out.promoted, false, "no-flag: promoted=false");
  assert.equal(out.skipped, true, "no-flag: skipped=true");
  assert.equal(out.reason, "promote_flag_not_set", "no-flag: reason");
  assert.equal(db._ops.length, 0, "no-flag: zero DB operations");
}

// ── Test: promotion blocked when shouldPromoteReportRun says no ───────────────

{
  const result = makeValidatedResult({ runStatus: "needs_review" });
  const db = makeMockDb();
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });
  assert.equal(out.promoted, false, "gate-fail: promoted=false");
  assert.equal(out.skipped, true, "gate-fail: skipped=true");
  assert.equal(out.reason, "run_not_validated", "gate-fail: correct reason");
  assert.equal(db._ops.length, 0, "gate-fail: zero DB operations");
}

{
  // Schema drift blocks promotion
  const result = makeValidatedResult({
    schemaDrift: { detected: true, observedHash: "aaa", expectedHash: "bbb", missingHeaders: ["Branch"], unexpectedHeaders: [] }
  });
  const db = makeMockDb();
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });
  assert.equal(out.promoted, false, "schema-drift: promoted=false");
  assert.equal(out.reason, "schema_drift_detected", "schema-drift: correct reason");
}

// ── Test: first promotion — no existing facts — inserts only ──────────────────

{
  const result = makeValidatedResult();
  const db = makeMockDb({ activeFacts: [] });
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });
  assert.equal(out.promoted, true, "first-promo: promoted=true");
  assert.equal(out.insertCount, 5, "first-promo: 5 fixture rows inserted");
  assert.equal(out.deactivateCount, 0, "first-promo: no deactivations (no existing)");

  const insertOps = db._ops.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  assert.equal(insertOps.length, 5, "first-promo: 5 insert operations");

  const deleteOps = db._ops.filter((o) => o.op === "delete" || o.op === "delete_eq");
  assert.equal(deleteOps.length, 0, "first-promo: zero deletes");
}

// ── Test: second promotion supersedes old active rows ─────────────────────────

{
  const result = makeValidatedResult();
  // Simulate one existing active fact matching the first enriched row's hash
  const firstEnrichedRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstEnrichedRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({ activeFacts: [existingFact] });
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });
  assert.equal(out.promoted, true, "second-promo: promoted=true");
  assert.equal(out.insertCount, 5, "second-promo: all 5 rows inserted");
  assert.equal(out.deactivateCount, 1, "second-promo: 1 old row deactivated");
  assert.ok(out.backfillCount >= 0, "second-promo: backfillCount defined");
}

// ── Test: deactivation comes before insert ────────────────────────────────────

{
  const result = makeValidatedResult();
  const firstRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({ activeFacts: [existingFact] });
  await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });

  const relevantOps = db._ops.filter((o) =>
    (o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts") ||
    (o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts")
  );

  const firstUpdateIdx = relevantOps.findIndex((o) => o.op === "update" && o.data?.is_active === false);
  const firstInsertIdx = relevantOps.findIndex((o) => o.op === "insert");
  assert.ok(firstUpdateIdx >= 0, "order: deactivation update found");
  assert.ok(firstInsertIdx >= 0, "order: insert found");
  assert.ok(firstUpdateIdx < firstInsertIdx, "order: deactivation strictly before first insert");
}

// ── Test: deactivated rows get is_active=false and superseded_at ──────────────

{
  const result = makeValidatedResult();
  const firstRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({ activeFacts: [existingFact] });
  await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });

  const deactivateOp = db._ops.find(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.is_active === false
  );
  assert.ok(deactivateOp, "deactivate: op found");
  assert.equal(deactivateOp.data.is_active, false, "deactivate: is_active=false");
  assert.ok(deactivateOp.data.superseded_at, "deactivate: superseded_at set");
}

// ── Test: backfill writes superseded_by ───────────────────────────────────────

{
  const result = makeValidatedResult();
  const firstRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({ activeFacts: [existingFact], newFactId: NEW_FACT_ID });
  const out = await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });

  // Backfill update sets superseded_by to new fact id
  const backfillOp = db._ops.find(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.superseded_by != null
  );
  assert.ok(backfillOp, "backfill: op found");
  assert.equal(backfillOp.data.superseded_by, NEW_FACT_ID, "backfill: superseded_by points to new fact id");
  assert.equal(out.backfillCount, 1, "backfill: backfillCount=1");
}

// ── Test: failed insert rolls back deactivations ──────────────────────────────

{
  const result = makeValidatedResult();
  const firstRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({
    activeFacts: [existingFact],
    insertError: new Error("DB write failed")
  });

  let threw = false;
  try {
    await promoteReportFeedFacts(db, {
      feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
    });
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes("DB write failed"), "rollback: original error preserved");
  }
  assert.ok(threw, "rollback: error was re-thrown");

  // Rollback: an update with is_active=true should have been issued for the deactivated id
  const rollbackOps = db._ops.filter(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.is_active === true
  );
  assert.ok(rollbackOps.length > 0, "rollback: re-activate update issued after insert failure");
}

// ── Test: no deletes ever ─────────────────────────────────────────────────────

{
  const result = makeValidatedResult();
  const firstRow = result.enrichment.rows[0];
  const existingFact = {
    id: FAKE_EXISTING_FACT_ID,
    row_hash: firstRow.rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID
  };
  const db = makeMockDb({ activeFacts: [existingFact] });
  await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });

  const deleteOps = db._ops.filter((o) => o.op === "delete" || o.op === "delete_eq");
  assert.equal(deleteOps.length, 0, "no-delete: zero delete operations in any scenario");
}

// ── Test: only sales_worksheet_facts feed type promoted ───────────────────────

{
  // If report_type is not sales_worksheet_facts the feed.id will be different;
  // promoteSalesWorksheetFacts.js does not check report_type itself — the caller
  // is responsible for passing the right feed. Verify the module uses feed.id consistently.
  const result = makeValidatedResult();
  const db = makeMockDb({ activeFacts: [] });
  const out = await promoteReportFeedFacts(db, {
    feed: { ...FAKE_FEED, id: "eeeeeeee-0000-0000-0000-000000000001", report_type: "sales_worksheet_facts" },
    runId: FAKE_RUN_ID,
    processResult: result,
    promoteFlag: true
  });
  assert.equal(out.promoted, true, "type-check: promoted=true for sales_worksheet_facts feed");
  const insertOps = db._ops.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  for (const op of insertOps) {
    assert.equal(op.data.report_feed_id, "eeeeeeee-0000-0000-0000-000000000001",
      "type-check: inserted rows carry the correct feed id");
  }
}

// ── Test: loadActivePreparedFacts query ───────────────────────────────────────

{
  const fakeActiveFacts = [
    { id: FAKE_EXISTING_FACT_ID, row_hash: "abc123", organization_id: FAKE_ORG, report_feed_id: FAKE_FEED_ID }
  ];
  const db = makeMockDb({ activeFacts: fakeActiveFacts });
  const facts = await loadActivePreparedFacts(db, { organizationId: FAKE_ORG, reportFeedId: FAKE_FEED_ID });
  assert.equal(facts.length, 1, "loadActive: returns existing facts");
  assert.equal(facts[0].id, FAKE_EXISTING_FACT_ID, "loadActive: correct fact id");
}

{
  // Empty when no active facts
  const db = makeMockDb({ activeFacts: [] });
  const facts = await loadActivePreparedFacts(db, { organizationId: FAKE_ORG, reportFeedId: FAKE_FEED_ID });
  assert.equal(facts.length, 0, "loadActive: empty array when no active facts");
}

// ── Test: promoted facts carry correct field values ───────────────────────────

{
  const result = makeValidatedResult();
  const db = makeMockDb({ activeFacts: [] });
  await promoteReportFeedFacts(db, {
    feed: FAKE_FEED, runId: FAKE_RUN_ID, processResult: result, promoteFlag: true
  });

  const insertOps = db._ops.filter(
    (o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts"
  );
  for (const op of insertOps) {
    assert.equal(op.data.organization_id, FAKE_ORG, "payload: org_id on insert");
    assert.equal(op.data.report_feed_id, FAKE_FEED_ID, "payload: feed_id on insert");
    assert.equal(op.data.report_run_id, FAKE_RUN_ID, "payload: run_id on insert");
    assert.equal(op.data.is_active, true, "payload: is_active=true on insert");
    assert.equal(op.data.superseded_at, null, "payload: superseded_at=null on insert");
    assert.equal(op.data.superseded_by, null, "payload: superseded_by=null on insert");
    assert.ok(typeof op.data.row_hash === "string" && op.data.row_hash.length > 0,
      "payload: row_hash set");
  }
}

console.log("reportFeedPromotePersistence.test.mjs: ok");
