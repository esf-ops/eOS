/**
 * Moraware Job Worksheet prepared-fact builder + dry-run / fail-closed live writer.
 *
 * LIVE writes require:
 *   liveWrite:true + allowLivePopulation:true + active moraware_population ownership
 *
 * Dry-run never acquires a lock and never writes.
 *
 * Outer-pipeline contract:
 *   pass outerOwnerToken (already holds moraware_population).
 *   This module verifies/renews ownership and does NOT release the outer lock.
 */

import {
  resolveCurrentMorawarePopulation,
  filterCurrentMorawareJobSet,
  planPreparedFactsRebuild,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT
} from "./morawareCurrentPopulation.mjs";
import {
  acquireMorawarePopulationLock,
  assertMorawarePopulationLockOwner,
  createMorawarePopulationLockOwnerToken,
  guardLiveMorawarePopulationWrite,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_NAME,
  releaseMorawarePopulationLock,
  renewMorawarePopulationLock
} from "./morawarePopulationLock.mjs";
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
  VERIFIED_FOUNDATION_2026_JOBS_WITH_WORKSHEET,
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
 * Live upsert — refuse unless liveWrite + allowLivePopulation + valid lock owner.
 * Renews ownership before each chunk; fails closed if lease is lost.
 */
export async function writeMorawareJobWorksheetPreparedFacts(supabase, buildResult, options = {}) {
  const liveWrite = options.liveWrite === true;
  const writes = { inserts: 0, updates: 0, deletes: 0, upserts: 0 };
  const renewals = [];

  if (!liveWrite) {
    return {
      ok: false,
      status: "live_write_disabled",
      writes,
      renewals,
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
      renewals,
      gates
    };
  }

  if (options.allowLivePopulation !== true) {
    return {
      ok: false,
      status: "live_population_not_enabled",
      writes,
      renewals,
      gates,
      note: "Pass allowLivePopulation:true for governed live population."
    };
  }

  const ownerToken = String(options.ownerToken ?? "").trim();
  if (!ownerToken) {
    return {
      ok: false,
      status: "population_lock_required",
      writes,
      renewals,
      gates,
      code: "population_lock_required",
      error: "Live worksheet fact writes require an active moraware_population owner token."
    };
  }

  const initialGuard = await guardLiveMorawarePopulationWrite(supabase, { ownerToken });
  if (!initialGuard.ok) {
    return {
      ok: false,
      status: initialGuard.code || "population_lock_denied",
      writes,
      renewals,
      gates,
      code: initialGuard.code,
      error: initialGuard.error
    };
  }
  renewals.push({ at: "pre_write", renewed: Boolean(initialGuard.lock) });

  const rows = buildResult?.rows || [];
  const chunkSize = options.chunkSize || 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    if (typeof options.ownershipLostFlag === "function" && options.ownershipLostFlag()) {
      return {
        ok: false,
        status: "population_lock_lost",
        writes,
        renewals,
        gates,
        code: "population_lock_lost",
        error: "moraware_population ownership was lost during write.",
        failed_batch_offset: i
      };
    }
    const assertRenew = await assertMorawarePopulationLockOwner(supabase, {
      ownerToken,
      renew: true
    });
    if (!assertRenew.ok) {
      return {
        ok: false,
        status: assertRenew.code || "population_lock_denied",
        writes,
        renewals,
        gates,
        code: assertRenew.code,
        error: assertRenew.error,
        failed_batch_offset: i
      };
    }
    renewals.push({ at: `chunk_${i}`, renewed: Boolean(assertRenew.renewed) });

    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(WORKSHEET_FACTS_TABLE).upsert(chunk, {
      onConflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT
    });
    if (error) {
      return {
        ok: false,
        status: "upsert_failed",
        writes,
        renewals,
        gates,
        error: error.message || String(error),
        failed_batch_offset: i,
        failed_batch_size: chunk.length
      };
    }
    writes.upserts += chunk.length;
  }
  return { ok: true, status: "upserted", writes, renewals, gates, owner_token: ownerToken };
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
 * In-process heartbeat using the same 15m interval / 4h lease semantics as the
 * HTTP heartbeat helper — renews via direct DB renew (CLI / Brain process).
 */
export function startWorksheetFactsPopulationLockHeartbeat(
  db,
  { ownerToken, intervalMs = MORAWARE_POPULATION_LOCK_HEARTBEAT_MS, onFailure } = {}
) {
  const token = String(ownerToken ?? "").trim();
  if (!token) throw new Error("startWorksheetFactsPopulationLockHeartbeat: ownerToken required");
  let failed = false;
  const tick = async () => {
    try {
      const renewed = await renewMorawarePopulationLock(db, { ownerToken: token });
      if (!renewed.renewed) {
        failed = true;
        onFailure?.(renewed);
      }
    } catch (e) {
      failed = true;
      onFailure?.({ renewed: false, reason: "error", error: String(e?.message || e) });
    }
  };
  const id = setInterval(() => {
    tick();
  }, intervalMs);
  if (typeof id.unref === "function") id.unref();
  return {
    stop: () => clearInterval(id),
    hasFailed: () => failed,
    tickNow: tick
  };
}

function buildExpectedControls() {
  return {
    current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
    worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    duplicate_key_count: 0,
    sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET
  };
}

/**
 * Resolve population → load CURRENT jobs → extract → reconcile (no lock, no write).
 * Used by dry-run. Live populate calls the locked variant instead.
 */
export async function buildAndReconcileMorawareJobWorksheetPreparedFacts(
  supabase,
  organizationId,
  options = {}
) {
  const org = String(organizationId || "").trim();
  const population = await resolveCurrentMorawarePopulation(supabase, org);
  if (!population?.available) {
    return {
      ok: false,
      status: "full_census_not_ready",
      population,
      built: null,
      summary: null,
      mismatches: [],
      gates: { ok: false, failures: ["population_unavailable"] }
    };
  }

  const loaded = await loadCurrentMorawareJobsForWorksheetFacts(supabase, org, population, {
    pageSize: options.pageSize || 100
  });
  if (loaded.error) {
    return {
      ok: false,
      status: "load_failed",
      error: loaded.error,
      population,
      built: null,
      summary: null,
      mismatches: [],
      gates: { ok: false, failures: ["load_failed"] }
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
      status: built.status,
      population,
      built,
      summary: null,
      mismatches: [],
      gates: { ok: false, failures: [built.status] }
    };
  }

  assertPreparedWorksheetRowsMatchTableContract(built.rows);
  const keyStats = analyzePreparedWorksheetFactKeys(built.rows);
  const coverage = buildFieldCoverageReport(built.facts, built.current_job_count);
  const placeholders = buildPlaceholderColorSummary(built.facts);
  const broihahn = buildBroihahnWorksheetValidation(built.facts, built.plan.jobs);
  const sqft = sumWorksheetScopeSqft(built.facts);

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

  const expected = buildExpectedControls();
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
  return {
    ok: mismatches.length === 0 && gates.ok,
    status: "reconciled",
    population,
    built,
    summary,
    expected,
    mismatches,
    gates,
    coverage,
    placeholders,
    broihahn,
    loaded
  };
}

/**
 * Full dry-run: resolve population, load current jobs, build rows, reconcile, zero writes.
 * Does NOT acquire moraware_population.
 */
export async function dryRunMorawareJobWorksheetPreparedFacts(supabase, organizationId, options = {}) {
  const startedAt = Date.now();
  const writes = { inserts: 0, updates: 0, deletes: 0, upserts: 0 };

  const reconciled = await buildAndReconcileMorawareJobWorksheetPreparedFacts(supabase, organizationId, options);
  if (!reconciled.ok && reconciled.status !== "reconciled") {
    return {
      ok: false,
      verdict: "FIXES_REQUIRED",
      status: reconciled.status,
      writes,
      population: reconciled.population,
      error: reconciled.error,
      compute_ms: Date.now() - startedAt
    };
  }

  const verdict =
    reconciled.mismatches.length === 0 && reconciled.gates.ok ? "SAFE_TO_POPULATE" : "FIXES_REQUIRED";

  const writeAttempt = await writeMorawareJobWorksheetPreparedFacts(supabase, reconciled.built, {
    liveWrite: false,
    summary: reconciled.summary
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
    expected: reconciled.expected,
    summary: reconciled.summary,
    mismatches: reconciled.mismatches,
    gates: reconciled.gates,
    coverage: reconciled.coverage,
    placeholders: reconciled.placeholders,
    broihahn: reconciled.broihahn,
    upsert_on_conflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
    table: WORKSHEET_FACTS_TABLE,
    writer_columns: WORKSHEET_FACTS_WRITER_COLUMNS,
    sample_rows: (reconciled.built?.rows || []).slice(0, 25),
    rows: options.includeAllRows ? reconciled.built?.rows : undefined,
    facts: options.includeAllFacts ? reconciled.built?.facts : undefined,
    compute_ms: Date.now() - startedAt,
    write_attempt_status: writeAttempt.status,
    lock: { required: false, acquired: false, note: "dry-run does not use moraware_population" }
  };
}

/**
 * Independent post-write verification against sales_moraware_job_worksheet_facts.
 */
export async function verifyPersistedWorksheetFacts(supabase, organizationId, { importGroupId } = {}) {
  const org = String(organizationId || "").trim();
  const epoch = String(importGroupId || "").trim();
  const { count, error } = await supabase
    .from(WORKSHEET_FACTS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("import_group_id", epoch);
  if (error) return { ok: false, error: error.message };

  // Page rows for distinct-key / sqft / broihahn checks (10k is fine).
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error: pageErr } = await supabase
      .from(WORKSHEET_FACTS_TABLE)
      .select(
        "organization_id,import_group_id,source_job_id,source_form_id,source_account_id,sqft,color_raw,color_is_placeholder"
      )
      .eq("organization_id", org)
      .eq("import_group_id", epoch)
      .order("source_job_id", { ascending: true })
      .order("source_form_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (pageErr) return { ok: false, error: pageErr.message };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const keys = analyzePreparedWorksheetFactKeys(rows);
  const jobIds = new Set(rows.map((r) => String(r.source_job_id)).filter(Boolean));
  const broihahnIds = new Set(VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS.map(String));
  const broRows = rows.filter((r) => broihahnIds.has(String(r.source_account_id ?? "").trim()));
  const broJobs = new Set(broRows.map((r) => String(r.source_job_id)));
  const sqft = sumWorksheetScopeSqft(rows);
  const unexpectedEpoch = rows.filter((r) => String(r.import_group_id) !== epoch).length;
  const placeholders = buildPlaceholderColorSummary(rows);

  return {
    ok:
      (count ?? rows.length) === VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT &&
      keys.unique_key_count === VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT &&
      keys.duplicate_key_count === 0 &&
      sqft === VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT &&
      unexpectedEpoch === 0 &&
      jobIds.size === VERIFIED_FOUNDATION_2026_JOBS_WITH_WORKSHEET &&
      broRows.length === VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT &&
      broJobs.size === VERIFIED_BROIHAHN_2026_JOB_COUNT &&
      sumWorksheetScopeSqft(broRows) === VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT,
    row_count: count ?? rows.length,
    unique_key_count: keys.unique_key_count,
    duplicate_key_count: keys.duplicate_key_count,
    sqft,
    jobs_with_facts: jobIds.size,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOB_COUNT - jobIds.size,
    unexpected_epoch_rows: unexpectedEpoch,
    broihahn: {
      rows: broRows.length,
      jobs: broJobs.size,
      sqft: sumWorksheetScopeSqft(broRows)
    },
    placeholders
  };
}

/**
 * Governed live population.
 *
 * Standalone (default):
 *   acquire moraware_population → heartbeat → resolve/load/build/gates → upsert → verify → release
 *
 * Outer pipeline:
 *   pass outerOwnerToken (already owns lock). Verifies/renews; does NOT acquire or release.
 *
 * @param {object} options
 * @param {boolean} options.liveWrite
 * @param {boolean} options.allowLivePopulation
 * @param {string} [options.outerOwnerToken] — Mode B: outer FULL/INCREMENTAL owner
 * @param {string} [options.lockedBy]
 */
export async function populateMorawareJobWorksheetPreparedFacts(supabase, organizationId, options = {}) {
  const startedAt = Date.now();
  const org = String(organizationId || "").trim();
  const liveWrite = options.liveWrite === true;
  const allowLivePopulation = options.allowLivePopulation === true;
  const outerOwnerToken = String(options.outerOwnerToken ?? "").trim();
  const eventLog = [];

  if (!liveWrite || !allowLivePopulation) {
    return {
      ok: false,
      status: "live_population_not_enabled",
      writes: { inserts: 0, updates: 0, deletes: 0, upserts: 0 },
      compute_ms: Date.now() - startedAt,
      note: "Require liveWrite:true and allowLivePopulation:true."
    };
  }

  let ownerToken = outerOwnerToken;
  let acquiredStandalone = false;
  let heartbeat = null;
  let ownershipLost = false;
  let result = null;

  try {
    if (outerOwnerToken) {
      eventLog.push({ step: "outer_owner_assert_before_source_load" });
      const guard = await guardLiveMorawarePopulationWrite(supabase, { ownerToken: outerOwnerToken });
      if (!guard.ok) {
        result = {
          ok: false,
          status: guard.code || "population_lock_denied",
          code: guard.code,
          error: guard.error,
          lock_mode: "outer",
          event_log: eventLog,
          writes: { inserts: 0, updates: 0, deletes: 0, upserts: 0 },
          compute_ms: Date.now() - startedAt
        };
        return result;
      }
      ownerToken = outerOwnerToken;
      eventLog.push({ step: "outer_owner_verified", lock_name: MORAWARE_POPULATION_LOCK_NAME });
    } else {
      eventLog.push({ step: "standalone_acquire_before_source_load" });
      ownerToken = createMorawarePopulationLockOwnerToken();
      const acq = await acquireMorawarePopulationLock(supabase, {
        ownerToken,
        lockedBy: options.lockedBy || "worksheet-facts-populate",
        ttlMs: options.ttlMs || MORAWARE_POPULATION_LOCK_LEASE_MS,
        metadata: {
          purpose: "worksheet_prepared_facts_populate",
          organization_id: org
        }
      });
      if (!acq.acquired) {
        result = {
          ok: false,
          status: "population_lock_busy",
          reason: acq.reason || "locked",
          lock: acq.lock || null,
          lock_mode: "standalone",
          event_log: eventLog,
          writes: { inserts: 0, updates: 0, deletes: 0, upserts: 0 },
          compute_ms: Date.now() - startedAt
        };
        return result;
      }
      acquiredStandalone = true;
      eventLog.push({
        step: "standalone_acquired",
        lock_name: MORAWARE_POPULATION_LOCK_NAME,
        already_owned: Boolean(acq.already_owned),
        recovered_stale: Boolean(acq.recovered_stale)
      });
    }

    heartbeat = startWorksheetFactsPopulationLockHeartbeat(supabase, {
      ownerToken,
      intervalMs: options.heartbeatMs || MORAWARE_POPULATION_LOCK_HEARTBEAT_MS,
      onFailure: (detail) => {
        ownershipLost = true;
        eventLog.push({ step: "heartbeat_failed", detail });
      }
    });

    // CRITICAL: CURRENT population resolve + brain load happen AFTER lock ownership.
    eventLog.push({ step: "resolve_and_build_after_lock" });
    const reconciled = await buildAndReconcileMorawareJobWorksheetPreparedFacts(supabase, org, {
      pageSize: options.pageSize || 100,
      checkProductionTable: options.checkProductionTable !== false,
      updatedAt: options.updatedAt || new Date().toISOString()
    });
    eventLog.push({
      step: "reconciled",
      ok: reconciled.ok,
      import_group_id: reconciled.summary?.import_group_id || null,
      worksheet_fact_count: reconciled.summary?.worksheet_fact_count ?? null
    });

    if (!reconciled.ok || reconciled.mismatches?.length || !reconciled.gates?.ok) {
      result = {
        ok: false,
        status: "control_gates_failed",
        lock_mode: acquiredStandalone ? "standalone" : "outer",
        event_log: eventLog,
        mismatches: reconciled.mismatches,
        gates: reconciled.gates,
        summary: reconciled.summary,
        writes: { inserts: 0, updates: 0, deletes: 0, upserts: 0 },
        compute_ms: Date.now() - startedAt
      };
      return result;
    }

    if (ownershipLost || heartbeat.hasFailed()) {
      result = {
        ok: false,
        status: "population_lock_lost",
        code: "population_lock_lost",
        lock_mode: acquiredStandalone ? "standalone" : "outer",
        event_log: eventLog,
        writes: { inserts: 0, updates: 0, deletes: 0, upserts: 0 },
        compute_ms: Date.now() - startedAt
      };
      return result;
    }

    const writeResult = await writeMorawareJobWorksheetPreparedFacts(supabase, reconciled.built, {
      liveWrite: true,
      allowLivePopulation: true,
      ownerToken,
      summary: reconciled.summary,
      chunkSize: options.chunkSize || 100,
      ownershipLostFlag: () => ownershipLost || heartbeat.hasFailed()
    });
    eventLog.push({
      step: "write_result",
      status: writeResult.status,
      upserts: writeResult.writes?.upserts ?? 0,
      renewals: writeResult.renewals?.length ?? 0
    });

    if (!writeResult.ok) {
      result = {
        ok: false,
        status: writeResult.status,
        code: writeResult.code,
        error: writeResult.error,
        lock_mode: acquiredStandalone ? "standalone" : "outer",
        event_log: eventLog,
        writes: writeResult.writes,
        renewals: writeResult.renewals,
        failed_batch_offset: writeResult.failed_batch_offset,
        summary: reconciled.summary,
        compute_ms: Date.now() - startedAt
      };
      return result;
    }

    let verification = null;
    if (options.verifyAfterWrite !== false) {
      verification = await verifyPersistedWorksheetFacts(supabase, org, {
        importGroupId: reconciled.summary.import_group_id
      });
      eventLog.push({ step: "post_write_verify", ok: verification.ok, row_count: verification.row_count });
    }

    result = {
      ok: verification ? Boolean(verification.ok) : true,
      status: verification && !verification.ok ? "verify_failed" : "populated",
      lock_mode: acquiredStandalone ? "standalone" : "outer",
      released_standalone_lock: false,
      event_log: eventLog,
      writes: writeResult.writes,
      renewals: writeResult.renewals,
      summary: reconciled.summary,
      expected: reconciled.expected,
      broihahn: reconciled.broihahn,
      coverage: reconciled.coverage,
      placeholders: reconciled.placeholders,
      verification,
      upsert_on_conflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
      table: WORKSHEET_FACTS_TABLE,
      lease_ms: MORAWARE_POPULATION_LOCK_LEASE_MS,
      heartbeat_ms: MORAWARE_POPULATION_LOCK_HEARTBEAT_MS,
      compute_ms: Date.now() - startedAt
    };
    return result;
  } finally {
    try {
      heartbeat?.stop?.();
    } catch {
      /* ignore */
    }
    if (acquiredStandalone && ownerToken) {
      try {
        const rel = await releaseMorawarePopulationLock(supabase, { ownerToken });
        eventLog.push({ step: "standalone_release", released: Boolean(rel.released), reason: rel.reason || null });
        if (result) result.released_standalone_lock = Boolean(rel.released);
      } catch (e) {
        eventLog.push({ step: "standalone_release_error", error: String(e?.message || e) });
      }
    } else if (outerOwnerToken) {
      eventLog.push({
        step: "outer_lock_not_released",
        note: "Outer pipeline remains responsible for releasing moraware_population."
      });
    }
  }
}

export {
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
  filterCurrentMorawareJobSet,
  extractMorawareJobWorksheetScopeFacts,
  MORAWARE_POPULATION_LOCK_NAME,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS
};
