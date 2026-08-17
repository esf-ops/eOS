/**
 * Moraware Job Worksheet prepared-fact builder + dry-run / fail-closed live writer.
 *
 * LIVE writes require explicit liveWrite:true AND all control gates.
 * Default / dry-run paths never insert, update, or delete.
 */

import {
  resolveCurrentMorawarePopulation,
  filterCurrentMorawareJobSet,
  planPreparedFactsRebuild,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT
} from "./morawareCurrentPopulation.mjs";
import {
  extractMorawareJobWorksheetScopeFacts,
  extractCurrentMorawareJobWorksheetScopeFacts,
  toPreparedWorksheetFactRows,
  sumWorksheetScopeSqft,
  aggregateWorksheetColors,
  aggregateWorksheetRooms,
  aggregateWorksheetEdges,
  aggregateWorksheetThicknesses,
  aggregateWorksheetSinks,
  assertNoForbiddenWorksheetScopeKeys,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
  VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS,
  VERIFIED_BROIHAHN_2026_JOB_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT
} from "./morawareJobWorksheetScope.mjs";

export const WORKSHEET_FACTS_TABLE = "sales_moraware_job_worksheet_facts";
export const WORKSHEET_FACTS_UPSERT_ON_CONFLICT =
  "organization_id,import_group_id,source_job_id,source_form_id";

/** Columns the writer may send (matches applied table; id/created_at left to DB defaults). */
export const WORKSHEET_FACTS_WRITER_COLUMNS = Object.freeze([
  "organization_id",
  "import_group_id",
  "sync_run_id",
  "source_account_id",
  "source_job_id",
  "source_form_id",
  "form_name_raw",
  "room_raw",
  "color_raw",
  "color_is_placeholder",
  "sqft",
  "edge_raw",
  "thickness_raw",
  "backsplash_type_raw",
  "backsplash_height_raw",
  "sink_type_raw",
  "faucet_type_raw",
  "stove_type_raw",
  "electrical_cutouts_raw",
  "overhang_raw",
  "braces_raw",
  "dry_treat_raw",
  "stone_care_kit_raw",
  "updated_at"
]);

const FORBIDDEN_ROW_KEYS = Object.freeze([
  "material_family",
  "material_type",
  "upgrade",
  "upgrade_score",
  "upgrade_options",
  "normalized_backsplash_type",
  "backsplash_type_normalized",
  "shop_comments",
  "raw_payload",
  "rawPayload"
]);

const COVERAGE_FIELDS = Object.freeze([
  ["Color", "color_raw"],
  ["Room", "room_raw"],
  ["Edge", "edge_raw"],
  ["Thickness", "thickness_raw"],
  ["Sink Type", "sink_type_raw"],
  ["Faucet Type", "faucet_type_raw"],
  ["Stove Type", "stove_type_raw"],
  ["Electrical Cut-outs", "electrical_cutouts_raw"],
  ["Overhang", "overhang_raw"],
  ["Braces", "braces_raw"],
  ["Dry Treat", "dry_treat_raw"],
  ["Stone Care Kit", "stone_care_kit_raw"],
  ["Back Splash Type", "backsplash_type_raw"],
  ["Back Splash Height", "backsplash_height_raw"]
]);

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function hasNonBlank(v) {
  return v != null && String(v).trim() !== "";
}

function preparedKey(row) {
  return [
    String(row.organization_id ?? ""),
    String(row.import_group_id ?? ""),
    String(row.source_job_id ?? ""),
    String(row.source_form_id ?? "")
  ].join("|");
}

/**
 * Load CURRENT_MORAWARE_JOB_SET brain rows (includes raw_payload). Read-only.
 */
export async function loadCurrentMorawareJobsForWorksheetFacts(
  supabase,
  organizationId,
  population,
  { pageSize = 100 } = {}
) {
  const watermark = population?.full_census_started_at;
  if (!watermark) {
    return { jobs: [], query_page_count: 0, error: "full_census_started_at missing" };
  }
  const jobs = [];
  let from = 0;
  let queryPageCount = 0;
  while (true) {
    const { data, error } = await supabase
      .from("brain_moraware_jobs")
      .select(
        "id,organization_id,sync_run_id,source_job_id,source_account_id,last_seen_at,raw_payload"
      )
      .eq("organization_id", organizationId)
      .gte("last_seen_at", watermark)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    queryPageCount += 1;
    if (error) return { jobs: [], query_page_count: queryPageCount, error: error.message };
    if (!data?.length) break;
    jobs.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { jobs, query_page_count: queryPageCount, error: null };
}

/**
 * Dedupe current jobs by source_job_id (latest last_seen_at wins), extract facts, stamp epoch.
 */
export function buildMorawareJobWorksheetPreparedFacts({
  organizationId,
  population,
  jobs,
  syncRunId = null,
  updatedAt = null
} = {}) {
  const org = String(organizationId || "").trim();
  const epoch = String(population?.full_census_import_group_id ?? "").trim();
  const available = Boolean(population?.available && epoch && population?.full_census_started_at);

  if (!org) {
    return {
      ok: false,
      status: "organization_required",
      rows: [],
      facts: [],
      import_group_id: null,
      current_job_count: 0
    };
  }
  if (!available) {
    return {
      ok: false,
      status: "full_census_not_ready",
      rows: [],
      facts: [],
      import_group_id: epoch || null,
      current_job_count: 0,
      population
    };
  }

  const plan = planPreparedFactsRebuild({ jobs, population });
  const currentJobs = plan.jobs;
  const facts = extractCurrentMorawareJobWorksheetScopeFacts(currentJobs, population, {
    organizationId: org
  });

  // Prefer per-job sync_run_id from the winning current job row when available.
  const syncByJob = new Map();
  for (const job of currentJobs) {
    const id = String(job?.source_job_id ?? "").trim();
    if (!id) continue;
    syncByJob.set(id, job.sync_run_id ?? null);
  }
  const factsWithSync = facts.map((f) => ({
    ...f,
    sync_run_id: syncRunId ?? syncByJob.get(String(f.source_job_id)) ?? null
  }));

  const rows = toPreparedWorksheetFactRows(factsWithSync, {
    organizationId: org,
    importGroupId: epoch,
    syncRunId: null,
    updatedAt
  });

  return {
    ok: true,
    status: "built",
    rows,
    facts: factsWithSync,
    import_group_id: epoch,
    current_job_count: currentJobs.length,
    worksheet_fact_count: rows.length,
    plan,
    population
  };
}

export function analyzePreparedWorksheetFactKeys(rows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows || []) {
    const key = preparedKey(row);
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.set(key, row);
    }
  }
  return {
    unique_key_count: seen.size,
    duplicate_key_count: duplicates.length,
    duplicate_keys_sample: duplicates.slice(0, 20)
  };
}

export function assertPreparedWorksheetRowsMatchTableContract(rows) {
  for (const row of rows || []) {
    assertNoForbiddenWorksheetScopeKeys(row, "prepared_row");
    for (const bad of FORBIDDEN_ROW_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, bad)) {
        throw new Error(`Prepared row must not include ${bad}`);
      }
    }
    for (const col of WORKSHEET_FACTS_WRITER_COLUMNS) {
      if (!(col in row)) {
        throw new Error(`Prepared row missing column ${col}`);
      }
    }
    for (const key of Object.keys(row)) {
      if (!WORKSHEET_FACTS_WRITER_COLUMNS.includes(key)) {
        throw new Error(`Prepared row has unexpected column ${key}`);
      }
    }
    if (typeof row.organization_id !== "string" || !row.organization_id) {
      throw new Error("organization_id must be non-empty string uuid");
    }
    if (typeof row.import_group_id !== "string" || !row.import_group_id) {
      throw new Error("import_group_id must be non-empty text");
    }
    if (typeof row.source_job_id !== "string" || !row.source_job_id) {
      throw new Error("source_job_id must be non-empty text");
    }
    if (typeof row.source_form_id !== "string" || !row.source_form_id) {
      throw new Error("source_form_id must be non-empty text");
    }
    if (typeof row.color_is_placeholder !== "boolean") {
      throw new Error("color_is_placeholder must be boolean");
    }
    if (row.sqft != null && !Number.isFinite(Number(row.sqft))) {
      throw new Error("sqft must be numeric or null");
    }
  }
  return true;
}

export function buildFieldCoverageReport(facts, currentJobCount) {
  const jobsWithWorksheet = new Set((facts || []).map((f) => String(f.source_job_id)).filter(Boolean));
  const coverage = {};
  for (const [label, field] of COVERAGE_FIELDS) {
    const jobIds = new Set();
    let worksheetCount = 0;
    for (const f of facts || []) {
      if (!hasNonBlank(f[field])) continue;
      worksheetCount += 1;
      jobIds.add(String(f.source_job_id));
    }
    coverage[label] = {
      field,
      worksheet_count: worksheetCount,
      job_count: jobIds.size,
      jobs_without_fact: Math.max(0, currentJobCount - jobIds.size)
    };
  }
  return {
    jobs_with_worksheet: jobsWithWorksheet.size,
    jobs_without_worksheet: Math.max(0, currentJobCount - jobsWithWorksheet.size),
    fields: coverage
  };
}

export function buildPlaceholderColorSummary(facts) {
  const placeholders = (facts || []).filter((f) => f.color_is_placeholder === true && hasNonBlank(f.color_raw));
  const byRaw = new Map();
  let sqft = 0;
  for (const f of placeholders) {
    const key = String(f.color_raw);
    if (!byRaw.has(key)) byRaw.set(key, { color_raw: key, worksheet_count: 0, sqft: 0 });
    const row = byRaw.get(key);
    row.worksheet_count += 1;
    if (f.sqft != null && Number.isFinite(Number(f.sqft))) {
      row.sqft += Number(f.sqft);
      sqft += Number(f.sqft);
    }
  }
  const top = [...byRaw.values()]
    .map((r) => ({ ...r, sqft: round1(r.sqft) }))
    .sort((a, b) => b.worksheet_count - a.worksheet_count || a.color_raw.localeCompare(b.color_raw));
  return {
    placeholder_worksheet_count: placeholders.length,
    placeholder_sqft: round1(sqft),
    top_placeholder_raw_values: top.slice(0, 20)
  };
}

export function buildBroihahnWorksheetValidation(facts, jobs) {
  const ids = new Set(VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS.map(String));
  const broJobIds = new Set();
  for (const j of jobs || []) {
    if (!ids.has(String(j.source_account_id ?? "").trim())) continue;
    const id = String(j.source_job_id ?? "").trim();
    if (id) broJobIds.add(id);
  }
  const broFacts = (facts || []).filter((f) => ids.has(String(f.source_account_id ?? "").trim()));
  const formIds = broFacts.map((f) => `${f.source_job_id}|${f.source_form_id}`);
  const formSet = new Set(formIds);
  return {
    source_account_ids: [...VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS],
    jobs: broJobIds.size,
    worksheet_facts: broFacts.length,
    sqft: sumWorksheetScopeSqft(broFacts),
    duplicate_source_form_id_within_job_grain: formIds.length - formSet.size,
    expected: {
      jobs: VERIFIED_BROIHAHN_2026_JOB_COUNT,
      worksheet_facts: VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT,
      sqft: VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT
    },
    colors: aggregateWorksheetColors(broFacts, { includePlaceholders: true }),
    rooms_sample: aggregateWorksheetRooms(broFacts).slice(0, 15),
    edges_sample: aggregateWorksheetEdges(broFacts).slice(0, 10),
    thicknesses_sample: aggregateWorksheetThicknesses(broFacts),
    sinks_sample: aggregateWorksheetSinks(broFacts).slice(0, 10),
    match:
      broJobIds.size === VERIFIED_BROIHAHN_2026_JOB_COUNT &&
      broFacts.length === VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT &&
      sumWorksheetScopeSqft(broFacts) === VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT &&
      formIds.length === formSet.size
  };
}

/**
 * Control gates for a future live write. Fail closed.
 */
export function evaluateWorksheetFactsLiveWriteGates(summary) {
  const failures = [];
  if (!summary?.population_available) failures.push("population_unavailable");
  if (!summary?.import_group_id) failures.push("epoch_missing");
  if (summary?.current_job_count !== VERIFIED_FOUNDATION_2026_JOB_COUNT) {
    failures.push(
      `job_count_mismatch: got ${summary?.current_job_count}, expected ${VERIFIED_FOUNDATION_2026_JOB_COUNT}`
    );
  }
  if (summary?.worksheet_fact_count !== VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT) {
    failures.push(
      `worksheet_count_mismatch: got ${summary?.worksheet_fact_count}, expected ${VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT}`
    );
  }
  if (summary?.unique_key_count !== VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT) {
    failures.push(
      `unique_key_mismatch: got ${summary?.unique_key_count}, expected ${VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT}`
    );
  }
  if ((summary?.duplicate_key_count ?? 1) !== 0) {
    failures.push(`duplicate_keys: ${summary?.duplicate_key_count}`);
  }
  if (summary?.sqft !== VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT) {
    failures.push(`sqft_mismatch: got ${summary?.sqft}, expected ${VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT}`);
  }
  if (summary?.jobs_without_worksheet !== VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET) {
    failures.push(
      `jobs_without_worksheet_mismatch: got ${summary?.jobs_without_worksheet}, expected ${VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET}`
    );
  }
  if (summary?.broihahn && !summary.broihahn.match) {
    failures.push("broihahn_control_mismatch");
  }
  return {
    ok: failures.length === 0,
    failures,
    can_live_write: failures.length === 0
  };
}

/**
 * Future live writer — refuse unless liveWrite:true and gates pass.
 * Dry-run / default never mutates.
 */
export async function writeMorawareJobWorksheetPreparedFacts(supabase, buildResult, options = {}) {
  const liveWrite = options.liveWrite === true;
  const writes = { inserts: 0, updates: 0, deletes: 0, upserts: 0 };

  if (!liveWrite) {
    return {
      ok: false,
      status: "live_write_disabled",
      writes,
      note: "Pass liveWrite:true only after dry-run SAFE_TO_POPULATE approval."
    };
  }

  const summary = options.summary;
  const gates = evaluateWorksheetFactsLiveWriteGates(summary);
  if (!gates.ok) {
    return {
      ok: false,
      status: "gates_failed",
      writes,
      gates
    };
  }

  // Intentionally not implemented for this task — refuse even with liveWrite until
  // a follow-up explicitly enables population.
  if (options.allowLivePopulation !== true) {
    return {
      ok: false,
      status: "live_population_not_enabled",
      writes,
      gates,
      note: "Live population is blocked in this build. Dry-run only."
    };
  }

  const rows = buildResult?.rows || [];
  const chunkSize = options.chunkSize || 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(WORKSHEET_FACTS_TABLE).upsert(chunk, {
      onConflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT
    });
    if (error) throw error;
    writes.upserts += chunk.length;
  }
  return { ok: true, status: "upserted", writes, gates };
}

/**
 * Plan job-scoped worksheet removals for an authoritative refreshed job payload.
 * Does not execute deletes. Incremental batch absence must not call this.
 */
export function planWorksheetFactRemovalsForAuthoritativeJob({
  organizationId,
  importGroupId,
  sourceJobId,
  existingFormIds = [],
  currentFormIds = []
} = {}) {
  const current = new Set((currentFormIds || []).map(String));
  const remove = (existingFormIds || []).map(String).filter((id) => id && !current.has(id));
  return {
    organization_id: organizationId,
    import_group_id: importGroupId,
    source_job_id: sourceJobId,
    remove_source_form_ids: remove,
    note: "Only when job forms[] payload is complete/authoritative. Never for jobs absent from an incremental batch."
  };
}

/**
 * Full dry-run: resolve population, load current jobs, build rows, reconcile, zero writes.
 */
export async function dryRunMorawareJobWorksheetPreparedFacts(supabase, organizationId, options = {}) {
  const startedAt = Date.now();
  const writes = { inserts: 0, updates: 0, deletes: 0, upserts: 0 };
  const org = String(organizationId || "").trim();

  const population = await resolveCurrentMorawarePopulation(supabase, org);
  if (!population?.available) {
    return {
      ok: false,
      verdict: "FIXES_REQUIRED",
      status: "full_census_not_ready",
      writes,
      population,
      compute_ms: Date.now() - startedAt
    };
  }

  const loaded = await loadCurrentMorawareJobsForWorksheetFacts(supabase, org, population, {
    pageSize: options.pageSize || 100
  });
  if (loaded.error) {
    return {
      ok: false,
      verdict: "FIXES_REQUIRED",
      status: "load_failed",
      error: loaded.error,
      writes,
      population,
      compute_ms: Date.now() - startedAt
    };
  }

  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: org,
    population,
    jobs: loaded.jobs,
    updatedAt: options.updatedAt || new Date().toISOString()
  });

  if (!built.ok) {
    return {
      ok: false,
      verdict: "FIXES_REQUIRED",
      status: built.status,
      writes,
      population,
      compute_ms: Date.now() - startedAt
    };
  }

  assertPreparedWorksheetRowsMatchTableContract(built.rows);
  const keyStats = analyzePreparedWorksheetFactKeys(built.rows);
  const coverage = buildFieldCoverageReport(built.facts, built.current_job_count);
  const placeholders = buildPlaceholderColorSummary(built.facts);
  const broihahn = buildBroihahnWorksheetValidation(built.facts, built.plan.jobs);
  const sqft = sumWorksheetScopeSqft(built.facts);

  // Read-only production table count (must remain 0 for this task).
  let productionRowCount = null;
  let productionCountError = null;
  if (options.checkProductionTable !== false) {
    const { count, error } = await supabase
      .from(WORKSHEET_FACTS_TABLE)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org);
    if (error) productionCountError = error.message;
    else productionRowCount = count ?? 0;
  }

  const summary = {
    population_available: true,
    import_group_id: built.import_group_id,
    full_census_started_at: population.full_census_started_at,
    current_job_count: built.current_job_count,
    worksheet_fact_count: built.worksheet_fact_count,
    unique_key_count: keyStats.unique_key_count,
    duplicate_key_count: keyStats.duplicate_key_count,
    sqft,
    jobs_without_worksheet: coverage.jobs_without_worksheet,
    jobs_with_worksheet: coverage.jobs_with_worksheet,
    broihahn,
    query_page_count: loaded.query_page_count,
    production_table_row_count: productionRowCount,
    production_count_error: productionCountError
  };

  const expected = {
    current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
    worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    duplicate_key_count: 0,
    sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET
  };

  const mismatches = [];
  for (const [k, want] of Object.entries(expected)) {
    if (summary[k] !== want) mismatches.push({ field: k, expected: want, actual: summary[k] });
  }
  if (!broihahn.match) {
    mismatches.push({
      field: "broihahn",
      expected: broihahn.expected,
      actual: {
        jobs: broihahn.jobs,
        worksheet_facts: broihahn.worksheet_facts,
        sqft: broihahn.sqft,
        duplicate_source_form_id_within_job_grain: broihahn.duplicate_source_form_id_within_job_grain
      }
    });
  }

  const gates = evaluateWorksheetFactsLiveWriteGates(summary);
  const verdict = mismatches.length === 0 && gates.ok ? "SAFE_TO_POPULATE" : "FIXES_REQUIRED";

  // Explicit dry-run: never call upsert/delete.
  const writeAttempt = await writeMorawareJobWorksheetPreparedFacts(supabase, built, {
    liveWrite: false,
    summary
  });

  return {
    ok: verdict === "SAFE_TO_POPULATE",
    verdict,
    status: "dry_run_complete",
    writes: {
      ...writes,
      ...writeAttempt.writes,
      confirmed_zero:
        writes.inserts + writes.updates + writes.deletes + writes.upserts === 0 &&
        writeAttempt.writes.inserts +
          writeAttempt.writes.updates +
          writeAttempt.writes.deletes +
          writeAttempt.writes.upserts ===
          0
    },
    expected,
    summary,
    mismatches,
    gates,
    coverage,
    placeholders,
    broihahn,
    upsert_on_conflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
    table: WORKSHEET_FACTS_TABLE,
    writer_columns: WORKSHEET_FACTS_WRITER_COLUMNS,
    sample_rows: built.rows.slice(0, 25),
    rows: options.includeAllRows ? built.rows : undefined,
    facts: options.includeAllFacts ? built.facts : undefined,
    compute_ms: Date.now() - startedAt,
    write_attempt_status: writeAttempt.status
  };
}

export {
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
  filterCurrentMorawareJobSet,
  extractMorawareJobWorksheetScopeFacts
};
