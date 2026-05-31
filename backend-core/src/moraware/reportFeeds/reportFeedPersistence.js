/**
 * Staging persistence for Moraware report-feed runs.
 *
 * Writes to: moraware_report_runs, moraware_report_column_profiles,
 *            moraware_report_raw_rows, moraware_report_identity_links
 *
 * Never writes to: moraware_prepared_sales_worksheet_facts
 * Never deletes rows.
 *
 * Only persistReportFeedRun() performs actual DB writes; all build* helpers are pure.
 */

export const RAW_ROWS_BATCH_SIZE = 500;
export const IDENTITY_LINKS_BATCH_SIZE = 500;

/**
 * Format a Supabase/PostgREST error object (or any thrown value) into a readable string.
 * Extracts message/code/details/hint; never prints raw row data or secrets.
 */
function formatSupabaseError(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  const parts = [
    err.message,
    err.code && `[code=${err.code}]`,
    err.details && `[details=${err.details}]`,
    err.hint && `[hint=${err.hint}]`
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (err instanceof Error) return err.stack || err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ── Pure row-shape helpers ────────────────────────────────────────────────────

/**
 * Query shape for fetching an active feed contract.
 * Returns the Supabase query builder expression as a plain descriptor for test inspection.
 */
export function buildFeedContractQuery({ organizationId, reportType, morawareViewId = null }) {
  return {
    table: "moraware_report_feeds",
    filters: {
      organization_id: organizationId,
      report_type: reportType,
      ...(morawareViewId != null ? { moraware_view_id: morawareViewId } : {}),
      is_active: true
    },
    select: "*",
    limit: 1
  };
}

/**
 * Build the initial moraware_report_runs insert payload (status = "running").
 */
export function buildReportRunInsert({ feed, processResult, sourceFiles = {} }) {
  const now = new Date().toISOString();
  return {
    organization_id: feed.organization_id,
    report_feed_id: feed.id,
    status: "running",
    started_at: now,
    source_mode: "local_file",
    csv_storage_path: sourceFiles.csvPath ?? null,
    html_storage_path: sourceFiles.htmlPath ?? null,
    observed_header_hash: processResult.profile?.headerHash ?? null,
    expected_header_hash: feed.expected_column_hash ?? null,
    row_count: processResult.profile?.rowCount ?? 0,
    matched_identity_count: processResult.enrichment?.counts?.matched ?? 0,
    unmatched_identity_count: processResult.enrichment?.counts?.needs_identity_review ?? 0,
    ambiguous_identity_count: processResult.enrichment?.counts?.ambiguous_identity ?? 0,
    schema_drift: processResult.schemaDrift ?? {},
    summary: {},
    error_message: null
  };
}

/**
 * Build the moraware_report_column_profiles insert payload.
 */
export function buildColumnProfileInsert({ runId, feed, processResult }) {
  const profile = processResult.profile ?? {};
  return {
    organization_id: feed.organization_id,
    report_run_id: runId,
    header_hash: profile.headerHash ?? "",
    row_count: profile.rowCount ?? 0,
    column_count: profile.columnCount ?? 0,
    columns: profile.columns ?? []
  };
}

/**
 * Build moraware_report_raw_rows insert payloads — one per enriched CSV row.
 */
export function buildRawRowInserts({ runId, feed, processResult }) {
  const rows = processResult.enrichment?.rows ?? [];
  const orgId = feed.organization_id;
  return rows.map((r) => ({
    organization_id: orgId,
    report_run_id: runId,
    row_number: r.rowNumber,
    row_hash: r.rowHash,
    raw_row: r.rawRow ?? {},
    account_name: r.accountName || null,
    job_name: r.jobName || null,
    account_id: r.accountId ?? null,
    job_id: r.jobId ?? null,
    identity_status: r.identityStatus ?? "needs_identity_review",
    identity_reason: r.identityReason ?? null
  }));
}

/**
 * Build moraware_report_identity_links insert payloads from the HTML identity extraction.
 *
 * Deduplicates by match_key before returning — real Moraware HTML reports repeat
 * the same account+job link once per worksheet row, which would violate the
 * (report_run_id, match_key) unique constraint if inserted as-is.
 *
 * Dedup rules:
 * - Same match_key, same account_id+job_id → keep one entry, is_ambiguous=false.
 * - Same match_key, different account_id or job_id → keep first entry, is_ambiguous=true.
 */
export function buildIdentityLinkInserts({ runId, feed, processResult }) {
  const htmlRows = processResult.htmlIdentity?.rows ?? [];
  /** @type {Map<string, object>} match_key → insert payload */
  const seenKeys = new Map();

  for (const row of htmlRows) {
    const matchKey = `${String(row.accountName ?? "").toLowerCase().trim()}||${String(row.jobName ?? "").toLowerCase().trim()}`;
    if (seenKeys.has(matchKey)) {
      const existing = seenKeys.get(matchKey);
      // Mark ambiguous when same key maps to different IDs (genuinely conflicting identity)
      if (
        existing.account_id !== (row.accountId ?? null) ||
        existing.job_id !== (row.jobId ?? null)
      ) {
        existing.is_ambiguous = true;
      }
      // Otherwise same IDs — harmless duplicate from multi-worksheet-row HTML; skip silently.
    } else {
      seenKeys.set(matchKey, {
        organization_id: feed.organization_id,
        report_run_id: runId,
        match_key: matchKey,
        account_id: row.accountId ?? null,
        account_name: row.accountName || null,
        job_id: row.jobId ?? null,
        job_name: row.jobName || null,
        source: "html_report",
        is_ambiguous: false
      });
    }
  }

  return [...seenKeys.values()];
}

/**
 * Build the final moraware_report_runs UPDATE payload (after all staging inserts).
 */
export function buildRunFinalUpdate({ runId, processResult, error = null }) {
  const finishedAt = new Date().toISOString();
  const status = error
    ? "failed"
    : processResult.runStatus === "validated"
      ? "validated"
      : "needs_review";

  return {
    id: runId,
    status,
    finished_at: finishedAt,
    row_count: processResult.profile?.rowCount ?? 0,
    matched_identity_count: processResult.enrichment?.counts?.matched ?? 0,
    unmatched_identity_count: processResult.enrichment?.counts?.needs_identity_review ?? 0,
    ambiguous_identity_count: processResult.enrichment?.counts?.ambiguous_identity ?? 0,
    observed_header_hash: processResult.profile?.headerHash ?? null,
    schema_drift: processResult.schemaDrift ?? {},
    summary: {
      headerValidation: processResult.headerValidation ?? null,
      duplicatePreparedFacts: processResult.enrichment?.duplicatePreparedFacts ?? [],
      htmlIdentityRowCount: processResult.htmlIdentity?.rowCount ?? 0,
      htmlIdentityUniqueKeyCount: processResult.htmlIdentity?.uniqueKeyCount ?? 0,
      htmlIdentityDuplicateKeyCount: processResult.htmlIdentity?.duplicateKeyCount ?? 0
    },
    error_message: error ? formatSupabaseError(error) : null
  };
}

// ── DB batch helper (used inside persistReportFeedRun only) ───────────────────

async function batchInsert(db, table, rows, batchSize) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await db.from(table).insert(chunk);
    if (error) {
      // Wrap bare Supabase/PostgREST error objects so callers always get a proper Error
      // with a readable .message and a .stack — prevents "FATAL: [object Object]" in CLI.
      const wrapped = new Error(formatSupabaseError(error));
      wrapped.supabaseError = error;
      throw wrapped;
    }
  }
}

// ── Main persistence orchestrator ─────────────────────────────────────────────

/**
 * Load the active feed contract for a given org + report type.
 * Returns the feed row or null when not found.
 */
export async function loadReportFeedContract(db, { organizationId, reportType, morawareViewId = null }) {
  let q = db
    .from("moraware_report_feeds")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("report_type", reportType)
    .eq("is_active", true);

  if (morawareViewId != null) {
    q = q.eq("moraware_view_id", morawareViewId);
  }

  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Persist one complete report-feed staging run.
 *
 * Write order (never modified):
 *   1. INSERT moraware_report_runs (status=running)
 *   2. INSERT moraware_report_column_profiles
 *   3. INSERT moraware_report_raw_rows (batched)
 *   4. INSERT moraware_report_identity_links (batched)
 *   5. UPDATE moraware_report_runs (final status, counts, drift, finished_at)
 *
 * On error: attempts to mark run=failed before re-throwing.
 * Never writes to moraware_prepared_sales_worksheet_facts.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ feed: object, processResult: object, sourceFiles?: { csvPath?: string, htmlPath?: string } }} params
 * @returns {{ runId: string, status: string }}
 */
export async function persistReportFeedRun(db, { feed, processResult, sourceFiles = {} }) {
  // Step 1 — create run row (status=running)
  const runInsertPayload = buildReportRunInsert({ feed, processResult, sourceFiles });
  const { data: runData, error: runErr } = await db
    .from("moraware_report_runs")
    .insert(runInsertPayload)
    .select("id")
    .limit(1);
  if (runErr) throw runErr;
  const runId = runData?.[0]?.id;
  if (!runId) throw new Error("persistReportFeedRun: did not receive run id after insert");

  try {
    // Step 2 — column profile
    const profilePayload = buildColumnProfileInsert({ runId, feed, processResult });
    const { error: profileErr } = await db
      .from("moraware_report_column_profiles")
      .insert(profilePayload);
    if (profileErr) {
      const wrapped = new Error(formatSupabaseError(profileErr));
      wrapped.supabaseError = profileErr;
      throw wrapped;
    }

    // Step 3 — raw rows (batched)
    const rawRows = buildRawRowInserts({ runId, feed, processResult });
    await batchInsert(db, "moraware_report_raw_rows", rawRows, RAW_ROWS_BATCH_SIZE);

    // Step 4 — identity links (batched)
    const identityLinks = buildIdentityLinkInserts({ runId, feed, processResult });
    await batchInsert(db, "moraware_report_identity_links", identityLinks, IDENTITY_LINKS_BATCH_SIZE);

    // Step 5 — finalize run
    const finalUpdate = buildRunFinalUpdate({ runId, processResult });
    const { error: finalErr } = await db
      .from("moraware_report_runs")
      .update(finalUpdate)
      .eq("id", runId);
    if (finalErr) {
      const wrapped = new Error(formatSupabaseError(finalErr));
      wrapped.supabaseError = finalErr;
      throw wrapped;
    }

    return { runId, status: finalUpdate.status };
  } catch (err) {
    // Best-effort: mark run failed
    try {
      const errUpdate = buildRunFinalUpdate({ runId, processResult, error: err });
      await db.from("moraware_report_runs").update(errUpdate).eq("id", runId);
    } catch {
      // Non-fatal — already handling a throw
    }
    throw err;
  }
}
