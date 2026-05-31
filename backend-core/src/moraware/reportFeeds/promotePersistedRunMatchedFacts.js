/**
 * Promotion of prepared facts from persisted moraware_report_raw_rows.
 *
 * This is the post-enrichment promotion path: reads already-staged and
 * API-mirror-enriched rows from moraware_report_raw_rows, then promotes
 * them to moraware_prepared_sales_worksheet_facts.
 *
 * Unlike promoteReportFeedFacts (which promotes from in-memory processResult),
 * this module reads from the DB and supports two special modes for runs that
 * have identity complications:
 *
 *   matchedOnly = true  — promotes only identity_status="matched" rows;
 *                          excludes ambiguous_identity rows; used when ambiguous rows
 *                          exist but a clean majority can be promoted.
 *
 *   allowNameOnly = true — additionally promotes identity_status="needs_identity_review"
 *                           rows as name-only facts (null job_id / account_id);
 *                           permitted ONLY for report_type=sales_worksheet_history_facts
 *                           (enforced via DB lookup — cannot be bypassed by caller);
 *                           always excludes ambiguous_identity rows;
 *                           run status stays needs_review when name-only rows are included
 *                           because identity is partial.
 *
 * Safe defaults:
 * - dryRun = true — no writes without explicit dryRun: false
 * - Refuses if schema_drift.detected = true
 * - Refuses if unmatched_identity_count > 0 (unless allowNameOnly)
 * - Refuses ambiguous rows unless matchedOnly or allowNameOnly
 * - Never promotes ambiguous_identity rows
 * - Never deletes prepared facts
 * - Preserves supersede semantics (deactivate → insert → backfill)
 * - On insert failure, best-effort re-activates all rows deactivated in this run
 *
 * Writes to:
 *   moraware_prepared_sales_worksheet_facts (update, insert — never delete)
 *   moraware_report_runs (summary + status update)
 *
 * Never writes to:
 *   moraware_report_raw_rows
 *   moraware_report_identity_links
 */

import { mapPreparedSalesWorksheetFact } from "./mapPreparedSalesWorksheetFact.js";
import { planPreparedFactSupersede } from "./planPreparedFactSupersede.js";
import { loadActivePreparedFacts } from "./promoteSalesWorksheetFacts.js";
import { SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE } from "./constants.js";

const RAW_ROWS_PAGE_SIZE = 1000;
const DEACTIVATE_BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 500;
const IDENTITY_LINKS_PAGE_SIZE = 1000;

/** Column list for moraware_report_raw_rows queries (avoids repetition). */
const RAW_ROW_SELECT =
  "id, row_hash, account_id, job_id, account_name, job_name, " +
  "identity_status, identity_reason, raw_row, row_number";

/** Wrap a bare Supabase/PostgREST error object so it has a usable .stack. */
function toError(err) {
  if (!err) return new Error("unknown error");
  if (err instanceof Error) return err;
  const parts = [
    err.message,
    err.code && `[code=${err.code}]`,
    err.details && `[details=${err.details}]`,
    err.hint && `[hint=${err.hint}]`
  ].filter(Boolean);
  const e = new Error(parts.join(" ") || JSON.stringify(err));
  e.supabaseError = err;
  return e;
}

/**
 * Fetch all pages from a Supabase table with simple equality filters.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} table
 * @param {Record<string, unknown>} filters - equality filters applied with .eq()
 * @param {string} select - column list
 * @param {number} pageSize
 * @returns {Promise<Array>}
 */
async function fetchAllPages(db, table, filters, select, pageSize) {
  const all = [];
  let from = 0;
  while (true) {
    let q = db.from(table).select(select);
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw toError(error);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Gate check for persisted-run promotion.
 * Pure function — no DB access.
 *
 * Blocks on:
 *   - run already promoted
 *   - schema_drift.detected = true
 *   - unmatched_identity_count > 0   (unless allowNameOnly = true)
 *   - ambiguous_identity_count > 0   (unless matchedOnly OR allowNameOnly)
 *
 * allowNameOnly = true bypasses both the unmatched gate and the ambiguous gate.
 * The orchestrator is responsible for validating that allowNameOnly is only set
 * for report_type = sales_worksheet_history_facts (via a DB lookup before this call).
 *
 * @param {object} run - moraware_report_runs DB row
 * @param {{ matchedOnly?: boolean, allowNameOnly?: boolean }} [opts]
 * @returns {{ ok: boolean, reason: string|null, details?: object }}
 */
export function checkPersistedRunGates(run, opts = {}) {
  const { matchedOnly = false, allowNameOnly = false } = opts;

  if (!run || typeof run !== "object") {
    return { ok: false, reason: "invalid_run" };
  }

  if (run.status === "promoted") {
    return { ok: false, reason: "already_promoted", details: { status: run.status } };
  }

  if (run.schema_drift?.detected === true) {
    return {
      ok: false,
      reason: "schema_drift_detected",
      details: { schemaDrift: run.schema_drift }
    };
  }

  const unmatchedCount = run.unmatched_identity_count ?? 0;
  if (unmatchedCount > 0 && !allowNameOnly) {
    return {
      ok: false,
      reason: "unmatched_rows_present",
      details: { unmatchedCount }
    };
  }

  const ambiguousCount = run.ambiguous_identity_count ?? 0;
  // allowNameOnly inherently excludes ambiguous rows, so it satisfies this gate.
  if (ambiguousCount > 0 && !matchedOnly && !allowNameOnly) {
    return {
      ok: false,
      reason: "ambiguous_rows_require_matched_only_flag",
      details: { ambiguousCount }
    };
  }

  return { ok: true, reason: null };
}

/**
 * Adapt a moraware_report_raw_rows DB row to the enrichedRow shape expected by
 * mapPreparedSalesWorksheetFact.
 *
 * Extracts scalar fields from raw_row JSONB using canonical Moraware column names
 * (the normalised header strings stored when the CSV was originally parsed).
 *
 * branchOrProcess is always null — "Branch" is not in the v1 76-column contract;
 * deferred to Account Mapping in a later slice.
 *
 * @param {object} dbRow - Row from moraware_report_raw_rows
 * @returns {object} enrichedRow shape for mapPreparedSalesWorksheetFact
 */
export function persistedRawRowToEnrichedRow(dbRow) {
  const raw = dbRow.raw_row ?? {};
  return {
    rowHash: dbRow.row_hash,
    accountId: dbRow.account_id ?? null,
    jobId: dbRow.job_id ?? null,
    // Prefer the denormalised columns on the raw row over re-reading from raw_row JSON.
    // Fall back to raw_row keys if the denormalised column is absent.
    accountName: dbRow.account_name ?? raw["Account Name"] ?? null,
    jobName: dbRow.job_name ?? raw["Job Name"] ?? null,
    identityStatus: dbRow.identity_status ?? "needs_identity_review",
    identityReason: dbRow.identity_reason ?? null,
    rawRow: raw,
    // Scalar fields extracted from raw_row JSONB using exact CSV column names.
    jobStatus: raw["Job Status"] ?? null,
    jobCreationDate: raw["Job Creation Date"] ?? null,
    jobSalesperson: raw["Job Salesperson"] ?? null,
    totalWorksheetSqft: raw["Total Job Worksheet - Sq.Ft. by Job Creation Date"] ?? null,
    color: raw["Job Worksheet - Color"] ?? null,
    stone: raw["Stone"] ?? null,
    room: raw["Job Worksheet - Room"] ?? null,
    branchOrProcess: null
  };
}

// ── Read-only review ──────────────────────────────────────────────────────────

/**
 * Review ambiguous identity rows for a report run.
 * Read-only — performs no writes.
 *
 * Returns match keys and candidate Moraware IDs from moraware_report_identity_links
 * where is_ambiguous = true.  Does not include raw customer row data.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ runId: string, organizationId: string }} params
 * @returns {Promise<AmbiguousReviewResult>}
 */
export async function reviewAmbiguousRows(db, { runId, organizationId }) {
  const { data: run, error: runErr } = await db
    .from("moraware_report_runs")
    .select("id, organization_id, status, matched_identity_count, unmatched_identity_count, ambiguous_identity_count")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw toError(runErr);
  if (!run) throw new Error(`reviewAmbiguousRows: run not found: ${runId}`);
  if (run.organization_id !== organizationId) {
    throw new Error(
      `reviewAmbiguousRows: organization_id mismatch — ` +
      `run belongs to ${run.organization_id}, caller passed ${organizationId}`
    );
  }

  // Fetch ambiguous identity links for this run (match_key + candidate IDs only — no raw rows).
  const ambiguousLinks = await fetchAllPages(
    db,
    "moraware_report_identity_links",
    { report_run_id: runId, is_ambiguous: true },
    "match_key, account_id, job_id, source",
    IDENTITY_LINKS_PAGE_SIZE
  );

  return {
    runId,
    organizationId,
    runStatus: run.status,
    counts: {
      matched: run.matched_identity_count ?? 0,
      ambiguous: run.ambiguous_identity_count ?? 0,
      unmatched: run.unmatched_identity_count ?? 0
    },
    // Safe to print: match_key is a normalised (account_name, job_name) hash string;
    // account_id / job_id are internal Moraware numeric IDs, not PII.
    ambiguousLinks: ambiguousLinks.map(({ match_key, account_id, job_id, source }) => ({
      match_key,
      account_id,
      job_id,
      source
    }))
  };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Promote prepared facts from persisted moraware_report_raw_rows.
 *
 * Execution order (enforced):
 *   1. Load + org-validate the run.
 *   2. [allowNameOnly] Validate feed report_type via DB — must be sales_worksheet_history_facts.
 *   3. Gate checks (checkPersistedRunGates).
 *   4. Fetch matched raw rows (paged).
 *   5. [allowNameOnly] Fetch needs_identity_review rows (name-only) (paged).
 *   6. Map all eligible rows to prepared-fact payloads (mapPreparedSalesWorksheetFact).
 *   7. Load existing active facts (loadActivePreparedFacts).
 *   8. Build supersede plan (planPreparedFactSupersede).
 *   9. [dry-run] Return plan summary — no writes.
 *  10. [apply] Batch-deactivate old active facts.
 *  11. [apply] Batch-insert new active facts; rollback on failure.
 *  12. [apply] Row-by-row backfill superseded_by (non-fatal).
 *  13. [apply] Update run summary JSON and status.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {object} params
 * @param {string}           params.runId           - UUID of moraware_report_runs row
 * @param {string}           params.organizationId  - Organization UUID
 * @param {boolean}          [params.matchedOnly]   - If true, promotes only matched rows even
 *                                                     if ambiguous rows exist.  Default false.
 * @param {boolean}          [params.allowNameOnly] - If true, also promotes needs_identity_review
 *                                                     rows as name-only facts (null job_id/account_id).
 *                                                     Permitted only for sales_worksheet_history_facts.
 *                                                     Always excludes ambiguous_identity rows.
 *                                                     Run status stays needs_review (identity partial).
 *                                                     Default false.
 * @param {boolean}          [params.dryRun]        - If true (default), no DB writes performed.
 * @param {Date|string|null} [params.promotedAt]    - Timestamp override (defaults to now).
 * @returns {Promise<PromotePersistedResult>}
 */
export async function promotePersistedRunMatchedFacts(db, {
  runId,
  organizationId,
  matchedOnly = false,
  allowNameOnly = false,
  dryRun = true,
  promotedAt = null
}) {
  // ── Step 1: Load and validate the run ────────────────────────────────────────
  const { data: run, error: runErr } = await db
    .from("moraware_report_runs")
    .select(
      "id, organization_id, status, report_feed_id, schema_drift, " +
      "matched_identity_count, unmatched_identity_count, ambiguous_identity_count, summary"
    )
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw toError(runErr);
  if (!run) throw new Error(`promotePersistedRunMatchedFacts: run not found: ${runId}`);
  if (run.organization_id !== organizationId) {
    throw new Error(
      `promotePersistedRunMatchedFacts: organization_id mismatch — ` +
      `run belongs to ${run.organization_id}, caller passed ${organizationId}`
    );
  }

  const feedId = run.report_feed_id;
  if (!feedId) {
    return { promoted: false, skipped: true, dryRun, reason: "missing_report_feed_id" };
  }

  // ── Step 2: Validate name-only mode is only permitted for historical worksheet feed ─
  if (allowNameOnly) {
    const { data: feed, error: feedErr } = await db
      .from("moraware_report_feeds")
      .select("report_type")
      .eq("id", feedId)
      .maybeSingle();
    if (feedErr) throw toError(feedErr);
    const feedReportType = feed?.report_type ?? null;
    if (feedReportType !== SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE) {
      return {
        promoted: false,
        skipped: true,
        dryRun,
        reason: "name_only_not_allowed_for_report_type",
        details: {
          reportType: feedReportType,
          allowedFor: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE
        }
      };
    }
  }

  // ── Step 3: Gate checks ───────────────────────────────────────────────────────
  const gate = checkPersistedRunGates(run, { matchedOnly, allowNameOnly });
  if (!gate.ok) {
    return {
      promoted: false,
      skipped: true,
      dryRun,
      reason: gate.reason,
      details: gate.details ?? null
    };
  }

  const now = promotedAt ? new Date(promotedAt).toISOString() : new Date().toISOString();
  const ambiguousCount = run.ambiguous_identity_count ?? 0;
  const unmatchedCount = run.unmatched_identity_count ?? 0;

  // ── Step 4: Fetch matched raw rows (paged) ────────────────────────────────────
  const matchedRawRows = await fetchAllPages(
    db,
    "moraware_report_raw_rows",
    { organization_id: organizationId, report_run_id: runId, identity_status: "matched" },
    RAW_ROW_SELECT,
    RAW_ROWS_PAGE_SIZE
  );

  // ── Step 5: Fetch name-only rows (needs_identity_review) if allowNameOnly ─────
  let nameOnlyRawRows = [];
  if (allowNameOnly) {
    nameOnlyRawRows = await fetchAllPages(
      db,
      "moraware_report_raw_rows",
      { organization_id: organizationId, report_run_id: runId, identity_status: "needs_identity_review" },
      RAW_ROW_SELECT,
      RAW_ROWS_PAGE_SIZE
    );
  }

  const allEligibleRows = [...matchedRawRows, ...nameOnlyRawRows];

  if (allEligibleRows.length === 0) {
    return {
      promoted: false,
      skipped: true,
      dryRun,
      reason: allowNameOnly ? "no_eligible_rows" : "no_matched_rows"
    };
  }

  // ── Step 6: Map to prepared-fact payloads ─────────────────────────────────────
  // identity_status flows through to the prepared fact for all rows.
  // Name-only rows will have null account_id and null job_id in the prepared fact.
  const incomingFacts = allEligibleRows.map((dbRow) =>
    mapPreparedSalesWorksheetFact({
      enrichedRow: persistedRawRowToEnrichedRow(dbRow),
      organizationId,
      reportFeedId: feedId,
      reportRunId: runId,
      promotedAt: now
    })
  );

  // ── Step 7: Load existing active facts for supersede plan ─────────────────────
  const existingActiveFacts = await loadActivePreparedFacts(db, {
    organizationId,
    reportFeedId: feedId
  });

  // ── Step 8: Build supersede plan ──────────────────────────────────────────────
  const plan = planPreparedFactSupersede({
    existingActiveFacts,
    incomingFacts,
    supersededAt: now
  });

  if (!plan.safe) {
    return {
      promoted: false,
      skipped: true,
      dryRun,
      reason: "unsafe_supersede_plan",
      details: {
        unsafeReasons: plan.unsafeReasons,
        duplicateIncomingHashes: plan.duplicateIncomingHashes
      }
    };
  }

  const deactivateSteps = plan.steps.filter((s) => s.action === "deactivate");
  const insertSteps = plan.steps.filter((s) => s.action === "insert");
  const backfillSteps = plan.steps.filter((s) => s.action === "backfill_superseded_by");

  // ── Step 9 (dry-run): Return plan summary — no writes ─────────────────────────
  if (dryRun) {
    return {
      promoted: false,
      dryRun: true,
      skipped: false,
      runId,
      organizationId,
      reportFeedId: feedId,
      runStatus: run.status,
      schemaDrift: run.schema_drift?.detected === true,
      matchedRowsEligible: matchedRawRows.length,
      nameOnlyRowsEligible: nameOnlyRawRows.length,
      ambiguousExcluded: ambiguousCount,
      unmatchedCount: allowNameOnly ? 0 : unmatchedCount,
      plan: {
        insertCount: plan.insertCount,
        deactivateCount: plan.deactivateCount,
        backfillCount: plan.backfillCount,
        matchedOnly,
        allowNameOnly
      }
    };
  }

  // ── Step 10: Batch-deactivate old active facts ────────────────────────────────
  // All deactivations before any inserts to satisfy the partial unique index.
  const deactivateIds = deactivateSteps.map((s) => s.payload.id);
  for (let i = 0; i < deactivateIds.length; i += DEACTIVATE_BATCH_SIZE) {
    const chunk = deactivateIds.slice(i, i + DEACTIVATE_BATCH_SIZE);
    const { error } = await db
      .from("moraware_prepared_sales_worksheet_facts")
      .update({ is_active: false, superseded_at: now })
      .in("id", chunk);
    if (error) throw toError(error);
  }

  // ── Step 11: Batch-insert new active facts (with rollback on failure) ─────────
  const newIdByHash = new Map();
  try {
    const insertPayloads = insertSteps.map((s) => s.payload);
    for (let i = 0; i < insertPayloads.length; i += INSERT_BATCH_SIZE) {
      const chunk = insertPayloads.slice(i, i + INSERT_BATCH_SIZE);
      const { data, error } = await db
        .from("moraware_prepared_sales_worksheet_facts")
        .insert(chunk)
        .select("id, row_hash");
      if (error) throw toError(error);
      for (const row of data ?? []) {
        newIdByHash.set(String(row.row_hash ?? ""), row.id);
      }
    }
  } catch (insertErr) {
    // Best-effort rollback: re-activate all rows deactivated in this run.
    for (let i = 0; i < deactivateIds.length; i += DEACTIVATE_BATCH_SIZE) {
      const chunk = deactivateIds.slice(i, i + DEACTIVATE_BATCH_SIZE);
      try {
        await db
          .from("moraware_prepared_sales_worksheet_facts")
          .update({ is_active: true, superseded_at: null })
          .in("id", chunk);
      } catch {
        // Non-fatal — rollback is best-effort
      }
    }
    throw insertErr;
  }

  // ── Step 12: Backfill superseded_by (row-by-row, non-fatal) ──────────────────
  let backfillCount = 0;
  for (const step of backfillSteps) {
    const newId = newIdByHash.get(String(step.payload.newFactRowHash ?? ""));
    if (!newId) continue;
    try {
      await db
        .from("moraware_prepared_sales_worksheet_facts")
        .update({ superseded_by: newId })
        .eq("id", step.payload.deactivatedId);
      backfillCount++;
    } catch {
      // Non-fatal: deactivation state is correct; backfill can be retried later
    }
  }

  // ── Step 13: Update run summary and status ────────────────────────────────────
  const promotionEntry = {
    promotedAt: now,
    mode: allowNameOnly ? "name_only" : (matchedOnly ? "matched_only" : "full"),
    matchedRowCount: matchedRawRows.length,
    ...(allowNameOnly ? { nameOnlyRowCount: nameOnlyRawRows.length } : {}),
    ambiguousExcluded: ambiguousCount,
    unmatchedExcluded: allowNameOnly ? 0 : unmatchedCount,
    insertCount: insertSteps.length,
    deactivateCount: deactivateSteps.length,
    backfillCount,
    dryRun: false,
    ...(allowNameOnly && nameOnlyRawRows.length > 0
      ? {
          warning:
            "name_only_promotion: some prepared facts have null job_id/account_id; " +
            "use report_feed_id scoping for all dashboard queries against this feed"
        }
      : {})
  };

  const existingSummary = run.summary ?? {};
  const updatedSummary = {
    ...existingSummary,
    promotions: [
      ...(existingSummary.promotions ?? []),
      promotionEntry
    ]
  };

  // Status logic:
  //   - name-only mode with name-only rows promoted → needs_review (identity is partial)
  //   - matchedOnly with ambiguous rows remaining → keep existing status (e.g. "needs_review")
  //   - All rows cleanly resolved → "promoted"
  const newStatus = (() => {
    if (allowNameOnly && nameOnlyRawRows.length > 0) return "needs_review";
    if (matchedOnly && ambiguousCount > 0) return run.status;
    return "promoted";
  })();

  const { error: runUpdateErr } = await db
    .from("moraware_report_runs")
    .update({ status: newStatus, summary: updatedSummary })
    .eq("id", runId);
  if (runUpdateErr) throw toError(runUpdateErr);

  return {
    promoted: true,
    dryRun: false,
    skipped: false,
    runId,
    organizationId,
    reportFeedId: feedId,
    runStatus: newStatus,
    matchedOnly,
    allowNameOnly,
    matchedRowCount: matchedRawRows.length,
    nameOnlyRowCount: nameOnlyRawRows.length,
    insertCount: insertSteps.length,
    deactivateCount: deactivateSteps.length,
    backfillCount,
    ambiguousExcluded: ambiguousCount,
    unmatchedExcluded: allowNameOnly ? 0 : unmatchedCount
  };
}

/**
 * @typedef {object} AmbiguousReviewResult
 * @property {string}   runId
 * @property {string}   organizationId
 * @property {string}   runStatus
 * @property {{ matched: number, ambiguous: number, unmatched: number }} counts
 * @property {Array<{ match_key: string, account_id: string|null, job_id: string|null, source: string }>} ambiguousLinks
 */

/**
 * @typedef {object} PromotePersistedResult
 * @property {boolean}      promoted
 * @property {boolean}      dryRun
 * @property {boolean}      skipped
 * @property {string|null}  reason               - Block reason when skipped=true
 * @property {object|null}  [details]            - Extra context for block reasons
 * @property {string}       [runId]
 * @property {string}       [organizationId]
 * @property {string}       [reportFeedId]
 * @property {string}       [runStatus]
 * @property {boolean}      [matchedOnly]
 * @property {boolean}      [allowNameOnly]
 * @property {number}       [matchedRowCount]     - applied rows with identity_status=matched
 * @property {number}       [nameOnlyRowCount]    - applied rows with identity_status=needs_identity_review
 * @property {number}       [insertCount]
 * @property {number}       [deactivateCount]
 * @property {number}       [backfillCount]
 * @property {number}       [ambiguousExcluded]
 * @property {number}       [unmatchedExcluded]
 * @property {number}       [matchedRowsEligible]  - dry-run only
 * @property {number}       [nameOnlyRowsEligible] - dry-run only; allowNameOnly mode only
 * @property {object}       [plan]                 - dry-run only
 */
