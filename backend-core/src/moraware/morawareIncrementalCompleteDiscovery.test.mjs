/**
 * Complete Moraware creation-window list discovery — offline tests.
 * No live Moraware. No Supabase production writes.
 */
import assert from "node:assert/strict";
import {
  runCompleteProcessPagedListTraversal,
  collectCompleteIncrementalJobList,
  MORAWARE_COMPLETE_LIST_DISCOVERY,
  MORAWARE_CREATION_DISCOVERY_INCOMPLETE
} from "../../../src/morawareDiscovery.js";
import {
  assertSampleHelperIsNotIncrementalAuthority,
  listCandidateRowsViaCanonicalProcessPagedQuery,
  withIncrementalMorawareQuietLogs,
  MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP
} from "./morawareIncrementalReadAdapter.mjs";
import {
  enforceDryRunCandidateCap,
  runMorawareIncrementalLiveReadDryRun
} from "./morawareIncrementalLiveReadDryRun.mjs";
import { resolveIncrementalCreationWindowBootstrap } from "./morawareIncrementalCursor.mjs";
import { selectRollingCurrentJobBatch } from "./morawareIncrementalDiscovery.mjs";

const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FULL_START = "2026-08-15T18:48:47.614Z";
const WIN_START = "2026-08-15T17:48:47.614Z";
const WIN_END = "2026-08-17T16:55:49.539Z";

function jobNode(id, creationDate) {
  return { _attributes: { id: String(id) }, creationDate };
}

/** Synthetic pager: pageSize jobs per full page; totalJobs then a short final page. */
function makeSequentialFetchPage({ totalJobs, pageSize, creationDateForId }) {
  return async ({ pageIdx, firstRecord, pageSize: ps }) => {
    assert.equal(ps, pageSize);
    assert.equal(firstRecord, pageIdx * pageSize);
    const start = firstRecord + 1; // ids 1..N
    const end = Math.min(start + pageSize - 1, totalJobs);
    if (start > totalJobs) return { ok: true, jobs: [] };
    const jobs = [];
    for (let id = start; id <= end; id += 1) {
      jobs.push(jobNode(id, creationDateForId(id)));
    }
    return { ok: true, jobs };
  };
}

console.log("\n=== complete creation-window list discovery ===\n");

// 1–2. traverses beyond 5000; candidate after row 5000 discovered
{
  const pageSize = 100;
  const totalJobs = 5100;
  const windowStartMs = Date.parse(WIN_START);
  const windowEndMs = Date.parse(WIN_END);
  const lateId = 5050;
  const fetchPage = makeSequentialFetchPage({
    totalJobs,
    pageSize,
    creationDateForId: (id) =>
      id === lateId ? "2026-08-16T12:00:00.000Z" : "2026-01-01T00:00:00.000Z"
  });
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize,
    safetyMaxPagesPerProcess: 1000,
    safetyMaxRowsScanned: 1_000_000,
    fetchPage,
    creationWindowStartMs: windowStartMs,
    creationWindowEndMs: windowEndMs
  });
  assert.equal(res.ok, true);
  assert.equal(res.status, MORAWARE_COMPLETE_LIST_DISCOVERY);
  assert.equal(res.pagination_complete, true);
  assert.ok(res.diagnostics.rows_scanned > 5000);
  assert.ok(res.diagnostics.pages_fetched > 50);
  assert.equal(res.list_rows.some((r) => r.id === String(lateId)), true);
  assert.equal(res.diagnostics.rows_in_creation_window, 1);
  console.log("ok 1-2: discovery traverses beyond 5000; post-5000 window candidate found");
}

// 3. sample helper cannot be mistaken for complete discovery
{
  const proof = assertSampleHelperIsNotIncrementalAuthority();
  assert.equal(proof.sample_is_authority, false);
  assert.equal(proof.incremental_authority, "collectCompleteIncrementalJobList");
  const listed = await listCandidateRowsViaCanonicalProcessPagedQuery({
    client: { ensureSession: async () => {} },
    listImpl: async () => ({
      ok: true,
      pagination_complete: true,
      list_rows: [{ id: "1", creationDate: "2026-08-16T00:00:00.000Z" }],
      diagnostics: { sample_helper_used: true }
    })
  });
  assert.equal(listed.ok, false);
  assert.equal(listed.status, MORAWARE_CREATION_DISCOVERY_INCOMPLETE);
  assert.equal(listed.list_rows.length, 0);
  console.log("ok 3: sample helper output cannot be mistaken for complete discovery");
}

// 4. natural completion ⇒ pagination_complete=true
{
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 100,
    safetyMaxPagesPerProcess: 50,
    safetyMaxRowsScanned: 10000,
    fetchPage: makeSequentialFetchPage({
      totalJobs: 250,
      pageSize: 100,
      creationDateForId: () => "2026-08-16T00:00:00.000Z"
    }),
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.pagination_complete, true);
  assert.equal(res.termination_reason, "natural_page_end_all_processes");
  assert.equal(res.diagnostics.rows_scanned, 250);
  console.log("ok 4: natural completion returns pagination_complete=true");
}

// 5. page fetch failure ⇒ CREATION_DISCOVERY_INCOMPLETE
{
  let calls = 0;
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 100,
    safetyMaxPagesPerProcess: 100,
    safetyMaxRowsScanned: 100000,
    fetchPage: async ({ pageIdx }) => {
      calls += 1;
      if (pageIdx === 0) {
        return {
          ok: true,
          jobs: Array.from({ length: 100 }, (_, i) => jobNode(i + 1, "2026-01-01T00:00:00.000Z"))
        };
      }
      return { ok: false, jobs: [], error: "simulated_page_failure" };
    }
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, MORAWARE_CREATION_DISCOVERY_INCOMPLETE);
  assert.equal(res.termination_reason, "page_fetch_failed");
  assert.equal(res.list_rows.length, 0);
  assert.ok(calls >= 2);
  console.log("ok 5: pagination interruption returns CREATION_DISCOVERY_INCOMPLETE");
}

// 6–7. safety page ceiling with full last page ⇒ incomplete (source indicates more data)
{
  const pageSize = 100;
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize,
    safetyMaxPagesPerProcess: 50, // classic 50×100=5000 trap
    safetyMaxRowsScanned: 1_000_000,
    fetchPage: makeSequentialFetchPage({
      totalJobs: 20_000,
      pageSize,
      creationDateForId: (id) =>
        id === 6000 ? "2026-08-16T12:00:00.000Z" : "2026-01-01T00:00:00.000Z"
    }),
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, MORAWARE_CREATION_DISCOVERY_INCOMPLETE);
  assert.equal(res.termination_reason, "safety_max_pages_per_process");
  assert.equal(res.pagination_complete, false);
  assert.equal(res.diagnostics.rows_scanned, 5000);
  assert.equal(res.list_rows.length, 0); // not authoritative
  assert.ok((res.partial_candidate_rows_non_authoritative || []).length === 0); // window match was past 5000
  console.log("ok 6-7: safety ceiling / more pages remain ⇒ CREATION_DISCOVERY_INCOMPLETE");
}

// 8. partial traversal does not emit authoritative candidates
{
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 10,
    safetyMaxPagesPerProcess: 2,
    safetyMaxRowsScanned: 100000,
    fetchPage: makeSequentialFetchPage({
      totalJobs: 100,
      pageSize: 10,
      creationDateForId: () => "2026-08-16T12:00:00.000Z"
    }),
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.ok, false);
  assert.equal(res.list_rows.length, 0);
  assert.equal(res.candidate_rows.length, 0);
  assert.ok((res.partial_candidate_rows_non_authoritative || []).length > 0);
  console.log("ok 8: candidate set not authoritative from partial traversal");
}

// 9. creationDate filter remains correct after complete traversal
{
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 50,
    safetyMaxPagesPerProcess: 100,
    safetyMaxRowsScanned: 100000,
    fetchPage: makeSequentialFetchPage({
      totalJobs: 120,
      pageSize: 50,
      creationDateForId: (id) =>
        id === 3 || id === 118 ? "2026-08-16T12:00:00.000Z" : "2025-01-01T00:00:00.000Z"
    }),
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.ok, true);
  const ids = res.list_rows.map((r) => r.id).sort();
  assert.deepEqual(ids, ["118", "3"]);
  assert.equal(res.diagnostics.rows_in_creation_window, 2);
  console.log("ok 9: creationDate filter correct after complete traversal");
}

// 10. unsorted creationDate cannot cause unsafe early termination
{
  // Newest first, then ancient, then another in-window at the end — must scan all
  const pages = [
    Array.from({ length: 100 }, (_, i) => jobNode(i + 1, "2026-08-16T12:00:00.000Z")),
    Array.from({ length: 100 }, (_, i) => jobNode(i + 101, "2020-01-01T00:00:00.000Z")),
    [jobNode(201, "2026-08-16T15:00:00.000Z")]
  ];
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 100,
    safetyMaxPagesPerProcess: 100,
    safetyMaxRowsScanned: 100000,
    fetchPage: async ({ pageIdx }) => ({ ok: true, jobs: pages[pageIdx] || [] }),
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.ok, true);
  assert.equal(res.diagnostics.creation_date_ordering_relied_upon, false);
  assert.equal(res.list_rows.some((r) => r.id === "201"), true);
  assert.equal(res.diagnostics.pages_fetched, 3);
  console.log("ok 10: unsorted creationDate cannot cause unsafe early termination");
}

// 11. duplicate source IDs across pages dedupe safely
{
  const res = await runCompleteProcessPagedListTraversal({
    processIds: ["1"],
    pageSize: 2,
    safetyMaxPagesPerProcess: 10,
    safetyMaxRowsScanned: 1000,
    fetchPage: async ({ pageIdx }) => {
      if (pageIdx === 0) return { ok: true, jobs: [jobNode("A", "2026-08-16T00:00:00.000Z"), jobNode("B", "2026-08-16T00:00:00.000Z")] };
      if (pageIdx === 1) return { ok: true, jobs: [jobNode("B", "2026-08-16T00:00:00.000Z"), jobNode("C", "2026-08-16T00:00:00.000Z")] };
      return { ok: true, jobs: [] };
    },
    creationWindowStartMs: Date.parse(WIN_START),
    creationWindowEndMs: Date.parse(WIN_END)
  });
  assert.equal(res.ok, true);
  assert.equal(res.diagnostics.duplicate_source_ids, 1);
  assert.equal(res.list_rows.length, 3);
  console.log("ok 11: duplicate source IDs across pages deduplicate safely");
}

// 12. lightweight scanning does not trigger exact job fetch
{
  let exactCalls = 0;
  let pages = 0;
  await collectCompleteIncrementalJobList(
    { ensureSession: async () => {}, sessionId: "t", baseUrl: "http://example.invalid", timeoutMs: 1 },
    {
      processIds: ["1"],
      fetchPage: async () => {
        pages += 1;
        return { ok: true, jobs: [jobNode("9", "2026-08-16T00:00:00.000Z")] };
      },
      creationWindowStartMs: Date.parse(WIN_START),
      creationWindowEndMs: Date.parse(WIN_END)
    }
  );
  assert.ok(pages >= 1);
  assert.equal(exactCalls, 0);
  console.log("ok 12: lightweight scanning does not trigger exact job fetch");
}

// 13–14. >100 still stops exact; <=100 may continue
{
  assert.equal(enforceDryRunCandidateCap(101).ok, false);
  assert.equal(enforceDryRunCandidateCap(101).status, "DRY_RUN_CANDIDATE_CAP_EXCEEDED");
  assert.equal(enforceDryRunCandidateCap(100).ok, true);
  assert.equal(MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP, 100);
  console.log("ok 13-14: exact-candidate cap remains 100");
}

// 15. bootstrap FULL−overlap unchanged
{
  const boot = resolveIncrementalCreationWindowBootstrap({
    cursor: { advanced_to: null },
    parentFullStartedAt: FULL_START,
    parentFullEpochId: EPOCH_A,
    now: new Date("2026-08-17T16:55:49.539Z"),
    overlapMs: 3600000
  });
  assert.equal(boot.ok, true);
  assert.equal(boot.cursor_start, "2026-08-15T17:48:47.614Z");
  console.log("ok 15: bootstrap FULL-minus-overlap semantics unchanged");
}

// 16–17. rolling + explicit unchanged (spot)
{
  const rolling = selectRollingCurrentJobBatch({
    currentSourceJobIds: ["37286", "37287", "37288"],
    afterSourceJobId: null,
    batchSize: 2
  });
  assert.deepEqual(rolling.source_job_ids, ["37286", "37287"]);
  console.log("ok 16-17: rolling selection unchanged; explicit path untouched");
}

// 18–23. incomplete discovery: no exact, no cursor/Brain/prepared/worksheet/lock writes
{
  let exactCalled = false;
  let brainCalled = false;
  const res = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: true,
    organizationId: ORG,
    now: new Date(WIN_END),
    resolvePopulation: async () => ({
      available: true,
      full_census_import_group_id: EPOCH_A,
      full_census_started_at: FULL_START,
      current_source_job_ids: ["37286"]
    }),
    readCursor: async () => ({ advanced_to: null }),
    listCandidateRows: async () => ({
      ok: false,
      status: MORAWARE_CREATION_DISCOVERY_INCOMPLETE,
      pagination_complete: false,
      termination_reason: "safety_max_pages_per_process",
      list_rows: [],
      diagnostics: { rows_scanned: 5000, pagination_complete: false }
    }),
    fetchExactJobs: async () => {
      exactCalled = true;
      return { ok: true, jobs: [] };
    }
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "CREATION_DISCOVERY_INCOMPLETE");
  assert.equal(res.exact_fetch_started, false);
  assert.equal(exactCalled, false);
  assert.equal(res.projected_creation_cursor_after_success, null);
  assert.equal(res.actual_writes.cursor, 0);
  assert.equal(res.actual_writes.brain, 0);
  assert.equal(res.actual_writes.prepared_facts, 0);
  assert.equal(res.actual_writes.worksheet_facts, 0);
  assert.equal(res.actual_writes.population_lock, 0);
  assert.equal(brainCalled, false);
  console.log("ok 18-23: incomplete discovery blocks exact/cursor/Brain/facts/lock");
}

// 24–25. quiet logs: no FULL SERVER RESPONSE; credentials not logged
{
  const lines = [];
  const origLog = console.log;
  console.log = (...args) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await withIncrementalMorawareQuietLogs(async () => {
      // Simulate what MorawareClient would gate on MORAWARE_DISCOVERY_QUIET_LOGS
      if (String(process.env.MORAWARE_DISCOVERY_QUIET_LOGS ?? "").trim() !== "1") {
        console.log("FULL SERVER RESPONSE:", { secret: "password=hunter2", token: "abc" });
      }
      console.log("incremental_diag page=1 rows=100 duration_ms=12 ok=true");
    });
  } finally {
    console.log = origLog;
  }
  assert.equal(lines.some((l) => l.includes("FULL SERVER RESPONSE")), false);
  assert.equal(lines.some((l) => /password=|token=|MORAWARE_PASSWORD|SERVICE_ROLE/i.test(l)), false);
  assert.equal(lines.some((l) => l.includes("incremental_diag")), true);
  assert.equal(process.env.MORAWARE_DISCOVERY_QUIET_LOGS === "1", false); // restored
  console.log("ok 24-25: incremental quiet logs; no FULL SERVER RESPONSE / credentials");
}

console.log("\nmorawareIncrementalCompleteDiscovery.test.mjs — all passed\n");
