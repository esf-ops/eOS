/**
 * Promote view 219 completed-install form facts from a persisted, API-mirror-enriched run.
 * Later successful run supersedes all prior active observations for the feed.
 * Never writes sales_ops_sf_attribution_facts. Never writes Moraware.
 */

import { sha256Hex } from "./hashUtils.js";
import { isSchemaDriftBlocking } from "./schemaDriftPolicy.js";
import {
  buildFormIdentityLookup,
  planCompletedInstallFormFacts
} from "./resolveCompletedInstallFormIdentity.js";
import { FORM_IDENTITY_MATCHED, JOB_IDENTITY_UNRESOLVED } from "./extractFirstInstall.js";

const PAGE = 1000;
const BATCH = 500;
export const COMPLETED_INSTALL_FORM_FACTS_TABLE = "moraware_prepared_completed_install_form_facts";

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

async function fetchAllPages(db, table, filters, select, pageSize = PAGE) {
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

export function observationKeyForFact(fact) {
  if (fact.source_form_id && fact.source_job_id) {
    return sha256Hex(`matched||${fact.organization_id}||${fact.report_feed_id}||${fact.source_job_id}||${fact.source_form_id}`);
  }
  if (fact.source_job_id) {
    return sha256Hex(
      `form_unresolved||${fact.organization_id}||${fact.report_feed_id}||${fact.source_job_id}||${String(fact.form_name_raw || "").toLowerCase()}`
    );
  }
  return sha256Hex(
    `job_unresolved||${fact.organization_id}||${fact.report_feed_id}||${(fact.source_row_hashes || []).join("|")}`
  );
}

export function toCompletedInstallInsertRow(fact, { promotedAt, sourceUpdatedAt }) {
  return {
    organization_id: fact.organization_id,
    report_feed_id: fact.report_feed_id,
    report_run_id: fact.report_run_id,
    source_job_id: fact.source_job_id,
    source_form_id: fact.source_form_id,
    source_account_id: fact.source_account_id,
    form_name_raw: fact.form_name_raw,
    form_identity_status: fact.form_identity_status,
    completed_install_status: fact.completed_install_status,
    completed_install_activity_type: fact.completed_install_activity_type,
    completed_install_date: fact.completed_install_date,
    sqft: fact.sqft,
    source_row_hashes: fact.source_row_hashes ?? [],
    source_updated_at: sourceUpdatedAt,
    observation_key: observationKeyForFact(fact),
    creditable: fact.creditable === true,
    is_active: true,
    promoted_at: promotedAt,
    superseded_at: null,
    superseded_by: null
  };
}

/**
 * Replace-all active facts for this feed with the incoming set.
 * Empty incoming is unsafe (would wipe prior observations).
 */
export function planCompletedInstallSupersede({ existingActiveFacts = [], incomingFacts = [], supersededAt = null }) {
  const now = supersededAt ? new Date(supersededAt).toISOString() : new Date().toISOString();
  const keys = incomingFacts.map((f) => f.observation_key);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) {
    return { safe: false, unsafeReasons: ["duplicate_observation_key"], duplicateKeys: [...new Set(dup)], steps: [] };
  }
  if (!incomingFacts.length) {
    return { safe: false, unsafeReasons: ["empty_incoming_would_wipe_active_facts"], steps: [] };
  }
  return {
    safe: true,
    unsafeReasons: [],
    deactivateCount: existingActiveFacts.length,
    insertCount: incomingFacts.length,
    existingActiveFacts,
    incomingFacts,
    supersededAt: now
  };
}

export async function promoteCompletedInstallFormFactsFromRun(db, { runId, organizationId, dryRun = true, now = null }) {
  const promotedAt = now ? new Date(now).toISOString() : new Date().toISOString();

  const { data: run, error: runErr } = await db
    .from("moraware_report_runs")
    .select("id, organization_id, report_feed_id, status, schema_drift, summary, observed_header_hash, finished_at, started_at")
    .eq("id", runId)
    .maybeSingle();
  if (runErr) throw toError(runErr);
  if (!run) return { ok: false, error: "run_not_found" };
  if (run.organization_id !== organizationId) return { ok: false, error: "organization_mismatch" };
  if (isSchemaDriftBlocking(run.schema_drift)) {
    return { ok: false, error: "schema_drift_blocks_promotion", schemaDrift: run.schema_drift };
  }

  const { data: feed, error: feedErr } = await db
    .from("moraware_report_feeds")
    .select("id, organization_id, report_type, moraware_view_id")
    .eq("id", run.report_feed_id)
    .maybeSingle();
  if (feedErr) throw toError(feedErr);
  if (!feed || feed.report_type !== "sales_worksheet_facts") {
    return { ok: false, error: "feed_not_sales_worksheet_facts" };
  }

  const rawRows = await fetchAllPages(
    db,
    "moraware_report_raw_rows",
    { organization_id: organizationId, report_run_id: runId },
    "id, row_hash, account_id, job_id, account_name, job_name, identity_status, raw_row"
  );

  const { data: latestWs, error: latestWsErr } = await db
    .from("sales_moraware_job_worksheet_facts")
    .select("import_group_id")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestWsErr) throw toError(latestWsErr);

  const worksheetFilters = { organization_id: organizationId };
  if (latestWs?.import_group_id) worksheetFilters.import_group_id = latestWs.import_group_id;

  const worksheetFacts = await fetchAllPages(
    db,
    "sales_moraware_job_worksheet_facts",
    worksheetFilters,
    "source_job_id, source_form_id, source_account_id, form_name_raw, import_group_id"
  );

  const { lookup, summary: formLookupSummary } = buildFormIdentityLookup(worksheetFacts);
  const planned = planCompletedInstallFormFacts({
    rawRows,
    formLookup: lookup,
    organizationId,
    reportFeedId: feed.id,
    reportRunId: runId,
    sourceUpdatedAt: run.finished_at || promotedAt
  });
  const incoming = planned.facts.map((f) =>
    toCompletedInstallInsertRow(f, { promotedAt, sourceUpdatedAt: run.finished_at || promotedAt })
  );

  const existing = await fetchAllPages(
    db,
    COMPLETED_INSTALL_FORM_FACTS_TABLE,
    { organization_id: organizationId, report_feed_id: feed.id, is_active: true },
    "id, observation_key, source_job_id, source_form_id"
  );

  const plan = planCompletedInstallSupersede({
    existingActiveFacts: existing,
    incomingFacts: incoming,
    supersededAt: promotedAt
  });

  const result = {
    ok: plan.safe,
    dryRun,
    applied: false,
    runId,
    organizationId,
    reportFeedId: feed.id,
    rawRowCount: rawRows.length,
    worksheetFactCount: worksheetFacts.length,
    formLookupSummary,
    plannedCounts: planned.counts,
    incomingCount: incoming.length,
    creditableCount: incoming.filter((r) => r.creditable).length,
    matchedCount: planned.counts.matched,
    formUnresolvedCount: planned.counts.formUnresolved,
    jobUnresolvedCount: planned.counts.jobUnresolved,
    deactivateCount: existing.length,
    error: plan.safe ? null : plan.unsafeReasons[0]
  };

  if (dryRun || !plan.safe) return result;

  const deactivatedIds = existing.map((r) => r.id);
  for (let i = 0; i < deactivatedIds.length; i += BATCH) {
    const ids = deactivatedIds.slice(i, i + BATCH);
    const { error } = await db
      .from(COMPLETED_INSTALL_FORM_FACTS_TABLE)
      .update({ is_active: false, superseded_at: promotedAt, updated_at: promotedAt })
      .in("id", ids)
      .eq("organization_id", organizationId);
    if (error) throw toError(error);
  }

  const inserted = [];
  try {
    for (let i = 0; i < incoming.length; i += BATCH) {
      const chunk = incoming.slice(i, i + BATCH);
      const { data, error } = await db
        .from(COMPLETED_INSTALL_FORM_FACTS_TABLE)
        .insert(chunk)
        .select("id, observation_key");
      if (error) throw toError(error);
      inserted.push(...(data || []));
    }
  } catch (err) {
    if (deactivatedIds.length) {
      for (let i = 0; i < deactivatedIds.length; i += BATCH) {
        const ids = deactivatedIds.slice(i, i + BATCH);
        await db
          .from(COMPLETED_INSTALL_FORM_FACTS_TABLE)
          .update({ is_active: true, superseded_at: null, updated_at: promotedAt })
          .in("id", ids)
          .eq("organization_id", organizationId);
      }
    }
    throw err;
  }

  const insertedByKey = new Map(inserted.map((r) => [r.observation_key, r.id]));
  for (const old of existing) {
    const successor = insertedByKey.get(old.observation_key);
    if (!successor) continue;
    const { error } = await db
      .from(COMPLETED_INSTALL_FORM_FACTS_TABLE)
      .update({ superseded_by: successor, updated_at: promotedAt })
      .eq("id", old.id)
      .eq("organization_id", organizationId);
    if (error) {
      // Non-fatal lineage backfill
    }
  }

  const nextSummary = {
    ...(run.summary && typeof run.summary === "object" ? run.summary : {}),
    completedInstallFormFacts: {
      incoming: incoming.length,
      creditable: result.creditableCount,
      matched: planned.counts.matched,
      formUnresolved: planned.counts.formUnresolved,
      jobUnresolved: planned.counts.jobUnresolved,
      replacedActive: existing.length
    }
  };
  await db
    .from("moraware_report_runs")
    .update({
      status: "promoted",
      summary: nextSummary,
      observed_contract_version:
        run.schema_drift?.contractVersion || run.summary?.contractVersion || null,
      updated_at: promotedAt
    })
    .eq("id", runId);

  return { ...result, applied: true, insertedCount: inserted.length };
}

export { FORM_IDENTITY_MATCHED, JOB_IDENTITY_UNRESOLVED };
