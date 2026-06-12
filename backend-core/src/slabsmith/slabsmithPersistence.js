/**
 * slabsmithPersistence — write-gated Supabase persistence for Slabsmith XML inventory.
 *
 * SCOPE / SAFETY:
 *   - Writes ONLY when SLABSMITH_INVENTORY_WRITE_ENABLED === "1" (exactly).
 *   - Accepts an INJECTED Supabase client (service role). Never creates one.
 *   - NEVER deletes rows. Retirement is a soft UPDATE (is_active=false) only.
 *   - Soft-retirement of slabs/remnants missing from the latest successful FULL
 *     snapshot is gated behind SLAB_INVENTORY_RETIRE_MISSING_ENABLED=1 plus a
 *     low-count safety guard (see slabInventoryRetirement.js). When the gate is
 *     off (default), no row is ever marked inactive — original v1 behavior.
 *   - NEVER marks SlabCloud rows inactive or overwrites SlabCloud rows
 *     (unique key includes external_source = "slabsmith"); retirement is scoped
 *     to organization_id + external_source=slabsmith + external_company_code.
 *   - NO slab_images writes in v1 (Slabsmith XML export has no image URL pattern).
 *   - All write payloads carry organization_id.
 *
 * Target tables (same as SlabCloud cache):
 *   slabcloud_sync_runs, slab_inventory_raw_records, slab_inventory
 */

import {
  SLABSMITH_ATTR,
  SLABSMITH_EXTERNAL_SOURCE,
  SLABSMITH_SOURCE_SCOPE,
  toFiniteNumber,
} from "./normalizeSlabsmithInventory.js";

import {
  formatSupabaseError,
  INVENTORY_CONFLICT_KEY,
  TABLE_INVENTORY,
  TABLE_RAW_RECORDS,
  TABLE_SYNC_RUNS,
} from "../slabcloud/slabCloudPersistence.js";

import {
  batchRetireInventoryRows,
  buildRetirementUpdate,
  evaluateRetirementSafety,
  fetchInventoryForSourceScope,
  INVENTORY_STATUS_ACTIVE,
  isRetireLowCountOverrideEnabled,
  isRetireMissingEnabled,
  planMissingInventoryRetirement,
  resolveRetireMinRatio,
} from "../slabInventory/slabInventoryRetirement.js";

export const SLABSMITH_WRITE_ENV = "SLABSMITH_INVENTORY_WRITE_ENABLED";

/** Default external_company_code for Slabsmith exports (part of upsert unique key). */
export const DEFAULT_EXTERNAL_COMPANY_CODE = "local";

export const SLABSMITH_RECORD_SOURCE = "slabsmith_xml";
export const SLABSMITH_DIMENSION_SOURCE = "slabsmith_xml";
export const SLABSMITH_FETCH_MODE = "slabsmith_xml";

export const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000000";

const WRITE_BATCH_SIZE = 500;
const SELECT_BATCH_SIZE = 200;

const defaultNow = () => new Date().toISOString();

/** Fields compared to classify insert / update / unchanged before upsert. */
export const INVENTORY_COMPARE_KEYS = Object.freeze([
  "inventory_id",
  "color_name",
  "material_name",
  "distributor",
  "price_group",
  "thickness_nominal",
  "rack",
  "lot",
  "width_actual_m",
  "length_actual_m",
  "width_actual_in",
  "length_actual_in",
  "usable_a_raw",
  "usable_d_raw",
  "source_inventory_type",
  "source_inventory_scope",
  "dimension_source",
  "is_active",
]);

/**
 * Write gate — permitted only when env var is exactly "1".
 */
export function isSlabsmithWriteEnabled() {
  return String(process.env[SLABSMITH_WRITE_ENV] ?? "").trim() === "1";
}

function companyOf(config) {
  return config?.externalCompanyCode || DEFAULT_EXTERNAL_COMPANY_CODE;
}

function wrapError(err) {
  if (err instanceof Error) return err;
  const wrapped = new Error(formatSupabaseError(err));
  wrapped.supabaseError = err;
  return wrapped;
}

/**
 * @param {Record<string, unknown>} row
 * @param {readonly string[]} keys
 */
export function pickCompareFields(row, keys = INVENTORY_COMPARE_KEYS) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of keys) {
    out[key] = row?.[key] ?? null;
  }
  return out;
}

/**
 * Classify planned inventory upserts vs existing cache rows (pure).
 * @param {Array<Record<string, unknown>>} existingRows
 * @param {Array<Record<string, unknown>>} incomingRows
 */
export function classifyInventoryChanges(existingRows, incomingRows) {
  /** @type {Map<string, Record<string, unknown>>} */
  const existingByKey = new Map();
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    const id = String(row?.external_slab_id ?? "").trim();
    if (id) existingByKey.set(id, row);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of Array.isArray(incomingRows) ? incomingRows : []) {
    const id = String(incoming?.external_slab_id ?? "").trim();
    if (!id) continue;

    const existing = existingByKey.get(id);
    if (!existing) {
      inserted += 1;
      continue;
    }

    const a = JSON.stringify(pickCompareFields(incoming));
    const b = JSON.stringify(pickCompareFields(existing));
    if (a === b) unchanged += 1;
    else updated += 1;
  }

  return { inserted, updated, unchanged };
}

/**
 * Summarize normalized Slabsmith rows for sync-run metadata (pure).
 * @param {Array<Record<string, unknown>>} rows
 */
export function summarizeSlabsmithPersistenceInput(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let slabCount = 0;
  let remnantCount = 0;
  let needsReview = 0;
  /** @type {string[]} */
  const warnings = [];

  for (const row of list) {
    if (row.source_inventory_type === "Slab") slabCount += 1;
    else if (row.source_inventory_type === "Remnant") remnantCount += 1;
    if (row.needs_review) {
      needsReview += 1;
      if (warnings.length < 50) {
        const raw = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
        warnings.push(
          `needs_review: external_slab_id=${row.external_slab_id ?? "?"} ` +
            `inventory_id=${row.inventory_id ?? "?"} ` +
            `type=${raw.Type ?? raw[SLABSMITH_ATTR.type] ?? "(missing)"}`
        );
      }
    }
  }

  if (needsReview > 50) {
    warnings.push(`… and ${needsReview - 50} more needs_review rows (truncated)`);
  }

  return {
    slabRowCount: slabCount,
    remnantRowCount: remnantCount,
    allInventoryRowCount: list.length,
    needsReview,
    warnings,
  };
}

/**
 * Initial slabcloud_sync_runs insert payload for a Slabsmith import.
 * @param {object} params
 */
export function buildSlabsmithSyncRunInsert({
  organizationId,
  config = {},
  runMeta = {},
  now = defaultNow,
}) {
  const company = companyOf(config);
  return {
    organization_id: organizationId,
    external_source: SLABSMITH_EXTERNAL_SOURCE,
    external_company_code: company,
    status: "running",
    started_at: now(),
    triggered_by: runMeta.triggeredBy || "local_script",
    fetch_mode: SLABSMITH_FETCH_MODE,
    company_code_config: company,
    max_details_config: null,
    concurrency_config: null,
    material_row_count: 0,
    slab_summary_row_count: runMeta.allInventoryRowCount ?? null,
    slab_detail_row_count: runMeta.allInventoryRowCount ?? null,
    warning_count: Array.isArray(runMeta.warnings) ? runMeta.warnings.length : 0,
    warnings: Array.isArray(runMeta.warnings) ? runMeta.warnings : [],
    source_public_slug: null,
    source_api_company_code: null,
    source_asset_company_code: null,
    inventory_scope: SLABSMITH_SOURCE_SCOPE,
    slab_row_count: runMeta.slabRowCount ?? null,
    remnant_row_count: runMeta.remnantRowCount ?? null,
    all_inventory_row_count: runMeta.allInventoryRowCount ?? null,
  };
}

/**
 * slab_inventory_raw_records rows — one per normalized Slabsmith row.
 * @param {object} params
 */
export function buildSlabsmithRawRecordRows({
  organizationId,
  syncRunId = null,
  config = {},
  normalized = [],
}) {
  const company = companyOf(config);
  return (Array.isArray(normalized) ? normalized : []).map((rec) => ({
    sync_run_id: syncRunId,
    organization_id: organizationId,
    external_source: SLABSMITH_EXTERNAL_SOURCE,
    external_company_code: company,
    external_slab_id: rec.external_slab_id ?? null,
    color_name: rec.color_name ?? null,
    record_source: SLABSMITH_RECORD_SOURCE,
    raw_json: rec.raw_payload ?? {},
    source_inventory_type: rec.source_inventory_type ?? null,
    source_inventory_scope: rec.source_inventory_scope ?? SLABSMITH_SOURCE_SCOPE,
  }));
}

/**
 * Map one normalized Slabsmith row → slab_inventory upsert payload (pure).
 * @param {Record<string, unknown>} rec
 * @param {object} ctx
 */
export function mapSlabsmithInventoryRow(
  rec,
  { organizationId, syncRunId, config, now, includeRetirementFields = false }
) {
  const raw = rec.raw_payload && typeof rec.raw_payload === "object" ? rec.raw_payload : {};
  const company = companyOf(config);
  const lengthM = toFiniteNumber(raw[SLABSMITH_ATTR.lengthActual]);
  const widthM = toFiniteNumber(raw[SLABSMITH_ATTR.widthActual]);
  const ts = now();

  return {
    organization_id: organizationId,
    external_source: SLABSMITH_EXTERNAL_SOURCE,
    external_company_code: company,
    external_slab_id: rec.external_slab_id,
    inventory_id: rec.inventory_id ?? null,
    color_name: rec.color_name ?? null,
    material_name: rec.material_name ?? null,
    distributor: raw.Distributor ?? null,
    // Imported Slabsmith price group only — NOT slabOS pricing authority.
    price_group: rec.source_price_group ?? null,
    thickness_nominal: rec.thickness_nominal ?? null,
    rack: rec.rack ?? null,
    lot: rec.lot ?? null,
    count_for_color: null,
    width_actual_m: widthM,
    length_actual_m: lengthM,
    width_actual_in: rec.width_actual_in ?? null,
    length_actual_in: rec.length_actual_in ?? null,
    usable_a_raw: raw.UsableA ?? null,
    usable_d_raw: raw.UsableD ?? null,
    dimension_source: SLABSMITH_DIMENSION_SOURCE,
    is_active: true,
    last_seen_sync_run_id: syncRunId,
    updated_at: ts,
    source_inventory_type: rec.source_inventory_type ?? null,
    source_inventory_scope: rec.source_inventory_scope ?? SLABSMITH_SOURCE_SCOPE,
    source_public_slug: null,
    source_api_company_code: null,
    source_asset_company_code: null,
    // Retirement audit columns — only written when the retirement migration is
    // applied AND the flag is on. A seen row is active and any prior retirement
    // state is cleared (reactivation).
    ...(includeRetirementFields
      ? {
          inventory_status: INVENTORY_STATUS_ACTIVE,
          last_seen_at: ts,
          retired_at: null,
          retired_by_sync_run_id: null,
          retired_reason: null,
        }
      : {}),
  };
}

/**
 * slab_inventory upsert rows. Skips rows without external_slab_id.
 * @param {object} params
 */
export function buildSlabsmithInventoryRows({
  organizationId,
  syncRunId = null,
  config = {},
  normalized = [],
  now = defaultNow,
  includeRetirementFields = false,
}) {
  const ts = now();
  return (Array.isArray(normalized) ? normalized : [])
    .filter((rec) => rec && rec.external_slab_id)
    .map((rec) =>
      mapSlabsmithInventoryRow(rec, {
        organizationId,
        syncRunId,
        config,
        now: () => ts,
        includeRetirementFields,
      })
    );
}

/**
 * Final sync run update payload.
 * @param {object} params
 */
export function buildSlabsmithSyncRunFinalUpdate({
  status = "completed",
  writtenCounts = {},
  changeCounts = {},
  retirementCounts = null,
  warnings = [],
  error = null,
  now = defaultNow,
}) {
  const warnList = [...(Array.isArray(warnings) ? warnings : [])];
  if (
    changeCounts &&
    changeCounts.inserted != null &&
    changeCounts.updated != null &&
    changeCounts.unchanged != null
  ) {
    warnList.push(
      `inventory_change_counts: inserted=${changeCounts.inserted} updated=${changeCounts.updated} unchanged=${changeCounts.unchanged}`
    );
  }

  let deactivatedCount = 0;
  if (retirementCounts) {
    deactivatedCount = Number(retirementCounts.retiredMissingCount ?? 0);
    warnList.push(
      `retirement: active_upserts=${retirementCounts.activeUpserts ?? 0} ` +
        `reactivated=${retirementCounts.reactivatedCount ?? 0} ` +
        `retired_missing=${deactivatedCount} ` +
        `previous_active=${retirementCounts.previousActiveCount ?? 0} ` +
        `latest_seen=${retirementCounts.latestSeenCount ?? 0} ` +
        `skipped_reason=${retirementCounts.skippedRetirementReason ?? "none"}`
    );
    if (Array.isArray(retirementCounts.warnings)) {
      warnList.push(...retirementCounts.warnings);
    }
  }

  return {
    status: error ? "failed" : status,
    finished_at: now(),
    slab_raw_written_count: writtenCounts.rawRecords ?? 0,
    slab_upserted_count: writtenCounts.slabInventory ?? 0,
    material_upserted_count: 0,
    image_row_written_count: 0,
    slab_deactivated_count: deactivatedCount,
    warning_count: warnList.length,
    warnings: warnList,
    error_message: error ? formatSupabaseError(error) : null,
    error_detail: error && error.supabaseError ? error.supabaseError : null,
  };
}

/**
 * Build all write payloads and change plan (pure — no Supabase I/O).
 * @param {object} params
 */
export function planSlabsmithPersistence({
  organizationId,
  normalized = [],
  config = {},
  existingInventoryRows = [],
  runMeta = {},
  now = defaultNow,
  includeRetirementFields = false,
}) {
  const orgForPayloads = organizationId || SENTINEL_ORG_ID;
  const inputSummary = summarizeSlabsmithPersistenceInput(normalized);
  const warnings = [...(runMeta.warnings ?? []), ...inputSummary.warnings];

  const rawRows = buildSlabsmithRawRecordRows({
    organizationId: orgForPayloads,
    config,
    normalized,
  });
  const inventoryRows = buildSlabsmithInventoryRows({
    organizationId: orgForPayloads,
    config,
    normalized,
    now,
    includeRetirementFields,
  });

  const changeCounts = classifyInventoryChanges(existingInventoryRows, inventoryRows);

  return {
    rawRows,
    inventoryRows,
    changeCounts,
    inputSummary,
    warnings,
    wouldWrite: {
      syncRuns: 1,
      rawRecords: rawRows.length,
      slabInventory: inventoryRows.length,
    },
    runMeta: {
      triggeredBy: runMeta.triggeredBy || "local_script",
      inventoryScope: SLABSMITH_SOURCE_SCOPE,
      slabRowCount: inputSummary.slabRowCount,
      remnantRowCount: inputSummary.remnantRowCount,
      allInventoryRowCount: inputSummary.allInventoryRowCount,
      warnings,
    },
  };
}

// ── DB helpers (write path only) ─────────────────────────────────────────────

async function insertReturningId(db, table, payload) {
  const { data, error } = await db.from(table).insert(payload).select("id").limit(1);
  if (error) throw wrapError(error);
  const id = Array.isArray(data) ? data?.[0]?.id : data?.id;
  if (!id) throw new Error(`${table}: no id returned after insert`);
  return id;
}

async function batchInsert(db, table, rows) {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    const chunk = rows.slice(i, i + WRITE_BATCH_SIZE);
    const { error } = await db.from(table).insert(chunk);
    if (error) throw wrapError(error);
  }
  return rows.length;
}

async function batchUpsert(db, table, rows, onConflict) {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
    const chunk = rows.slice(i, i + WRITE_BATCH_SIZE);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw wrapError(error);
  }
  return rows.length;
}

async function updateById(db, table, payload, id) {
  const { error } = await db.from(table).update(payload).eq("id", id);
  if (error) throw wrapError(error);
}

/**
 * Fetch existing slabsmith slab_inventory rows for change classification.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} companyCode
 * @param {string[]} externalSlabIds
 */
export async function fetchExistingSlabsmithInventory(db, organizationId, companyCode, externalSlabIds) {
  const ids = [...new Set((externalSlabIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return [];

  const selectCols = ["external_slab_id", ...INVENTORY_COMPARE_KEYS].join(",");
  /** @type {Array<Record<string, unknown>>} */
  const out = [];

  for (let i = 0; i < ids.length; i += SELECT_BATCH_SIZE) {
    const chunk = ids.slice(i, i + SELECT_BATCH_SIZE);
    const { data, error } = await db
      .from(TABLE_INVENTORY)
      .select(selectCols)
      .eq("organization_id", organizationId)
      .eq("external_source", SLABSMITH_EXTERNAL_SOURCE)
      .eq("external_company_code", companyCode)
      .in("external_slab_id", chunk);
    if (error) throw wrapError(error);
    if (Array.isArray(data)) out.push(...data);
  }

  return out;
}

/**
 * Compute the soft-retirement plan for a Slabsmith snapshot against the current
 * source-scoped inventory. Reads only — no writes. Used by both the dry-run
 * preview and the write path (called BEFORE the upsert in the write path).
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.db
 * @param {string} params.organizationId
 * @param {string} params.companyCode
 * @param {Array<object>} params.normalized
 */
export async function computeRetirementPlan({ db, organizationId, companyCode, normalized }) {
  const seenExternalIds = new Set(
    (Array.isArray(normalized) ? normalized : [])
      .map((r) => String(r?.external_slab_id ?? "").trim())
      .filter(Boolean)
  );

  const existingRows = await fetchInventoryForSourceScope(db, {
    organizationId,
    externalSource: SLABSMITH_EXTERNAL_SOURCE,
    externalCompanyCode: companyCode,
  });

  const plan = planMissingInventoryRetirement({ existingRows, seenExternalIds });
  const safety = evaluateRetirementSafety({
    previousActiveCount: plan.previousActiveCount,
    latestSeenCount: seenExternalIds.size,
    minRatio: resolveRetireMinRatio(),
    overrideEnabled: isRetireLowCountOverrideEnabled(),
  });

  return { ...plan, latestSeenCount: seenExternalIds.size, safety };
}

/**
 * Persist normalized Slabsmith rows into the Supabase inventory cache.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient|null} [params.db]
 * @param {string|null} [params.organizationId]
 * @param {Array<object>} [params.normalized]
 * @param {object} [params.config]
 * @param {object} [params.runMeta]
 * @param {boolean} [params.writeEnabled]
 * @param {() => string} [params.now]
 */
export async function persistSlabsmithInventory({
  db = null,
  organizationId = null,
  normalized = [],
  config = {},
  runMeta = {},
  writeEnabled = isSlabsmithWriteEnabled(),
  now = defaultNow,
} = {}) {
  const companyCode = companyOf(config);
  const retirementEnabled = isRetireMissingEnabled();

  // Dry-run: plan without fetching existing rows (treat all as would-insert).
  if (writeEnabled !== true) {
    const plan = planSlabsmithPersistence({
      organizationId: organizationId || SENTINEL_ORG_ID,
      normalized,
      config,
      existingInventoryRows: [],
      runMeta,
      now,
      includeRetirementFields: retirementEnabled,
    });

    // Optional retirement preview — only when a real client + org are supplied.
    // NEVER writes in dry-run.
    let retirementPlan = {
      enabled: retirementEnabled,
      would_retire_count: 0,
      reactivated_count: 0,
      sample_retired_ids: [],
      previous_active_count: 0,
      latest_seen_count: new Set(
        normalized.map((r) => String(r?.external_slab_id ?? "").trim()).filter(Boolean)
      ).size,
      skipped_retirement_reason: retirementEnabled ? null : "flag_disabled",
      warnings: [],
    };
    if (retirementEnabled && db && organizationId) {
      const preview = await computeRetirementPlan({
        db,
        organizationId,
        companyCode,
        normalized,
      });
      retirementPlan = {
        enabled: true,
        would_retire_count: preview.retiredMissingCount,
        reactivated_count: preview.reactivatedCount,
        sample_retired_ids: preview.sampleRetiredIds,
        previous_active_count: preview.previousActiveCount,
        latest_seen_count: preview.latestSeenCount,
        skipped_retirement_reason: preview.safety.skippedRetirementReason,
        warnings: preview.safety.warnings,
      };
    }

    return {
      mode: "dry-run",
      writeEnabled: false,
      reason: `${SLABSMITH_WRITE_ENV} is not "1"`,
      syncRunId: null,
      rows_seen: normalized.length,
      wouldWrite: plan.wouldWrite,
      changeCounts: {
        inserted: plan.inventoryRows.length,
        updated: 0,
        unchanged: 0,
      },
      needs_review: plan.inputSummary.needsReview,
      retirement_plan: retirementPlan,
      warnings: plan.warnings,
      errors: null,
    };
  }

  if (!db) {
    throw new Error("persistSlabsmithInventory: write enabled but no Supabase client was provided.");
  }
  if (!organizationId) {
    throw new Error("persistSlabsmithInventory: write enabled but organizationId is missing.");
  }

  const inventoryIds = normalized.map((r) => r.external_slab_id).filter(Boolean);
  const existingRows = await fetchExistingSlabsmithInventory(db, organizationId, companyCode, inventoryIds);

  const plan = planSlabsmithPersistence({
    organizationId,
    normalized,
    config,
    existingInventoryRows: existingRows,
    runMeta,
    now,
    includeRetirementFields: retirementEnabled,
  });

  const syncRunId = await insertReturningId(
    db,
    TABLE_SYNC_RUNS,
    buildSlabsmithSyncRunInsert({
      organizationId,
      config,
      runMeta: plan.runMeta,
      now,
    })
  );

  try {
    const rawWithRun = plan.rawRows.map((r) => ({ ...r, sync_run_id: syncRunId }));
    const inventoryWithRun = plan.inventoryRows.map((r) => ({
      ...r,
      last_seen_sync_run_id: syncRunId,
    }));

    // Capture the pre-upsert source-scope snapshot BEFORE mutating inventory so
    // the retire-diff and reactivation counts reflect the prior active set.
    let retirement = null;
    if (retirementEnabled) {
      retirement = await computeRetirementPlan({ db, organizationId, companyCode, normalized });
    }

    const rawWritten = await batchInsert(db, TABLE_RAW_RECORDS, rawWithRun);
    const inventoryWritten = await batchUpsert(
      db,
      TABLE_INVENTORY,
      inventoryWithRun,
      INVENTORY_CONFLICT_KEY
    );

    // Soft-retire rows missing from this snapshot, only after a successful upsert
    // and only when the safety guard allows it. Never deletes.
    let retirementCounts = null;
    if (retirement) {
      const { safety } = retirement;
      let retiredMissingCount = 0;
      if (safety.allowed) {
        retiredMissingCount = await batchRetireInventoryRows(
          db,
          retirement.retiredIds,
          buildRetirementUpdate({ syncRunId, now })
        );
      }
      retirementCounts = {
        activeUpserts: inventoryWritten,
        reactivatedCount: retirement.reactivatedCount,
        retiredMissingCount: safety.allowed ? retiredMissingCount : 0,
        previousActiveCount: retirement.previousActiveCount,
        latestSeenCount: retirement.latestSeenCount,
        skippedRetirementReason: safety.skippedRetirementReason,
        sampleRetiredIds: safety.allowed ? retirement.sampleRetiredIds : [],
        warnings: safety.warnings,
      };
    }

    const written = {
      rawRecords: rawWritten,
      slabInventory: inventoryWritten,
    };

    const finalUpdate = buildSlabsmithSyncRunFinalUpdate({
      status: "completed",
      writtenCounts: written,
      changeCounts: plan.changeCounts,
      retirementCounts,
      warnings: plan.warnings,
      now,
    });
    await updateById(db, TABLE_SYNC_RUNS, finalUpdate, syncRunId);

    return {
      mode: "write",
      writeEnabled: true,
      syncRunId,
      status: "completed",
      rows_seen: normalized.length,
      inserted: plan.changeCounts.inserted,
      updated: plan.changeCounts.updated,
      unchanged: plan.changeCounts.unchanged,
      raw_records_written: rawWritten,
      slab_inventory_upserted: inventoryWritten,
      needs_review: plan.inputSummary.needsReview,
      retired_missing_count: retirementCounts ? retirementCounts.retiredMissingCount : 0,
      reactivated_count: retirementCounts ? retirementCounts.reactivatedCount : 0,
      skipped_retirement_reason: retirementCounts
        ? retirementCounts.skippedRetirementReason
        : retirementEnabled
          ? null
          : "flag_disabled",
      previous_active_count: retirementCounts ? retirementCounts.previousActiveCount : 0,
      latest_seen_count: retirementCounts ? retirementCounts.latestSeenCount : 0,
      sample_retired_ids: retirementCounts ? retirementCounts.sampleRetiredIds : [],
      warnings: finalUpdate.warnings,
      errors: null,
    };
  } catch (err) {
    try {
      const failUpdate = buildSlabsmithSyncRunFinalUpdate({
        status: "failed",
        warnings: plan.warnings,
        error: wrapError(err),
        now,
      });
      await updateById(db, TABLE_SYNC_RUNS, failUpdate, syncRunId);
    } catch {
      // swallow
    }
    throw wrapError(err);
  }
}
