/**
 * slabCloudPersistence — write-gated Supabase persistence for the SlabCloud
 * inventory cache.
 *
 * SCOPE / SAFETY (read before extending):
 *   - Writes ONLY when SLABCLOUD_CACHE_WRITE_ENABLED === "1" (exactly).
 *     When the gate is off, this module performs NO Supabase calls and returns
 *     a dry-run summary with would_write counts.
 *   - Accepts an INJECTED Supabase client (service role). Never creates one.
 *   - NEVER deletes rows.
 *   - NEVER marks slabs inactive in this phase (Phase 1).
 *   - NEVER writes back to SlabCloud / Slabsmith. This is one-directional:
 *     SlabCloud JSON → normalized → Supabase cache.
 *   - All write payloads carry organization_id.
 *
 * The pure build* helpers are exported for unit testing. Only
 * persistSlabCloudInventory() performs DB I/O, and only behind the gate.
 *
 * Target tables (created by backend-core/supabase/eliteos_slabcloud_inventory_cache.sql):
 *   slabcloud_sync_runs, slab_inventory_raw_records, slab_inventory,
 *   slab_materials, slab_images
 */

import { summarizeInventory } from "./normalizeSlabCloudInventory.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const CACHE_WRITE_ENV = "SLABCLOUD_CACHE_WRITE_ENABLED";

export const TABLE_SYNC_RUNS = "slabcloud_sync_runs";
export const TABLE_RAW_RECORDS = "slab_inventory_raw_records";
export const TABLE_INVENTORY = "slab_inventory";
export const TABLE_MATERIALS = "slab_materials";
export const TABLE_IMAGES = "slab_images";

export const INVENTORY_CONFLICT_KEY =
  "organization_id,external_source,external_company_code,external_slab_id";
export const MATERIALS_CONFLICT_KEY =
  "organization_id,external_source,external_company_code,material_name";
export const IMAGES_CONFLICT_KEY =
  "organization_id,external_source,external_slab_id,image_url_pattern";

export const DEFAULT_EXTERNAL_SOURCE = "slabcloud";
export const DEFAULT_COMPANY_CODE = "kbyd";
// Stable image_url_pattern key. The generated URL uses a LOWERCASED SlabID
// (/slabs/{companyCode}/{lowercase-slabid}.jpg). The key is intentionally kept
// stable (not renamed to e.g. "slabcloud_slab_uuid_lower_jpg") so that a re-sync
// UPSERTS existing slab_images rows IN PLACE on the unique key
// (organization_id, external_source, external_slab_id, image_url_pattern),
// correcting the stored URL casing rather than orphaning the old rows.
export const IMAGE_URL_PATTERN = "slabcloud_slab_jpg";

// Used only to build dry-run payloads when no real org id is supplied.
export const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000000";

const WRITE_BATCH_SIZE = 500;

const defaultNow = () => new Date().toISOString();

// ── Gate ─────────────────────────────────────────────────────────────────────

/**
 * The write gate. Writes are only permitted when the env var is exactly "1".
 */
export function isCacheWriteEnabled() {
  return String(process.env[CACHE_WRITE_ENV] ?? "").trim() === "1";
}

// ── Error formatting ─────────────────────────────────────────────────────────

/**
 * Format a Supabase/PostgREST error (plain object) or any thrown value into a
 * readable string. Never prints row data or secrets.
 */
export function formatSupabaseError(err) {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  const parts = [
    err.message,
    err.code && `[code=${err.code}]`,
    err.details && `[details=${err.details}]`,
    err.hint && `[hint=${err.hint}]`,
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function wrapError(err) {
  if (err instanceof Error) return err;
  const wrapped = new Error(formatSupabaseError(err));
  wrapped.supabaseError = err;
  return wrapped;
}

// ── Pure payload builders ────────────────────────────────────────────────────

function companyOf(config) {
  return config?.companyCode || DEFAULT_COMPANY_CODE;
}

/**
 * Initial slabcloud_sync_runs insert payload (status = "running").
 */
export function buildSyncRunInsert({ organizationId, config = {}, runMeta = {}, now = defaultNow }) {
  return {
    organization_id: organizationId,
    external_source: DEFAULT_EXTERNAL_SOURCE,
    external_company_code: companyOf(config),
    status: "running",
    started_at: now(),
    triggered_by: runMeta.triggeredBy || "script",
    fetch_mode: runMeta.fetchMode ?? null,
    company_code_config: companyOf(config),
    max_details_config: runMeta.maxDetails ?? null,
    concurrency_config: runMeta.concurrency ?? null,
    material_row_count: runMeta.materialRowCount ?? null,
    slab_summary_row_count: runMeta.slabSummaryRowCount ?? null,
    slab_detail_row_count: runMeta.slabDetailRowCount ?? null,
    warning_count: 0,
    warnings: [],
  };
}

/**
 * Raw record rows — ONE per normalized record, INCLUDING records with a missing
 * external_slab_id. Raw preservation is unconditional.
 */
export function buildRawRecordRows({
  organizationId,
  syncRunId = null,
  config = {},
  normalized = [],
  recordSource = "detail",
}) {
  const company = companyOf(config);
  return (Array.isArray(normalized) ? normalized : []).map((rec) => ({
    sync_run_id: syncRunId,
    organization_id: organizationId,
    external_source: rec.external_source || DEFAULT_EXTERNAL_SOURCE,
    external_company_code: rec.external_company_code || company,
    external_slab_id: rec.external_slab_id ?? null,
    color_name: rec.color_name ?? null,
    record_source: recordSource,
    raw_json: rec.raw ?? {},
  }));
}

/**
 * slab_inventory upsert rows. Records WITHOUT an external_slab_id are skipped
 * (they cannot satisfy the unique key) — they remain only in raw records.
 *
 * Phase 1: is_active is always true; no row is ever deactivated here.
 * first_seen_sync_run_id is intentionally NOT set on upsert to avoid clobbering
 * the original value on re-sync; only last_seen_sync_run_id is maintained.
 */
export function buildInventoryRows({
  organizationId,
  syncRunId = null,
  config = {},
  normalized = [],
  now = defaultNow,
}) {
  const company = companyOf(config);
  const ts = now();
  return (Array.isArray(normalized) ? normalized : [])
    .filter((rec) => rec && rec.external_slab_id)
    .map((rec) => ({
      organization_id: organizationId,
      external_source: rec.external_source || DEFAULT_EXTERNAL_SOURCE,
      external_company_code: rec.external_company_code || company,
      external_slab_id: rec.external_slab_id,
      inventory_id: rec.inventory_id ?? null,
      color_name: rec.color_name ?? null,
      material_name: rec.material_name ?? null,
      distributor: rec.distributor ?? null,
      price_group: rec.price_group ?? null,
      thickness_nominal: rec.thickness_nominal ?? null,
      rack: rec.rack ?? null,
      lot: rec.lot ?? null,
      // count_for_color is stored AS-IS. It is a color-group-level value and must
      // never be summed across rows. See SQL COMMENT on slab_inventory.count_for_color.
      count_for_color: rec.count_for_color ?? null,
      width_actual_m: rec.width_actual_m ?? null,
      length_actual_m: rec.length_actual_m ?? null,
      width_actual_in: rec.width_actual_in ?? null,
      length_actual_in: rec.length_actual_in ?? null,
      usable_a_raw: rec.usable_a_raw ?? null,
      usable_d_raw: rec.usable_d_raw ?? null,
      dimension_source: "slabcloud_api",
      is_active: true,
      last_seen_sync_run_id: syncRunId,
      updated_at: ts,
    }));
}

/**
 * Extract a material name from a raw SlabCloud material record, defensively.
 */
export function materialNameOf(rawMaterial) {
  if (!rawMaterial || typeof rawMaterial !== "object") {
    if (typeof rawMaterial === "string" && rawMaterial.trim()) return rawMaterial.trim();
    return null;
  }
  const candidate = rawMaterial.Material ?? rawMaterial.Name ?? rawMaterial.name ?? rawMaterial.material;
  const s = candidate == null ? "" : String(candidate).trim();
  return s === "" ? null : s;
}

/**
 * slab_materials upsert rows. Records without a resolvable material_name are skipped.
 */
export function buildMaterialRows({
  organizationId,
  syncRunId = null,
  config = {},
  materials = [],
  now = defaultNow,
}) {
  const company = companyOf(config);
  const ts = now();
  const seen = new Set();
  const rows = [];
  for (const m of Array.isArray(materials) ? materials : []) {
    const name = materialNameOf(m);
    if (!name) continue;
    // Dedup within a single run to avoid ON CONFLICT churn on identical names.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      organization_id: organizationId,
      external_source: DEFAULT_EXTERNAL_SOURCE,
      external_company_code: company,
      material_name: name,
      raw_json: m && typeof m === "object" ? m : { value: m },
      is_active: true,
      last_seen_sync_run_id: syncRunId,
      updated_at: ts,
    });
  }
  return rows;
}

/**
 * slab_images upsert rows. Only for records with both an external_slab_id and a
 * guessed image URL. image_status is always "unknown" in Phase 1 (no probing here).
 */
export function buildImageRows({ organizationId, config = {}, normalized = [], now = defaultNow }) {
  const ts = now();
  return (Array.isArray(normalized) ? normalized : [])
    .filter((rec) => rec && rec.external_slab_id && rec.image_url_guess)
    .map((rec) => ({
      organization_id: organizationId,
      external_source: rec.external_source || DEFAULT_EXTERNAL_SOURCE,
      external_slab_id: rec.external_slab_id,
      image_url: rec.image_url_guess,
      thumbnail_url: rec.thumbnail_url_guess ?? null,
      image_url_pattern: IMAGE_URL_PATTERN,
      image_status: "unknown",
      last_checked_at: null,
      updated_at: ts,
    }));
}

/**
 * Final slabcloud_sync_runs update payload (status completed or failed).
 * Phase 1: slab_deactivated_count is always 0 — no inactive marking.
 */
export function buildSyncRunFinalUpdate({
  status = "completed",
  writtenCounts = {},
  warnings = [],
  error = null,
  now = defaultNow,
}) {
  return {
    status: error ? "failed" : status,
    finished_at: now(),
    slab_raw_written_count: writtenCounts.rawRecords ?? 0,
    slab_upserted_count: writtenCounts.slabInventory ?? 0,
    material_upserted_count: writtenCounts.slabMaterials ?? 0,
    image_row_written_count: writtenCounts.slabImages ?? 0,
    slab_deactivated_count: 0,
    warning_count: Array.isArray(warnings) ? warnings.length : 0,
    warnings: Array.isArray(warnings) ? warnings : [],
    error_message: error ? formatSupabaseError(error) : null,
    error_detail: error && error.supabaseError ? error.supabaseError : null,
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

// ── Orchestrator ─────────────────────────────────────────────────────────────

function zeroWritten() {
  return { rawRecords: 0, slabInventory: 0, slabMaterials: 0, slabImages: 0 };
}

/**
 * Persist a normalized SlabCloud inventory snapshot into the Supabase cache.
 *
 * When the write gate is OFF (default), returns a dry-run summary and performs
 * NO Supabase I/O.
 *
 * When ON (SLABCLOUD_CACHE_WRITE_ENABLED=1, or writeEnabled:true passed for
 * tests), requires a Supabase client and a real organizationId, then:
 *   1. INSERT slabcloud_sync_runs (status=running)
 *   2. INSERT slab_inventory_raw_records (all records, incl. null slab id)
 *   3. UPSERT slab_inventory (records with external_slab_id only)
 *   4. UPSERT slab_materials
 *   5. UPSERT slab_images (image_status=unknown)
 *   6. UPDATE slabcloud_sync_runs (status=completed)
 * On error: marks the sync run failed (best-effort) and rethrows.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient|null} [params.db]
 * @param {string|null} [params.organizationId]
 * @param {object} [params.config] - { companyCode, baseUrl, type }
 * @param {Array<object>} [params.normalized]
 * @param {Array<object>} [params.materials]
 * @param {string[]} [params.warnings]
 * @param {string} [params.recordSource] - "summary" | "detail"
 * @param {object} [params.runMeta]
 * @param {boolean} [params.writeEnabled] - defaults to env gate
 * @param {() => string} [params.now]
 */
export async function persistSlabCloudInventory({
  db = null,
  organizationId = null,
  config = {},
  normalized = [],
  materials = [],
  warnings = [],
  recordSource = "detail",
  runMeta = {},
  writeEnabled = isCacheWriteEnabled(),
  now = defaultNow,
} = {}) {
  const orgForPayloads = organizationId || SENTINEL_ORG_ID;
  const counts = summarizeInventory(normalized, { warnings, materials });

  // Build payloads up front (pure) — used both for dry-run counts and writes.
  const rawRows = buildRawRecordRows({
    organizationId: orgForPayloads,
    config,
    normalized,
    recordSource,
  });
  const inventoryRows = buildInventoryRows({
    organizationId: orgForPayloads,
    config,
    normalized,
    now,
  });
  const materialRows = buildMaterialRows({
    organizationId: orgForPayloads,
    config,
    materials,
    now,
  });
  const imageRows = buildImageRows({ organizationId: orgForPayloads, config, normalized, now });

  const wouldWrite = {
    syncRuns: 1,
    rawRecords: rawRows.length,
    slabInventory: inventoryRows.length,
    slabMaterials: materialRows.length,
    slabImages: imageRows.length,
  };

  // ── Dry-run path: NO Supabase calls ────────────────────────────────────────
  if (writeEnabled !== true) {
    return {
      mode: "dry-run",
      writeEnabled: false,
      reason: `${CACHE_WRITE_ENV} is not "1"`,
      syncRunId: null,
      wouldWrite,
      written: zeroWritten(),
      counts,
      warnings,
    };
  }

  // ── Write path: validate hard before any I/O ───────────────────────────────
  if (!db) {
    throw new Error(
      "persistSlabCloudInventory: write enabled but no Supabase client was provided."
    );
  }
  if (!organizationId) {
    throw new Error(
      "persistSlabCloudInventory: write enabled but organizationId is missing."
    );
  }

  // 1. Create sync run (status=running)
  const runInsert = buildSyncRunInsert({ organizationId, config, runMeta, now });
  const syncRunId = await insertReturningId(db, TABLE_SYNC_RUNS, runInsert);

  try {
    // Attach run id to run-scoped payloads.
    const rawWithRun = rawRows.map((r) => ({ ...r, sync_run_id: syncRunId }));
    const inventoryWithRun = inventoryRows.map((r) => ({
      ...r,
      last_seen_sync_run_id: syncRunId,
    }));
    const materialsWithRun = materialRows.map((r) => ({
      ...r,
      last_seen_sync_run_id: syncRunId,
    }));

    // 2. Raw records (insert — append-only)
    const rawWritten = await batchInsert(db, TABLE_RAW_RECORDS, rawWithRun);

    // 3. Inventory (upsert on the four-part unique key)
    const inventoryWritten = await batchUpsert(
      db,
      TABLE_INVENTORY,
      inventoryWithRun,
      INVENTORY_CONFLICT_KEY
    );

    // 4. Materials (upsert)
    const materialsWritten = await batchUpsert(
      db,
      TABLE_MATERIALS,
      materialsWithRun,
      MATERIALS_CONFLICT_KEY
    );

    // 5. Images (upsert, image_status=unknown)
    const imagesWritten = await batchUpsert(db, TABLE_IMAGES, imageRows, IMAGES_CONFLICT_KEY);

    const written = {
      rawRecords: rawWritten,
      slabInventory: inventoryWritten,
      slabMaterials: materialsWritten,
      slabImages: imagesWritten,
    };

    // 6. Finalize run (status=completed)
    const finalUpdate = buildSyncRunFinalUpdate({
      status: "completed",
      writtenCounts: written,
      warnings,
      now,
    });
    await updateById(db, TABLE_SYNC_RUNS, finalUpdate, syncRunId);

    return {
      mode: "write",
      writeEnabled: true,
      syncRunId,
      status: "completed",
      written,
      wouldWrite,
      counts,
      warnings,
    };
  } catch (err) {
    // Best-effort: mark the run failed. Never throws over the original error.
    try {
      const failUpdate = buildSyncRunFinalUpdate({
        status: "failed",
        warnings,
        error: wrapError(err),
        now,
      });
      await updateById(db, TABLE_SYNC_RUNS, failUpdate, syncRunId);
    } catch {
      // swallow — already handling a throw
    }
    throw wrapError(err);
  }
}
