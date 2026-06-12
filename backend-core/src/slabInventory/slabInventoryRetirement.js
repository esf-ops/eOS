/**
 * slabInventoryRetirement — soft-retirement of slab_inventory rows that vanish
 * from the latest successful FULL inventory snapshot.
 *
 * SCOPE / SAFETY (read before extending):
 *   - Soft-retirement ONLY. Rows are UPDATEd to is_active=false. Never DELETEd.
 *   - Gated behind SLAB_INVENTORY_RETIRE_MISSING_ENABLED === "1" (exactly).
 *   - A low-count guard refuses to retire when the new snapshot is dramatically
 *     smaller than the prior active set (default: < 80% of prior active count),
 *     unless SLAB_INVENTORY_RETIRE_OVERRIDE_LOW_COUNT === "1".
 *   - Source-scoped: callers must pass an explicit organization_id, external_source,
 *     and external_company_code. Ambiguous identity → skip (handled by callers).
 *   - Retired rows retain images, history, raw records, and quote references.
 *
 * The pure helpers below have no DB I/O and are unit-tested in isolation.
 * Only fetchActiveInventoryForSourceScope() and batchRetireInventoryRows()
 * touch Supabase, via an injected client.
 */

import {
  formatSupabaseError,
  TABLE_INVENTORY,
} from "../slabcloud/slabCloudPersistence.js";

export const RETIRE_MISSING_ENV = "SLAB_INVENTORY_RETIRE_MISSING_ENABLED";
export const RETIRE_MIN_RATIO_ENV = "SLAB_INVENTORY_RETIRE_MIN_RATIO";
export const RETIRE_OVERRIDE_ENV = "SLAB_INVENTORY_RETIRE_OVERRIDE_LOW_COUNT";

export const DEFAULT_RETIRE_MIN_RATIO = 0.8;

export const RETIRED_REASON = "missing_from_latest_successful_full_sync";
export const INVENTORY_STATUS_ACTIVE = "active";
export const INVENTORY_STATUS_RETIRED = "retired_missing_from_source";

const SELECT_PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 500;
const SAMPLE_LIMIT = 10;

const defaultNow = () => new Date().toISOString();

function wrapError(err) {
  if (err instanceof Error) return err;
  const wrapped = new Error(formatSupabaseError(err));
  wrapped.supabaseError = err;
  return wrapped;
}

/** Retirement feature gate — permitted only when env var is exactly "1". */
export function isRetireMissingEnabled(env = process.env) {
  return String(env?.[RETIRE_MISSING_ENV] ?? "").trim() === "1";
}

/** Low-count override gate — bypasses the drop-percentage guard when exactly "1". */
export function isRetireLowCountOverrideEnabled(env = process.env) {
  return String(env?.[RETIRE_OVERRIDE_ENV] ?? "").trim() === "1";
}

/**
 * Resolve the minimum-ratio guard (latest_seen / previous_active). A value of
 * 0.8 means: skip retirement when the new snapshot has fewer than 80% of the
 * previously-active rows. Invalid / out-of-range values fall back to the default.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveRetireMinRatio(env = process.env) {
  const raw = String(env?.[RETIRE_MIN_RATIO_ENV] ?? "").trim();
  if (!raw) return DEFAULT_RETIRE_MIN_RATIO;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_RETIRE_MIN_RATIO;
  return n;
}

/**
 * Evaluate whether retirement is safe given the prior active count and the
 * latest snapshot count. Pure — no env reads, no I/O.
 *
 * @param {object} params
 * @param {number} params.previousActiveCount
 * @param {number} params.latestSeenCount
 * @param {number} [params.minRatio]
 * @param {boolean} [params.overrideEnabled]
 * @returns {{ allowed: boolean, skippedRetirementReason: string|null, warnings: string[] }}
 */
export function evaluateRetirementSafety({
  previousActiveCount,
  latestSeenCount,
  minRatio = DEFAULT_RETIRE_MIN_RATIO,
  overrideEnabled = false,
}) {
  const prev = Number(previousActiveCount) || 0;
  const seen = Number(latestSeenCount) || 0;
  const warnings = [];

  // Nothing existed before — nothing to retire. Safe no-op.
  if (prev <= 0) {
    return { allowed: true, skippedRetirementReason: null, warnings };
  }

  // Empty / near-empty snapshot is the classic dangerous case.
  if (seen <= 0) {
    if (overrideEnabled) {
      warnings.push(
        `retirement_low_count_override: latest_seen=0 previous_active=${prev} (override enabled)`
      );
      return { allowed: true, skippedRetirementReason: null, warnings };
    }
    return {
      allowed: false,
      skippedRetirementReason: "suspicious_low_count_zero_snapshot",
      warnings: [
        `retirement_skipped: empty snapshot (latest_seen=0) with previous_active=${prev}`,
      ],
    };
  }

  const ratio = seen / prev;
  if (ratio < minRatio) {
    if (overrideEnabled) {
      warnings.push(
        `retirement_low_count_override: ratio=${ratio.toFixed(3)} < ${minRatio} (override enabled)`
      );
      return { allowed: true, skippedRetirementReason: null, warnings };
    }
    return {
      allowed: false,
      skippedRetirementReason: "suspicious_low_count_drop",
      warnings: [
        `retirement_skipped: latest_seen=${seen} is ${(ratio * 100).toFixed(1)}% of ` +
          `previous_active=${prev} (below ${(minRatio * 100).toFixed(0)}% threshold)`,
      ],
    };
  }

  return { allowed: true, skippedRetirementReason: null, warnings };
}

/**
 * Plan which existing rows to retire and which were reactivated, given the set
 * of external_slab_ids present in the latest snapshot. Pure — no I/O.
 *
 * @param {object} params
 * @param {Array<{id: string, external_slab_id: string|null, is_active?: boolean}>} params.existingRows
 *   All rows in the source scope (active AND previously-retired).
 * @param {Set<string>|Iterable<string>} params.seenExternalIds
 * @returns {{
 *   toRetire: Array<{id: string, external_slab_id: string|null}>,
 *   retiredIds: string[],
 *   retiredMissingCount: number,
 *   reactivatedCount: number,
 *   previousActiveCount: number,
 *   sampleRetiredIds: string[],
 * }}
 */
export function planMissingInventoryRetirement({ existingRows, seenExternalIds }) {
  const seen =
    seenExternalIds instanceof Set
      ? seenExternalIds
      : new Set(
          [...(seenExternalIds ?? [])].map((id) => String(id).trim()).filter(Boolean)
        );

  const rows = Array.isArray(existingRows) ? existingRows : [];

  /** @type {Array<{id: string, external_slab_id: string|null}>} */
  const toRetire = [];
  let previousActiveCount = 0;
  let reactivatedCount = 0;

  for (const row of rows) {
    const externalId = String(row?.external_slab_id ?? "").trim();
    const isActive = row?.is_active !== false;

    if (isActive) {
      previousActiveCount += 1;
      if (!externalId || !seen.has(externalId)) {
        toRetire.push({ id: row.id, external_slab_id: row.external_slab_id ?? null });
      }
    } else if (externalId && seen.has(externalId)) {
      // Previously retired but present again → reactivated by the upsert.
      reactivatedCount += 1;
    }
  }

  const retiredIds = toRetire.map((r) => r.id).filter(Boolean);

  return {
    toRetire,
    retiredIds,
    retiredMissingCount: toRetire.length,
    reactivatedCount,
    previousActiveCount,
    sampleRetiredIds: toRetire
      .slice(0, SAMPLE_LIMIT)
      .map((r) => r.external_slab_id ?? r.id),
  };
}

/**
 * Build the UPDATE payload that soft-retires a row. Includes audit columns added
 * by eliteos_slab_inventory_retirement_audit.sql — that migration MUST be applied
 * before enabling the retirement flag in production.
 * @param {object} params
 * @param {string} params.syncRunId
 * @param {() => string} [params.now]
 */
export function buildRetirementUpdate({ syncRunId, now = defaultNow }) {
  const ts = now();
  return {
    is_active: false,
    inventory_status: INVENTORY_STATUS_RETIRED,
    retired_at: ts,
    retired_by_sync_run_id: syncRunId ?? null,
    retired_reason: RETIRED_REASON,
    updated_at: ts,
  };
}

/**
 * Fields merged onto every upserted inventory row so that a seen row is active
 * and any prior retirement state is cleared (reactivation). Includes audit
 * columns; only spread these when the retirement migration is applied + flag on.
 * @param {object} params
 * @param {string} params.syncRunId
 * @param {() => string} [params.now]
 */
export function buildReactivationFields({ syncRunId, now = defaultNow }) {
  const ts = now();
  return {
    is_active: true,
    inventory_status: INVENTORY_STATUS_ACTIVE,
    last_seen_sync_run_id: syncRunId ?? null,
    last_seen_at: ts,
    retired_at: null,
    retired_by_sync_run_id: null,
    retired_reason: null,
  };
}

// ── DB helpers (write path only) ─────────────────────────────────────────────

/**
 * Fetch all slab_inventory rows for a source scope (active + retired), paginating
 * past the PostgREST default cap. Returns minimal columns only.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {object} scope
 * @param {string} scope.organizationId
 * @param {string} scope.externalSource
 * @param {string} scope.externalCompanyCode
 * @returns {Promise<Array<{id: string, external_slab_id: string|null, is_active: boolean}>>}
 */
export async function fetchInventoryForSourceScope(
  db,
  { organizationId, externalSource, externalCompanyCode }
) {
  /** @type {Array<{id: string, external_slab_id: string|null, is_active: boolean}>} */
  const out = [];
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from(TABLE_INVENTORY)
      .select("id,external_slab_id,is_active")
      .eq("organization_id", organizationId)
      .eq("external_source", externalSource)
      .eq("external_company_code", externalCompanyCode)
      .order("id", { ascending: true })
      .range(offset, offset + SELECT_PAGE_SIZE - 1);
    if (error) throw wrapError(error);

    const batch = Array.isArray(data) ? data : [];
    out.push(...batch);
    if (batch.length < SELECT_PAGE_SIZE) break;
    offset += SELECT_PAGE_SIZE;
  }

  return out;
}

/**
 * Soft-retire the given row ids via batched UPDATE. Never deletes.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string[]} ids
 * @param {Record<string, unknown>} updatePayload
 * @returns {Promise<number>} number of ids submitted for retirement
 */
export async function batchRetireInventoryRows(db, ids, updatePayload) {
  const list = (ids ?? []).filter(Boolean);
  if (!list.length) return 0;

  for (let i = 0; i < list.length; i += UPDATE_BATCH_SIZE) {
    const chunk = list.slice(i, i + UPDATE_BATCH_SIZE);
    const { error } = await db.from(TABLE_INVENTORY).update(updatePayload).in("id", chunk);
    if (error) throw wrapError(error);
  }

  return list.length;
}
