/**
 * Tests for pure promotion modules (no Supabase, no IO).
 *
 * Run: npm run eos:test:moraware-report-feed-promotion
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mapPreparedSalesWorksheetFact, parseSqft } from "./mapPreparedSalesWorksheetFact.js";
import { shouldPromoteReportRun } from "./shouldPromoteReportRun.js";
import { planPreparedFactSupersede } from "./planPreparedFactSupersede.js";
import { processReportFeedLocal, computeExpectedColumnHash, SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS } from "./processReportFeed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "../../../test/fixtures/moraware-report-feeds");
const csvFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.csv"), "utf8");
const htmlFixture = readFileSync(join(fixtureDir, "sales-worksheet-facts.sample.html"), "utf8");

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";
const FAKE_FEED_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const FAKE_RUN_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const FIXED_TS = "2026-01-01T00:00:00.000Z";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEnrichedRow(overrides = {}) {
  return {
    rowNumber: 1,
    rowHash: "abc123rowhashabc123rowhashabc123abc123rowhashabc123rowhashabc123",
    identityStatus: "matched",
    identityReason: null,
    accountName: "Sample Builders LLC",
    jobName: "Kitchen Remodel Phase A",
    accountId: "462",
    jobId: "37780",
    jobStatus: "Quoted",
    jobCreationDate: "2026-01-15",
    jobSalesperson: "Alex Sample",
    totalWorksheetSqft: "42.50",
    color: "Cloud White",
    stone: "Quartz",
    room: "Kitchen",
    branchOrProcess: "Dyersville",
    rawRow: { "Account Name": "Sample Builders LLC", "Job Name": "Kitchen Remodel Phase A" },
    ...overrides
  };
}

function makeMapParams(rowOverrides = {}) {
  return {
    enrichedRow: makeEnrichedRow(rowOverrides),
    organizationId: FAKE_ORG,
    reportFeedId: FAKE_FEED_ID,
    reportRunId: FAKE_RUN_ID,
    promotedAt: FIXED_TS
  };
}

function makeValidProcessResult(overrides = {}) {
  const expectedHash = computeExpectedColumnHash(SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS);
  const base = processReportFeedLocal({
    csvText: csvFixture,
    htmlText: htmlFixture,
    organizationId: FAKE_ORG,
    reportType: "sales_worksheet_facts",
    expectedColumns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
    expectedColumnHash: expectedHash,
    morawareViewId: 219
  });
  return { ...base, ...overrides };
}

// ── parseSqft ─────────────────────────────────────────────────────────────────

{
  assert.equal(parseSqft("42.50"), 42.5, "parseSqft: standard decimal");
  assert.equal(parseSqft("1,234.56"), 1234.56, "parseSqft: comma-thousands separator");
  assert.equal(parseSqft("0"), 0, "parseSqft: zero");
  assert.equal(parseSqft(""), null, "parseSqft: empty string → null");
  assert.equal(parseSqft(null), null, "parseSqft: null → null");
  assert.equal(parseSqft(undefined), null, "parseSqft: undefined → null");
  assert.equal(parseSqft("n/a"), null, "parseSqft: non-numeric → null");
  assert.equal(parseSqft("-5"), null, "parseSqft: negative → null");
  assert.equal(parseSqft("999999"), null, "parseSqft: over sanity cap → null");
}

// ── mapPreparedSalesWorksheetFact ─────────────────────────────────────────────

{
  const payload = mapPreparedSalesWorksheetFact(makeMapParams());

  assert.equal(payload.organization_id, FAKE_ORG, "map: organization_id");
  assert.equal(payload.report_feed_id, FAKE_FEED_ID, "map: report_feed_id");
  assert.equal(payload.report_run_id, FAKE_RUN_ID, "map: report_run_id");
  assert.equal(payload.row_hash, makeEnrichedRow().rowHash, "map: row_hash");
  assert.equal(payload.account_id, "462", "map: account_id from enriched");
  assert.equal(payload.account_name, "Sample Builders LLC", "map: account_name");
  assert.equal(payload.job_id, "37780", "map: job_id from enriched");
  assert.equal(payload.job_name, "Kitchen Remodel Phase A", "map: job_name");
  assert.equal(payload.job_status, "Quoted", "map: job_status");
  assert.equal(payload.job_creation_date, "2026-01-15", "map: job_creation_date");
  assert.equal(payload.job_salesperson, "Alex Sample", "map: job_salesperson");
  assert.equal(payload.total_worksheet_sqft, 42.5, "map: sqft parsed to numeric");
  assert.equal(payload.color, "Cloud White", "map: color");
  assert.equal(payload.stone, "Quartz", "map: stone");
  assert.equal(payload.room, "Kitchen", "map: room");
  assert.equal(payload.branch_or_process, "Dyersville", "map: branch_or_process");
  assert.equal(payload.identity_status, "matched", "map: identity_status preserved");
  assert.equal(payload.is_active, true, "map: is_active=true on new fact");
  assert.equal(payload.superseded_at, null, "map: superseded_at null on new fact");
  assert.equal(payload.superseded_by, null, "map: superseded_by null on new fact");
  assert.equal(payload.promoted_at, FIXED_TS, "map: promoted_at set");
}

{
  // Blank sqft → null (null-safe)
  const payload = mapPreparedSalesWorksheetFact(makeMapParams({ totalWorksheetSqft: "" }));
  assert.equal(payload.total_worksheet_sqft, null, "map: blank sqft → null");
}

{
  // branch_or_process is null when branchOrProcess not in real export (v1 decision: nullable)
  const payload = mapPreparedSalesWorksheetFact(makeMapParams({ branchOrProcess: null }));
  assert.equal(payload.branch_or_process, null, "map: branch_or_process is null when not in export (v1)");
}

{
  // Missing sqft field (undefined in enriched row)
  const row = makeEnrichedRow({ totalWorksheetSqft: undefined });
  const payload = mapPreparedSalesWorksheetFact({ ...makeMapParams(), enrichedRow: row });
  assert.equal(payload.total_worksheet_sqft, null, "map: undefined sqft → null");
}

{
  // No guessing: null IDs stay null when absent
  const row = makeEnrichedRow({ accountId: null, jobId: null, identityStatus: "needs_identity_review" });
  const payload = mapPreparedSalesWorksheetFact({ ...makeMapParams(), enrichedRow: row });
  assert.equal(payload.account_id, null, "map: null accountId not guessed");
  assert.equal(payload.job_id, null, "map: null jobId not guessed");
  assert.equal(payload.identity_status, "needs_identity_review", "map: identity_status preserved for unmatched");
}

{
  // Required param guards
  assert.throws(
    () => mapPreparedSalesWorksheetFact({ enrichedRow: null, organizationId: FAKE_ORG, reportFeedId: FAKE_FEED_ID, reportRunId: FAKE_RUN_ID }),
    /enrichedRow is required/
  );
  assert.throws(
    () => mapPreparedSalesWorksheetFact({ enrichedRow: makeEnrichedRow(), organizationId: "", reportFeedId: FAKE_FEED_ID, reportRunId: FAKE_RUN_ID }),
    /organizationId is required/
  );
}

// ── shouldPromoteReportRun ────────────────────────────────────────────────────

{
  // Validated fixture result passes gate
  const result = makeValidProcessResult();
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, true, "gate: validated fixture result should allow promotion");
  assert.equal(gate.reason, null, "gate: no reason when ok");
}

{
  // Blocks when status is not validated
  const result = makeValidProcessResult({ runStatus: "needs_review" });
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, false, "gate: blocks needs_review");
  assert.equal(gate.reason, "run_not_validated", "gate: correct reason for non-validated");
}

{
  // Blocks on schema drift
  const result = makeValidProcessResult({
    schemaDrift: { detected: true, observedHash: "aaa", expectedHash: "bbb" }
  });
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, false, "gate: blocks schema drift");
  assert.equal(gate.reason, "schema_drift_detected");
}

{
  // Blocks on ambiguous identity
  const result = makeValidProcessResult();
  result.enrichment = {
    ...result.enrichment,
    counts: { ...result.enrichment.counts, ambiguous_identity: 1 },
    duplicatePreparedFacts: []
  };
  result.runStatus = "needs_review"; // enrichment with ambiguous should also be needs_review
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, false, "gate: blocks when run is not validated (set by ambiguous)");
}

{
  // Blocks on duplicate row hashes (injected directly into enrichment)
  const result = makeValidProcessResult();
  result.enrichment = {
    ...result.enrichment,
    duplicatePreparedFacts: [{ rowHash: "dup", firstRowNumber: 1, duplicateRowNumber: 2 }]
  };
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, false, "gate: blocks duplicate row hashes");
  assert.equal(gate.reason, "duplicate_row_hashes");
}

{
  // Blocks on zero rows
  const result = makeValidProcessResult();
  result.profile = { ...result.profile, rowCount: 0 };
  result.enrichment = { ...result.enrichment, rows: [] };
  const gate = shouldPromoteReportRun(result);
  assert.equal(gate.ok, false, "gate: blocks zero rows");
  assert.equal(gate.reason, "zero_rows");
}

{
  // Blocks on invalid input
  const gate = shouldPromoteReportRun(null);
  assert.equal(gate.ok, false, "gate: blocks null input");
}

// ── planPreparedFactSupersede ─────────────────────────────────────────────────

const HASH_A = "aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa111aaa1";
const HASH_B = "bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb222bbb2";
const HASH_C = "ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc333ccc3";

function makeActiveFact(id, rowHash) {
  return { id, row_hash: rowHash, organization_id: FAKE_ORG, report_feed_id: FAKE_FEED_ID };
}

function makeIncoming(rowHash, extraFields = {}) {
  return {
    row_hash: rowHash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED_ID,
    report_run_id: FAKE_RUN_ID,
    is_active: true,
    ...extraFields
  };
}

{
  // No existing facts → only inserts, no deactivations.
  const plan = planPreparedFactSupersede({
    existingActiveFacts: [],
    incomingFacts: [makeIncoming(HASH_A), makeIncoming(HASH_B)],
    supersededAt: FIXED_TS
  });
  assert.equal(plan.safe, true, "supersede: safe when no existing facts");
  assert.equal(plan.insertCount, 2, "supersede: two inserts");
  assert.equal(plan.deactivateCount, 0, "supersede: no deactivations when nothing existed");
  assert.equal(plan.backfillCount, 0, "supersede: no backfill when nothing deactivated");
  const actions = plan.steps.map((s) => s.action);
  assert.ok(!actions.includes("deactivate"), "supersede: no deactivate steps");
}

{
  // One existing active fact for HASH_A → deactivate before insert.
  const existing = makeActiveFact("existing-id-1", HASH_A);
  const plan = planPreparedFactSupersede({
    existingActiveFacts: [existing],
    incomingFacts: [makeIncoming(HASH_A)],
    supersededAt: FIXED_TS
  });
  assert.equal(plan.safe, true, "supersede: safe with single existing");
  assert.equal(plan.deactivateCount, 1, "supersede: one deactivation");
  assert.equal(plan.insertCount, 1, "supersede: one insert");
  assert.equal(plan.backfillCount, 1, "supersede: one backfill");

  // Deactivate step must come before insert step.
  const deactivateIdx = plan.steps.findIndex((s) => s.action === "deactivate");
  const insertIdx = plan.steps.findIndex((s) => s.action === "insert");
  assert.ok(deactivateIdx < insertIdx, "supersede: deactivate BEFORE insert");

  // Deactivate payload targets the correct existing id.
  assert.equal(plan.steps[deactivateIdx].payload.id, "existing-id-1");
  assert.equal(plan.steps[deactivateIdx].payload.is_active, false);
  assert.equal(plan.steps[deactivateIdx].payload.superseded_at, FIXED_TS);

  // Backfill links old id to the new row's hash for DB fulfillment.
  const backfillStep = plan.steps.find((s) => s.action === "backfill_superseded_by");
  assert.equal(backfillStep.payload.deactivatedId, "existing-id-1");
  assert.equal(backfillStep.payload.newFactRowHash, HASH_A);
}

{
  // Mixed: two existing, one incoming replaces HASH_A, one new HASH_C.
  const existing = [makeActiveFact("id-a", HASH_A), makeActiveFact("id-b", HASH_B)];
  const plan = planPreparedFactSupersede({
    existingActiveFacts: existing,
    incomingFacts: [makeIncoming(HASH_A), makeIncoming(HASH_C)],
    supersededAt: FIXED_TS
  });
  assert.equal(plan.deactivateCount, 1, "supersede: only HASH_A deactivated (HASH_B has no incoming)");
  assert.equal(plan.insertCount, 2, "supersede: two inserts (HASH_A replacement + new HASH_C)");
  assert.equal(plan.backfillCount, 1, "supersede: one backfill for HASH_A");
}

{
  // Duplicate incoming row_hashes → unsafe.
  const plan = planPreparedFactSupersede({
    existingActiveFacts: [],
    incomingFacts: [makeIncoming(HASH_A), makeIncoming(HASH_A)],
    supersededAt: FIXED_TS
  });
  assert.equal(plan.safe, false, "supersede: unsafe when incoming has duplicate hashes");
  assert.ok(plan.duplicateIncomingHashes.includes(HASH_A), "supersede: reports the duplicate hash");
  assert.equal(plan.steps.length, 0, "supersede: no steps emitted when unsafe");
}

{
  // All backfill steps come after all inserts.
  const existing = [makeActiveFact("id-a", HASH_A), makeActiveFact("id-b", HASH_B)];
  const plan = planPreparedFactSupersede({
    existingActiveFacts: existing,
    incomingFacts: [makeIncoming(HASH_A), makeIncoming(HASH_B)],
    supersededAt: FIXED_TS
  });
  const deactivateIdxes = plan.steps
    .map((s, i) => ({ action: s.action, i }))
    .filter((x) => x.action === "deactivate")
    .map((x) => x.i);
  const insertIdxes = plan.steps
    .map((s, i) => ({ action: s.action, i }))
    .filter((x) => x.action === "insert")
    .map((x) => x.i);
  const backfillIdxes = plan.steps
    .map((s, i) => ({ action: s.action, i }))
    .filter((x) => x.action === "backfill_superseded_by")
    .map((x) => x.i);
  const maxDeactivate = Math.max(...deactivateIdxes);
  const maxInsert = Math.max(...insertIdxes);
  const minBackfill = Math.min(...backfillIdxes);
  assert.ok(maxDeactivate < Math.min(...insertIdxes), "supersede: all deactivates before any insert");
  assert.ok(maxInsert < minBackfill, "supersede: all inserts before any backfill");
}

console.log("promoteSalesWorksheetFacts.test.mjs: ok");
