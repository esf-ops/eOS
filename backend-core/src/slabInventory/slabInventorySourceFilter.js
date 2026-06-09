/**
 * slabInventorySourceFilter — org-wide inventory source scoping for Slab Inventory API reads.
 *
 * Controls whether slab_inventory / slab_images / slabcloud_sync_runs queries include
 * all external_source values or a single source (slabcloud | slabsmith).
 *
 * Configuration:
 *   SLAB_INVENTORY_ACTIVE_SOURCE=slabcloud|slabsmith|all
 *
 * Optional per-request override (admin/debug):
 *   ?source=slabcloud|slabsmith|all
 *
 * Default when unset or invalid: "all" (preserves legacy mixed-source behavior).
 */

export const INVENTORY_SOURCE_SLABCLOUD = "slabcloud";
export const INVENTORY_SOURCE_SLABSMITH = "slabsmith";
export const INVENTORY_SOURCE_ALL = "all";

export const SLAB_INVENTORY_ACTIVE_SOURCE_ENV = "SLAB_INVENTORY_ACTIVE_SOURCE";

/** @type {ReadonlySet<string>} */
export const ALLOWED_INVENTORY_SOURCES = new Set([
  INVENTORY_SOURCE_SLABCLOUD,
  INVENTORY_SOURCE_SLABSMITH,
  INVENTORY_SOURCE_ALL,
]);

/**
 * Normalize a raw source token. Returns null when empty or invalid.
 * @param {unknown} raw
 * @returns {"slabcloud"|"slabsmith"|"all"|null}
 */
export function normalizeInventorySourceValue(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  return ALLOWED_INVENTORY_SOURCES.has(v) ? /** @type {"slabcloud"|"slabsmith"|"all"} */ (v) : null;
}

/**
 * Resolve the active inventory source filter from env + optional query override.
 * Query `source` wins over SLAB_INVENTORY_ACTIVE_SOURCE when present.
 * Invalid values fall back to "all" without throwing.
 *
 * @param {{ env?: Record<string, string|undefined>, querySource?: unknown }} [params]
 * @returns {{
 *   resolved: "slabcloud"|"slabsmith"|"all",
 *   mode: "all"|"single",
 *   externalSource: "slabcloud"|"slabsmith"|null,
 *   invalidInputIgnored: boolean
 * }}
 */
export function resolveInventorySourceFilter({ env = process.env, querySource = null } = {}) {
  const queryTrimmed = querySource != null ? String(querySource).trim() : "";
  const envTrimmed = String(env?.[SLAB_INVENTORY_ACTIVE_SOURCE_ENV] ?? "").trim();

  const raw = queryTrimmed !== "" ? queryTrimmed : envTrimmed;
  const hadInput = raw !== "";
  const normalized = normalizeInventorySourceValue(raw);
  const resolved = normalized ?? INVENTORY_SOURCE_ALL;

  return {
    resolved,
    mode: resolved === INVENTORY_SOURCE_ALL ? "all" : "single",
    externalSource: resolved === INVENTORY_SOURCE_ALL ? null : resolved,
    invalidInputIgnored: hadInput && normalized === null,
  };
}

/**
 * Apply external_source filter to a Supabase query builder when mode is single-source.
 * @param {{ eq?: Function }|null|undefined} query
 * @param {{ mode?: string, externalSource?: string|null }} sourceFilter
 */
export function applyInventorySourceFilter(query, sourceFilter) {
  if (!query || typeof query.eq !== "function") return query;
  if (sourceFilter?.mode === "single" && sourceFilter.externalSource) {
    return query.eq("external_source", sourceFilter.externalSource);
  }
  return query;
}

/**
 * In-memory row filter for tests or post-fetch narrowing.
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ mode?: string, externalSource?: string|null }} sourceFilter
 */
export function filterRowsByInventorySource(rows, sourceFilter) {
  if (sourceFilter?.mode !== "single" || !sourceFilter.externalSource) {
    return Array.isArray(rows) ? rows : [];
  }
  const want = sourceFilter.externalSource;
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.external_source ?? "").trim().toLowerCase() === want
  );
}
