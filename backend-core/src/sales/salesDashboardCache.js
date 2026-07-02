/**
 * Read-only in-memory TTL cache for expensive dashboard intelligence loads.
 * Never shares entries across organizations.
 */

const DEFAULT_TTL_MS = 300_000;

/** @type {Map<string, { expiresAt: number, sources: object }>} */
const cache = new Map();

/** @type {Map<string, { expiresAt: number, body: object }>} */
const metricsCache = new Map();

export function getDashboardCacheTtlMs() {
  const raw = Number(process.env.SALES_DASHBOARD_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

/**
 * @param {string} organizationId
 * @param {object} syncHealth
 */
export function buildDashboardCacheKey(organizationId, syncHealth) {
  const org = String(organizationId ?? "").trim();
  const group = String(syncHealth?.latestGroupId ?? "").trim();
  const syncAt = String(syncHealth?.lastSyncAt ?? "").trim();
  return `${org}::${group}::${syncAt}`;
}

/**
 * @param {string} key
 */
export function getCachedDashboardSources(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.sources;
}

/**
 * @param {string} key
 * @param {object} sources
 */
export function setCachedDashboardSources(key, sources) {
  if (!key || !sources) return;
  cache.set(key, { expiresAt: Date.now() + getDashboardCacheTtlMs(), sources });
}

/** Clear cache (tests only). */
export function resetDashboardCache() {
  cache.clear();
  metricsCache.clear();
}

/**
 * Cache key for computed dashboard bodies (post-filter, pre-slice).
 * @param {object} sources
 * @param {object} filters
 * @param {string} mode
 */
export function buildMetricsCacheKey(sources, filters, mode = "overview") {
  const base = String(sources?._cacheKey ?? "unknown");
  const range = `${filters?.dateRange?.start ?? ""}:${filters?.dateRange?.end ?? ""}`;
  const filterToken = [
    filters?.branch,
    filters?.salesperson,
    filters?.account,
    filters?.unmappedOnly,
    filters?.unknownColorsOnly
  ]
    .map((v) => String(v ?? ""))
    .join("|");
  return `${base}::${range}::${mode}::${filterToken}`;
}

export function getCachedDashboardMetrics(key) {
  const hit = metricsCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    metricsCache.delete(key);
    return null;
  }
  return hit.body;
}

export function setCachedDashboardMetrics(key, body) {
  if (!key || !body) return;
  metricsCache.set(key, { expiresAt: Date.now() + getDashboardCacheTtlMs(), body });
}
