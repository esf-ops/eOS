/**
 * Customer edge profile grouping — mirrors Studio canonical profiles.
 * Presentation only; amounts come from backend priceEffectLabel.
 */

export const INCLUDED_EDGE_TOKENS = [
  "edge_eased",
  "edge_large_eased",
  "edge_full_bullnose",
  "edge_large_ogee",
  "edge_bevel",
] as const;

export const UPGRADED_EDGE_TOKENS = [
  "edge_small_ogee",
  "edge_crescent",
  "edge_knife",
] as const;

export function edgeTokenFromOptionKey(optionKey: string): string {
  const parts = String(optionKey || "").split(":");
  if (parts[0] === "edge" && parts.length >= 3) {
    return parts.slice(2).join(":") || "edge_eased";
  }
  return parts[parts.length - 1] || "";
}

export function isIncludedEdgeToken(token: string): boolean {
  const t = String(token || "").toLowerCase();
  return (INCLUDED_EDGE_TOKENS as readonly string[]).includes(t);
}

export function isUpgradedEdgeToken(token: string): boolean {
  const t = String(token || "").toLowerCase();
  return (UPGRADED_EDGE_TOKENS as readonly string[]).includes(t);
}

/**
 * Customer-facing edge row price, formatted from backend-supplied amounts only —
 * no pricing math here. Every row always shows a price: the selected option is
 * indicated by highlight/badge, never by swapping or zeroing the price.
 *
 * `grossPriceEffectCents` is the option's own price and is what rows display.
 * `visibleDelta` / `priceEffectCents` are relative to the current selection and
 * are 0 for the selected row, so they are only a fallback for older payloads.
 * Legacy/history copy on `priceEffectLabel` ("Included in published estimate",
 * "Original selection", "Included") is ignored so it never reaches the customer.
 */
export function edgeRowPriceLabel(opt: {
  priceEffectLabel?: string | null;
  grossPriceEffectCents?: number | null;
  visibleDelta?: number | null;
  priceEffectCents?: number | null;
}): string {
  const gross =
    opt.grossPriceEffectCents != null ? Number(opt.grossPriceEffectCents) / 100 : null;
  if (gross != null && Number.isFinite(gross)) {
    return Math.abs(gross) >= 0.5
      ? `+$${Math.round(gross).toLocaleString("en-US")}`
      : "+$0";
  }
  const raw = String(opt.priceEffectLabel || "").trim();
  if (/^[+\-\u2212]\$/.test(raw)) return raw;
  const dollars =
    opt.visibleDelta != null
      ? Number(opt.visibleDelta)
      : opt.priceEffectCents != null
        ? Number(opt.priceEffectCents) / 100
        : null;
  if (dollars != null && Number.isFinite(dollars) && Math.abs(dollars) >= 0.5) {
    return `+$${Math.round(dollars).toLocaleString("en-US")}`;
  }
  return "+$0";
}

export function sortEdgeOptionsByCanonicalOrder<T extends { optionKey: string; displayLabel: string }>(
  options: T[],
): { included: T[]; upgraded: T[] } {
  const rank = new Map<string, number>();
  INCLUDED_EDGE_TOKENS.forEach((t, i) => rank.set(t, i));
  UPGRADED_EDGE_TOKENS.forEach((t, i) => rank.set(t, 100 + i));

  const included: T[] = [];
  const upgraded: T[] = [];
  for (const opt of options) {
    const token = edgeTokenFromOptionKey(opt.optionKey);
    if (isUpgradedEdgeToken(token)) upgraded.push(opt);
    else included.push(opt);
  }
  const byRank = (a: T, b: T) =>
    (rank.get(edgeTokenFromOptionKey(a.optionKey)) ?? 999) -
    (rank.get(edgeTokenFromOptionKey(b.optionKey)) ?? 999);
  included.sort(byRank);
  upgraded.sort(byRank);
  return { included, upgraded };
}
