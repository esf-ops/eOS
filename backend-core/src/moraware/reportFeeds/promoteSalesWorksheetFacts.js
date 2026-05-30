/**
 * Prepared-fact promotion for Sales Worksheet Facts.
 *
 * Writes to: moraware_prepared_sales_worksheet_facts (insert, update only — never delete).
 *
 * Gate: MORAWARE_REPORT_FEED_PROMOTE=1 must be set by the caller (promoteFlag param).
 *       This module does not read env itself — callers must pass the flag explicitly so it
 *       can be tested without env mutation.
 *
 * Execution order (enforced — never reordered):
 *   1. Load existing active facts for this org + feed.
 *   2. Build incoming payloads via mapPreparedSalesWorksheetFact.
 *   3. Plan supersede via planPreparedFactSupersede.
 *   4. Deactivate old active rows (is_active=false, superseded_at=now).
 *   5. Insert new active rows (is_active=true) — capture returned IDs.
 *   6. Backfill superseded_by on deactivated rows (non-fatal if step fails).
 *
 * Rollback on insert failure:
 *   If any insert (step 5) fails, best-effort re-activation of all deactivated rows
 *   (step 4) is attempted before re-throwing. Prior active facts are never silently lost.
 */

import { mapPreparedSalesWorksheetFact } from "./mapPreparedSalesWorksheetFact.js";
import { shouldPromoteReportRun } from "./shouldPromoteReportRun.js";
import { planPreparedFactSupersede } from "./planPreparedFactSupersede.js";

/**
 * Fetch all is_active=true prepared facts for a given org + feed.
 * Returns minimal shape needed by planPreparedFactSupersede (id + row_hash).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ organizationId: string, reportFeedId: string }} params
 * @returns {Promise<Array<{id: string, row_hash: string, organization_id: string, report_feed_id: string}>>}
 */
export async function loadActivePreparedFacts(db, { organizationId, reportFeedId }) {
  const { data, error } = await db
    .from("moraware_prepared_sales_worksheet_facts")
    .select("id, row_hash, organization_id, report_feed_id")
    .eq("organization_id", organizationId)
    .eq("report_feed_id", reportFeedId)
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}

/**
 * Promote validated prepared facts from a processed report-feed run.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {object} params
 * @param {object}  params.feed            - moraware_report_feeds row (requires id, organization_id)
 * @param {string}  params.runId           - UUID of the moraware_report_runs row for this run
 * @param {object}  params.processResult   - Return value of processReportFeedLocal
 * @param {boolean} [params.promoteFlag]   - Must be true to proceed; false/absent = no-op
 * @param {Date|string|null} [params.promotedAt] - Timestamp override (defaults to now)
 * @returns {Promise<PromoteResult>}
 */
export async function promoteReportFeedFacts(db, {
  feed,
  runId,
  processResult,
  promoteFlag = false,
  promotedAt = null
}) {
  // ── Gate 1: explicit promotion flag ─────────────────────────────────────────
  if (!promoteFlag) {
    return { promoted: false, skipped: true, reason: "promote_flag_not_set" };
  }

  // ── Gate 2: run eligibility (shouldPromoteReportRun) ─────────────────────────
  const gate = shouldPromoteReportRun(processResult);
  if (!gate.ok) {
    return { promoted: false, skipped: true, reason: gate.reason, details: gate.details ?? null };
  }

  const now = promotedAt ? new Date(promotedAt).toISOString() : new Date().toISOString();

  // ── Build incoming payloads ───────────────────────────────────────────────────
  const enrichedRows = processResult.enrichment?.rows ?? [];
  const incomingFacts = enrichedRows.map((row) =>
    mapPreparedSalesWorksheetFact({
      enrichedRow: row,
      organizationId: feed.organization_id,
      reportFeedId: feed.id,
      reportRunId: runId,
      promotedAt: now
    })
  );

  // ── Load existing active facts for supersede plan ─────────────────────────────
  const existingActiveFacts = await loadActivePreparedFacts(db, {
    organizationId: feed.organization_id,
    reportFeedId: feed.id
  });

  // ── Build supersede plan ──────────────────────────────────────────────────────
  const plan = planPreparedFactSupersede({
    existingActiveFacts,
    incomingFacts,
    supersededAt: now
  });

  if (!plan.safe) {
    return {
      promoted: false,
      skipped: true,
      reason: "unsafe_supersede_plan",
      details: { unsafeReasons: plan.unsafeReasons, duplicateIncomingHashes: plan.duplicateIncomingHashes }
    };
  }

  const deactivateSteps = plan.steps.filter((s) => s.action === "deactivate");
  const insertSteps = plan.steps.filter((s) => s.action === "insert");
  const backfillSteps = plan.steps.filter((s) => s.action === "backfill_superseded_by");

  // ── Step 1: Deactivate old active rows ────────────────────────────────────────
  // Do ALL deactivations before any inserts to satisfy the partial unique index.
  const deactivatedIds = [];
  for (const step of deactivateSteps) {
    const { error } = await db
      .from("moraware_prepared_sales_worksheet_facts")
      .update({ is_active: false, superseded_at: now })
      .eq("id", step.payload.id);
    if (error) throw error;
    deactivatedIds.push(step.payload.id);
  }

  // ── Step 2: Insert new active rows (with rollback on failure) ─────────────────
  // Map row_hash → new DB id for backfill step.
  const newIdByHash = new Map();

  try {
    for (const step of insertSteps) {
      const { data, error } = await db
        .from("moraware_prepared_sales_worksheet_facts")
        .insert(step.payload)
        .select("id, row_hash")
        .limit(1);
      if (error) throw error;
      const newId = data?.[0]?.id;
      if (!newId) throw new Error("promoteReportFeedFacts: insert did not return a fact id");
      newIdByHash.set(String(step.payload.row_hash ?? ""), newId);
    }
  } catch (insertErr) {
    // Best-effort rollback: re-activate all rows we deactivated in this run.
    for (const id of deactivatedIds) {
      try {
        await db
          .from("moraware_prepared_sales_worksheet_facts")
          .update({ is_active: true, superseded_at: null })
          .eq("id", id);
      } catch {
        // Non-fatal — rollback is best-effort
      }
    }
    throw insertErr;
  }

  // ── Step 3: Backfill superseded_by (non-fatal) ────────────────────────────────
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

  return {
    promoted: true,
    skipped: false,
    reason: null,
    insertCount: insertSteps.length,
    deactivateCount: deactivateSteps.length,
    backfillCount
  };
}

/**
 * @typedef {object} PromoteResult
 * @property {boolean}      promoted        - True only when facts were actually written.
 * @property {boolean}      skipped         - True when promotion was blocked or flagged off.
 * @property {string|null}  reason          - Block reason when skipped=true; null when promoted=true.
 * @property {object|null}  [details]       - Extra context for block reasons.
 * @property {number}       [insertCount]   - Number of new fact rows inserted.
 * @property {number}       [deactivateCount] - Number of old rows deactivated.
 * @property {number}       [backfillCount] - Number of superseded_by backfills applied.
 */
