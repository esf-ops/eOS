/**
 * Tests for API mirror identity enrichment — pure functions + mock-DB orchestration.
 * No live Supabase. No live Moraware access. No real customer data.
 *
 * Run: npm run eos:test:moraware-api-mirror-enrichment
 */
import assert from "node:assert/strict";

import { buildApiMirrorIdentityMap } from "./buildApiMirrorIdentityMap.js";
import { planApiMirrorEnrichment } from "./planApiMirrorEnrichment.js";
import { enrichRunFromApiMirror } from "./enrichRunFromApiMirror.js";

// ── Test data ─────────────────────────────────────────────────────────────────

const FAKE_ORG = "00000000-0000-0000-0000-000000000001";
const FAKE_RUN_ID = "aaaaaaaa-0000-0000-0000-000000000001";

/** Minimal brain_moraware_jobs-shaped rows (no real customer data) */
const SAMPLE_JOBS = [
  {
    source_account_id: "462",
    source_job_id: "37780",
    account_name: "Sample Builders LLC",
    job_name: "Kitchen Remodel Phase A"
  },
  {
    source_account_id: "462",
    source_job_id: "37781",
    account_name: "Sample Builders LLC",
    job_name: "Laundry Counter Refresh"
  },
  {
    source_account_id: "901",
    source_job_id: "45001",
    account_name: "Demo Stone Partners",
    job_name: "Showroom Display Update"
  }
];

/** Rows with a location prefix that should be stripped by makeIdentityMatchKey */
const PREFIXED_ACCOUNT_JOBS = [
  {
    source_account_id: "462",
    source_job_id: "37780",
    account_name: "North Branch - Sample Builders LLC",
    job_name: "Kitchen Remodel Phase A"
  }
];

// ── buildApiMirrorIdentityMap ─────────────────────────────────────────────────

{
  // Standard case: 3 distinct jobs → 3 entries, no duplicates
  const { identityMap, duplicateKeys, summary } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  assert.equal(identityMap.size, 3, "map: 3 distinct keys");
  assert.equal(duplicateKeys.size, 0, "map: no duplicate keys");
  assert.equal(summary.totalJobs, 3, "map summary: totalJobs=3");
  assert.equal(summary.usableJobs, 3, "map summary: usableJobs=3");
  assert.equal(summary.duplicateKeyCount, 0, "map summary: duplicateKeyCount=0");

  const firstKey = [...identityMap.keys()][0];
  const firstEntry = identityMap.get(firstKey);
  assert.equal(firstEntry.accountId, "462", "map: accountId preserved");
  assert.equal(firstEntry.jobId, "37780", "map: jobId preserved");
}

{
  // Null/empty account_name or job_name rows are skipped entirely
  const rowsWithBlanks = [
    ...SAMPLE_JOBS,
    { source_account_id: "999", source_job_id: "99999", account_name: "", job_name: "Something" },
    { source_account_id: "999", source_job_id: "99998", account_name: null, job_name: "Other" },
    { source_account_id: "999", source_job_id: "99997", account_name: "Some Acct", job_name: "" }
  ];
  const { identityMap, summary } = buildApiMirrorIdentityMap(rowsWithBlanks);
  assert.equal(identityMap.size, 3, "map: blank rows skipped — still 3 entries");
  assert.equal(summary.totalJobs, 6, "map summary: totalJobs counts all rows including blanks");
  assert.equal(summary.usableJobs, 3, "map summary: usableJobs excludes blank rows");
}

{
  // Duplicate key with SAME source IDs → deduplicated safely, not added to duplicateKeys
  const sameDupes = [
    ...SAMPLE_JOBS,
    { source_account_id: "462", source_job_id: "37780", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A" }
  ];
  const { identityMap, duplicateKeys, summary } = buildApiMirrorIdentityMap(sameDupes);
  assert.equal(identityMap.size, 3, "same-dup: still 3 entries — harmless dup not added");
  assert.equal(duplicateKeys.size, 0, "same-dup: no duplicate keys recorded");
  assert.equal(summary.duplicateKeyCount, 0, "same-dup: duplicateKeyCount=0");
}

{
  // Duplicate key with DIFFERENT source_job_id → key goes into duplicateKeys
  const conflictDupes = [
    ...SAMPLE_JOBS,
    {
      source_account_id: "462",
      source_job_id: "99999",  // different job ID for same account+name
      account_name: "Sample Builders LLC",
      job_name: "Kitchen Remodel Phase A"
    }
  ];
  const { identityMap, duplicateKeys, summary } = buildApiMirrorIdentityMap(conflictDupes);
  assert.equal(identityMap.size, 3, "conflict-dup: first-seen entry stays in identityMap");
  assert.equal(duplicateKeys.size, 1, "conflict-dup: 1 duplicate key");
  assert.equal(summary.duplicateKeyCount, 1, "conflict-dup: summary reflects duplicate");

  // First-seen entry is still retrievable (used for ambiguous identity-link row)
  const ambiguousEntry = identityMap.get([...duplicateKeys][0]);
  assert.ok(ambiguousEntry, "conflict-dup: first-seen entry retrievable via key");
  assert.equal(ambiguousEntry.jobId, "37780", "conflict-dup: first-seen jobId preserved");
}

{
  // Location prefix normalization: "North Branch - Sample Builders LLC" normalizes to
  // the same key as "Sample Builders LLC" — ensuring CSV rows match API mirror rows
  // even when account names differ by branch prefix
  const { identityMap } = buildApiMirrorIdentityMap(PREFIXED_ACCOUNT_JOBS);
  const { identityMap: unPrefixedMap } = buildApiMirrorIdentityMap(SAMPLE_JOBS);

  // The first key from prefixed job should match the first key from un-prefixed job
  const prefixedKey = [...identityMap.keys()][0];
  assert.ok(
    unPrefixedMap.has(prefixedKey),
    "location-prefix: prefixed account name produces same match key as un-prefixed"
  );
}

// ── planApiMirrorEnrichment ───────────────────────────────────────────────────

/** Staged raw rows that simulate moraware_report_raw_rows after initial staging */
const STAGED_ROWS = [
  { id: "row-1", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "needs_identity_review" },
  { id: "row-2", account_name: "Sample Builders LLC", job_name: "Laundry Counter Refresh", identity_status: "needs_identity_review" },
  { id: "row-3", account_name: "Demo Stone Partners", job_name: "Showroom Display Update", identity_status: "needs_identity_review" },
  { id: "row-4", account_name: "Fake Unmatched Account", job_name: "Unmatched Project", identity_status: "needs_identity_review" }
];

{
  // Standard: 3 of 4 rows match, 1 skipped (no API mirror entry)
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  const plan = planApiMirrorEnrichment(STAGED_ROWS, identityMap, duplicateKeys);

  assert.equal(plan.toMatch.length, 3, "plan: 3 rows matched");
  assert.equal(plan.toAmbiguous.length, 0, "plan: 0 ambiguous");
  assert.equal(
    plan.toSkip.filter((r) => r.reason === "no_api_mirror_match").length,
    1,
    "plan: 1 row skipped (no match)"
  );
  assert.equal(plan.summary.eligible, 4, "plan summary: 4 eligible");
  assert.equal(plan.summary.matched, 3, "plan summary: 3 matched");
  assert.equal(plan.summary.skipped, 1, "plan summary: 1 skipped");

  const matchedRow1 = plan.toMatch.find((r) => r.id === "row-1");
  assert.ok(matchedRow1, "plan match: row-1 found");
  assert.equal(matchedRow1.account_id, "462", "plan match: correct account_id");
  assert.equal(matchedRow1.job_id, "37780", "plan match: correct job_id");
  assert.equal(matchedRow1.identity_status, "matched", "plan match: identity_status=matched");
  assert.equal(matchedRow1.identity_reason, "api_mirror_exact_account_job", "plan match: reason set");
  assert.ok(typeof matchedRow1.matchKey === "string", "plan match: matchKey present");
}

{
  // Ambiguous duplicate key → toAmbiguous
  const conflictJobs = [
    ...SAMPLE_JOBS,
    { source_account_id: "462", source_job_id: "99999", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A" }
  ];
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(conflictJobs);
  const plan = planApiMirrorEnrichment(STAGED_ROWS, identityMap, duplicateKeys);

  assert.equal(plan.toAmbiguous.length, 1, "ambiguous: 1 row goes to toAmbiguous");
  assert.equal(plan.toAmbiguous[0].id, "row-1", "ambiguous: correct row id");
  assert.equal(plan.toAmbiguous[0].identity_status, "ambiguous_identity", "ambiguous: status");
  assert.equal(plan.toAmbiguous[0].identity_reason, "api_mirror_ambiguous_key", "ambiguous: reason");
  assert.ok(typeof plan.toAmbiguous[0].matchKey === "string", "ambiguous: matchKey present");
  assert.equal(plan.toMatch.length, 2, "ambiguous: remaining rows still match");
}

{
  // Already matched rows are skipped (not re-processed)
  const mixedStatusRows = [
    { id: "row-A", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "matched" },
    { id: "row-B", account_name: "Sample Builders LLC", job_name: "Laundry Counter Refresh", identity_status: "needs_identity_review" }
  ];
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  const plan = planApiMirrorEnrichment(mixedStatusRows, identityMap, duplicateKeys);

  assert.equal(plan.summary.eligible, 1, "skip-matched: only 1 eligible row (the unmatched one)");
  assert.equal(plan.toMatch.length, 1, "skip-matched: 1 match for the eligible row");
  const skippedAlready = plan.toSkip.filter((r) => r.reason === "already_processed");
  assert.equal(skippedAlready.length, 1, "skip-matched: row-A goes to toSkip with already_processed reason");
  assert.equal(skippedAlready[0].id, "row-A", "skip-matched: correct id in toSkip");
}

{
  // Already ambiguous rows are also skipped
  const ambiguousRow = [
    { id: "row-X", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "ambiguous_identity" }
  ];
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  const plan = planApiMirrorEnrichment(ambiguousRow, identityMap, duplicateKeys);

  assert.equal(plan.summary.eligible, 0, "skip-ambiguous: 0 eligible rows");
  assert.equal(plan.toMatch.length, 0, "skip-ambiguous: no matches");
  assert.equal(plan.toSkip[0].reason, "already_processed", "skip-ambiguous: already_processed reason");
}

{
  // Zero input rows returns empty plan
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  const plan = planApiMirrorEnrichment([], identityMap, duplicateKeys);

  assert.equal(plan.toMatch.length, 0, "empty: no matches");
  assert.equal(plan.toAmbiguous.length, 0, "empty: no ambiguous");
  assert.equal(plan.toSkip.length, 0, "empty: no skipped");
  assert.equal(plan.summary.eligible, 0, "empty: 0 eligible");
}

{
  // Null/undefined input rows array doesn't throw
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  const plan = planApiMirrorEnrichment(null, identityMap, duplicateKeys);
  assert.equal(plan.summary.eligible, 0, "null-input: handles null gracefully");
}

// ── Identity link dedup — one row per unique match key ────────────────────────

{
  // Multiple raw rows sharing the same match key should produce only ONE identity link row.
  // This mirrors the behavior in reportFeedPersistence.buildIdentityLinkInserts.
  // We test this via the enrichRunFromApiMirror orchestrator with a mock DB.
  const { identityMap, duplicateKeys } = buildApiMirrorIdentityMap(SAMPLE_JOBS);
  // Two rows for the same account+job (e.g., two worksheet lines)
  const twoLinesForSameJob = [
    { id: "row-1", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "needs_identity_review" },
    { id: "row-2", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "needs_identity_review" }
  ];
  const plan = planApiMirrorEnrichment(twoLinesForSameJob, identityMap, duplicateKeys);

  // Both rows match
  assert.equal(plan.toMatch.length, 2, "link-dedup: both worksheet rows matched");
  // But they share the same matchKey
  assert.equal(plan.toMatch[0].matchKey, plan.toMatch[1].matchKey, "link-dedup: both rows share the same matchKey");
  // The identity link building (inside enrichRunFromApiMirror apply path) would produce 1 link.
  // Verify this by counting unique matchKeys in toMatch.
  const uniqueMatchKeys = new Set(plan.toMatch.map((r) => r.matchKey));
  assert.equal(uniqueMatchKeys.size, 1, "link-dedup: only 1 unique matchKey despite 2 matched rows → 1 identity link");
}

// ── enrichRunFromApiMirror (mock DB) ──────────────────────────────────────────

/** Build a minimal mock Supabase client for enrichRunFromApiMirror tests. */
function makeMockEnrichDb({ run, jobs = [], rawRows = [] } = {}) {
  const log = [];

  const db = {
    _log: log,
    from(tableName) {
      const state = { tableName, filters: {} };

      // Chainable select/eq/range/maybeSingle for reads
      const chain = {
        select() { return chain; },
        eq(col, val) {
          state.filters[col] = val;
          return chain;
        },
        range(from, to) {
          if (tableName === "brain_moraware_jobs") {
            const page = jobs.slice(from, to + 1);
            return Promise.resolve({ data: page.length ? page : null, error: null });
          }
          if (tableName === "moraware_report_raw_rows") {
            const statusFilter = state.filters["identity_status"];
            const filtered = statusFilter
              ? rawRows.filter((r) => r.identity_status === statusFilter)
              : rawRows;
            const page = filtered.slice(from, to + 1);
            return Promise.resolve({ data: page.length ? page : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle() {
          if (tableName === "moraware_report_runs") {
            return Promise.resolve({ data: run ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // Write methods (only called in apply mode)
        update(data) {
          const entry = { op: "update", table: tableName, data, filters: { ...state.filters } };
          log.push(entry);
          return {
            eq(col, val) {
              entry.eqFilter = { col, val };
              return Promise.resolve({ error: null });
            },
            in(col, ids) {
              entry.inFilter = { col, ids };
              return Promise.resolve({ error: null });
            }
          };
        },
        upsert(data, opts) {
          log.push({ op: "upsert", table: tableName, data, opts });
          return Promise.resolve({ error: null });
        }
      };

      return chain;
    }
  };

  return db;
}

const FAKE_RUN = {
  id: FAKE_RUN_ID,
  organization_id: FAKE_ORG,
  status: "needs_review",
  matched_identity_count: 16,
  unmatched_identity_count: 6955,
  ambiguous_identity_count: 15,
  summary: {}
};

const FAKE_RAW_ROWS = [
  { id: "row-1", account_name: "Sample Builders LLC", job_name: "Kitchen Remodel Phase A", identity_status: "needs_identity_review" },
  { id: "row-2", account_name: "Sample Builders LLC", job_name: "Laundry Counter Refresh", identity_status: "needs_identity_review" },
  { id: "row-3", account_name: "Demo Stone Partners", job_name: "Showroom Display Update", identity_status: "needs_identity_review" },
  { id: "row-4", account_name: "Fake Unmatched Account", job_name: "No Match Here", identity_status: "needs_identity_review" }
];

{
  // Dry-run returns plan summary without any DB writes
  const db = makeMockEnrichDb({ run: FAKE_RUN, jobs: SAMPLE_JOBS, rawRows: FAKE_RAW_ROWS });
  const result = await enrichRunFromApiMirror(db, {
    runId: FAKE_RUN_ID,
    organizationId: FAKE_ORG,
    dryRun: true
  });

  assert.equal(result.dryRun, true, "dry-run: dryRun flag set");
  assert.equal(result.applied, false, "dry-run: not applied");
  assert.equal(result.plan.matched, 3, "dry-run: 3 would-match");
  assert.equal(result.plan.skipped, 1, "dry-run: 1 would-skip");
  assert.equal(result.runStatus, "needs_review", "dry-run: run status passed through");
  assert.equal(result.currentCounts.matched, 16, "dry-run: existing matched count shown");

  // No writes should have been logged
  const writes = db._log.filter((e) => ["update", "upsert"].includes(e.op));
  assert.equal(writes.length, 0, "dry-run: no DB writes performed");
}

{
  // Apply mode: correct writes performed in correct order
  const db = makeMockEnrichDb({ run: FAKE_RUN, jobs: SAMPLE_JOBS, rawRows: FAKE_RAW_ROWS });
  const result = await enrichRunFromApiMirror(db, {
    runId: FAKE_RUN_ID,
    organizationId: FAKE_ORG,
    dryRun: false
  });

  assert.equal(result.applied, true, "apply: applied=true");
  assert.equal(result.plan.matched, 3, "apply: 3 matched");

  // New counts should reflect the matches
  assert.equal(result.newCounts.matched, 16 + 3, "apply: matched count incremented");
  assert.equal(result.newCounts.unmatched, 6955 - 3, "apply: unmatched count decremented");

  // raw_rows update entries logged
  const rawRowUpdates = db._log.filter((e) => e.op === "update" && e.table === "moraware_report_raw_rows");
  assert.ok(rawRowUpdates.length >= 1, "apply: at least 1 raw_rows update batch");
  const allMatchedUpdates = rawRowUpdates.filter((e) => e.data.identity_status === "matched");
  assert.ok(allMatchedUpdates.length >= 1, "apply: matched update(s) recorded");

  // identity_links upsert entry logged
  const linkUpserts = db._log.filter((e) => e.op === "upsert" && e.table === "moraware_report_identity_links");
  assert.ok(linkUpserts.length >= 1, "apply: identity_links upsert performed");

  // Link rows from upsert should be 3 (one per unique match key, not one per raw row)
  const allLinkRows = linkUpserts.flatMap((u) => u.data);
  const uniqueLinkKeys = new Set(allLinkRows.map((r) => r.match_key));
  assert.equal(uniqueLinkKeys.size, 3, "apply: 3 unique match keys → 3 identity link rows");
  const linkSourceValues = new Set(allLinkRows.map((r) => r.source));
  assert.ok(linkSourceValues.has("api_mirror"), "apply: link source=api_mirror");

  // run update logged
  const runUpdates = db._log.filter((e) => e.op === "update" && e.table === "moraware_report_runs");
  assert.ok(runUpdates.length >= 1, "apply: run update logged");
  const runUpdate = runUpdates[0].data;
  assert.equal(runUpdate.matched_identity_count, 19, "apply: run matched_identity_count updated");

  // No prepared facts written
  const preparedWrites = db._log.filter((e) => e.table === "moraware_prepared_sales_worksheet_facts");
  assert.equal(preparedWrites.length, 0, "apply: no prepared facts written");
}

{
  // Run not found → throws
  const db = makeMockEnrichDb({ run: null });
  let threw = false;
  try {
    await enrichRunFromApiMirror(db, { runId: "no-such-run", organizationId: FAKE_ORG, dryRun: true });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes("not found"), "not-found: error message mentions not found");
  }
  assert.ok(threw, "not-found: throws when run not found");
}

{
  // Organization mismatch → throws
  const wrongOrgRun = { ...FAKE_RUN, organization_id: "different-org-id" };
  const db = makeMockEnrichDb({ run: wrongOrgRun });
  let threw = false;
  try {
    await enrichRunFromApiMirror(db, { runId: FAKE_RUN_ID, organizationId: FAKE_ORG, dryRun: true });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes("mismatch"), "org-mismatch: error message mentions mismatch");
  }
  assert.ok(threw, "org-mismatch: throws on org mismatch");
}

{
  // Promoted run → throws
  const promotedRun = { ...FAKE_RUN, status: "promoted" };
  const db = makeMockEnrichDb({ run: promotedRun });
  let threw = false;
  try {
    await enrichRunFromApiMirror(db, { runId: FAKE_RUN_ID, organizationId: FAKE_ORG, dryRun: true });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes("promoted"), "promoted: error message mentions promoted");
  }
  assert.ok(threw, "promoted: throws when run is already promoted");
}

console.log("apiMirrorEnrichment.test.mjs: ok");
