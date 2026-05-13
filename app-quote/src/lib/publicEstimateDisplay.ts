/**
 * Homeowner-facing public estimate display rules (matches backend-core `quoteCalculator.js`).
 */

export type PublicEstimateRow = {
  group: string;
  countertop: number;
  backsplash: number;
  addons: number;
  total: number;
  /** Ceil to nearest $10 for homeowner UI (set by backend or local enrich). */
  countertop_display?: number;
  backsplash_display?: number;
  addons_display?: number;
  total_display?: number;
};

/** Round UP to the nearest $10 for public display totals. */
export function roundPublicEstimateToNearestTen(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

/** Whole dollars, no cents — e.g. $5,430 */
export function formatPublicEstimateDollars(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  return `$${n.toLocaleString("en-US")}`;
}

export function abbreviatePublicMaterialLevelLabel(group: string): string {
  const s = String(group || "").trim();
  if (/^group\s*promo$/i.test(s)) return "Promo";
  const m = /^group\s+(.+)$/i.exec(s);
  if (m) return String(m[1]).trim();
  return s;
}

export function enrichPublicConsumerEstimatesForDisplayLocal(rows: PublicEstimateRow[]): PublicEstimateRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    ...r,
    countertop_display: roundPublicEstimateToNearestTen(r.countertop),
    backsplash_display: roundPublicEstimateToNearestTen(r.backsplash),
    addons_display: roundPublicEstimateToNearestTen(r.addons),
    total_display: roundPublicEstimateToNearestTen(r.total)
  }));
}
