/**
 * Tests for promotePersistedRunMatchedFacts.js — mock-DB only, no live Supabase.
 * No real customer data.  All rows use fake names and fake UUIDs.
 *
 * Run: npm run eos:test:moraware-report-feed-promote-persisted
 */
import assert from "node:assert/strict";

import {
  checkPersistedRunGates,
  persistedRawRowToEnrichedRow,
  reviewAmbiguousRows,
  promotePersistedRunMatchedFacts
} from "./promotePersistedRunMatchedFacts.js";

// ── Fake IDs ──────────────────────────────────────────────────────────────────

const FAKE_ORG          = "00000000-0000-0000-0000-000000000001";
const FAKE_FEED         = "aaaaaaaa-0000-0000-0000-000000000001"; // view 219 feed
const FAKE_HISTORY_FEED = "aaaaaaaa-0000-0000-0000-000000000002"; // view 220 feed
const FAKE_RUN          = "bbbbbbbb-0000-0000-0000-000000000001";
const FACT_ID_1         = "cccccccc-0000-0000-0000-000000000001";
const FACT_ID_2         = "cccccccc-0000-0000-0000-000000000002";

// ── Fake run rows ─────────────────────────────────────────────────────────────

function makeRun(overrides = {}) {
  return {
    id: FAKE_RUN,
    organization_id: FAKE_ORG,
    status: "needs_review",
    report_feed_id: FAKE_FEED,
    schema_drift: { detected: false },
    matched_identity_count: 3,
    unmatched_identity_count: 0,
    ambiguous_identity_count: 1,
    summary: {},
    ...overrides
  };
}

// ── Fake raw rows (no real customer data) ─────────────────────────────────────

function makeRawRow(overrides = {}) {
  return {
    id: "row-" + Math.random().toString(36).slice(2, 8),
    row_hash: "hash-" + Math.random().toString(36).slice(2, 16),
    account_id: "42",
    job_id: "100",
    account_name: "Sample Builders LLC",
    job_name: "Kitchen Remodel Phase A",
    identity_status: "matched",
    identity_reason: "api_mirror_exact_account_job",
    raw_row: {
      "Account Name": "Sample Builders LLC",
      "Job Name": "Kitchen Remodel Phase A",
      "Job Status": "Scheduled",
      "Job Creation Date": "2025-03-01",
      "Job Salesperson": "Alice",
      "Stone": "Quartz",
      "Job Worksheet - Color": "White",
      "Job Worksheet - Room": "Kitchen",
      "Total Job Worksheet - Sq.Ft. by Job Creation Date": "42.5"
    },
    row_number: 1,
    ...overrides
  };
}

const SAMPLE_MATCHED_ROWS = [
  makeRawRow({ id: "row-1", row_hash: "hash-a" }),
  makeRawRow({ id: "row-2", row_hash: "hash-b" }),
  makeRawRow({ id: "row-3", row_hash: "hash-c" })
];

/** Fake name-only raw row (needs_identity_review, no account_id/job_id). */
function makeNameOnlyRawRow(overrides = {}) {
  return {
    id: "norow-" + Math.random().toString(36).slice(2, 8),
    row_hash: "hash-no-" + Math.random().toString(36).slice(2, 16),
    account_id: null,
    job_id: null,
    account_name: "Historic Builder Co",
    job_name: "Old Kitchen Project",
    identity_status: "needs_identity_review",
    identity_reason: "no_api_mirror_match",
    raw_row: {
      "Account Name": "Historic Builder Co",
      "Job Name": "Old Kitchen Project",
      "Job Creation Date": "2023-01-15",
      "Job Salesperson": "Bob",
      "Stone": "Granite",
      "Job Worksheet - Color": "Gray",
      "Job Worksheet - Room": "Kitchen",
      "Total Job Worksheet - Sq.Ft. by Job Creation Date": "38.0"
    },
    row_number: 10,
    ...overrides
  };
}

const SAMPLE_NAME_ONLY_ROWS = [
  makeNameOnlyRawRow({ id: "norow-1", row_hash: "hash-no-a" }),
  makeNameOnlyRawRow({ id: "norow-2", row_hash: "hash-no-b" }),
  makeNameOnlyRawRow({ id: "norow-3", row_hash: "hash-no-c" })
];

// Feed stubs for feed-type validation tests.
const FAKE_FEED_V219 = { id: FAKE_FEED, report_type: "sales_worksheet_facts" };
const FAKE_FEED_V220 = { id: FAKE_HISTORY_FEED, report_type: "sales_worksheet_history_facts" };

// ── Mock DB factory ───────────────────────────────────────────────────────────

/**
 * Builds a chainable mock Supabase client that records DB operations.
 *
 * @param {object} opts
 * @param {object|null}  opts.run               - Run row returned by maybeSingle()
 * @param {object|null}  opts.feed              - Feed row returned by maybeSingle() (for report_type lookup)
 * @param {Array}        opts.matchedRawRows     - Raw rows with identity_status='matched'
 * @param {Array}        opts.nameOnlyRawRows    - Raw rows with identity_status='needs_identity_review'
 * @param {Array}        opts.activeFacts        - Existing active prepared facts
 * @param {Array}        opts.ambiguousLinks     - Ambiguous identity links
 * @param {Error|null}   opts.insertError        - Simulate insert failure
 * @param {Error|null}   opts.deactivateError    - Simulate deactivate failure
 * @param {Error|null}   opts.runUpdateError     - Simulate run update failure
 */
function makeMockDb({
  run = null,
  feed = null,
  matchedRawRows = [],
  nameOnlyRawRows = [],
  activeFacts = [],
  ambiguousLinks = [],
  insertError = null,
  deactivateError = null,
  runUpdateError = null
} = {}) {
  const log = [];
  let insertCallIndex = 0;

  const db = {
    _log: log,
    from(tableName) {
      const state = { tableName, eqFilters: {}, inFilters: {} };

      const chain = {
        select() { return chain; },
        eq(col, val) {
          state.eqFilters[col] = val;
          return chain;
        },
        in(col, vals) {
          state.inFilters[col] = vals;
          return chain;
        },
        range(from, to) {
          const { tableName: t, eqFilters } = state;
          if (t === "moraware_report_raw_rows") {
            const statusFilter = eqFilters["identity_status"];
            const runFilter = eqFilters["report_run_id"];
            // Combine matched and name-only rows; filter by identity_status
            const allRawRows = [...matchedRawRows, ...nameOnlyRawRows];
            let rows = allRawRows;
            if (statusFilter) rows = rows.filter((r) => r.identity_status === statusFilter);
            if (runFilter) rows = rows.filter((r) => !r.report_run_id || r.report_run_id === runFilter);
            const page = rows.slice(from, to + 1);
            return Promise.resolve({ data: page.length ? page : null, error: null });
          }
          if (t === "moraware_prepared_sales_worksheet_facts" && eqFilters["is_active"] === true) {
            // loadActivePreparedFacts uses .eq() not .range(), but handle just in case
            return Promise.resolve({ data: activeFacts, error: null });
          }
          if (t === "moraware_report_identity_links") {
            const ambigFilter = eqFilters["is_ambiguous"];
            let links = ambiguousLinks;
            if (ambigFilter !== undefined) {
              links = links.filter((l) => l.is_ambiguous === ambigFilter);
            }
            const page = links.slice(from, to + 1);
            return Promise.resolve({ data: page.length ? page : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle() {
          const { tableName: t, eqFilters } = state;
          if (t === "moraware_report_runs") {
            const match = run && eqFilters["id"] === run.id ? run : null;
            return Promise.resolve({ data: match, error: null });
          }
          if (t === "moraware_report_feeds") {
            // Return matching feed or null (used to validate report_type for allowNameOnly)
            const match = feed && eqFilters["id"] === feed.id ? feed : null;
            return Promise.resolve({ data: match, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // select for active facts (loadActivePreparedFacts uses .eq() chain ending in then)
        then(resolve) {
          const { tableName: t, eqFilters } = state;
          if (t === "moraware_prepared_sales_worksheet_facts" && eqFilters["is_active"] === true) {
            log.push({ op: "select_active_facts", table: t });
            resolve({ data: activeFacts, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },

        insert(data) {
          const entry = {
            op: "insert",
            table: state.tableName,
            data: Array.isArray(data) ? data : [data]
          };
          log.push(entry);
          const insertChain = {
            select() { return insertChain; },
            limit() { return insertChain; },
            then(resolve) {
              if (insertError) {
                resolve({ data: null, error: insertError });
                return;
              }
              const rows = Array.isArray(data) ? data : [data];
              const returned = rows.map((r, i) => ({
                id: `new-fact-${insertCallIndex++}-${i}-${r.row_hash ?? ""}`,
                row_hash: r.row_hash ?? ""
              }));
              resolve({ data: returned, error: null });
            }
          };
          return insertChain;
        },

        update(data) {
          const entry = {
            op: "update",
            table: state.tableName,
            data,
            eqFilters: {},
            inFilter: null
          };
          log.push(entry);
          const updateChain = {
            eq(col, val) {
              entry.eqFilters[col] = val;
              return Promise.resolve(resolveUpdate(entry, data));
            },
            in(col, ids) {
              entry.inFilter = { col, ids };
              return Promise.resolve(resolveUpdate(entry, data));
            }
          };
          return updateChain;
        }
      };

      function resolveUpdate(entry, data) {
        if (entry.table === "moraware_prepared_sales_worksheet_facts") {
          if (deactivateError && data?.is_active === false) {
            return { data: null, error: deactivateError };
          }
        }
        if (entry.table === "moraware_report_runs" && runUpdateError) {
          return { data: null, error: runUpdateError };
        }
        return { error: null };
      }

      return chain;
    }
  };

  return db;
}

// ── checkPersistedRunGates — pure function tests ──────────────────────────────

{
  // Null/non-object run → invalid
  const r = checkPersistedRunGates(null);
  assert.equal(r.ok, false, "gates: null run → invalid_run");
  assert.equal(r.reason, "invalid_run");
}

{
  // Already promoted → block
  const r = checkPersistedRunGates(makeRun({ status: "promoted" }));
  assert.equal(r.ok, false, "gates: already promoted → already_promoted");
  assert.equal(r.reason, "already_promoted");
}

{
  // Schema drift → block
  const r = checkPersistedRunGates(makeRun({ schema_drift: { detected: true } }));
  assert.equal(r.ok, false, "gates: schema drift → schema_drift_detected");
  assert.equal(r.reason, "schema_drift_detected");
}

{
  // Unmatched rows → block
  const r = checkPersistedRunGates(makeRun({ unmatched_identity_count: 5 }));
  assert.equal(r.ok, false, "gates: unmatched → unmatched_rows_present");
  assert.equal(r.reason, "unmatched_rows_present");
  assert.equal(r.details.unmatchedCount, 5);
}

{
  // Ambiguous without matchedOnly flag → block
  const r = checkPersistedRunGates(makeRun({ ambiguous_identity_count: 2 }), { matchedOnly: false });
  assert.equal(r.ok, false, "gates: ambiguous without matchedOnly → require flag");
  assert.equal(r.reason, "ambiguous_rows_require_matched_only_flag");
  assert.equal(r.details.ambiguousCount, 2);
}

{
  // Ambiguous WITH matchedOnly flag → pass
  const r = checkPersistedRunGates(makeRun({ ambiguous_identity_count: 2 }), { matchedOnly: true });
  assert.equal(r.ok, true, "gates: ambiguous + matchedOnly → ok");
  assert.equal(r.reason, null);
}

{
  // Zero ambiguous, zero unmatched, not promoted → pass
  const r = checkPersistedRunGates(makeRun({ ambiguous_identity_count: 0, unmatched_identity_count: 0 }));
  assert.equal(r.ok, true, "gates: clean run → ok");
}

// ── persistedRawRowToEnrichedRow — pure function tests ────────────────────────

{
  const dbRow = makeRawRow({
    row_hash: "hash-xyz",
    account_id: "99",
    job_id: "200",
    account_name: "Fake Builders Co",
    job_name: "Bathroom Counters",
    identity_status: "matched",
    identity_reason: "api_mirror_exact_account_job"
  });
  const er = persistedRawRowToEnrichedRow(dbRow);

  assert.equal(er.rowHash, "hash-xyz", "adapter: rowHash");
  assert.equal(er.accountId, "99", "adapter: accountId");
  assert.equal(er.jobId, "200", "adapter: jobId");
  assert.equal(er.accountName, "Fake Builders Co", "adapter: accountName from dbRow");
  assert.equal(er.jobName, "Bathroom Counters", "adapter: jobName from dbRow");
  assert.equal(er.identityStatus, "matched", "adapter: identityStatus");
  assert.equal(er.jobStatus, "Scheduled", "adapter: jobStatus from raw_row");
  assert.equal(er.jobCreationDate, "2025-03-01", "adapter: jobCreationDate from raw_row");
  assert.equal(er.jobSalesperson, "Alice", "adapter: jobSalesperson from raw_row");
  assert.equal(er.totalWorksheetSqft, "42.5", "adapter: totalWorksheetSqft from raw_row");
  assert.equal(er.color, "White", "adapter: color from raw_row");
  assert.equal(er.stone, "Quartz", "adapter: stone from raw_row");
  assert.equal(er.room, "Kitchen", "adapter: room from raw_row");
  assert.equal(er.branchOrProcess, null, "adapter: branchOrProcess always null in v1");
  assert.deepEqual(er.rawRow, dbRow.raw_row, "adapter: rawRow is the original raw_row object");
}

{
  // Null raw_row → doesn't throw; all scalar fields null
  const dbRow = { row_hash: "h1", account_id: "1", job_id: "2",
                  account_name: "Acme", job_name: "Job", identity_status: "matched",
                  identity_reason: null, raw_row: null };
  const er = persistedRawRowToEnrichedRow(dbRow);
  assert.equal(er.rowHash, "h1", "null raw_row: rowHash");
  assert.equal(er.jobStatus, null, "null raw_row: jobStatus null");
  assert.equal(er.totalWorksheetSqft, null, "null raw_row: sqft null");
  assert.deepEqual(er.rawRow, {}, "null raw_row: rawRow defaults to {}");
}

{
  // account_name on dbRow preferred over raw_row["Account Name"]
  const dbRow = {
    row_hash: "h2", account_id: "5", job_id: "10",
    account_name: "Preferred Name",
    job_name: "Preferred Job",
    identity_status: "matched",
    identity_reason: null,
    raw_row: { "Account Name": "Stale Name", "Job Name": "Stale Job" }
  };
  const er = persistedRawRowToEnrichedRow(dbRow);
  assert.equal(er.accountName, "Preferred Name", "adapter: dbRow.account_name preferred");
  assert.equal(er.jobName, "Preferred Job", "adapter: dbRow.job_name preferred");
}

// ── reviewAmbiguousRows — read-only, no writes ────────────────────────────────

{
  const fakeRun = makeRun({
    id: FAKE_RUN,
    ambiguous_identity_count: 2
  });
  const fakeLinks = [
    { match_key: "abc123", account_id: "10", job_id: "200", source: "api_mirror", is_ambiguous: true },
    { match_key: "def456", account_id: "11", job_id: "201", source: "api_mirror", is_ambiguous: true }
  ];
  const db = makeMockDb({ run: fakeRun, ambiguousLinks: fakeLinks });
  const review = await reviewAmbiguousRows(db, { runId: FAKE_RUN, organizationId: FAKE_ORG });

  assert.equal(review.runStatus, "needs_review", "review: runStatus passed through");
  assert.equal(review.counts.ambiguous, 2, "review: ambiguous count");
  assert.equal(review.ambiguousLinks.length, 2, "review: 2 ambiguous links returned");
  assert.equal(review.ambiguousLinks[0].match_key, "abc123", "review: match_key present");
  assert.equal(review.ambiguousLinks[0].account_id, "10", "review: account_id present");
  assert.equal(review.ambiguousLinks[0].job_id, "200", "review: job_id present");
  assert.equal(review.ambiguousLinks[0].source, "api_mirror", "review: source present");

  // No write operations should have been logged
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "review: zero writes");
}

{
  // reviewAmbiguousRows: run not found → throws
  const db = makeMockDb({ run: null });
  let threw = false;
  try {
    await reviewAmbiguousRows(db, { runId: FAKE_RUN, organizationId: FAKE_ORG });
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes("run not found"), "review-not-found: error message");
  }
  assert.ok(threw, "review-not-found: error thrown");
}

// ── promotePersistedRunMatchedFacts — dry-run ─────────────────────────────────

{
  // Dry-run returns plan summary with no writes
  const fakeRun = makeRun({ ambiguous_identity_count: 1, matched_identity_count: 3 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: true, dryRun: true
  });

  assert.equal(result.dryRun, true, "dry-run: dryRun=true");
  assert.equal(result.promoted, false, "dry-run: promoted=false");
  assert.equal(result.skipped, false, "dry-run: skipped=false (plan computed)");
  assert.equal(result.matchedRowsEligible, 3, "dry-run: 3 matched rows eligible");
  assert.equal(result.ambiguousExcluded, 1, "dry-run: 1 ambiguous excluded");
  assert.equal(result.plan.insertCount, 3, "dry-run: 3 inserts planned");
  assert.equal(result.plan.deactivateCount, 0, "dry-run: 0 deactivations planned");

  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "dry-run: zero DB writes");
}

// ── promotePersistedRunMatchedFacts — gate refusals ───────────────────────────

{
  // Refuses schema drift
  const fakeRun = makeRun({ schema_drift: { detected: true, observedHash: "aaa", expectedHash: "bbb" } });
  const db = makeMockDb({ run: fakeRun });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, dryRun: true
  });
  assert.equal(result.skipped, true, "schema-drift: skipped=true");
  assert.equal(result.reason, "schema_drift_detected", "schema-drift: correct reason");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "schema-drift: zero writes");
}

{
  // Refuses unmatched rows
  const fakeRun = makeRun({ unmatched_identity_count: 4 });
  const db = makeMockDb({ run: fakeRun });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, dryRun: false
  });
  assert.equal(result.skipped, true, "unmatched: skipped=true");
  assert.equal(result.reason, "unmatched_rows_present", "unmatched: correct reason");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "unmatched: zero writes");
}

{
  // Refuses ambiguous without matchedOnly flag
  const fakeRun = makeRun({ ambiguous_identity_count: 3, unmatched_identity_count: 0 });
  const db = makeMockDb({ run: fakeRun });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });
  assert.equal(result.skipped, true, "no-flag: skipped=true");
  assert.equal(result.reason, "ambiguous_rows_require_matched_only_flag", "no-flag: correct reason");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "no-flag: zero writes");
}

{
  // Refuses run not found
  const db = makeMockDb({ run: null });
  let threw = false;
  try {
    await promotePersistedRunMatchedFacts(db, {
      runId: FAKE_RUN, organizationId: FAKE_ORG, dryRun: false
    });
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes("run not found"), "not-found: error message");
  }
  assert.ok(threw, "not-found: error thrown");
}

// ── promotePersistedRunMatchedFacts — apply: matched-only ─────────────────────

{
  // Apply: matchedOnly promotes matched rows, excludes ambiguous
  const fakeRun = makeRun({ ambiguous_identity_count: 1, matched_identity_count: 3 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: true, dryRun: false
  });

  assert.equal(result.promoted, true, "apply: promoted=true");
  assert.equal(result.dryRun, false, "apply: dryRun=false");
  assert.equal(result.insertCount, 3, "apply: 3 rows inserted");
  assert.equal(result.deactivateCount, 0, "apply: 0 deactivations (no existing)");
  assert.equal(result.ambiguousExcluded, 1, "apply: 1 ambiguous excluded");

  // Status should remain "needs_review" because ambiguous rows remain
  assert.equal(result.runStatus, "needs_review", "apply: status stays needs_review with ambiguous");

  const insertOps = db._log.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  assert.ok(insertOps.length >= 1, "apply: at least 1 insert batch");

  const totalInserted = insertOps.reduce((sum, op) => sum + op.data.length, 0);
  assert.equal(totalInserted, 3, "apply: 3 facts inserted total");
}

{
  // Apply: clean run (0 ambiguous) → status becomes "promoted"
  const fakeRun = makeRun({ ambiguous_identity_count: 0, matched_identity_count: 3 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  assert.equal(result.promoted, true, "clean-promo: promoted=true");
  assert.equal(result.runStatus, "promoted", "clean-promo: status set to promoted");
}

// ── Supersede semantics ───────────────────────────────────────────────────────

{
  // Deactivation happens before insert
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  // One existing active fact matching the first matched row's hash
  const existingFact = {
    id: FACT_ID_1,
    row_hash: SAMPLE_MATCHED_ROWS[0].row_hash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED
  };
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [existingFact] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  // Find deactivate and insert ops in log order
  const relevantOps = db._log.filter((o) =>
    o.table === "moraware_prepared_sales_worksheet_facts" &&
    (o.op === "update" || o.op === "insert")
  );
  const firstDeactivateIdx = relevantOps.findIndex(
    (o) => o.op === "update" && o.data?.is_active === false
  );
  const firstInsertIdx = relevantOps.findIndex((o) => o.op === "insert");
  assert.ok(firstDeactivateIdx >= 0, "supersede: deactivation update found");
  assert.ok(firstInsertIdx >= 0, "supersede: insert found");
  assert.ok(firstDeactivateIdx < firstInsertIdx, "supersede: deactivation strictly before insert");
}

{
  // Deactivated rows get is_active=false and superseded_at
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const existingFact = {
    id: FACT_ID_1,
    row_hash: SAMPLE_MATCHED_ROWS[0].row_hash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED
  };
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [existingFact] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  const deactivateOp = db._log.find(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.is_active === false
  );
  assert.ok(deactivateOp, "deactivate: op found");
  assert.equal(deactivateOp.data.is_active, false, "deactivate: is_active=false");
  assert.ok(deactivateOp.data.superseded_at, "deactivate: superseded_at set");
}

{
  // Backfill writes superseded_by
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const existingFact = {
    id: FACT_ID_1,
    row_hash: SAMPLE_MATCHED_ROWS[0].row_hash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED
  };
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [existingFact] });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  assert.ok(result.backfillCount >= 1, "backfill: at least 1 backfill");
  const backfillOp = db._log.find(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.superseded_by != null
  );
  assert.ok(backfillOp, "backfill: superseded_by update found");
}

// ── Failed insert reactivates deactivated rows ────────────────────────────────

{
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const existingFact = {
    id: FACT_ID_1,
    row_hash: SAMPLE_MATCHED_ROWS[0].row_hash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED
  };
  const db = makeMockDb({
    run: fakeRun,
    matchedRawRows: SAMPLE_MATCHED_ROWS,
    activeFacts: [existingFact],
    insertError: new Error("simulated insert failure")
  });

  let threw = false;
  try {
    await promotePersistedRunMatchedFacts(db, {
      runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
    });
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes("simulated insert failure"), "rollback: original error preserved");
  }
  assert.ok(threw, "rollback: error re-thrown");

  // A rollback update with is_active=true should have been attempted
  const rollbackOps = db._log.filter(
    (o) => o.op === "update" && o.table === "moraware_prepared_sales_worksheet_facts" && o.data?.is_active === true
  );
  assert.ok(rollbackOps.length > 0, "rollback: re-activate update issued after insert failure");
}

// ── Duplicate incoming row_hash detection ─────────────────────────────────────

{
  // Two matched rows with identical row_hash → unsafe_supersede_plan
  const dupHash = "duplicate-hash-xyz";
  const dupRows = [
    makeRawRow({ id: "dup-1", row_hash: dupHash }),
    makeRawRow({ id: "dup-2", row_hash: dupHash })
  ];
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: dupRows, activeFacts: [] });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  assert.equal(result.skipped, true, "dup-hash: skipped=true");
  assert.equal(result.reason, "unsafe_supersede_plan", "dup-hash: correct reason");
  const inserts = db._log.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  assert.equal(inserts.length, 0, "dup-hash: no inserts when unsafe");
}

// ── No deletes ever ───────────────────────────────────────────────────────────

{
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const existingFact = {
    id: FACT_ID_2,
    row_hash: SAMPLE_MATCHED_ROWS[0].row_hash,
    organization_id: FAKE_ORG,
    report_feed_id: FAKE_FEED
  };
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [existingFact] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  const deleteOps = db._log.filter((o) => o.op === "delete");
  assert.equal(deleteOps.length, 0, "no-delete: zero delete ops in any scenario");
}

// ── Run summary updated ───────────────────────────────────────────────────────

{
  const fakeRun = makeRun({ ambiguous_identity_count: 1, summary: {} });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: true, dryRun: false
  });

  const runUpdateOp = db._log.find(
    (o) => o.op === "update" && o.table === "moraware_report_runs"
  );
  assert.ok(runUpdateOp, "summary: run update op found");
  assert.ok(runUpdateOp.data.summary?.promotions?.length >= 1, "summary: promotions array in summary");
  const entry = runUpdateOp.data.summary.promotions[0];
  assert.equal(entry.mode, "matched_only", "summary: mode=matched_only");
  assert.equal(entry.matchedRowCount, 3, "summary: matchedRowCount");
  assert.equal(entry.ambiguousExcluded, 1, "summary: ambiguousExcluded");
  assert.equal(entry.dryRun, false, "summary: dryRun=false");
}

// ── Ambiguous rows are not altered ───────────────────────────────────────────

{
  // Only matched rows are fetched from the DB (via identity_status='matched' filter).
  // The mock returns only SAMPLE_MATCHED_ROWS for that filter.
  // Verify that no update is issued for moraware_report_raw_rows.
  const fakeRun = makeRun({ ambiguous_identity_count: 1 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: true, dryRun: false
  });

  const rawRowOps = db._log.filter((o) => o.table === "moraware_report_raw_rows");
  assert.equal(rawRowOps.length, 0, "ambiguous-unaltered: no raw_rows writes");
}

// ── Inserted facts carry correct field values ─────────────────────────────────

{
  const fakeRun = makeRun({ ambiguous_identity_count: 0 });
  const db = makeMockDb({ run: fakeRun, matchedRawRows: SAMPLE_MATCHED_ROWS, activeFacts: [] });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, matchedOnly: false, dryRun: false
  });

  const insertOps = db._log.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  for (const op of insertOps) {
    for (const payload of op.data) {
      assert.equal(payload.organization_id, FAKE_ORG, "payload: org_id");
      assert.equal(payload.report_feed_id, FAKE_FEED, "payload: feed_id");
      assert.equal(payload.report_run_id, FAKE_RUN, "payload: run_id");
      assert.equal(payload.is_active, true, "payload: is_active=true");
      assert.equal(payload.superseded_at, null, "payload: superseded_at=null");
      assert.equal(payload.superseded_by, null, "payload: superseded_by=null");
      assert.equal(payload.identity_status, "matched", "payload: identity_status=matched");
      assert.ok(typeof payload.row_hash === "string" && payload.row_hash.length > 0, "payload: row_hash set");
    }
  }
}

// ── checkPersistedRunGates — allowNameOnly ────────────────────────────────────

{
  // allowNameOnly bypasses unmatched gate
  const r = checkPersistedRunGates(makeRun({ unmatched_identity_count: 5 }), { allowNameOnly: true });
  assert.equal(r.ok, true, "gates-name-only: unmatched + allowNameOnly → ok");
}

{
  // allowNameOnly also bypasses ambiguous gate (excludes ambiguous by design — no extra flag needed)
  const r = checkPersistedRunGates(
    makeRun({ unmatched_identity_count: 3, ambiguous_identity_count: 2 }),
    { allowNameOnly: true }
  );
  assert.equal(r.ok, true, "gates-name-only: unmatched + ambiguous + allowNameOnly → ok");
}

{
  // schema drift still blocks even with allowNameOnly
  const r = checkPersistedRunGates(
    makeRun({ schema_drift: { detected: true }, unmatched_identity_count: 5 }),
    { allowNameOnly: true }
  );
  assert.equal(r.ok, false, "gates-name-only: schema drift blocks despite allowNameOnly");
  assert.equal(r.reason, "schema_drift_detected");
}

{
  // already promoted still blocks even with allowNameOnly
  const r = checkPersistedRunGates(
    makeRun({ status: "promoted", unmatched_identity_count: 5 }),
    { allowNameOnly: true }
  );
  assert.equal(r.ok, false, "gates-name-only: already_promoted blocks despite allowNameOnly");
  assert.equal(r.reason, "already_promoted");
}

// ── promotePersistedRunMatchedFacts — allowNameOnly: feed-type guard ──────────

{
  // View 219 (sales_worksheet_facts) must not allow name-only mode
  const fakeRun = makeRun({ unmatched_identity_count: 5, ambiguous_identity_count: 0 });
  const db = makeMockDb({ run: fakeRun, feed: FAKE_FEED_V219 });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: true
  });
  assert.equal(result.skipped, true, "v219-no-name-only: skipped=true");
  assert.equal(result.reason, "name_only_not_allowed_for_report_type", "v219-no-name-only: correct reason");
  assert.equal(result.details.reportType, "sales_worksheet_facts", "v219-no-name-only: details.reportType");
  assert.equal(result.details.allowedFor, "sales_worksheet_history_facts", "v219-no-name-only: details.allowedFor");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "v219-no-name-only: zero writes");
}

{
  // View 219 with allowNameOnly=false and unmatched rows → blocked by unmatched gate (not name-only gate)
  const fakeRun = makeRun({ unmatched_identity_count: 5, ambiguous_identity_count: 0 });
  const db = makeMockDb({ run: fakeRun, feed: FAKE_FEED_V219 });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: false, dryRun: true
  });
  assert.equal(result.skipped, true, "v219-unmatched-default: skipped=true");
  assert.equal(result.reason, "unmatched_rows_present", "v219-unmatched-default: unmatched gate fires first");
}

// ── promotePersistedRunMatchedFacts — allowNameOnly: dry-run (view 220) ───────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    unmatched_identity_count: 3,
    ambiguous_identity_count: 1,
    matched_identity_count: 3
  });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: SAMPLE_MATCHED_ROWS,
    nameOnlyRawRows: SAMPLE_NAME_ONLY_ROWS,
    activeFacts: []
  });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: true
  });

  assert.equal(result.dryRun, true, "v220-dry-run: dryRun=true");
  assert.equal(result.promoted, false, "v220-dry-run: promoted=false");
  assert.equal(result.skipped, false, "v220-dry-run: skipped=false (plan computed)");
  assert.equal(result.matchedRowsEligible, 3, "v220-dry-run: 3 matched rows eligible");
  assert.equal(result.nameOnlyRowsEligible, 3, "v220-dry-run: 3 name-only rows eligible");
  assert.equal(result.ambiguousExcluded, 1, "v220-dry-run: 1 ambiguous excluded");
  assert.equal(result.unmatchedCount, 0, "v220-dry-run: unmatchedCount=0 (included as name-only)");
  assert.equal(result.plan.insertCount, 6, "v220-dry-run: 6 inserts planned (3 matched + 3 name-only)");
  assert.equal(result.plan.allowNameOnly, true, "v220-dry-run: plan.allowNameOnly=true");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "v220-dry-run: zero DB writes");
}

// ── promotePersistedRunMatchedFacts — allowNameOnly: apply (view 220) ─────────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    unmatched_identity_count: 3,
    ambiguous_identity_count: 1,
    matched_identity_count: 3
  });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: SAMPLE_MATCHED_ROWS,
    nameOnlyRawRows: SAMPLE_NAME_ONLY_ROWS,
    activeFacts: []
  });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: false
  });

  assert.equal(result.promoted, true, "v220-apply: promoted=true");
  assert.equal(result.dryRun, false, "v220-apply: dryRun=false");
  assert.equal(result.allowNameOnly, true, "v220-apply: allowNameOnly=true");
  assert.equal(result.matchedRowCount, 3, "v220-apply: matchedRowCount=3");
  assert.equal(result.nameOnlyRowCount, 3, "v220-apply: nameOnlyRowCount=3");
  assert.equal(result.insertCount, 6, "v220-apply: 6 total rows inserted");
  assert.equal(result.ambiguousExcluded, 1, "v220-apply: 1 ambiguous excluded");
  assert.equal(result.unmatchedExcluded, 0, "v220-apply: unmatchedExcluded=0 (included as name-only)");
  // Run status stays needs_review because name-only facts have partial identity
  assert.equal(result.runStatus, "needs_review", "v220-apply: status=needs_review (identity partial)");

  const insertOps = db._log.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  const totalInserted = insertOps.reduce((s, op) => s + op.data.length, 0);
  assert.equal(totalInserted, 6, "v220-apply: 6 facts inserted total");
}

// ── identity_status and null IDs preserved in prepared facts (name-only) ──────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    unmatched_identity_count: 1,
    ambiguous_identity_count: 0,
    matched_identity_count: 1
  });
  const singleMatchedRow = makeRawRow({ id: "m-1", row_hash: "hash-m-1" });
  const singleNameOnlyRow = makeNameOnlyRawRow({ id: "no-1", row_hash: "hash-no-1" });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: [singleMatchedRow],
    nameOnlyRawRows: [singleNameOnlyRow],
    activeFacts: []
  });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: false
  });

  const insertOps = db._log.filter((o) => o.op === "insert" && o.table === "moraware_prepared_sales_worksheet_facts");
  const allInserted = insertOps.flatMap((o) => o.data);
  assert.equal(allInserted.length, 2, "identity-status: 2 rows inserted");

  // Matched row → identity_status="matched", account_id and job_id populated
  const matchedFact = allInserted.find((f) => f.row_hash === singleMatchedRow.row_hash);
  assert.ok(matchedFact, "identity-status: matched fact found");
  assert.equal(matchedFact.identity_status, "matched", "identity-status: matched fact has identity_status=matched");
  assert.ok(matchedFact.account_id != null, "identity-status: matched fact has account_id");
  assert.ok(matchedFact.job_id != null, "identity-status: matched fact has job_id");

  // Name-only row → identity_status="needs_identity_review", null account_id and job_id
  const nameOnlyFact = allInserted.find((f) => f.row_hash === singleNameOnlyRow.row_hash);
  assert.ok(nameOnlyFact, "identity-status: name-only fact found");
  assert.equal(nameOnlyFact.identity_status, "needs_identity_review", "identity-status: name-only fact preserves identity_status");
  assert.equal(nameOnlyFact.account_id, null, "identity-status: name-only fact has null account_id");
  assert.equal(nameOnlyFact.job_id, null, "identity-status: name-only fact has null job_id");
  assert.ok(nameOnlyFact.account_name, "identity-status: name-only fact has account_name");
  assert.ok(nameOnlyFact.job_name, "identity-status: name-only fact has job_name");
}

// ── name-only run summary entry ───────────────────────────────────────────────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    unmatched_identity_count: 3,
    ambiguous_identity_count: 1,
    summary: {}
  });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: SAMPLE_MATCHED_ROWS,
    nameOnlyRawRows: SAMPLE_NAME_ONLY_ROWS,
    activeFacts: []
  });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: false
  });

  const runUpdateOp = db._log.find((o) => o.op === "update" && o.table === "moraware_report_runs");
  assert.ok(runUpdateOp, "name-only-summary: run update op found");
  const entry = runUpdateOp.data.summary?.promotions?.[0];
  assert.ok(entry, "name-only-summary: promotions entry present");
  assert.equal(entry.mode, "name_only", "name-only-summary: mode=name_only");
  assert.equal(entry.matchedRowCount, 3, "name-only-summary: matchedRowCount");
  assert.equal(entry.nameOnlyRowCount, 3, "name-only-summary: nameOnlyRowCount");
  assert.equal(entry.ambiguousExcluded, 1, "name-only-summary: ambiguousExcluded");
  assert.equal(entry.unmatchedExcluded, 0, "name-only-summary: unmatchedExcluded=0");
  assert.ok(entry.warning, "name-only-summary: warning present for partial identity");
  assert.equal(entry.dryRun, false, "name-only-summary: dryRun=false");
}

// ── schema drift blocks name-only promotion ───────────────────────────────────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    schema_drift: { detected: true, observedHash: "aaa", expectedHash: "bbb" },
    unmatched_identity_count: 5
  });
  const db = makeMockDb({ run: fakeRun, feed: FAKE_FEED_V220 });
  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: true
  });
  assert.equal(result.skipped, true, "drift-name-only: skipped=true");
  assert.equal(result.reason, "schema_drift_detected", "drift-name-only: schema drift blocks");
  const writes = db._log.filter((e) => ["insert", "update"].includes(e.op));
  assert.equal(writes.length, 0, "drift-name-only: zero writes");
}

// ── no deletes in name-only mode ──────────────────────────────────────────────

{
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    unmatched_identity_count: 2,
    ambiguous_identity_count: 0
  });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: SAMPLE_MATCHED_ROWS,
    nameOnlyRawRows: SAMPLE_NAME_ONLY_ROWS.slice(0, 2),
    activeFacts: []
  });

  await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: false
  });

  const deleteOps = db._log.filter((o) => o.op === "delete");
  assert.equal(deleteOps.length, 0, "no-delete-name-only: zero delete ops");
}

// ── name-only with zero name-only rows (edge case: unmatched count non-zero but no rows fetched) ──

{
  // No rows fetched for needs_identity_review → no_eligible_rows if matched is also empty
  const fakeRun = makeRun({
    report_feed_id: FAKE_HISTORY_FEED,
    matched_identity_count: 0,
    unmatched_identity_count: 3,
    ambiguous_identity_count: 0
  });
  const db = makeMockDb({
    run: fakeRun, feed: FAKE_FEED_V220,
    matchedRawRows: [],
    nameOnlyRawRows: [],
    activeFacts: []
  });

  const result = await promotePersistedRunMatchedFacts(db, {
    runId: FAKE_RUN, organizationId: FAKE_ORG, allowNameOnly: true, dryRun: false
  });
  assert.equal(result.skipped, true, "no-eligible: skipped=true");
  assert.equal(result.reason, "no_eligible_rows", "no-eligible: reason=no_eligible_rows");
}

console.log("promotePersistedRunMatchedFacts.test.mjs: ok");
